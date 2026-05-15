import json
import logging
import os

from gradio_client import Client, handle_file

logger = logging.getLogger(__name__)

HF_SPACE = os.getenv("MEDGEMMA_SPACE", "yohanaraphael19/medgemma-birads")

# Module-level client — reused across calls to avoid reconnect overhead
_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        hf_token = os.getenv("HF_TOKEN") or None
        _client = Client(HF_SPACE, token=hf_token)
    return _client


def analyze(image_path: str, modality: str = "ultrasound") -> dict:
    """
    Call the MedGemma BI-RADS HF Space.

    Space signature:
      inputs:  gr.Image(type="pil"), gr.Textbox(modality)
      output:  gr.Textbox  — JSON string

    Returns a normalised dict ready to populate a Report row.
    On any failure returns a partial dict so a Report is still created.
    """
    try:
        client = _get_client()
        # gr.Interface exposes /predict; positional args match input order
        raw: str = client.predict(
            handle_file(image_path),
            modality,
            api_name="/analyze",
        )
        return _parse(raw)
    except Exception as exc:
        logger.warning("MedGemma call failed (%s): %s", type(exc).__name__, exc)
        # Reset client so next call reconnects (handles sleeping spaces)
        global _client
        _client = None
        return {
            "bi_rads_category": None,
            "malignant_probability": None,
            "label": None,
            "findings": f"MedGemma analysis unavailable: {exc}",
            "impression": None,
            "recommendations": None,
        }


LABEL_TO_BIRADS = {
    "normal":             1,
    "negative":           1,
    "benign":             2,
    "probably benign":    3,
    "suspicious":         4,
    "highly suspicious":  5,
    "known malignancy":   6,
    "malignant":          5,
}


def _parse(raw: str) -> dict:
    """
    Parse the JSON string returned by the space.

    Expected shape (example):
    {
      "bi_rads_category": 4,
      "label": "Suspicious",
      "malignant_probability": 0.600,
      "findings": "...",
      "recommendations": ["Short interval follow-up", "Consider biopsy"],
      "report": {
        "findings": "... detailed ...",
        "impression": "...",
        "recommendations": ["...", "..."]
      }
    }
    """
    try:
        data: dict = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return {
            "bi_rads_category": None,
            "malignant_probability": None,
            "label": None,
            "findings": str(raw),
            "impression": None,
            "recommendations": None,
        }

    if "error" in data:
        return {
            "bi_rads_category": None,
            "malignant_probability": None,
            "label": None,
            "findings": f"Space error: {data['error']}",
            "impression": None,
            "recommendations": None,
        }

    nested = data.get("report", {}) or {}

    # Prefer the detailed nested findings/recommendations over the brief top-level ones
    findings = nested.get("findings") or data.get("findings") or ""
    impression = nested.get("impression") or ""

    recs_raw = nested.get("recommendations") or data.get("recommendations") or []
    if isinstance(recs_raw, list):
        recommendations = "\n".join(f"• {r}" for r in recs_raw if r)
    else:
        recommendations = str(recs_raw)

    bi_rads = _int_or_none(data.get("bi_rads_category"))
    label = data.get("label") or ""

    if bi_rads is None and label:
        bi_rads = LABEL_TO_BIRADS.get(label.lower().strip())

    return {
        "bi_rads_category": bi_rads,
        "malignant_probability": _float_or_none(data.get("malignant_probability")),
        "label": label,
        "findings": findings,
        "impression": impression,
        "recommendations": recommendations,
    }


def _int_or_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _float_or_none(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None
