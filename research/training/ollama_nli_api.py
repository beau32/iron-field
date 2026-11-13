import argparse
import gc
import json
import logging
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from typing import Any
from urllib.parse import urlparse

import torch
from peft import PeftModel
import transformers
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from transformers.models.auto.modeling_auto import MODEL_FOR_SEQUENCE_CLASSIFICATION_MAPPING_NAMES


ROOT = Path(__file__).resolve().parent
ID2LABEL = {0: "contradiction", 1: "entailment", 2: "neutral"}
LABEL2ID = {label: index for index, label in ID2LABEL.items()}
MAX_REQUEST_BYTES = 64 * 1024
MAX_TEXT_CHARS = 20_000
MAX_CHOICES = 100
INFERENCE_LOCK = RLock()
# auto keeps small models at their normal precision and serves Qwen3.5 on GPU in NF4.
PRECISION_MODE = "auto"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("openjev-nli")


def validate_model_support(base_model_id: str) -> None:
    if (
        "qwen3.5" in base_model_id.lower()
        and "qwen3_5" not in MODEL_FOR_SEQUENCE_CLASSIFICATION_MAPPING_NAMES
    ):
        raise RuntimeError(
            f"{base_model_id} requires Qwen3.5 sequence-classification "
            f"support, which Transformers {transformers.__version__} does not "
            "provide. Use the project's .venv-local environment or upgrade "
            "Transformers."
        )


def configure_padding(model: Any, tokenizer: Any) -> None:
    pad_token_id = tokenizer.pad_token_id
    if pad_token_id is None:
        raise ValueError("The tokenizer must define a pad token for batched classification")

    model.config.pad_token_id = pad_token_id
    model.config.get_text_config().pad_token_id = pad_token_id


def load_model(adapter_path: Path) -> tuple[Any, Any, str]:
    config_path = adapter_path / "adapter_config.json"
    if not config_path.is_file():
        raise FileNotFoundError(f"Adapter configuration not found: {config_path}")

    with config_path.open(encoding="utf-8") as config_file:
        adapter_config = json.load(config_file)

    base_model_id = adapter_config["base_model_name_or_path"]
    validate_model_support(base_model_id)

    tokenizer = AutoTokenizer.from_pretrained(adapter_path)
    use_cuda = torch.cuda.is_available()
    dtype = (
        torch.bfloat16 if use_cuda and torch.cuda.is_bf16_supported()
        else torch.float16 if use_cuda
        else torch.float32
    )
    use_4bit = use_cuda and (PRECISION_MODE == "4bit" or (PRECISION_MODE == "auto" and "qwen3.5" in base_model_id.lower()))
    if PRECISION_MODE == "4bit" and not use_cuda:
        raise RuntimeError("4-bit mode requires a CUDA GPU and bitsandbytes")
    model_options = {
        "num_labels": len(ID2LABEL), "id2label": ID2LABEL, "label2id": LABEL2ID,
        "dtype": dtype, "device_map": {"": 0} if use_cuda else "cpu",
    }
    if use_4bit:
        from transformers import BitsAndBytesConfig
        model_options["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype,
        )
    base_model = AutoModelForSequenceClassification.from_pretrained(base_model_id, **model_options)
    logger.info("Model precision: %s", "NF4 4-bit" if use_4bit else str(dtype))
    configure_padding(base_model, tokenizer)
    model = PeftModel.from_pretrained(base_model, adapter_path)
    configure_padding(model, tokenizer)
    model.eval()
    logger.info(
        "Loaded adapter %s (base %s) on %s",
        adapter_path,
        base_model_id,
        "CUDA" if use_cuda else "CPU",
    )
    return model, tokenizer, base_model_id


def discover_adapters(root: Path = ROOT) -> dict[str, Path]:
    adapters: dict[str, Path] = {}
    for model_dir in sorted(root.iterdir()):
        if not model_dir.is_dir():
            continue
        if (model_dir / "adapter_config.json").is_file():
            adapters[model_dir.name] = model_dir
            continue

        checkpoints = [
            path
            for path in model_dir.iterdir()
            if path.is_dir() and (path / "adapter_config.json").is_file()
        ]
        if checkpoints:
            adapters[model_dir.name] = max(
                checkpoints,
                key=lambda path: int(path.name.rsplit("-", 1)[-1])
                if path.name.rsplit("-", 1)[-1].isdigit()
                else -1,
            )
    return adapters


class ModelRegistry:
    def __init__(self, adapters: dict[str, Path], default_model_id: str) -> None:
        if default_model_id not in adapters:
            raise ValueError(f"Default model is not available: {default_model_id}")
        self.adapters = adapters
        self.default_model_id = default_model_id
        self.active_model_id: str | None = None
        self.model: Any = None
        self.tokenizer: Any = None
        self.base_model_id: str | None = None
        self.activate(default_model_id)

    def activate(self, model_id: str) -> None:
        if model_id not in self.adapters:
            raise KeyError(model_id)
        if self.active_model_id == model_id and self.model is not None:
            return

        self.model = None
        self.tokenizer = None
        self.base_model_id = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        model, tokenizer, base_model_id = load_model(self.adapters[model_id])
        self.model = model
        self.tokenizer = tokenizer
        self.base_model_id = base_model_id
        self.active_model_id = model_id


def classify(
    model: Any,
    tokenizer: Any,
    premise: str,
    hypotheses: list[str],
) -> list[dict[str, Any]]:
    texts = [f"Premise: {premise}\nHypothesis: {hypothesis}" for hypothesis in hypotheses]
    inputs = tokenizer(
        texts,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True,
    )
    inputs = {name: tensor.to(model.device) for name, tensor in inputs.items()}
    with INFERENCE_LOCK, torch.inference_mode():
        probabilities = torch.softmax(model(**inputs).logits.float(), dim=-1)

    results = []
    for prediction in probabilities:
        nli_scores = {
            ID2LABEL[index]: round(float(prediction[index]), 6)
            for index in range(len(ID2LABEL))
        }
        yes_probability = nli_scores["entailment"]
        results.append(
            {
                "nli": {
                    "label": ID2LABEL[int(prediction.argmax())],
                    "probabilities": nli_scores,
                },
                "yes_no": {
                    "label": "yes" if yes_probability >= 0.5 else "no",
                    "probabilities": {
                        "yes": yes_probability,
                        "no": round(1.0 - yes_probability, 6),
                    },
                },
            }
        )
    return results


class NLIRequestHandler(BaseHTTPRequestHandler):
    registry: ModelRegistry

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except ConnectionError:
            logger.info(
                "Client %s disconnected before the response could be sent",
                self.address_string(),
            )

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/v1/models":
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": model_id,
                            "object": "model",
                            "created": int(adapter_path.stat().st_mtime),
                            "owned_by": "openjev",
                        }
                        for model_id, adapter_path in self.registry.adapters.items()
                    ],
                },
            )
            return
        if path != "/health":
            self._send_json(404, {"error": "Not found"})
            return
        self._send_json(
            200,
            {
                "status": "ready",
                "base_model": self.registry.base_model_id,
                "adapter": self.registry.active_model_id,
            },
        )

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/classify":
            self._send_json(404, {"error": "Not found"})
            return
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            self._send_json(415, {"error": "Content-Type must be application/json"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send_json(400, {"error": "A valid Content-Length header is required"})
            return
        if content_length < 1 or content_length > MAX_REQUEST_BYTES:
            self._send_json(
                413 if content_length > MAX_REQUEST_BYTES else 400,
                {"error": f"Request body must be between 1 and {MAX_REQUEST_BYTES} bytes"},
            )
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Request body must be valid UTF-8 JSON"})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {"error": "Request body must be a JSON object"})
            return

        model_id = payload.get("model", self.registry.default_model_id)
        if not isinstance(model_id, str) or not model_id:
            self._send_json(400, {"error": "'model' must be a non-empty model ID string"})
            return
        if model_id not in self.registry.adapters:
            self._send_json(404, {"error": f"Unknown model: {model_id}"})
            return

        premise = payload.get("premise")
        if not isinstance(premise, str) or not premise.strip():
            self._send_json(400, {"error": "'premise' must be a non-empty string"})
            return
        if len(premise) > MAX_TEXT_CHARS:
            self._send_json(
                413,
                {"error": f"Premise must be at most {MAX_TEXT_CHARS} characters"},
            )
            return

        has_hypothesis = "hypothesis" in payload
        has_choices = "choices" in payload
        if has_hypothesis == has_choices:
            self._send_json(
                400,
                {"error": "Provide exactly one of 'hypothesis' or 'choices'"},
            )
            return

        if has_hypothesis:
            hypotheses = payload["hypothesis"]
            if not isinstance(hypotheses, str) or not hypotheses.strip():
                self._send_json(400, {"error": "'hypothesis' must be a non-empty string"})
                return
            choices = None
            hypotheses_to_classify = [hypotheses]
        else:
            choices = payload["choices"]
            if (
                not isinstance(choices, list)
                or not choices
                or len(choices) > MAX_CHOICES
                or any(not isinstance(choice, str) or not choice.strip() for choice in choices)
            ):
                self._send_json(
                    400,
                    {"error": f"'choices' must be a non-empty array of at most {MAX_CHOICES} non-empty strings"},
                )
                return
            hypotheses_to_classify = choices

        if any(len(hypothesis) > MAX_TEXT_CHARS for hypothesis in hypotheses_to_classify):
            self._send_json(
                413,
                {"error": f"Each hypothesis or choice must be at most {MAX_TEXT_CHARS} characters"},
            )
            return

        try:
            with INFERENCE_LOCK:
                self.registry.activate(model_id)
                results = classify(
                    self.registry.model,
                    self.registry.tokenizer,
                    premise,
                    hypotheses_to_classify,
                )
        except Exception:
            logger.exception("Classification failed")
            self._send_json(500, {"error": "Classification failed; see the service log"})
            return
        if choices is None:
            self._send_json(200, results[0])
            return
        self._send_json(
            200,
            {
                "choices": [
                    {"text": choice, **result}
                    for choice, result in zip(choices, results)
                ]
            },
        )

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("%s - %s", self.address_string(), format % args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the fine-tuned OpenJEV NLI classifier locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: localhost only)")
    parser.add_argument("--port", type=int, default=8011, help="HTTP port (default: 8011)")
    parser.add_argument(
        "--adapter",
        type=Path,
        default=Path(os.environ.get("OPENJEV_ADAPTER_DIR", ROOT / ("qwen35-4b-rts-lookahead" if (ROOT / "qwen35-4b-rts-lookahead" / "adapter_config.json").is_file() else "qwen25-05b-openjev"))),
        help="Default adapter or model directory (RTS 4B when installed, otherwise 0.5B)",
    )
    parser.add_argument("--precision", choices=("auto", "4bit", "full"), default="auto", help="Model loading precision (default: auto)")
    args = parser.parse_args()
    global PRECISION_MODE
    PRECISION_MODE = args.precision
    adapter_path = args.adapter if args.adapter.is_absolute() else ROOT / args.adapter
    adapter_path = adapter_path.resolve()
    adapters = discover_adapters()
    default_model_id = next(
        (
            model_id
            for model_id, discovered_path in adapters.items()
            if discovered_path.resolve() == adapter_path
        ),
        None,
    )
    if (
        default_model_id is None
        and adapter_path.is_dir()
        and not (adapter_path / "adapter_config.json").is_file()
    ):
        matching_adapter = next(
            (
                model_id
                for model_id, discovered_path in adapters.items()
                if discovered_path.parent == adapter_path
            ),
            None,
        )
        if matching_adapter is not None:
            default_model_id = matching_adapter
    if default_model_id is None:
        default_model_id = adapter_path.name
        adapters[default_model_id] = adapter_path
    registry = ModelRegistry(adapters, default_model_id)

    handler = type(
        "ConfiguredNLIRequestHandler",
        (NLIRequestHandler,),
        {
            "registry": registry,
        },
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    logger.info("NLI API listening at http://%s:%s", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down NLI API")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
