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

export async function generateReportWithProvider(params: {
  config: AppConfig;
  type: ReportType;
  logs: LogEntry[];
  periodName: string;
  language: 'en' | 'zh';
}): Promise<string> {
  const { config, type, logs, periodName, language } = params;

  if (!config.provider) {
    throw new Error('Provider config is missing. Please set [provider] in config.toml.');
  }

  if (logs.length === 0) {
    return 'No logs found for this period to generate a report.';
  }

  const isZh = language === 'zh';
  const locale = isZh ? 'zh-CN' : 'en-US';

  const logText = formatLogsForPrompt(logs, locale);

  const systemInstruction = buildReportSystemInstruction({ type, periodName, language });

  return chatWithProvider({
    config,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `Here are the logs for the period:\n\n${logText}` },
    ],
  });
}

export async function chatWithProvider(params: {
  config: AppConfig;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const { config, messages } = params;

  if (!config.provider) {
    throw new Error('Provider config is missing. Please set [provider] in config.toml.');
  }

  const baseUrl = config.provider.base_url.replace(/\/$/, '');
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model: config.provider.model_id,
    temperature: params.temperature ?? (config.provider.temperature ?? 0.3),
    messages,
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.provider.api_key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`Failed to reach provider server at ${url}: ${err?.message || String(err)}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`provider server error (${resp.status}): ${text || resp.statusText}`);
  }

  let json: any;
  try {
    json = await resp.json();
  } catch (err: any) {
    throw new Error(`Invalid JSON response from provider server: ${err?.message || String(err)}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid response from provider server: missing generated content.');
  }

  return stripThinkingFromReport(content);
}
