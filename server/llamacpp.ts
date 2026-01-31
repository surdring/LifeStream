import type { AppConfig } from './config';
import type { LogEntry, ReportType } from '../types';
import { buildReportSystemInstruction, stripThinkingFromReport } from '../shared/reportPrompt';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function formatLogsForPrompt(logs: LogEntry[], locale: string): string {
  return logs
    .map((log) => {
      const date = new Date(log.timestamp).toLocaleString(locale);
      return `[${date}] ${log.content}`;
    })
    .join('\n');
}

export async function generateReportWithLlamaCpp(params: {
  config: AppConfig;
  type: ReportType;
  logs: LogEntry[];
  periodName: string;
  language: 'en' | 'zh';
}): Promise<string> {
  const { config, type, logs, periodName, language } = params;

  const llamacpp = config.llamacpp;
  if (!llamacpp) {
    throw new Error('llama.cpp config is missing. Please set [llamacpp] in config.toml.');
  }

  if (logs.length === 0) {
    return 'No logs found for this period to generate a report.';
  }

  const isZh = language === 'zh';
  const locale = isZh ? 'zh-CN' : 'en-US';

  const logText = formatLogsForPrompt(logs, locale);

  const systemInstruction = buildReportSystemInstruction({ type, periodName, language });

  return chatWithLlamaCpp({
    config,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `Here are the logs for the period:\n\n${logText}` },
    ],
  });
}

export async function chatWithLlamaCpp(params: {
  config: AppConfig;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const { config, messages } = params;

  const llamacpp = config.llamacpp;
  if (!llamacpp) {
    throw new Error('llama.cpp config is missing. Please set [llamacpp] in config.toml.');
  }

  const baseUrl = llamacpp.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/v1/chat/completions`;

  const body = {
    model: llamacpp.model,
    temperature: params.temperature ?? llamacpp.temperature,
    messages,
  };

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (llamacpp.api_key) {
    headers['authorization'] = `Bearer ${llamacpp.api_key}`;
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`Failed to reach llama.cpp server at ${url}: ${err?.message || String(err)}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`llama.cpp server error (${resp.status}): ${text || resp.statusText}`);
  }

  let json: any;
  try {
    json = await resp.json();
  } catch (err: any) {
    throw new Error(`Invalid JSON response from llama.cpp server: ${err?.message || String(err)}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid response from llama.cpp server: missing generated content.');
  }

  return stripThinkingFromReport(content);
}
