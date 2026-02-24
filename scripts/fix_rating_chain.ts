/**
 * Fix broken rating chain in match_history.
 *
 * Bug: When fetchProfile() returned stale data after a submitRatedAnswer RPC,
 * subsequent matches in the same session (and beyond) used the same
 * user_rating_before instead of chaining from the previous user_rating_after.
 *
 * This script:
 * 1. Fetches all match_history for a given user, ordered by created_at ASC
 * 2. Replays ALL matches from the very first one using Glicko-2
 * 3. For records WITH opponent snapshots, uses the recorded opponent rating/rd/vol
 * 4. For records WITHOUT opponent snapshots (pre-migration), uses question_rating_before
 *    with default rd=350, vol=0.06 as the opponent
 * 5. Outputs SQL UPDATE statements for review / execution
 *
 * Usage:
 *   USER_ID=<uuid> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/fix_rating_chain.ts
 *
 * Prerequisites:
 *   USER_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars must be set.
 */

import { createClient } from '@supabase/supabase-js';
import rate from 'glicko2-lite';

// ── Config ────────────────────────────────────────────────────────────
const USER_ID = process.env.USER_ID;
const TOLERANCE = 0.001; // floating-point comparison tolerance

if (!USER_ID) {
  console.error('Missing USER_ID env var (target user UUID)');
  process.exit(1);
}

// ── Supabase client (service role for direct DB access) ──────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Glicko-2 helper (mirrors src/lib/glicko2.ts) ────────────────────

interface GlickoRating {
  rating: number;
  rd: number;
  vol: number;
}

function calculateNewPlayerRating(
  player: GlickoRating,
  opponent: GlickoRating,
  score: 0 | 1,
): GlickoRating {
  const result = rate(player.rating, player.rd, player.vol, [
    [opponent.rating, opponent.rd, score],
  ]);
  return { rating: result.rating, rd: result.rd, vol: result.vol };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Check if a record has complete opponent snapshot data */
function hasOpponentSnapshot(m: MatchRow): boolean {
  return m.opponent_rating !== null && m.opponent_rd !== null && m.opponent_vol !== null;
}

/** Check if a record has complete "after" snapshot data */
function hasAfterSnapshot(m: MatchRow): boolean {
  return m.user_rating_after !== null && m.user_rd_after !== null && m.user_vol_after !== null;
}

/** Map match_history.mode to its rating group (= user_mode_ratings.mode).
 *  Mirrors v_rating_mode logic in submit_rated_answer().
 *
 *  survival_rated / challenge_rated  → 'global'   (shared chain)
 *  starter_rated                     → 'starter_rated'  (independent)
 *  asia_rated                        → 'asia_rated'     (independent)
 *  europe_rated                      → 'europe_rated'   (independent)
 *  africa_rated                      → 'africa_rated'   (independent)
 *  americas_rated                    → 'americas_rated'  (independent)
 *  oceania_rated                     → 'oceania_rated'  (independent)
 */
function modeToRatingGroup(mode: string): string {
  if (mode === 'survival_rated' || mode === 'challenge_rated') return 'global';
  return mode;
}

// ── Match row type ──────────────────────────────────────────────────

interface MatchRow {
  id: number;
  session_id: string;
  mode: string;
  status: 'win' | 'lose' | 'pending';
  user_rating_before: number;
  user_rating_after: number | null;
  user_rd_before: number | null;
  user_rd_after: number | null;
  user_vol_before: number | null;
  user_vol_after: number | null;
  rating_change: number | null;
  question_rating_before: number;
  opponent_rating: number | null;
  opponent_rd: number | null;
  opponent_vol: number | null;
  created_at: string;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching match_history for user ${USER_ID} ...`);

  // Paginate to get ALL records (Supabase default limit is 1000)
  const allMatches: MatchRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error: fetchError } = await supabase
      .from('match_history')
      .select(
        'id, session_id, mode, status, user_rating_before, user_rating_after, ' +
          'user_rd_before, user_rd_after, user_vol_before, user_vol_after, ' +
          'rating_change, opponent_rating, opponent_rd, opponent_vol, created_at',
      )
      .eq('user_id', USER_ID)
      .in('status', ['win', 'lose'])
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      console.error('Error fetching matches:', fetchError);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allMatches.push(...(data as MatchRow[]));
      offset += data.length;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }

  const matches = allMatches;

  if (matches.length === 0) {
    console.log('No matches found.');
    return;
  }

  console.log(`Found ${matches.length} resolved matches.`);

  // Count records with/without opponent snapshots
  const withSnapshot = matches.filter((m) => hasOpponentSnapshot(m as MatchRow)).length;
  const withoutSnapshot = matches.length - withSnapshot;
  console.log(`  With opponent snapshot: ${withSnapshot}`);
  console.log(`  Without (anchor-only): ${withoutSnapshot}`);

  // ── Walk the chain ────────────────────────────────────────────────

  type UpdateEntry = {
    id: number;
    session_id: string;
    status: string;
    old: {
      user_rating_before: number;
      user_rating_after: number | null;
      user_rd_before: number | null;
      user_rd_after: number | null;
      user_vol_before: number | null;
      user_vol_after: number | null;
      rating_change: number | null;
    };
    new: {
      user_rating_before: number;
      user_rating_after: number;
      user_rd_before: number;
      user_rd_after: number;
      user_vol_before: number;
      user_vol_after: number;
      rating_change: number;
    };
  };

  interface GroupState {
    running: GlickoRating | null;
    /** True when running.rd/vol are estimated (not from real snapshot data) */
    rdEstimated: boolean;
    fixingChain: boolean;
    justLeftAnchorZone: boolean;
    breakCount: number;
    anchorCount: number;
  }

  const groupStates = new Map<string, GroupState>();
  function getGroupState(group: string): GroupState {
    if (!groupStates.has(group)) {
      groupStates.set(group, {
        running: null,
        rdEstimated: false,
        fixingChain: false,
        justLeftAnchorZone: false,
        breakCount: 0,
        anchorCount: 0,
      });
    }
    return groupStates.get(group)!;
  }

  const updates: UpdateEntry[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i] as MatchRow;
    const group = modeToRatingGroup(m.mode);
    const gs = getGroupState(group);

    // ─ Records without opponent snapshot: ANCHOR point ─
    if (!hasOpponentSnapshot(m)) {
      if (hasAfterSnapshot(m)) {
        // Full after snapshot — reliable anchor
        gs.running = {
          rating: m.user_rating_after!,
          rd: m.user_rd_after!,
          vol: m.user_vol_after!,
        };
        gs.rdEstimated = false;
      } else if (m.user_rating_after !== null) {
        // Partial: rating_after exists but no rd/vol_after.
        // Preserve the rating chain; carry forward rd/vol from previous state
        // or use conservative defaults. The next snapshot record will refine rd/vol.
        gs.running = {
          rating: m.user_rating_after,
          rd: gs.running?.rd ?? 350,
          vol: gs.running?.vol ?? 0.06,
        };
        gs.rdEstimated = true;
      } else {
        // No after data at all — reset
        gs.running = null;
        gs.rdEstimated = false;
      }
      if (gs.fixingChain) {
        console.log(`  ℹ Anchor point (no snapshot) at id=${m.id} [${group}] — chain fix paused`);
      }
      gs.fixingChain = false;
      gs.justLeftAnchorZone = true;
      gs.anchorCount++;
      continue;
    }

    // ─ Records WITH opponent snapshot ─

    if (gs.running === null) {
      gs.running = {
        rating: m.user_rating_before,
        rd: m.user_rd_before!,
        vol: m.user_vol_before!,
      };
      gs.justLeftAnchorZone = false;
    }

    if (gs.justLeftAnchorZone) {
      if (gs.rdEstimated && m.user_rd_before !== null && m.user_vol_before !== null) {
        // Anchor had rating but no real rd/vol — adopt this record's rd/vol
        // while keeping the anchor's more trustworthy rating.
        console.log(
          `  ℹ Anchor→snapshot transition at id=${m.id} [${group}]: ` +
            `anchor rating=${gs.running.rating.toFixed(2)}, ` +
            `adopting record rd=${m.user_rd_before.toFixed(2)}, vol=${m.user_vol_before.toFixed(6)}`,
        );
        gs.running = {
          rating: gs.running.rating, // trust anchor's rating
          rd: m.user_rd_before, // adopt record's rd (best available)
          vol: m.user_vol_before, // adopt record's vol
        };
        gs.rdEstimated = false;
      }
      gs.justLeftAnchorZone = false;
    }

    // Check chain continuity
    const ratingMatch = Math.abs(m.user_rating_before - gs.running.rating) < TOLERANCE;
    const rdMatch = Math.abs((m.user_rd_before ?? 0) - gs.running.rd) < TOLERANCE;

    if (ratingMatch && rdMatch && !gs.fixingChain) {
      if (hasAfterSnapshot(m)) {
        gs.running = {
          rating: m.user_rating_after!,
          rd: m.user_rd_after!,
          vol: m.user_vol_after!,
        };
      }
      continue;
    }

    // ─ Chain break detected or we're in a fixing region ─
    if (!gs.fixingChain) {
      gs.breakCount++;
      console.log(
        `\n⚠ Chain break #${gs.breakCount} at match id=${m.id} (idx ${i}) [${group}]:` +
          `\n  Expected before: rating=${gs.running.rating.toFixed(5)}, rd=${gs.running.rd.toFixed(5)}` +
          `\n  Actual   before: rating=${m.user_rating_before.toFixed(5)}, rd=${(m.user_rd_before ?? 0).toFixed(5)}` +
          `\n  Session: ${m.session_id}` +
          `\n  Status: ${m.status}`,
      );
      gs.fixingChain = true;
    }

    // Re-calculate Glicko-2 with correct running base
    const opponent: GlickoRating = {
      rating: m.opponent_rating!,
      rd: m.opponent_rd!,
      vol: m.opponent_vol!,
    };
    const score: 0 | 1 = m.status === 'win' ? 1 : 0;
    const newPlayerRating = calculateNewPlayerRating(gs.running, opponent, score);
    const ratingChange = newPlayerRating.rating - gs.running.rating;

    const needsUpdate =
      Math.abs(m.user_rating_before - gs.running.rating) > TOLERANCE ||
      Math.abs((m.user_rating_after ?? 0) - newPlayerRating.rating) > TOLERANCE ||
      Math.abs((m.user_rd_before ?? 0) - gs.running.rd) > TOLERANCE ||
      Math.abs((m.user_rd_after ?? 0) - newPlayerRating.rd) > TOLERANCE;

    if (needsUpdate) {
      updates.push({
        id: m.id,
        session_id: m.session_id,
        status: m.status,
        old: {
          user_rating_before: m.user_rating_before,
          user_rating_after: m.user_rating_after,
          user_rd_before: m.user_rd_before,
          user_rd_after: m.user_rd_after,
          user_vol_before: m.user_vol_before,
          user_vol_after: m.user_vol_after,
          rating_change: m.rating_change,
        },
        new: {
          user_rating_before: gs.running.rating,
          user_rating_after: newPlayerRating.rating,
          user_rd_before: gs.running.rd,
          user_rd_after: newPlayerRating.rd,
          user_vol_before: gs.running.vol,
          user_vol_after: newPlayerRating.vol,
          rating_change: ratingChange,
        },
      });
    } else if (gs.fixingChain) {
      console.log(`  ✓ Chain healed at id=${m.id} [${group}] — values match after recalculation`);
      gs.fixingChain = false;
    }

    gs.running = newPlayerRating;
  }

  // ── Report ──────────────────────────────────────────────────────────

  // Aggregate stats across all rating groups
  let totalBreaks = 0;
  let totalAnchors = 0;
  for (const [, gs] of groupStates) {
    totalBreaks += gs.breakCount;
    totalAnchors += gs.anchorCount;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total matches scanned: ${matches.length}`);
  console.log(`Rating groups: ${[...groupStates.keys()].join(', ')}`);
  console.log(`Anchor points (no snapshot): ${totalAnchors}`);
  console.log(`Chain breaks found: ${totalBreaks}`);
  console.log(`Records to update: ${updates.length}`);

  for (const [group, gs] of groupStates) {
    if (gs.running) {
      console.log(`\n[${group}] Final chained rating: ${gs.running.rating.toFixed(5)}`);
      console.log(`[${group}] Final chained RD:     ${gs.running.rd.toFixed(5)}`);
      console.log(`[${group}] Final chained vol:    ${gs.running.vol.toFixed(13)}`);
    }
  }

  if (updates.length === 0) {
    console.log('\nNo updates needed. All chains are intact.');
    return;
  }

  // Show summary grouped by session
  console.log('\n── Update Summary ──');
  let currentSession = '';
  for (const u of updates) {
    if (u.session_id !== currentSession) {
      currentSession = u.session_id;
      console.log(`\n  Session: ${currentSession}`);
    }
    const delta = u.new.user_rating_after - (u.old.user_rating_after ?? 0);
    console.log(
      `    id=${u.id} [${u.status}]` +
        `  before: ${u.old.user_rating_before.toFixed(2)} → ${u.new.user_rating_before.toFixed(2)}` +
        `  after: ${(u.old.user_rating_after ?? 0).toFixed(2)} → ${u.new.user_rating_after.toFixed(2)}` +
        `  (Δ = ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
    );
  }

  // ── Generate SQL ────────────────────────────────────────────────────

  const sqlLines: string[] = [];
  sqlLines.push('-- Fix rating chain for user ' + USER_ID);
  sqlLines.push('-- Generated by scripts/fix_rating_chain.ts');
  sqlLines.push(`-- ${new Date().toISOString()}`);
  sqlLines.push(`-- Chain breaks: ${totalBreaks}, Records updated: ${updates.length}`);
  sqlLines.push('BEGIN;');
  sqlLines.push('');

  currentSession = '';
  for (const u of updates) {
    if (u.session_id !== currentSession) {
      currentSession = u.session_id;
      sqlLines.push(`-- Session: ${currentSession}`);
    }
    sqlLines.push(
      `-- id=${u.id} [${u.status}]: before ${u.old.user_rating_before.toFixed(5)} → ${u.new.user_rating_before.toFixed(5)}, after ${(u.old.user_rating_after ?? 0).toFixed(5)} → ${u.new.user_rating_after.toFixed(5)}`,
    );
    sqlLines.push(
      `UPDATE public.match_history SET` +
        `\n  user_rating_before = ${u.new.user_rating_before},` +
        `\n  user_rating_after = ${u.new.user_rating_after},` +
        `\n  user_rd_before = ${u.new.user_rd_before},` +
        `\n  user_rd_after = ${u.new.user_rd_after},` +
        `\n  user_vol_before = ${u.new.user_vol_before},` +
        `\n  user_vol_after = ${u.new.user_vol_after},` +
        `\n  rating_change = ${u.new.rating_change}` +
        `\nWHERE id = ${u.id} AND user_id = '${USER_ID}';`,
    );
    sqlLines.push('');
  }

  // Update user_mode_ratings for each rating group
  for (const [group, gs] of groupStates) {
    if (gs.running) {
      sqlLines.push(`-- Update user_mode_ratings for ${group}`);
      sqlLines.push(
        `UPDATE public.user_mode_ratings SET` +
          `\n  rating = ${gs.running.rating},` +
          `\n  rd = ${gs.running.rd},` +
          `\n  vol = ${gs.running.vol}` +
          `\nWHERE user_id = '${USER_ID}' AND mode = '${group}';`,
      );
      sqlLines.push('');
    }
  }

  sqlLines.push('COMMIT;');

  const sql = sqlLines.join('\n');
  console.log('\n── Generated SQL ──\n');
  console.log(sql);

  // Write to file
  const fs = await import('fs');
  const outPath = 'scripts/fix_rating_chain_output.sql';
  fs.writeFileSync(outPath, sql, 'utf-8');
  console.log(`\nSQL written to ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
