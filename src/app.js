// executor/src/app.js
const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const analyzeRouter = require('./routes/analyze');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://sterkbouw-saas-front-production.up.railway.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/generate-pdf', require('./routes/generate-pdf'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      'GET /api/projects',
      'POST /api/projects',
      'DELETE /api/projects/:id',
      'PATCH /api/projects/:id',
      'POST /api/analyze',
      'POST /api/generate-pdf',
      'GET /health'
    ]
  });
});

module.exports = app;
