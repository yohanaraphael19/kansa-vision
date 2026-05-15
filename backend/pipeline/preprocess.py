"""
Modality-aware preprocessing pipeline.

Dispatch table:
  ultrasound    → denoise (NLMeans) + CLAHE
  mammography   → grayscale convert + normalize + strong CLAHE + resize
  mri           → intensity window/normalize + CLAHE (no spatial denoising)
  xray          → grayscale + normalize + CLAHE + unsharp mask
  histopathology→ resize + LAB CLAHE (color preserved)
"""

import cv2
import nibabel as nib
import numpy as np


# ── NIfTI helpers ────────────────────────────────────────────────────────────

def is_nifti(path: str) -> bool:
    return path.endswith('.nii') or path.endswith('.nii.gz') or path.endswith('.gz')


def load_nifti_slice(path: str, slice_idx: int = None) -> np.ndarray:
    """Load a single 2-D axial slice from a NIfTI volume as uint8."""
    proxy = nib.load(path)
    data = np.asarray(proxy.dataobj)

    if data.ndim == 4:
        data = data[..., 0]

    if slice_idx is None:
        variances = np.var(data, axis=(0, 1))
        slice_idx = int(np.argmax(variances))

    slice_2d = data[:, :, slice_idx].astype(np.float32)

    lo, hi = np.percentile(slice_2d, [1, 99])
    if hi > lo:
        slice_2d = np.clip((slice_2d - lo) / (hi - lo) * 255, 0, 255)
    else:
        slice_2d = np.zeros_like(slice_2d)

    return slice_2d.astype(np.uint8)


def get_nifti_info(path: str) -> dict:
    """Return metadata about a NIfTI volume."""
    img = nib.load(path)
    data = img.get_fdata()
    if data.ndim == 4:
        n_timepoints = data.shape[3]
        data = data[..., 0]
    else:
        n_timepoints = 1
    return {
        "n_slices": data.shape[2],
        "n_timepoints": n_timepoints,
        "shape": list(data.shape[:3]),
        "best_slice": int(np.argmax(np.var(data, axis=(0, 1)))),
    }


# ── Public entry point ──────────────────────────────────────────────────────

def preprocess(src_path: str, dst_path: str, tasks: list[str],
               modality: str = "ultrasound", slice_idx: int = None) -> dict:
    """Returns metadata dict including nifti_info if applicable."""
    meta = {}

    if is_nifti(src_path):
        nifti_info = get_nifti_info(src_path)
        meta["nifti_info"] = nifti_info
        if slice_idx is None:
            slice_idx = nifti_info["best_slice"]
        img = load_nifti_slice(src_path, slice_idx)
        meta["slice_idx"] = slice_idx
        meta["is_nifti"] = True
    else:
        img = _load(src_path, modality)
        meta["is_nifti"] = False

    if "denoise" in tasks:
        img = _denoise(img, modality)
    if "clahe" in tasks:
        img = _clahe(img, modality)

    # Always write a proper PNG — never copy NIfTI bytes to dst_path
    success = cv2.imwrite(dst_path, img)
    if not success:
        raise RuntimeError(f"Failed to write preprocessed image to {dst_path}")

    return meta


# ── Loading / initial normalisation ─────────────────────────────────────────

def _load(path: str, modality: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {path}")

    # 16-bit (DICOM export, some MRI/CT TIFF) → 8-bit
    if img.dtype == np.uint16:
        img = _u16_to_u8(img)

    if modality in ("mammography", "xray"):
        # CDD-CESM stored as RGB but is grayscale luminance
        if len(img.shape) == 3 and img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Resize mammography: 1308×2316 is too large for inference
        if modality == "mammography":
            img = _resize_max(img, 1024)

    return img


def _u16_to_u8(img: np.ndarray) -> np.ndarray:
    lo, hi = img.min(), img.max()
    if hi == lo:
        return np.zeros_like(img, dtype=np.uint8)
    return ((img.astype(np.float32) - lo) / (hi - lo) * 255).astype(np.uint8)


def _resize_max(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return img
    scale = max_side / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


# ── Denoising ────────────────────────────────────────────────────────────────

def _denoise(img: np.ndarray, modality: str) -> np.ndarray:
    if modality in ("mri", "histopathology"):
        # MRI: structured noise — mild bilateral filter, not NLMeans
        # Histo: preserve stain colours
        if len(img.shape) == 2:
            return cv2.bilateralFilter(img, d=5, sigmaColor=30, sigmaSpace=30)
        return cv2.bilateralFilter(img, d=5, sigmaColor=30, sigmaSpace=30)

    if len(img.shape) == 2:
        return cv2.fastNlMeansDenoising(img, h=6, templateWindowSize=7, searchWindowSize=21)
    return cv2.fastNlMeansDenoisingColored(img, h=6, hColor=6, templateWindowSize=7, searchWindowSize=21)


# ── CLAHE ────────────────────────────────────────────────────────────────────

def _clahe(img: np.ndarray, modality: str) -> np.ndarray:
    params = _clahe_params(modality)
    clahe = cv2.createCLAHE(**params)

    if len(img.shape) == 2:
        return clahe.apply(img)

    # Colour image: apply CLAHE on L channel only
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def _clahe_params(modality: str) -> dict:
    if modality == "mammography":
        # Mammography benefits from stronger local contrast enhancement
        return {"clipLimit": 3.0, "tileGridSize": (8, 8)}
    if modality == "mri":
        # MRI: subtle enhancement to preserve tissue contrast
        return {"clipLimit": 2.0, "tileGridSize": (16, 16)}
    if modality in ("xray",):
        # X-ray: moderate, larger tiles for uniform enhancement
        return {"clipLimit": 2.5, "tileGridSize": (8, 8)}
    if modality == "histopathology":
        # Histo: minimal — preserve stain colours
        return {"clipLimit": 1.5, "tileGridSize": (16, 16)}
    # ultrasound default
    return {"clipLimit": 2.5, "tileGridSize": (8, 8)}
