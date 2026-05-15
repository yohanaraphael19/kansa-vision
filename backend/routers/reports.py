from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from db_models import Report, Scan, User
from deps import get_current_user
from schemas import ReportOut, SignReportIn

router = APIRouter(prefix="/reports", tags=["reports"])


def _get_report_or_404(scan_id: int, db: Session, current_user: User) -> Report:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if current_user.role.value != "admin" and scan.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if scan.report is None:
        raise HTTPException(status_code=404, detail="Report not available yet")
    return scan.report


@router.get("/{scan_id}", response_model=ReportOut)
def get_report(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_report_or_404(scan_id, db, current_user)


@router.post("/{scan_id}/sign", response_model=ReportOut)
def sign_report(
    scan_id: int,
    body: SignReportIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = _get_report_or_404(scan_id, db, current_user)
    report.doctor_signed = True
    report.signed_at = datetime.now(timezone.utc)
    if body.override_category is not None:
        report.override_category = body.override_category
    if body.notes is not None:
        report.notes = body.notes
    db.commit()
    db.refresh(report)
    return ReportOut.model_validate(report)
