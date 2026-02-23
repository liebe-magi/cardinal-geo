import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function PrivacyPolicy() {
  const { lang, t } = useSettingsStore();

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-6 sm:p-8 animate-fade-in max-w-lg lg:max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold mb-6 text-text-primary border-b border-white/10 pb-4">
          {t.ui.privacyPolicy}
        </h2>

        {lang === 'ja' ? (
          <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                1. ユーザー認証（Google OAuth）による情報取得について
              </h3>
              <p>
                本アプリでは、ユーザー登録およびログイン、ゲームプレイデータ（レーティング等）の保存を目的として、Google社のOAuth認証を利用しています。認証時に取得した情報（メールアドレス、氏名、プロフィール画像等の基本情報）は、アカウントの識別および本サービスの提供以外の目的には使用いたしません。また、法令に基づく場合を除き、第三者へ提供することはありません。
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                2. アクセス解析ツールの利用について
              </h3>
              <p>
                本アプリでは、利用状況の分析およびサービス改善のため、Google社が提供する「Google
                Analytics」を利用しています。Google
                Analyticsはトラフィックデータの収集のためにCookie（クッキー）を使用しています。このトラフィックデータは匿名で収集されており、個人を特定するものではありません。
                <br />
                この機能は、お使いのブラウザの設定でCookieを無効にすることで収集を拒否することが可能です。詳細については、
                <a
                  href="https://marketingplatform.google.com/about/analytics/terms/jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  Google Analytics利用規約
                </a>
                および
                <a
                  href="https://policies.google.com/privacy?hl=ja"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  Google社のプライバシーポリシー
                </a>
                をご確認ください。
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                3. お問い合わせ窓口（Googleフォーム）について
              </h3>
              <p>
                本アプリに関するご意見や不具合報告等の受付には、Googleフォームを利用しています。お問い合わせフォームに入力された個人情報（メールアドレスやお問い合わせ内容等）は、ご本人への回答およびサポート対応の目的にのみ利用いたします。なお、入力されたデータはGoogle社のサーバーに保存され、同社のプライバシーポリシーに基づいて管理されます。
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                1. User Authentication (Google OAuth)
              </h3>
              <p>
                This application uses Google OAuth authentication for the purpose of user
                registration, login, and saving gameplay data (such as ratings). The information
                obtained during authentication (basic information such as email address, name, and
                profile picture) will not be used for any purpose other than account identification
                and the provision of this service. Furthermore, it will not be provided to third
                parties except as required by law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                2. Use of Access Analysis Tools
              </h3>
              <p>
                This application uses "Google Analytics," provided by Google, to analyze usage and
                improve services. Google Analytics uses cookies to collect traffic data. This
                traffic data is collected anonymously and does not personally identify individuals.
                <br />
                You can refuse the collection of this data by disabling cookies in your browser
                settings. For more details, please review the{' '}
                <a
                  href="https://marketingplatform.google.com/about/analytics/terms/us/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  Google Analytics Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="https://policies.google.com/privacy?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-cyan-300 transition-colors underline"
                >
                  Google Privacy Policy
                </a>
                .
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                3. Contact Us (Google Forms)
              </h3>
              <p>
                This application uses Google Forms to receive feedback and bug reports. Personal
                information entered in the inquiry form (such as email addresses and inquiry
                details) will be used solely for the purpose of replying to you and providing
                support. The entered data is saved on Google's servers and managed under their
                privacy policy.
              </p>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
