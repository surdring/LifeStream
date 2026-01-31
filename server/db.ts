import { Pool } from 'pg';
import type { AppConfig } from './config';

export function createPool(config: AppConfig): Pool {
  return new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
  });
}

export async function initSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      date_key DATE NOT NULL,
      timestamp_ms BIGINT NOT NULL,
      content TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_date_key ON logs(date_key);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp_ms ON logs(timestamp_ms);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      content TEXT NOT NULL,
      created_at_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(type, period_start, period_end)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);`);
}
