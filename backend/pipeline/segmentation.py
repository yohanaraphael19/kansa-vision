"""
MedSAM2 segmentation pipeline.

Model selection per modality:
  ultrasound    → MedSAM2_latest.pt   (general, best for breast US)
  mri           → MedSAM2_MRI_LiverLesion.pt  (closest available fine-tune)
  ct            → MedSAM2_CTLesion.pt
  mammography   → MedSAM2_latest.pt
  xray          → MedSAM2_latest.pt
  histopathology→ MedSAM2_latest.pt

Prompt strategy (no user interaction required):
  1. Run CLAHE on image to amplify contrast
  2. Threshold top-15% intensity pixels
  3. Find their centroid → use as SAM2 foreground point
  4. Use a 60% centre bounding box as the supporting box prompt
"""

from __future__ import annotations
import logging
import os
import time

import cv2
import numpy as np

logger = logging.getLogger(__name__)

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "weights")

# SAM2 config bundled with the sam2 package
_SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"

_MODALITY_WEIGHTS = {
    "ultrasound":     "MedSAM2_latest.pt",
    "mri":            "MedSAM2_MRI_LiverLesion.pt",
    "ct":             "MedSAM2_CTLesion.pt",
    "mammography":    "MedSAM2_latest.pt",
    "xray":           "MedSAM2_latest.pt",
    "histopathology": "MedSAM2_latest.pt",
}

# Module-level predictor cache {weights_filename: predictor}
_predictors: dict = {}


def _get_predictor(modality: str, model_override: str = None):
    """Lazy-load the SAM2 predictor for the given modality."""
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    weights_file = model_override if model_override else _MODALITY_WEIGHTS.get(modality, "MedSAM2_latest.pt")
    if weights_file in _predictors:
        return _predictors[weights_file]

    ckpt = os.path.join(WEIGHTS_DIR, weights_file)
    if not os.path.exists(ckpt):
        raise FileNotFoundError(
            f"MedSAM2 weights not found: {ckpt}\n"
            f"Run: python backend/scripts/download_medsam2.py"
        )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = build_sam2(_SAM2_CONFIG, ckpt, device=device)
    predictor = SAM2ImagePredictor(model)
    _predictors[weights_file] = predictor
    logger.info("Loaded MedSAM2 (%s) on %s", weights_file, device)
    return predictor


def segment(image_path: str, modality: str = "ultrasound", model_override: str = None) -> dict:
    """
    Run MedSAM2 on a 2-D image file.

    Returns:
      {
        "status": "done" | "error",
        "mask_path": str,          # absolute path to binary mask PNG
        "score": float,            # SAM2 confidence score
        "area_pct": float,         # mask area as % of image area
        "inference_ms": int,
      }
    """
    t0 = time.monotonic()
    try:
        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            return {"status": "error", "error": f"Cannot read {image_path}"}

        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        point_coords, point_labels, box = _auto_prompt(img_bgr, modality)

        predictor = _get_predictor(modality, model_override)
        predictor.set_image(img_rgb)

        import numpy as np
        masks, scores, _ = predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            box=box,
            multimask_output=True,
        )

        best = int(np.argmax(scores))
        mask = (masks[best] * 255).astype(np.uint8)
        score = float(scores[best])

        mask_path = image_path.replace(".png", "_mask.png").replace(".jpg", "_mask.png")
        cv2.imwrite(mask_path, mask)

        area_pct = round(float(mask.sum()) / (255 * mask.size) * 100, 2)
        inference_ms = int((time.monotonic() - t0) * 1000)

        return {
            "status": "done",
            "mask_path": mask_path,
            "score": round(score, 4),
            "area_pct": area_pct,
            "inference_ms": inference_ms,
        }

    except FileNotFoundError as exc:
        logger.warning("Segmentation skipped — weights missing: %s", exc)
        return {"status": "weights_missing", "error": str(exc)}
    except Exception as exc:
        logger.error("Segmentation failed: %s", exc, exc_info=True)
        return {"status": "error", "error": str(exc)}


def _auto_prompt(img_bgr: np.ndarray, modality: str):
    """
    Derive a point prompt + bounding box from the image automatically.
    Returns (point_coords, point_labels, box) ready for SAM2 predict().
    """
    import numpy as np

    h, w = img_bgr.shape[:2]

    # Work on CLAHE-enhanced grayscale for prompt detection
    if len(img_bgr.shape) == 3:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_bgr.copy()

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # For histopathology invert is not helpful; use saturation channel instead
    if modality == "histopathology":
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        enhanced = hsv[:, :, 1]  # saturation highlights stained tissue

    # Threshold top-15% of pixel values to find likely lesion region
    threshold = np.percentile(enhanced, 85)
    binary = (enhanced >= threshold).astype(np.uint8)

    # Use centroid of the foreground region as the point prompt
    M = cv2.moments(binary)
    if M["m00"] > 0:
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
    else:
        cx, cy = w // 2, h // 2

    point_coords = np.array([[cx, cy]], dtype=np.float32)
    point_labels = np.array([1], dtype=np.int32)  # 1 = foreground

    # Supporting bounding box: 60% of image centred on prompt point
    margin_x = int(w * 0.30)
    margin_y = int(h * 0.30)
    box = np.array([
        max(0, cx - margin_x), max(0, cy - margin_y),
        min(w, cx + margin_x), min(h, cy + margin_y),
    ], dtype=np.float32)

    return point_coords, point_labels, box
