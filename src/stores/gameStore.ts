import { create } from 'zustand';
import { calculateCityRatingUpdate, calculateCompositeOpponent } from '../lib/compositeRating';
import { generateDailyChallengeQuestions } from '../lib/dailyChallenge';
import { restoreDailyProgress } from '../lib/dailyProgress';
import { calculateNewRatings, type GlickoRating } from '../lib/glicko2';
import { checkAnswer, generateLearningQuestion, generateQuestion } from '../lib/quiz';
import { getUTCDateString } from '../lib/seededRandom';
import {
  createPendingMatch,
  fetchCityRatings,
  getDailyProgress,
  getMatchForRecovery,
  getOrCreateQuestion,
  saveDailyProgress,
  settlePendingMatches,
  submitRatedAnswer,
  updateBestSurvivalRatedScore,
  updateWeaknessScoreDb,
  type DbQuestion,
} from '../lib/supabaseApi';
import type { City } from '../types/city';
import type {
  GameMode,
  GameState,
  GameSubMode,
  QuadDirection,
  Question,
  QuestionRecord,
} from '../types/game';
import { createInitialGameState } from '../types/game';
import { useAuthStore, type Profile } from './authStore';

function getRatingModeFromGameMode(mode: GameMode): string {
  if (mode === 'survival' || mode === 'challenge') return 'global';
  if (mode === 'starter') return 'starter_rated';
  if (mode === 'learning') return 'global';
  return `${mode}_rated`;
}

function getProfileRatingForMode(profile: Profile, mode: GameMode): GlickoRating {
  const ratingMode = getRatingModeFromGameMode(mode);
  const modeRating = profile.modeRatings?.[ratingMode];
  if (modeRating) {
    return {
      rating: modeRating.rating,
      rd: modeRating.rd,
      vol: modeRating.vol,
    };
  }
  // No mode-specific rating found — start from defaults.
  return {
    rating: 1500,
    rd: 350,
    vol: 0.06,
  };
}

interface GameStore {
  // State
  gameState: GameState;
  currentQuestion: Question | null;
  userGuess: QuadDirection | null;
  isShowingResult: boolean;
  lastAnswerResult: {
    isCorrect: boolean;
    isPartialCorrect: boolean;
    ratingChange?: number;
  } | null;

  // Filtered dataset for Starter / Region
  filteredCities: City[] | null;

  // Daily challenge
  dailyQuestions: Question[];
  dailyDateStr: string;

  // Rated mode state
  currentDbQuestion: DbQuestion | null;
  isProcessing: boolean;
  pendingSettledCount: number;
  error: 'question' | 'answer' | 'daily' | null;
  answerAttempt: QuadDirection | null;

  // Actions
  startGame: (mode: GameMode, subMode: GameSubMode) => Promise<void>;
  nextQuestion: () => Promise<void>;
  setUserGuess: (guess: QuadDirection) => void;
  submitAnswer: () => Promise<void>;
  endGame: () => Promise<void>;
  reviewDailyResult: () => Promise<boolean>;
  reset: () => void;

  // Helpers
  getHighScoreCategory: () => HighScoreCategory | null;
  isRatedMode: () => boolean;
}

type HighScoreCategory = 'survival_rated' | 'survival_unrated';

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialGameState('survival', 'unrated'),
  currentQuestion: null,
  userGuess: null,
  isShowingResult: false,
  lastAnswerResult: null,
  filteredCities: null,
  dailyQuestions: [],
  dailyDateStr: '',
  currentDbQuestion: null,
  isProcessing: false,
  pendingSettledCount: 0,
  error: null,
  answerAttempt: null,

  isRatedMode: (): boolean => {
    const { mode } = get().gameState;
    // All modes are rated except learning
    return mode !== 'learning';
  },

  getHighScoreCategory: (): HighScoreCategory | null => {
    const { mode } = get().gameState;
    if (mode === 'survival') return 'survival_rated';
    return null; // other modes tracked differently
  },

  startGame: async (mode: GameMode, subMode: GameSubMode) => {
    const selectedDate = getUTCDateString();
    const gameState = createInitialGameState(mode, subMode);
    const authState = useAuthStore.getState();
    // All modes are rated except learning
    const isRated = mode !== 'learning';

    // Generate session ID for rated modes
    if (isRated && authState.isAuthenticated) {
      gameState.sessionId = crypto.randomUUID();

      // Settle any pending matches from previous sessions
      const settled = await settlePendingMatches(authState.user!.id);
      if (settled > 0) {
        set({ pendingSettledCount: settled });
        // Refresh profile to get updated rating
        await authState.fetchProfile();
      }

      // Record rating at the start of the session and initialise local chain
      const latestProfile = useAuthStore.getState().profile;
      if (latestProfile) {
        const startRating = getProfileRatingForMode(latestProfile, mode);
        gameState.ratingBefore = startRating.rating;
        gameState.currentPlayerRating = startRating;
      }
    }

    // Handle Starter mode fetching
    let filteredCities: City[] | null = null;
    if (mode === 'starter') {
      const { FAMOUS_CITY_CODES } = await import('../lib/famousCities');
      const { cities } = await import('../cities');
      filteredCities = cities.filter((c) => FAMOUS_CITY_CODES.includes(c.countryCode));
    } else if (mode !== 'survival' && mode !== 'challenge' && mode !== 'learning') {
      // It's a region
      const { cities } = await import('../cities');
      const { countryRegionMap } = await import('../lib/regions');
      filteredCities = cities.filter((c) => countryRegionMap[c.countryCode] === mode);
    }

    // For daily challenge, pre-generate all 10 questions and check for resume
    let dailyQuestions: Question[] = [];
    let dailyDateStr = '';
    if (mode === 'challenge' && subMode === 'rated') {
      dailyDateStr = selectedDate;
      dailyQuestions = generateDailyChallengeQuestions(dailyDateStr);

      // Check for existing progress to resume
      if (authState.isAuthenticated) {
        const progress = await getDailyProgress(dailyDateStr, true);
        if (progress && progress.status === 'completed') {
          // Already completed today — don't allow replay
          return;
        }
        if (progress && progress.current_question > 0) {
          // Resume from where we left off
          Object.assign(gameState, restoreDailyProgress(progress));
        }
      }
    }

    set({
      gameState,
      currentQuestion: null,
      userGuess: null,
      isShowingResult: false,
      lastAnswerResult: null,
      filteredCities,
      dailyQuestions,
      dailyDateStr,
      currentDbQuestion: null,
      isProcessing: false,
      pendingSettledCount: 0,
      error: null,
      answerAttempt: null,
    });

    // Generate first question
    await get().nextQuestion();
  },

  nextQuestion: async () => {
    if (
      get().isProcessing ||
      get().gameState.isGameOver ||
      get().error === 'answer' ||
      get().error === 'daily'
    )
      return;
    const { gameState, dailyQuestions } = get();
    const authState = useAuthStore.getState();

    let question: Question;

    if (get().error === 'question' && get().currentQuestion) {
      question = get().currentQuestion!;
    } else if (gameState.mode === 'challenge' && gameState.subMode === 'rated') {
      // Daily challenge — use pre-generated questions
      if (gameState.questionCount >= dailyQuestions.length) return;
      question = dailyQuestions[gameState.questionCount];
    } else if (gameState.mode === 'learning') {
      // Read weakness scores from profile (DB) if authenticated
      const weaknessScores = authState.profile?.weakness_scores || {};
      question = generateLearningQuestion(weaknessScores);
    } else {
      question = generateQuestion(get().filteredCities || undefined);
    }

    // For rated modes: get/create question in DB and create pending match
    let dbQuestion: DbQuestion | null = null;
    const isRated = get().isRatedMode();

    set({
      isProcessing: true,
      error: null,
      currentQuestion: question,
      currentDbQuestion: null,
      userGuess: null,
      isShowingResult: false,
      lastAnswerResult: null,
      answerAttempt: null,
      gameState: { ...gameState, currentMatchHistoryId: undefined },
    });
    try {
      if (isRated && (!authState.isAuthenticated || !authState.profile)) {
        throw new Error('Authentication required');
      }

      if (isRated && authState.isAuthenticated && authState.profile) {
        set({ isProcessing: true });

        dbQuestion = await getOrCreateQuestion(question);
        if (!dbQuestion || !gameState.sessionId) throw new Error('Question registration failed');

        if (dbQuestion && gameState.sessionId) {
          // Build mode string for match_history
          const modeStr =
            gameState.mode === 'survival'
              ? 'survival_rated'
              : gameState.mode === 'challenge'
                ? 'challenge_rated'
                : gameState.mode === 'starter'
                  ? 'starter_rated'
                  : `${gameState.mode}_rated`;

          // Use locally-chained rating (immune to stale fetchProfile reads)
          const localRating =
            gameState.currentPlayerRating ??
            getProfileRatingForMode(authState.profile, gameState.mode);
          const matchId = await createPendingMatch(
            authState.user!.id,
            dbQuestion.id,
            gameState.sessionId,
            modeStr,
            localRating.rating,
            dbQuestion.rating,
            localRating.rd,
            localRating.vol,
            question,
          );

          if (matchId) {
            set((state) => ({
              gameState: {
                ...state.gameState,
                currentMatchHistoryId: matchId,
              },
            }));
          } else throw new Error('Question registration failed');
        }

        set({ isProcessing: false });
      }

      set({
        currentQuestion: question,
        currentDbQuestion: dbQuestion,
        userGuess: null,
        isShowingResult: false,
        lastAnswerResult: null,
        isProcessing: false,
      });
    } catch {
      set({ error: 'question', isProcessing: false });
    }
  },

  setUserGuess: (guess: QuadDirection) => {
    if (
      get().isProcessing ||
      get().isShowingResult ||
      get().gameState.isGameOver ||
      get().answerAttempt
    )
      return;
    set({ userGuess: guess });
  },

  submitAnswer: async () => {
    const { currentQuestion, userGuess, gameState, currentDbQuestion } = get();
    if (
      !currentQuestion ||
      !userGuess ||
      get().isProcessing ||
      get().isShowingResult ||
      gameState.isGameOver ||
      get().error === 'question'
    )
      return;

    set({ isProcessing: true, error: null, answerAttempt: { ...userGuess } });
    let saveStage: 'answer' | 'daily' = 'answer';
    try {
      const correct = currentQuestion.correctDirection;
      const { isCorrect, isPartialCorrect } = checkAnswer(userGuess, correct);

      const record: QuestionRecord = {
        cityA: currentQuestion.cityA,
        cityB: currentQuestion.cityB,
        correctDirection: { ...correct },
        userAnswer: { ...userGuess },
        isCorrect,
        isPartialCorrect,
      };

      let ratingChange: number | undefined;
      let newPlayerRating: GlickoRating | undefined;

      // Handle rated mode
      const isRated = get().isRatedMode();
      const authState = useAuthStore.getState();
      if (
        isRated &&
        (!authState.isAuthenticated ||
          !authState.profile ||
          !currentDbQuestion ||
          !gameState.currentMatchHistoryId)
      ) {
        throw new Error('Missing question commitment');
      }

      if (
        isRated &&
        authState.isAuthenticated &&
        authState.profile &&
        currentDbQuestion &&
        gameState.currentMatchHistoryId
      ) {
        let saved = await getMatchForRecovery(gameState.currentMatchHistoryId);
        if (saved.status === 'pending') {
          // Use locally-chained rating to guarantee correct base for Glicko-2 calculation
          const playerRating: GlickoRating =
            gameState.currentPlayerRating ??
            getProfileRatingForMode(authState.profile, gameState.mode);
          const pairRating: GlickoRating = {
            rating: currentDbQuestion.rating,
            rd: currentDbQuestion.rd,
            vol: currentDbQuestion.vol,
          };

          // Fetch city ratings and compute composite opponent
          const { cityA: cityARating, cityB: cityBRating } = await fetchCityRatings(
            currentDbQuestion.city_a_code,
            currentDbQuestion.city_b_code,
          );
          const { opponent: compositeOpponent, alpha } = calculateCompositeOpponent(
            cityARating,
            cityBRating,
            pairRating,
          );

          // Player vs composite opponent
          const score = isCorrect ? (1 as const) : (0 as const);
          const result = calculateNewRatings(playerRating, compositeOpponent, score);

          // Calculate pair update: re-run Glicko-2 for the pair as "player" vs user
          // to get a clean pair-specific rating update.
          const { player: newPairRating } = calculateNewRatings(
            pairRating,
            playerRating,
            score === 1 ? 0 : 1,
          );

          // Calculate city rating updates (scaled by 1-α)
          const cityScore = (score === 1 ? 0 : 1) as 0 | 1; // inverted: if player won, city "lost"
          const newCityA = calculateCityRatingUpdate(
            cityARating,
            playerRating.rating,
            playerRating.rd,
            cityScore,
            alpha,
          );
          const newCityB = calculateCityRatingUpdate(
            cityBRating,
            playerRating.rating,
            playerRating.rd,
            cityScore,
            alpha,
          );

          ratingChange = result.ratingChange;
          newPlayerRating = result.player;
          record.ratingChange = ratingChange;

          // Prepare city updates for DB
          const cityUpdates =
            newCityA && newCityB
              ? {
                  cityACode: currentDbQuestion.city_a_code,
                  cityA: newCityA,
                  cityBCode: currentDbQuestion.city_b_code,
                  cityB: newCityB,
                }
              : null;

          // Submit to Supabase
          try {
            await submitRatedAnswer(
              gameState.currentMatchHistoryId,
              isCorrect,
              userGuess,
              result.player,
              newPairRating,
              result.ratingChange,
              compositeOpponent.rating, // store composite rating for matchmaking
              cityUpdates,
              compositeOpponent, // snapshot opponent rating/rd/vol for replay
            );
          } catch {
            // Even an exception may follow a committed transaction. Read before retrying.
          }
          saved = await getMatchForRecovery(gameState.currentMatchHistoryId);
        }
        if (
          saved.status === 'pending' ||
          saved.user_answer_ns !== userGuess.ns ||
          saved.user_answer_ew !== userGuess.ew ||
          saved.user_rating_after == null ||
          saved.user_rd_after == null ||
          saved.user_vol_after == null ||
          (saved.status === 'win') !== isCorrect
        )
          throw new Error('Answer not confirmed');
        ratingChange = saved.rating_change;
        record.ratingChange = ratingChange;
        record.ratingBefore = saved.user_rating_before;
        record.ratingAfter = saved.user_rating_after;
        newPlayerRating = {
          rating: saved.user_rating_after,
          rd: saved.user_rd_after,
          vol: saved.user_vol_after,
        };

        // Refresh profile for UI display (non-critical for computation,
        // but awaited so downstream UI reads see the latest data)
        try {
          await authState.fetchProfile();
        } catch {
          // Swallow errors: failure to refresh profile should not break gameplay
          console.error('Failed to refresh profile after rated answer submission');
        }
      }

      const newHistory = [...gameState.history, isCorrect];
      const newQuestionHistory = [...gameState.questionHistory, record];
      const newScore = isCorrect ? gameState.score + 1 : gameState.score;
      const newQuestionCount = gameState.questionCount + 1;
      const newTotalRatingChange = gameState.totalRatingChange + (ratingChange || 0);

      // Save daily challenge progress
      if (
        gameState.mode === 'challenge' &&
        gameState.subMode === 'rated' &&
        authState.isAuthenticated
      ) {
        const dateStr = get().dailyDateStr;
        const answers = newQuestionHistory.map((r) => ({
          isCorrect: r.isCorrect,
          isPartialCorrect: r.isPartialCorrect,
          ratingChange: r.ratingChange,
          ratingBefore: r.ratingBefore,
          ratingAfter: r.ratingAfter,
          userAnswer: r.userAnswer,
          correctDirection: r.correctDirection,
          cityACode: r.cityA.countryCode,
          cityBCode: r.cityB.countryCode,
        }));
        const isCompleted = newQuestionCount >= 10;

        saveStage = 'daily';
        const saved = await saveDailyProgress(
          dateStr,
          newScore,
          newQuestionCount,
          answers,
          newTotalRatingChange,
          isCompleted,
        );
        if (!saved) throw new Error('Daily progress not confirmed');
      }

      // Update weakness scores in DB (fire and forget)
      if (authState.isAuthenticated && authState.user) {
        updateWeaknessScoreDb(
          authState.user.id,
          currentQuestion.cityA.countryCode,
          currentQuestion.cityB.countryCode,
          isCorrect,
        ).then((updatedScores) => {
          // Update profile state with new weakness scores
          if (updatedScores) {
            const currentProfile = useAuthStore.getState().profile;
            if (currentProfile) {
              useAuthStore.setState({
                profile: { ...currentProfile, weakness_scores: updatedScores },
              });
            }
          }
        });
      }

      // Update best score for survival mode in DB
      const category = get().getHighScoreCategory();
      if (category && authState.isAuthenticated && authState.user) {
        const profile = authState.profile;
        const currentBest = profile?.best_score_survival_rated ?? 0;
        if (newScore > currentBest) {
          updateBestSurvivalRatedScore(authState.user.id, newScore);
          // Update local profile state immediately
          if (profile) {
            useAuthStore.setState({
              profile: { ...profile, best_score_survival_rated: newScore },
            });
          }
        }
      }

      set({
        gameState: {
          ...gameState,
          currentPlayerRating: newPlayerRating ?? gameState.currentPlayerRating,
          score: newScore,
          questionCount: newQuestionCount,
          history: newHistory,
          questionHistory: newQuestionHistory,
          totalRatingChange: newTotalRatingChange,
          ratingAfter: record.ratingAfter,
          ratingBefore:
            gameState.questionCount === 0 ? record.ratingBefore : gameState.ratingBefore,
        },
        isShowingResult: true,
        lastAnswerResult: { isCorrect, isPartialCorrect, ratingChange },
        isProcessing: false,
        answerAttempt: null,
      });
    } catch {
      set({ isProcessing: false, error: saveStage });
    }
  },

  endGame: async () => {
    set((state) => ({
      gameState: { ...state.gameState, isGameOver: true },
    }));
  },

  reviewDailyResult: async () => {
    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated) return false;

    set({ isProcessing: true });

    // Attempt to load today's progress
    const dateStr = getUTCDateString();
    let progress;
    try {
      progress = await getDailyProgress(dateStr, true);
    } catch {
      set({ isProcessing: false, error: 'daily' });
      return false;
    }

    if (!progress || progress.status !== 'completed' || !progress.answers) {
      set({ isProcessing: false });
      return false;
    }

    let restored: ReturnType<typeof restoreDailyProgress>;
    try {
      restored = restoreDailyProgress(progress);
    } catch {
      set({ isProcessing: false, error: 'daily' });
      return false;
    }

    set({
      gameState: {
        mode: 'challenge',
        subMode: 'rated',
        ...restored,
        isGameOver: true,
        sessionId: '', // Not needed for review
        totalRatingChange: progress.total_rating_change,
      },
      currentQuestion: null,
      userGuess: null,
      isShowingResult: false,
      lastAnswerResult: null,
      filteredCities: null,
      dailyQuestions: generateDailyChallengeQuestions(dateStr),
      dailyDateStr: dateStr,
      currentDbQuestion: null,
      isProcessing: false,
      pendingSettledCount: 0,
    });

    return true;
  },

  reset: () => {
    set({
      gameState: createInitialGameState('survival', 'rated'),
      currentQuestion: null,
      userGuess: null,
      isShowingResult: false,
      lastAnswerResult: null,
      filteredCities: null,
      dailyQuestions: [],
      dailyDateStr: '',
      currentDbQuestion: null,
      isProcessing: false,
      pendingSettledCount: 0,
      error: null,
      answerAttempt: null,
    });
  },
}));
