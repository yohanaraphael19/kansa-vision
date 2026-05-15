"""
Download MedSAM2 weights from wanglab/MedSAM2 on HuggingFace.

Usage:
    conda run -n kansa python backend/scripts/download_medsam2.py

Downloads into: backend/models/weights/
"""

import os
import sys
from pathlib import Path

WEIGHTS_DIR = Path(__file__).parent.parent / "models" / "weights"

# Files to download from wanglab/MedSAM2
CHECKPOINTS = [
    "MedSAM2_latest.pt",
    "MedSAM2_MRI_LiverLesion.pt",
    "MedSAM2_CTLesion.pt",
]

REPO_ID = "wanglab/MedSAM2"


def download():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Installing huggingface_hub …")
        os.system(f"{sys.executable} -m pip install huggingface-hub -q")
        from huggingface_hub import hf_hub_download

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

    for filename in CHECKPOINTS:
        dest = WEIGHTS_DIR / filename
        if dest.exists():
            print(f"  [skip] {filename} already present")
            continue
        print(f"  [download] {filename} …")
        try:
            path = hf_hub_download(
                repo_id=REPO_ID,
                filename=filename,
                local_dir=str(WEIGHTS_DIR),
                local_dir_use_symlinks=False,
            )
            print(f"  [ok] saved to {path}")
        except Exception as exc:
            print(f"  [warn] Could not download {filename}: {exc}")
            print(f"         You can download it manually from https://huggingface.co/{REPO_ID}")


if __name__ == "__main__":
    print(f"Downloading MedSAM2 weights → {WEIGHTS_DIR}")
    download()
    print("Done.")
