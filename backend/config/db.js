/**
 * CampusFix — Microsoft SQL Server Database Pool Module
 * Implements resilient connection pooling, safe parameterized queries,
 * and sanitized health monitoring via node-mssql.
 */

const sql = require('mssql');
const env = require('./env');

const dbConfig = {
  server: env.DB_SERVER,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    enableArithAbort: true
  },
  pool: {
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: env.DB_CONNECTION_TIMEOUT,
  requestTimeout: env.DB_REQUEST_TIMEOUT
};

let pool = null;
let isConnecting = false;

/**
 * Returns active connection pool, connecting if not already established.
 */
async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }

  if (isConnecting) {
    // Wait briefly if connection is in progress
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (pool && pool.connected) return pool;
  }

  try {
    isConnecting = true;
    console.log(`[CampusFix DB] Connecting to SQL Server: ${dbConfig.database} on ${dbConfig.server}:${dbConfig.port}...`);
    pool = await new sql.ConnectionPool(dbConfig).connect();
    
    pool.on('error', (err) => {
      console.error('[CampusFix DB Pool Error]:', err.message);
    });

    console.log(`[CampusFix DB] Connected successfully to ${dbConfig.database}.`);
    return pool;
  } catch (err) {
    console.error('[CampusFix DB Connection Failed]:', err.message);
    pool = null;
    throw err;
  } finally {
    isConnecting = false;
  }
}

/**
 * Executes a parameterized query against the database.
 * Prevents SQL injection by enforcing input parameters.
 *
 * @param {string} queryText - The SQL statement with @parameter placeholders
 * @param {Array<{name: string, type: any, value: any}>} params - Parameter definitions
 * @returns {Promise<sql.IResult<any>>}
 */
async function executeQuery(queryText, params = []) {
  const activePool = await getPool();
  const request = activePool.request();

  if (Array.isArray(params)) {
    for (const p of params) {
      if (p.name && p.type !== undefined) {
        request.input(p.name, p.type, p.value);
      }
    }
  }

  return await request.query(queryText);
}

/**
 * Checks database health and latency without exposing credentials.
 * @returns {Promise<{healthy: boolean, latencyMs: number, error?: string}>}
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();
  try {
    const activePool = await getPool();
    const result = await activePool.request().query('SELECT 1 AS isAlive, CURRENT_TIMESTAMP AS serverTime;');
    const latencyMs = Date.now() - startTime;

    return {
      healthy: result.recordset.length > 0 && result.recordset[0].isAlive === 1,
      latencyMs,
      timestamp: result.recordset[0].serverTime
    };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: env.isProduction() 
        ? 'Database connectivity error' 
        : err.message
    };
  }
}

/**
 * Gracefully drains and closes the connection pool.
 */
async function closePool() {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('[CampusFix DB] Connection pool closed.');
    } catch (err) {
      console.error('[CampusFix DB Error closing pool]:', err.message);
    }
  }
}

module.exports = {
  sql,
  getPool,
  executeQuery,
  checkDatabaseHealth,
  closePool,
  dbConfig: {
    server: dbConfig.server,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user
    // Password and secrets deliberately excluded from export
  }
};
