import L from 'leaflet';
import { cities } from './cities';
import { getTranslation, Lang } from './i18n';
import {
  GameMode,
  GameState,
  getHighScore,
  getWeaknessScores,
  resetWeaknessScores,
  saveHighScore,
  updateWeaknessScore,
} from './modes';
import {
  formatDirection,
  generateLearningQuestion,
  generateQuestion,
  QuadDirection,
  Question,
} from './quiz';
import './style.css';

// State
let lang: Lang = (localStorage.getItem('cardinal_lang') as Lang) || 'ja';
let currentMode: GameMode | null = null;
let gameState: GameState = {
  mode: 'survival',
  score: 0,
  questionCount: 0,
  isGameOver: false,
  history: [],
  questionHistory: [],
};
let currentQuestion: Question | null = null;
let userGuess: QuadDirection = { ns: 'N', ew: 'E' };
let timerId: ReturnType<typeof setInterval> | null = null;
let map: L.Map | null = null;
let isShowingResult = false;
let isWeaknessScreen = false;

// DOM Elements
const app = document.getElementById('app')!;

// Init
function init() {
  renderModeSelect();
}

function t() {
  return getTranslation(lang);
}

function setLang(l: Lang) {
  lang = l;
  localStorage.setItem('cardinal_lang', l);
  if (isWeaknessScreen) {
    renderWeaknessCheck();
  } else if (currentMode) {
    // If in game, just re-render current state
    if (gameState.isGameOver) renderFinalResult();
    else if (isShowingResult) renderResult();
    else renderQuiz();
  } else {
    renderModeSelect();
  }
}

// --- Renderers ---

function renderHeader() {
  return `
    <header>
      <h1>${t().appTitle}</h1>
      <button id="lang-toggle" class="lang-toggle">${lang === 'ja' ? 'EN' : 'JP'}</button>
    </header>
  `;
}

function renderModeSelect() {
  document.title = `${t().appTitle}`;
  isWeaknessScreen = false;
  app.innerHTML = `
    ${renderHeader()}
    <div class="scene">
      <div class="mode-grid">
        ${['survival', 'timeAttack', 'challenge', 'learning']
          .map((m) => {
            const mode = m as GameMode;
            const showHighScore = mode !== 'learning';
            return `
            <button class="mode-btn" data-mode="${mode}">
              <span class="mode-title">${t().modes[mode]}</span>
              <span class="mode-desc">${t().modeDesc[mode]}</span>
              ${showHighScore ? `<span class="high-score">${t().ui.highScore}: ${getHighScore(mode)}</span>` : ''}
            </button>
          `;
          })
          .join('')}
      </div>
      <button id="weakness-check-btn" class="weakness-check-btn">${t().ui.weaknessCheck}</button>
    </div>
  `;

  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => startGame((btn as HTMLElement).dataset.mode as GameMode));
  });
  document.getElementById('weakness-check-btn')?.addEventListener('click', () => {
    renderWeaknessCheck();
  });
}

function renderQuiz() {
  if (!currentQuestion) return;

  const { cityA, cityB } = currentQuestion;

  // Determine positions based on userGuess
  // Grid layout (3x3):
  // NW(1,1)  N(1,2)  NE(1,3)
  // W(2,1)   C(2,2)  E(2,3)
  // SW(3,1)  S(3,2)  SE(3,3)

  const classA = (() => {
    if (userGuess.ns === 'N') {
      return userGuess.ew === 'E' ? 'pos-ne' : 'pos-nw';
    } else {
      return userGuess.ew === 'E' ? 'pos-se' : 'pos-sw';
    }
  })();

  // Check if quiz elements already exist
  const quizContainer = document.querySelector('.quiz-container');

  if (quizContainer) {
    // UPDATE existing elements
    const cardA = document.getElementById('card-a')!;
    const cardB = document.getElementById('card-b')!; // Origin stays center
    const dirDisplay = document.getElementById('direction-display')!;
    const textInfoEl = document.getElementById('text-info')!;
    const statsBar = document.getElementById('stats-bar')!;

    // Move Target Card
    cardA.className = `city-card target ${classA}`;

    // Update highlight on quadrants
    document.querySelectorAll('.quadrant-btn').forEach((btn) => btn.classList.remove('selected'));
    document
      .getElementById(`quad-${userGuess.ns.toLowerCase()}${userGuess.ew.toLowerCase()}`)
      ?.classList.add('selected');

    // Update text
    (cardA.querySelector('.city-name') as HTMLElement).textContent =
      lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
    (cardB.querySelector('.city-name') as HTMLElement).textContent =
      lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

    dirDisplay.textContent = `${formatDirection(userGuess, lang)} ${t().ui.direction}`;

    textInfoEl.innerHTML =
      lang === 'ja'
        ? `<span style="color:var(--primary-color)">${cityA.capitalJp}</span> ${t().ui.is}
         <span style="color:var(--secondary-color)">${cityB.capitalJp}</span> ${t().ui.of} ...`
        : `<span style="color:var(--primary-color)">${cityA.capitalEn}</span> ${t().ui.is} ...
         ${t().ui.of} <span style="color:var(--secondary-color)">${cityB.capitalEn}</span>`;

    statsBar.innerHTML = `
      <span>${t().ui.score}: ${gameState.score}</span>
      ${gameState.mode === 'timeAttack' ? `<span>${t().ui.time}: ${gameState.timeLeft}s</span>` : ''}
      ${gameState.mode === 'challenge' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}/10</span>` : ''}        ${gameState.mode === 'learning' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}</span>` : ''}    `;
  } else {
    // CREATE new elements
    const stats = `
      <div id="stats-bar" class="stats-bar">
        <span>${t().ui.score}: ${gameState.score}</span>
        ${gameState.mode === 'timeAttack' ? `<span>${t().ui.time}: ${gameState.timeLeft}s</span>` : ''}
        ${gameState.mode === 'challenge' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}/10</span>` : ''}
        ${gameState.mode === 'learning' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}</span>` : ''}
      </div>
    `;

    const compass = `
      <div class="compass-label compass-n">${t().directions.N}</div>
      <div class="compass-label compass-s">${t().directions.S}</div>
      <div class="compass-label compass-e">${t().directions.E}</div>
      <div class="compass-label compass-w">${t().directions.W}</div>
    `;

    // Clickable Quadrants
    // They are positioned in the grid.
    const quadrants = `
      <button id="quad-nw" class="quadrant-btn pos-nw ${classA === 'pos-nw' ? 'selected' : ''}" data-ns="N" data-ew="W"></button>
      <button id="quad-ne" class="quadrant-btn pos-ne ${classA === 'pos-ne' ? 'selected' : ''}" data-ns="N" data-ew="E"></button>
      <button id="quad-sw" class="quadrant-btn pos-sw ${classA === 'pos-sw' ? 'selected' : ''}" data-ns="S" data-ew="W"></button>
      <button id="quad-se" class="quadrant-btn pos-se ${classA === 'pos-se' ? 'selected' : ''}" data-ns="S" data-ew="E"></button>
    `;

    const cardA = `
      <div id="card-a" class="city-card target ${classA}">
        <span class="city-role">Target</span>
        <span class="city-name">${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}</span>
      </div>
    `;

    // Origin is ALWAYS Center
    const cardB = `
      <div id="card-b" class="city-card origin center-card">
        <span class="city-role">Origin</span>
        <span class="city-name">${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}</span>
      </div>
    `;

    const textInfo =
      lang === 'ja'
        ? `<div id="text-info" style="text-align:center; margin-bottom:0.5rem">
           <span style="color:var(--primary-color)">${cityA.capitalJp}</span> ${t().ui.is}
           <span style="color:var(--secondary-color)">${cityB.capitalJp}</span> ${t().ui.of} ...
         </div>`
        : `<div id="text-info" style="text-align:center; margin-bottom:0.5rem">
           <span style="color:var(--primary-color)">${cityA.capitalEn}</span> ${t().ui.is} ...
           ${t().ui.of} <span style="color:var(--secondary-color)">${cityB.capitalEn}</span>
         </div>`;

    app.innerHTML = `
      ${renderHeader()}
      <div class="scene">
        ${stats}
        ${textInfo}

        <div class="quiz-container">
          ${compass}
          ${quadrants}
          ${cardA}
          ${cardB}
        </div>

        <div id="direction-display" class="direction-display">
          ${formatDirection(userGuess, lang)} ${t().ui.direction}
        </div>

        <button id="submit" class="submit-btn">${t().ui.submit}</button>
      </div>
    `;

    // Re-attach listeners since we destroyed the DOM
    attachQuizListeners();
  }
}

function attachQuizListeners() {
  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));

  // Quadrant clicks
  document.querySelectorAll('.quadrant-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const ns = target.dataset.ns as 'N' | 'S';
      const ew = target.dataset.ew as 'E' | 'W';
      userGuess = { ns, ew };
      renderQuiz();
    });
  });

  document.getElementById('submit')?.addEventListener('click', submitAnswer);
}

function formatCoord(value: number, type: 'lat' | 'lon'): string {
  const abs = Math.abs(value).toFixed(2);
  if (type === 'lat') return `${abs}°${value >= 0 ? 'N' : 'S'}`;
  return `${abs}°${value >= 0 ? 'E' : 'W'}`;
}

function renderResult(isLastAnswerCorrect?: boolean) {
  if (!currentQuestion) return;

  const titleText = isLastAnswerCorrect ? t().ui.correct : t().ui.incorrect;

  const correctDir = formatDirection(currentQuestion.correctDirection, lang);
  const userDir = formatDirection(userGuess, lang);

  const cityA = currentQuestion.cityA;
  const cityB = currentQuestion.cityB;
  const wikiA = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}`;
  const wikiB = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}`;

  const mapLabelA = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
  const mapLabelB = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

  app.innerHTML = `
    ${renderHeader()}
    <div class="scene">
      <div class="result-banner ${isLastAnswerCorrect ? 'result-banner-correct' : 'result-banner-incorrect'}">
        <span class="result-banner-icon">${isLastAnswerCorrect ? '○' : '✕'}</span>
        <span class="result-banner-text">${titleText}</span>
      </div>

      <div class="result-score-badge">
        <span class="result-score-label">${t().ui.score}</span>
        <span class="result-score-num">${gameState.score}</span>
      </div>

      <div class="result-direction-cards">
        <div class="result-dir-card">
          <span class="result-dir-card-label">${t().ui.correctAnswer}</span>
          <span class="result-dir-card-value result-correct">${correctDir}</span>
        </div>
        <div class="result-dir-card">
          <span class="result-dir-card-label">${t().ui.yourAnswer}</span>
          <span class="result-dir-card-value ${isLastAnswerCorrect ? 'result-correct' : 'result-incorrect'}">${userDir}</span>
        </div>
      </div>

      <div id="map" class="map-container"></div>

      <div class="city-info-cards">
        <div class="city-info-card">
          <span class="city-info-role target-role">Target</span>
          <span class="city-info-name">${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}</span>
          <span class="city-info-country">${lang === 'ja' ? cityA.nameJp : cityA.nameEn}</span>
          <span class="city-info-coords">${formatCoord(cityA.lat, 'lat')} / ${formatCoord(cityA.lon, 'lon')}</span>
          <a href="${wikiA}" target="_blank" class="city-info-wiki">Wikipedia ↗</a>
        </div>
        <div class="city-info-card">
          <span class="city-info-role origin-role">Origin</span>
          <span class="city-info-name">${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}</span>
          <span class="city-info-country">${lang === 'ja' ? cityB.nameJp : cityB.nameEn}</span>
          <span class="city-info-coords">${formatCoord(cityB.lat, 'lat')} / ${formatCoord(cityB.lon, 'lon')}</span>
          <a href="${wikiB}" target="_blank" class="city-info-wiki">Wikipedia ↗</a>
        </div>
      </div>

      <button id="action-btn" class="action-btn">
        ${t().ui.next}
      </button>
      <button id="home-btn" class="action-btn secondary-btn">${t().ui.backToTop}</button>
    </div>
  `;

  // Init Map — no world wrapping, consistent with simple lon comparison
  setTimeout(() => {
    if (map) {
      map.remove();
      map = null;
    }
    map = L.map('map', {
      worldCopyJump: false,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
    }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      noWrap: true,
    }).addTo(map);

    const latlngA: [number, number] = [cityA.lat, cityA.lon];
    const latlngB: [number, number] = [cityB.lat, cityB.lon];

    L.marker(latlngA).addTo(map!).bindPopup(`${mapLabelA}<br>(Target)`).openPopup();
    L.marker(latlngB).addTo(map!).bindPopup(`${mapLabelB}<br>(Origin)`);

    L.polyline([latlngA, latlngB], { color: 'red' }).addTo(map!);

    const group = new L.FeatureGroup([L.marker(latlngA), L.marker(latlngB)]);
    map!.fitBounds(group.getBounds().pad(0.1));
  }, 100);

  document.getElementById('action-btn')?.addEventListener('click', () => {
    // Check if the game should end after this answer page
    if (
      gameState.mode === 'survival' &&
      gameState.history.length > 0 &&
      !gameState.history[gameState.history.length - 1]
    ) {
      // Survival: last answer was incorrect -> end game
      endGame();
    } else if (gameState.mode === 'challenge' && gameState.questionCount >= 10) {
      // Challenge: 10 questions done -> end game
      endGame();
    } else {
      // Learning mode and other cases: just go to next question
      nextQuestion();
    }
  });

  document.getElementById('home-btn')?.addEventListener('click', () => {
    currentMode = null;
    isShowingResult = false;
    init();
  });
  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
}

// --- Logic ---

function startGame(mode: GameMode) {
  currentMode = mode;
  gameState = {
    mode,
    score: 0,
    questionCount: 0,
    isGameOver: false,
    timeLeft: mode === 'timeAttack' ? 60 : undefined,
    history: [],
    questionHistory: [],
  };

  isShowingResult = false; // Reset view state

  startTimer();
  nextQuestion();
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  if (gameState.mode === 'timeAttack') {
    timerId = setInterval(() => {
      if (gameState.timeLeft !== undefined) {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
          endGame();
        } else {
          const stats = document.querySelector('.stats-bar');
          if (stats)
            stats.innerHTML = `
            <span>${t().ui.score}: ${gameState.score}</span>
            <span>${t().ui.time}: ${gameState.timeLeft}s</span>
          `;
        }
      }
    }, 1000);
  }
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
}

function nextQuestion() {
  isShowingResult = false;
  if (currentMode === 'learning') {
    currentQuestion = generateLearningQuestion(getWeaknessScores());
  } else {
    currentQuestion = generateQuestion();
  }
  // Randomize initial guess
  userGuess = {
    ns: Math.random() > 0.5 ? 'N' : 'S',
    ew: Math.random() > 0.5 ? 'E' : 'W',
  };
  renderQuiz();
}

function submitAnswer() {
  if (!currentQuestion) return;

  // Stop timer while showing result
  stopTimer();

  const correct = currentQuestion.correctDirection;
  const isCorrect = userGuess.ns === correct.ns && userGuess.ew === correct.ew;

  gameState.questionCount++;
  gameState.history.push(isCorrect);
  gameState.questionHistory.push({
    cityA: currentQuestion.cityA,
    cityB: currentQuestion.cityB,
    correctDirection: { ...correct },
    userAnswer: { ...userGuess },
    isCorrect,
  });
  isShowingResult = true;

  // Update weakness scores for all modes
  updateWeaknessScore(currentQuestion.cityA, currentQuestion.cityB, isCorrect);

  if (isCorrect) {
    gameState.score++;

    if (gameState.mode === 'survival') {
      saveHighScore('survival', gameState.score);
      // Show result even if correct
      renderResult(true);
    } else if (gameState.mode === 'timeAttack') {
      saveHighScore('timeAttack', gameState.score);
      // Skip answer page in time attack — go directly to next question
      isShowingResult = false;
      startTimer();
      nextQuestion();
      return;
    } else if (gameState.mode === 'learning') {
      // Learning mode: always show result, continue indefinitely
      renderResult(true);
    } else {
      // Challenge
      if (gameState.questionCount >= 10) {
        saveHighScore('challenge', gameState.score);
        // Show answer page first, then final result on next click
        renderResult(true);
      } else {
        renderResult(true);
      }
    }
  } else {
    // Incorrect
    if (gameState.mode === 'survival') {
      // Show answer page first, then final result on next click
      renderResult(false);
    } else if (gameState.mode === 'timeAttack') {
      // Skip answer page in time attack — go directly to next question
      isShowingResult = false;
      startTimer();
      nextQuestion();
      return;
    } else if (gameState.mode === 'learning') {
      // Learning mode: always show result, continue indefinitely
      renderResult(false);
    } else {
      // Challenge
      if (gameState.questionCount >= 10) {
        saveHighScore('challenge', gameState.score);
        // Show answer page first, then final result on next click
        renderResult(false);
      } else {
        renderResult(false);
      }
    }
  }
}

function renderFinalResult() {
  if (map) {
    map.remove();
    map = null;
  }

  const correctCount = gameState.history.filter((h) => h).length;
  const totalQuestions = gameState.questionCount;
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const prevHighScore = getHighScore(gameState.mode);
  const isNewHighScore =
    gameState.score > prevHighScore ||
    (gameState.score === prevHighScore && gameState.score > 0 && prevHighScore === gameState.score);

  // Save high score
  saveHighScore(gameState.mode, gameState.score);

  // Mode-specific title
  const titleText =
    gameState.mode === 'survival'
      ? t().ui.gameOver
      : gameState.mode === 'timeAttack'
        ? t().ui.timesUp
        : t().ui.challengeComplete;

  // History display (circles for correct/incorrect)
  const historyHtml = gameState.history
    .map(
      (correct, i) =>
        `<span class="history-dot ${correct ? 'history-correct' : 'history-incorrect'}" title="Q${i + 1}">${correct ? '○' : '✕'}</span>`,
    )
    .join('');

  app.innerHTML = `
    ${renderHeader()}
    <div class="scene">
      <div class="final-result">
        <h2 class="final-title">${titleText}</h2>
        ${isNewHighScore ? `<p class="new-high-score">${t().ui.newHighScore}</p>` : ''}

        <div class="final-score">
          <span class="final-score-value">${gameState.score}</span>
          <span class="final-score-label">${t().ui.score}</span>
        </div>

        <div class="final-stats">
          <div class="final-stat">
            <span class="final-stat-value">${totalQuestions}</span>
            <span class="final-stat-label">${t().ui.totalQuestions}</span>
          </div>
          <div class="final-stat">
            <span class="final-stat-value">${correctCount}</span>
            <span class="final-stat-label">${t().ui.correctCount}</span>
          </div>
          <div class="final-stat">
            <span class="final-stat-value">${accuracy}%</span>
            <span class="final-stat-label">${t().ui.accuracy}</span>
          </div>
        </div>

        <div class="history-row">${historyHtml}</div>

        ${
          gameState.questionHistory.length > 0
            ? `
        <div class="accordion-section">
          <h3 class="accordion-section-title">${t().ui.reviewAnswers}</h3>
          ${gameState.questionHistory
            .map((q, i) => {
              const cityA = q.cityA;
              const cityB = q.cityB;
              const nameA = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
              const nameB = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;
              const countryA = lang === 'ja' ? cityA.nameJp : cityA.nameEn;
              const countryB = lang === 'ja' ? cityB.nameJp : cityB.nameEn;
              const correctDirText = formatDirection(q.correctDirection, lang);
              const userDirText = formatDirection(q.userAnswer, lang);
              const wikiA = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}`;
              const wikiB = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}`;
              return `
            <details class="accordion-item" data-index="${i}">
              <summary class="accordion-summary">
                <span class="accordion-q">Q${i + 1}</span>
                <span class="accordion-result-icon ${q.isCorrect ? 'history-correct' : 'history-incorrect'}">${q.isCorrect ? '○' : '✕'}</span>
                <span class="accordion-cities">${nameA} → ${nameB}</span>
              </summary>
              <div class="accordion-content">
                <div class="accordion-direction-info">
                  <div class="accordion-dir-item">
                    <span class="accordion-dir-label">${t().ui.correctAnswer}</span>
                    <span class="accordion-dir-value result-correct">${correctDirText}</span>
                  </div>
                  <div class="accordion-dir-item">
                    <span class="accordion-dir-label">${t().ui.yourAnswer}</span>
                    <span class="accordion-dir-value ${q.isCorrect ? 'result-correct' : 'result-incorrect'}">${userDirText}</span>
                  </div>
                </div>
                <div id="accordion-map-${i}" class="accordion-map"></div>
                <div class="city-info-cards">
                  <div class="city-info-card">
                    <span class="city-info-role target-role">Target</span>
                    <span class="city-info-name">${nameA}</span>
                    <span class="city-info-country">${countryA}</span>
                    <span class="city-info-coords">${formatCoord(cityA.lat, 'lat')} / ${formatCoord(cityA.lon, 'lon')}</span>
                    <a href="${wikiA}" target="_blank" class="city-info-wiki">Wikipedia ↗</a>
                  </div>
                  <div class="city-info-card">
                    <span class="city-info-role origin-role">Origin</span>
                    <span class="city-info-name">${nameB}</span>
                    <span class="city-info-country">${countryB}</span>
                    <span class="city-info-coords">${formatCoord(cityB.lat, 'lat')} / ${formatCoord(cityB.lon, 'lon')}</span>
                    <a href="${wikiB}" target="_blank" class="city-info-wiki">Wikipedia ↗</a>
                  </div>
                </div>
              </div>
            </details>`;
            })
            .join('')}
        </div>
        `
            : ''
        }

        <button id="retry-btn" class="action-btn">${t().ui.retry}</button>
        <button id="home-btn" class="action-btn secondary-btn">${t().ui.backToTop}</button>
      </div>
    </div>
  `;

  document.getElementById('retry-btn')?.addEventListener('click', () => startGame(gameState.mode));
  document.getElementById('home-btn')?.addEventListener('click', () => {
    currentMode = null;
    isShowingResult = false;
    init();
  });
  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));

  // Accordion map lazy loading
  const accordionMaps = new Map<number, L.Map>();

  document.querySelectorAll<HTMLDetailsElement>('.accordion-item').forEach((details) => {
    const index = parseInt(details.dataset.index || '0', 10);

    details.addEventListener('toggle', () => {
      if (details.open) {
        // Initialize map when accordion opens
        const mapContainer = document.getElementById(`accordion-map-${index}`);
        if (mapContainer && !accordionMaps.has(index)) {
          const q = gameState.questionHistory[index];
          if (!q) return;

          const accMap = L.map(mapContainer, {
            worldCopyJump: false,
            maxBounds: [
              [-90, -180],
              [90, 180],
            ],
            maxBoundsViscosity: 1.0,
          }).setView([0, 0], 2);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            noWrap: true,
          }).addTo(accMap);

          const latlngA: [number, number] = [q.cityA.lat, q.cityA.lon];
          const latlngB: [number, number] = [q.cityB.lat, q.cityB.lon];
          const labelA = lang === 'ja' ? q.cityA.capitalJp : q.cityA.capitalEn;
          const labelB = lang === 'ja' ? q.cityB.capitalJp : q.cityB.capitalEn;

          L.marker(latlngA).addTo(accMap).bindPopup(`${labelA}<br>(Target)`);
          L.marker(latlngB).addTo(accMap).bindPopup(`${labelB}<br>(Origin)`);
          L.polyline([latlngA, latlngB], { color: 'red' }).addTo(accMap);

          const group = new L.FeatureGroup([L.marker(latlngA), L.marker(latlngB)]);
          accMap.fitBounds(group.getBounds().pad(0.1));

          accordionMaps.set(index, accMap);
        }
      } else {
        // Clean up map when accordion closes
        const accMap = accordionMaps.get(index);
        if (accMap) {
          accMap.remove();
          accordionMaps.delete(index);
        }
      }
    });
  });
}

// --- Weakness Check Screen ---

function getScoreColor(score: number): string {
  // Smooth HSL gradient: green(120°) → yellow(60°) → orange(30°) → red(0°)
  // score ≤ 0 → hue 120 (green), score ≥ 6 → hue 0 (red)
  const clamped = Math.max(0, Math.min(6, score));
  const hue = 120 - (clamped / 6) * 120; // 120 → 0
  const saturation = 70 + (clamped / 6) * 15; // 70% → 85%
  const lightness = 45 + (clamped / 6) * 5; // 45% → 50%
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
}

function getMarkerRadius(score: number): number {
  return Math.max(4, Math.min(18, 4 + Math.abs(score) * 1.5));
}

function renderWeaknessCheck() {
  if (map) {
    map.remove();
    map = null;
  }

  isWeaknessScreen = true;
  currentMode = null;

  const scores = getWeaknessScores();
  // Build city list sorted by score descending
  const cityScores = cities.map((c) => ({
    city: c,
    score: scores[c.countryCode] || 0,
  }));
  cityScores.sort((a, b) => b.score - a.score);

  const tableRows = cityScores
    .map((cs) => {
      const name = lang === 'ja' ? cs.city.nameJp : cs.city.nameEn;
      const capital = lang === 'ja' ? cs.city.capitalJp : cs.city.capitalEn;
      const color = getScoreColor(cs.score);
      return `<tr>
        <td>${name}</td>
        <td>${capital}</td>
        <td><span class="score-badge" style="color:${color};border-color:${color}">${cs.score}</span></td>
      </tr>`;
    })
    .join('');

  app.innerHTML = `
    ${renderHeader()}
    <div class="scene weakness-scene">
      <h2 class="weakness-title">${t().ui.weaknessTitle}</h2>

      <div class="tab-container">
        <button class="tab-btn active" data-tab="map">${t().ui.weaknessMap}</button>
        <button class="tab-btn" data-tab="list">${t().ui.weaknessList}</button>
      </div>

      <div id="tab-map" class="tab-content active">
        <div id="weakness-map" class="weakness-map"></div>
        <div class="weakness-legend">
          <span class="legend-item"><span class="legend-dot" style="background:hsl(120,70%,45%)"></span> ≤0</span>
          <span class="legend-item"><span class="legend-dot" style="background:hsl(80,73%,46%)"></span> 1</span>
          <span class="legend-item"><span class="legend-dot" style="background:hsl(60,75%,47%)"></span> 2</span>
          <span class="legend-item"><span class="legend-dot" style="background:hsl(40,78%,48%)"></span> 3</span>
          <span class="legend-item"><span class="legend-dot" style="background:hsl(20,82%,49%)"></span> 4-5</span>
          <span class="legend-item"><span class="legend-dot" style="background:hsl(0,85%,50%)"></span> ≥6</span>
        </div>
      </div>

      <div id="tab-list" class="tab-content">
        <div class="weakness-table-wrap">
          <table class="weakness-table">
            <thead>
              <tr>
                <th>${t().ui.country}</th>
                <th>${t().ui.capital}</th>
                <th>${t().ui.weaknessScore}</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="weakness-actions">
        <button id="weakness-reset-btn" class="action-btn reset-btn">${t().ui.weaknessReset}</button>
        <button id="weakness-home-btn" class="action-btn secondary-btn">${t().ui.backToTop}</button>
      </div>
    </div>
  `;

  // Init map
  setTimeout(() => {
    const mapContainer = document.getElementById('weakness-map');
    if (!mapContainer) return;

    map = L.map(mapContainer, {
      worldCopyJump: false,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      noWrap: true,
    }).addTo(map);

    // Add circle markers for each city
    for (const cs of cityScores) {
      const color = getScoreColor(cs.score);
      const radius = getMarkerRadius(cs.score);
      const name = lang === 'ja' ? cs.city.nameJp : cs.city.nameEn;
      const capital = lang === 'ja' ? cs.city.capitalJp : cs.city.capitalEn;

      L.circleMarker([cs.city.lat, cs.city.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 1,
      })
        .addTo(map!)
        .bindPopup(
          `<strong>${capital}</strong><br>${name}<br>${t().ui.weaknessScore}: ${cs.score}`,
        );
    }
  }, 100);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`)?.classList.add('active');
      // Invalidate map size when switching to map tab
      if (tab === 'map' && map) {
        setTimeout(() => map?.invalidateSize(), 50);
      }
    });
  });

  // Reset button
  document.getElementById('weakness-reset-btn')?.addEventListener('click', () => {
    if (confirm(t().ui.weaknessResetConfirm)) {
      resetWeaknessScores();
      renderWeaknessCheck();
    }
  });

  // Home button
  document.getElementById('weakness-home-btn')?.addEventListener('click', () => {
    if (map) {
      map.remove();
      map = null;
    }
    isWeaknessScreen = false;
    init();
  });

  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
}

function endGame() {
  stopTimer();
  gameState.isGameOver = true;
  renderFinalResult();
}

init();
