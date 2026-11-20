const { z } = require('zod');

const clinicalInputSchema = z.object({
  age: z.number().int().min(10).max(70),
  bmi: z.number().min(10).max(70),
  cycleLength: z.number().int().min(10).max(120),
  hirsutism: z.number().int().min(0).max(36),
  homaIr: z.number().min(0).max(100),
  lhFsh: z.number().min(0).max(30),
  follicleCountLeft: z.number().int().min(0).max(100),
  follicleCountRight: z.number().int().min(0).max(100),
});

async function readModelResponse(response, modelName) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `${modelName} inference is unavailable.`);
    error.status = response.status === 503 ? 503 : 502;
    throw error;
  }
  return payload;
}

function isServiceUnavailable(error) {
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || error.code === 'ECONNREFUSED'
    || error.cause?.code === 'ECONNREFUSED';
}

async function runClinicalInference(clinicalFeatures) {
  const serviceUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';
  const response = await fetch(`${serviceUrl}/v1/predict/clinical`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clinicalFeatures),
    signal: AbortSignal.timeout(120_000),
  });
  return readModelResponse(response, 'Clinical model');
}

async function runImageInference(image, contentType) {
  const serviceUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';
  const payload = new FormData();
  payload.append('image', new Blob([image], { type: contentType }), 'ultrasound');
  const response = await fetch(`${serviceUrl}/v1/predict/image`, {
    method: 'POST',
    body: payload,
    signal: AbortSignal.timeout(120_000),
  });
  return readModelResponse(response, 'Ultrasound model');
}

module.exports = {
  clinicalInputSchema,
  runClinicalInference,
  runImageInference,
  isServiceUnavailable,
};
