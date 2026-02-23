-- app_config テーブル: アプリケーション設定を管理
-- min_client_version でクライアントの最低バージョンを制御する

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- RLS: 全ユーザーが読み取り可能、書き込みは管理者のみ（SQL Editor / Dashboard）
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config"
  ON public.app_config FOR SELECT
  USING (true);

-- 初期値: 現在のバージョンを最低要件として設定
INSERT INTO public.app_config (key, value)
VALUES ('min_client_version', '1.0.1')
ON CONFLICT (key) DO NOTHING;

-- メンテナンスモード: 'true' で有効、それ以外で無効
INSERT INTO public.app_config (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- メンテナンスメッセージ（任意）
INSERT INTO public.app_config (key, value)
VALUES ('maintenance_message', 'ただいまメンテナンス中です。しばらくお待ちください。')
ON CONFLICT (key) DO NOTHING;
