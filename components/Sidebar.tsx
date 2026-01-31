import React from 'react';
import { BookOpen, BarChart3, Feather, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SidebarProps {
  currentView: 'daily' | 'reports';
  onViewChange: (view: 'daily' | 'reports') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const { t, language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

  return (
    <aside className="w-20 lg:w-64 bg-white border-r border-gray-200 flex flex-col items-center lg:items-stretch py-6 z-20 shadow-sm transition-all">
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
          <BookOpen size={22} className={currentView === 'daily' ? 'stroke-[2.5px]' : 'stroke-2'} />
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
          <BarChart3 size={22} className={currentView === 'reports' ? 'stroke-[2.5px]' : 'stroke-2'} />
          <span className="hidden lg:block">{t('sidebar.reports')}</span>
        </button>
      </nav>

      <div className="px-4 w-full mt-auto space-y-4">
        {/* Language Toggle */}
        <button 
          onClick={toggleLanguage}
          className="w-full flex items-center justify-center lg:justify-start gap-2 p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-xs font-bold tracking-wide"
        >
            <Globe size={16} />
            <span className="hidden lg:block">
                {language === 'en' ? 'English' : '中文 (简体)'}
            </span>
            <span className="lg:hidden">
                {language === 'en' ? 'EN' : '中'}
            </span>
        </button>

        <div className="hidden lg:block bg-gray-50 p-4 rounded-xl border border-gray-100">
          <p className="text-xs text-gray-500 font-medium">{t('sidebar.proTip')}</p>
          <p className="text-xs text-gray-400 mt-1">
            {t('sidebar.proTipDesc')}
          </p>
        </div>
      </div>
    </aside>
  );
};