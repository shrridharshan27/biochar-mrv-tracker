const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const { getDB } = require('./db');

/**
 * Creates and configures the Express application.
 * @param {object} [options]
 * @param {import('better-sqlite3').Database} [options.db] - Optional custom DB instance (useful for testing)
 * @returns {express.Express}
 */
function createApp(options = {}) {
  const app = express();

  // Attach database to app.locals
  app.locals.db = options.db || getDB();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Mount API routes
  app.use('/api', routes);

  // Static assets and SPA serving for client build (production)
  const potentialDistPaths = [
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../client/dist')
  ];

  const distPath = potentialDistPaths.find((p) => fs.existsSync(p));

  if (distPath) {
    app.use(express.static(distPath));

    app.get('*', (req, res, next) => {
      // Do not intercept API requests
      if (req.path.startsWith('/api')) {
        return next();
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  // Fallback 404 for unhandled API requests
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}

const defaultApp = createApp();

module.exports = defaultApp;
module.exports.createApp = createApp;
