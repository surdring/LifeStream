import { useEffect, useRef, useState, type FC } from 'react';
import { BookOpen, BarChart3, Feather, Globe, LogOut, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SidebarProps {
  currentView: 'daily' | 'reports';
  onViewChange: (view: 'daily' | 'reports') => void;
  user?: { username: string } | null;
  onLogout?: () => void;
}

export const Sidebar: FC<SidebarProps> = ({ currentView, onViewChange, user, onLogout }) => {
  const { t, language, setLanguage } = useLanguage();
  const userInitial = user?.username?.trim()?.slice(0, 1).toUpperCase() ?? '?';
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = accountMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [accountMenuOpen]);

  return (
    <aside className="w-20 lg:w-64 h-full bg-white border-r border-gray-200 flex flex-col items-center lg:items-stretch py-6 z-20 shadow-sm transition-all">
      <div className="flex items-center justify-center lg:justify-start lg:px-6 mb-8 gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
          <Feather size={20} />
        </div>
        <span className="hidden lg:block text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
          LifeStream
        </span>
      </div>

      <nav className="flex-1 w-full px-2 space-y-2">
        <button
          onClick={() => onViewChange('daily')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
            currentView === 'daily'
              ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
          }`}
          title={t('sidebar.dailyLog')}
        >
          <BookOpen size={22} className="stroke-2" />
          <span className="hidden lg:block">{t('sidebar.dailyLog')}</span>
        </button>

        <button
          onClick={() => onViewChange('reports')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
            currentView === 'reports'
              ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
          }`}
          title={t('sidebar.reports')}
        >
          <BarChart3 size={22} className="stroke-2" />
          <span className="hidden lg:block">{t('sidebar.reports')}</span>
        </button>

        <div className="hidden lg:block mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500 font-medium">{t('sidebar.proTip')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('sidebar.proTipDesc')}</p>
        </div>
      </nav>

      <div className="px-4 w-full mt-auto space-y-4">
        {user && onLogout && (
          <div ref={accountMenuRef} className="hidden lg:block relative">
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50 text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <span className="text-xs font-bold">{userInitial}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-gray-500">{language === 'zh' ? '当前用户' : 'Account'}</p>
                <p className="truncate text-sm font-semibold text-gray-900">{user.username}</p>
              </div>
              <MoreHorizontal size={18} className="text-gray-400" />
            </button>

            {accountMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                {/* Language Toggle */}
                <button
                  onClick={() => {
                    toggleLanguage();
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Globe size={14} className="text-gray-400" />
                  <span>{language === 'en' ? '中文 (简体)' : 'English'}</span>
                </button>
                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <LogOut size={14} className="text-gray-400" />
                  <span>{language === 'zh' ? '退出登录' : 'Logout'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};