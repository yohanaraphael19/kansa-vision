import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text
)
from sqlalchemy.orm import mapped_column, relationship, Mapped
from database import Base


class RoleEnum(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(Enum(RoleEnum), default=RoleEnum.doctor, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    scans: Mapped[list["Scan"]] = relationship("Scan", back_populates="doctor", cascade="all, delete-orphan")
    created_by: Mapped["User | None"] = relationship("User", remote_side=[id])


class Scan(Base):
    __tablename__ = "scans"

    analysis_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    modality: Mapped[str] = mapped_column(String(64), default="ultrasound", nullable=False)
    tasks_run: Mapped[str | None] = mapped_column(String(255), nullable=True)  # comma-sep flags
    inference_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    doctor: Mapped["User"] = relationship("User", back_populates="scans")
    report: Mapped["Report | None"] = relationship(
        "Report", back_populates="scan", uselist=False, cascade="all, delete-orphan"
    )


class Report(Base):
    __tablename__ = "reports"

    scan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scans.analysis_id", ondelete="CASCADE"), primary_key=True
    )
    bi_rads_category: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bi_rads_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    malignant_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    segmentation_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    segmentation_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    findings: Mapped[str | None] = mapped_column(Text, nullable=True)
    impression: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)
    doctor_signed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    override_category: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    scan: Mapped["Scan"] = relationship("Scan", back_populates="report")
