import { AIReport, LogEntry, ReportType } from '../types';
export { buildReportSystemInstruction } from '../shared/reportPrompt';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const resp = await fetch(input, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (resp.status === 204) {
    return undefined as T;
  }

  const text = await resp.text();
  let data: any = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!resp.ok) {
    const msg = data?.error || text || resp.statusText || 'Request failed';
    throw new Error(msg);
  }

  return data as T;
}

export type ApiLogEntry = LogEntry & { dateKey: string };

export async function listLogs(params?: { start?: string; end?: string }): Promise<ApiLogEntry[]> {
  const qs = new URLSearchParams();
  if (params?.start) qs.set('start', params.start);
  if (params?.end) qs.set('end', params.end);
  const url = qs.toString() ? `/api/logs?${qs.toString()}` : '/api/logs';
  return request(url);
}

export async function createLog(payload: {
  id?: string;
  dateKey: string;
  timestamp: number;
  content: string;
  tags: string[];
}): Promise<ApiLogEntry> {
  return request('/api/logs', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateLog(id: string, payload: { content: string }): Promise<ApiLogEntry> {
  return request(`/api/logs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteLog(id: string): Promise<void> {
  await request(`/api/logs/${id}`, { method: 'DELETE' });
}

export async function listReports(params?: { type?: ReportType }): Promise<AIReport[]> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  const url = qs.toString() ? `/api/reports?${qs.toString()}` : '/api/reports';
  return request(url);
}

export async function createReport(payload: {
  id?: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  content: string;
  createdAt?: number;
}): Promise<AIReport> {
  return request('/api/reports', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateReport(id: string, payload: { content: string }): Promise<AIReport> {
  return request(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function generateReport(payload: {
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  language: 'en' | 'zh';
  periodName?: string;
  force?: boolean;
}): Promise<AIReport> {
  return request('/api/reports/generate', { method: 'POST', body: JSON.stringify(payload) });
}

export async function generateCues(payload: {
  periodStart: string;
  periodEnd: string;
  language: 'en' | 'zh';
  periodName?: string;
}): Promise<{ content: string }> {
  return request('/api/cues/generate', { method: 'POST', body: JSON.stringify(payload) });
}
