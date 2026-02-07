import { createContext, useContext, useEffect, useState, type ReactNode, type FC } from 'react';
import { LogEntry, AIReport, Todo } from '../types';
import { useLanguage } from './LanguageContext';
import {
  createLog,
  createReport,
  deleteLog as deleteLogApi,
  deleteReport as deleteReportApi,
  listTodos,
  createTodo as createTodoApi,
  updateTodo as updateTodoApi,
  deleteTodo as deleteTodoApi,
  listLogs,
  listReports,
  updateLog as updateLogApi,
} from '../services/apiClient';

function generateId(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }

    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);

      // RFC4122 version 4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
  }

  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

interface AppContextType {
  logs: Record<string, LogEntry[]>;
  reports: AIReport[];
  todos: Todo[];
  addLog: (content: string) => Promise<void>;
  updateLog: (date: string, logId: string, newContent: string) => Promise<void>;
  deleteLog: (date: string, logId: string) => Promise<void>;
  addReport: (report: AIReport) => void;
  deleteReport: (id: string) => Promise<void>;
  getLogsForPeriod: (start: Date, end: Date) => LogEntry[];
  addTodo: (content: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  refreshTodos: () => Promise<void>;
  refreshLogsAndReports: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppStateProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useLanguage();

  const formatLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});

  const [reports, setReports] = useState<AIReport[]>([]);

  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = localStorage.getItem('ls_todos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [apiLogs, apiReports, apiTodos] = await Promise.all([listLogs(), listReports(), listTodos()]);
        if (cancelled) return;

        const grouped: Record<string, LogEntry[]> = {};
        for (const l of apiLogs) {
          grouped[l.dateKey] = grouped[l.dateKey] || [];
          grouped[l.dateKey].push({ id: l.id, timestamp: l.timestamp, content: l.content, tags: l.tags });
        }
        Object.values(grouped).forEach((arr) => arr.sort((a, b) => b.timestamp - a.timestamp));
        setLogs(grouped);
        setReports(apiReports);

        const serverTodos: Todo[] = (apiTodos || []).map((t: any) => ({
          id: String(t.id),
          content: String(t.content),
          completed: Boolean(t.completed),
          createdAt: Number(t.createdAt),
          updatedAt: Number(t.updatedAt),
        }));
        setTodos(serverTodos);

        // One-time migration: if server has no todos but localStorage has some, push them to server.
        // This helps existing single-device users to upgrade to multi-device sync.
        if (serverTodos.length === 0) {
          try {
            const localText = localStorage.getItem('ls_todos');
            const localTodos: any = localText ? JSON.parse(localText) : [];
            if (Array.isArray(localTodos) && localTodos.length > 0) {
              const migratedFlag = localStorage.getItem('ls_migrated_todos_postgres_v1');
              if (!migratedFlag) {
                const results = await Promise.allSettled(
                  localTodos
                    .filter((x: any) => x && typeof x.content === 'string' && x.content.trim().length > 0)
                    .map((x: any) =>
                      createTodoApi({
                        id: typeof x.id === 'string' && x.id.length > 0 ? x.id : undefined,
                        content: String(x.content),
                        completed: Boolean(x.completed),
                        createdAt: typeof x.createdAt === 'number' ? x.createdAt : undefined,
                        updatedAt: typeof x.createdAt === 'number' ? x.createdAt : undefined,
                      })
                    )
                );
                const failed = results.filter((r) => r.status === 'rejected');
                if (failed.length === 0) {
                  localStorage.setItem('ls_migrated_todos_postgres_v1', '1');
                  const apiTodos2 = await listTodos();
                  if (cancelled) return;
                  setTodos(
                    (apiTodos2 || []).map((t: any) => ({
                      id: String(t.id),
                      content: String(t.content),
                      completed: Boolean(t.completed),
                      createdAt: Number(t.createdAt),
                      updatedAt: Number(t.updatedAt),
                    }))
                  );
                }
              }
            }
          } catch {
          }
        }

        const migratedFlag = localStorage.getItem('ls_migrated_postgres_v1');
        if (migratedFlag) return;

        const savedLogsText = localStorage.getItem('ls_logs');
        const savedReportsText = localStorage.getItem('ls_reports');

        const oldLogs: any = savedLogsText ? JSON.parse(savedLogsText) : null;
        const oldReports: any = savedReportsText ? JSON.parse(savedReportsText) : null;

        const logPromises: Promise<any>[] = [];
        if (oldLogs && typeof oldLogs === 'object') {
          for (const [dateKey, entries] of Object.entries(oldLogs)) {
            if (!Array.isArray(entries)) continue;
            for (const e of entries) {
              if (!e || typeof e !== 'object') continue;
              if (typeof (e as any).id !== 'string' || (e as any).id.length === 0) continue;
              if (typeof (e as any).timestamp !== 'number' || !Number.isFinite((e as any).timestamp)) continue;
              if (typeof (e as any).content !== 'string' || (e as any).content.length === 0) continue;
              logPromises.push(
                createLog({
                  id: String((e as any).id),
                  dateKey: String(dateKey),
                  timestamp: Number((e as any).timestamp),
                  content: String((e as any).content),
                  tags: Array.isArray((e as any).tags) ? (e as any).tags : [],
                })
              );
            }
          }
        }

        const reportPromises: Promise<any>[] = [];
        if (Array.isArray(oldReports)) {
          for (const r of oldReports) {
            if (!r || typeof r !== 'object') continue;
            if (!r.type || !r.periodStart || !r.periodEnd || !r.content) continue;
            reportPromises.push(
              createReport({
                id: r.id ? String(r.id) : undefined,
                type: r.type,
                periodStart: String(r.periodStart),
                periodEnd: String(r.periodEnd),
                content: String(r.content),
                createdAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
              })
            );
          }
        }

        const all = [...logPromises, ...reportPromises];
        if (all.length === 0) return;

        const results = await Promise.allSettled(all);
        const failed = results.filter((x) => x.status === 'rejected');
        if (failed.length > 0) {
          console.warn('Some localStorage migration requests failed. Keeping localStorage data intact.', failed);
          return;
        }

        localStorage.setItem('ls_migrated_postgres_v1', '1');
        localStorage.removeItem('ls_logs');
        localStorage.removeItem('ls_reports');

        const [apiLogs2, apiReports2] = await Promise.all([listLogs(), listReports()]);
        if (cancelled) return;

        const grouped2: Record<string, LogEntry[]> = {};
        for (const l of apiLogs2) {
          grouped2[l.dateKey] = grouped2[l.dateKey] || [];
          grouped2[l.dateKey].push({ id: l.id, timestamp: l.timestamp, content: l.content, tags: l.tags });
        }
        Object.values(grouped2).forEach((arr) => arr.sort((a, b) => b.timestamp - a.timestamp));
        setLogs(grouped2);
        setReports(apiReports2);
      } catch (err) {
        console.error('Failed to load data from local backend:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist todos as cache only (source of truth is server)
  useEffect(() => {
    try {
      localStorage.setItem('ls_todos', JSON.stringify(todos));
    } catch {
    }
  }, [todos]);

  const refreshTodos = async (): Promise<void> => {
    const apiTodos = await listTodos();
    const serverTodos: Todo[] = (apiTodos || []).map((x: any) => ({
      id: String(x.id),
      content: String(x.content),
      completed: Boolean(x.completed),
      createdAt: Number(x.createdAt),
      updatedAt: Number(x.updatedAt),
    }));
    setTodos(serverTodos);
  };

  const refreshLogsAndReports = async (): Promise<void> => {
    const [apiLogs, apiReports] = await Promise.all([listLogs(), listReports()]);

    const grouped: Record<string, LogEntry[]> = {};
    for (const l of apiLogs) {
      grouped[l.dateKey] = grouped[l.dateKey] || [];
      grouped[l.dateKey].push({ id: l.id, timestamp: l.timestamp, content: l.content, tags: l.tags });
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) => b.timestamp - a.timestamp));

    setLogs(grouped);
    setReports(apiReports);
  };

  const addLog = async (content: string) => {
    const now = new Date();
    const dateKey = formatLocalDateKey(now);
    
    const newEntry: LogEntry = {
      id: generateId(),
      timestamp: now.getTime(),
      content,
      tags: []
    };

    try {
      const created = await createLog({
        id: newEntry.id,
        dateKey,
        timestamp: newEntry.timestamp,
        content: newEntry.content,
        tags: newEntry.tags,
      });

      setLogs(prev => {
        const dayLogs = prev[dateKey] || [];
        const merged = [
          { id: created.id, timestamp: created.timestamp, content: created.content, tags: created.tags },
          ...dayLogs.filter(l => l.id !== created.id)
        ];
        return {
          ...prev,
          [dateKey]: merged
        };
      });
    } catch (err) {
      console.error('Failed to create log:', err);
      throw err;
    }
  };

  const updateLog = async (date: string, logId: string, newContent: string) => {
    try {
      const updated = await updateLogApi(logId, { content: newContent });
      setLogs(prev => {
        const dayLogs = prev[date] || [];
        return {
          ...prev,
          [date]: dayLogs.map(l => l.id === logId ? { ...l, content: updated.content } : l)
        };
      });
    } catch (err) {
      console.error('Failed to update log:', err);
      throw err;
    }
  };

  const deleteLog = async (date: string, logId: string) => {
    try {
      await deleteLogApi(logId);
      setLogs(prev => {
        const dayLogs = prev[date] || [];
        return {
          ...prev,
          [date]: dayLogs.filter(l => l.id !== logId)
        };
      });
    } catch (err) {
      console.error('Failed to delete log:', err);
      throw err;
    }
  };

  const addReport = (report: AIReport) => {
    setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
  };

  const deleteReport = async (id: string) => {
    try {
      await deleteReportApi(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete report:', err);
      throw err;
    }
  };

  const getLogsForPeriod = (start: Date, end: Date): LogEntry[] => {
    const entries: LogEntry[] = [];
    const current = new Date(start);
    
    // Normalize time to start of day
    current.setHours(0,0,0,0);
    const endTime = new Date(end);
    endTime.setHours(23,59,59,999);

    // Naive iteration day by day
    while (current <= endTime) {
      const dateKey = formatLocalDateKey(current);
      if (logs[dateKey]) {
        entries.push(...logs[dateKey]);
      }
      current.setDate(current.getDate() + 1);
    }
    
    // Sort by timestamp ascending for the AI
    return entries.sort((a, b) => a.timestamp - b.timestamp);
  };

  // Todo Methods
  const addTodo = (content: string) => {
    const optimistic: Todo = {
      id: generateId(),
      content,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTodos((prev) => [optimistic, ...prev]);
    void createTodoApi({
      id: optimistic.id,
      content: optimistic.content,
      completed: optimistic.completed,
      createdAt: optimistic.createdAt,
      updatedAt: optimistic.updatedAt,
    })
      .then((created) => {
        setTodos((prev) => prev.map((t) => (t.id === optimistic.id ? { ...t, ...created } : t)));
      })
      .catch((err) => {
        console.error('Failed to create todo:', err);
        setTodos((prev) => prev.filter((t) => t.id !== optimistic.id));
      });
  };

  const toggleTodo = (id: string) => {
    // Find the todo in the current state to check its status before updating
    const todo = todos.find(t => t.id === id);
    
    // If we found it and it is currently NOT completed (so it is becoming completed)
    if (todo && !todo.completed) {
      void addLog(`${t('daily.completedTask')}${todo.content}`).catch((err) => console.error(err));
    }

    if (!todo) return;
    const nextCompleted = !todo.completed;

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: nextCompleted, updatedAt: Date.now() } : t)));
    void updateTodoApi(id, { completed: nextCompleted }).catch((err) => {
      console.error('Failed to update todo:', err);
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: todo.completed } : t)));
    });
  };

  const deleteTodo = (id: string) => {
    const prevTodo = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    void deleteTodoApi(id).catch((err) => {
      console.error('Failed to delete todo:', err);
      if (prevTodo) {
        setTodos((prev) => [prevTodo, ...prev]);
      }
    });
  };

  return (
    <AppContext.Provider value={{ 
      logs, reports, todos,
      addLog, updateLog, deleteLog, addReport, deleteReport, getLogsForPeriod,
      addTodo, toggleTodo, deleteTodo,
      refreshTodos, refreshLogsAndReports,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};