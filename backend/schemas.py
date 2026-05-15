from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict
from db_models import RoleEnum


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: RoleEnum = RoleEnum.doctor


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: RoleEnum
    is_active: bool
    must_change_password: bool
    created_at: datetime


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegistrationStatus(BaseModel):
    needs_bootstrap: bool


class ScanListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    analysis_id: int
    filename: str
    modality: str
    tasks_run: Optional[str]
    created_at: datetime
    has_report: bool


class ScanDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    analysis_id: int
    doctor_id: int
    filename: str
    modality: str
    tasks_run: Optional[str]
    inference_ms: Optional[int]
    model_version: Optional[str]
    created_at: datetime


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scan_id: int
    bi_rads_category: Optional[int]
    bi_rads_label: Optional[str]
    malignant_probability: Optional[float]
    segmentation_status: Optional[str]
    segmentation_score: Optional[float]
    findings: Optional[str]
    impression: Optional[str]
    recommendations: Optional[str]
    doctor_signed: bool
    signed_at: Optional[datetime]
    override_category: Optional[int]
    notes: Optional[str]


class SignReportIn(BaseModel):
    override_category: Optional[int] = None
    notes: Optional[str] = None
