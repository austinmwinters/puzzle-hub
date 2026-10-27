// Pieces shared by the word games: answer selection and the on-screen keyboard.
(() => {
  const { answers } = window.WORDS;

  // Daily answers walk a fixed shuffle of the list so words don't repeat until it runs out.
  function dailyAnswer(gameId, key) {
    const order = PZ.rng(PZ.hash(`${gameId}-order`)).shuffle(answers.slice());
    const n = PZ.dayNumber(key);
    return order[((n % order.length) + order.length) % order.length];
  }
  function randomAnswer() {
    return answers[Math.floor(Math.random() * answers.length)];
  }

  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  function keyboard(onKey) {
    const keys = {};
    const make = (k, label = k, wide = false) => {
      const b = PZ.el('button', { class: `key${wide ? ' wide' : ''}`, 'data-key': k, onclick: () => onKey(k) }, label);
      keys[k] = b;
      return b;
    };
    const node = PZ.el('div', { class: 'keyboard' },
      PZ.el('div', { class: 'kb-row' }, [...ROWS[0]].map((c) => make(c))),
      PZ.el('div', { class: 'kb-row' }, PZ.el('span', { class: 'spacer' }), [...ROWS[1]].map((c) => make(c)), PZ.el('span', { class: 'spacer' })),
      PZ.el('div', { class: 'kb-row' }, make('enter', 'Enter', true), [...ROWS[2]].map((c) => make(c)), make('back', '⌫', true)));
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Enter') onKey('enter');
      else if (e.key === 'Backspace') onKey('back');
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toLowerCase());
      else return;
      e.preventDefault();
    });
    return { node, keys };
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      PZ.toast('Copied to clipboard');
    } catch {
      PZ.toast('Could not copy');
    }
  }

  window.WG = { dailyAnswer, randomAnswer, keyboard, copy, isWord: (w) => window.WORDS.valid.has(w) };
})();
