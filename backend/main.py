import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db
from routers import auth, admin, health, scans, reports

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    init_db()
    yield


app = FastAPI(title="KansaVision API", version="0.1.0", lifespan=lifespan)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Nifti-Slices",
        "X-Nifti-Best-Slice",
        "X-Nifti-Timepoints",
        "X-Nifti-Slice-Used",
    ],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(scans.router)
app.include_router(reports.router)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
