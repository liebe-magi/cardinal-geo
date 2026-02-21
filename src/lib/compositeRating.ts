/**
 * Composite rating: blends city-level and pair-level Glicko-2 ratings
 * using inverse-variance weighting and confidence-based interpolation.
 *
 * Algorithm:
 * 1. City Base Rate: inverse-variance weighted average of two city ratings
 * 2. Confidence Blend: α = pair confidence → interpolate base ↔ pair
 * 3. Post-play: pair gets 100% update, cities get (1-α) × update
 */

import rate from 'glicko2-lite';
import type { GlickoRating } from './glicko2';

// Glicko-2 RD bounds for α calculation
const RD_MAX = 350; // initial (no data)
const RD_MIN = 50; // fully converged

/**
 * City rating from the city_ratings table (or defaults).
 */
export interface CityRating {
  countryCode: string;
  rating: number;
  rd: number;
  vol: number;
  playCount: number;
}

/** Default city rating for unknown/missing cities */
export const DEFAULT_CITY_RATING: Omit<CityRating, 'countryCode'> = {
  rating: 1500,
  rd: 350,
  vol: 0.06,
  playCount: 0,
};

/**
 * Calculate city base rate using inverse-variance weighted average.
 * Cities with lower RD (more confident) get more weight.
 *
 * R_base = (w_a × R_a + w_b × R_b) / (w_a + w_b)
 * where w = 1 / RD²
 */
export function calculateCityBaseRate(cityA: CityRating, cityB: CityRating): number {
  const wA = 1 / (cityA.rd * cityA.rd);
  const wB = 1 / (cityB.rd * cityB.rd);
  return (wA * cityA.rating + wB * cityB.rating) / (wA + wB);
}

/**
 * Calculate confidence α from pair RD.
 * α=0 → 100% city-based (new pair)
 * α=1 → 100% pair-specific (well-played)
 */
export function calculateAlpha(pairRD: number): number {
  return Math.max(0, Math.min(1, (RD_MAX - pairRD) / (RD_MAX - RD_MIN)));
}

/**
 * Calculate composite RD via error propagation.
 *
 * σ_base² = σ_a² × σ_b² / (σ_a² + σ_b²)   // inverse-variance base
 * σ_final = sqrt((1-α)² × σ_base² + α² × σ_pair²)
 */
function calculateCompositeRD(
  cityA: CityRating,
  cityB: CityRating,
  pairRD: number,
  alpha: number,
): number {
  const sigmaBaseSquared =
    (cityA.rd * cityA.rd * (cityB.rd * cityB.rd)) / (cityA.rd * cityA.rd + cityB.rd * cityB.rd);
  const sigmaFinalSquared =
    (1 - alpha) * (1 - alpha) * sigmaBaseSquared + alpha * alpha * (pairRD * pairRD);
  return Math.sqrt(sigmaFinalSquared);
}

/**
 * Construct the composite opponent for Glicko-2 calculation.
 * Blends city base rate with pair-specific rating based on confidence α.
 */
export function calculateCompositeOpponent(
  cityA: CityRating,
  cityB: CityRating,
  pair: GlickoRating,
): { opponent: GlickoRating; alpha: number } {
  const baseRate = calculateCityBaseRate(cityA, cityB);
  const alpha = calculateAlpha(pair.rd);

  const compositeRating = (1 - alpha) * baseRate + alpha * pair.rating;
  const compositeRD = calculateCompositeRD(cityA, cityB, pair.rd, alpha);

  return {
    opponent: {
      rating: compositeRating,
      rd: compositeRD,
      vol: pair.vol,
    },
    alpha,
  };
}

/**
 * Calculate updated city rating after a game result.
 * The city receives (1-α) fraction of the rating update.
 * When α≈1 (pair well-characterized), cities are barely affected.
 *
 * @param cityRating - Current city rating
 * @param opponentRating - Player's rating (the "opponent" from the city's perspective)
 * @param score - 0 for player win (city "lost"), 1 for player loss (city "won")
 * @param alpha - Pair confidence (0..1)
 * @returns Updated city rating, or null if no update needed (α ≈ 1)
 */
export function calculateCityRatingUpdate(
  cityRating: CityRating,
  opponentRating: number,
  opponentRD: number,
  score: 0 | 1,
  alpha: number,
): GlickoRating | null {
  // If pair is fully characterized, skip city update entirely
  if (alpha >= 0.99) return null;

  // Scale the update by (1-α): we do this by partially blending the result
  // with the original rating. Since Glicko-2's rate() already computes the
  // full update, we interpolate between original and updated.
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
