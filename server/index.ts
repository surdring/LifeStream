import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { z } from 'zod';
import { loadConfig } from './config';
import { createPool, initSchema } from './db';
import { generateCuesWithConfiguredLLM, generateReportWithConfiguredLLM } from './llm';
import { ReportType } from '../types';
import { stripThinkingFromReport } from '../shared/reportPrompt';

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function main() {
  const config = await loadConfig();

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

    try {
      const logsResult = await pool.query(
        `SELECT id, timestamp_ms, content, tags FROM logs WHERE date_key >= $1 AND date_key <= $2 ORDER BY timestamp_ms ASC`,
        [periodStart, periodEnd]
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

    try {
      const { rows } = await pool.query(
        `UPDATE reports
         SET content = $2, created_at_ms = $3
         WHERE id = $1
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [id, content, createdAt]
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

  app.get('/api/logs', async (req, res) => {
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;

    if ((start && !isIsoDate(start)) || (end && !isIsoDate(end))) {
      res.status(400).json({ error: 'Invalid start/end date format. Expected YYYY-MM-DD.' });
      return;
    }

    try {
      const queryParts: string[] = [];
      const params: any[] = [];

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

    try {
      const { rows } = await pool.query(
        `INSERT INTO logs (id, date_key, timestamp_ms, content, tags)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id)
         DO UPDATE SET date_key = EXCLUDED.date_key, timestamp_ms = EXCLUDED.timestamp_ms, content = EXCLUDED.content, tags = EXCLUDED.tags
         RETURNING id, to_char(date_key, 'YYYY-MM-DD') AS date_key, timestamp_ms, content, tags`,
        [id, dateKey, timestamp, content, JSON.stringify(tags)]
      );

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

    try {
      const { rows } = await pool.query(
        `UPDATE logs SET content = $2 WHERE id = $1 RETURNING id, to_char(date_key, 'YYYY-MM-DD') AS date_key, timestamp_ms, content, tags`,
        [id, parsed.data.content]
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

    try {
      const result = await pool.query(`DELETE FROM logs WHERE id = $1`, [id]);
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

    if (type && !Object.values(ReportType).includes(type as ReportType)) {
      res.status(400).json({ error: 'Invalid report type.' });
      return;
    }

    try {
      const params: any[] = [];
      let where = '';
      if (type) {
        params.push(type);
        where = `WHERE type = $1`;
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

    try {
      const inserted = await pool.query(
        `INSERT INTO reports (id, type, period_start, period_end, content, created_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [id, type, periodStart, periodEnd, content, createdAt]
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
        `SELECT id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms FROM reports WHERE type = $1 AND period_start = $2 AND period_end = $3`,
        [type, periodStart, periodEnd]
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

    if (type === ReportType.DAILY && periodStart !== periodEnd) {
      res.status(400).json({ error: 'Daily report must have the same periodStart and periodEnd.' });
      return;
    }

    try {
      const existing = await pool.query(
        `SELECT id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms FROM reports WHERE type = $1 AND period_start = $2 AND period_end = $3`,
        [type, periodStart, periodEnd]
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
        `SELECT id, timestamp_ms, content, tags FROM logs WHERE date_key >= $1 AND date_key <= $2 ORDER BY timestamp_ms ASC`,
        [periodStart, periodEnd]
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
        `INSERT INTO reports (id, type, period_start, period_end, content, created_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (type, period_start, period_end)
         DO UPDATE SET content = EXCLUDED.content, created_at_ms = EXCLUDED.created_at_ms
         RETURNING id, type, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, content, created_at_ms`,
        [desiredId, type, periodStart, periodEnd, content, createdAt]
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

  const port = config.server.port;
  const host = config.server.host;

  app.listen(port, host, () => {
    console.log(`LifeStream local backend listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
