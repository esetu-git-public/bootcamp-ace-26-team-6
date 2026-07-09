from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from backend.detector import CLASS_NAMES, annotate, detect


def _make_mock_box(cls_id, conf=0.9, x1=10, y1=20, x2=100, y2=200):
    box = MagicMock()
    box.cls = MagicMock()
    box.cls.__getitem__.return_value = cls_id
    box.cls.__iter__.return_value = iter([cls_id])
    box.cls.tolist.return_value = [cls_id]
    box.conf = MagicMock()
    box.conf.__getitem__.return_value = conf
    box.conf.tolist.return_value = [conf]
    xyxy_arr = np.array([x1, y1, x2, y2])
    box.xyxy.__getitem__.return_value = xyxy_arr
    return box


def _make_mock_results(boxes):
    results = MagicMock()
    results.boxes = boxes
    return results


class TestAnnotate:
    def test_annotate_draws_boxes(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        detections = [
            {"class_id": 8, "class_name": "NO-Hardhat", "confidence": 0.85, "bbox": [50, 50, 150, 200], "is_violation": True},
            {"class_id": 3, "class_name": "Hardhat", "confidence": 0.92, "bbox": [300, 100, 400, 300], "is_violation": False},
        ]
        result = annotate(frame, detections)
        assert result.shape == frame.shape
        # Check pixels changed (boxes were drawn)
        assert not np.array_equal(result, frame)

    def test_annotate_empty_detections(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        result = annotate(frame, [])
        assert np.array_equal(result, frame)


class TestDetect:
    def test_violation_event_type(self):
        boxes = [_make_mock_box(cls_id=8)]
        mock_results = _make_mock_results(boxes)
        mock_model = MagicMock()
        mock_model.return_value = [mock_results]

        with patch("backend.detector._get_model", return_value=mock_model):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = detect(frame)
            assert result["event_type"] == "violation"
            assert len(result["detections"]) == 1
            assert result["detections"][0]["class_name"] == "NO-Hardhat"
            assert result["detections"][0]["is_violation"] is True

    def test_fall_event_type_takes_priority(self):
        boxes = [
            _make_mock_box(cls_id=0),
            _make_mock_box(cls_id=8),
        ]
        mock_results = _make_mock_results(boxes)
        mock_model = MagicMock()
        mock_model.return_value = [mock_results]

        with patch("backend.detector._get_model", return_value=mock_model):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = detect(frame)
            assert result["event_type"] == "fall"

    def test_compliant_event_type(self):
        boxes = [
            _make_mock_box(cls_id=3),
            _make_mock_box(cls_id=11),
        ]
        mock_results = _make_mock_results(boxes)
        mock_model = MagicMock()
        mock_model.return_value = [mock_results]

        with patch("backend.detector._get_model", return_value=mock_model):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = detect(frame)
            assert result["event_type"] == "compliant"
            assert all(d["is_violation"] is False for d in result["detections"])

    def test_custom_violation_ids(self):
        boxes = [_make_mock_box(cls_id=3)]
        mock_results = _make_mock_results(boxes)
        mock_model = MagicMock()
        mock_model.return_value = [mock_results]

        with patch("backend.detector._get_model", return_value=mock_model):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            # Class 3 (Hardhat) normally not a violation
            result = detect(frame)
            assert result["event_type"] == "compliant"

            # But if user marks class 3 as violation
            result = detect(frame, violation_ids={3})
            assert result["event_type"] == "violation"

    def test_empty_frame_no_detections(self):
        boxes = []
        mock_results = _make_mock_results(boxes)
        mock_model = MagicMock()
        mock_model.return_value = [mock_results]

        with patch("backend.detector._get_model", return_value=mock_model):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = detect(frame)
            assert result["event_type"] == "compliant"
            assert result["detections"] == []
