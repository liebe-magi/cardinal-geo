import { supabase } from './supabase';
export type RankingTab = 'rating' | 'survival_rated' | 'daily' | 'daily_avg';
export interface RankingEntry {
  id: string;
  username: string;
  value: number;
  extra?: string;
  is_self: boolean;
}
export async function getLeaderboard(
  kind: RankingTab,
  mode: string,
  day: string,
): Promise<RankingEntry[]> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc('public_leaderboard', {
    p_kind: kind,
    p_mode: mode,
    p_day: day,
  });
  if (error) throw error;
  return data ?? [];
}
export async function getCityStatistics(ascending: boolean) {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase
    .from('city_ratings')
    .select('country_code, rating, play_count')
    .order('rating', { ascending })
    .limit(198);
  if (error) throw error;
  return data ?? [];
}
export async function getActivityStatistics() {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc('get_global_activity_stats');
  if (error) throw error;
  return data?.[0] ?? null;
}
