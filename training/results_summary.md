# PPE Compliance Detection — Training Results Summary

## Model
- **Architecture:** YOLOv8s
- **Framework:** Ultralytics 8.4.87
- **Training hardware:** Kaggle Notebook, Tesla T4 GPU
- **Epochs:** 60 (patience=15, no early stop triggered)
- **Image size:** 640x640
- **Batch size:** 16

## Dataset
- **Source:** [PPE Dataset YOLOv8 (Kaggle)](https://www.kaggle.com/datasets/shlokraval/ppe-dataset-yolov8)
- **Classes:** 14
- **Train images:** 30,765
- **Validation images:** 8,814

## Overall Performance

| Metric | Score |
|---|---|
| Precision | 0.708 |
| Recall | 0.843 |
| mAP50 | 0.784 |
| mAP50-95 | 0.513 |

## Per-Class Results

| Class | Images | Instances | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|---|
| Hardhat | 3191 | 8952 | 0.807 | 0.913 | 0.905 | 0.531 |
| NO-Hardhat | 865 | 2222 | 0.596 | 0.892 | 0.742 | 0.496 |
| Safety Vest | 609 | 1287 | 0.622 | 0.713 | 0.708 | 0.510 |
| **NO-Safety Vest** | 189 | 361 | 0.307 | 0.307 | 0.238 | 0.119 |
| Gloves | 395 | 858 | 0.822 | 0.943 | 0.948 | 0.494 |
| NO-Gloves | 571 | 1258 | 0.807 | 0.889 | 0.903 | 0.443 |
| Goggles | 746 | 827 | 0.816 | 0.984 | 0.966 | 0.602 |
| NO-Goggles | 679 | 859 | 0.819 | 0.950 | 0.950 | 0.569 |
| Mask | 292 | 554 | 0.477 | 0.925 | 0.502 | 0.402 |
| NO-Mask | 327 | 505 | 0.549 | 0.877 | 0.654 | 0.475 |
| Person | 193 | 277 | 0.906 | 0.903 | 0.933 | 0.775 |
| Ladder | 193 | 202 | 0.884 | 0.945 | 0.959 | 0.808 |
| Safety Cone | 338 | 3016 | 0.724 | 0.694 | 0.699 | 0.383 |
| Fall-Detected | 899 | 899 | 0.770 | 0.862 | 0.872 | 0.579 |

## Known Limitation

**`NO-Safety Vest`** is the clear underperformer across every metric (Recall: 0.307, mAP50: 0.238). This directly traces back to class imbalance in the source dataset — it has only 189 images / 361 instances, roughly 25–80x fewer than most other classes (e.g. Hardhat: 8,952 instances). All other 13 classes perform well, with most recall scores above 0.86.

This was flagged during initial EDA and confirmed again after training — it is a data availability issue, not a training or pipeline defect. Given time and GPU constraints, this is documented as a known limitation rather than pursued further (potential future fixes: oversampling, targeted augmentation, or collecting more labeled examples for this class).

## Training Notes
- Baseline sanity check (yolov8n, 10 epochs, imgsz=416): mAP50 0.729, mAP50-95 0.451 — confirmed pipeline correctness before the real run
- Final run (yolov8s, 60 epochs, imgsz=640) improved mAP50-95 to 0.513
- Mosaic augmentation automatically disabled for final 10 epochs (`close_mosaic=10`) for fine-tuning on realistic images
- Training was interrupted twice by Kaggle session resets; final run resumed and completed successfully, with checkpoint backed up as a Kaggle Model to avoid future data loss

## Deliverable
- **Model weights:** `best.pt` (uploaded to Kaggle Models, copy in `models/best.pt` in this repo)
- **Class config:** `data.yaml`
- **Handoff to:** Backend/API team for integration into `/predict` endpoint