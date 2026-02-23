import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { clearLocalGameData, collectLocalDataForMigration } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { migrateLocalDataToDb } from '../lib/supabaseApi';

export interface Profile {
  id: string;
  username: string;
  rating: number;
  rd: number;
  vol: number;
  modeRatings: Record<string, { rating: number; rd: number; vol: number }>;
  best_score_survival_rated: number;
  best_score_survival_unrated: number;
  weakness_scores: Record<string, number>;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, 'username'>>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    if (!supabase) {
      set({ isLoading: false });
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        set({
          user: session.user,
          session,
          isAuthenticated: true,
        });
        await get().fetchProfile();
      }

      // Listen for auth changes (store unsubscribe for proper cleanup)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          set({
            user: session.user,
            session,
            isAuthenticated: true,
          });
          await get().fetchProfile();
        } else {
          set({
            user: null,
            session: null,
            profile: null,
            isAuthenticated: false,
          });
        }
      });
      void subscription; // Retained for app-lifetime; unsubscribe if cleanup is needed

      // Manually start auto-refresh since autoRefreshToken is disabled on the client
      supabase.auth.startAutoRefresh();

      // Manage auto-refresh lifecycle based on tab visibility.
      // This prevents the GoTrue client from entering a frozen state
      // when the browser tab is backgrounded and then restored.
      const onVisibilityChange = () => {
        if (!supabase) return;
        if (document.visibilityState === 'visible') {
          supabase.auth.startAutoRefresh();
        } else {
          supabase.auth.stopAutoRefresh();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  },

  signInWithEmail: async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },

  signUp: async (email: string, password: string, _username: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({
      user: null,
      session: null,
      profile: null,
      isAuthenticated: false,
    });
  },

  fetchProfile: async () => {
    if (!supabase) return;
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    const { data: modeRatingsData, error: modeRatingsError } = await supabase
      .from('user_mode_ratings')
      .select('mode, rating, rd, vol')
      .eq('user_id', user.id);

    if (modeRatingsError) {
      console.error('Error fetching mode ratings:', modeRatingsError);
    }

    const modeRatings: Record<string, { rating: number; rd: number; vol: number }> = {};
    if (modeRatingsData) {
      for (const row of modeRatingsData) {
        modeRatings[row.mode] = { rating: row.rating, rd: row.rd, vol: row.vol };
      }
    }

    const profile = { ...data, modeRatings } as Profile;
    set({ profile });

    // One-time data migration: move LocalStorage game data to Supabase
    const localData = collectLocalDataForMigration();
    if (localData) {
      const migrated = await migrateLocalDataToDb(user.id, localData);
      if (migrated) {
        clearLocalGameData();
        // Re-fetch profile (including mode ratings) to get merged data
        await get().fetchProfile();
        return;
      }
    }
  },

  updateProfile: async (updates: Partial<Pick<Profile, 'username'>>) => {
    if (!supabase) return;
    const user = get().user;
    if (!user) return;

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);

    if (error) throw error;
    await get().fetchProfile();
  },
}));
