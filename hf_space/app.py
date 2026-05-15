import os
import json
import re

import spaces
import gradio as gr
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText
from huggingface_hub import login

MODEL_ID = "google/medgemma-4b-it"

_hf_token = os.getenv("HF_TOKEN")
if _hf_token:
    login(token=_hf_token)

_processor = None
_model = None


def _load_model():
    global _processor, _model
    if _model is None:
        _processor = AutoProcessor.from_pretrained(MODEL_ID)
        _model = AutoModelForImageTextToText.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
    return _model, _processor


# ── Modality-specific prompts ─────────────────────────────────────────────────

_PROMPTS = {
    "ultrasound": """Analyze this breast ultrasound image.
Respond ONLY with a valid JSON object — no explanation, no markdown fences:
{
  "bi_rads_category": <integer 1-5>,
  "label": "<Negative | Benign | Probably benign | Suspicious | Highly suggestive of malignancy>",
  "malignant_probability": <float 0.00-1.00>,
  "findings": "<2-3 sentences on sonographic features visible in the image>",
  "recommendations": "<one-sentence clinical follow-up recommendation>",
  "report": {
    "findings": "<detailed sonographic findings, 3-5 sentences>",
    "impression": "<1-2 sentence clinical interpretation>",
    "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
  }
}
BI-RADS: 1=Negative, 2=Benign, 3=Probably benign, 4=Suspicious, 5=Highly suggestive of malignancy.
Base your assessment solely on what is visible in the image.""",

    "ct": """Analyze this CT scan image.
Respond ONLY with a valid JSON object — no explanation, no markdown fences:
{
  "bi_rads_category": null,
  "label": "<Normal | Benign | Indeterminate | Suspicious | Malignant>",
  "malignant_probability": <float 0.00-1.00>,
  "findings": "<2-3 sentences describing visible anatomical structures and any abnormalities>",
  "recommendations": "<one-sentence clinical follow-up recommendation>",
  "report": {
    "findings": "<detailed CT findings, 3-5 sentences: density, size, shape, enhancement pattern>",
    "impression": "<1-2 sentence clinical interpretation>",
    "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
  }
}
Base your assessment solely on what is visible in the image.""",

    "mri": """Analyze this MRI image.
Respond ONLY with a valid JSON object — no explanation, no markdown fences:
{
  "bi_rads_category": null,
  "label": "<Normal | Benign | Indeterminate | Suspicious | Malignant>",
  "malignant_probability": <float 0.00-1.00>,
  "findings": "<2-3 sentences on signal characteristics, morphology, and any lesions>",
  "recommendations": "<one-sentence clinical follow-up recommendation>",
  "report": {
    "findings": "<detailed MRI findings, 3-5 sentences: signal intensity, enhancement, location>",
    "impression": "<1-2 sentence clinical interpretation>",
    "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
  }
}
Base your assessment solely on what is visible in the image.""",

    "xray": """Analyze this chest X-ray or musculoskeletal X-ray image.
Respond ONLY with a valid JSON object — no explanation, no markdown fences:
{
  "bi_rads_category": null,
  "label": "<Normal | Abnormal | Suspicious | Critical>",
  "malignant_probability": <float 0.00-1.00>,
  "findings": "<2-3 sentences on visible structures, densities, and any abnormalities>",
  "recommendations": "<one-sentence clinical follow-up recommendation>",
  "report": {
    "findings": "<detailed radiographic findings, 3-5 sentences>",
    "impression": "<1-2 sentence clinical interpretation>",
    "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
  }
}
Base your assessment solely on what is visible in the image.""",
}

_DEFAULT_PROMPT = _PROMPTS["ultrasound"]

_MODALITY_MAP = {
    "ultrasound": "ultrasound", "ultra": "ultrasound", "us": "ultrasound",
    "ct": "ct", "ct scan": "ct", "ct_scan": "ct",
    "mri": "mri", "mr": "mri",
    "xray": "xray", "x-ray": "xray", "x_ray": "xray",
}


@spaces.GPU(duration=120)
def analyze(image: Image.Image, modality: str) -> str:
    if image is None:
        return json.dumps({"error": "No image provided"})

    prompt = _PROMPTS.get(_MODALITY_MAP.get(modality.lower().strip(), ""), _DEFAULT_PROMPT)

    try:
        model, processor = _load_model()

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = processor(
            text=text,
            images=[image.convert("RGB")],
            return_tensors="pt",
        ).to(model.device)

        input_len = inputs["input_ids"].shape[-1]

        with torch.inference_mode():
            outputs = model.generate(
                **inputs,
                max_new_tokens=600,
                do_sample=False,
                temperature=1.0,
            )

        response_text = processor.decode(
            outputs[0][input_len:], skip_special_tokens=True
        ).strip()

        json_match = re.search(r"\{[\s\S]*\}", response_text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                if "bi_rads_category" in data and data["bi_rads_category"] is not None:
                    data["bi_rads_category"] = int(data["bi_rads_category"])
                if "malignant_probability" in data:
                    data["malignant_probability"] = round(float(data["malignant_probability"]), 3)
                return json.dumps(data)
            except (json.JSONDecodeError, ValueError):
                pass

        return json.dumps({"parse_error": True, "raw_response": response_text})

    except Exception as exc:
        return json.dumps({"error": str(exc)})


demo = gr.Interface(
    fn=analyze,
    inputs=[
        gr.Image(type="pil", label="Medical Image"),
        gr.Textbox(value="ultrasound", label="Modality (ultrasound / ct / mri / xray)"),
    ],
    outputs=gr.Textbox(label="Analysis (JSON)"),
    title="KansaVision — MedGemma Multi-Modal Analyzer",
    description=(
        "Supports: Breast Ultrasound · CT · MRI · X-Ray. "
        "Clinical Decision Support — not a diagnosis. Radiologist sign-off required."
    ),
)

if __name__ == "__main__":
    demo.launch(ssr_mode=False)
