const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./app');

test('health explicitly reports a disconnected database', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: 'degraded', database: 'disconnected' });
});

test('invalid registration data is rejected before any database write', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ username: 'x', password: 'short' });
  assert.equal(response.status, 422);
  assert.equal(typeof response.body.detail, 'string');
});

test('doctor registration is disabled unless an invitation key is configured', async () => {
  const originalKey = process.env.DOCTOR_REGISTRATION_KEY;
  delete process.env.DOCTOR_REGISTRATION_KEY;
  try {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        role: 'Doctor',
        username: 'clinician',
        email: 'clinician@example.test',
        password: 'long-enough-password',
      });
    assert.equal(response.status, 403);
    assert.match(response.body.detail, /invitation key/i);
  } finally {
    if (originalKey === undefined) delete process.env.DOCTOR_REGISTRATION_KEY;
    else process.env.DOCTOR_REGISTRATION_KEY = originalKey;
  }
});

test('diagnosis history requires authentication', async () => {
  const response = await request(app).get('/api/diagnoses');
  assert.equal(response.status, 401);
});

test('model readiness endpoint is explicit when the inference service is not running', async () => {
  const originalUrl = process.env.ML_SERVICE_URL;
  const originalFetch = global.fetch;
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:8001';
  global.fetch = async () => {
    const cause = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    throw Object.assign(new TypeError('fetch failed'), { cause });
  };
  try {
    const response = await request(app).get('/api/models/health');
    assert.equal(response.status, 503);
    assert.equal(response.body.clinicalModelReady, false);
    assert.equal(response.body.imageModelReady, false);
  } finally {
    if (originalUrl === undefined) delete process.env.ML_SERVICE_URL;
    else process.env.ML_SERVICE_URL = originalUrl;
    global.fetch = originalFetch;
  }
});

test('unknown API paths return JSON 404 responses', async () => {
  const response = await request(app).get('/api/unknown');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { detail: 'API endpoint not found.' });
});
