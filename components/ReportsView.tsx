import { useState, type FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Calendar, RefreshCw, Sparkles, ChevronRight, FileText, Trash2 } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { useLanguage } from '../context/LanguageContext';
import { generateReport, updateReport } from '../services/apiClient';
import { ReportType, AIReport } from '../types';
import { extractActionItemsFromMarkdown, extractCuesSection, stripThinkingFromReport } from '../shared/reportPrompt';

export const ReportsView: FC = () => {
  const { reports, todos, addTodo, addReport, deleteReport } = useAppState();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<ReportType>(ReportType.WEEKLY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  const formatLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [dailyDate, setDailyDate] = useState<string>(formatLocalDateKey(new Date()));

  const getPeriodDates = (type: ReportType, offset: number = 0) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let name = "";

    if (type === ReportType.DAILY) {
       const base = new Date(`${dailyDate}T00:00:00`);
       start = new Date(base);
       start.setDate(start.getDate() + offset);
       start.setHours(0, 0, 0, 0);

       end = new Date(start);
       end.setHours(23, 59, 59, 999);

       name = start.toLocaleDateString(locale);
    } else if (type === ReportType.WEEKLY) {
       // Start of current week (Sunday)
       const day = now.getDay();
       const diff = now.getDate() - day + (offset * 7);
       start = new Date(now.setDate(diff));
       start.setHours(0,0,0,0);
       
       end = new Date(start);
       end.setDate(start.getDate() + 6);
       end.setHours(23,59,59,999);
       
       const dateStr = start.toLocaleDateString(locale);
       name = t('reports.weekOf', { date: dateStr });
    } else if (type === ReportType.MONTHLY) {
       start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
       end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
       name = start.toLocaleString(locale, { month: 'long', year: 'numeric' });
    } else if (type === ReportType.YEARLY) {
       start = new Date(now.getFullYear() + offset, 0, 1);
       end = new Date(now.getFullYear() + offset, 11, 31);
       name = start.getFullYear().toString();
    }

    return { start, end, name };
  };

  const handleGenerate = async (params?: { force?: boolean; target?: { type: ReportType; periodStart: string; periodEnd: string; periodName?: string } }) => {
    setLoading(true);
    setError(null);
    try {
      const target = params?.target;
      if (target) {
        const report = await generateReport({
          type: target.type,
          periodStart: target.periodStart,
          periodEnd: target.periodEnd,
          language,
          periodName: target.periodName,
          force: params?.force,
        });
        addReport(report as AIReport);
        return;
      }

      const { start, end, name } = getPeriodDates(activeTab, 0);
      const periodStart = formatLocalDateKey(start);
      const periodEnd = formatLocalDateKey(end);
      const shouldForce = params?.force ?? reports.some((r) => r.type === activeTab && r.periodStart === periodStart && r.periodEnd === periodEnd);
      const report = await generateReport({
        type: activeTab,
        periodStart,
        periodEnd,
        language,
        periodName: name,
        force: shouldForce,
      });
      addReport(report as AIReport);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('no logs found')) {
        setError(t('daily.noEntries'));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (report: AIReport) => {
    const ok = window.confirm(
      language === 'zh'
        ? '确定要删除这条报表吗？此操作不可恢复。'
        : 'Delete this report? This action cannot be undone.'
    );
    if (!ok) return;

    setDeletingReportId(report.id);
    setError(null);
    try {
      await deleteReport(report.id);
      if (editingReportId === report.id) {
        cancelEditing();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setDeletingReportId(null);
    }
  };

  const startEditing = (report: AIReport) => {
    setError(null);
    setEditingReportId(report.id);
    setDraftContent(stripThinkingFromReport(report.content));
  };

  const cancelEditing = () => {
    setEditingReportId(null);
    setDraftContent('');
  };

  const saveEditing = async () => {
    if (!editingReportId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateReport(editingReportId, { content: draftContent });
      addReport(updated);
      cancelEditing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Filter reports by active tab
  const visibleReports = reports.filter(r => r.type === activeTab);

  const getReportTitle = (type: ReportType) => {
      switch(type) {
          case ReportType.DAILY: return t('reports.daily');
          case ReportType.WEEKLY: return t('reports.weekly');
          case ReportType.MONTHLY: return t('reports.monthly');
          case ReportType.YEARLY: return t('reports.yearly');
          default: return type;
      }
  }

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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="px-8 py-6 bg-white border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('reports.title')}</h1>
        <div className="flex gap-2 items-center">
            {[ReportType.DAILY, ReportType.WEEKLY, ReportType.MONTHLY, ReportType.YEARLY].map((type) => (
                <button
                    key={type}
                    onClick={() => setActiveTab(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === type 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    {getReportTitle(type)}
                </button>
            ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Generator Card */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                        <Sparkles size={20} className="text-yellow-300" />
                        {t('reports.generate', { type: getReportTitle(activeTab).toLowerCase() })}
                    </h2>
                    <p className="text-indigo-100 text-sm opacity-90">
                        {t('reports.desc')}
                    </p>
                    {activeTab === ReportType.DAILY && (
                      <div className="mt-3">
                        <input
                          type="date"
                          value={dailyDate}
                          onChange={(e) => setDailyDate(e.target.value)}
                          className="px-3 py-2 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/40"
                        />
                      </div>
                    )}
                </div>
                <button 
                    onClick={() => void handleGenerate()}
                    disabled={loading}
                    className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-50 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
                >
                    {loading ? (
                        <>
                            <RefreshCw size={16} className="animate-spin" />
                            {t('common.loading')}
                        </>
                    ) : (
                        <>
                            {t('reports.create')}
                            <ChevronRight size={16} />
                        </>
                    )}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* Reports List */}
            <div className="space-y-6">
                <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                    <FileText size={20} />
                    {t('reports.history')}
                </h3>
                
                {visibleReports.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                        <Calendar className="mx-auto text-gray-300 mb-3" size={48} />
                        <p className="text-gray-500 font-medium">{t('reports.noHistory')}</p>
                        <p className="text-gray-400 text-sm">{t('reports.startJournaling')}</p>
                    </div>
                ) : (
                    visibleReports.map((report) => (
                        <div key={report.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in-up">
                            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold text-gray-800">
                                        {report.type === ReportType.DAILY && new Date(report.periodStart).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}
                                        {report.type === ReportType.WEEKLY && t('reports.weekOf', { date: report.periodStart })}
                                        {report.type === ReportType.MONTHLY && new Date(report.periodStart).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                                        {report.type === ReportType.YEARLY && new Date(report.periodStart).getFullYear()}
                                    </h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {t('reports.generatedOn')} {new Date(report.createdAt).toLocaleDateString(locale)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                          const cleaned = stripThinkingFromReport(report.content);
                                          const cues = extractCuesSection(cleaned);
                                          syncActionItemsToTodo(cues ?? cleaned);
                                        }}
                                        disabled={loading || saving || editingReportId === report.id}
                                        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {language === 'zh' ? '同步行动项' : 'Sync Actions'}
                                    </button>
                                    <button
                                        onClick={() => void handleGenerate({
                                          force: true,
                                          target: {
                                            type: report.type,
                                            periodStart: report.periodStart,
                                            periodEnd: report.periodEnd,
                                            periodName: report.type === ReportType.DAILY && report.periodStart === report.periodEnd
                                              ? report.periodStart
                                              : `${report.periodStart} ~ ${report.periodEnd}`,
                                          },
                                        })}
                                        disabled={loading || saving || editingReportId === report.id}
                                        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {t('reports.regenerate')}
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteReport(report)}
                                      disabled={loading || saving || deletingReportId === report.id}
                                      className="px-3 py-1 bg-white border border-red-200 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                                      title={language === 'zh' ? '删除报表' : 'Delete report'}
                                    >
                                      <Trash2 size={14} />
                                      {language === 'zh' ? '删除' : 'Delete'}
                                    </button>
                                    {editingReportId === report.id ? (
                                      <>
                                        <button
                                          onClick={() => void saveEditing()}
                                          disabled={saving || loading}
                                          className="px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                          {t('common.save')}
                                        </button>
                                        <button
                                          onClick={cancelEditing}
                                          disabled={saving || loading}
                                          className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                          {t('common.cancel')}
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                          onClick={() => startEditing(report)}
                                          disabled={loading || saving}
                                          className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                      >
                                          {t('common.edit')}
                                      </button>
                                    )}
                                    <span className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-mono text-gray-500">
                                        {getReportTitle(report.type)}
                                    </span>
                                </div>
                            </div>
                            <div className="p-8">
                                {editingReportId === report.id ? (
                                  <textarea
                                    value={draftContent}
                                    onChange={(e) => setDraftContent(e.target.value)}
                                    className="w-full min-h-[240px] p-4 border border-gray-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                ) : (
                                  <div className="max-w-none text-slate-800 leading-7">
                                    {(() => {
                                      const cleaned = stripThinkingFromReport(report.content);
                                      return (
                                        <>
                                          <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                              h1: ({ children, ...props }) => (
                                                <h1 {...props} className="mt-6 mb-3 text-2xl font-bold text-slate-900">
                                                  {children}
                                                </h1>
                                              ),
                                              h2: ({ children, ...props }) => (
                                                <h2 {...props} className="mt-6 mb-3 text-xl font-bold text-slate-900">
                                                  {children}
                                                </h2>
                                              ),
                                              h3: ({ children, ...props }) => (
                                                <h3 {...props} className="mt-5 mb-2 text-lg font-bold text-indigo-700">
                                                  {children}
                                                </h3>
                                              ),
                                              h4: ({ children, ...props }) => (
                                                <h4 {...props} className="mt-4 mb-2 text-base font-semibold text-slate-900">
                                                  {children}
                                                </h4>
                                              ),
                                              p: ({ children, ...props }) => (
                                                <p {...props} className="my-3 text-slate-700 leading-7 whitespace-pre-wrap break-words">
                                                  {children}
                                                </p>
                                              ),
                                              ul: ({ children, ...props }) => (
                                                <ul {...props} className="my-3 list-disc pl-6 text-slate-700">
                                                  {children}
                                                </ul>
                                              ),
                                              ol: ({ children, ...props }) => (
                                                <ol {...props} className="my-3 list-decimal pl-6 text-slate-700">
                                                  {children}
                                                </ol>
                                              ),
                                              li: ({ children, ...props }) => (
                                                <li {...props} className="my-1">
                                                  {children}
                                                </li>
                                              ),
                                              strong: ({ children, ...props }) => (
                                                <strong {...props} className="font-semibold text-slate-900">
                                                  {children}
                                                </strong>
                                              ),
                                              blockquote: ({ children, ...props }) => (
                                                <blockquote
                                                  {...props}
                                                  className="my-4 border-l-4 border-indigo-200 bg-indigo-50/40 px-4 py-2 text-slate-700"
                                                >
                                                  {children}
                                                </blockquote>
                                              ),
                                              hr: (props) => <hr {...props} className="my-6 border-gray-200" />,
                                              a: ({ children, ...props }) => (
                                                <a
                                                  {...props}
                                                  className="text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
                                                  target="_blank"
                                                  rel="noreferrer"
                                                >
                                                  {children}
                                                </a>
                                              ),
                                              code: (props) => {
                                                const p = props as any;
                                                const inline = Boolean(p.inline);
                                                const className = typeof p.className === 'string' ? p.className : undefined;
                                                const children = p.children;
                                                const rest = { ...p };
                                                delete rest.inline;
                                                delete rest.className;
                                                delete rest.children;

                                                if (inline) {
                                                  return (
                                                    <code
                                                      {...rest}
                                                      className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.95em] text-slate-800"
                                                    >
                                                      {children}
                                                    </code>
                                                  );
                                                }
                                                return (
                                                  <code {...rest} className={className ? String(className) : undefined}>
                                                    {children}
                                                  </code>
                                                );
                                              },
                                              pre: ({ children, ...props }) => (
                                                <pre
                                                  {...props}
                                                  className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-slate-100"
                                                >
                                                  {children}
                                                </pre>
                                              ),
                                              table: ({ children, ...props }) => (
                                                <div className="my-5 overflow-x-auto rounded-xl border border-gray-200">
                                                  <table {...props} className="w-full border-collapse text-sm">
                                                    {children}
                                                  </table>
                                                </div>
                                              ),
                                              thead: ({ children, ...props }) => (
                                                <thead {...props} className="bg-gray-50">
                                                  {children}
                                                </thead>
                                              ),
                                              th: ({ children, ...props }) => (
                                                <th
                                                  {...props}
                                                  className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-slate-900"
                                                >
                                                  {children}
                                                </th>
                                              ),
                                              td: ({ children, ...props }) => (
                                                <td {...props} className="border-b border-gray-100 px-3 py-2 align-top text-slate-700">
                                                  {children}
                                                </td>
                                              ),
                                            }}
                                          >
                                            {cleaned}
                                          </ReactMarkdown>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
};