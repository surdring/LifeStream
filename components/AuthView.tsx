import { useMemo, useState, type FC } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { authBootstrap, authLogin, setAuthToken, type ApiAuthUser } from '../services/apiClient';

export const AuthView: FC<{
  needsBootstrap: boolean;
  onAuthed: (user: ApiAuthUser) => void;
}> = ({ needsBootstrap, onAuthed }) => {
  const { language } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (needsBootstrap) return language === 'zh' ? '初始化管理员账号' : 'Bootstrap Admin Account';
    return language === 'zh' ? '登录' : 'Login';
  }, [language, needsBootstrap]);

  const submitLabel = useMemo(() => {
    if (needsBootstrap) return language === 'zh' ? '初始化并登录' : 'Bootstrap & Login';
    return language === 'zh' ? '登录' : 'Login';
  }, [language, needsBootstrap]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = needsBootstrap
        ? await authBootstrap({ username, password })
        : await authLogin({ username, password });
      setAuthToken(resp.token);
      onAuthed(resp.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {needsBootstrap
            ? language === 'zh'
              ? '首次使用需要设置管理员账号密码。'
              : 'First run requires setting an admin username and password.'
            : language === 'zh'
              ? '请输入用户名和密码。'
              : 'Enter your username and password.'}
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600">
              {language === 'zh' ? '用户名' : 'Username'}
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600">
              {language === 'zh' ? '密码' : 'Password'}
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            onClick={() => void handleSubmit()}
            disabled={loading || username.trim() === '' || password.trim() === ''}
            className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (language === 'zh' ? '处理中...' : 'Working...') : submitLabel}
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-400">
          {language === 'zh'
            ? '提示：鉴权已启用，所有 /api 请求需要登录。'
            : 'Note: Auth is enabled; all /api requests require login.'}
        </div>
      </div>
    </div>
  );
};
