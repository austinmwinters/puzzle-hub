// Pyramid link puzzles: a 4-level binary tree (positions 0..14, children of i at 2i+1, 2i+2)
// where every parent/child pair must be linked. Shared so other link types can reuse it.
(() => {
  const SIZE = 15, LINKS = 14;
  const parentOf = (i) => (i - 1) >> 1;
  const depthOf = (i) => Math.floor(Math.log2(i + 1));
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Undirected graph from "first: second second ..." lines. Long words are left out so
  // they fit in a node; `maxLen` keeps the pyramid readable on phones.
  function phraseGraph(text, maxLen = 9) {
    const adj = new Map(), down = new Map(), phrase = new Map();
    const add = (a, b) => {
      if (a === b || a.length > maxLen || b.length > maxLen) return;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      if (!down.has(a)) down.set(a, new Set());
      adj.get(a).add(b);
      adj.get(b).add(a);
      down.get(a).add(b);
      if (!phrase.has(pairKey(a, b))) phrase.set(pairKey(a, b), `${a} ${b}`);
    };
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([a-z]+):\s*(.*)$/);
      if (m) for (const b of m[2].split(/\s+/).filter(Boolean)) add(m[1], b);
    }
    return { adj, down, phrase, join: (top, below) => `${top} ${below}` };
  }

  // Fragment pairs from tools/build_fragments.py. `block` also holds pairs that join into
  // some other dictionary word, so a pyramid never contains an unintended valid link.
  function fragmentGraph(data) {
    const adj = new Map(), down = new Map(), block = new Map(), phrase = new Map();
    const link = (map, a, b) => {
      for (const [x, y] of [[a, b], [b, a]]) { if (!map.has(x)) map.set(x, new Set()); map.get(x).add(y); }
    };
    for (const t of data.good.split(' ')) {
      const [a, b] = t.split('+');
      link(adj, a, b); link(block, a, b);
      if (!down.has(a)) down.set(a, new Set());
      down.get(a).add(b);
      if (!phrase.has(pairKey(a, b))) phrase.set(pairKey(a, b), a + b);
    }
    for (const t of data.extra.split(' ')) {
      const [a, b] = t.split('+');
      if (adj.has(a) && adj.has(b)) link(block, a, b);
    }
    return { adj, down, block, phrase, join: (top, below) => top + below };
  }

  // Fills positions in order with backtracking. Each new word must link to its parent and to
  // no other word already placed, so the finished pyramid has exactly one valid arrangement.
  // With `directed`, every link reads downward: the upper word comes first ("card" above "game").
  // Without it (puzzles before 2026-10-28) links could read either way; kept so those stay the same.
  function generate(graph, rand, budget = 4000, directed = false) {
    const { adj } = graph, block = graph.block || adj;
    if (directed) return generateDown(graph, rand, budget, block);
    const words = [...adj.keys()].sort();
    const roots = words.filter((w) => adj.get(w).size >= 2);
    for (let attempt = 0; attempt < 500; attempt++) {
      const tree = Array(SIZE), used = new Set();
      let steps = 0;
      const fits = (w, i) => {
        if (used.has(w)) return false;
        const p = i ? tree[parentOf(i)] : null;
        if (i < 7 && adj.get(w).size < (i ? 3 : 2)) return false;
        for (const u of used) if (u !== p && block.get(w).has(u)) return false;
        return true;
      };
      const fill = (i) => {
        if (i === SIZE) return true;
        if (++steps > budget) return false;
        const pool = i ? [...adj.get(tree[parentOf(i)])] : [rand.pick(roots)];
        for (const w of rand.shuffle(pool)) {
          if (!fits(w, i)) continue;
          tree[i] = w; used.add(w);
          if (fill(i + 1)) return true;
          used.delete(w);
        }
        return false;
      };
      if (fill(0)) return tree;
    }
    throw new Error('Could not build a pyramid');
  }

  function generateDown(graph, rand, budget, block) {
    const kids = (w) => graph.down.get(w) || new Set();
    const roots = [...graph.down.keys()].sort().filter((w) => kids(w).size >= 2);
    for (let attempt = 0; attempt < 500; attempt++) {
      const tree = Array(SIZE), used = new Set();
      let steps = 0;
      const fits = (w, i) => {
        if (used.has(w)) return false;
        if (i < 7 && kids(w).size < 2) return false;
        const p = i ? tree[parentOf(i)] : null;
        for (const u of used) if (u !== p && block.get(w).has(u)) return false;
        return true;
      };
      const fill = (i) => {
        if (i === SIZE) return true;
        if (++steps > budget) return false;
        const pool = i ? [...kids(tree[parentOf(i)])] : [rand.pick(roots)];
        for (const w of rand.shuffle(pool)) {
          if (!fits(w, i)) continue;
          tree[i] = w; used.add(w);
          if (fill(i + 1)) return true;
          used.delete(w);
        }
        return false;
      };
      if (fill(0)) return tree;
    }
    throw new Error('Could not build a pyramid');
  }

  // Starting layout: a shuffle with as few accidental correct links as possible.
  function scramble(solution, rand) {
    const edges = new Set(solution.slice(1).map((w, k) => pairKey(w, solution[parentOf(k + 1)])));
    let best = null, bestScore = Infinity;
    for (let t = 0; t < 40 && bestScore > 0; t++) {
      const order = rand.shuffle(solution.slice());
      const score = order.slice(1).filter((w, k) => edges.has(pairKey(w, order[parentOf(k + 1)]))).length;
      if (score < bestScore) { best = order; bestScore = score; }
    }
    return best;
  }

  window.PYR = { SIZE, LINKS, parentOf, depthOf, pairKey, phraseGraph, fragmentGraph, generate, scramble };
})();
