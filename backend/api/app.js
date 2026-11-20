const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('node:path');
const apiRoutes = require('./routes');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '24kb' }));
app.use('/api', apiRoutes);
app.use('/api', (_req, res) => {
  res.status(404).json({ detail: 'API endpoint not found.' });
});

const frontendBuild = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendBuild, { index: false }));
app.get('*path', (_req, res, next) => {
  res.sendFile(path.join(frontendBuild, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof require('multer').MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ detail: error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 8 MB or smaller.' : error.message });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(`Request failed: ${error.message}`);
  res.status(status).json({
    detail: status >= 500 ? 'The request could not be completed. Check the API and model service logs.' : error.message,
  });
});

module.exports = app;
