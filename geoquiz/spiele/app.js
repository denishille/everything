/* Spielbrudis – Wordplay. Eigene Seite, aber derselbe Spielstand wie früher:
   die Einträge im localStorage heißen weiter "geoquiz.word.*". */
(function () {
  'use strict';

  const EPOCH = new Date(2026, 0, 1);           // Rätsel #1, wie bei Geobrudis

  // ------------------------------------------------------------------ utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function todayIndex() {
    const n = new Date();
    const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((t - EPOCH) / 864e5);
  }
  const maxPuzzle = () => todayIndex() + 1;
  const clampPuzzle = n => Math.min(Math.max(1, Math.round(n) || maxPuzzle()), maxPuzzle());

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('geoquiz.' + k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem('geoquiz.' + k, JSON.stringify(v)); } catch (e) { /* privat/gesperrt */ } },
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------------------------------------------------------------- Modals
  function openModal(id) { $(id).hidden = false; }
  function closeModals() { $$('.modal').forEach(m => { m.hidden = true; }); }
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) closeModals(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  $('#btn-stats').addEventListener('click', () => { renderStats(); openModal('#modal-stats'); });

  // ------------------------------------------------------- Rätsel-Navigation
  const solvedState = (key, n) => { const st = store.get(key(n), null); return !!(st && st.done && st.won); };
  const doneState = (key, n) => { const st = store.get(key(n), null); return !!(st && st.done); };
  function puzzleList(key, filter) {
    const max = maxPuzzle();
    const all = Array.from({ length: max }, (_, i) => max - i);
    if (filter === 'solved') return all.filter(n => solvedState(key, n));
    if (filter === 'open') return all.filter(n => !doneState(key, n));
    return all;
  }
  function fillPicker(sel, current, key, filter) {
    const list = puzzleList(key, filter);
    if (!list.includes(current)) list.push(current), list.sort((a, b) => b - a);
    sel.innerHTML = list.map(n => `<option value="${n}"${n === current ? ' selected' : ''}>#${n}</option>`).join('');
    return list;
  }
  const neighbour = (list, current, dir) => dir < 0
    ? list.filter(n => n < current)[0]
    : list.filter(n => n > current).slice(-1)[0];
  const filters = { word: store.get('wordFilter', 'all') };
  $('#word-filter').value = filters.word;

  // =================================================================
  //  WORDPLAY – Wort erraten, der Rang zeigt die Bedeutungsnähe (nach contexto.me)
  // =================================================================
  const wordKey = n => 'word.' + n;
  const word = { num: 0, day: 0, secret: '', guesses: [], tipps: [], done: false, won: false, lastN: 1, ranks: null, order: null };
  let WORDS = null;                                 // Wortliste und Vektoren, erst bei Bedarf geladen

  function initWords(d) {
    const list = d.woerter.split(','), dim = d.dim, n = list.length;
    const bin = atob(d.vek), vec = new Float32Array(n * dim);
    const proWort = d.bits === 4 ? dim >> 1 : dim;                    // Bytes je Wort
    for (let i = 0; i < n; i++) {
      const o = i * dim, b = i * proWort;
      let len = 0;
      for (let k = 0; k < dim; k++) {
        // 4 Bit: zwei Werte je Byte, unteres Halbbyte zuerst, Versatz 8
        const q = d.bits === 4
          ? ((k & 1 ? bin.charCodeAt(b + (k >> 1)) >> 4 : bin.charCodeAt(b + (k >> 1)) & 15) - 8)
          : (bin.charCodeAt(b + k) << 24 >> 24);
        const v = q * d.skala[k];
        vec[o + k] = v; len += v * v;
      }
      len = 1 / (Math.sqrt(len) || 1);
      for (let k = 0; k < dim; k++) vec[o + k] *= len;                // normiert: Skalarprodukt = Kosinus
    }
    // exakt: mit Schreibweise. klein: alle Einträge zu einer Kleinschreibung
    // (fest/Fest). alias: gebeugte Formen und Nebenschreibweisen.
    const exakt = new Map(), klein = new Map(), alias = new Map();
    list.forEach((w, i) => {
      exakt.set(w, i);
      const k = w.toLowerCase();
      if (klein.has(k)) klein.get(k).push(i); else klein.set(k, [i]);
    });
    (d.alias || '').split(',').forEach((s, i) => {
      if (s) for (const f of s.split('|')) if (!alias.has(f)) alias.set(f, i);
    });
    WORDS = { list, exakt, klein, alias, vec, dim, n, kern: Math.min(d.kern || n, n),
              pool: shuffled(d.pool, mulberry32(20260921)),      // Reihenfolge der Rätselwörter
              tabu: new Set(d.tabu || []) };                      // nicht als Tipp vorschlagen
  }

  // words.js ist groß und wird nur für dieses Spiel gebraucht: erst beim Öffnen laden.
  // In der Einzeldatei-Fassung steckt es schon im Dokument.
  let wordLoading = false;
  function withWords(then) {
    if (WORDS) return then();
    if (window.WORD_DATA) { initWords(window.WORD_DATA); return then(); }
    if (wordLoading) return;
    wordLoading = true;
    const s = document.createElement('script');
    s.src = 'words.js';
    s.onload = () => { wordLoading = false; initWords(window.WORD_DATA); then(); };
    s.onerror = () => { wordLoading = false; toast('Wörter konnten nicht geladen werden'); };
    document.head.appendChild(s);
  }
  function openWord() {
    withWords(() => { if (!word.num) loadWord(store.get('wordLast', null) || undefined); });
  }

  // Rang jedes Worts zum gesuchten: 1 = das Wort selbst. Gezählt wird nur
  // gegen die Kernwörter (die häufigsten), sonst schieben sich seltene
  // Komposita wie "Jazzmusik" vor alles, was man wirklich tippt.
  function rankAll(si) {
    const { vec, dim, n, kern } = WORDS;
    const sim = new Float32Array(n), p = si * dim;
    for (let i = 0; i < n; i++) {
      const o = i * dim;
      let s = 0;
      for (let k = 0; k < dim; k++) s += vec[o + k] * vec[p + k];
      sim[i] = s;
    }
    // Kernwörter nach Nähe sortiert: order[r-1] ist das Wort mit Rang r
    const order = new Int32Array(kern);
    for (let i = 0; i < kern; i++) order[i] = i;
    order.sort((a, b) => sim[b] - sim[a]);
    const skala = new Float32Array(kern);                 // dieselben Werte aufsteigend
    for (let r = 0; r < kern; r++) skala[kern - 1 - r] = sim[order[r]];
    const rank = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      // Rang = wie viele Kernwörter näher dran sind, plus eins
      let lo = 0, hi = kern;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (skala[mid] > sim[i]) hi = mid; else lo = mid + 1;
      }
      rank[i] = kern - lo + 1;
    }
    return { rank, order };
  }

  function loadWord(n) {
    n = clampPuzzle(n);
    word.num = n; word.day = n - 1;
    store.set('wordLast', n);
    const si = WORDS.pool[((word.day % WORDS.pool.length) + WORDS.pool.length) % WORDS.pool.length];
    word.secret = WORDS.list[si];
    const gerechnet = rankAll(si);
    word.ranks = gerechnet.rank; word.order = gerechnet.order;
    const saved = store.get(wordKey(n), null);
    if (saved && saved.secret === word.secret) {
      const zuIndex = l => (l || []).map(w => WORDS.exakt.get(String(w))).filter(i => i != null);
      word.guesses = zuIndex(saved.guesses); word.tipps = zuIndex(saved.tipps);
      word.done = !!saved.done; word.won = !!saved.won;
    } else {
      word.guesses = []; word.tipps = []; word.done = false; word.won = false;
    }
    word.lastN = 1;
    renderWord();
  }
  function saveWord() {
    // Wörter statt Nummern speichern: die Liste kann sich beim nächsten Datenbau ändern.
    store.set(wordKey(word.num), {
      day: word.day, secret: word.secret, guesses: word.guesses.map(i => WORDS.list[i]),
      tipps: word.tipps.map(i => WORDS.list[i]), done: word.done, won: word.won,
    });
  }

  // Balkenlänge logarithmisch: auch Rang 300 ist noch zu sehen.
  const wordBar = r => Math.max(0, 100 * (1 - Math.log(r) / Math.log(WORDS.kern)));
  const wordRowHtml = (i, now) => {
    const r = word.ranks[i];
    return `<div class="wrow${r === 1 ? ' hit' : now ? ' now' : ''}" style="--p:${wordBar(r).toFixed(1)}%">`
      + `<span>${esc(WORDS.list[i])}</span>`
      + `<span class="wr">${word.tipps.includes(i) ? '<i>Tipp</i>' : ''}${nf0.format(r)}</span></div>`;
  };

  function renderWord() {
    $('#word-num').textContent = 'Rätsel #' + word.num;
    const wl = fillPicker($('#word-pick'), word.num, wordKey, filters.word);
    $('#word-prev').disabled = !neighbour(wl, word.num, -1);
    $('#word-next').disabled = !neighbour(wl, word.num, 1);
    const last = word.guesses.slice(-(word.lastN || 1));
    $('#word-list').innerHTML = word.guesses.slice()
      .sort((a, b) => word.ranks[a] - word.ranks[b]).map(i => wordRowHtml(i, last.includes(i))).join('');
    const input = $('#word-input');
    input.disabled = word.done; $('#word-btn').disabled = word.done;
    $('#word-give').disabled = word.done; $('#word-tip').disabled = word.done;
    armGive(false);
    input.value = '';
    input.placeholder = word.done ? (word.won ? 'Gelöst' : 'Aufgelöst') : 'Wort eingeben …';
    renderWordResult();
  }

  function renderWordResult() {
    const box = $('#word-result');
    if (!word.done) { box.hidden = true; return; }
    const wList = puzzleList(wordKey, filters.word);
    const wPrev = neighbour(wList, word.num, -1), wNext = neighbour(wList, word.num, 1);
    box.innerHTML = `
      <h2>${esc(word.secret)}</h2>
      <div class="facts"><span>${word.won ? word.guesses.length + ' Versuche' : 'aufgelöst'}</span>${word.tipps.length ? `<span>davon ${word.tipps.length} ${word.tipps.length === 1 ? 'Tipp' : 'Tipps'}</span>` : ''}</div>
      <div class="actions">
        ${wPrev ? `<button class="ghost" id="btn-word-prev">‹ Rätsel #${wPrev}</button>` : ''}
        ${wNext ? `<button class="ghost" id="btn-word-next">Rätsel #${wNext} ›</button>` : ''}
      </div>`;
    box.hidden = false;
    const bp = $('#btn-word-prev'); if (bp) bp.addEventListener('click', () => { loadWord(wPrev); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const bn = $('#btn-word-next'); if (bn) bn.addEventListener('click', () => { loadWord(wNext); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function recordWordStats() {
    const st = store.get('wordStats', { games: 0, sum: 0, best: 0, lastDay: null, streak: 0, maxStreak: 0, done: {} });
    st.done = st.done || {};
    if (st.done[word.num]) return;
    st.done[word.num] = 1;
    const t = word.guesses.length;
    st.games++; st.sum += t; st.best = st.best ? Math.min(st.best, t) : t;
    if (word.num === maxPuzzle() && st.lastDay !== word.day) {
      st.streak = st.lastDay === word.day - 1 ? st.streak + 1 : 1;
      st.maxStreak = Math.max(st.maxStreak, st.streak);
      st.lastDay = word.day;
    }
    store.set('wordStats', st);
  }

  function submitWord(treffer) {
    if (word.done) return;
    const neu = treffer.filter(i => !word.guesses.includes(i));
    if (!neu.length) { toast('Schon geraten: ' + WORDS.list[treffer[0]]); return; }
    word.guesses.push(...neu);
    word.lastN = neu.length;
    if (neu.some(i => word.ranks[i] === 1)) { word.done = true; word.won = true; recordWordStats(); }
    saveWord();
    renderWord();
    if (!word.done) $('#word-input').focus();
  }

  // Ein Wort nachschlagen. Groß geschrieben heißt ausdrücklich das Substantiv
  // ("Fest"). Klein geschrieben ist mehrdeutig — dann zählen beide Einträge,
  // denn Raten kostet hier nichts.
  const UML = { ä: 'a', ö: 'o', ü: 'u', Ä: 'A', Ö: 'O', Ü: 'U' };
  const wordVariants = s => [s, s.replace(/ss/g, 'ß'), s.replace(/ß/g, 'ss'),
    s.replace(/[äöüÄÖÜ]/g, m => UML[m])];
  function lookup(q) {
    const k = q.toLowerCase();
    const treffer = WORDS.klein.get(k);
    if (treffer) return q !== k && WORDS.exakt.has(q) ? [WORDS.exakt.get(q)] : treffer.slice();
    return WORDS.alias.has(k) ? [WORDS.alias.get(k)] : [];
  }
  // Tolerant bei gebeugten Formen: Endung abschneiden, Umlaut zurückdrehen,
  // ß und ss tauschen (Häuser → Haus).
  function resolveWord(q) {
    const roh = q.trim().replace(/[^a-zäöüßA-ZÄÖÜ]/g, '');
    if (!roh) return [];
    const klein = roh.toLowerCase(), stems = [roh];
    for (const suf of ['ern', 'en', 'er', 'es', 'se', 's', 'e', 'n']) {
      if (klein.length > suf.length + 2 && klein.endsWith(suf)) stems.push(roh.slice(0, -suf.length));
    }
    for (const stem of stems) {
      for (const v of wordVariants(stem)) {
        const t = lookup(v);
        if (t.length) return t;
      }
    }
    return [];
  }

  // Auflösen kostet das Rätsel, also zwei Klicks: der erste fragt nach.
  let giveArmed = false;
  function armGive(on) {
    giveArmed = on;
    const b = $('#word-give');
    b.textContent = on ? 'Sicher?' : 'Auflösen';
    b.classList.toggle('armed', on);
  }
  $('#word-give').addEventListener('click', () => {
    if (word.done || !WORDS) return;
    if (!giveArmed) { armGive(true); return; }
    const si = WORDS.exakt.get(word.secret);
    if (si != null && !word.guesses.includes(si)) { word.guesses.push(si); word.lastN = 1; }
    word.done = true; word.won = false;
    saveWord();
    renderWord();
  });
  $('#word-input').addEventListener('input', () => { if (giveArmed) armGive(false); });

  // Tipp: verrät das Wort, das halb so weit weg ist wie der bisher beste Treffer.
  // Ohne eigenen Treffer fängt es bei Rang 1000 an, danach halbiert es sich.
  $('#word-tip').addEventListener('click', () => {
    if (word.done || !WORDS) return;
    const best = word.guesses.length ? Math.min(...word.guesses.map(i => word.ranks[i])) : 2000;
    const ziel = Math.floor(best / 2);
    if (ziel < 2) { toast('Näher geht es nicht mehr'); return; }
    // vom Zielrang nach außen suchen, bis ein noch nicht genanntes Wort kommt
    for (let d = 0; d < WORDS.kern; d++) {
      for (const r of (d ? [ziel - d, ziel + d] : [ziel])) {
        if (r < 2 || r > WORDS.kern) continue;
        const i = word.order[r - 1];
        if (word.guesses.includes(i) || WORDS.tabu.has(i)) continue;
        word.guesses.push(i); word.tipps.push(i); word.lastN = 1;
        saveWord();
        renderWord();
        return;
      }
    }
  });

  $('#word-prev').addEventListener('click', () => { const n = neighbour(puzzleList(wordKey, filters.word), word.num, -1); if (n) loadWord(n); });
  $('#word-next').addEventListener('click', () => { const n = neighbour(puzzleList(wordKey, filters.word), word.num, 1); if (n) loadWord(n); });
  $('#word-pick').addEventListener('change', e => loadWord(+e.target.value));
  $('#word-filter').addEventListener('change', e => {
    filters.word = e.target.value; store.set('wordFilter', filters.word);
    const list = puzzleList(wordKey, filters.word);
    if (list.length && !list.includes(word.num)) loadWord(list[0]); else renderWord();
  });
  $('#word-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!WORDS) return;
    const input = $('#word-input');
    const treffer = resolveWord(input.value);
    if (!treffer.length) { toast('Wort nicht in der Liste'); return; }
    input.value = '';
    submitWord(treffer);
  });

  // =================================================================
  //  Statistik
  // =================================================================
  function renderStats() {
    const st = store.get('wordStats', { games: 0, sum: 0, best: 0, streak: 0, maxStreak: 0 });
    $('#stats-content').innerHTML = `<h2>Wordplay – Statistik</h2>
      <div class="stat-grid">
        <div><strong>${st.games}</strong><span>gelöst</span></div>
        <div><strong>${st.games ? Math.round(st.sum / st.games) : 0}</strong><span>Ø Versuche</span></div>
        <div><strong>${st.best || 0}</strong><span>Bestwert</span></div>
        <div><strong>${st.streak}</strong><span>Serie</span></div>
      </div>
      <p class="muted">Die Serie zählt nur, wenn du das Rätsel des Tages am selben Tag spielst.</p>`;
  }

  // =================================================================
  //  Start
  // =================================================================
  openWord();

  let knownMax = maxPuzzle();
  setInterval(() => {
    if (maxPuzzle() !== knownMax) {
      knownMax = maxPuzzle();
      if (WORDS && word.num) renderWord();
      toast('Ein neuer Tag, ein neues Rätsel #' + knownMax + '!');
    }
  }, 30000);
})();
