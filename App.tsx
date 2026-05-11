import { useEffect, useState } from 'react';
import { BookOpen, BarChart3, Globe, LogOut, User, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { DailyView } from './components/DailyView';
import { ReportsView } from './components/ReportsView';
import { AuthView } from './components/AuthView';
import { AppStateProvider } from './context/AppStateContext';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/LanguageContext';
import { authStatus, clearAuthToken, type ApiAuthUser } from './services/apiClient';
import { ModelConfig, useModelConfig } from './components/model-config';

function MobileNav(props: {
  currentView: 'daily' | 'reports';
  onViewChange: (view: 'daily' | 'reports') => void;
  user: ApiAuthUser;
  onLogout: () => void;
  onOpenModelConfig?: () => void;
}) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const userInitial = props.user?.username?.trim()?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          <button
            onClick={() => props.onViewChange('daily')}
            className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 text-xs font-medium ${
              props.currentView === 'daily' ? 'text-indigo-600' : 'text-gray-500'
            }`}
            aria-label="Daily"
            title="Daily"
          >
            <BookOpen size={20} />
            <span>日志</span>
          </button>
          <button
            onClick={() => props.onViewChange('reports')}
            className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 text-xs font-medium ${
              props.currentView === 'reports' ? 'text-indigo-600' : 'text-gray-500'
            }`}
            aria-label="Reports"
            title="Reports"
          >
            <BarChart3 size={20} />
            <span>报表</span>
          </button>
          <button
            onClick={() => setOpen(true)}
            className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 text-xs font-medium text-gray-500"
            aria-label="Account"
            title="Account"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center">
              <span className="text-[10px] font-bold">{userInitial}</span>
            </div>
            <span>用户</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/30"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl border-t border-gray-200 shadow-2xl p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User size={18} className="text-gray-400" />
                <div className="text-sm font-semibold text-gray-900 truncate">{props.user.username}</div>
              </div>
              <button
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {props.user?.isAdmin && props.onOpenModelConfig && (
                <button
                  onClick={() => { setOpen(false); props.onOpenModelConfig?.(); }}
                  className="w-full flex items-center gap-2 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span>⚙️</span>
                  <span>{language === 'zh' ? '模型配置' : 'Model Config'}</span>
                </button>
              )}
              <button
                onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
                className="w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-gray-400" />
                  <span>语言</span>
                </div>
                <span className="text-gray-500">{language === 'en' ? '中文 (简体)' : 'English'}</span>
              </button>
              <button
                onClick={() => { setOpen(false); props.onLogout(); }}
                className="w-full flex items-center gap-2 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut size={16} />
                <span>{language === 'zh' ? '退出登录' : 'Logout'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<'daily' | 'reports'>('daily');
  const [authChecked, setAuthChecked] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState<ApiAuthUser | null>(null);
  const [modelConfigModalOpen, setModelConfigModalOpen] = useState(false);

  const refreshAuth = async () => {
    try {
      const st = await authStatus();
      setNeedsBootstrap(Boolean(st.needsBootstrap));
      setUser(st.user);
    } catch {
      setNeedsBootstrap(false);
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    const handler = () => {
      void refreshAuth();
    };
    window.addEventListener('ls_auth_changed', handler);
    return () => window.removeEventListener('ls_auth_changed', handler);
  }, []);

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
    setCurrentView('daily');
  };

  return (
    <LanguageProvider>
      {!authChecked ? (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 text-gray-500">
          Loading...
        </div>
      ) : user ? (
        <AppStateProvider key={user.id}>
          <div className="flex h-screen w-full overflow-hidden bg-gray-50">
            <div className="hidden lg:block h-full">
              <Sidebar currentView={currentView} onViewChange={setCurrentView} user={user} onLogout={handleLogout} onOpenModelConfig={() => setModelConfigModalOpen(true)} />
            </div>

            <main className="flex-1 h-full overflow-hidden relative pb-16 lg:pb-0">
              {currentView === 'daily' ? <DailyView /> : <ReportsView />}
            </main>

            <MobileNav currentView={currentView} onViewChange={setCurrentView} user={user} onLogout={handleLogout} onOpenModelConfig={() => setModelConfigModalOpen(true)} />
          </div>

          {modelConfigModalOpen && user?.isAdmin && (
            <ModelConfigModal onClose={() => setModelConfigModalOpen(false)} />
          )}
        </AppStateProvider>
      ) : (
        <AuthView
          needsBootstrap={needsBootstrap}
          onAuthed={(u) => {
            setUser(u);
            setCurrentView('daily');
          }}
        />
      )}
    </LanguageProvider>
  );
}

function ModelConfigModal({ onClose }: { onClose: () => void }) {
  const modelConfig = useModelConfig();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">模型配置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <ModelConfig config={modelConfig} variant="modal-content" />
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}