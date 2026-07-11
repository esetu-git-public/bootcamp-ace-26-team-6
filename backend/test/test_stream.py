# tests/test_stream.py

from unittest.mock import patch
from fastapi.responses import StreamingResponse

from backend.stream import generate_frames, get_stream


def test_generate_frames_returns_valid_frame():
    fake_frame = b"fake_jpeg_data"

    with patch("backend.stream.camera_manager.get_jpeg", return_value=fake_frame):
        generator = generate_frames()
        frame = next(generator)

        expected = (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + fake_frame +
            b"\r\n"
        )

        assert frame == expected


def test_generate_frames_skips_none():
    fake_frame = b"frame_data"

    with patch(
        "backend.stream.camera_manager.get_jpeg",
        side_effect=[None, fake_frame]
    ):
        generator = generate_frames()

        frame = next(generator)

        expected = (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + fake_frame +
            b"\r\n"
        )

        assert frame == expected


def test_get_stream_returns_streaming_response():
    response = get_stream()

    assert isinstance(response, StreamingResponse)
    assert (
        response.media_type
        == "multipart/x-mixed-replace; boundary=frame"
    )# tests/test_stream.py

from unittest.mock import patch
from fastapi.responses import StreamingResponse

from backend.stream import generate_frames, get_stream


def test_generate_frames_returns_valid_frame():
    fake_frame = b"fake_jpeg_data"

    with patch("backend.stream.camera_manager.get_jpeg", return_value=fake_frame):
        generator = generate_frames()
        frame = next(generator)

        expected = (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + fake_frame +
            b"\r\n"
        )

        assert frame == expected


def test_generate_frames_skips_none():
    fake_frame = b"frame_data"

    with patch(
        "backend.stream.camera_manager.get_jpeg",
        side_effect=[None, fake_frame]
    ):
        generator = generate_frames()

        frame = next(generator)

        expected = (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + fake_frame +
            b"\r\n"
        )

        assert frame == expected


def test_get_stream_returns_streaming_response():
    response = get_stream()

    assert isinstance(response, StreamingResponse)
    assert (
        response.media_type
        == "multipart/x-mixed-replace; boundary=frame"
    )
