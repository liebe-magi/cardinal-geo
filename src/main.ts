import L from 'leaflet';
import { getTranslation, Lang } from './i18n';
import { GameMode, GameState, getHighScore, saveHighScore } from './modes';
import { formatDirection, generateQuestion, QuadDirection, Question } from './quiz';
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
};
let currentQuestion: Question | null = null;
let userGuess: QuadDirection = { ns: 'N', ew: 'E' };
let timerId: ReturnType<typeof setInterval> | null = null;
let map: L.Map | null = null;
let isShowingResult = false;

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
  if (currentMode) {
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
  app.innerHTML = `
    ${renderHeader()}
    <div class="scene">
      <div class="mode-grid">
        ${['survival', 'timeAttack', 'challenge']
          .map((m) => {
            const mode = m as GameMode;
            return `
            <button class="mode-btn" data-mode="${mode}">
              <span class="mode-title">${t().modes[mode]}</span>
              <span class="mode-desc">${t().modeDesc[mode]}</span>
              <span class="high-score">${t().ui.highScore}: ${getHighScore(mode)}</span>
            </button>
          `;
          })
          .join('')}
      </div>
    </div>
  `;

  document
    .getElementById('lang-toggle')
    ?.addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => startGame((btn as HTMLElement).dataset.mode as GameMode));
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
      ${gameState.mode === 'challenge' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}/10</span>` : ''}
    `;
  } else {
    // CREATE new elements
    const stats = `
      <div id="stats-bar" class="stats-bar">
        <span>${t().ui.score}: ${gameState.score}</span>
        ${gameState.mode === 'timeAttack' ? `<span>${t().ui.time}: ${gameState.timeLeft}s</span>` : ''}
        ${gameState.mode === 'challenge' ? `<span>${t().ui.question}: ${gameState.questionCount + 1}/10</span>` : ''}
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

function renderResult(isLastAnswerCorrect?: boolean) {
  if (!currentQuestion) return;

  const titleText = isLastAnswerCorrect ? t().ui.correct : t().ui.incorrect;
  const titleClass = isLastAnswerCorrect ? 'result-correct' : 'result-incorrect';

  const correctDir = formatDirection(currentQuestion.correctDirection, lang);

  const cityA = currentQuestion.cityA;
  const cityB = currentQuestion.cityB;
  const wikiA = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}`;
  const wikiB = `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}`;

  // Show "Correct answer is ..." if the user was wrong OR if we just want to reinforce learning.
  // Usually if correct, "North East" is displayed as title or implied.
  // Let's show it always for clarity.
  // Or only if incorrect?
  // User wants "Answer page", so map is key. Text confirmation is helpful.

  const wikiLabelA =
    lang === 'ja' ? `${cityA.capitalJp} (${cityA.nameJp})` : `${cityA.capitalEn} (${cityA.nameEn})`;
  const wikiLabelB =
    lang === 'ja' ? `${cityB.capitalJp} (${cityB.nameJp})` : `${cityB.capitalEn} (${cityB.nameEn})`;

  const mapLabelA = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
  const mapLabelB = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

  app.innerHTML = `
    ${renderHeader()}
    <div class="scene">
      <div class="result-header">
        <h2 class="${titleClass}">${titleText}</h2>
        <p>${t().ui.score}: ${gameState.score}</p>
        <p>${t().ui.correct}: ${correctDir}</p>
      </div>

      <div id="map" class="map-container"></div>

      <div class="wiki-links">
        <a href="${wikiA}" target="_blank" class="wiki-link">${wikiLabelA}</a>
        <a href="${wikiB}" target="_blank" class="wiki-link">${wikiLabelB}</a>
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
  currentQuestion = generateQuestion();
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
  isShowingResult = true;

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
}

function endGame() {
  stopTimer();
  gameState.isGameOver = true;
  renderFinalResult();
}

init();
