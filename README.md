# KansaVision

> AI-assisted breast cancer screening for low-resource clinical settings.

KansaVision is a private web application for hospital radiologists. A doctor 
uploads a breast ultrasound scan; the system runs a local AI pipeline and 
produces a structured report with a **BI-RADS category**, confidence score, 
and segmentation overlay. The doctor reviews, optionally overrides, and signs 
off. Every action is audit-logged.

> **Kansa** is the Swahili word for *cancer*. The name reflects the project's 
> East African roots and its focus on hospitals like Katavi Regional Referral 
> Hospital, Tanzania — where radiologists are scarce but diagnostic need is real.

> **Disclaimer:** Clinical Decision Support — not a diagnosis. Requires 
> radiologist review and sign-off.

---

## Pipeline

Upload scan → Denoising → Enhancement → Segmentation → BI-RADS Classification → Clinical Report

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, React Router v7, CSS Modules |
| Backend | FastAPI, SQLAlchemy, Alembic, JWT |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ML | PyTorch, OpenCV, SAM 2, MedGemma 4B |

### Models

| Task | Model |
|---|---|
| Denoising + enhancement | Bilateral filter + CLAHE (OpenCV) |
| Lesion segmentation | MedSAM 2 |
| BI-RADS classification + report | MedGemma 4B (`unsloth/medgemma-4b-it`) |

All model weights are cached locally. No runtime calls to external APIs —
the system is designed to run offline.

---

## Access Model

| Role | Capabilities |
|---|---|
| **Admin** | Register/deactivate doctors, view all scans, manage settings |
| **Doctor** | Upload scans, run analysis, review findings, sign reports |

- First registered user auto-promotes to admin. Self-signup is disabled thereafter.
- Every scan stores: `doctor_id`, `timestamp`, `model_version`, `bi_rads_output`, 
  `doctor_override` — full audit trail.

---
