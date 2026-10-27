// Shared helpers for every game: dates, seeded randomness, local storage,
// stats/streaks, the page header and modals. No network calls, ever.
(() => {
  // Icons are inline SVG drawn in currentColor, so they need no extra requests.
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICONS = {
    wordle: svg('<rect x="2.5" y="7" width="5.5" height="10" rx="1.5" fill="currentColor"/><rect x="9.25" y="7" width="5.5" height="10" rx="1.5"/><rect x="16" y="7" width="5.5" height="10" rx="1.5" fill="currentColor" opacity=".55"/>'),
    betweenle: svg('<path d="M12 3v18"/><path d="M7 7l5-4 5 4"/><path d="M7 17l5 4 5-4"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>'),
    sudoku: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
    nonogram: svg('<rect x="3" y="3" width="5" height="5" rx="1" fill="currentColor"/><rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1" fill="currentColor"/><rect x="3" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor"/><rect x="16" y="9.5" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1" fill="currentColor"/><rect x="9.5" y="16" width="5" height="5" rx="1" fill="currentColor"/><rect x="16" y="16" width="5" height="5" rx="1" fill="currentColor"/>'),
    minesweeper: svg('<circle cx="12" cy="13" r="6" fill="currentColor"/><path d="M12 3.5v3M12 19.5v1.5M3.5 13h2M18.5 13h2M6 7l1.5 1.5M18 7l-1.5 1.5"/><circle cx="10" cy="11" r="1.4" fill="#fff" stroke="none"/>'),
  };
  const GAMES = [
    { id: 'wordle', name: 'Wordle', path: 'games/wordle.html', blurb: 'Six tries to find the five-letter word.', kind: 'guesses', color: '#1fb36b' },
    { id: 'betweenle', name: 'Betweenle', path: 'games/betweenle.html', blurb: 'Narrow it down alphabetically in 14 guesses.', kind: 'guesses', color: '#8b5cf6' },
    { id: 'sudoku', name: 'Sudoku', path: 'games/sudoku.html', blurb: 'Fill the grid so every row, column and box has 1–9.', kind: 'time', color: '#3b82f6' },
    { id: 'nonogram', name: 'Nonogram', path: 'games/nonogram.html', blurb: 'Paint the picture from the row and column clues.', kind: 'time', color: '#f97316' },
    { id: 'minesweeper', name: 'Minesweeper', path: 'games/minesweeper.html', blurb: 'Clear the board — no guessing required.', kind: 'time', color: '#ef4466' },
  ].map((g) => ({ ...g, icon: ICONS[g.id] }));

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
    document.documentElement.style.setProperty('--game', game.color);
    const base = location.pathname;
    const bar = el('header', { class: 'topbar' },
      el('a', { class: 'icon-btn', href: '../index.html', 'aria-label': 'All games' }, '←'),
      el('h1', {}, ...parseHTML(game.icon), game.name),
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

  // A short burst of confetti in the page's game colour plus a few friends.
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = el('canvas', { class: 'confetti' });
    document.body.append(canvas);
    const ctx = canvas.getContext('2d'), dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = [getComputedStyle(document.documentElement).getPropertyValue('--game').trim() || '#7c5cff', '#f0b429', '#22b06b', '#ef4466', '#3b82f6', '#8b5cf6'];
    const bits = [...Array(140)].map(() => ({
      x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.vy += .35; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); ctx.restore();
      }
      if (t - t0 < 2600) requestAnimationFrame(frame); else canvas.remove();
    })(t0);
  }

  window.PZ = {
    GAMES, todayKey, dayNumber, prettyDate, hash, rng, load, save,
    getStats, recordDaily, liveStreak, dailyState, saveDailyState,
    formatTime, formatScore, isPractice, params, el, showModal, closeModal, toast,
    statsPanel, header, stopwatch, confetti, parseHTML,
  };
})();
