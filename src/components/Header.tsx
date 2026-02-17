import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';

export function Header() {
  const { lang, t, setLang } = useSettingsStore();
  const { isAuthenticated, profile } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="flex justify-between items-center mb-6 py-3 px-4 -mx-4 sm:-mx-6 lg:-mx-8 rounded-b-2xl bg-surface/60 backdrop-blur-md border-b border-white/5">
      <Link to="/" className="flex items-center gap-2.5 no-underline group">
        <span className="text-2xl">🧭</span>
        <h1 className="m-0 text-xl sm:text-2xl font-bold tracking-wide bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-primary transition-all duration-300">
          {t.appTitle}
        </h1>
        <span className="text-[10px] text-text-secondary bg-surface-light/60 px-1.5 py-0.5 rounded-full border border-white/5 font-mono">
          v{__APP_VERSION__}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        {isAuthenticated && profile && (
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-1.5 text-xs bg-surface-light/60 border border-white/8 px-3 py-1.5 rounded-full cursor-pointer hover:bg-surface-hover hover:border-primary/30 transition-all duration-200 truncate max-w-[150px]"
          >
            <span className="text-text-primary font-medium">
              {profile.username || t.ui.profile}
            </span>
            <span className="text-accent font-bold text-[11px] bg-accent-dim px-1.5 py-0.5 rounded-full">
              {Math.round(profile.rating)}
            </span>
          </button>
        )}
        {!isAuthenticated && (
          <button
            onClick={() => navigate('/login')}
            className="text-xs font-medium text-primary bg-primary-glow border border-primary/25 px-3 py-1.5 rounded-full cursor-pointer hover:bg-primary/20 hover:border-primary/50 transition-all duration-200"
          >
            {t.ui.signIn}
          </button>
        )}
        <button
          onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-light/60 border border-white/8 text-text-secondary text-xs font-bold cursor-pointer transition-all duration-200 hover:bg-surface-hover hover:text-primary hover:border-primary/30"
        >
          {lang === 'ja' ? 'EN' : 'JP'}
        </button>
      </div>
    </header>
  );
}
