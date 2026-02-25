import { Link } from 'react-router-dom';
import { getSortedUpdateNotes } from '../lib/updates';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function Updates() {
  const { lang } = useSettingsStore();
  const notes = getSortedUpdateNotes();

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-6 sm:p-8 animate-fade-in max-w-lg lg:max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3 mb-6 border-b border-white/10 pb-4">
          <h2 className="text-2xl font-bold text-text-primary">
            {lang === 'ja' ? '更新履歴' : 'Updates'}
          </h2>
          <Link
            to="/play"
            className="text-xs sm:text-sm text-text-secondary hover:text-primary transition-colors"
          >
            {lang === 'ja' ? 'モード選択に戻る' : 'Back to Modes'}
          </Link>
        </div>

        {notes.length === 0 ? (
          <div className="text-sm text-text-secondary">
            {lang === 'ja' ? '現在、更新情報はありません。' : 'No updates yet.'}
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <article
                key={note.id}
                className="rounded-xl border border-white/10 bg-surface-light/30 p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center text-xs font-bold px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/25 font-mono">
                      v{note.version}
                    </span>
                  </div>
                  <span className="text-xs text-text-secondary font-mono">{note.publishedAt}</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-text-primary mb-1.5">
                  {note.title[lang]}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">{note.summary[lang]}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-text-secondary list-disc list-inside">
                  {note.changes[lang].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
