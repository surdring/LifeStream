export interface LogEntry {
  id: string;
  timestamp: number;
  content: string;
  tags: string[];
}

export interface DayLog {
  date: string; // ISO Date String YYYY-MM-DD
  entries: LogEntry[];
}

export interface Todo {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  updatedAt?: number;
}

export enum ReportType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export interface AIReport {
  id: string;
  type: ReportType;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  content: string;     // Markdown content
  createdAt: number;
}

export interface AppState {
  logs: Record<string, LogEntry[]>; // Key is YYYY-MM-DD
  reports: AIReport[];
  todos: Todo[];
}