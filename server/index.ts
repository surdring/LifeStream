import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { loadConfig } from './config';
import { createPool, initSchema } from './db';
import { generateCuesWithConfiguredLLM, generateReportWithConfiguredLLM } from './llm';
import { ReportType } from '../types';
import { stripThinkingFromReport } from '../shared/reportPrompt';

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type AuthUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

async function main() {
  const config = await loadConfig();

  const jwtSecret = config.auth?.jwt_secret;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error(
      'Missing auth.jwt_secret. Please set [auth].jwt_secret in config.toml (min length 16) or set env LIFESTREAM_JWT_SECRET.'
    );
  }

  const pool = createPool(config);
  try {
    await initSchema(pool);
  } catch (err: any) {
    if (err?.code === '3D000') {
      throw new Error(
        `Postgres database "${config.postgres.database}" does not exist. Create it (e.g. createdb -h ${config.postgres.host} -p ${config.postgres.port} -U ${config.postgres.user} ${config.postgres.database}) or update [postgres].database in config.toml to an existing database.`
      );
    }
    throw err;
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const signToken = (u: AuthUser): string => {
    return jwt.sign({ sub: u.id, username: u.username, isAdmin: u.isAdmin }, jwtSecret, {
      expiresIn: '30d',
    });
  };

  const getUserFromAuthHeader = async (req: express.Request): Promise<AuthUser | null> => {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const token = m[1];

    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch {
      return null;
    }

    const userId = typeof decoded?.sub === 'string' ? decoded.sub : undefined;
    if (!userId) return null;

    const { rows } = await pool.query(`SELECT id, username, is_admin FROM users WHERE id = $1`, [userId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      username: String(r.username),
      isAdmin: Boolean(r.is_admin),
    };
  };

  app.get('/api/auth/status', async (req, res) => {
    try {
      const [{ rows: countRows }, { rows: defaultRows }] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS cnt FROM users`),
        pool.query(`SELECT id, password_hash FROM users WHERE id = 'default'`),
      ]);

      const usersCount = Number(countRows?.[0]?.cnt ?? 0);
      const defaultPasswordHash = defaultRows.length > 0 ? String(defaultRows[0].password_hash ?? '') : '';
      const needsBootstrap = usersCount === 1 && defaultRows.length > 0 && defaultPasswordHash.trim() === '';

      const user = await getUserFromAuthHeader(req);
      res.status(200).json({ needsBootstrap, user });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get('/api/todos', async (req, res) => {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = String(user.id);
    try {
      const { rows } = await pool.query(
        `SELECT id, content, completed, created_at_ms, updated_at_ms
         FROM todos
         WHERE user_id = $1
         ORDER BY created_at_ms DESC`,
        [userId]
      );

      res.status(200).json(
        rows.map((r) => ({
          id: String(r.id),
          content: String(r.content),
          completed: Boolean(r.completed),
          createdAt: Number(r.created_at_ms),
          updatedAt: Number(r.updated_at_ms),
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/todos', async (req, res) => {
    const schema = z.object({
      id: z.string().min(1).optional(),
      content: z.string().min(1),
      completed: z.boolean().optional(),
      createdAt: z.number().int().nonnegative().optional(),
      updatedAt: z.number().int().nonnegative().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = String(user.id);
    const id = parsed.data.id ?? crypto.randomUUID();
    const createdAt = parsed.data.createdAt ?? Date.now();
    const updatedAt = parsed.data.updatedAt ?? createdAt;
    const completed = parsed.data.completed ?? false;
    const content = parsed.data.content;

    try {
      const { rows } = await pool.query(
        `INSERT INTO todos (id, user_id, content, completed, created_at_ms, updated_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id)
         DO UPDATE SET content = EXCLUDED.content, completed = EXCLUDED.completed, updated_at_ms = EXCLUDED.updated_at_ms
         WHERE todos.user_id = EXCLUDED.user_id
         RETURNING id, content, completed, created_at_ms, updated_at_ms`,
        [id, userId, content, completed, createdAt, updatedAt]
      );

      if (rows.length === 0) {
        res.status(409).json({ error: 'Todo id conflict.' });
        return;
      }

      const r = rows[0];
      res.status(201).json({
        id: String(r.id),
        content: String(r.content),
        completed: Boolean(r.completed),
        createdAt: Number(r.created_at_ms),
        updatedAt: Number(r.updated_at_ms),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.put('/api/todos/:id', async (req, res) => {
    const schema = z.object({
      content: z.string().min(1).optional(),
      completed: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const id = req.params.id;
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = String(user.id);
    const updatedAt = Date.now();

    try {
      const { rows } = await pool.query(
        `UPDATE todos
         SET content = COALESCE($1, content),
             completed = COALESCE($2, completed),
             updated_at_ms = $3
         WHERE id = $4 AND user_id = $5
         RETURNING id, content, completed, created_at_ms, updated_at_ms`,
        [parsed.data.content ?? null, typeof parsed.data.completed === 'boolean' ? parsed.data.completed : null, updatedAt, id, userId]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Todo not found.' });
        return;
      }

      const r = rows[0];
      res.status(200).json({
        id: String(r.id),
        content: String(r.content),
        completed: Boolean(r.completed),
        createdAt: Number(r.created_at_ms),
        updatedAt: Number(r.updated_at_ms),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.delete('/api/todos/:id', async (req, res) => {
    const id = req.params.id;
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = String(user.id);

    try {
      const result = await pool.query(`DELETE FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Todo not found.' });
        return;
      }
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(6),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { username, password } = parsed.data;

    try {
      const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users`);
      const usersCount = Number(countRows?.[0]?.cnt ?? 0);

      const { rows: defaultRows } = await pool.query(`SELECT id, password_hash FROM users WHERE id = 'default'`);
      const defaultPasswordHash = defaultRows.length > 0 ? String(defaultRows[0].password_hash ?? '') : '';

      if (!(usersCount === 1 && defaultRows.length > 0 && defaultPasswordHash.trim() === '')) {
        res.status(403).json({ error: 'Bootstrap is disabled after initial setup.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `UPDATE users
         SET username = $1, password_hash = $2, is_admin = true
         WHERE id = 'default' AND (password_hash = '' OR password_hash IS NULL)
         RETURNING id, username, is_admin`,
        [username, passwordHash]
      );

      if (result.rows.length === 0) {
        res.status(403).json({ error: 'Bootstrap is disabled after initial setup.' });
        return;
      }

      const u: AuthUser = {
        id: String(result.rows[0].id),
        username: String(result.rows[0].username),
        isAdmin: Boolean(result.rows[0].is_admin),
      };

      res.status(200).json({ token: signToken(u), user: u });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('unique')) {
        res.status(409).json({ error: 'Username already exists.' });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { username, password } = parsed.data;
    try {
      const { rows } = await pool.query(
        `SELECT id, username, password_hash, is_admin FROM users WHERE username = $1`,
        [username]
      );
      if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }
      const r = rows[0];
      const passwordHash = String(r.password_hash ?? '');
      if (passwordHash.trim() === '') {
        res.status(403).json({ error: 'User is not initialized. Please bootstrap first.' });
        return;
      }

      const ok = await bcrypt.compare(password, passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      const u: AuthUser = {
        id: String(r.id),
        username: String(r.username),
        isAdmin: Boolean(r.is_admin),
      };
      res.status(200).json({ token: signToken(u), user: u });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(200).json({ user });
  });

  app.post('/api/auth/register', async (req, res) => {
    const admin = await getUserFromAuthHeader(req);
    if (!admin) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!admin.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(6),
      isAdmin: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { username, password, isAdmin } = parsed.data;
    try {
      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users (id, username, password_hash, is_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, is_admin`,
        [id, username, passwordHash, Boolean(isAdmin)]
      );
      const r = rows[0];
      res.status(201).json({
        id: String(r.id),
        username: String(r.username),
        isAdmin: Boolean(r.is_admin),
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('unique')) {
        res.status(409).json({ error: 'Username already exists.' });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth')) {
      next();
      return;
    }

    const user = await getUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as any).user = user;
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post('/api/cues/generate', async (req, res) => {
    const schema = z.object({
      periodStart: z.string().refine(isIsoDate, 'periodStart must be YYYY-MM-DD'),
      periodEnd: z.string().refine(isIsoDate, 'periodEnd must be YYYY-MM-DD'),
      language: z.enum(['en', 'zh']),
      periodName: z.string().min(1).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { periodStart, periodEnd, language } = parsed.data;
    const userId = String((req as any).user.id);

    try {
      const logsResult = await pool.query(
        `SELECT id, timestamp_ms, content, tags FROM logs WHERE user_id = $1 AND date_key >= $2 AND date_key <= $3 ORDER BY timestamp_ms ASC`,
        [userId, periodStart, periodEnd]
      );

      const logs = logsResult.rows.map((r) => ({
        id: String(r.id),
        timestamp: Number(r.timestamp_ms),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : (r.tags ?? []),
      }));

      if (logs.length === 0) {
        res.status(400).json({ error: 'No logs found for this period.' });
        return;
      }

      const rangeText = periodStart === periodEnd ? periodStart : `${periodStart} ~ ${periodEnd}`;
      const rawPeriodName = parsed.data.periodName?.trim();
      const periodName = rawPeriodName ? (rawPeriodName.includes(rangeText) ? rawPeriodName : `${rawPeriodName} (${rangeText})`) : rangeText;

      const content = stripThinkingFromReport(
        await generateCuesWithConfiguredLLM({
          config,
          logs,
          periodName,
          language,
        })
      );

      res.status(200).json({ content });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('llama.cpp') || msg.includes('provider server')) {
        res.status(503).json({ error: msg });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.put('/api/reports/:id', async (req, res) => {
    const schema = z.object({
      content: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const id = req.params.id;
    const content = stripThinkingFromReport(parsed.data.content);
    const createdAt = Date.now();
    const userId = String((req as any).user.id);

    try {
      const { rows } = await pool.query(
        `UPDATE reports
         SET content = $2, created_at_ms = $3
         WHERE id = $1 AND user_id = $4
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [id, content, createdAt, userId]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Report not found.' });
        return;
      }

      const r = rows[0];
      res.status(200).json({
        id: String(r.id),
        type: r.type as ReportType,
        periodStart: String(r.period_start),
        periodEnd: String(r.period_end),
        content: String(r.content),
        createdAt: Number(r.created_at_ms),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.delete('/api/reports/:id', async (req, res) => {
    const id = req.params.id;
    const userId = String((req as any).user.id);

    try {
      const result = await pool.query(`DELETE FROM reports WHERE id = $1 AND user_id = $2`, [id, userId]);
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Report not found.' });
        return;
      }
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get('/api/logs', async (req, res) => {
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    const userId = String((req as any).user.id);

    if ((start && !isIsoDate(start)) || (end && !isIsoDate(end))) {
      res.status(400).json({ error: 'Invalid start/end date format. Expected YYYY-MM-DD.' });
      return;
    }

    try {
      const queryParts: string[] = [];
      const params: any[] = [userId];

      queryParts.push(`user_id = $1`);

      if (start) {
        params.push(start);
        queryParts.push(`date_key >= $${params.length}`);
      }
      if (end) {
        params.push(end);
        queryParts.push(`date_key <= $${params.length}`);
      }

      const where = queryParts.length ? `WHERE ${queryParts.join(' AND ')}` : '';

      const { rows } = await pool.query(
        `SELECT id, to_char(date_key, 'YYYY-MM-DD') AS date_key, timestamp_ms, content, tags FROM logs ${where} ORDER BY timestamp_ms ASC`,
        params
      );

      const logs = rows.map((r) => ({
        id: String(r.id),
        dateKey: String(r.date_key),
        timestamp: Number(r.timestamp_ms),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : (r.tags ?? []),
      }));

      res.status(200).json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/logs', async (req, res) => {
    const schema = z.object({
      id: z.string().min(1).optional(),
      content: z.string().min(1),
      timestamp: z.number().int().nonnegative(),
      tags: z.array(z.string()).default([]),
      dateKey: z.string().refine(isIsoDate, 'dateKey must be YYYY-MM-DD'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { content, timestamp, tags, dateKey } = parsed.data;
    const id = parsed.data.id ?? crypto.randomUUID();
    const userId = String((req as any).user.id);

    try {
      const { rows } = await pool.query(
        `INSERT INTO logs (id, user_id, date_key, timestamp_ms, content, tags)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (id)
         DO UPDATE SET date_key = EXCLUDED.date_key, timestamp_ms = EXCLUDED.timestamp_ms, content = EXCLUDED.content, tags = EXCLUDED.tags
         WHERE logs.user_id = EXCLUDED.user_id
         RETURNING id, to_char(date_key, 'YYYY-MM-DD') AS date_key, timestamp_ms, content, tags`,
        [id, userId, dateKey, timestamp, content, JSON.stringify(tags)]
      );

      if (rows.length === 0) {
        res.status(409).json({ error: 'Log id conflict.' });
        return;
      }

      const r = rows[0];
      res.status(201).json({
        id: String(r.id),
        dateKey: String(r.date_key),
        timestamp: Number(r.timestamp_ms),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : (r.tags ?? []),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.put('/api/logs/:id', async (req, res) => {
    const schema = z.object({
      content: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const id = req.params.id;
    const userId = String((req as any).user.id);

    try {
      const { rows } = await pool.query(
        `UPDATE logs SET content = $2 WHERE id = $1 AND user_id = $3 RETURNING id, to_char(date_key, 'YYYY-MM-DD') AS date_key, timestamp_ms, content, tags`,
        [id, parsed.data.content, userId]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Log not found.' });
        return;
      }

      const r = rows[0];
      res.status(200).json({
        id: String(r.id),
        dateKey: String(r.date_key),
        timestamp: Number(r.timestamp_ms),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : (r.tags ?? []),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.delete('/api/logs/:id', async (req, res) => {
    const id = req.params.id;
    const userId = String((req as any).user.id);

    try {
      const result = await pool.query(`DELETE FROM logs WHERE id = $1 AND user_id = $2`, [id, userId]);
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Log not found.' });
        return;
      }
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get('/api/reports', async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const userId = String((req as any).user.id);

    if (type && !Object.values(ReportType).includes(type as ReportType)) {
      res.status(400).json({ error: 'Invalid report type.' });
      return;
    }

    try {
      const params: any[] = [userId];
      let where = 'WHERE user_id = $1';
      if (type) {
        params.push(type);
        where = `WHERE user_id = $1 AND type = $2`;
      }

      const { rows } = await pool.query(
        `SELECT id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms FROM reports ${where} ORDER BY created_at_ms DESC`,
        params
      );

      const reports = rows.map((r) => ({
        id: String(r.id),
        type: r.type as ReportType,
        periodStart: String(r.period_start),
        periodEnd: String(r.period_end),
        content: String(r.content),
        createdAt: Number(r.created_at_ms),
      }));

      res.status(200).json(reports);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/reports', async (req, res) => {
    const schema = z.object({
      id: z.string().min(1).optional(),
      type: z.nativeEnum(ReportType),
      periodStart: z.string().refine(isIsoDate, 'periodStart must be YYYY-MM-DD'),
      periodEnd: z.string().refine(isIsoDate, 'periodEnd must be YYYY-MM-DD'),
      content: z.string().min(1),
      createdAt: z.number().int().nonnegative().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { type, periodStart, periodEnd } = parsed.data;
    const content = stripThinkingFromReport(parsed.data.content);
    const id = parsed.data.id ?? crypto.randomUUID();
    const createdAt = parsed.data.createdAt ?? Date.now();
    const userId = String((req as any).user.id);

    try {
      const inserted = await pool.query(
        `INSERT INTO reports (id, user_id, type, period_start, period_end, content, created_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, type, period_start, period_end) DO NOTHING
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [id, userId, type, periodStart, periodEnd, content, createdAt]
      );

      if (inserted.rows.length > 0) {
        const r = inserted.rows[0];
        res.status(201).json({
          id: String(r.id),
          type: r.type as ReportType,
          periodStart: String(r.period_start),
          periodEnd: String(r.period_end),
          content: String(r.content),
          createdAt: Number(r.created_at_ms),
        });
        return;
      }

      const existing = await pool.query(
        `SELECT id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms FROM reports WHERE user_id = $1 AND type = $2 AND period_start = $3 AND period_end = $4`,
        [userId, type, periodStart, periodEnd]
      );

      if (existing.rows.length > 0) {
        const r = existing.rows[0];
        res.status(200).json({
          id: String(r.id),
          type: r.type as ReportType,
          periodStart: String(r.period_start),
          periodEnd: String(r.period_end),
          content: String(r.content),
          createdAt: Number(r.created_at_ms),
        });
        return;
      }

      res.status(409).json({ error: 'Report already exists or conflicts with an existing id.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/reports/generate', async (req, res) => {
    const schema = z.object({
      type: z.nativeEnum(ReportType),
      periodStart: z.string().refine(isIsoDate, 'periodStart must be YYYY-MM-DD'),
      periodEnd: z.string().refine(isIsoDate, 'periodEnd must be YYYY-MM-DD'),
      language: z.enum(['en', 'zh']),
      periodName: z.string().min(1).optional(),
      force: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { type, periodStart, periodEnd, language } = parsed.data;
    const force = parsed.data.force ?? false;
    const userId = String((req as any).user.id);

    if (type === ReportType.DAILY && periodStart !== periodEnd) {
      res.status(400).json({ error: 'Daily report must have the same periodStart and periodEnd.' });
      return;
    }

    try {
      const existing = await pool.query(
        `SELECT id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms FROM reports WHERE user_id = $1 AND type = $2 AND period_start = $3 AND period_end = $4`,
        [userId, type, periodStart, periodEnd]
      );
      if (existing.rows.length > 0 && !force) {
        const r = existing.rows[0];
        res.status(200).json({
          id: String(r.id),
          type: r.type as ReportType,
          periodStart: String(r.period_start),
          periodEnd: String(r.period_end),
          content: String(r.content),
          createdAt: Number(r.created_at_ms),
        });
        return;
      }

      const logsResult = await pool.query(
        `SELECT id, timestamp_ms, content, tags FROM logs WHERE user_id = $1 AND date_key >= $2 AND date_key <= $3 ORDER BY timestamp_ms ASC`,
        [userId, periodStart, periodEnd]
      );

      const logs = logsResult.rows.map((r) => ({
        id: String(r.id),
        timestamp: Number(r.timestamp_ms),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : (r.tags ?? []),
      }));

      if (logs.length === 0) {
        res.status(400).json({ error: 'No logs found for this period.' });
        return;
      }

      const rangeText = type === ReportType.DAILY && periodStart === periodEnd ? periodStart : `${periodStart} ~ ${periodEnd}`;
      const rawPeriodName = parsed.data.periodName?.trim();
      const periodName = rawPeriodName
        ? (rawPeriodName.includes(rangeText) ? rawPeriodName : `${rawPeriodName} (${rangeText})`)
        : rangeText;

      const content = stripThinkingFromReport(
        await generateReportWithConfiguredLLM({
          config,
          type,
          logs,
          periodName,
          language,
          periodStart,
          periodEnd,
        })
      );

      const desiredId = existing.rows.length > 0 ? String(existing.rows[0].id) : crypto.randomUUID();
      const createdAt = Date.now();

      const upserted = await pool.query(
        `INSERT INTO reports (id, user_id, type, period_start, period_end, content, created_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, type, period_start, period_end)
         DO UPDATE SET content = EXCLUDED.content, created_at_ms = EXCLUDED.created_at_ms
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [desiredId, userId, type, periodStart, periodEnd, content, createdAt]
      );

      const r = upserted.rows[0];
      res.status(existing.rows.length > 0 ? 200 : 201).json({
        id: String(r.id),
        type: r.type as ReportType,
        periodStart: String(r.period_start),
        periodEnd: String(r.period_end),
        content: String(r.content),
        createdAt: Number(r.created_at_ms),
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('llama.cpp') || msg.includes('provider server')) {
        res.status(503).json({ error: msg });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  const port = config.server.port ?? 8787;
  const host = config.server.host ?? '127.0.0.1';

  app.listen(port, host, () => {
    console.log(`LifeStream local backend listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
