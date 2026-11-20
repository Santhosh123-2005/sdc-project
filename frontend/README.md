# PCOS Explainable AI Diagnosis Frontend

This folder contains a lightweight frontend prototype for a web application that supports multimodal PCOS diagnosis using clinical data and imaging input.

## Included files

- `index.html` - main single-page interface for data input, results, and explainability.
- `styles.css` - responsive styling for the dashboard and cards.
- `app.js` - frontend behavior, form handling, simulated diagnosis flow, and report generation.

## Features

- Clinical feature submission form
- Ultrasound image upload preview
- Simulated hierarchical diagnosis results
- SHAP-style feature importance panel
- Grad-CAM++ explanation placeholder
- Clinician-friendly report generation

## Running locally

1. Open `index.html` in a browser.
2. Fill the clinical fields and upload an ultrasound image.
3. Click `Run Diagnosis` to see the simulated multimodal results.

## Next steps

- Connect frontend to a backend API endpoint for real model inference.
- Replace simulated results with actual model outputs from the PCOS diagnosis engine.
- Add real Grad-CAM++ overlay rendering and SHAP plot visualizations.
