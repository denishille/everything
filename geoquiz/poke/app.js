/* Pokebrudis – PokeFind, PokeRank und PokePlay. Dieselben drei Spielarten wie
   bei Geobrudis, nur mit den ersten 150 Pokémon statt mit Ländern. */
(function () {
  'use strict';

  const D = window.POKE_DATA;
  const MON = D.pokemon;
  const BY_ID = Object.fromEntries(MON.map(p => [p.id, p]));
  const CATS = D.categories;
  const CAT_BY_KEY = Object.fromEntries(CATS.map(c => [c.key, c]));

  const MAX_GUESSES = 5;
  const ROUNDS = 8;
  const EPOCH = new Date(2026, 0, 1);           // Rätsel #1, wie bei Geobrudis

  // ------------------------------------------------------------------ utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const norm = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  function fmtStat(cat, v) {
    if (v == null) return '–';
    return (cat.fmt === 'dec1' ? nf1 : nf0).format(v) + (cat.unit ? ' ' + cat.unit : '');
  }

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
    get(k, fallback) { try { const v = localStorage.getItem('pokebrudis.' + k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem('pokebrudis.' + k, JSON.stringify(v)); } catch (e) { /* privat/gesperrt */ } },
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  const sprite = (p, cls) => `<img class="${cls}" src="sprites/${p.id}.png" alt="" loading="lazy" width="96" height="96">`;

  // ---------------------------------------------------------------- Modals
  function openModal(id) { $(id).hidden = false; }
  function closeModals() { $$('.modal').forEach(m => { m.hidden = true; }); }
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) closeModals(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

  // ---------------------------------------------------------------- Views
  let view = 'find';
  function setView(v) {
    view = v;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    try { location.hash = v; } catch (e) { /* egal */ }
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
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
  const filters = {
    find: store.get('findFilter', 'all'), rank: store.get('rankFilter', 'all'), play: store.get('playFilter', 'all'),
  };
  $('#find-filter').value = filters.find; $('#rank-filter').value = filters.rank; $('#play-filter').value = filters.play;

  // Serie und Schnitt führen alle drei Spiele gleich. "wert" ist bei PokeFind
  // und PokePlay die Zahl der Versuche (kleiner ist besser), bei PokeRank die
  // Punktzahl (größer ist besser).
  function recordStats(key, num, day, won, wert, kleinerIstBesser = true) {
    const st = store.get(key, { played: 0, wins: 0, sum: 0, best: 0, streak: 0, maxStreak: 0, lastDay: null, dist: {}, done: {} });
    st.done = st.done || {};
    if (st.done[num]) return;
    st.done[num] = 1;
    st.played++;
    if (won) {
      st.wins++;
      st.sum += wert;
      st.best = st.best ? (kleinerIstBesser ? Math.min(st.best, wert) : Math.max(st.best, wert)) : wert;
      if (kleinerIstBesser) st.dist[wert] = (st.dist[wert] || 0) + 1;
    }
    if (num === maxPuzzle() && st.lastDay !== day) {
      st.streak = won ? (st.lastDay === day - 1 ? st.streak + 1 : 1) : 0;
      st.maxStreak = Math.max(st.maxStreak, st.streak);
      st.lastDay = day;
    }
    store.set(key, st);
  }

  // =================================================================
  //  POKEFIND – das geheime Pokémon in 5 Versuchen
  // =================================================================
  const FIND_ORDER = shuffled(MON, mulberry32(20261025));
  const findKey = n => 'find.' + n;
  const find = { num: 0, day: 0, secret: null, guesses: [], done: false, won: false };

  const HINTS = [
    { key: 'num', lbl: 'Nummer' },
    { key: 'types', lbl: 'Typ', wide: true },
    { key: 'places', lbl: 'Fundort', wide: true },
    { key: 'habitat', lbl: 'Lebensraum' },
    { key: 'color', lbl: 'Farbe' },
    { key: 'height', lbl: 'Größe' },
    { key: 'weight', lbl: 'Gewicht' },
  ];
  const pfeil = (g, s) => g === s ? '✓' : s > g ? '↑' : '↓';

  function zahlZelle(gv, sv, text) {
    return { cls: gv === sv ? 'ok' : 'miss', html: esc(text), arrow: pfeil(gv, sv) };
  }
  // Mehrere Werte als Chips, gemeinsame zuerst und hervorgehoben
  function chipZelle(gWerte, sWerte, leer, zeigen = 3) {
    if (!gWerte.length) return { cls: sWerte.length ? 'miss' : 'ok', html: `<div class="chips"><span class="chip">${esc(leer)}</span></div>` };
    const gleich = gWerte.filter(x => sWerte.includes(x));
    const sortiert = gleich.concat(gWerte.filter(x => !gleich.includes(x)));
    const rest = sortiert.length - zeigen;
    const chips = sortiert.slice(0, zeigen)
      .map(x => `<span class="chip${gleich.includes(x) ? ' hit' : ''}">${esc(x)}</span>`).join('')
      + (rest > 0 ? `<span class="chip">+${rest}</span>` : '');
    const deckungsgleich = gleich.length === gWerte.length && gleich.length === sWerte.length;
    return { cls: deckungsgleich ? 'ok' : 'miss', html: `<div class="chips">${chips}</div>` };
  }

  function evalFind(g, s) {
    const out = {};
    out.num = zahlZelle(g.id, s.id, '#' + g.id);
    out.types = chipZelle(g.types, s.types, '–', 2);
    out.places = chipZelle(g.places, s.places, 'nur Entwicklung');
    out.height = zahlZelle(g.height, s.height, nf1.format(g.height) + ' m');
    out.weight = zahlZelle(g.weight, s.weight, nf1.format(g.weight) + ' kg');
    out.color = { cls: g.color === s.color ? 'ok' : 'miss', html: esc(g.color) };
    out.habitat = { cls: g.habitat === s.habitat ? 'ok' : 'miss', html: esc(g.habitat || '–') };
    return out;
  }
  function findRowHtml(g, ev) {
    return `<div class="guess">
      <div class="guess-title">${sprite(g, 'mini-sprite')}${esc(g.name)} <span class="cap">${esc(g.genus)}</span></div>
      <div class="cells">${HINTS.map(h => {
        const e = ev[h.key];
        return `<div class="cell ${e.cls}${h.wide ? ' wide' : ''}"><div class="lbl">${h.lbl}</div><div class="val">${e.html}</div>${e.arrow ? `<div class="arrow">${e.arrow}</div>` : ''}</div>`;
      }).join('')}</div>
    </div>`;
  }

  function loadFind(n) {
    n = clampPuzzle(n);
    find.num = n; find.day = n - 1;
    store.set('findLast', n);
    find.secret = FIND_ORDER[((find.day % FIND_ORDER.length) + FIND_ORDER.length) % FIND_ORDER.length];
    const saved = store.get(findKey(n), null);
    if (saved && saved.secret === find.secret.id) {
      find.guesses = saved.guesses.filter(i => BY_ID[i]);
      find.done = !!saved.done; find.won = !!saved.won;
    } else {
      find.guesses = []; find.done = false; find.won = false;
    }
    renderFind();
  }
  const saveFind = () => store.set(findKey(find.num), {
    day: find.day, secret: find.secret.id, guesses: find.guesses, done: find.done, won: find.won,
  });

  function renderFind() {
    $('#find-num').textContent = 'Rätsel #' + find.num;
    const list = fillPicker($('#find-pick'), find.num, findKey, filters.find);
    $('#find-prev').disabled = !neighbour(list, find.num, -1);
    $('#find-next').disabled = !neighbour(list, find.num, 1);
    const s = find.secret;
    $('#find-guesses').innerHTML = find.guesses.slice().reverse()
      .map(id => findRowHtml(BY_ID[id], evalFind(BY_ID[id], s))).join('');
    const input = $('#find-input');
    input.disabled = find.done; $('#find-btn').disabled = find.done;
    input.value = '';
    input.placeholder = find.done ? (find.won ? 'Gelöst' : 'Nicht gelöst') : 'Pokémon eingeben …';
    renderFindResult();
  }

  function renderFindResult() {
    const box = $('#find-result');
    if (!find.done) { box.hidden = true; return; }
    const s = find.secret;
    const list = puzzleList(findKey, filters.find);
    const prev = neighbour(list, find.num, -1), next = neighbour(list, find.num, 1);
    box.innerHTML = `
      ${sprite(s, 'big-sprite')}
      <h2>${esc(find.won ? 'Richtig! ' + s.name : 'Leider nicht. Es war ' + s.name)}</h2>
      <div class="facts">
        <span>#${s.id}</span><span>${esc(s.genus)}</span><span>${esc(s.types.join(' · '))}</span>
        <span>${nf1.format(s.height)} m</span><span>${nf1.format(s.weight)} kg</span>
        <span>${s.places.length ? esc(s.places.slice(0, 4).join(', ')) + (s.places.length > 4 ? ' …' : '') : 'In Gen 1 nur durch Entwicklung'}</span>
      </div>
      <div class="actions">
        ${prev ? `<button class="ghost" id="btn-find-prev">‹ Rätsel #${prev}</button>` : ''}
        ${next ? `<button class="ghost" id="btn-find-next">Rätsel #${next} ›</button>` : ''}
      </div>`;
    box.hidden = false;
    const bp = $('#btn-find-prev'); if (bp) bp.addEventListener('click', () => { loadFind(prev); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const bn = $('#btn-find-next'); if (bn) bn.addEventListener('click', () => { loadFind(next); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function submitFind(p) {
    if (find.done) return;
    if (find.guesses.includes(p.id)) { toast('Schon geraten: ' + p.name); return; }
    find.guesses.push(p.id);
    if (p.id === find.secret.id) { find.done = true; find.won = true; }
    else if (find.guesses.length >= MAX_GUESSES) { find.done = true; find.won = false; }
    if (find.done) recordStats('findStats', find.num, find.day, find.won, find.guesses.length);
    saveFind();
    renderFind();
    if (!find.done) $('#find-input').focus();
  }

  // ---- Autocomplete
  const SEARCH = MON.map(p => ({ p, n: norm(p.name) }));
  function findMatches(q) {
    const nq = norm(q);
    if (!nq) return [];
    return SEARCH
      .map(e => ({ p: e.p, score: e.n === nq ? 100 : e.n.startsWith(nq) ? 80 : e.n.includes(nq) ? 40 : 0 }))
      .filter(m => m.score)
      .sort((a, b) => b.score - a.score || a.p.id - b.p.id)
      .slice(0, 8);
  }
  const findInput = $('#find-input'), findSuggest = $('#find-suggest');
  let sugIdx = -1, sugItems = [];
  function renderSuggest() {
    if (!sugItems.length) { findSuggest.hidden = true; return; }
    findSuggest.innerHTML = sugItems.map((m, i) =>
      `<li data-i="${i}" class="${i === sugIdx ? 'sel' : ''}"><span>${esc(m.p.name)}</span><span class="alias">#${m.p.id}</span></li>`).join('');
    findSuggest.hidden = false;
  }
  findInput.addEventListener('input', () => {
    sugItems = findMatches(findInput.value).filter(m => !find.guesses.includes(m.p.id));
    sugIdx = sugItems.length ? 0 : -1;
    renderSuggest();
  });
  findInput.addEventListener('keydown', e => {
    if (findSuggest.hidden) return;
    if (e.key === 'ArrowDown') { sugIdx = Math.min(sugItems.length - 1, sugIdx + 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sugIdx = Math.max(0, sugIdx - 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === 'Tab' && sugIdx >= 0) { findInput.value = sugItems[sugIdx].p.name; findSuggest.hidden = true; e.preventDefault(); }
  });
  findInput.addEventListener('blur', () => setTimeout(() => { findSuggest.hidden = true; }, 150));
  findSuggest.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const m = sugItems[+li.dataset.i];
    findSuggest.hidden = true; findInput.value = '';
    submitFind(m.p);
  });
  $('#find-form').addEventListener('submit', e => {
    e.preventDefault();
    let p = null;
    if (!findSuggest.hidden && sugIdx >= 0 && sugItems[sugIdx]) p = sugItems[sugIdx].p;
    else { const m = findMatches(findInput.value); p = m.length && (m[0].score >= 80 || m.length === 1) ? m[0].p : null; }
    findSuggest.hidden = true;
    if (!p) { toast('Pokémon nicht gefunden'); return; }
    findInput.value = '';
    submitFind(p);
  });

  $('#find-prev').addEventListener('click', () => { const n = neighbour(puzzleList(findKey, filters.find), find.num, -1); if (n) loadFind(n); });
  $('#find-next').addEventListener('click', () => { const n = neighbour(puzzleList(findKey, filters.find), find.num, 1); if (n) loadFind(n); });
  $('#find-pick').addEventListener('change', e => loadFind(+e.target.value));
  $('#find-filter').addEventListener('change', e => {
    filters.find = e.target.value; store.set('findFilter', filters.find);
    const list = puzzleList(findKey, filters.find);
    if (list.length && !list.includes(find.num)) loadFind(list[0]); else renderFind();
  });

  // =================================================================
  //  POKERANK – welche Kategorie ist der Spitzenplatz?
  // =================================================================
  const rankKey = n => 'rank.' + n;
  const rank = { num: 0, day: 0, mons: [], cats: [], round: 0, picks: [] };

  // 8 Pokémon + 8 Kategorien, sodass jedes in genau einer der acht vorn liegt
  function buildRank(seed) {
    for (let versuch = 0; versuch < 50; versuch++) {
      const rng = mulberry32(seed + versuch * 7919);
      const picked = [];
      for (const c of shuffled(MON, rng)) {
        if (picked.length >= ROUNDS) break;
        const used = new Set(picked.map(p => p.cat));
        const cands = CATS.filter(cat => !used.has(cat.key)
          && picked.every(p => BY_ID[p.id].ranks[cat.key] > c.ranks[cat.key])
          && picked.every(p => c.ranks[p.cat] > BY_ID[p.id].ranks[p.cat]));
        if (!cands.length) continue;
        cands.sort((x, y) => c.ranks[x.key] - c.ranks[y.key]);
        const k = cands[0].key;
        if (picked.some(p => c.ranks[p.cat] <= c.ranks[k])) continue;
        if (picked.some(p => BY_ID[p.id].ranks[k] <= BY_ID[p.id].ranks[p.cat])) continue;
        picked.push({ id: c.id, cat: k });
      }
      if (picked.length === ROUNDS) {
        return { mons: picked.map(p => p.id), cats: shuffled(picked.map(p => p.cat), rng) };
      }
    }
    const rng = mulberry32(seed);
    return { mons: shuffled(MON, rng).slice(0, ROUNDS).map(p => p.id), cats: shuffled(CATS, rng).slice(0, ROUNDS).map(c => c.key) };
  }

  function loadRank(n) {
    n = clampPuzzle(n);
    rank.num = n; rank.day = n - 1;
    store.set('rankLast', n);
    const gebaut = buildRank(rank.day);
    rank.mons = gebaut.mons; rank.cats = gebaut.cats;
    rank.picks = [];
    const saved = store.get(rankKey(n), null);
    if (saved && JSON.stringify(saved.mons) === JSON.stringify(rank.mons)) rank.picks = saved.picks || [];
    rank.round = rank.picks.length;
    renderRank();
  }
  const saveRank = () => store.set(rankKey(rank.num), {
    day: rank.day, mons: rank.mons, picks: rank.picks,
    done: rank.picks.length >= ROUNDS, won: rank.picks.length >= ROUNDS,
  });

  // Punkte: Perzentil des Pokémon zwischen bestem und schlechtestem der acht
  function points(p, key) {
    const raenge = rank.mons.map(id => BY_ID[id].ranks[key]);
    const best = Math.min(...raenge), schlecht = Math.max(...raenge), r = p.ranks[key];
    if (r <= best || schlecht === best) return 100;
    return Math.max(0, Math.round(100 * (schlecht - r) / (schlecht - best)));
  }
  const rankScore = () => rank.picks.reduce((s, k, i) => s + points(BY_ID[rank.mons[i]], k), 0);

  function renderRank() {
    $('#rank-num').textContent = 'Rätsel #' + rank.num;
    const list = fillPicker($('#rank-pick'), rank.num, rankKey, filters.rank);
    $('#rank-prev').disabled = !neighbour(list, rank.num, -1);
    $('#rank-next').disabled = !neighbour(list, rank.num, 1);
    const fertig = rank.round >= ROUNDS;
    $('#rank-rounds').innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
      const pts = i < rank.picks.length ? points(BY_ID[rank.mons[i]], rank.picks[i]) : null;
      const cls = pts == null ? (i === rank.round ? ' now' : '') : pts >= 100 ? ' g' : pts >= 50 ? ' y' : ' r';
      return `<span class="round-dot${cls}">${pts == null ? i + 1 : pts}</span>`;
    }).join('');
    $('#rank-score').textContent = nf0.format(rankScore());
    $('#rank-board').hidden = fertig;
    if (!fertig) {
      const p = BY_ID[rank.mons[rank.round]];
      $('#rank-sprite').innerHTML = sprite(p, 'big-sprite');
      $('#rank-name').textContent = p.name;
      $('#rank-sub').textContent = `#${p.id} · ${p.genus} · ${p.types.join(' · ')}`;
      const offen = CATS.filter(c => rank.cats.includes(c.key) && !rank.picks.includes(c.key));
      $('#rank-grid').innerHTML = offen.map(c =>
        `<button class="cat" data-key="${c.key}"><span class="cn">${esc(c.name)}</span><span class="cd">${esc(c.desc)}</span></button>`).join('');
      $$('#rank-grid .cat').forEach(b => b.addEventListener('click', () => pickCat(b.dataset.key)));
    }
    renderRankResult();
  }

  function pickCat(key) {
    if (rank.round >= ROUNDS) return;
    const p = BY_ID[rank.mons[rank.round]];
    const pts = points(p, key);
    rank.picks.push(key);
    rank.round++;
    if (rank.round >= ROUNDS) recordStats('rankStats', rank.num, rank.day, true, rankScore(), false);
    saveRank();
    renderRank();
    toast(`+${pts} · ${CAT_BY_KEY[key].name}: Rang ${BY_ID[p.id].ranks[key]}`);
  }

  function renderRankResult() {
    const box = $('#rank-result');
    if (rank.round < ROUNDS) { box.hidden = true; return; }
    const t = rankScore();
    const urteil = t >= 700 ? 'Stark!' : t >= 500 ? 'Geht doch.' : t >= 300 ? 'Da ist Luft.' : 'Autsch.';
    const list = puzzleList(rankKey, filters.rank);
    const prev = neighbour(list, rank.num, -1), next = neighbour(list, rank.num, 1);
    box.innerHTML = `
      <h2>${t} / ${ROUNDS * 100} Punkte · ${urteil}</h2>
      <div class="rs-list">${rank.mons.map((id, i) => {
        const p = BY_ID[id], k = rank.picks[i], c = CAT_BY_KEY[k], pts = points(p, k);
        const cls = pts >= 100 ? 'g' : pts >= 50 ? 'y' : 'r';
        return `<div class="rs">${sprite(p, 'mini-sprite')}
          <div class="rs-body"><strong>${esc(p.name)}</strong>${esc(c.name)} · Rang ${p.ranks[k]} (${fmtStat(c, p.vals[k])})</div>
          <div class="rs-pts ${cls}">${pts}</div></div>`;
      }).join('')}</div>
      <div class="actions">
        ${prev ? `<button class="ghost" id="btn-rank-prev">‹ Rätsel #${prev}</button>` : ''}
        ${next ? `<button class="ghost" id="btn-rank-next">Rätsel #${next} ›</button>` : ''}
      </div>`;
    box.hidden = false;
    const bp = $('#btn-rank-prev'); if (bp) bp.addEventListener('click', () => { loadRank(prev); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const bn = $('#btn-rank-next'); if (bn) bn.addEventListener('click', () => { loadRank(next); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  $('#rank-prev').addEventListener('click', () => { const n = neighbour(puzzleList(rankKey, filters.rank), rank.num, -1); if (n) loadRank(n); });
  $('#rank-next').addEventListener('click', () => { const n = neighbour(puzzleList(rankKey, filters.rank), rank.num, 1); if (n) loadRank(n); });
  $('#rank-pick').addEventListener('change', e => loadRank(+e.target.value));
  $('#rank-filter').addEventListener('change', e => {
    filters.rank = e.target.value; store.set('rankFilter', filters.rank);
    const list = puzzleList(rankKey, filters.rank);
    if (list.length && !list.includes(rank.num)) loadRank(list[0]); else renderRank();
  });

  // =================================================================
  //  POKEPLAY – nach Ähnlichkeit raten (wie Wordplay, nur mit Pokémon)
  // =================================================================
  const playKey = n => 'play.' + n;
  const play = { num: 0, day: 0, secret: null, guesses: [], tipps: [], done: false, won: false, lastN: 1, ranks: {}, order: [] };
  const PLAY_ORDER = shuffled(MON, mulberry32(20261026));

  // Ähnlichkeit: Typ zählt am meisten, dann Basiswerte und Entwicklungsreihe,
  // dazu Eigruppe, Größe, Gewicht, Farbe, Lebensraum.
  const lg = x => Math.log(Math.max(x, .1));
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  function similar(a, b) {
    const typ = a.types.filter(t => b.types.includes(t)).length / Math.max(a.types.length, b.types.length);
    const ei = a.eggs.length && b.eggs.length
      ? a.eggs.filter(e => b.eggs.includes(e)).length / Math.max(a.eggs.length, b.eggs.length) : 0;
    const werte = Math.max(0, 1 - STATS.reduce((s, k) => s + Math.abs(a.stats[k] - b.stats[k]), 0) / 6 / 60);
    const groesse = Math.max(0, 1 - Math.abs(lg(a.height) - lg(b.height)) / 2.5);
    const gewicht = Math.max(0, 1 - Math.abs(lg(a.weight) - lg(b.weight)) / 5);
    return 1.00 * typ + 0.45 * ei + 0.60 * werte + 0.30 * groesse + 0.30 * gewicht
      + 0.35 * (a.color === b.color) + 0.25 * (a.habitat === b.habitat)
      + 0.60 * (a.chain === b.chain) + 0.20 * (a.stage === b.stage) + 0.25 * (a.legend === b.legend);
  }
  function rankAll(secret) {
    const sortiert = MON.slice().sort((x, y) => similar(secret, y) - similar(secret, x));
    const ranks = {};
    sortiert.forEach((p, i) => { ranks[p.id] = i + 1; });
    return { ranks, order: sortiert.map(p => p.id) };
  }

  function loadPlay(n) {
    n = clampPuzzle(n);
    play.num = n; play.day = n - 1;
    store.set('playLast', n);
    play.secret = PLAY_ORDER[((play.day % PLAY_ORDER.length) + PLAY_ORDER.length) % PLAY_ORDER.length];
    const gerechnet = rankAll(play.secret);
    play.ranks = gerechnet.ranks; play.order = gerechnet.order;
    const saved = store.get(playKey(n), null);
    if (saved && saved.secret === play.secret.id) {
      play.guesses = (saved.guesses || []).filter(i => BY_ID[i]);
      play.tipps = (saved.tipps || []).filter(i => BY_ID[i]);
      play.done = !!saved.done; play.won = !!saved.won;
    } else {
      play.guesses = []; play.tipps = []; play.done = false; play.won = false;
    }
    play.lastN = 1;
    renderPlay();
  }
  const savePlay = () => store.set(playKey(play.num), {
    day: play.day, secret: play.secret.id, guesses: play.guesses, tipps: play.tipps,
    done: play.done, won: play.won,
  });

  const playBar = r => Math.max(0, 100 * (1 - Math.log(r) / Math.log(MON.length)));
  function playRowHtml(id, now) {
    const p = BY_ID[id], r = play.ranks[id];
    return `<div class="wrow${r === 1 ? ' hit' : now ? ' now' : ''}" style="--p:${playBar(r).toFixed(1)}%">`
      + `<span>${sprite(p, 'row-sprite')}${esc(p.name)}</span>`
      + `<span class="wr">${play.tipps.includes(id) ? '<i>Tipp</i>' : ''}${nf0.format(r)}</span></div>`;
  }

  function renderPlay() {
    $('#play-num').textContent = 'Rätsel #' + play.num;
    const list = fillPicker($('#play-pick'), play.num, playKey, filters.play);
    $('#play-prev').disabled = !neighbour(list, play.num, -1);
    $('#play-next').disabled = !neighbour(list, play.num, 1);
    const last = play.guesses.slice(-(play.lastN || 1));
    $('#play-list').innerHTML = play.guesses.slice()
      .sort((a, b) => play.ranks[a] - play.ranks[b]).map(id => playRowHtml(id, last.includes(id))).join('');
    const input = $('#play-input');
    input.disabled = play.done; $('#play-btn').disabled = play.done;
    $('#play-tip').disabled = play.done; $('#play-give').disabled = play.done;
    armGive(false);
    input.value = '';
    input.placeholder = play.done ? (play.won ? 'Gelöst' : 'Aufgelöst') : 'Pokémon eingeben …';
    renderPlayResult();
  }

  function renderPlayResult() {
    const box = $('#play-result');
    if (!play.done) { box.hidden = true; return; }
    const s = play.secret;
    const list = puzzleList(playKey, filters.play);
    const prev = neighbour(list, play.num, -1), next = neighbour(list, play.num, 1);
    box.innerHTML = `
      ${sprite(s, 'big-sprite')}
      <h2>${esc(s.name)}</h2>
      <div class="facts">
        <span>${play.won ? play.guesses.length + ' Versuche' : 'aufgelöst'}</span>
        ${play.tipps.length ? `<span>davon ${play.tipps.length} ${play.tipps.length === 1 ? 'Tipp' : 'Tipps'}</span>` : ''}
      </div>
      <div class="actions">
        ${prev ? `<button class="ghost" id="btn-play-prev">‹ Rätsel #${prev}</button>` : ''}
        ${next ? `<button class="ghost" id="btn-play-next">Rätsel #${next} ›</button>` : ''}
      </div>`;
    box.hidden = false;
    const bp = $('#btn-play-prev'); if (bp) bp.addEventListener('click', () => { loadPlay(prev); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const bn = $('#btn-play-next'); if (bn) bn.addEventListener('click', () => { loadPlay(next); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function submitPlay(p) {
    if (play.done) return;
    if (play.guesses.includes(p.id)) { toast('Schon geraten: ' + p.name); return; }
    play.guesses.push(p.id);
    play.lastN = 1;
    if (play.ranks[p.id] === 1) {
      play.done = true; play.won = true;
      recordStats('playStats', play.num, play.day, true, play.guesses.length);
    }
    savePlay();
    renderPlay();
    if (!play.done) $('#play-input').focus();
  }

  $('#play-form').addEventListener('submit', e => {
    e.preventDefault();
    const m = findMatches($('#play-input').value);
    const p = m.length && (m[0].score >= 80 || m.length === 1) ? m[0].p : null;
    if (!p) { toast('Pokémon nicht gefunden'); return; }
    $('#play-input').value = '';
    submitPlay(p);
  });

  // Auflösen: erster Klick fragt nach, zweiter deckt auf
  let giveArmed = false;
  function armGive(on) {
    giveArmed = on;
    const b = $('#play-give');
    b.textContent = on ? 'Sicher?' : 'Auflösen';
    b.classList.toggle('armed', on);
  }
  $('#play-give').addEventListener('click', () => {
    if (play.done) return;
    if (!giveArmed) { armGive(true); return; }
    if (!play.guesses.includes(play.secret.id)) { play.guesses.push(play.secret.id); play.lastN = 1; }
    play.done = true; play.won = false;
    savePlay();
    renderPlay();
  });
  $('#play-input').addEventListener('input', () => { if (giveArmed) armGive(false); });

  // Tipp: ein Pokémon, das halb so weit weg ist wie der bisher beste Treffer
  $('#play-tip').addEventListener('click', () => {
    if (play.done) return;
    const best = play.guesses.length ? Math.min(...play.guesses.map(id => play.ranks[id])) : 80;
    const ziel = Math.floor(best / 2);
    if (ziel < 2) { toast('Näher geht es nicht mehr'); return; }
    for (let d = 0; d < MON.length; d++) {
      for (const r of (d ? [ziel - d, ziel + d] : [ziel])) {
        if (r < 2 || r > MON.length) continue;
        const id = play.order[r - 1];
        if (play.guesses.includes(id)) continue;
        play.guesses.push(id); play.tipps.push(id); play.lastN = 1;
        savePlay();
        renderPlay();
        return;
      }
    }
  });

  $('#play-prev').addEventListener('click', () => { const n = neighbour(puzzleList(playKey, filters.play), play.num, -1); if (n) loadPlay(n); });
  $('#play-next').addEventListener('click', () => { const n = neighbour(puzzleList(playKey, filters.play), play.num, 1); if (n) loadPlay(n); });
  $('#play-pick').addEventListener('change', e => loadPlay(+e.target.value));
  $('#play-filter').addEventListener('change', e => {
    filters.play = e.target.value; store.set('playFilter', filters.play);
    const list = puzzleList(playKey, filters.play);
    if (list.length && !list.includes(play.num)) loadPlay(list[0]); else renderPlay();
  });

  // =================================================================
  //  Statistik
  // =================================================================
  function statGrid(st, zweitWert, zweitName) {
    return `<div class="stat-grid">
      <div><strong>${st.played || 0}</strong><span>gespielt</span></div>
      <div><strong>${zweitWert}</strong><span>${zweitName}</span></div>
      <div><strong>${st.best || 0}</strong><span>Bestwert</span></div>
      <div><strong>${st.streak || 0}</strong><span>Serie</span></div>
    </div>`;
  }
  function renderStats() {
    const el = $('#stats-content');
    if (view === 'find') {
      const st = store.get('findStats', { played: 0, wins: 0, streak: 0, dist: {} });
      const maxD = Math.max(1, ...Object.values(st.dist || {}));
      const hl = find.done && find.won ? find.guesses.length : -1;
      el.innerHTML = `<h2>PokeFind – Statistik</h2>
        <div class="stat-grid">
          <div><strong>${st.played}</strong><span>gespielt</span></div>
          <div><strong>${st.played ? Math.round(100 * st.wins / st.played) : 0}%</strong><span>gelöst</span></div>
          <div><strong>${st.streak}</strong><span>Serie</span></div>
          <div><strong>${st.maxStreak || 0}</strong><span>beste Serie</span></div>
        </div>
        <h2>Verteilung der Versuche</h2>
        <div class="dist">${[1, 2, 3, 4, 5].map(n => `<span>${n}</span><div class="bar${n === hl ? ' hl' : ''}" style="width:${Math.max(7, 100 * ((st.dist || {})[n] || 0) / maxD)}%">${(st.dist || {})[n] || 0}</div>`).join('')}</div>`;
    } else if (view === 'rank') {
      const st = store.get('rankStats', { played: 0, wins: 0, sum: 0, best: 0, streak: 0 });
      el.innerHTML = `<h2>PokeRank – Statistik</h2>
        <div class="stat-grid">
          <div><strong>${st.played}</strong><span>Spiele</span></div>
          <div><strong>${st.wins ? Math.round(st.sum / st.wins) : 0}</strong><span>Ø Punkte</span></div>
          <div><strong>${st.best || 0}</strong><span>Bestwert</span></div>
          <div><strong>${st.streak}</strong><span>Serie</span></div>
        </div>
        <p class="muted">Die Serie zählt nur, wenn du das Rätsel des Tages am selben Tag spielst.</p>`;
    } else {
      const st = store.get('playStats', { played: 0, wins: 0, sum: 0, best: 0, streak: 0 });
      el.innerHTML = `<h2>PokePlay – Statistik</h2>
        ${statGrid(st, st.wins ? Math.round(st.sum / st.wins) : 0, 'Ø Versuche')}
        <p class="muted">Die Serie zählt nur, wenn du das Rätsel des Tages am selben Tag spielst.</p>`;
    }
  }

  // =================================================================
  //  Start
  // =================================================================
  loadFind(store.get('findLast', null) || undefined);
  loadRank(store.get('rankLast', null) || undefined);
  loadPlay(store.get('playLast', null) || undefined);
  setView({ '#rank': 'rank', '#play': 'play' }[location.hash] || 'find');

  let knownMax = maxPuzzle();
  setInterval(() => {
    if (maxPuzzle() !== knownMax) {
      knownMax = maxPuzzle();
      renderFind(); renderRank(); renderPlay();
      toast('Ein neuer Tag, ein neues Rätsel #' + knownMax + '!');
    }
  }, 30000);
})();
