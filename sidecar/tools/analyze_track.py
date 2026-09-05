"""Standalone BPM/key estimation for `scripts/seed-backing-tracks.ts`.

Reuses the same librosa-based key detection `app/dsp.py`'s `/pitch-score`
endpoint uses (Krumhansl-Schmuckler profile correlation), plus
`librosa.beat.beat_track` for tempo. Prints one JSON object to stdout:
`{"bpm": <int>, "musical_key": "<root> <major|minor>"}`.

This is real signal analysis on the actual downloaded audio file, not a
guess — run once per seeded track, not part of the FastAPI service itself.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import librosa  # noqa: E402

from app.dsp import _detect_key  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: analyze_track.py <audio-file>", file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    y, sr = librosa.load(path, sr=22050, mono=True)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(tempo[0] if hasattr(tempo, "__len__") else tempo))

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key = _detect_key(chroma.mean(axis=1).tolist())

    print(json.dumps({"bpm": bpm, "musical_key": key}))


if __name__ == "__main__":
    main()
