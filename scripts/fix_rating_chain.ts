/**
 * Fix broken rating chain in match_history.
 *
 * Bug: When fetchProfile() returned stale data after a submitRatedAnswer RPC,
 * subsequent matches in the same session (and beyond) used the same
 * user_rating_before instead of chaining from the previous user_rating_after.
 *
 * This script:
 * 1. Fetches all match_history for a given user, ordered by created_at ASC
 * 2. Skips records without opponent snapshots (pre-migration), using them as anchors
 * 3. For records WITH opponent snapshots, detects chain breaks and re-calculates
 * 4. Outputs SQL UPDATE statements for review / execution
 *
 * Key design: records WITHOUT opponent_rating/rd/vol are treated as trust-the-DB
 * anchor points — their values are accepted as-is and used to set the running state.
 * Only records WITH complete opponent snapshots can be re-calculated.
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
  return (
    m.opponent_rating !== null &&
    m.opponent_rd !== null &&
    m.opponent_vol !== null &&
    m.user_rd_before !== null &&
    m.user_rd_before > 0 &&
    m.user_vol_before !== null &&
    m.user_vol_before > 0
  );
}

/** Check if a record has complete "after" snapshot data */
function hasAfterSnapshot(m: MatchRow): boolean {
  return (
    m.user_rating_after !== null &&
    m.user_rd_after !== null &&
    m.user_rd_after > 0 &&
    m.user_vol_after !== null &&
    m.user_vol_after > 0
  );
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

  const updates: UpdateEntry[] = [];
  let running: GlickoRating | null = null; // null = not yet anchored
  let fixingChain = false; // currently in a broken chain region
  let justLeftAnchorZone = false; // just transitioned from no-snapshot to snapshot records
  let breakCount = 0;
  let anchorCount = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i] as MatchRow;

    // ─ Records without opponent snapshot: ANCHOR point ─
    if (!hasOpponentSnapshot(m)) {
      // Accept DB values as-is; use "after" as the new running state
      if (hasAfterSnapshot(m)) {
        running = {
          rating: m.user_rating_after!,
          rd: m.user_rd_after!,
          vol: m.user_vol_after!,
        };
      } else {
        // No after data either — reset running so the next snapshot record self-anchors
        running = null;
      }
      if (fixingChain) {
        console.log(`  ℹ Anchor point (no snapshot) at id=${m.id} — chain fix paused`);
      }
      fixingChain = false;
      justLeftAnchorZone = true;
      anchorCount++;
      continue;
    }

    // ─ Records WITH opponent snapshot ─

    // If we don't have a running state yet, anchor from this record's "before"
    if (running === null) {
      running = {
        rating: m.user_rating_before,
        rd: m.user_rd_before!,
        vol: m.user_vol_before!,
      };
      justLeftAnchorZone = false;
    }

    // When transitioning from no-snapshot to snapshot zone, trust this record's
    // own user_rating_before over the anchor's user_rating_after, since the
    // anchor (pre-migration) might itself be unreliable.
    if (justLeftAnchorZone) {
      const anchorGap = Math.abs(m.user_rating_before - running.rating);
      if (anchorGap > TOLERANCE) {
        console.log(
          `  ℹ Anchor→snapshot transition at id=${m.id}: ` +
            `anchor=${running.rating.toFixed(2)}, record=${m.user_rating_before.toFixed(2)}, ` +
            `gap=${anchorGap.toFixed(2)} — trusting record's own value`,
        );
        running = {
          rating: m.user_rating_before,
          rd: m.user_rd_before!,
          vol: m.user_vol_before!,
        };
      }
      justLeftAnchorZone = false;
    }

    // Check chain continuity
    const ratingMatch = Math.abs(m.user_rating_before - running.rating) < TOLERANCE;
    const rdMatch = Math.abs((m.user_rd_before ?? 0) - running.rd) < TOLERANCE;

    if (ratingMatch && rdMatch && !fixingChain) {
      // Chain is intact — advance running state from DB values
      if (hasAfterSnapshot(m)) {
        running = {
          rating: m.user_rating_after!,
          rd: m.user_rd_after!,
          vol: m.user_vol_after!,
        };
      }
      continue;
    }

    // ─ Chain break detected or we're in a fixing region ─
    if (!fixingChain) {
      breakCount++;
      console.log(
        `\n⚠ Chain break #${breakCount} at match id=${m.id} (idx ${i}):` +
          `\n  Expected before: rating=${running.rating.toFixed(5)}, rd=${running.rd.toFixed(5)}` +
          `\n  Actual   before: rating=${m.user_rating_before.toFixed(5)}, rd=${(m.user_rd_before ?? 0).toFixed(5)}` +
          `\n  Session: ${m.session_id}` +
          `\n  Status: ${m.status}`,
      );
      fixingChain = true;
    }

    // Re-calculate Glicko-2 with correct running base
    const opponent: GlickoRating = {
      rating: m.opponent_rating!,
      rd: m.opponent_rd!,
      vol: m.opponent_vol!,
    };
    const score: 0 | 1 = m.status === 'win' ? 1 : 0;
    const newPlayerRating = calculateNewPlayerRating(running, opponent, score);
    const ratingChange = newPlayerRating.rating - running.rating;

    // Check if anything actually differs from DB
    const needsUpdate =
      Math.abs(m.user_rating_before - running.rating) > TOLERANCE ||
      Math.abs((m.user_rating_after ?? 0) - newPlayerRating.rating) > TOLERANCE ||
      Math.abs((m.user_rd_before ?? 0) - running.rd) > TOLERANCE ||
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
          user_rating_before: running.rating,
          user_rating_after: newPlayerRating.rating,
          user_rd_before: running.rd,
          user_rd_after: newPlayerRating.rd,
          user_vol_before: running.vol,
          user_vol_after: newPlayerRating.vol,
          rating_change: ratingChange,
        },
      });
    } else if (fixingChain) {
      // Chain was broken but this record happens to compute identically → chain healed
      console.log(`  ✓ Chain healed at id=${m.id} — values match after recalculation`);
      fixingChain = false;
    }

    running = newPlayerRating;
  }

  // ── Report ──────────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total matches scanned: ${matches.length}`);
  console.log(`Anchor points (no snapshot): ${anchorCount}`);
  console.log(`Chain breaks found: ${breakCount}`);
  console.log(`Records to update: ${updates.length}`);

  if (running) {
    console.log(`\nFinal chained rating: ${running.rating.toFixed(5)}`);
    console.log(`Final chained RD:     ${running.rd.toFixed(5)}`);
    console.log(`Final chained vol:    ${running.vol.toFixed(13)}`);
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
  sqlLines.push(`-- Chain breaks: ${breakCount}, Records updated: ${updates.length}`);
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

  // Update user_mode_ratings to match the final chained value
  if (running) {
    sqlLines.push('-- Update user_mode_ratings to final chained value');
    sqlLines.push(
      `UPDATE public.user_mode_ratings SET` +
        `\n  rating = ${running.rating},` +
        `\n  rd = ${running.rd},` +
        `\n  vol = ${running.vol}` +
        `\nWHERE user_id = '${USER_ID}' AND mode = 'global';`,
    );
    sqlLines.push('');
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
