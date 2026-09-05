"""DSP implementations backing the sidecar's four endpoints.

Kept separate from `main.py` so each function is unit-testable without
spinning up FastAPI (see `tests/test_endpoints.py`, which does exercise the
real HTTP surface, plus this module can grow direct unit tests later without
duplicating the FastAPI request/response wiring).

Every function raises a plain `RuntimeError`/`FileNotFoundError` on failure
-- `main.py` turns those into a 4xx/5xx JSON error, never a fake success
response with a made-up "output path" that doesn't exist.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from .capabilities import RNNOISE_MODEL_PATH, detect_capabilities, reference_path_for_family

FFMPEG_BIN = shutil.which("ffmpeg") or "ffmpeg"


def _run(args: list[str], timeout: float = 300.0, cwd: Path | None = None) -> str:
    result = subprocess.run(args, capture_output=True, timeout=timeout, check=False, cwd=cwd)
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")[-4000:]
        raise RuntimeError(f"command failed ({args[0]}): {stderr}")
    return result.stdout.decode("utf-8", errors="replace")


def measure_integrated_lufs(path: Path) -> float | None:
    """One-pass `loudnorm` measurement -- ffmpeg's own EBU R128 analysis, no extra dependency."""
    try:
        result = subprocess.run(
            [
                FFMPEG_BIN, "-hide_banner", "-i", str(path),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
                "-f", "null", "-",
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
        stderr = result.stderr.decode("utf-8", errors="replace")
        start = stderr.rfind("{")
        end = stderr.rfind("}")
        if start == -1 or end == -1:
            return None
        stats = json.loads(stderr[start : end + 1])
        return float(stats["input_i"])
    except Exception:
        return None


@dataclass
class CleanResult:
    output_path: Path
    method: str
    lufs_before: float | None
    lufs_after: float | None


def clean_audio(input_path: Path, output_dir: Path) -> CleanResult:
    """Denoise `input_path`. Prefers DeepFilterNet3; falls back to ffmpeg `arnndn`.

    Never invents a third path: if neither is available this raises, and the
    caller (the worker) is expected to treat that as "sidecar has nothing to
    offer for this stage" and fall back to its own local handling.
    """
    caps = detect_capabilities()
    lufs_before = measure_integrated_lufs(input_path)
    output_path = output_dir / "cleaned.wav"

    if caps.deepfilternet:
        _clean_with_deepfilternet(input_path, output_path)
        method = "deepfilternet3"
    elif caps.arnndn:
        _clean_with_arnndn(input_path, output_path)
        method = "arnndn"
    else:
        raise RuntimeError(
            "no denoise backend available (neither DeepFilterNet3 nor ffmpeg arnndn "
            "with a bundled model could be used)"
        )

    lufs_after = measure_integrated_lufs(output_path)
    return CleanResult(output_path=output_path, method=method, lufs_before=lufs_before, lufs_after=lufs_after)


def _clean_with_deepfilternet(input_path: Path, output_path: Path) -> None:
    # DeepFilterNet3's documented Python API (df.enhance). Imported lazily --
    # this branch only runs when `detect_capabilities()` already confirmed
    # the import succeeds.
    from df.enhance import enhance, init_df, load_audio, save_audio  # type: ignore[import-not-found]

    model, df_state, _ = init_df()
    audio, _ = load_audio(str(input_path), sr=df_state.sr())
    enhanced = enhance(model, df_state, audio)
    save_audio(str(output_path), enhanced, df_state.sr())


def _clean_with_arnndn(input_path: Path, output_path: Path) -> None:
    if not RNNOISE_MODEL_PATH.is_file():
        raise RuntimeError(f"rnnoise model not found at {RNNOISE_MODEL_PATH}")
    # ffmpeg's filtergraph mini-language splits a filter's options on ':' --
    # an absolute Windows path (drive-letter colon, and this repo's own path
    # contains a space) cannot be embedded as `arnndn=m=<path>` without
    # fighting that parser's escaping rules (verified: even correctly
    # backslash-escaped colons still fail to parse here). Running ffmpeg with
    # its cwd set to the model's own directory and referencing it by bare
    # filename sidesteps the whole problem -- input/output paths are ordinary
    # argv values (no filtergraph parsing applies to them) and can stay
    # absolute.
    _run(
        [
            FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(input_path.resolve()),
            "-af", f"arnndn=m={RNNOISE_MODEL_PATH.name}",
            str(output_path.resolve()),
        ],
        cwd=RNNOISE_MODEL_PATH.parent,
    )


@dataclass
class MasterResult:
    output_path: Path
    method: str
    reference: str
    lufs_before: float | None
    lufs_after: float | None


# Maps the six named presets (spec §19 / `AUDIO_ENHANCEMENT_PRESETS`,
# `src/types/domain.ts`) onto one of the three bundled reference-master
# families (see `capabilities.reference_path_for_family`).
PRESET_REFERENCE_FAMILY: dict[str, str] = {
    "natural": "balanced",
    "studio": "bright",
    "clear_voice": "bright",
    "warm": "warm",
    "deep": "warm",
    "atmospheric": "balanced",
}


def master_audio(input_path: Path, output_dir: Path, preset: str) -> MasterResult:
    """Reference-based mastering via Matchering. Raises if Matchering is not installed."""
    caps = detect_capabilities()
    if not caps.matchering:
        raise RuntimeError("matchering is not installed on this sidecar")

    import matchering as mg  # type: ignore[import-not-found]

    family = PRESET_REFERENCE_FAMILY.get(preset, "balanced")
    reference = reference_path_for_family(family)
    lufs_before = measure_integrated_lufs(input_path)
    output_path = output_dir / "mastered.wav"

    mg.process(
        target=str(input_path),
        reference=str(reference),
        results=[mg.pcm16(str(output_path))],
    )

    lufs_after = measure_integrated_lufs(output_path)
    return MasterResult(
        output_path=output_path,
        method="matchering",
        reference=family,
        lufs_before=lufs_before,
        lufs_after=lufs_after,
    )


@dataclass
class PeaksResult:
    version: int
    bits: int
    samples_per_pixel: int
    data: list[int]


PEAK_SAMPLE_RATE = 8000


def extract_peaks(input_path: Path, buckets: int = 800) -> PeaksResult:
    """Wavesurfer-compatible normalized peaks, matching the shape `scripts/worker.ts`
    already writes to `audio_assets.peaks`
    (`{version:1,bits:8,samples_per_pixel,data:[0..255]}`) so either producer
    is interchangeable from the client's point of view.
    """
    import numpy as np
    import soundfile as sf

    data, sample_rate = sf.read(str(input_path), always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)

    if sample_rate != PEAK_SAMPLE_RATE:
        import librosa

        data = librosa.resample(data.astype("float32"), orig_sr=sample_rate, target_sr=PEAK_SAMPLE_RATE)

    total = len(data)
    if total == 0:
        return PeaksResult(version=1, bits=8, samples_per_pixel=PEAK_SAMPLE_RATE, data=[])

    samples_per_pixel = max(1, total // buckets)
    out: list[int] = []
    for start in range(0, total, samples_per_pixel):
        chunk = data[start : start + samples_per_pixel]
        if len(chunk) == 0:
            continue
        peak = float(min(1.0, max(abs(chunk.min()), abs(chunk.max()))))
        out.append(min(255, round(peak * 255)))

    return PeaksResult(version=1, bits=8, samples_per_pixel=samples_per_pixel, data=out)


# --- Pitch scoring ----------------------------------------------------------

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles (major/minor), used only when no
# reference key/melody is supplied -- correlates the track's own chroma
# energy against every rotation of both profiles and picks the best match.
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


@dataclass
class PitchScoreResult:
    score: float
    detected_key: str
    reference_key: str
    per_second_cents_deviation: list[float] = field(default_factory=list)


def _detect_key(chroma_mean: "list[float]") -> str:
    import numpy as np

    best_score = -1e9
    best_key = "C major"
    for shift in range(12):
        rotated = np.roll(chroma_mean, shift)
        for name, profile in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            score = float(np.corrcoef(rotated, profile)[0, 1])
            if score > best_score:
                best_score = score
                best_key = f"{_NOTE_NAMES[shift]} {name}"
    return best_key


def _scale_semitones(root_index: int, is_minor: bool) -> set[int]:
    intervals = [0, 2, 3, 5, 7, 8, 10] if is_minor else [0, 2, 4, 5, 7, 9, 11]
    return {(root_index + step) % 12 for step in intervals}


def score_pitch(input_path: Path, reference_key: str | None = None) -> PitchScoreResult:
    """pYIN-based pitch score vs. a reference key (or the track's own detected key).

    Score is 0-100: 100 means every voiced frame lands within a few cents of
    the nearest note in the target scale; it degrades linearly with the mean
    absolute cents deviation, floored at 0. Per-second cents deviation is the
    mean deviation of voiced frames within each 1-second window (silent
    seconds are omitted, not padded with a fake 0).
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(str(input_path), sr=22050, mono=True)

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
    )
    hop_length = 512
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

    if reference_key:
        root_name = reference_key.strip().split()[0]
        is_minor = "min" in reference_key.lower()
        root_index = _NOTE_NAMES.index(root_name) if root_name in _NOTE_NAMES else 0
        detected = reference_key
    else:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        detected = _detect_key(chroma.mean(axis=1).tolist())
        root_name, mode = detected.split()
        is_minor = mode == "minor"
        root_index = _NOTE_NAMES.index(root_name)
        reference_key = detected

    scale = _scale_semitones(root_index, is_minor)

    cents_by_second: dict[int, list[float]] = {}
    for t, f0_hz, voiced in zip(times, f0, voiced_flag):
        if not voiced or f0_hz is None or f0_hz <= 0 or (isinstance(f0_hz, float) and np.isnan(f0_hz)):
            continue
        midi = librosa.hz_to_midi(f0_hz)
        pitch_class = int(round(midi)) % 12
        nearest = min(scale, key=lambda s: min(abs(s - pitch_class), 12 - abs(s - pitch_class)))
        cents = (midi - round(midi)) * 100
        # Deviation from the nearest in-scale semitone, in cents.
        semitone_distance = min(
            (pitch_class - nearest) % 12, (nearest - pitch_class) % 12
        )
        deviation = semitone_distance * 100 + cents
        cents_by_second.setdefault(int(t), []).append(abs(deviation))

    per_second = [
        round(float(np.mean(values)), 1) for _, values in sorted(cents_by_second.items())
    ]

    if not per_second:
        return PitchScoreResult(score=0.0, detected_key=detected, reference_key=reference_key, per_second_cents_deviation=[])

    mean_deviation = float(np.mean(per_second))
    score = max(0.0, min(100.0, 100.0 - mean_deviation))
    return PitchScoreResult(
        score=round(score, 1),
        detected_key=detected,
        reference_key=reference_key,
        per_second_cents_deviation=per_second,
    )
