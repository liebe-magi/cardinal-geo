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
                本アプリ内で使用している世界の首都および位置座標（緯度経度）データは、アマノ技研が公開している「
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
                " published by Amano Tec.
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
          </div>
        )}
      </div>
    </>
  );
}
