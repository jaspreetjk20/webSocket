const { Pool } = require('pg');

// TimescaleDB Connection Configuration
// TimescaleDB is built on PostgreSQL, so we use the pg library
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;
