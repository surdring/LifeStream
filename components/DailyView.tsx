import { useEffect, useState, useRef, type FC, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Clock, Trash2, Calendar as CalendarIcon, ListTodo, X, Edit2, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { useLanguage } from '../context/LanguageContext';
import { TodoPanel } from './TodoPanel';
import { LogEntry } from '../types';
import { generateCues } from '../services/apiClient';
import { extractActionItemsFromMarkdown, extractCuesSection, stripThinkingFromReport } from '../shared/reportPrompt';

export const DailyView: FC = () => {
  const { logs, reports, todos, addTodo, addLog, updateLog, deleteLog, refreshLogsAndReports } = useAppState();
  const { t, language } = useLanguage();

  const [refreshingLogs, setRefreshingLogs] = useState(false);

  const handleRefreshLogs = async () => {
    if (refreshingLogs) return;
    setRefreshingLogs(true);
    try {
      await refreshLogsAndReports();
    } finally {
      setRefreshingLogs(false);
    }
  };

  const formatLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [inputValue, setInputValue] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(formatLocalDateKey(new Date()));
  const [showMobileTodos, setShowMobileTodos] = useState(false);
  const [cuesByDate, setCuesByDate] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('ls_cues_by_date');
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [cuesOpenByDate, setCuesOpenByDate] = useState<Record<string, boolean>>({});
  const [cuesLoading, setCuesLoading] = useState(false);
  const [cuesError, setCuesError] = useState<string | null>(null);
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Scroll to bottom helper
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('ls_cues_by_date', JSON.stringify(cuesByDate));
    } catch {
    }
  }, [cuesByDate]);

  const currentLogs = logs[selectedDate] || [];

  const dailyReportForSelectedDate = reports.find(
    (r) => r.type === 'DAILY' && r.periodStart === selectedDate && r.periodEnd === selectedDate
  );

  const cuesOpen = cuesOpenByDate[selectedDate] ?? false;
  const generatedCuesForSelectedDate = cuesByDate[selectedDate];
  const hasGeneratedCuesForSelectedDate =
    typeof generatedCuesForSelectedDate === 'string' && generatedCuesForSelectedDate.trim().length > 0;

  const getCuesMarkdown = (): string | null => {
    const generated = cuesByDate[selectedDate];
    if (typeof generated === 'string' && generated.trim().length > 0) {
      return generated;
    }

    if (dailyReportForSelectedDate) {
      const cleaned = stripThinkingFromReport(dailyReportForSelectedDate.content);
      const cues = extractCuesSection(cleaned);
      if (cues) return cues;
    }
    return null;
  };

  const stripLeadingCuesHeading = (markdown: string): string => {
    return markdown
      .replace(/^\s*##\s*(线索区（Cues）|线索区\s*\(Cues\)|Cues)\s*\n+/m, '')
      .replace(/复盘问题（遮住答案自测）/g, '复盘问题')
      .replace(/Review Questions \(Self-test\)/g, 'Review Questions')
      .trim();
  };

  const getCollapsedCuesMeta = (markdown: string | null): {
    keywords: string[];
    actionsCount: number;
    questionsCount: number;
    fallbackText: string;
  } => {
    if (!markdown) return { keywords: [], actionsCount: 0, questionsCount: 0, fallbackText: '' };

    const lines = markdown.split('\n');
    let section: 'keywords' | 'questions' | null = null;
    const keywords: string[] = [];
    let actionsCount = 0;
    let questionsCount = 0;
    let fallbackText = '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const heading = line.match(/^#{2,6}\s*(.+?)\s*$/);
      if (heading) {
        const title = heading[1].trim();
        if (/关键词/i.test(title) || /^keywords$/i.test(title)) {
          section = 'keywords';
        } else if (/复盘问题|问题/i.test(title) || /^questions?$/i.test(title)) {
          section = 'questions';
        } else {
          section = null;
        }
        continue;
      }

      if (/^[-*+]\s*\[[xX ]\]\s+/.test(line)) {
        actionsCount += 1;
      }

      if (section === 'keywords' && keywords.length < 3) {
        const item = line
          .replace(/^[-*+]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .trim();
        if (item && keywords.length < 3) keywords.push(item);
        continue;
      }

      if (section === 'questions') {
        if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line) || /[？?]$/.test(line)) {
          questionsCount += 1;
        }
      }

      if (!fallbackText) {
        fallbackText = line
          .replace(/^[-*+]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .replace(/^\[[xX ]\]\s+/, '')
          .trim();
      }
    }

    return { keywords, actionsCount, questionsCount, fallbackText };
  };

  const syncActionItemsToTodo = (sourceMarkdown: string) => {
    const items = extractActionItemsFromMarkdown(sourceMarkdown);
    if (items.length === 0) {
      window.alert(language === 'zh' ? '未识别到可同步的行动项（需要 - [ ] 开头的任务列表）。' : 'No action items found to sync (need - [ ] task list items).');
      return;
    }

    const existing = new Set(todos.map((x) => x.content.trim()));
    const unique = Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
    const toAdd = unique.filter((x) => !existing.has(x));

    if (toAdd.length === 0) {
      window.alert(language === 'zh' ? '这些行动项已全部存在于待办中。' : 'All action items already exist in Todos.');
      return;
    }

    const ok = window.confirm(
      language === 'zh'
        ? `识别到 ${unique.length} 条行动项，其中 ${toAdd.length} 条将新增到待办。是否继续？`
        : `Found ${unique.length} action items; ${toAdd.length} will be added to Todos. Continue?`
    );

    if (!ok) return;
    toAdd.forEach((x) => addTodo(x));
  };

  const handleGenerateCues = async () => {
    if (currentLogs.length === 0) {
      setCuesError(language === 'zh' ? '该日期没有日志，无法生成线索。' : 'No logs for this day; cannot generate cues.');
      return;
    }

    setCuesLoading(true);
    setCuesError(null);
    try {
      const rangeText = selectedDate;
      const periodName = language === 'zh' ? `当日线索（${rangeText}）` : `Daily Cues (${rangeText})`;
      const { content } = await generateCues({
        periodStart: selectedDate,
        periodEnd: selectedDate,
        language,
        periodName,
      });

      const cleaned = stripThinkingFromReport(content);
      if (!cleaned || cleaned.trim().length === 0) {
        setCuesError(language === 'zh' ? '线索生成结果为空（可能是模型未输出最终答案）。请重试或切换 LLM 配置。' : 'Generated cues is empty (the model may not have produced a final answer). Please retry or check LLM config.');
        return;
      }

      setCuesByDate((prev) => ({ ...prev, [selectedDate]: cleaned }));
      setCuesOpenByDate((prev) => ({ ...prev, [selectedDate]: true }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCuesError(msg);
    } finally {
      setCuesLoading(false);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    void addLog(inputValue).catch((err) => console.error(err));
    setInputValue('');
    // Wait for state update then scroll
    setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startEditing = (log: LogEntry) => {
    setEditingId(log.id);
    setEditContent(log.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEditing = (logId: string) => {
    if (editContent.trim()) {
      void updateLog(selectedDate, logId, editContent).catch((err) => console.error(err));
    }
    setEditingId(null);
    setEditContent('');
  };

  const handleEditKeyDown = (e: ReactKeyboardEvent, logId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEditing(logId);
    } else if (e.key === 'Escape') {
        cancelEditing();
    }
  };

  const isToday = selectedDate === formatLocalDateKey(new Date());
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  const cuesMarkdown = getCuesMarkdown();
  const cuesMarkdownForRender = cuesMarkdown ? stripLeadingCuesHeading(cuesMarkdown) : null;
  const collapsedCuesMeta = getCollapsedCuesMeta(cuesMarkdownForRender);

  return (
    <div className="flex h-full relative">
        {/* Main Journal Area */}
        <div className="flex-1 flex flex-col h-full bg-white/50 backdrop-blur-sm min-w-0">
            {/* Header */}
            <header className="px-6 py-4 border-b border-gray-100 bg-white flex justify-between items-center sticky top-0 z-10">
                <div className="flex-1 min-w-0 mr-4">
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                        {isToday ? t('daily.today') : new Date(`${selectedDate}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </h1>
                    <p className="text-sm text-gray-500 truncate hidden md:block">{t('daily.subtitle')}</p>
                </div>
                
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="relative">
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer w-32 md:w-auto"
                        />
                        <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>

                    <button
                        onClick={() => void handleRefreshLogs()}
                        disabled={refreshingLogs}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        title={t('common.refresh')}
                        aria-label={t('common.refresh')}
                    >
                        <RefreshCw size={18} className={refreshingLogs ? 'animate-spin' : ''} />
                    </button>

                    {/* Mobile Todo Toggle */}
                    <button 
                        onClick={() => setShowMobileTodos(!showMobileTodos)}
                        className={`xl:hidden p-2 rounded-lg border transition-all ${
                            showMobileTodos 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <ListTodo size={20} />
                    </button>
                </div>
            </header>

            <div className="px-4 md:px-8 py-4 border-b border-gray-100 bg-white">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {language === 'zh' ? '当日线索（Cues）' : 'Daily Cues'}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {hasGeneratedCuesForSelectedDate
                        ? (language === 'zh' ? '来源：即时生成（未保存）' : 'Source: On-demand (not saved)')
                        : dailyReportForSelectedDate
                          ? (language === 'zh' ? '来源：当日报' : 'Source: Daily report')
                          : (language === 'zh' ? '来源：—' : 'Source: —')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() =>
                        setCuesOpenByDate((prev) => ({
                          ...prev,
                          [selectedDate]: !(prev[selectedDate] ?? false),
                        }))
                      }
                      className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      aria-label={cuesOpen ? (language === 'zh' ? '折叠线索' : 'Collapse cues') : (language === 'zh' ? '展开线索' : 'Expand cues')}
                    >
                      {cuesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      onClick={() => void handleGenerateCues()}
                      disabled={cuesLoading}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cuesLoading
                        ? (language === 'zh' ? '生成中...' : 'Generating...')
                        : (language === 'zh' ? '生成线索' : 'Generate Cues')}
                    </button>
                    <button
                      onClick={() => {
                        const cues = getCuesMarkdown();
                        if (!cues) return;
                        syncActionItemsToTodo(cues);
                      }}
                      disabled={cuesLoading || !cuesMarkdown}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {language === 'zh' ? '同步行动项' : 'Sync Actions'}
                    </button>
                  </div>
                </div>

                {cuesError && (
                  <div className="mt-3 text-xs text-red-600">
                    {cuesError}
                  </div>
                )}

                {cuesOpen ? (
                  cuesMarkdownForRender ? (
                    <div className="mt-3 rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/40 rounded-t-2xl">
                        <div className="text-xs text-gray-500">
                          {language === 'zh' ? '关键词 / 问题 / 行动项 / 证据' : 'Keywords / Questions / Actions / Evidence'}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="prose prose-sm max-w-none text-slate-800 prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h2:text-sm prose-h3:text-sm prose-li:my-1">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h2: ({ children, ...props }) => (
                                <h3 className="mt-4 mb-2 text-sm font-semibold text-gray-900" {...props}>
                                  {children}
                                </h3>
                              ),
                              h3: ({ children, ...props }) => (
                                <h4 className="mt-3 mb-2 text-sm font-semibold text-gray-900" {...props}>
                                  {children}
                                </h4>
                              ),
                              input: (props) => {
                                const { type, checked, ...rest } = props as any;
                                if (type === 'checkbox') {
                                  return (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(checked)}
                                      readOnly
                                      className="mr-2 align-middle accent-indigo-600"
                                      {...rest}
                                    />
                                  );
                                }
                                return <input {...(rest as any)} />;
                              },
                            }}
                          >
                            {cuesMarkdownForRender}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-gray-500">
                      {language === 'zh'
                        ? '暂无线索。你可以点击“生成线索”从当日日志中提炼关键词、复盘问题与下一步行动。'
                        : 'No cues yet. Click “Generate Cues” to extract keywords, review questions, and next actions from today\'s logs.'}
                    </div>
                  )
                ) : (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-xs text-gray-600 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      {collapsedCuesMeta.keywords.map((k) => (
                        <span
                          key={k}
                          className="max-w-[10rem] truncate rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                          title={k}
                        >
                          {k}
                        </span>
                      ))}

                      {collapsedCuesMeta.actionsCount > 0 && (
                        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                          {language === 'zh' ? '行动项' : 'Actions'} {collapsedCuesMeta.actionsCount}
                        </span>
                      )}

                      {collapsedCuesMeta.questionsCount > 0 && (
                        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                          {language === 'zh' ? '问题' : 'Questions'} {collapsedCuesMeta.questionsCount}
                        </span>
                      )}

                      {collapsedCuesMeta.keywords.length === 0 &&
                        collapsedCuesMeta.actionsCount === 0 &&
                        collapsedCuesMeta.questionsCount === 0 && (
                          <div className="truncate">
                            {collapsedCuesMeta.fallbackText
                              ? collapsedCuesMeta.fallbackText
                              : (language === 'zh' ? '线索已折叠' : 'Cues collapsed')}
                          </div>
                        )}
                    </div>
                    <button
                      onClick={() => setCuesOpenByDate((prev) => ({ ...prev, [selectedDate]: true }))}
                      className="text-indigo-600 hover:text-indigo-700 font-medium flex-shrink-0"
                    >
                      {language === 'zh' ? '展开' : 'Expand'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stream Area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
                {currentLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                        <Clock size={48} className="mb-4" />
                        <p>{t('daily.noEntries')}</p>
                        {isToday && <p className="text-sm mt-2">{t('daily.startTyping')}</p>}
                    </div>
                ) : (
                    currentLogs.slice().reverse().map((log) => (
                    <div key={log.id} className="group flex gap-4 max-w-3xl mx-auto animate-fade-in-up">
                        <div className="flex flex-col items-center mt-1">
                        <div className="w-2 h-2 rounded-full bg-indigo-200 group-hover:bg-indigo-500 transition-colors"></div>
                        <div className="w-px h-full bg-gray-100 my-1 group-last:hidden"></div>
                        </div>
                        <div className="flex-1 pb-4 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                                <span className="text-xs font-medium text-gray-400 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {/* Action Buttons */}
                                {isToday && editingId !== log.id && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => startEditing(log)}
                                            className="text-gray-300 hover:text-indigo-500 transition-colors p-1 rounded hover:bg-indigo-50"
                                            title="Edit"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button 
                                            onClick={() => void deleteLog(selectedDate, log.id).catch((err) => console.error(err))}
                                            className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {editingId === log.id ? (
                                <div className="bg-white p-3 rounded-2xl rounded-tl-sm shadow-md border-2 border-indigo-100 ring-2 ring-indigo-50/50">
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        onKeyDown={(e) => handleEditKeyDown(e, log.id)}
                                        className="w-full bg-transparent border-none resize-none focus:ring-0 text-gray-800 p-0 text-base"
                                        rows={Math.max(2, editContent.split('\n').length)}
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-50">
                                        <button 
                                            onClick={cancelEditing}
                                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                                            title="Cancel (Esc)"
                                        >
                                            <X size={16} />
                                        </button>
                                        <button 
                                            onClick={() => saveEditing(log.id)}
                                            className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 shadow-sm transition-all"
                                            title="Save (Enter)"
                                        >
                                            <Check size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-4 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                                    {log.content}
                                </div>
                            )}
                        </div>
                    </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            {isToday && (
                <div className="p-4 bg-gradient-to-t from-gray-100/90 via-gray-100/50 to-transparent backdrop-blur-sm border-t border-gray-100 sticky bottom-0 z-20">
                    <div className="max-w-3xl mx-auto relative rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('daily.placeholder')}
                        className="w-full pl-5 pr-14 py-4 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none h-16 max-h-48"
                        style={{ minHeight: '60px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                        <Send size={18} />
                    </button>
                    </div>
                    <div className="max-w-3xl mx-auto mt-2 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                            {t('daily.pressEnter')}
                        </p>
                    </div>
                </div>
            )}
        </div>

        {/* Desktop Todo Sidebar */}
        <div className="hidden xl:block w-80 h-full relative z-30">
            <TodoPanel />
        </div>

        {/* Mobile Todo Slide-over */}
        {showMobileTodos && (
            <div className="fixed inset-0 z-50 xl:hidden">
                <div 
                    className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                    onClick={() => setShowMobileTodos(false)}
                ></div>
                <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl animate-slide-in-right">
                    <div className="absolute top-2 right-2 z-10">
                        <button 
                            onClick={() => setShowMobileTodos(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <TodoPanel />
                </div>
            </div>
        )}
    </div>
  );
};