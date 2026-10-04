import { supabase } from './supabase';
import type { Lang } from './i18n';
import type { ShareSnapshot } from './sharing';
export async function createShare(
  id: string,
  sessionId: string | null,
  lang: Lang,
): Promise<ShareSnapshot> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc('create_share_snapshot', {
    p_request_id: id,
    p_session_id: sessionId,
    p_lang: lang,
  });
  if (error || !data) throw error ?? new Error('Snapshot unavailable');
  return data;
}
export async function revokeShare(id: string) {
  if (!supabase) throw new Error('Database unavailable');
  const { error } = await supabase.rpc('revoke_share_snapshot', { p_public_id: id });
  if (error) throw error;
}
export async function listMyShares(): Promise<{ id: string; createdAt: string; kind: string }[]> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc('list_my_shares');
  if (error) throw error;
  return data;
}
