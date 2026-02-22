/**
 * City Rating Recalculation Script
 *
 * Replays all historical match data chronologically to compute
 * accurate city ratings from scratch using the Glicko-2 algorithm.
 *
 * Usage: bun run scripts/recalculate_city_ratings.ts
 */

import rate from 'glicko2-lite';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Types ─────────────────────────────────────────────────────
interface MatchRecord {
  id: number;
  status: 'win' | 'lose';
  user_rating_before: number;
  answered_at: string;
  city_a_code: string;
  city_b_code: string;
  pair_rd_current: number;
}

interface GlickoRating {
  rating: number;
  rd: number;
  vol: number;
}

interface CityRating extends GlickoRating {
  playCount: number;
}

// ─── Constants ─────────────────────────────────────────────────
const RD_MAX = 350;
const RD_MIN = 50;
const DEFAULT_CITY: CityRating = {
  rating: 1500,
  rd: 350,
  vol: 0.06,
  playCount: 0,
};

// ─── Algorithm (mirroring compositeRating.ts) ──────────────────

function calculateAlpha(pairRD: number): number {
  return Math.max(0, Math.min(1, (RD_MAX - pairRD) / (RD_MAX - RD_MIN)));
}

function calculateCityRatingUpdate(
  cityRating: CityRating,
  opponentRating: number,
  opponentRD: number,
  score: 0 | 1,
  alpha: number,
): GlickoRating | null {
  if (alpha >= 0.99) return null;

  const updated = rate(cityRating.rating, cityRating.rd, cityRating.vol, [
    [opponentRating, opponentRD, score],
  ]);

  const factor = 1 - alpha;
  return {
    rating: cityRating.rating + (updated.rating - cityRating.rating) * factor,
    rd: cityRating.rd + (updated.rd - cityRating.rd) * factor,
    vol: cityRating.vol + (updated.vol - cityRating.vol) * factor,
  };
}

// ─── Main ──────────────────────────────────────────────────────

function main() {
  // 1. Load match history
  const matchesPath = join(__dirname, 'match_history.json');
  const rawMatches: MatchRecord[] = JSON.parse(readFileSync(matchesPath, 'utf8'));

  // Sort by answered_at chronologically
  const matches = rawMatches.sort(
    (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime(),
  );

  console.log(`Loaded ${matches.length} matches.`);

  // 2. Initialize city ratings (all defaults)
  const cityRatings = new Map<string, CityRating>();

  function getCity(code: string): CityRating {
    if (!cityRatings.has(code)) {
      cityRatings.set(code, { ...DEFAULT_CITY });
    }
    return cityRatings.get(code)!;
  }

  // 3. Replay matches
  let processed = 0;
  for (const match of matches) {
    const cityA = getCity(match.city_a_code);
    const cityB = getCity(match.city_b_code);

    // The pair RD at time of play
    const pairRD = match.pair_rd_current;
    const alpha = calculateAlpha(pairRD);

    // User rating at time of play
    const userRating = match.user_rating_before;
    // We use a reasonable RD estimate for the user as opponent of city
    // The user's RD isn't stored, but the default player RD is ~350 initially
    // and decreases with play. For city rating recalculation purposes,
    // we use a moderate value since we're primarily interested in relative
    // city difficulty. Using ~200 as a reasonable mid-range estimate for
    // active players.
    const userRD = 200;

    // City score: inverted from player result
    // If player won (status="win"), city "lost" → score=0
    // If player lost (status="lose"), city "won" → score=1
    const cityScore: 0 | 1 = match.status === 'win' ? 0 : 1;

    // Update city A
    const newCityA = calculateCityRatingUpdate(cityA, userRating, userRD, cityScore, alpha);
    if (newCityA) {
      cityA.rating = newCityA.rating;
      cityA.rd = newCityA.rd;
      cityA.vol = newCityA.vol;
    }
    cityA.playCount++;

    // Update city B
    const newCityB = calculateCityRatingUpdate(cityB, userRating, userRD, cityScore, alpha);
    if (newCityB) {
      cityB.rating = newCityB.rating;
      cityB.rd = newCityB.rd;
      cityB.vol = newCityB.vol;
    }
    cityB.playCount++;

    processed++;
    if (processed % 500 === 0) {
      console.log(`  Processed ${processed}/${matches.length} matches...`);
    }
  }

  console.log(`\nAll ${processed} matches processed.`);

  // 4. Output results sorted by rating (descending = hardest first)
  const results = Array.from(cityRatings.entries())
    .map(([code, r]) => ({
      code,
      rating: r.rating,
      rd: r.rd,
      vol: r.vol,
      playCount: r.playCount,
    }))
    .sort((a, b) => b.rating - a.rating);

  console.log('\n=== City Ratings (sorted by rating, descending) ===');
  console.log('Code | Rating    | RD       | Vol      | Plays');
  console.log('-----|-----------|----------|----------|------');
  for (const r of results) {
    console.log(
      `${r.code.padEnd(4)} | ${r.rating.toFixed(2).padStart(9)} | ${r.rd.toFixed(2).padStart(8)} | ${r.vol.toFixed(4).padStart(8)} | ${r.playCount}`,
    );
  }

  // 5. Generate SQL UPDATE statements
  const sqlLines: string[] = [
    '-- City Rating Recalculation SQL',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Based on ${matches.length} matches`,
    '',
    'BEGIN;',
    '',
  ];

  for (const r of results) {
    sqlLines.push(
      `UPDATE public.city_ratings SET rating = ${r.rating}, rd = ${r.rd}, vol = ${r.vol}, play_count = ${r.playCount} WHERE country_code = '${r.code}';`,
    );
  }

  sqlLines.push('');
  sqlLines.push('COMMIT;');
  sqlLines.push('');

  const sqlPath = join(__dirname, 'recalculate_city_ratings.sql');
  writeFileSync(sqlPath, sqlLines.join('\n'), 'utf8');
  console.log(`\nSQL written to: ${sqlPath}`);

  // 6. Also save JSON results for analysis
  const jsonPath = join(__dirname, 'recalculated_city_ratings.json');
  writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`JSON written to: ${jsonPath}`);

  // 7. Summary statistics
  const ratings = results.map((r) => r.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const totalCities = results.length;
  const citiesWithPlays = results.filter((r) => r.playCount > 0).length;

  console.log('\n=== Summary ===');
  console.log(`Total cities: ${totalCities}`);
  console.log(`Cities with plays: ${citiesWithPlays}`);
  console.log(`Rating range: ${minRating.toFixed(2)} - ${maxRating.toFixed(2)}`);
  console.log(`Average rating: ${avgRating.toFixed(2)}`);
}

main();
