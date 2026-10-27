// Shared engine for the pyramid link games. Each page supplies the puzzle rules:
//   create(rand) -> { puzzle, order, ops }  puzzle: { solution, solOps?, labels, opLabels? }
//   judge(puzzle, order, ops, i) -> { key, ok }  for the link from position i to its parent.
//     `key` identifies what decides that link, so a verdict sticks to it after moves.
//   reveal(puzzle) -> strings listed after the game ends.
// Optional: levels (3 or 4), checks, lockable, big (larger numeric nodes), help.
(() => {
  window.PyraGame = function (cfg) {
    const GAME = cfg.id, MAX = cfg.checks, L = cfg.levels || 4;
    const SIZE = 2 ** L - 1, LEAVES = 2 ** (L - 1);
    const parentOf = (i) => (i - 1) >> 1, depthOf = (i) => Math.floor(Math.log2(i + 1));
    const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const game = PZ.header(GAME, { onHelp: cfg.help });

    const main = document.querySelector('main.game');
    const ui = {
      sub: PZ.el('p', { class: 'subline' }),
      timer: PZ.el('span', { class: 'timer' }, '0:00'),
      dots: PZ.el('div', { class: 'dots', 'aria-label': 'Checks left' }),
      swaps: PZ.el('span', { class: 'counter-sm' }),
      check: PZ.el('button', { class: 'btn primary' }, 'Check'),
      newBtn: PZ.el('button', { class: 'btn', hidden: true }, 'New puzzle'),
      stage: PZ.el('div', { class: 'stage' }),
      after: PZ.el('div', { class: 'toolbar' }),
      reveal: PZ.el('div', { class: 'phrases' }),
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ui.stage.append(svg);
    main.append(ui.sub, PZ.el('div', { class: 'toolbar' }, ui.timer, ui.dots, ui.swaps, ui.check, ui.newBtn), ui.stage, ui.after, ui.reveal);

    const today = PZ.todayKey();
    const timer = PZ.stopwatch(ui.timer);
    let P, order, ops, verdict, guesses, marks, swaps, over, sel = null, lastChecked = '';
    let nodeEls = new Map(), opEls = new Map(), pos = [], opPos = [], drawn = '', fadeTimer;

    // ---------- layout ----------
    function layout() {
      const W = ui.stage.clientWidth, wide = !!P.solOps || W >= 700;
      const nodeH = cfg.big ? 52 : 42;
      if (wide) {
        const slot = W / LEAVES, gap = P.solOps ? 104 : 92, top = nodeH / 2 + 6;
        const w = P.solOps ? Math.min(96, slot - (slot < 100 ? 30 : 40)) : Math.min(108, slot - 8);
        pos = [...Array(SIZE)].map((_, i) => {
          const d = depthOf(i), k = i - (2 ** d - 1);
          return { x: ((k + 0.5) / 2 ** d) * W, y: top + d * gap, w };
        });
        ui.stage.style.height = `${top * 2 + (L - 1) * gap}px`;
      } else {
        const colW = W / L, rowH = 52, H = rowH * LEAVES;
        pos = [...Array(SIZE)].map((_, i) => {
          const d = depthOf(i), k = i - (2 ** d - 1);
          return { x: colW * (d + 0.5), y: ((k + 0.5) / 2 ** d) * H, w: colW - 8 };
        });
        ui.stage.style.height = `${H}px`;
      }
      // Operators sit between the two numbers they combine.
      opPos = P.solOps ? P.solOps.map((_, p) => ({ x: (pos[2 * p + 1].x + pos[2 * p + 2].x) / 2, y: pos[2 * p + 1].y })) : [];
      ui.stage.dataset.wide = wide ? '1' : '';
      render();
    }

    // ---------- state ----------
    const judge = (i) => cfg.judge(P, order, ops, i);
    function lockedSet() {
      const locked = new Set();
      if (!cfg.lockable) return locked;
      const known = (i) => verdict[judge(i).key] === true;
      if (order[0] === P.solution[0] && (known(1) || known(2))) locked.add(0);
      for (let i = 1; i < SIZE; i++) if (locked.has(parentOf(i)) && known(i)) locked.add(i);
      return locked;
    }
    function snapshot(extra = {}) {
      return { order, ops, verdict, guesses, marks: [...marks], swaps, elapsed: timer.seconds, ...extra };
    }
    function persist() {
      if (!PZ.isPractice && !over) PZ.saveDailyState(GAME, today, snapshot());
    }

    // ---------- rendering ----------
    function render() {
      if (!pos.length) return;
      const wide = !!ui.stage.dataset.wide, locked = lockedSet();
      order.forEach((id, i) => {
        const el = nodeEls.get(id);
        if (!el.classList.contains('drag')) { el.style.left = `${pos[i].x}px`; el.style.top = `${pos[i].y}px`; }
        el.style.width = `${pos[i].w}px`;
        el.classList.toggle('sel', sel?.kind === 'node' && sel.group.includes(i));
        el.classList.toggle('locked', over || locked.has(i));
        el.classList.toggle('root', i === 0);
        el.dataset.i = i;
      });
      (ops || []).forEach((id, p) => {
        const el = opEls.get(id);
        if (!el.classList.contains('drag')) { el.style.left = `${opPos[p].x}px`; el.style.top = `${opPos[p].y}px`; }
        el.classList.toggle('sel', sel?.kind === 'op' && sel.i === p);
        el.dataset.i = p;
      });
      const paths = [];
      for (let i = 1; i < SIZE; i++) {
        const a = pos[parentOf(i)], b = pos[i], key = judge(i).key, mark = pairKey(order[i], order[parentOf(i)]);
        const d = wide
          ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`
          : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
        const cls = over || verdict[key] === true ? 'good' : verdict[key] === false ? 'bad' : marks.has(mark) ? 'marked' : '';
        paths.push(`<path class="link ${cls}" d="${d}"/><path class="hit" data-mark="${mark}" data-i="${i}" d="${d}"/>`);
      }
      // Lines snap to their new places, so hide them while the pieces slide over.
      const now = order.join(',');
      if (drawn && now !== drawn) {
        svg.classList.add('moving');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => svg.classList.remove('moving'), 330);
      }
      drawn = now;
      svg.innerHTML = paths.join('');
      ui.dots.replaceChildren(...[...Array(MAX)].map((_, k) => PZ.el('span', { class: `dot${k < guesses.length ? ' spent' : ''}` })));
      ui.swaps.textContent = `${swaps} swap${swaps === 1 ? '' : 's'}`;
      ui.check.disabled = over;
      ui.check.textContent = over ? 'Done' : `Check (${MAX - guesses.length} left)`;
    }

    // ---------- interaction ----------
    function swap(kind, i, j) {
      if (i === j || over) return;
      if (kind === 'node') {
        const locked = lockedSet();
        if (locked.has(i) || locked.has(j)) return PZ.toast('That one is locked in');
        [order[i], order[j]] = [order[j], order[i]];
      } else {
        [ops[i], ops[j]] = [ops[j], ops[i]];
      }
      swaps++;
      timer.start();
      persist();
    }
    // ---------- groups ----------
    // Gold-marked and confirmed-green links tie their pieces into a group that moves as one.
    const bonded = (i) => marks.has(pairKey(order[i], order[parentOf(i)])) || verdict[judge(i).key] === true;
    function groupOf(i) {
      let top = i;
      while (top > 0 && bonded(top)) top = parentOf(top);
      const members = [], stack = [top];
      while (stack.length) {
        const x = stack.pop();
        members.push(x);
        for (const c of [2 * x + 1, 2 * x + 2]) if (c < SIZE && bonded(c)) stack.push(c);
      }
      return { top, members };
    }
    // Left/right steps from `top` down to `x`, and the position those steps reach from `start`.
    const pathFrom = (top, x) => { const steps = []; for (; x !== top; x = parentOf(x)) steps.unshift((x - 1) % 2); return steps; };
    const follow = (start, steps) => steps.reduce((p, b) => 2 * p + 1 + b, start);

    // Moves the group holding `from` so that piece lands on `to`, keeping the group's shape.
    // Whatever sat in the landing spots takes the places the group left.
    function moveGroup(from, to) {
      const { top, members } = groupOf(from);
      if (members.length === 1) return swap('node', from, to);
      if (members.includes(to) || over) return;
      const steps = pathFrom(top, from);
      let newTop = to;
      for (let k = 0; k < steps.length; k++) {
        if (newTop === 0) return PZ.toast('The whole group won’t fit there');
        newTop = parentOf(newTop);
      }
      if (follow(newTop, steps) !== to) return PZ.toast('Drop it on a spot that keeps the group’s shape');
      const map = new Map(members.map((x) => [x, follow(newTop, pathFrom(top, x))]));
      if ([...map.values()].some((y) => y >= SIZE)) return PZ.toast('The whole group won’t fit there');
      const locked = lockedSet();
      if ([...map.keys(), ...map.values()].some((x) => locked.has(x))) return PZ.toast('That one is locked in');
      const next = order.slice(), from_ = new Set(members), to_ = new Set(map.values());
      for (const [x, y] of map) next[y] = order[x];
      const freed = members.filter((x) => !to_.has(x)).sort((a, b) => a - b);
      if (freed.length === members.length) {
        // No overlap: the pieces in the way swap back in the same shape.
        for (const [x, y] of map) next[x] = order[y];
      } else {
        const displaced = [...to_].filter((y) => !from_.has(y)).sort((a, b) => a - b);
        freed.forEach((x, k) => { next[x] = order[displaced[k]]; });
      }
      order = next;
      swaps++;
      timer.start();
      persist();
    }

    function tap(kind, i) {
      if (over) return;
      if (kind === 'node' && lockedSet().has(i)) { sel = null; render(); return PZ.toast('That one is locked in'); }
      if (!sel || sel.kind !== kind) sel = { kind, i, group: kind === 'node' ? groupOf(i).members : [i] };
      else if (sel.group.includes(i)) sel = null;
      else { kind === 'node' ? moveGroup(sel.i, i) : swap(kind, sel.i, i); sel = null; }
      render();
    }

    let drag = null;
    const kindOf = (el) => (el.classList.contains('pop') ? 'op' : 'node');
    const pieceAt = (x, y, d) => document.elementsFromPoint(x, y)
      .find((e) => !d.els.includes(e) && (e.classList?.contains('pnode') || e.classList?.contains('pop')) && kindOf(e) === d.kind);
    ui.stage.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.pnode, .pop');
      if (!el || over) return;
      drag = { el, kind: kindOf(el), i: +el.dataset.i, x: e.clientX, y: e.clientY, moved: false, target: null };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      if (!drag.moved) {
        const members = drag.kind === 'node' ? groupOf(drag.i).members : [drag.i];
        const locked = lockedSet();
        if (drag.kind === 'node' && members.some((x) => locked.has(x))) { drag = null; return PZ.toast('That one is locked in'); }
        drag.moved = true;
        // The whole group follows the pointer, each piece keeping its offset.
        drag.els = members.map((x) => (drag.kind === 'node' ? nodeEls.get(order[x]) : opEls.get(ops[x])));
        drag.base = drag.els.map((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
        drag.els.forEach((el) => el.classList.add('drag'));
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.els.forEach((el, k) => { el.style.left = `${drag.base[k][0] + dx}px`; el.style.top = `${drag.base[k][1] + dy}px`; });
      const t = pieceAt(e.clientX, e.clientY, drag);
      if (drag.target !== t) { drag.target?.classList.remove('target'); drag.target = t; t?.classList.add('target'); }
    });
    window.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      d.target?.classList.remove('target');
      if (!d.moved) return tap(d.kind, d.i);
      d.els.forEach((el) => el.classList.remove('drag'));
      if (d.target) d.kind === 'node' ? moveGroup(d.i, +d.target.dataset.i) : swap(d.kind, d.i, +d.target.dataset.i);
      sel = null;
      render();
    });
    svg.addEventListener('click', (e) => {
      const mark = e.target.dataset?.mark;
      if (!mark || over || verdict[judge(+e.target.dataset.i).key] != null) return;
      marks.has(mark) ? marks.delete(mark) : marks.add(mark);
      render();
      persist();
    });

    ui.check.onclick = () => {
      if (over) return;
      const sig = order.join(',') + '/' + (ops || []).join(',');
      if (sig === lastChecked) return PZ.toast('Swap something before checking again');
      lastChecked = sig;
      timer.start();
      const result = [];
      for (let i = 1; i < SIZE; i++) {
        const { key, ok } = judge(i);
        verdict[key] = ok;
        result.push(ok);
      }
      guesses.push(result);
      sel = null;
      const solved = result.every(Boolean);
      if (solved || guesses.length >= MAX) return finish(solved, true);
      PZ.toast(`${result.filter(Boolean).length} of ${result.length} links correct`);
      render();
      persist();
    };

    function shareText(won) {
      const rows = guesses.map((g) => g.map((ok) => (ok ? '🟩' : '🟥')).join('')).join('\n');
      return `${game.name} ${PZ.isPractice ? '(practice)' : today} ${won ? guesses.length : 'X'}/${MAX} · ${swaps} swaps · ${PZ.formatTime(timer.seconds)}\n${rows}`;
    }

    function finish(won, fresh) {
      over = true;
      timer.stop();
      if (!won) { order = P.solution.slice(); if (P.solOps) ops = P.solOps.slice(); }
      if (!PZ.isPractice && fresh) PZ.recordDaily(GAME, today, won, won ? guesses.length : null);
      if (!PZ.isPractice) PZ.saveDailyState(GAME, today, snapshot({ done: won ? 'won' : 'lost' }));
      render();
      ui.after.replaceChildren(
        PZ.el('span', { class: `done-banner${won ? '' : ' lost'}` }, won ? `Solved with ${guesses.length} check${guesses.length > 1 ? 's' : ''}` : 'Out of checks. Here’s the answer'),
        PZ.el('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(shareText(won)); PZ.toast('Copied'); } catch { PZ.toast('Could not copy'); } } }, 'Copy result'),
        PZ.isPractice ? PZ.el('button', { class: 'btn primary', onclick: freshPuzzle }, 'New puzzle') : '');
      ui.reveal.replaceChildren(...cfg.reveal(P).map((s) => PZ.el('span', {}, s)));
      if (won && fresh) PZ.confetti();
      if (fresh && !PZ.isPractice) setTimeout(() => PZ.showModal(won ? 'Pyramid complete!' : 'Out of checks', PZ.statsPanel(GAME)), won ? 1000 : 500);
    }

    function start(seed, saved) {
      const made = cfg.create(PZ.rng(seed));
      P = made.puzzle;
      order = saved?.order || made.order;
      ops = saved?.ops || made.ops || null;
      verdict = saved?.verdict || {};
      guesses = saved?.guesses || [];
      marks = new Set(saved?.marks || []);
      swaps = saved?.swaps || 0;
      over = false; sel = null; lastChecked = '';
      timer.set(saved?.elapsed || 0);
      ui.after.replaceChildren();
      ui.reveal.replaceChildren();
      [...nodeEls.values(), ...opEls.values()].forEach((el) => el.remove());
      nodeEls = new Map(P.solution.map((id) => [id, PZ.el('div', { class: `pnode${cfg.big ? ' big' : ''}` }, P.labels[id] ?? id)]));
      opEls = new Map((P.solOps || []).map((id) => [id, PZ.el('div', { class: 'pop' }, P.opLabels[id])]));
      ui.stage.append(...nodeEls.values(), ...opEls.values());
      drawn = '';
      layout();
    }
    function freshPuzzle() { start(Math.random() * 2 ** 32); }

    window.addEventListener('resize', () => P && layout());
    if (PZ.isPractice) {
      ui.sub.textContent = `Practice: endless pyramids, no effect on stats`;
      ui.newBtn.hidden = false;
      ui.newBtn.onclick = freshPuzzle;
      freshPuzzle();
    } else {
      ui.sub.textContent = `Daily · ${PZ.prettyDate(today)}`;
      const saved = PZ.dailyState(GAME, today);
      start(PZ.hash(`${GAME}-${today}`), saved);
      if (saved?.done) finish(saved.done === 'won', false);
      else if (!PZ.getStats(GAME).played && !saved) cfg.help();
    }
    window.addEventListener('pagehide', persist);
    // Handle for poking at the game from the browser console.
    window.pyra = {
      get puzzle() { return P; }, get order() { return order; }, get ops() { return ops; }, get over() { return over; },
      set(o, p) { order = o.slice(); if (p) ops = p.slice(); render(); },
      mark(i) { marks.add(pairKey(order[i], order[parentOf(i)])); render(); },
      move(from, to) { moveGroup(from, to); render(); }, group: (i) => groupOf(i).members,
      swap(kind, i, j) { swap(kind, i, j); render(); }, tap, locked: () => [...lockedSet()],
    };
  };

  // The word-based games share everything except their link data and wording.
  window.PyraWords = function ({ id, graph, help }) {
    const { pairKey, parentOf } = window.PYR;
    let edges;
    window.PyraGame({
      id, checks: 4, levels: 4, lockable: true, help,
      create(rand) {
        const solution = PYR.generate(graph, rand);
        edges = new Set(solution.slice(1).map((w, k) => pairKey(w, solution[parentOf(k + 1)])));
        return { puzzle: { solution, labels: {} }, order: PYR.scramble(solution, rand) };
      },
      judge(P, order, ops, i) {
        const key = pairKey(order[i], order[parentOf(i)]);
        return { key, ok: edges.has(key) };
      },
      reveal: (P) => P.solution.slice(1).map((w, k) => graph.phrase.get(pairKey(w, P.solution[parentOf(k + 1)]))),
    });
  };
})();
