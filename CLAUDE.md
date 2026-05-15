# KansaVision — Claude Code Instructions

## Environment
- Always use the `kansa` conda env for the backend. Never .venv, never system Python.
- Backend start: `cd ~/kansa-vision/backend && conda activate kansa && uvicorn main:app --reload --port 8000`
- Frontend start: `cd ~/kansa-vision/frontend && npm run dev` → http://localhost:5173

## Rules
- Never commit `backend/.env`, `data/`, `backend/uploads/`, or `backend/models/weights/`
- bcrypt is pinned to 4.0.1 — do not upgrade (passlib 1.7.4 breaks on bcrypt 5.x)
- All model downloads go through ModelScope CDN (HuggingFace is throttled in China)
- MedGemma runs on HF Space `yohanaraphael19/medgemma-birads` via gradio_client — not locally
- Dataset on disk: `data/samples/Ultrasound/BUS-UCLM/` (ALWI_000.png pattern)

## Stack
- Frontend: React 18, Vite, React Router v7, CSS Modules, DM Sans
- Backend: FastAPI, SQLAlchemy, JWT (python-jose), SQLite (dev) / Postgres (prod)
- ML: OpenCV (denoise + CLAHE), MEDSAM 2 (segmentation), MedGemma 4B via HF Space (BI-RADS)

## Design tokens
- Navy: #1B2A4A  |  Background: #F0F4F8  |  Teal: #0D9488
- Font: DM Sans
- CSS Modules only — no Tailwind
