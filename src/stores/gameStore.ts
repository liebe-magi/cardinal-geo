import { create } from 'zustand';
import { calculateCityRatingUpdate, calculateCompositeOpponent } from '../lib/compositeRating';
import { generateDailyChallengeQuestions } from '../lib/dailyChallenge';
import { calculateNewRatings, type GlickoRating } from '../lib/glicko2';
import { checkAnswer, generateLearningQuestion, generateQuestion } from '../lib/quiz';
import { getUTCDateString } from '../lib/seededRandom';
import {
  createPendingMatch,
  fetchCityRatings,
  getDailyProgress,
  getOrCreateQuestion,
  saveChallengeUnratedResult,
  saveDailyProgress,
  settlePendingMatches,
  submitRatedAnswer,
  updateBestSurvivalRatedScore,
  updateBestSurvivalUnratedScore,
  updateWeaknessScoreDb,
  type DbQuestion,
} from '../lib/supabaseApi';
import type {
  GameMode,
  GameState,
  GameSubMode,
  QuadDirection,
  Question,
  QuestionRecord,
} from '../types/game';
import { createInitialGameState } from '../types/game';
import { useAuthStore } from './authStore';

interface GameStore {
  // State
  gameState: GameState;
  currentQuestion: Question | null;
  userGuess: QuadDirection;
  isShowingResult: boolean;
  lastAnswerResult: {
    isCorrect: boolean;
    isPartialCorrect: boolean;
    ratingChange?: number;
  } | null;

  // Daily challenge
  dailyQuestions: Question[];
  dailyDateStr: string;

  // Rated mode state
  currentDbQuestion: DbQuestion | null;
  isProcessing: boolean;
  pendingSettledCount: number;

  // Actions
  startGame: (mode: GameMode, subMode: GameSubMode) => Promise<void>;
  nextQuestion: () => Promise<void>;
  setUserGuess: (guess: QuadDirection) => void;
  submitAnswer: () => Promise<void>;
  endGame: () => Promise<void>;
  reset: () => void;

  // Helpers
  getHighScoreCategory: () => HighScoreCategory | null;
  isRatedMode: () => boolean;
}

type HighScoreCategory = 'survival_rated' | 'survival_unrated';

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialGameState('survival', 'unrated'),
  currentQuestion: null,
  userGuess: { ns: 'N', ew: 'E' },
  isShowingResult: false,
  lastAnswerResult: null,
  dailyQuestions: [],
  dailyDateStr: '',
  currentDbQuestion: null,
  isProcessing: false,
  pendingSettledCount: 0,

  isRatedMode: (): boolean => {
    const { mode, subMode } = get().gameState;
    return subMode === 'rated' && (mode === 'survival' || mode === 'challenge');
  },

  getHighScoreCategory: (): HighScoreCategory | null => {
    const { mode, subMode } = get().gameState;
    if (mode === 'survival' && subMode === 'rated') return 'survival_rated';
    if (mode === 'survival' && subMode === 'unrated') return 'survival_unrated';
    return null; // learning, challenge — tracked differently
  },

  startGame: async (mode: GameMode, subMode: GameSubMode) => {
    const gameState = createInitialGameState(mode, subMode);
    const authState = useAuthStore.getState();
    const isRated = subMode === 'rated' && (mode === 'survival' || mode === 'challenge');

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

      // Record rating at the start of the session
      const latestProfile = useAuthStore.getState().profile;
      if (latestProfile) {
        gameState.ratingBefore = latestProfile.rating;
      }
    }

    // For daily challenge, pre-generate all 10 questions and check for resume
    let dailyQuestions: Question[] = [];
    let dailyDateStr = '';
    if (mode === 'challenge' && subMode === 'rated') {
      dailyDateStr = getUTCDateString();
      dailyQuestions = generateDailyChallengeQuestions(dailyDateStr);

      // Check for existing progress to resume
      if (authState.isAuthenticated) {
        const progress = await getDailyProgress(dailyDateStr);
        if (progress && progress.status === 'completed') {
          // Already completed today — don't allow replay
          return;
        }
        if (progress && progress.current_question > 0) {
          // Resume from where we left off
          gameState.questionCount = progress.current_question;
          gameState.score = progress.score;
          gameState.totalRatingChange = progress.total_rating_change;
          // Restore answers from DB
          if (Array.isArray(progress.answers)) {
            gameState.history = progress.answers.map(
              (a: unknown) => (a as { isCorrect: boolean }).isCorrect,
            );
          }
        }
      }
    }

    set({
      gameState,
      currentQuestion: null,
      userGuess: {
        ns: Math.random() > 0.5 ? 'N' : 'S',
        ew: Math.random() > 0.5 ? 'E' : 'W',
      },
      isShowingResult: false,
      lastAnswerResult: null,
      dailyQuestions,
      dailyDateStr,
      currentDbQuestion: null,
      isProcessing: false,
      pendingSettledCount: 0,
    });

    // Generate first question
    await get().nextQuestion();
  },

  nextQuestion: async () => {
    const { gameState, dailyQuestions } = get();
    const authState = useAuthStore.getState();

    let question: Question;

    if (gameState.mode === 'challenge' && gameState.subMode === 'rated') {
      // Daily challenge — use pre-generated questions
      if (gameState.questionCount >= dailyQuestions.length) return;
      question = dailyQuestions[gameState.questionCount];
    } else if (gameState.mode === 'learning') {
      // Read weakness scores from profile (DB) if authenticated
      const weaknessScores = authState.profile?.weakness_scores || {};
      question = generateLearningQuestion(weaknessScores);
    } else {
      question = generateQuestion();
    }

    // For rated modes: get/create question in DB and create pending match
    let dbQuestion: DbQuestion | null = null;
    const isRated = get().isRatedMode();

    if (isRated && authState.isAuthenticated && authState.profile) {
      set({ isProcessing: true });

      dbQuestion = await getOrCreateQuestion(question);

      if (dbQuestion && gameState.sessionId) {
        const mode =
          gameState.mode === 'survival'
            ? ('survival_rated' as const)
            : ('challenge_rated' as const);

        const matchId = await createPendingMatch(
          authState.user!.id,
          dbQuestion.id,
          gameState.sessionId,
          mode,
          authState.profile.rating,
          dbQuestion.rating,
        );

        if (matchId) {
          set((state) => ({
            gameState: {
              ...state.gameState,
              currentMatchHistoryId: matchId,
            },
          }));
        }
      }

      set({ isProcessing: false });
    }

    set({
      currentQuestion: question,
      currentDbQuestion: dbQuestion,
      userGuess: {
        ns: Math.random() > 0.5 ? 'N' : 'S',
        ew: Math.random() > 0.5 ? 'E' : 'W',
      },
      isShowingResult: false,
      lastAnswerResult: null,
    });
  },

  setUserGuess: (guess: QuadDirection) => {
    set({ userGuess: guess });
  },

  submitAnswer: async () => {
    const { currentQuestion, userGuess, gameState, currentDbQuestion } = get();
    if (!currentQuestion) return;

    set({ isProcessing: true });

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

    // Handle rated mode
    const isRated = get().isRatedMode();
    const authState = useAuthStore.getState();

    if (
      isRated &&
      authState.isAuthenticated &&
      authState.profile &&
      currentDbQuestion &&
      gameState.currentMatchHistoryId
    ) {
      const playerRating: GlickoRating = {
        rating: authState.profile.rating,
        rd: authState.profile.rd,
        vol: authState.profile.vol,
      };
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
      await submitRatedAnswer(
        gameState.currentMatchHistoryId,
        isCorrect,
        result.player,
        newPairRating,
        result.ratingChange,
        compositeOpponent.rating, // store composite rating for matchmaking
        cityUpdates,
      );

      // Refresh profile to get updated rating
      await authState.fetchProfile();
    }

    const newHistory = [...gameState.history, isCorrect];
    const newQuestionHistory = [...gameState.questionHistory, record];
    const newScore = isCorrect ? gameState.score + 1 : gameState.score;
    const newQuestionCount = gameState.questionCount + 1;
    const newTotalRatingChange = gameState.totalRatingChange + (ratingChange || 0);

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

    // Update best score for survival modes in DB
    const category = get().getHighScoreCategory();
    if (category && authState.isAuthenticated && authState.user) {
      const profile = authState.profile;
      const currentBest =
        category === 'survival_rated'
          ? (profile?.best_score_survival_rated ?? 0)
          : (profile?.best_score_survival_unrated ?? 0);
      if (newScore > currentBest) {
        if (category === 'survival_rated') {
          updateBestSurvivalRatedScore(authState.user.id, newScore);
        } else {
          updateBestSurvivalUnratedScore(authState.user.id, newScore);
        }
        // Update local profile state immediately
        if (profile) {
          const key =
            category === 'survival_rated'
              ? 'best_score_survival_rated'
              : 'best_score_survival_unrated';
          useAuthStore.setState({
            profile: { ...profile, [key]: newScore },
          });
        }
      }
    }

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
        userAnswer: r.userAnswer,
        correctDirection: r.correctDirection,
        cityACode: r.cityA.countryCode,
        cityBCode: r.cityB.countryCode,
      }));
      const isCompleted = newQuestionCount >= 10;

      saveDailyProgress(
        dateStr,
        newScore,
        newQuestionCount,
        answers,
        newTotalRatingChange,
        isCompleted,
      );
    }

    set({
      gameState: {
        ...gameState,
        score: newScore,
        questionCount: newQuestionCount,
        history: newHistory,
        questionHistory: newQuestionHistory,
        totalRatingChange: newTotalRatingChange,
      },
      isShowingResult: true,
      lastAnswerResult: { isCorrect, isPartialCorrect, ratingChange },
      isProcessing: false,
    });
  },

  endGame: async () => {
    const { gameState } = get();
    const authState = useAuthStore.getState();

    // Save challenge unrated result to DB
    if (
      gameState.mode === 'challenge' &&
      gameState.subMode === 'unrated' &&
      authState.isAuthenticated &&
      authState.user
    ) {
      await saveChallengeUnratedResult(authState.user.id, gameState.score);
    }

    set((state) => ({
      gameState: { ...state.gameState, isGameOver: true },
    }));
  },

  reset: () => {
    set({
      gameState: createInitialGameState('survival', 'unrated'),
      currentQuestion: null,
      userGuess: { ns: 'N', ew: 'E' },
      isShowingResult: false,
      lastAnswerResult: null,
      dailyQuestions: [],
      dailyDateStr: '',
      currentDbQuestion: null,
      isProcessing: false,
      pendingSettledCount: 0,
    });
  },
}));
