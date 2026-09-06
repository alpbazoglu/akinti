"""AKINTI audio sidecar -- FastAPI service run alongside `scripts/worker.ts`.

Why a separate Python process instead of folding this into the Node worker:
DeepFilterNet3, Matchering and librosa have no Node equivalents, and
Matchering is GPL-3.0 -- isolating it behind an HTTP boundary (its own
process, called only over local HTTP) keeps the GPL code out of the
proprietary Node/Next.js codebase entirely rather than requiring the whole
worker to become GPL. See docs/AUDIO_ARCHITECTURE.md "Sidecar" for the
worker-side call sites and fallback behavior.

Every endpoint takes either a `path` form field (a file already reachable on
this machine's filesystem -- the worker downloads a job's audio to a temp
file before calling the sidecar, then passes that path) or a multipart
`file` upload, and returns JSON naming a real output file that was actually
produced. Nothing here ever fabricates a result: a capability that isn't
installed makes the corresponding endpoint return 503, not a faked 200.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .capabilities import detect_capabilities
from .dsp import (
    build_self_harmony,
    clean_audio,
    extract_peaks,
    master_audio,
    score_pitch,
    snap_pitch,
)

app = FastAPI(title="AKINTI Audio Sidecar", version="1.0.0")

_SCRATCH_ROOT = Path(tempfile.gettempdir()) / "akinti-sidecar"
_SCRATCH_ROOT.mkdir(parents=True, exist_ok=True)


def _resolve_input(path: Optional[str], file: Optional[UploadFile], scratch_dir: Path) -> Path:
    """Exactly one of `path`/`file` must be given -- never silently pick one over the other."""
    if path and file:
        raise HTTPException(400, "pass either 'path' or 'file', not both")
    if path:
        candidate = Path(path)
        if not candidate.is_file():
            raise HTTPException(404, f"no such file: {path}")
        return candidate
    if file:
        dest = scratch_dir / (file.filename or "upload.bin")
        with dest.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        return dest
    raise HTTPException(400, "provide either 'path' (form field) or 'file' (multipart upload)")


def _new_scratch_dir() -> Path:
    scratch_dir = Path(tempfile.mkdtemp(dir=_SCRATCH_ROOT))
    return scratch_dir


@app.get("/health")
def health() -> JSONResponse:
    caps = detect_capabilities()
    return JSONResponse(
        {
            "status": "ok",
            "capabilities": caps.as_dict(),
            # Explicit per-endpoint availability -- what a caller actually
            # needs to know before deciding whether to call this sidecar or
            # fall back to the worker's own ffmpeg-only path.
            "endpoints": {
                "clean": caps.deepfilternet or caps.arnndn,
                "master": caps.matchering,
                "pitch_score": caps.librosa,
                "peaks": caps.librosa and caps.soundfile,
            },
        }
    )


@app.post("/clean")
def clean(path: Optional[str] = Form(None), file: Optional[UploadFile] = File(None)) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    try:
        result = clean_audio(input_path, scratch_dir)
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    return JSONResponse(
        {
            "output_path": str(result.output_path),
            "method": result.method,
            "lufs_before": result.lufs_before,
            "lufs_after": result.lufs_after,
        }
    )


@app.post("/master")
def master(
    path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    preset: str = Form("natural"),
) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    try:
        result = master_audio(input_path, scratch_dir, preset)
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    return JSONResponse(
        {
            "output_path": str(result.output_path),
            "method": result.method,
            "reference_family": result.reference,
            "lufs_before": result.lufs_before,
            "lufs_after": result.lufs_after,
        }
    )


@app.post("/pitch-score")
def pitch_score(
    path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    reference_key: Optional[str] = Form(None),
) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    caps = detect_capabilities()
    if not caps.librosa:
        raise HTTPException(503, "librosa is not installed on this sidecar")
    try:
        result = score_pitch(input_path, reference_key)
    except RuntimeError as err:
        raise HTTPException(500, str(err)) from err
    return JSONResponse(
        {
            "score": result.score,
            "detected_key": result.detected_key,
            "reference_key": result.reference_key,
            "per_second_cents_deviation": result.per_second_cents_deviation,
            "in_tune_ratio": result.in_tune_ratio,
            "median_cents_off": result.median_cents_off,
            "notes_detected": result.notes_detected,
        }
    )


@app.post("/pitch-snap")
def pitch_snap(
    path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    strength: float = Form(0.8),
    reference_key: Optional[str] = Form(None),
) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    caps = detect_capabilities()
    if not caps.librosa:
        raise HTTPException(503, "librosa is not installed on this sidecar")
    try:
        result = snap_pitch(input_path, scratch_dir, strength=strength, reference_key=reference_key)
    except RuntimeError as err:
        raise HTTPException(500, str(err)) from err
    return JSONResponse(
        {
            "output_path": str(result.output_path),
            "method": result.method,
            "key_guess": result.key_guess,
            "strength": result.strength,
        }
    )


@app.post("/harmony")
def harmony(
    path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    wet: float = Form(0.35),
    reference_key: Optional[str] = Form(None),
) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    caps = detect_capabilities()
    if not caps.librosa:
        raise HTTPException(503, "librosa is not installed on this sidecar")
    try:
        result = build_self_harmony(input_path, scratch_dir, wet=wet, reference_key=reference_key)
    except RuntimeError as err:
        raise HTTPException(500, str(err)) from err
    return JSONResponse(
        {
            "output_path": str(result.output_path),
            "method": result.method,
            "key_guess": result.key_guess,
            "interval_semitones": result.interval_semitones,
        }
    )


@app.post("/peaks")
def peaks(
    path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    buckets: int = Form(800),
) -> JSONResponse:
    scratch_dir = _new_scratch_dir()
    input_path = _resolve_input(path, file, scratch_dir)
    caps = detect_capabilities()
    if not (caps.librosa and caps.soundfile):
        raise HTTPException(503, "librosa/soundfile are not installed on this sidecar")
    try:
        result = extract_peaks(input_path, buckets)
    except Exception as err:  # noqa: BLE001 - surfaced verbatim to the caller as a 500
        raise HTTPException(500, str(err)) from err
    return JSONResponse(
        {
            "version": result.version,
            "bits": result.bits,
            "samples_per_pixel": result.samples_per_pixel,
            "data": result.data,
        }
    )
