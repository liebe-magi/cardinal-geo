import rate from 'glicko2-lite';

export interface GlickoRating {
  rating: number;
  rd: number;
  vol: number;
}

export const INITIAL_RATING: GlickoRating = {
  rating: 1500,
  rd: 350,
  vol: 0.06,
};

/**
 * Calculate new Glicko-2 ratings for both player and question.
 *
 * @param player - Player's current rating
 * @param question - Question's current rating
 * @param score - 1.0 for win (correct), 0.0 for loss (incorrect/partial)
 * @returns Updated ratings for both player and question
 */
export function calculateNewRatings(
  player: GlickoRating,
  question: GlickoRating,
  score: 0 | 1,
): { player: GlickoRating; question: GlickoRating; ratingChange: number } {
  // Player vs Question
  const newPlayer = rate(player.rating, player.rd, player.vol, [
    [question.rating, question.rd, score],
  ]);

  // Question vs Player (inverted score — if player won, question lost)
  const newQuestion = rate(question.rating, question.rd, question.vol, [
    [player.rating, player.rd, score === 1 ? 0 : 1],
  ]);

  const ratingChange = newPlayer.rating - player.rating;

  return {
    player: {
      rating: newPlayer.rating,
      rd: newPlayer.rd,
      vol: newPlayer.vol,
    },
    question: {
      rating: newQuestion.rating,
      rd: newQuestion.rd,
      vol: newQuestion.vol,
    },
    ratingChange,
  };
}
