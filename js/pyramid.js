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
    const adj = new Map(), phrase = new Map();
    const add = (a, b) => {
      if (a === b || a.length > maxLen || b.length > maxLen) return;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a).add(b);
      adj.get(b).add(a);
      if (!phrase.has(pairKey(a, b))) phrase.set(pairKey(a, b), `${a} ${b}`);
    };
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([a-z]+):\s*(.*)$/);
      if (m) for (const b of m[2].split(/\s+/).filter(Boolean)) add(m[1], b);
    }
    return { adj, phrase };
  }

  // Fills positions in order with backtracking. Each new word must link to its parent and to
  // no other word already placed, so the finished pyramid has exactly one valid arrangement.
  function generate(graph, rand, budget = 4000) {
    const { adj } = graph;
    const words = [...adj.keys()].sort();
    const roots = words.filter((w) => adj.get(w).size >= 2);
    for (let attempt = 0; attempt < 500; attempt++) {
      const tree = Array(SIZE), used = new Set();
      let steps = 0;
      const fits = (w, i) => {
        if (used.has(w)) return false;
        const p = i ? tree[parentOf(i)] : null;
        if (i < 7 && adj.get(w).size < (i ? 3 : 2)) return false;
        for (const u of used) if (u !== p && adj.get(w).has(u)) return false;
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

  window.PYR = { SIZE, LINKS, parentOf, depthOf, pairKey, phraseGraph, generate, scramble };
})();
