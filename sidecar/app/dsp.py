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


# Deviation (in cents) at or under this counts as "in tune" for
# `in_tune_ratio` -- see docs/AUDIO_ARCHITECTURE.md "Pitch score".
IN_TUNE_CENTS_THRESHOLD = 35.0


@dataclass
class PitchScoreResult:
    score: float
    detected_key: str
    reference_key: str
    per_second_cents_deviation: list[float] = field(default_factory=list)
    # AKINTI-facing fields (docs/AUDIO_ARCHITECTURE.md "Pitch score" —
    # `audio_assets.pitch_score`'s exact shape, minus the `score_0_100`/
    # `key_guess` renames the worker applies): the fraction of voiced
    # one-second windows within `IN_TUNE_CENTS_THRESHOLD` cents of the
    # nearest in-key semitone, the median (not mean, so a few wild seconds
    # cannot skew an otherwise solid take) per-second deviation, and how many
    # one-second windows had any detectable pitch at all.
    in_tune_ratio: float = 0.0
    median_cents_off: float = 0.0
    notes_detected: int = 0


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


def _resolve_key(y: "object", sr: int, reference_key: str | None) -> tuple[int, bool, str]:
    """Shared by `score_pitch`/`snap_pitch`/`build_self_harmony`: either trust
    the caller-supplied `reference_key` or detect one from the track's own
    chroma energy (Krumhansl-Schmuckler). Returns `(root_index, is_minor,
    key_name)`.
    """
    import librosa

    if reference_key:
        root_name = reference_key.strip().split()[0]
        is_minor = "min" in reference_key.lower()
        root_index = _NOTE_NAMES.index(root_name) if root_name in _NOTE_NAMES else 0
        return root_index, is_minor, reference_key

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    detected = _detect_key(chroma.mean(axis=1).tolist())
    root_name, mode = detected.split()
    is_minor = mode == "minor"
    root_index = _NOTE_NAMES.index(root_name)
    return root_index, is_minor, detected


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

    root_index, is_minor, detected = _resolve_key(y, sr, reference_key)
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
        return PitchScoreResult(
            score=0.0,
            detected_key=detected,
            reference_key=reference_key,
            per_second_cents_deviation=[],
            in_tune_ratio=0.0,
            median_cents_off=0.0,
            notes_detected=0,
        )

    mean_deviation = float(np.mean(per_second))
    score = max(0.0, min(100.0, 100.0 - mean_deviation))
    in_tune_count = sum(1 for value in per_second if value <= IN_TUNE_CENTS_THRESHOLD)
    return PitchScoreResult(
        score=round(score, 1),
        detected_key=detected,
        reference_key=reference_key,
        per_second_cents_deviation=per_second,
        in_tune_ratio=round(in_tune_count / len(per_second), 3),
        median_cents_off=round(float(np.median(per_second)), 1),
        notes_detected=len(per_second),
    )


# --- Pitch snap & self-harmony (AKINTI Pro, PRODUCT_V2 §4/§5) --------------
#
# Implemented with pYIN (already a dependency, see requirements.txt) plus
# `librosa.effects.pitch_shift` per fixed-length segment -- NOT pyworld. The
# brief allows either; pyworld is deliberately left out of requirements.txt
# for the same reason `requirements.txt`'s own header comment already gives
# for excluding torch/torchcrepe/Demucs: it is a native-extension dependency
# (Cython + libworld) with no prebuilt wheel path confirmed on this sidecar's
# actual deployment targets (this Windows dev machine, the Rust-toolchain
# Linux Docker image), the same "no Rust/native toolchain confirmed working
# here" problem `deepfilternet` already has (see sidecar/README.md "What
# actually works on this machine"). `librosa.effects.pitch_shift` needs
# nothing beyond the librosa/numpy/scipy already required, is CPU-only, and
# meets the "under 2x realtime for 3 minutes of audio" budget (a phase-vocoder
# STFT shift is cheap relative to pYIN's own analysis pass, which every
# request here already pays once). WORLD-quality formant preservation is a
# real quality ceiling this leaves on the table -- documented, not hidden.

SEGMENT_SECONDS = 0.5


def _voiced_midi_track(y, sr: int) -> tuple["object", "object", "object"]:
    import librosa

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
    )
    hop_length = 512
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)
    return f0, voiced_flag, times


@dataclass
class SnapResult:
    output_path: Path
    method: str
    key_guess: str
    strength: float


def snap_pitch(
    input_path: Path,
    output_dir: Path,
    strength: float = 0.8,
    reference_key: str | None = None,
) -> SnapResult:
    """Shift each `SEGMENT_SECONDS` window of `input_path` toward the nearest
    in-key semitone, scaled by `strength` (0 = untouched, 1 = fully snapped).
    A segment with no reliably voiced pitch is left unshifted, never guessed.
    """
    import math

    import librosa
    import numpy as np
    import soundfile as sf

    strength = max(0.0, min(1.0, strength))
    y, sr = librosa.load(str(input_path), sr=None, mono=True)
    root_index, is_minor, key_guess = _resolve_key(y, sr, reference_key)
    scale = sorted(_scale_semitones(root_index, is_minor))

    f0, voiced_flag, times = _voiced_midi_track(y, sr)
    segment_len = int(SEGMENT_SECONDS * sr)
    if segment_len <= 0 or len(y) == 0:
        raise RuntimeError("input audio is empty -- nothing to pitch-snap")

    out = np.zeros_like(y, dtype=np.float32)
    total_segments = max(1, math.ceil(len(y) / segment_len))
    for i in range(total_segments):
        start = i * segment_len
        end = min(len(y), start + segment_len)
        segment = y[start:end]
        if segment.size == 0:
            continue

        seg_t0, seg_t1 = start / sr, end / sr
        in_segment = (times >= seg_t0) & (times < seg_t1)
        voiced_midis = [
            librosa.hz_to_midi(f0_hz)
            for f0_hz, voiced, in_seg in zip(f0, voiced_flag, in_segment)
            if in_seg and voiced and f0_hz is not None and f0_hz > 0 and not np.isnan(f0_hz)
        ]

        if not voiced_midis:
            out[start:end] = segment
            continue

        current_midi = float(np.mean(voiced_midis))
        pitch_class = current_midi % 12
        nearest = min(
            scale,
            key=lambda s: min(abs(s - pitch_class), 12 - abs(s - pitch_class)),
        )
        # Move to the closest octave of the target pitch class, not just
        # `nearest` itself (which is only 0-11) -- otherwise a low voice
        # would get shifted up by whole octaves toward pitch class 0.
        target_midi = min((nearest + 12 * k for k in range(-2, 3)), key=lambda m: abs(m - current_midi))
        semitone_shift = (target_midi - current_midi) * strength

        if abs(semitone_shift) < 0.05:
            out[start:end] = segment
            continue

        shifted = librosa.effects.pitch_shift(segment, sr=sr, n_steps=semitone_shift)
        # `pitch_shift` can return a slightly different length than the input
        # (frame rounding) -- trim/pad to the segment's own length so segments
        # concatenate back to the original duration exactly.
        if len(shifted) >= (end - start):
            out[start:end] = shifted[: end - start]
        else:
            out[start : start + len(shifted)] = shifted
            out[start + len(shifted) : end] = segment[len(shifted) :]

    output_path = output_dir / "pitch_snapped.wav"
    sf.write(str(output_path), out, sr)
    return SnapResult(output_path=output_path, method="librosa_pitch_shift_segments", key_guess=key_guess, strength=strength)


@dataclass
class HarmonyResult:
    output_path: Path
    method: str
    key_guess: str
    interval_semitones: int


def build_self_harmony(
    input_path: Path,
    output_dir: Path,
    wet: float = 0.35,
    reference_key: str | None = None,
) -> HarmonyResult:
    """Mix the vocal with a pitch-shifted copy at a third above (chosen from
    the detected/reference key -- +4 semitones for a major third, +3 for a
    minor third) plus a quiet doubled layer an octave down, at `wet` mix.
    """
    import librosa
    import numpy as np
    import soundfile as sf

    wet = max(0.0, min(1.0, wet))
    y, sr = librosa.load(str(input_path), sr=None, mono=True)
    if len(y) == 0:
        raise RuntimeError("input audio is empty -- nothing to harmonize")

    _root_index, is_minor, key_guess = _resolve_key(y, sr, reference_key)
    interval_semitones = 3 if is_minor else 4

    harmony_layer = librosa.effects.pitch_shift(y, sr=sr, n_steps=interval_semitones)
    doubled_layer = librosa.effects.pitch_shift(y, sr=sr, n_steps=-12)

    n = min(len(y), len(harmony_layer), len(doubled_layer))
    mixed = y[:n] + (wet * 0.75) * harmony_layer[:n] + (wet * 0.35) * doubled_layer[:n]

    peak = float(np.max(np.abs(mixed))) if n > 0 else 0.0
    if peak > 0.98:
        mixed = mixed * (0.98 / peak)

    output_path = output_dir / "self_harmony.wav"
    sf.write(str(output_path), mixed.astype(np.float32), sr)
    return HarmonyResult(
        output_path=output_path,
        method="librosa_self_harmony",
        key_guess=key_guess,
        interval_semitones=interval_semitones,
    )
