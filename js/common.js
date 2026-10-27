// Shared helpers for every game: dates, seeded randomness, local storage,
// stats/streaks, the page header and modals. No network calls, ever.
(() => {
  const GAMES = [
    { id: 'wordle', name: 'Wordle', path: 'games/wordle.html', blurb: 'Six tries to find the five-letter word.', kind: 'guesses' },
    { id: 'betweenle', name: 'Betweenle', path: 'games/betweenle.html', blurb: 'Narrow it down alphabetically in 14 guesses.', kind: 'guesses' },
    { id: 'sudoku', name: 'Sudoku', path: 'games/sudoku.html', blurb: 'Fill the grid so every row, column and box has 1–9.', kind: 'time' },
    { id: 'nonogram', name: 'Nonogram', path: 'games/nonogram.html', blurb: 'Paint the picture from the row and column clues.', kind: 'time' },
    { id: 'minesweeper', name: 'Minesweeper', path: 'games/minesweeper.html', blurb: 'Clear the board — no guessing required.', kind: 'time' },
  ];

  const EPOCH = Date.UTC(2026, 0, 1);
  const pad = (n) => String(n).padStart(2, '0');

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dayNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  }
  function prettyDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // cyrb53-style string hash -> 32-bit seed, and mulberry32 PRNG.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    return h1 >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return next;
  }

  // localStorage can be missing or throw (private mode); never let that break a game.
  const PREFIX = 'pz:';
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
  }

  function getStats(gameId) {
    return load(`stats:${gameId}`, { played: 0, won: 0, streak: 0, maxStreak: 0, lastDay: null, best: null, history: {} });
  }

  // Records a finished daily puzzle once. `score` is guesses used or seconds taken.
  function recordDaily(gameId, key, won, score) {
    const s = getStats(gameId);
    if (s.history[key]) return s;
    const day = dayNumber(key);
    s.played++;
    s.history[key] = { won, score };
    if (won) {
      s.won++;
      s.streak = s.lastDay === day - 1 ? s.streak + 1 : 1;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.lastDay = day;
      if (score != null && (s.best == null || score < s.best)) s.best = score;
    } else {
      s.streak = 0;
      s.lastDay = day;
    }
    save(`stats:${gameId}`, s);
    return s;
  }
  // A streak is only alive if the last win was today or yesterday.
  function liveStreak(s) {
    const today = dayNumber(todayKey());
    return s.lastDay != null && today - s.lastDay <= 1 ? s.streak : 0;
  }

  // In-progress daily state, so a refresh or a later visit resumes the same puzzle.
  const dailyState = (gameId, key) => load(`daily:${gameId}:${key}`, null);
  const saveDailyState = (gameId, key, state) => save(`daily:${gameId}:${key}`, state);

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  function formatScore(game, score) {
    if (score == null) return '—';
    return game.kind === 'time' ? formatTime(score) : String(score);
  }

  const params = new URLSearchParams(location.search);
  const isPractice = params.get('mode') === 'practice';

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function closeModal() {
    document.querySelector('.modal-backdrop')?.remove();
  }
  function showModal(title, body, actions = []) {
    closeModal();
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('button', { class: 'modal-close', 'aria-label': 'Close', onclick: closeModal }, '×'),
      el('h2', {}, title),
      typeof body === 'string' ? el('div', { class: 'modal-body' }, ...parseHTML(body)) : body,
      actions.length ? el('div', { class: 'modal-actions' }, actions) : null);
    const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && closeModal() }, box);
    document.body.append(backdrop);
  }
  function parseHTML(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.childNodes];
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function toast(msg, ms = 1600) {
    let holder = document.querySelector('.toasts');
    if (!holder) document.body.append(holder = el('div', { class: 'toasts', 'aria-live': 'polite' }));
    const t = el('div', { class: 'toast' }, msg);
    holder.append(t);
    setTimeout(() => t.remove(), ms);
  }

  function statsPanel(gameId) {
    const game = GAMES.find((g) => g.id === gameId);
    const s = getStats(gameId);
    const pct = s.played ? Math.round((100 * s.won) / s.played) : 0;
    const tile = (n, label) => el('div', { class: 'stat' }, el('strong', {}, String(n)), el('span', {}, label));
    return el('div', { class: 'stats-grid' },
      tile(s.played, 'Played'), tile(`${pct}%`, game.kind === 'time' ? 'Solved' : 'Won'),
      tile(liveStreak(s), 'Streak'), tile(s.maxStreak, 'Best streak'),
      tile(formatScore(game, s.best), game.kind === 'time' ? 'Best time' : 'Fewest guesses'));
  }

  // Shared top bar: back to hub, title, daily/practice switch, help and stats buttons.
  function header(gameId, { onHelp } = {}) {
    const game = GAMES.find((g) => g.id === gameId);
    document.title = `${game.name} · Puzzle Hub`;
    const base = location.pathname;
    const bar = el('header', { class: 'topbar' },
      el('a', { class: 'icon-btn', href: '../index.html', 'aria-label': 'All games' }, '←'),
      el('h1', {}, game.name),
      el('nav', { class: 'mode-switch', 'aria-label': 'Mode' },
        el('a', { href: base, class: isPractice ? '' : 'active' }, 'Daily'),
        el('a', { href: `${base}?mode=practice`, class: isPractice ? 'active' : '' }, 'Practice')),
      onHelp ? el('button', { class: 'icon-btn', 'aria-label': 'How to play', onclick: onHelp }, '?') : null,
      el('button', { class: 'icon-btn', 'aria-label': 'Statistics', onclick: () => showModal(`${game.name} stats`, statsPanel(gameId)) }, '▥'));
    document.body.prepend(bar);
    return game;
  }

  // Simple stopwatch that survives reloads via the caller's saved `elapsed`.
  function stopwatch(node, elapsed = 0) {
    let start = null, timer = null;
    const now = () => elapsed + (start ? (Date.now() - start) / 1000 : 0);
    const render = () => { node.textContent = formatTime(now()); };
    render();
    return {
      start() { if (!start) { start = Date.now(); timer = setInterval(render, 250); } },
      stop() { if (start) { elapsed = now(); start = null; clearInterval(timer); render(); } },
      get seconds() { return Math.floor(now()); },
      set(sec) { this.stop(); elapsed = sec; render(); },
      reset() { this.set(0); },
    };
  }

  window.PZ = {
    GAMES, todayKey, dayNumber, prettyDate, hash, rng, load, save,
    getStats, recordDaily, liveStreak, dailyState, saveDailyState,
    formatTime, formatScore, isPractice, params, el, showModal, closeModal, toast,
    statsPanel, header, stopwatch,
  };
})();
