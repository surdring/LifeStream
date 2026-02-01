import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DailyView } from './components/DailyView';
import { ReportsView } from './components/ReportsView';
import { AuthView } from './components/AuthView';
import { AppStateProvider } from './context/AppStateContext';
import { LanguageProvider } from './context/LanguageContext';
import { authStatus, clearAuthToken, type ApiAuthUser } from './services/apiClient';

export default function App() {
  const [currentView, setCurrentView] = useState<'daily' | 'reports'>('daily');
  const [authChecked, setAuthChecked] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState<ApiAuthUser | null>(null);

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
            <Sidebar currentView={currentView} onViewChange={setCurrentView} user={user} onLogout={handleLogout} />

            <main className="flex-1 h-full overflow-hidden relative">
              {currentView === 'daily' ? <DailyView /> : <ReportsView />}
            </main>
          </div>
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