"""Smoke tests for the sidecar's HTTP surface (see sidecar/README.md "Tests").

Generates a real sine-wave WAV fixture on the fly rather than checking in a
binary fixture. Every test that depends on an optional capability
(DeepFilterNet3, Matchering) checks `GET /health` first and `pytest.skip`s
with an explicit reason when that capability is genuinely unavailable on
this machine -- never asserts success against a backend that isn't there.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def sine_wav(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A real 3-second, 440Hz mono sine wave at 44.1kHz -- a genuine WAV file, not a stub."""
    path = tmp_path_factory.mktemp("fixtures") / "tone.wav"
    sample_rate = 44100
    duration_s = 3
    frequency_hz = 440.0

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for i in range(sample_rate * duration_s):
            sample = int(0.5 * 32767 * math.sin(2 * math.pi * frequency_hz * i / sample_rate))
            frames += struct.pack("<h", sample)
        wav_file.writeframes(bytes(frames))

    return path


def test_health_reports_real_capabilities() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["capabilities"].keys()) == {
        "ffmpeg", "deepfilternet", "arnndn", "matchering", "librosa", "soundfile",
    }
    assert set(body["endpoints"].keys()) == {"clean", "master", "pitch_score", "peaks"}
    # Every value must be an actual boolean from a real probe, never a stub "True".
    for value in {**body["capabilities"], **body["endpoints"]}.values():
        assert isinstance(value, bool)


def test_clean_uses_whatever_backend_health_reports(sine_wav: Path) -> None:
    caps = client.get("/health").json()["endpoints"]
    response = client.post("/clean", data={"path": str(sine_wav)})
    if not caps["clean"]:
        assert response.status_code == 503
        pytest.skip("no denoise backend installed on this machine (see sidecar/README.md)")
    assert response.status_code == 200
    body = response.json()
    assert body["method"] in {"deepfilternet3", "arnndn"}
    assert Path(body["output_path"]).is_file()


def test_master_matches_against_bundled_reference(sine_wav: Path) -> None:
    caps = client.get("/health").json()["endpoints"]
    response = client.post("/master", data={"path": str(sine_wav), "preset": "studio"})
    if not caps["master"]:
        assert response.status_code == 503
        pytest.skip("matchering is not installed on this machine")
    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "matchering"
    assert body["reference_family"] == "bright"  # studio -> bright, see PRESET_REFERENCE_FAMILY
    assert Path(body["output_path"]).is_file()


def test_pitch_score_against_detected_key(sine_wav: Path) -> None:
    caps = client.get("/health").json()["endpoints"]
    response = client.post("/pitch-score", data={"path": str(sine_wav)})
    if not caps["pitch_score"]:
        pytest.skip("librosa is not installed on this machine")
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["score"] <= 100.0
    assert isinstance(body["detected_key"], str) and body["detected_key"]
    assert isinstance(body["per_second_cents_deviation"], list)


def test_pitch_score_against_explicit_reference_key(sine_wav: Path) -> None:
    caps = client.get("/health").json()["endpoints"]
    if not caps["pitch_score"]:
        pytest.skip("librosa is not installed on this machine")
    response = client.post("/pitch-score", data={"path": str(sine_wav), "reference_key": "A minor"})
    assert response.status_code == 200
    body = response.json()
    assert body["reference_key"] == "A minor"


def test_peaks_shape_matches_worker_schema(sine_wav: Path) -> None:
    caps = client.get("/health").json()["endpoints"]
    response = client.post("/peaks", data={"path": str(sine_wav)})
    if not caps["peaks"]:
        pytest.skip("librosa/soundfile are not installed on this machine")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert body["bits"] == 8
    assert body["samples_per_pixel"] > 0
    assert all(0 <= value <= 255 for value in body["data"])
    # A 3s 440Hz tone at full amplitude should register real peaks, not silence.
    assert max(body["data"]) > 100


def test_missing_input_is_a_clear_error() -> None:
    response = client.post("/clean", data={})
    assert response.status_code == 400


def test_path_and_file_together_is_rejected(sine_wav: Path) -> None:
    with sine_wav.open("rb") as fh:
        response = client.post(
            "/clean",
            data={"path": str(sine_wav)},
            files={"file": ("tone.wav", fh, "audio/wav")},
        )
    assert response.status_code == 400


def test_nonexistent_path_is_404() -> None:
    response = client.post("/clean", data={"path": "/no/such/file.wav"})
    assert response.status_code == 404
