import io
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from fastapi import HTTPException
from PIL import Image

from backend import main as inference_service
from backend.ml.image_model import AttentionCNN, gradcam_plus_plus_png, preprocess_image
from backend.ml.train import (
    CLINICAL_COLUMNS,
    get_image_records,
    read_clinical_data,
    train_image_model,
)
from backend.main import ClinicalFeatures


def encoded_image(value: int) -> bytes:
    image = Image.new("L", (48, 48), color=value)
    data = io.BytesIO()
    image.save(data, format="PNG")
    return data.getvalue()


class DatasetPipelineTests(unittest.TestCase):
    def test_clinical_loader_reads_nested_excel_without_patient_ids(self) -> None:
        rows = []
        for index in range(50):
            row = {column: float(index + 1) for column in CLINICAL_COLUMNS}
            row["PCOS_Diagnosis"] = index % 2
            rows.append(row)
        workbook = io.BytesIO()
        pd.DataFrame(rows).to_excel(workbook, index=False)

        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "clinical.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("PCOS Dataset.xlsx", workbook.getvalue())
            features, labels = read_clinical_data(archive_path)

        self.assertEqual(features.shape, (50, len(CLINICAL_COLUMNS)))
        self.assertEqual(set(np.unique(labels)), {0, 1})

    def test_image_loader_uses_class_folders_and_deduplicates_exact_images(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "images.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                for class_name in ("infected", "noninfected"):
                    for index in range(6):
                        archive.writestr(
                            f"PCOS/{class_name}/Image_{index}.png",
                            encoded_image(10 + index + (100 if class_name == "infected" else 0)),
                        )
                    archive.writestr(
                        f"PCOS/{class_name}/duplicate.png",
                        encoded_image(10 + (100 if class_name == "infected" else 0)),
                    )
            records = get_image_records(archive_path)

        self.assertEqual(len(records), 12)
        self.assertEqual({label for _, label in records}, {0, 1})

    def test_attention_cnn_preprocessing_and_gradcam_output(self) -> None:
        image_bytes = encoded_image(120)
        tensor, display_image = preprocess_image(image_bytes)
        model = AttentionCNN().eval()
        logits = model(tensor.unsqueeze(0))
        overlay = gradcam_plus_plus_png(
            model,
            tensor.unsqueeze(0),
            display_image,
            positive_class=bool(torch.argmax(logits, dim=1).item()),
        )

        self.assertEqual(tuple(tensor.shape), (1, 128, 128))
        self.assertEqual(tuple(logits.shape), (1, 2))
        self.assertTrue(overlay.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_inference_service_returns_unavailable_without_model_artifacts(self) -> None:
        original_clinical = inference_service.clinical_artifact
        original_image = inference_service.image_models
        original_errors = inference_service.model_errors

        def mark_models_unavailable() -> None:
            inference_service.clinical_artifact = None
            inference_service.image_models = []
            inference_service.model_errors = {
                "clinical": "Clinical model artifacts have not been trained.",
                "image": "Ultrasound model artifacts have not been trained.",
            }

        try:
            mark_models_unavailable()
            with self.assertRaises(HTTPException) as raised:
                inference_service.predict_clinical(ClinicalFeatures(
                    age=30,
                    bmi=24.0,
                    cycleLength=28,
                    hirsutism=2,
                    homaIr=1.1,
                    lhFsh=1.0,
                    follicleCountLeft=8,
                    follicleCountRight=9,
                ))
            self.assertEqual(raised.exception.status_code, 503)
            self.assertIn("not been trained", raised.exception.detail)
        finally:
            inference_service.clinical_artifact = original_clinical
            inference_service.image_models = original_image
            inference_service.model_errors = original_errors

    def test_image_training_creates_a_calibrated_five_fold_ensemble(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive_path = root / "images.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                for class_name, offset in (("infected", 40), ("noninfected", 120)):
                    for index in range(15):
                        archive.writestr(
                            f"PCOS/{class_name}/Image_{index}.png",
                            encoded_image(offset + index),
                        )
            output_dir = root / "models"
            report = train_image_model(
                archive_path,
                output_dir,
                folds=5,
                epochs=1,
                batch_size=4,
            )

            self.assertEqual(report["recordsAfterExactDeduplication"], 30)
            self.assertEqual(len(list(output_dir.glob("image_fold_*.pt"))), 5)
            self.assertIn("rocAuc", report["metrics"])


if __name__ == "__main__":
    unittest.main()
