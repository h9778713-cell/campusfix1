/**
 * CampusFix — Application Server Entrypoint
 * Stage 4: Authentication, Authorization, & Microsoft SQL Server Integration
 */

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { getPool, closePool } = require('./config/db');
const { helmetMiddleware, corsMiddleware, generalLimiter } = require('./middleware/security');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const logger = require('./utils/logger');

const app = express();

// 1. HTTP Request Logger
if (env.isDevelopment()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 2. Security Middlewares
app.use(helmetMiddleware);
app.use(corsMiddleware);

// 3. Cookie Parser Middleware
app.use(cookieParser());

// 4. Body Parsers with strict size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Rate Limiting on API endpoints
app.use(env.API_PREFIX, generalLimiter);

// 6. Static Frontend Assets Serving
const publicPath = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(publicPath, { extensions: ['html'] }));

// 7. Mount Master API Router
app.use(env.API_PREFIX, apiRoutes);

// 8. Undefined Route Handler (404)
app.use(notFoundHandler);

// 9. Centralized Global Error Handler
app.use(errorHandler);

// Server Lifecycle Management
let serverInstance = null;

async function startServer() {
  try {
    // 0. Validate production secrets & configuration
    env.validateProductionSecrets();

    // Verify database connection on startup
    logger.info(`Starting CampusFix server in [${env.NODE_ENV}] mode...`);
    await getPool();
    logger.info(`Database connectivity verified: ${env.DB_NAME} on ${env.DB_SERVER}:${env.DB_PORT}`);

    // Start HTTP listener
    serverInstance = app.listen(env.PORT, () => {
      logger.info(`=======================================================`);
      logger.info(`CampusFix Server listening on http://localhost:${env.PORT}`);
      logger.info(`Health check:   http://localhost:${env.PORT}/api/health`);
      logger.info(`DB Health check: http://localhost:${env.PORT}/api/health/db`);
      logger.info(`Auth endpoints: http://localhost:${env.PORT}/api/auth`);
      logger.info(`=======================================================`);
    });

    serverInstance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use. Please configure a different PORT in .env.`);
      } else {
        logger.error('HTTP Server Error:', err);
      }
      process.exit(1);
    });

  } catch (err) {
    logger.error('Fatal initialization error during server bootstrap:', err);
    serverInstance = app.listen(env.PORT, () => {
      logger.warn(`Server started in DEGRADED mode on port ${env.PORT} (Database unavailable)`);
    });
  }
}

// Graceful Shutdown Handlers
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Commencing graceful shutdown...`);

  if (serverInstance) {
    serverInstance.close(async () => {
      logger.info('HTTP server closed.');
      await closePool();
      logger.info('CampusFix shutdown complete.');
      process.exit(0);
    });
  } else {
    await closePool();
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server if executed directly
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer
};
