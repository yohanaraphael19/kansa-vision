"""
NIfTI (.nii / .nii.gz) utilities for MAMA-MIA DCE-MRI volumes.

A DCE-MRI study has 5 volumes (_0000–_0004):
  _0000 = pre-contrast
  _0001–_0004 = post-contrast phases

The most diagnostically useful 2-D slice for display and inference is taken
from the post-contrast subtraction (phase1 − pre), which enhances the tumour.
"""

import os
import cv2
import numpy as np


def nifti_to_png(nifti_path: str, out_path: str, lesion_bbox: dict | None = None) -> None:
    """
    Convert a single NIfTI volume to a 2-D PNG.
    If lesion_bbox is supplied (from the MAMA-MIA patient JSON), the slice
    containing the tumour centre is extracted; otherwise the middle axial slice.
    """
    import nibabel as nib  # imported lazily — not always needed

    img = nib.load(nifti_path)
    arr = img.get_fdata().astype(np.float32)  # (H, W, slices)

    if lesion_bbox and "z_min" in lesion_bbox and "z_max" in lesion_bbox:
        z = (lesion_bbox["z_min"] + lesion_bbox["z_max"]) // 2
        z = int(np.clip(z, 0, arr.shape[2] - 1))
    else:
        z = arr.shape[2] // 2

    slice_2d = arr[:, :, z]
    slice_u8 = _norm_u8(slice_2d)
    cv2.imwrite(out_path, slice_u8)


def dce_subtraction_slice(pre_path: str, post_path: str, out_path: str,
                           lesion_bbox: dict | None = None) -> None:
    """
    Create a subtraction image (post − pre) to highlight enhancing tumour,
    then extract and save the most informative 2-D slice.
    """
    import nibabel as nib

    pre  = nib.load(pre_path).get_fdata().astype(np.float32)
    post = nib.load(post_path).get_fdata().astype(np.float32)
    sub  = np.clip(post - pre, 0, None)

    if lesion_bbox and "z_min" in lesion_bbox:
        z = int((lesion_bbox["z_min"] + lesion_bbox["z_max"]) // 2)
        z = int(np.clip(z, 0, sub.shape[2] - 1))
    else:
        # Fall back to slice of maximum variance (most informative)
        variances = [sub[:, :, i].var() for i in range(sub.shape[2])]
        z = int(np.argmax(variances))

    slice_u8 = _norm_u8(sub[:, :, z])
    cv2.imwrite(out_path, slice_u8)


def _norm_u8(arr2d: np.ndarray) -> np.ndarray:
    lo = np.percentile(arr2d, 1)
    hi = np.percentile(arr2d, 99)
    if hi <= lo:
        return np.zeros_like(arr2d, dtype=np.uint8)
    clipped = np.clip(arr2d, lo, hi)
    return ((clipped - lo) / (hi - lo) * 255).astype(np.uint8)
