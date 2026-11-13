"""Adapt synthetic RTS decisions into a three-class recommendation-NLI task."""

import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "outputs" / "qwen35-9b-rts-v2-synthetic"
SOURCE_ADAPTER = ROOT / "qwen35-4b-openjev" / "checkpoint-6250"
OUTPUT_DIR = ROOT / "outputs" / "qwen35-4b-rts-recommendation-nli"
LABELS = ["contradiction", "entailment", "neutral"]
LABEL2ID = {label: index for index, label in enumerate(LABELS)}
SEED = 42
MAX_LENGTH = 288
TRAIN_BATCH_SIZE = 8
GRADIENT_ACCUMULATION = 2


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source if line.strip()]


def exact_fact_contradictions(prompt: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for line in prompt.splitlines():
        line = line.strip()
        if not line:
            continue

        match = re.fullmatch(r"Income (broken|working)\.", line, flags=re.IGNORECASE)
        if match:
            opposite = "working" if match.group(1).lower() == "broken" else "broken"
            pairs.append((line, f"Income is {opposite}."))
            continue

        match = re.fullmatch(r"Global force estimate (stronger|weaker|even)\.", line, flags=re.IGNORECASE)
        if match:
            state = match.group(1).lower()
            opposite = {
                "stronger": "Our global force is weaker than the enemy's.",
                "weaker": "Our global force is stronger than the enemy's.",
                "even": "Our global force is not evenly matched with the enemy's.",
            }[state]
            pairs.append((line, opposite))
            continue

        match = re.search(r"\bBase threats (\d+)\.", line, flags=re.IGNORECASE)
        if match:
            count = int(match.group(1))
            hypothesis = (
                "Our base is under threat."
                if count == 0
                else "There are no threats to our base."
            )
            pairs.append((line, hypothesis))
            continue

        match = re.search(
            r"\bEnemy miners/refineries (\d+)/(\d+);",
            line,
            flags=re.IGNORECASE,
        )
        if match:
            miners, refineries = map(int, match.groups())
            hypothesis = (
                "The enemy has miners or refineries."
                if miners == 0 and refineries == 0
                else "The enemy has no miners and no refineries."
            )
            pairs.append((line, hypothesis))
            continue

        match = re.search(
            r"\bfactories/garrisons/airfields/shipyards (\d+)/(\d+)/(\d+)/(\d+)\.",
            line,
            flags=re.IGNORECASE,
        )
        if match:
            buildings = tuple(map(int, match.groups()))
            hypothesis = (
                "The enemy has at least one factory, garrison, airfield, or shipyard."
                if not any(buildings)
                else "The enemy has no factories, garrisons, airfields, or shipyards."
            )
            pairs.append((line, hypothesis))
            continue

        match = re.search(r"\bCash (\d+)\.", line, flags=re.IGNORECASE)
        if match:
            amount = int(match.group(1))
            pairs.append((line, f"Cash is not {amount}."))

    return pairs


def extract_state(prompt: str, split: str, index: int) -> str:
    marker = "Return the selected name as a JSON string."
    if marker not in prompt:
        raise ValueError(f"{split} row {index} has no RTS prompt terminator")
    state_section = prompt.split(marker, 1)[1]
    state_lines = []
    for line in state_section.splitlines():
        line = line.strip()
        if not line:
            continue
        if (
            line.startswith("Approximate two-step worst-case ranking")
            or line.startswith("Choose only:")
            or line.startswith("Plain names use")
        ):
            break
        state_lines.append(line)
    if not state_lines:
        raise ValueError(f"{split} row {index} has no extractable game-state evidence")
    return " ".join(state_lines)


def convert_rows(rows: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        messages = row.get("messages")
        if (
            not isinstance(messages, list)
            or len(messages) != 2
            or messages[0].get("role") != "user"
            or messages[1].get("role") != "assistant"
        ):
            raise ValueError(f"{split} row {index} does not have the expected user/assistant messages")

        prompt = messages[0].get("content")
        if not isinstance(prompt, str):
            raise ValueError(f"{split} row {index} has no text prompt")
        target = json.loads(messages[1].get("content", "null"))
        if not isinstance(target, str):
            raise ValueError(f"{split} row {index} has no string operation label")

        choices_match = re.search(r"Choose only:\s*([^\r\n]+)", prompt)
        if not choices_match:
            raise ValueError(f"{split} row {index} has no offered-operation list")
        choices = [choice.strip() for choice in choices_match.group(1).rstrip(".").split(",")]
        if target not in choices:
            raise ValueError(f"{split} row {index} target {target!r} is not in its offered choices")
        alternatives = [choice for choice in choices if choice != target]
        if not alternatives:
            raise ValueError(f"{split} row {index} has no alternative operation for a neutral example")

        state = extract_state(prompt, split, index)
        # A non-target option is neutral, not contradictory: the heuristic
        # selected one action but did not prove that all other actions are false.
        neutral_action = alternatives[(index + SEED) % len(alternatives)]
        prefix = "The synthetic game heuristic recommends this operation: "
        converted.append({
            "premise": state,
            "hypothesis": f"{prefix}{target}.",
            "label": "entailment",
            "source_split": split,
            "family": row.get("family", "unknown"),
            "source": row.get("source", "unknown"),
        })
        converted.append({
            "premise": state,
            "hypothesis": f"{prefix}{neutral_action}.",
            "label": "neutral",
            "source_split": split,
            "family": row.get("family", "unknown"),
            "source": row.get("source", "unknown"),
        })

        fact_contradictions = exact_fact_contradictions(prompt)
        if not fact_contradictions:
            raise ValueError(f"{split} row {index} has no explicit fact for contradiction generation")
        fact, contradiction = fact_contradictions[(index + SEED) % len(fact_contradictions)]
        converted.append({
            "premise": fact,
            "hypothesis": contradiction,
            "label": "contradiction",
            "source_split": split,
            "family": row.get("family", "unknown"),
            "source": "synthetic-explicit-fact",
        })

    return converted


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as output:
        for row in rows:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")


def prepare_data() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    train_source = SOURCE_DIR / "train_synthetic.jsonl"
    validation_source = SOURCE_DIR / "validation_synthetic.jsonl"
    if not train_source.is_file() or not validation_source.is_file():
        raise FileNotFoundError(
            f"Expected synthetic RTS datasets at {train_source} and {validation_source}"
        )

    train_rows = read_jsonl(train_source)
    validation_rows = read_jsonl(validation_source)
    train = convert_rows(train_rows, "train")
    validation = convert_rows(validation_rows, "validation")

    train_labels = Counter(row["label"] for row in train)
    validation_labels = Counter(row["label"] for row in validation)
    if any(train_labels[label] == 0 or validation_labels[label] == 0 for label in LABELS):
        raise ValueError("Both splits must contain every NLI class")

    train_path = OUTPUT_DIR / "train_recommendation_nli.jsonl"
    validation_path = OUTPUT_DIR / "validation_recommendation_nli.jsonl"
    write_jsonl(train_path, train)
    write_jsonl(validation_path, validation)
    manifest = {
        "task": "Synthetic RTS recommendation-NLI",
        "label_mapping": {
            "entailment": "The original synthetic teacher-selected operation.",
            "neutral": "An offered alternative operation not established as the teacher's recommendation.",
            "contradiction": "An explicit RTS state fact paired with its generated opposite.",
        },
        "data_sources": {
            "train": str(train_source.relative_to(ROOT)),
            "validation": str(validation_source.relative_to(ROOT)),
            "weak_human_examples_included": False,
        },
        "source_scenarios": {
            "train": len(train_rows),
            "validation": len(validation_rows),
        },
        "converted_examples": {
            "train": len(train),
            "validation": len(validation),
        },
        "label_counts": {
            "train": {label: train_labels[label] for label in LABELS},
            "validation": {label: validation_labels[label] for label in LABELS},
        },
        "notes": [
            "This is recommendation-NLI for synthetic game decisions, not ordinary linguistic NLI or vehicle/insurance NLI.",
            "Entailment targets and scenario families inherit hand-written RTS heuristic limitations.",
            "Neutral means the scenario does not establish that the alternative is the teacher-preferred operation; it does not mean the alternative is strategically bad.",
            "Contradiction examples use explicit numeric or categorical facts from the prompt and their direct opposites.",
            "The validation set uses new prompts but the same synthetic scenario families and teacher rules; it is not an independent gameplay test.",
        ],
    }
    manifest_path = OUTPUT_DIR / "dataset_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return train, validation, manifest


def train_model(
    train_rows: list[dict[str, Any]],
    validation_rows: list[dict[str, Any]],
    *,
    epochs: float,
    max_steps: int | None,
    smoke_test: bool,
) -> dict[str, Any]:
    import numpy as np
    import torch
    from peft import PeftModel, prepare_model_for_kbit_training
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        BitsAndBytesConfig,
        DataCollatorWithPadding,
        Trainer,
        TrainingArguments,
    )

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for 4-bit QLoRA training")

    adapter_config_path = SOURCE_ADAPTER / "adapter_config.json"
    if not adapter_config_path.is_file():
        raise FileNotFoundError(f"Existing 4B OpenJEV adapter not found: {SOURCE_ADAPTER}")
    with adapter_config_path.open(encoding="utf-8") as config_file:
        adapter_config = json.load(config_file)
    base_model_id = adapter_config["base_model_name_or_path"]

    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    use_bf16 = torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else torch.float16
    tokenizer = AutoTokenizer.from_pretrained(SOURCE_ADAPTER)
    if tokenizer.pad_token_id is None:
        if tokenizer.eos_token is None:
            raise ValueError("Tokenizer has neither a padding token nor an EOS token")
        tokenizer.pad_token = tokenizer.eos_token

    if tokenizer.pad_token_id is None:
        raise ValueError("Tokenizer padding token ID is unavailable")

    def tokenize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        texts = [
            f"Premise: {row['premise']}\nHypothesis: {row['hypothesis']}"
            for row in rows
        ]
        encoded = tokenizer(texts, truncation=True, max_length=MAX_LENGTH, padding=False)
        return [
            {
                "input_ids": encoded["input_ids"][index],
                "attention_mask": encoded["attention_mask"][index],
                "labels": LABEL2ID[row["label"]],
            }
            for index, row in enumerate(rows)
        ]

    tokenized_train = tokenize(train_rows)
    tokenized_validation = tokenize(validation_rows)
    lengths = [len(row["input_ids"]) for row in tokenized_train]
    print(
        f"Token lengths: min={min(lengths)}, median={int(np.median(lengths))}, "
        f"max={max(lengths)}",
        flush=True,
    )

    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=dtype,
    )
    print(f"Loading {base_model_id} in 4-bit...", flush=True)
    base_model = AutoModelForSequenceClassification.from_pretrained(
        base_model_id,
        num_labels=len(LABELS),
        id2label={index: label for index, label in enumerate(LABELS)},
        label2id=LABEL2ID,
        quantization_config=quant_config,
        dtype=dtype,
        device_map={"": 0},
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    if hasattr(base_model.config, "text_config"):
        base_model.config.text_config.pad_token_id = tokenizer.pad_token_id
        base_model.config.text_config.use_cache = False
    base_model.config.use_cache = False
    base_model = prepare_model_for_kbit_training(
        base_model,
        use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
    )
    model = PeftModel.from_pretrained(
        base_model,
        SOURCE_ADAPTER,
        is_trainable=True,
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    if hasattr(model.config, "text_config"):
        model.config.text_config.pad_token_id = tokenizer.pad_token_id
        model.config.text_config.use_cache = False
    wrapped_base = getattr(model, "base_model", None)
    wrapped_model = getattr(wrapped_base, "model", None)
    if wrapped_model is not None:
        wrapped_model.config.pad_token_id = tokenizer.pad_token_id
        if hasattr(wrapped_model.config, "text_config"):
            wrapped_model.config.text_config.pad_token_id = tokenizer.pad_token_id
            wrapped_model.config.text_config.use_cache = False
    model.config.use_cache = False
    model.print_trainable_parameters()

    class NliDataset(torch.utils.data.Dataset):
        def __init__(self, examples: list[dict[str, Any]]) -> None:
            self.examples = examples

        def __len__(self) -> int:
            return len(self.examples)

        def __getitem__(self, index: int) -> dict[str, Any]:
            return self.examples[index]

    def compute_metrics(prediction: Any) -> dict[str, float]:
        logits = prediction.predictions[0] if isinstance(prediction.predictions, tuple) else prediction.predictions
        predicted = np.argmax(logits, axis=-1)
        return {
            "accuracy": float(accuracy_score(prediction.label_ids, predicted)),
            "macro_f1": float(
                f1_score(
                    prediction.label_ids,
                    predicted,
                    labels=list(range(len(LABELS))),
                    average="macro",
                    zero_division=0,
                )
            ),
        }

    effective_steps = (
        max_steps
        if max_steps is not None
        else int(
            (len(tokenized_train) + TRAIN_BATCH_SIZE * GRADIENT_ACCUMULATION - 1)
            // (TRAIN_BATCH_SIZE * GRADIENT_ACCUMULATION)
            * epochs
        )
    )
    run_dir = OUTPUT_DIR / "smoke-test" if smoke_test else OUTPUT_DIR
    train_args = TrainingArguments(
        output_dir=str(run_dir / "checkpoints"),
        num_train_epochs=epochs,
        max_steps=max_steps if max_steps is not None else -1,
        per_device_train_batch_size=TRAIN_BATCH_SIZE,
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        learning_rate=1e-5,
        weight_decay=0.01,
        warmup_steps=max(1, int(effective_steps * 0.03)) if effective_steps > 1 else 0,
        lr_scheduler_type="cosine",
        bf16=use_bf16,
        fp16=not use_bf16,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        eval_strategy="steps" if max_steps is not None else "epoch",
        eval_steps=max_steps,
        save_strategy="steps",
        save_steps=max_steps if max_steps is not None else 100,
        save_total_limit=2,
        logging_steps=25,
        load_best_model_at_end=False,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        optim="adamw_torch",
        report_to="none",
        remove_unused_columns=False,
        label_names=["labels"],
        seed=SEED,
        data_seed=SEED,
    )
    trainer = Trainer(
        model=model,
        args=train_args,
        train_dataset=NliDataset(tokenized_train),
        eval_dataset=NliDataset(tokenized_validation),
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )
    initial_evaluation = trainer.evaluate(metric_key_prefix="initial")
    training_result = trainer.train(resume_from_checkpoint=__import__("os").environ.get("RTS_LOOKAHEAD_RESUME") or None)
    evaluation = trainer.evaluate()
    predictions = trainer.predict(NliDataset(tokenized_validation))
    logits = predictions.predictions[0] if isinstance(predictions.predictions, tuple) else predictions.predictions
    y_pred = np.argmax(logits, axis=-1)
    y_true = predictions.label_ids

    final_adapter = run_dir / "adapter-final"
    trainer.save_model(str(final_adapter))
    tokenizer.save_pretrained(final_adapter)

    results = {
        "status": "completed",
        "base_model": base_model_id,
        "initialized_from_adapter": str(SOURCE_ADAPTER.relative_to(ROOT)),
        "output_adapter": str(final_adapter.relative_to(ROOT)),
        "train_examples": len(train_rows),
        "validation_examples": len(validation_rows),
        "epochs": epochs,
        "requested_max_steps": max_steps,
        "global_step": training_result.global_step,
        "training_loss": training_result.training_loss,
        "peak_cuda_memory_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
        "initial_validation_metrics": {
            key: float(value)
            for key, value in initial_evaluation.items()
            if key.startswith("initial_")
        },
        "validation_metrics": {
            key: float(value)
            for key, value in evaluation.items()
            if key.startswith("eval_")
        },
        "validation_classification_report": classification_report(
            y_true,
            y_pred,
            labels=list(range(len(LABELS))),
            target_names=LABELS,
            output_dict=True,
            zero_division=0,
        ),
        "validation_confusion_matrix": confusion_matrix(
            y_true,
            y_pred,
            labels=list(range(len(LABELS))),
        ).tolist(),
        "label_order": LABELS,
        "caveats": [
            "The model is fine-tuned to synthetic RTS recommendation-NLI, not OpenJEV vehicle/insurance NLI.",
            "The training and validation labels are generated from heuristic decisions and explicit prompt facts.",
            "Validation shares the generator's scenario families and is not evidence of human strategic quality.",
        ],
    }
    (run_dir / "training_result.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-only", action="store_true", help="Build and audit the converted dataset without training")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--max-steps", type=int, default=None, help="Optional short run for smoke testing")
    parser.add_argument("--smoke-test", action="store_true", help="Run one training step on small subsets and save only under smoke-test/")
    args = parser.parse_args()
    if args.epochs <= 0 or (args.max_steps is not None and args.max_steps <= 0):
        parser.error("--epochs and --max-steps must be positive")
    if args.smoke_test and args.max_steps is not None:
        parser.error("Use either --smoke-test or --max-steps, not both")

    train_rows, validation_rows, manifest = prepare_data()
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)
    if args.prepare_only:
        return
    if args.smoke_test:
        train_rows = train_rows[:24]
        validation_rows = validation_rows[:60]
        args.epochs = 1.0
        args.max_steps = 1
    results = train_model(
        train_rows,
        validation_rows,
        epochs=args.epochs,
        max_steps=args.max_steps,
        smoke_test=args.smoke_test,
    )
    print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()


