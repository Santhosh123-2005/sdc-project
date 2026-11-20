import argparse
import hashlib
import json
import random
import zipfile
from collections import Counter
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from PIL import Image
from scipy.optimize import minimize_scalar
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from torch import nn
from torch.utils.data import DataLoader, Dataset

from backend.ml.image_model import AttentionCNN, IMAGE_SIZE, training_tensor
from backend.ml.preprocessing import QuantileClipper


SEED = 42
CLINICAL_COLUMNS = [
    "Age",
    "BMI",
    "Menstrual_Cycle_Length_days",
    "Hirsutism_Score_FG",
    "HOMA_IR",
    "LH_FSH_Ratio",
    "Follicle_Count_Left",
    "Follicle_Count_Right",
]
CLINICAL_FEATURE_NAMES = [
    "Age",
    "BMI",
    "Menstrual cycle length",
    "Hirsutism score",
    "HOMA-IR",
    "LH/FSH ratio",
    "Left ovary follicle count",
    "Right ovary follicle count",
]
LABEL_DIRECTORIES = {"noninfected": 0, "infected": 1}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train separate 5-fold clinical and ultrasound PCOS research models."
    )
    parser.add_argument("--clinical-archive", type=Path, required=True)
    parser.add_argument("--image-archive", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("backend/models"))
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--image-epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=64)
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    for archive in (args.clinical_archive, args.image_archive):
        if not archive.is_file() or not zipfile.is_zipfile(archive):
            raise ValueError(f"Dataset archive does not exist or is not a ZIP file: {archive}")
    if args.folds != 5:
        raise ValueError("This project's evaluation and ensemble architecture requires exactly 5 folds.")
    if args.image_epochs < 1 or args.batch_size < 1:
        raise ValueError("Image epochs and batch size must be positive.")


def read_clinical_data(archive_path: Path) -> tuple[pd.DataFrame, np.ndarray]:
    with zipfile.ZipFile(archive_path) as archive:
        spreadsheets = [
            name for name in archive.namelist()
            if name.lower().endswith((".xlsx", ".xls"))
        ]
        if len(spreadsheets) != 1:
            raise ValueError("Clinical ZIP must contain exactly one Excel spreadsheet.")
        workbook = archive.read(spreadsheets[0])

    data = pd.read_excel(BytesIO(workbook))
    missing_columns = set(CLINICAL_COLUMNS + ["PCOS_Diagnosis"]) - set(data.columns)
    if missing_columns:
        raise ValueError(
            "Clinical spreadsheet is missing required fields: "
            + ", ".join(sorted(missing_columns))
        )

    labels = pd.to_numeric(data["PCOS_Diagnosis"], errors="coerce")
    valid = labels.isin([0, 1])
    features = data.loc[valid, CLINICAL_COLUMNS].apply(pd.to_numeric, errors="coerce")
    labels = labels.loc[valid].astype("int64").to_numpy()
    if len(features) < 50 or len(np.unique(labels)) != 2:
        raise ValueError("Clinical data needs at least 50 labeled records from both classes.")
    return features, labels


def score_binary_predictions(labels: np.ndarray, probabilities: np.ndarray) -> dict[str, float]:
    predictions = (probabilities >= 0.5).astype(int)
    metrics = {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "brierScore": float(brier_score_loss(labels, probabilities)),
    }
    metrics["rocAuc"] = float(roc_auc_score(labels, probabilities))
    return metrics


def make_clinical_model(labels: np.ndarray, seed: int) -> CalibratedClassifierCV:
    counts = Counter(labels)
    minority_count = min(counts.values())
    imbalance_ratio = max(counts.values()) / minority_count
    steps: list[tuple[str, Any]] = [
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("outlier_clipper", QuantileClipper()),
    ]
    if imbalance_ratio >= 1.5 and minority_count > 3:
        steps.append(("smote", SMOTE(random_state=seed, k_neighbors=min(5, minority_count - 1))))
    steps.append((
        "classifier",
        RandomForestClassifier(
            n_estimators=150,
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=seed,
        ),
    ))
    pipeline = Pipeline(steps)
    return CalibratedClassifierCV(
        estimator=pipeline,
        method="sigmoid",
        cv=StratifiedKFold(n_splits=3, shuffle=True, random_state=seed),
        ensemble=True,
        n_jobs=1,
    )


def train_clinical_model(
    archive_path: Path,
    output_dir: Path,
    folds: int,
) -> dict[str, Any]:
    features, labels = read_clinical_data(archive_path)
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    models = []
    out_of_fold = np.zeros(len(labels), dtype=np.float64)

    for fold, (train_indices, test_indices) in enumerate(splitter.split(features, labels), start=1):
        model = make_clinical_model(labels[train_indices], SEED + fold)
        model.fit(features.iloc[train_indices], labels[train_indices])
        out_of_fold[test_indices] = model.predict_proba(features.iloc[test_indices])[:, 1]
        models.append(model)
        print(f"Clinical fold {fold}/{folds} complete.")

    artifact = {
        "models": models,
        "feature_columns": CLINICAL_COLUMNS,
        "feature_names": CLINICAL_FEATURE_NAMES,
        "model_version": "clinical-random-forest-calibrated-5fold-v1",
        "metrics": score_binary_predictions(labels, out_of_fold),
        "records": int(len(labels)),
        "labelCounts": {str(label): int(count) for label, count in Counter(labels).items()},
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, output_dir / "clinical_ensemble.joblib")
    return artifact


def get_image_records(archive_path: Path) -> list[tuple[str, int]]:
    records: list[tuple[str, int]] = []
    content_hash_labels: dict[str, int] = {}
    with zipfile.ZipFile(archive_path) as archive:
        for name in archive.namelist():
            posix_path = PurePosixPath(name)
            if posix_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            label = LABEL_DIRECTORIES.get(posix_path.parent.name.lower())
            if label is None:
                continue
            raw_image = archive.read(name)
            try:
                with Image.open(BytesIO(raw_image)) as image:
                    if image.width > 4096 or image.height > 4096:
                        raise ValueError("Image dimensions exceed the accepted limit.")
                    image.verify()
            except (OSError, ValueError) as error:
                raise ValueError(f"Unreadable image in dataset archive: {name}") from error
            content_hash = hashlib.sha256(raw_image).hexdigest()
            previous_label = content_hash_labels.get(content_hash)
            if previous_label is not None:
                if previous_label != label:
                    raise ValueError("Identical image content has conflicting class-folder labels.")
                continue
            content_hash_labels[content_hash] = label
            records.append((name, label))

    class_counts = Counter(label for _, label in records)
    if len(class_counts) != 2 or min(class_counts.values()) < 5:
        raise ValueError(
            "Image ZIP must contain at least five unique images under each "
            "'infected' and 'noninfected' class folder."
        )
    return records


class ZipImageDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        archive_path: Path,
        records: list[tuple[str, int]],
        indices: np.ndarray,
        augment: bool,
    ) -> None:
        self.archive = zipfile.ZipFile(archive_path)
        self.records = [records[int(index)] for index in indices]
        self.augment = augment

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        filename, label = self.records[index]
        image_bytes = self.archive.read(filename)
        image = training_tensor(image_bytes, augment=self.augment)
        return image, torch.tensor(label, dtype=torch.long)

    def close(self) -> None:
        self.archive.close()


def collect_logits(
    model: AttentionCNN,
    loader: DataLoader,
    device: torch.device,
    criterion: nn.Module | None = None,
) -> tuple[np.ndarray, np.ndarray, float]:
    logits_batches = []
    label_batches = []
    loss_total = 0.0
    batch_count = 0
    model.eval()
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            if criterion is not None:
                loss_total += float(criterion(logits, labels).item())
                batch_count += 1
            logits_batches.append(logits.cpu().numpy())
            label_batches.append(labels.cpu().numpy())
    mean_loss = loss_total / max(batch_count, 1)
    return np.concatenate(logits_batches), np.concatenate(label_batches), mean_loss


def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    tensor_logits = torch.tensor(logits, dtype=torch.float64)
    tensor_labels = torch.tensor(labels, dtype=torch.long)

    def negative_log_likelihood(temperature: float) -> float:
        scaled = tensor_logits / temperature
        return float(nn.functional.cross_entropy(scaled, tensor_labels).item())

    result = minimize_scalar(
        negative_log_likelihood,
        bounds=(0.05, 10.0),
        method="bounded",
        options={"xatol": 0.01},
    )
    return float(result.x)


def train_image_model(
    archive_path: Path,
    output_dir: Path,
    folds: int,
    epochs: int,
    batch_size: int,
) -> dict[str, Any]:
    records = get_image_records(archive_path)
    labels = np.asarray([label for _, label in records], dtype=np.int64)
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    probabilities = np.zeros(len(labels), dtype=np.float64)
    output_dir.mkdir(parents=True, exist_ok=True)

    for fold, (train_indices, test_indices) in enumerate(splitter.split(np.zeros(len(labels)), labels)):
        fold_number = fold + 1
        train_indices, validation_indices = train_test_split(
            train_indices,
            test_size=0.1,
            random_state=SEED + fold_number,
            stratify=labels[train_indices],
        )
        train_dataset = ZipImageDataset(archive_path, records, train_indices, augment=True)
        validation_dataset = ZipImageDataset(archive_path, records, validation_indices, augment=False)
        test_dataset = ZipImageDataset(archive_path, records, test_indices, augment=False)
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
        validation_loader = DataLoader(validation_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
        test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, num_workers=0)

        torch.manual_seed(SEED + fold_number)
        model = AttentionCNN().to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)
        train_class_counts = np.bincount(labels[train_indices], minlength=2)
        class_weights = len(train_indices) / (2 * train_class_counts)
        criterion = nn.CrossEntropyLoss(
            weight=torch.tensor(class_weights, dtype=torch.float32, device=device)
        )
        best_state = None
        best_validation_loss = float("inf")
        patience = 2
        epochs_without_improvement = 0

        for epoch in range(epochs):
            model.train()
            for images, batch_labels in train_loader:
                images = images.to(device)
                batch_labels = batch_labels.to(device)
                optimizer.zero_grad(set_to_none=True)
                loss = criterion(model(images), batch_labels)
                loss.backward()
                optimizer.step()

            _, _, validation_loss = collect_logits(model, validation_loader, device, criterion)
            if validation_loss < best_validation_loss:
                best_validation_loss = validation_loss
                best_state = {
                    key: value.detach().cpu().clone()
                    for key, value in model.state_dict().items()
                }
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1
                if epochs_without_improvement >= patience:
                    break
            print(
                f"Image fold {fold_number}/{folds}, "
                f"epoch {epoch + 1}/{epochs}, validation loss {validation_loss:.4f}."
            )

        if best_state is None:
            train_dataset.close()
            validation_dataset.close()
            test_dataset.close()
            raise RuntimeError(f"Image model fold {fold_number} did not produce a trained checkpoint.")
        model.load_state_dict(best_state)
        calibration_logits, calibration_labels, _ = collect_logits(model, validation_loader, device)
        temperature = fit_temperature(calibration_logits, calibration_labels)
        test_logits, observed_test_labels, _ = collect_logits(model, test_loader, device)
        if not np.array_equal(observed_test_labels, labels[test_indices]):
            raise RuntimeError(f"Image fold {fold_number} produced unexpected validation labels.")
        scaled_logits = torch.tensor(test_logits) / temperature
        fold_probabilities = torch.softmax(scaled_logits, dim=1)[:, 1].numpy()
        probabilities[test_indices] = fold_probabilities
        torch.save(
            {
                "state_dict": best_state,
                "temperature": temperature,
                "image_size": IMAGE_SIZE,
                "model_version": "ultrasound-cnn-attention-5fold-v1",
                "fold": fold_number,
            },
            output_dir / f"image_fold_{fold_number - 1}.pt",
        )
        train_dataset.close()
        validation_dataset.close()
        test_dataset.close()
        print(f"Image fold {fold_number}/{folds} complete.")

    return {
        "modelVersion": "ultrasound-cnn-attention-5fold-v1",
        "recordsAfterExactDeduplication": int(len(records)),
        "labelCounts": {str(label): int(count) for label, count in Counter(labels).items()},
        "metrics": score_binary_predictions(labels, probabilities),
    }


def main() -> None:
    args = parse_args()
    validate_args(args)
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    clinical_artifact = train_clinical_model(args.clinical_archive, args.output_dir, args.folds)
    print("Clinical cross-validation metrics:", json.dumps(clinical_artifact["metrics"], indent=2))
    image_report = train_image_model(
        args.image_archive,
        args.output_dir,
        args.folds,
        args.image_epochs,
        args.batch_size,
    )
    report = {
        "clinical": {
            "modelVersion": clinical_artifact["model_version"],
            "records": clinical_artifact["records"],
            "labelCounts": clinical_artifact["labelCounts"],
            "metrics": clinical_artifact["metrics"],
        },
        "ultrasound": image_report,
        "limitations": [
            "The clinical and ultrasound datasets are not linked to the same people.",
            "Model outputs must remain separate; no patient-level fusion is trained or reported.",
            "This research software is not a clinical diagnostic device.",
        ],
    }
    (args.output_dir / "training_metrics.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    print("Ultrasound cross-validation metrics:", json.dumps(image_report["metrics"], indent=2))
    print(f"Trained model files and metrics saved under {args.output_dir.resolve()}.")


if __name__ == "__main__":
    main()
