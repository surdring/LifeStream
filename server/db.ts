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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      date_key DATE NOT NULL,
      timestamp_ms BIGINT NOT NULL,
      content TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE logs ADD COLUMN IF NOT EXISTS user_id TEXT;`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_date_key ON logs(date_key);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp_ms ON logs(timestamp_ms);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_user_date_key ON logs(user_id, date_key);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      content TEXT NOT NULL,
      created_at_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT;`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_user_type ON reports(user_id, type);`);

  await pool.query(
    `INSERT INTO users (id, username, password_hash, is_admin)
     VALUES ('default', 'default', '', true)
     ON CONFLICT (id) DO NOTHING;`
  );
  await pool.query(`UPDATE users SET is_admin = true WHERE id = 'default';`);
  await pool.query(`UPDATE logs SET user_id = 'default' WHERE user_id IS NULL;`);
  await pool.query(`UPDATE reports SET user_id = 'default' WHERE user_id IS NULL;`);
  await pool.query(`ALTER TABLE logs ALTER COLUMN user_id SET NOT NULL;`);
  await pool.query(`ALTER TABLE reports ALTER COLUMN user_id SET NOT NULL;`);

  await pool.query(`ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_user_id_fkey;`);
  await pool.query(`ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;`);
  await pool.query(
    `ALTER TABLE logs ADD CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );
  await pool.query(
    `ALTER TABLE reports ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );

  await pool.query(`ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_type_period_start_period_end_key;`);
  await pool.query(`ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_user_type_period_unique;`);
  await pool.query(
    `ALTER TABLE reports ADD CONSTRAINT reports_user_type_period_unique UNIQUE (user_id, type, period_start, period_end)`
  );
}
