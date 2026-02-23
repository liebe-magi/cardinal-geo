import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function About() {
  const { lang, t } = useSettingsStore();
  const formUrl = import.meta.env.VITE_CONTACT_FORM_URL;

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-6 sm:p-8 animate-fade-in max-w-lg lg:max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold mb-6 text-text-primary border-b border-white/10 pb-4">
          {t.ui.about}
        </h2>

        {lang === 'ja' ? (
          <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">データの出典について</h3>
              <p>
                本アプリ内で使用している世界の首都および位置座標（緯度経度）データは、アマノ技研様が公開している「
                <a
                  href="https://amano-tec.com/data/world.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  世界の首都の位置データ
                </a>
                」を利用・改変して作成しています。
              </p>
            </section>

            {formUrl && (
              <section>
                <h3 className="text-lg font-bold text-text-primary mb-2">お問い合わせについて</h3>
                <p>
                  本アプリに関するご意見や不具合報告等の受付には、Googleフォームを利用しています。
                  <br />
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-cyan-300 transition-colors underline"
                  >
                    こちらのお問い合わせフォーム
                  </a>
                  よりご連絡ください。
                </p>
              </section>
            )}

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">Special Thanks</h3>
              <p className="mb-2">
                ベータテストから多大なるご協力をいただいた以下の方々に、心より感謝申し上げます。
                <br />
                不具合の報告から、システムやUI/UXの改善提案まで、多岐にわたる貴重なフィードバックをいただき、本アプリの品質向上に大きく貢献していただきました。
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-1 ml-2">
                <li>nave</li>
                <li>AZ</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-4">開発者について</h3>
              <div className="flex items-center gap-4 mb-4">
                <img
                  src="/author.png"
                  alt="りーべ (liebe-magi)"
                  className="w-12 h-12 rounded-full border-2 border-white/10 object-cover"
                />
                <p className="text-base font-semibold text-text-primary">りーべ (liebe-magi)</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <a
                  href="https://github.com/liebe-magi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://x.com/liebe_magi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4l11.733 16h4.267l-11.733 -16z"></path>
                    <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path>
                  </svg>
                  X (Twitter)
                </a>
                <a
                  href="https://bsky.app/profile/liebe-magi.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.81 9.497 7.822 4.308 4.557-5.073 1.082-6.498-2.83-7.078a5.922 5.922 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.789.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
                  </svg>
                  Bluesky
                </a>
                <a
                  href="https://hackfront.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  Blog
                </a>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">Data Sources</h3>
              <p>
                The world capitals and their coordinates (latitude/longitude) data used in this
                application are created by utilizing and modifying the "
                <a
                  href="https://amano-tec.com/data/world.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  World Capitals Location Data
                </a>
                " published by Amano Spatial Technologies Institute.
              </p>
            </section>

            {formUrl && (
              <section>
                <h3 className="text-lg font-bold text-text-primary mb-2">Contact Us</h3>
                <p>
                  This application uses Google Forms to receive feedback and bug reports.
                  <br />
                  Please contact us via{' '}
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-cyan-300 transition-colors underline"
                  >
                    this inquiry form
                  </a>
                  .
                </p>
              </section>
            )}

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">Special Thanks</h3>
              <p className="mb-2">
                We would like to express our deepest gratitude to the following individuals for
                their tremendous support since the beta testing phase.
                <br />
                Their invaluable feedback, ranging from bug reports to suggestions for system and
                UI/UX improvements, has greatly contributed to enhancing the quality of this
                application.
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-1 ml-2">
                <li>nave</li>
                <li>AZ</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-4">About the Developer</h3>
              <div className="flex items-center gap-4 mb-4">
                <img
                  src="/author.png"
                  alt="liebe-magi"
                  className="w-12 h-12 rounded-full border-2 border-white/10 object-cover"
                />
                <p className="text-base font-semibold text-text-primary">liebe-magi</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <a
                  href="https://github.com/liebe-magi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://x.com/liebe_magi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4l11.733 16h4.267l-11.733 -16z"></path>
                    <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path>
                  </svg>
                  X (Twitter)
                </a>
                <a
                  href="https://bsky.app/profile/liebe-magi.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.81 9.497 7.822 4.308 4.557-5.073 1.082-6.498-2.83-7.078a5.922 5.922 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.789.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
                  </svg>
                  Bluesky
                </a>
                <a
                  href="https://hackfront.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-cyan-300 transition-colors underline"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  Blog
                </a>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
