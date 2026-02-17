import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function SetupUsername() {
  const navigate = useNavigate();
  const { t } = useSettingsStore();
  const { profile, updateProfile, isAuthenticated, isLoading } = useAuthStore();

  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Wait for auth to settle — profile may still be loading after signup
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;

    setSaving(true);
    setError('');
    try {
      await updateProfile({ username: trimmed });
      localStorage.setItem(`setupDone_${profile!.id}`, '1');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (profile) {
      localStorage.setItem(`setupDone_${profile.id}`, '1');
    }
    navigate('/', { replace: true });
  };

  // Show loading while auth state is settling
  if (isLoading || (isAuthenticated && !profile)) {
    return (
      <>
        <Header />
        <div className="glass-card p-5 sm:p-8 animate-fade-in text-center">
          <div className="animate-pulse text-text-secondary">{t.ui.loading}</div>
        </div>
      </>
    );
  }

  if (!profile) return null;

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🧭</div>
          <h2 className="text-xl font-bold text-text-primary mb-2">{t.ui.setupUsername}</h2>
          <p className="text-sm text-text-secondary">{t.ui.setupUsernameDesc}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder={t.ui.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            maxLength={30}
            className="w-full px-4 py-3 rounded-xl bg-surface-light/60 border border-white/8 text-text-primary placeholder:text-text-secondary focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-200 text-center text-lg"
          />

          {error && (
            <p className="text-error text-xs text-center bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !username.trim()}
            className="btn-glow w-full py-3 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {saving ? t.ui.loading : t.ui.confirm}
          </button>
        </form>

        <button
          onClick={handleSkip}
          className="w-full mt-3 py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
        >
          {t.ui.skip}
        </button>
      </div>
    </>
  );
}
