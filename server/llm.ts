import type { AppConfig } from './config';
import { ReportType, type LogEntry } from '../types';
import { chatWithLlamaCpp, generateReportWithLlamaCpp, type ChatMessage as LlamaChatMessage } from './llamacpp';
import { chatWithProvider, generateReportWithProvider, type ChatMessage as ProviderChatMessage } from './provider';
import { buildCuesSystemInstruction, stripThinkingFromReport } from '../shared/reportPrompt';

type ChatMessage = LlamaChatMessage | ProviderChatMessage;

function formatLogsForPrompt(logs: LogEntry[], locale: string): string {
  return logs
    .map((log) => {
      const date = new Date(log.timestamp).toLocaleString(locale);
      return `[${date}] ${log.content}`;
    })
    .join('\n');
}

function estimateLogsChars(logs: LogEntry[]): number {
  // Very rough heuristic: timestamp prefix + content + newline
  return logs.reduce((sum, l) => sum + (l.content?.length ?? 0) + 64, 0);
}

export async function generateCuesWithConfiguredLLM(params: {
  config: AppConfig;
  logs: LogEntry[];
  periodName: string;
  language: 'en' | 'zh';
}): Promise<string> {
  const { config, logs, periodName, language } = params;
  if (logs.length === 0) {
    throw new Error('No logs found for this period.');
  }

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const logText = formatLogsForPrompt(logs, locale);
  const systemInstruction = buildCuesSystemInstruction({ periodName, language });

  return stripThinkingFromReport(
    await chatWithConfiguredLLM({
      config,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Here are the logs for the period:\n\n${logText}` },
      ],
    })
  );
}

function dateKeyLocalFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKeyLocal(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function formatDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function groupLogsForMapReduce(params: {
  type: ReportType;
  logs: LogEntry[];
  periodStart?: string;
  periodEnd?: string;
}): Array<{ label: string; logs: LogEntry[]; ts: number }> {
  const { type, logs, periodStart, periodEnd } = params;

  if (!periodStart || !periodEnd) {
    // Fallback: group by dayKey
    const map = new Map<string, LogEntry[]>();
    for (const l of logs) {
      const key = dateKeyLocalFromTimestamp(l.timestamp);
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, arr]) => ({ label: key, logs: arr.sort((x, y) => x.timestamp - y.timestamp), ts: parseDateKeyLocal(key).getTime() }));
  }

  const start = parseDateKeyLocal(periodStart);
  const end = parseDateKeyLocal(periodEnd);

  // Pre-bucket by dayKey for stable window grouping
  const byDay = new Map<string, LogEntry[]>();
  for (const l of logs) {
    const dayKey = dateKeyLocalFromTimestamp(l.timestamp);
    const arr = byDay.get(dayKey) || [];
    arr.push(l);
    byDay.set(dayKey, arr);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.timestamp - b.timestamp);

  if (type === ReportType.DAILY) {
    // Map: single day (or date range if periodStart==periodEnd)
    const label = periodStart === periodEnd ? periodStart : `${periodStart} ~ ${periodEnd}`;
    return [{ label, logs: logs.slice().sort((a, b) => a.timestamp - b.timestamp), ts: start.getTime() }];
  }

  if (type === ReportType.WEEKLY) {
    // Map: per day
    const out: Array<{ label: string; logs: LogEntry[]; ts: number }> = [];
    for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDaysLocal(d, 1)) {
      const key = formatDateKeyLocal(d);
      const dayLogs = byDay.get(key);
      if (dayLogs && dayLogs.length > 0) {
        out.push({ label: key, logs: dayLogs, ts: d.getTime() });
      }
    }
    return out;
  }

  if (type === ReportType.MONTHLY) {
    // Map: 7-day windows aligned to periodStart
    const out: Array<{ label: string; logs: LogEntry[]; ts: number }> = [];
    for (let wStart = new Date(start); wStart.getTime() <= end.getTime(); wStart = addDaysLocal(wStart, 7)) {
      const wEnd = minDate(addDaysLocal(wStart, 6), end);
      const label = `${formatDateKeyLocal(wStart)} ~ ${formatDateKeyLocal(wEnd)}`;
      const chunk: LogEntry[] = [];
      for (let d = new Date(wStart); d.getTime() <= wEnd.getTime(); d = addDaysLocal(d, 1)) {
        const dk = formatDateKeyLocal(d);
        const dayLogs = byDay.get(dk);
        if (dayLogs && dayLogs.length > 0) chunk.push(...dayLogs);
      }
      if (chunk.length > 0) out.push({ label, logs: chunk, ts: wStart.getTime() });
    }
    return out;
  }

  if (type !== ReportType.YEARLY) {
    // Fallback: group by dayKey
    const map = new Map<string, LogEntry[]>();
    for (const l of logs) {
      const key = dateKeyLocalFromTimestamp(l.timestamp);
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, arr]) => ({ label: key, logs: arr.sort((x, y) => x.timestamp - y.timestamp), ts: parseDateKeyLocal(key).getTime() }));
  }

  // YEARLY
  // Map: by month (UTC) within period
  const outMap = new Map<string, { logs: LogEntry[]; ts: number }>();
  for (const l of logs) {
    const dt = new Date(l.timestamp);
    const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const bucket = outMap.get(ym);
    if (bucket) {
      bucket.logs.push(l);
    } else {
      const monthStart = new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0);
      outMap.set(ym, { logs: [l], ts: monthStart.getTime() });
    }
  }

  return Array.from(outMap.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .map(([ym, v]) => ({ label: ym, logs: v.logs.sort((x, y) => x.timestamp - y.timestamp), ts: v.ts }));
}

async function chatWithConfiguredLLM(params: {
  config: AppConfig;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const { config, messages, temperature } = params;
  if (config.llm.llm_provider === 'provider') {
    return chatWithProvider({ config, messages, temperature });
  }
  return chatWithLlamaCpp({ config, messages, temperature });
}

async function summarizeLogsChunk(params: {
  config: AppConfig;
  language: 'en' | 'zh';
  label: string;
  logs: LogEntry[];
}): Promise<string> {
  const { config, language, label, logs } = params;
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const formatted = logs
    .map((l) => {
      const t = new Date(l.timestamp).toLocaleString(locale);
      return `[${t}] ${l.content}`;
    })
    .join('\n');

  const system =
    language === 'zh'
      ? '你是一个严谨的助理。请把给定日志压缩成要点摘要，只输出 Markdown 无序列表（以 - 开头），不输出其他段落。每条要点尽量包含关键信息（任务/结果/进展），最多 8 条。'
      : 'You are a precise assistant. Summarize the given logs into bullet points. Output ONLY a Markdown unordered list (each line starts with -). No extra sections. Max 8 bullets.';

  const user =
    language === 'zh'
      ? `分段：${label}\n\n日志：\n${formatted}`
      : `Segment: ${label}\n\nLogs:\n${formatted}`;

  return stripThinkingFromReport(
    await chatWithConfiguredLLM({
      config,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  );
}

function chunkLogsByApproxChars(logs: LogEntry[], maxChars: number): LogEntry[][] {
  const chunks: LogEntry[][] = [];
  let current: LogEntry[] = [];
  let currentChars = 0;

  for (const l of logs) {
    const c = (l.content?.length ?? 0) + 64;
    if (current.length > 0 && currentChars + c > maxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(l);
    currentChars += c;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function summarizeGroup(params: {
  config: AppConfig;
  language: 'en' | 'zh';
  label: string;
  logs: LogEntry[];
}): Promise<string> {
  const MAX_CHARS_PER_CALL = 12000;

  const chunks = chunkLogsByApproxChars(params.logs, MAX_CHARS_PER_CALL);
  if (chunks.length === 1) {
    return summarizeLogsChunk({ ...params, logs: chunks[0] });
  }

  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const partLabel = `${params.label} #${i + 1}/${chunks.length}`;
    partials.push(await summarizeLogsChunk({ ...params, label: partLabel, logs: chunks[i] }));
  }

  const system =
    params.language === 'zh'
      ? '你是一个严谨的助理。下面是同一时间段的多段要点摘要，请合并去重为一个 Markdown 无序列表（以 - 开头），不输出其他段落，最多 10 条。'
      : 'You are a precise assistant. Merge and deduplicate the following bullet summaries into ONE Markdown unordered list. Output ONLY the list. Max 10 bullets.';

  const user =
    params.language === 'zh'
      ? `分段：${params.label}\n\n要点：\n${partials.join('\n')}`
      : `Segment: ${params.label}\n\nBullets:\n${partials.join('\n')}`;

  return stripThinkingFromReport(
    await chatWithConfiguredLLM({
      config: params.config,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  );
}

export async function generateReportWithConfiguredLLM(params: {
  config: AppConfig;
  type: ReportType;
  logs: LogEntry[];
  periodName: string;
  language: 'en' | 'zh';
  periodStart?: string;
  periodEnd?: string;
}): Promise<string> {
  const { config } = params;

  const generateDirect = async (directParams: typeof params): Promise<string> => {
    if (config.llm.llm_provider === 'provider') {
      return stripThinkingFromReport(await generateReportWithProvider(directParams));
    }

    if (!config.llamacpp) {
      throw new Error('llama.cpp config is missing. Please set [llamacpp] in config.toml.');
    }

    return stripThinkingFromReport(await generateReportWithLlamaCpp(directParams));
  };

  const DIRECT_THRESHOLD_CHARS = 18000;
  if (estimateLogsChars(params.logs) <= DIRECT_THRESHOLD_CHARS) {
    return generateDirect(params);
  }

  const groups = groupLogsForMapReduce({
    type: params.type,
    logs: params.logs,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  const summarized: LogEntry[] = [];
  for (const g of groups) {
    const summary = await summarizeGroup({
      config: params.config,
      language: params.language,
      label: g.label,
      logs: g.logs,
    });

    summarized.push({
      id: `summary:${g.label}`,
      timestamp: g.ts,
      content: `[${g.label}]\n${summary}`,
      tags: [],
    });
  }

  // Reduce step: generate final report from summarized "log stream" using the original systemInstruction.
  return generateDirect({ ...params, logs: summarized });
}
