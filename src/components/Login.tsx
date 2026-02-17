import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function Login() {
  const navigate = useNavigate();
  const { t } = useSettingsStore();
  const { signInWithGoogle, signInWithEmail, signUp } = useAuthStore();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Header />
        <div className="glass-card p-6 animate-fade-in text-center">
          <p className="text-text-secondary mb-4">
            Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
            environment variables.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
          >
            {t.ui.backToTop}
          </button>
        </div>
      </>
    );
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, '');
        navigate('/setup');
      } else {
        await signInWithEmail(email, password);
        navigate('/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in max-w-md mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-6 text-text-primary">
          {isSignUp ? t.ui.signUp : t.ui.signIn}
        </h2>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-2 mb-6">
          <button
            onClick={signInWithGoogle}
            className="w-full py-3 rounded-xl bg-white text-gray-800 font-semibold cursor-pointer hover:bg-gray-100 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2.5"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google {t.ui.signInWith}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-text-secondary text-xs font-medium">or</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder={t.ui.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-surface-light/60 border border-white/8 text-text-primary placeholder:text-text-secondary focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-200"
          />
          <input
            type="password"
            placeholder={t.ui.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-surface-light/60 border border-white/8 text-text-primary placeholder:text-text-secondary focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-200"
          />

          {error && (
            <p className="text-error text-xs text-center bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-glow w-full py-3 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? t.ui.loading : isSignUp ? t.ui.signUp : t.ui.signIn}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-4 text-primary text-sm cursor-pointer bg-transparent border-none hover:text-cyan-300 transition-colors"
        >
          {isSignUp ? t.ui.signIn : t.ui.signUp}
        </button>

        <button
          onClick={() => navigate('/')}
          className="w-full mt-2 py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
        >
          {t.ui.backToTop}
        </button>
      </div>
    </>
  );
}
