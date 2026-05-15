import os
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from db_models import Report, Scan, User
from deps import get_current_user
from pipeline.preprocess import preprocess
from pipeline.medgemma import analyze
from pipeline.segmentation import segment
from schemas import ScanDetail, ScanListItem

router = APIRouter(prefix="/scans", tags=["scans"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "weights")
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".dcm", ".dicom", ".nii", ".nii.gz", ".gz"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB (CT/MRI slices can be larger)

MODALITY_LABELS = {
    "x-ray": "xray", "xray": "xray", "x_ray": "xray",
    "ct": "ct", "ct scan": "ct", "ct_scan": "ct",
    "ultra": "ultrasound", "ultrasound": "ultrasound",
    "mri": "mri",
}


def is_nifti_file(path: str) -> bool:
    return path.endswith('.nii.gz') or path.endswith('.nii') or path.endswith('.gz')


def _file_ext(filename: str) -> str:
    """Return full extension, correctly handling compound extensions like .nii.gz."""
    if filename.endswith(".nii.gz"):
        return ".nii.gz"
    if filename.endswith(".nii"):
        return ".nii"
    return os.path.splitext(filename)[1].lower()


@router.post("/upload", response_model=ScanDetail, status_code=status.HTTP_201_CREATED)
async def upload_scan(
    file: UploadFile,
    tasks: Annotated[str, Form()] = "denoise,clahe,birads",
    modality: Annotated[str, Form()] = "ultrasound",
    seg_model: Annotated[str, Form()] = "",
    slice_idx: Annotated[int | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or ""
    ext = _file_ext(filename)
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    scan_uuid = str(uuid.uuid4())
    orig_filename = f"{scan_uuid}{ext}"
    prep_filename = f"{scan_uuid}_preprocessed.png"
    orig_path = os.path.join(UPLOADS_DIR, orig_filename)
    prep_path = os.path.join(UPLOADS_DIR, prep_filename)

    with open(orig_path, "wb") as f:
        f.write(raw)

    task_list = [t.strip() for t in tasks.split(",") if t.strip()]
    norm_modality = MODALITY_LABELS.get(modality.lower().strip(), modality.lower())
    tasks_run_final: list[str] = []
    t0 = time.monotonic()

    # Always create a prep file — either preprocessed or copy of original
    preprocess_tasks = [t for t in task_list if t in ("denoise", "clahe")]
    preprocess_meta = {}
    if preprocess_tasks:
        preprocess_meta = preprocess(orig_path, prep_path, preprocess_tasks,
                                     modality=norm_modality, slice_idx=slice_idx)
        tasks_run_final.extend(preprocess_tasks)
    elif is_nifti_file(orig_path):
        # Extract best slice as PNG even when no preprocessing tasks are selected
        import cv2
        from pipeline.preprocess import get_nifti_info, load_nifti_slice
        info = get_nifti_info(orig_path)
        idx = slice_idx if slice_idx is not None else info["best_slice"]
        slice_arr = load_nifti_slice(orig_path, idx)
        cv2.imwrite(prep_path, slice_arr)
        preprocess_meta = {"is_nifti": True, "slice_idx": idx}
    else:
        import shutil
        shutil.copy2(orig_path, prep_path)
        preprocess_meta = {"is_nifti": False}

    # BI-RADS via MedGemma
    report_data: dict = {}
    if "birads" in task_list:
        # Always use preprocessed PNG — never send raw NIfTI to MedGemma
        src_for_ai = prep_path if os.path.exists(prep_path) else orig_path
        if not is_nifti_file(src_for_ai):
            report_data = analyze(src_for_ai, norm_modality)
            tasks_run_final.append("birads")
        else:
            report_data = {"findings": "AI analysis requires a preprocessed image — run Denoising or Enhancement first"}

    # Segmentation via MedSAM2
    seg_mask_path = None
    if "segmentation" in task_list:
        src = prep_path if os.path.exists(prep_path) else orig_path
        seg = segment(src, norm_modality, model_override=seg_model or None)
        report_data["segmentation_status"] = seg.get("status", "error")
        if seg.get("score") is not None:
            report_data["segmentation_score"] = seg["score"]
        if seg.get("mask_path") and os.path.exists(seg["mask_path"]):
            seg_mask_path = seg["mask_path"]
        tasks_run_final.append("segmentation")

    inference_ms = int((time.monotonic() - t0) * 1000)

    scan = Scan(
        doctor_id=current_user.id,
        filename=file.filename or orig_filename,
        modality=norm_modality,
        tasks_run=",".join(tasks_run_final),
        inference_ms=inference_ms,
        model_version="medgemma-4b-it",
        created_at=datetime.now(timezone.utc),
    )
    db.add(scan)
    db.flush()  # get analysis_id before renaming files

    # Rename files to analysis_id-based names so frontend can build URLs from scan ID
    final_orig = os.path.join(UPLOADS_DIR, f"{scan.analysis_id}{ext}")
    final_prep = os.path.join(UPLOADS_DIR, f"{scan.analysis_id}_preprocessed.png")
    os.rename(orig_path, final_orig)
    if os.path.exists(prep_path):
        os.rename(prep_path, final_prep)
    if seg_mask_path:
        final_mask = os.path.join(UPLOADS_DIR, f"{scan.analysis_id}_preprocessed_mask.png")
        os.rename(seg_mask_path, final_mask)

    if "birads" in task_list or "segmentation" in task_list:
        report = Report(
            scan_id=scan.analysis_id,
            bi_rads_category=report_data.get("bi_rads_category"),
            bi_rads_label=report_data.get("label"),
            malignant_probability=report_data.get("malignant_probability"),
            segmentation_status=report_data.get("segmentation_status"),
            segmentation_score=report_data.get("segmentation_score"),
            findings=report_data.get("findings"),
            impression=report_data.get("impression"),
            recommendations=report_data.get("recommendations"),
        )
        db.add(report)

    db.commit()
    db.refresh(scan)
    return ScanDetail.model_validate(scan)


_MODEL_REGISTRY = {
    "MedSAM2_latest.pt": {
        "label": "MedSAM2 General",
        "modalities": ["ultrasound", "mammography", "xray", "histopathology", "ct", "mri"],
        "description": "General purpose medical segmentation — works on all modalities",
    },
    "MedSAM2_CTLesion.pt": {
        "label": "MedSAM2 CT Lesion",
        "modalities": ["ct"],
        "description": "Optimized for CT lesion detection",
    },
    "MedSAM2_MRI_LiverLesion.pt": {
        "label": "MedSAM2 MRI Liver",
        "modalities": ["mri"],
        "description": "Optimized for MRI liver lesion segmentation",
    },
    "medsam2_FLARE25_RECIST_baseline.pt": {
        "label": "MedSAM2 FLARE25",
        "modalities": ["ct", "mri"],
        "description": "FLARE25 challenge baseline — abdominal organs",
    },
}

DEFAULT_MODELS = {
    "ultrasound":     "MedSAM2_latest.pt",
    "mammography":    "MedSAM2_latest.pt",
    "xray":           "MedSAM2_latest.pt",
    "histopathology": "MedSAM2_latest.pt",
    "ct":             "MedSAM2_CTLesion.pt",
    "mri":            "MedSAM2_MRI_LiverLesion.pt",
}


@router.get("/models")
def list_models(current_user: User = Depends(get_current_user)):
    """Return available segmentation models grouped by modality."""
    available = {f for f in os.listdir(WEIGHTS_DIR) if f.endswith(".pt")}
    result: dict = {}
    for filename, meta in _MODEL_REGISTRY.items():
        if filename not in available:
            continue
        for modality in meta["modalities"]:
            result.setdefault(modality, []).append({
                "filename": filename,
                "label": meta["label"],
                "description": meta["description"],
                "is_default": filename == DEFAULT_MODELS.get(modality),
            })
    return result


@router.post("/preview-slice")
async def preview_nifti_slice(
    file: UploadFile,
    slice_idx: Annotated[int | None, Form()] = None,
    current_user: User = Depends(get_current_user),
):
    import tempfile
    import cv2
    from fastapi.responses import Response
    from pipeline.preprocess import load_nifti_slice, get_nifti_info

    filename = file.filename or ""
    if not (filename.endswith('.nii.gz') or filename.endswith('.nii')):
        raise HTTPException(status_code=400, detail="NIfTI file required (.nii or .nii.gz)")

    raw = await file.read()
    suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        info = get_nifti_info(tmp_path)
        idx = slice_idx if slice_idx is not None else info["best_slice"]
        slice_arr = load_nifti_slice(tmp_path, idx)
        _, buf = cv2.imencode(".png", slice_arr)
        png_bytes = buf.tobytes()
    finally:
        os.unlink(tmp_path)

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Nifti-Slices":      str(info["n_slices"]),
            "X-Nifti-Best-Slice":  str(info["best_slice"]),
            "X-Nifti-Timepoints":  str(info["n_timepoints"]),
            "X-Nifti-Slice-Used":  str(idx),
            "Access-Control-Expose-Headers": "X-Nifti-Slices,X-Nifti-Best-Slice,X-Nifti-Timepoints,X-Nifti-Slice-Used",
        },
    )


@router.get("", response_model=list[ScanListItem])
def list_scans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Scan)
    if current_user.role.value != "admin":
        q = q.filter(Scan.doctor_id == current_user.id)
    scans = q.order_by(Scan.created_at.desc()).all()
    return [
        ScanListItem(
            analysis_id=s.analysis_id,
            filename=s.filename,
            modality=s.modality,
            tasks_run=s.tasks_run,
            created_at=s.created_at,
            has_report=s.report is not None,
        )
        for s in scans
    ]


@router.get("/{scan_id}/image")
def get_scan_image(
    scan_id: int,
    preprocessed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if current_user.role.value != "admin" and scan.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if preprocessed:
        path = os.path.join(UPLOADS_DIR, f"{scan_id}_preprocessed.png")
    else:
        ext = _file_ext(scan.filename) or ".png"
        path = os.path.join(UPLOADS_DIR, f"{scan_id}{ext}")

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(path)


@router.delete("/{scan_id}", status_code=204)
def delete_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if current_user.role.value != "admin" and scan.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    import glob
    for f in glob.glob(os.path.join(UPLOADS_DIR, f"{scan_id}*")):
        os.remove(f)
    db.delete(scan)
    db.commit()


@router.get("/{scan_id}/nifti-info")
def get_nifti_info_endpoint(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    ext = _file_ext(scan.filename)
    if ext not in ('.nii', '.nii.gz', '.gz'):
        return {"is_nifti": False}
    orig_path = os.path.join(UPLOADS_DIR, f"{scan_id}{ext}")
    if not os.path.exists(orig_path):
        return {"is_nifti": False}
    from pipeline.preprocess import get_nifti_info
    info = get_nifti_info(orig_path)
    return {"is_nifti": True, **info}


@router.get("/{scan_id}", response_model=ScanDetail)
def get_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if current_user.role.value != "admin" and scan.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return ScanDetail.model_validate(scan)
