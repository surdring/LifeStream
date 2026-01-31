import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DailyView } from './components/DailyView';
import { ReportsView } from './components/ReportsView';
import { AppStateProvider } from './context/AppStateContext';
import { LanguageProvider } from './context/LanguageContext';

export default function App() {
  const [currentView, setCurrentView] = useState<'daily' | 'reports'>('daily');

  return (
    <LanguageProvider>
      <AppStateProvider>
        <div className="flex h-screen w-full overflow-hidden bg-gray-50">
          <Sidebar currentView={currentView} onViewChange={setCurrentView} />
          
          <main className="flex-1 h-full overflow-hidden relative">
            {currentView === 'daily' ? (
              <DailyView />
            ) : (
              <ReportsView />
            )}
          </main>
        </div>
      </AppStateProvider>
    </LanguageProvider>
  );
}