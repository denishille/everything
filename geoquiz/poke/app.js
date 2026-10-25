/* Pokebrudis – PokeFind, PokeRank und PokePlay. Dieselben drei Spielarten wie
   bei Geobrudis, nur mit den ersten 150 Pokémon statt mit Ländern. */
(function () {
  'use strict';

  const D = window.POKE_DATA;
  const MON = D.pokemon;
  const BY_ID = Object.fromEntries(MON.map(p => [p.id, p]));
  const MAX_GUESSES = 10;
  const EPOCH = new Date(2026, 0, 1);           // Rätsel #1, wie bei Geobrudis

  // ------------------------------------------------------------------ utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const norm = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

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
  const filters = { find: store.get('findFilter', 'all'), play: store.get('playFilter', 'all') };
  $('#find-filter').value = filters.find; $('#play-filter').value = filters.play;

  // Serie und Schnitt führen beide Spiele gleich; "wert" ist die Zahl der Versuche.
  function recordStats(key, num, day, won, wert) {
    const st = store.get(key, { played: 0, wins: 0, sum: 0, best: 0, streak: 0, maxStreak: 0, lastDay: null, dist: {}, done: {} });
    st.done = st.done || {};
    if (st.done[num]) return;
    st.done[num] = 1;
    st.played++;
    if (won) {
      st.wins++;
      st.sum += wert;
      st.best = st.best ? Math.min(st.best, wert) : wert;
      st.dist[wert] = (st.dist[wert] || 0) + 1;
    }
    if (num === maxPuzzle() && st.lastDay !== day) {
      st.streak = won ? (st.lastDay === day - 1 ? st.streak + 1 : 1) : 0;
      st.maxStreak = Math.max(st.maxStreak, st.streak);
      st.lastDay = day;
    }
    store.set(key, st);
  }

  // =================================================================
  //  POKEFIND – das geheime Pokémon in 10 Versuchen
  // =================================================================
  const FIND_ORDER = shuffled(MON, mulberry32(20261025));
  const findKey = n => 'find.' + n;
  const find = { num: 0, day: 0, secret: null, guesses: [], done: false, won: false };

  // Reihenfolge und Breite so, dass das Raster ohne Löcher aufgeht: erst die
  // vier Zahlen (je 1 Spalte), dann die vier Wortfelder (je 2). Macht 12
  // Spalten — volle Reihen auf dem Handy (4 Spalten) wie am Rechner (6).
  const HINTS = [
    { key: 'num', lbl: 'Nummer' },
    { key: 'stage', lbl: 'Stufe' },
    { key: 'height', lbl: 'Größe' },
    { key: 'weight', lbl: 'Gewicht' },
    { key: 'types', lbl: 'Typ', wide: true },
    { key: 'places', lbl: 'Fundort', wide: true },
    { key: 'habitat', lbl: 'Lebensraum', wide: true },
    { key: 'color', lbl: 'Farbe', wide: true },
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
    out.stage = zahlZelle(g.stage, s.stage, nf0.format(g.stage));
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

  // ---- Suchhilfe: Vorschlagsliste unter dem Eingabefeld
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
  // Hängt die Liste an ein Feld und liefert eine Funktion, die beim Absenden
  // das gemeinte Pokémon zurückgibt: den markierten Vorschlag, sonst den
  // besten Treffer.
  function suggestBox(input, box, schonGeraten, onPick) {
    let idx = -1, items = [];
    const zeichne = () => {
      if (!items.length) { box.hidden = true; return; }
      box.innerHTML = items.map((m, i) =>
        `<li data-i="${i}" class="${i === idx ? 'sel' : ''}"><span>${esc(m.p.name)}</span><span class="alias">#${m.p.id}</span></li>`).join('');
      box.hidden = false;
    };
    input.addEventListener('input', () => {
      items = findMatches(input.value).filter(m => !schonGeraten().includes(m.p.id));
      idx = items.length ? 0 : -1;
      zeichne();
    });
    input.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); zeichne(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); zeichne(); e.preventDefault(); }
      else if (e.key === 'Tab' && idx >= 0) { input.value = items[idx].p.name; box.hidden = true; e.preventDefault(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
    box.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      const m = items[+li.dataset.i];
      box.hidden = true; input.value = '';
      onPick(m.p);
    });
    return () => {
      const markiert = !box.hidden && idx >= 0 && items[idx] ? items[idx].p : null;
      box.hidden = true;
      if (markiert) return markiert;
      const m = findMatches(input.value);
      return m.length && (m[0].score >= 80 || m.length === 1) ? m[0].p : null;
    };
  }

  const findPick = suggestBox($('#find-input'), $('#find-suggest'), () => find.guesses, submitFind);
  $('#find-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = findPick();
    if (!p) { toast('Pokémon nicht gefunden'); return; }
    $('#find-input').value = '';
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
  //  POKEPLAY – nach Ähnlichkeit raten (wie Wordplay, nur mit Pokémon)
  // =================================================================
  const playKey = n => 'play.' + n;
  const play = { num: 0, day: 0, secret: null, guesses: [], tipps: [], done: false, won: false, lastN: 1, ranks: {}, order: [] };
  const PLAY_ORDER = shuffled(MON, mulberry32(20261026));

  // Ähnlichkeit aus fünf Dingen, die man dem Pokémon ansieht oder im Spiel
  // erlebt: Typ, Gegend zum Fangen, Optik, Entwicklungsstufe und Größe.
  // Kampfwerte bleiben bewusst draußen.
  const lg = x => Math.log(Math.max(x, .1));
  const anteil = (a, b) => a.filter(x => b.includes(x)).length / Math.max(a.length, b.length);
  function similar(a, b) {
    const typ = anteil(a.types, b.types);
    // gemeinsame Fundorte; wer nirgends zu fangen ist, teilt nur den Lebensraum
    const orte = a.places.length && b.places.length ? anteil(a.places, b.places) : 0;
    const gegend = Math.max(orte, 0.35 * (a.habitat === b.habitat));
    const optik = 0.60 * (a.color === b.color) + 0.40 * (a.shape === b.shape);
    const groesse = Math.max(0, 1 - Math.abs(lg(a.height) - lg(b.height)) / 2.0);
    return 1.00 * typ + 0.80 * gegend + 0.60 * optik + 0.35 * (a.stage === b.stage) + 0.45 * groesse;
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

  const playPick = suggestBox($('#play-input'), $('#play-suggest'), () => play.guesses, submitPlay);
  $('#play-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = playPick();
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
        <div class="dist">${Array.from({ length: MAX_GUESSES }, (_, i) => i + 1).map(n => `<span>${n}</span><div class="bar${n === hl ? ' hl' : ''}" style="width:${Math.max(7, 100 * ((st.dist || {})[n] || 0) / maxD)}%">${(st.dist || {})[n] || 0}</div>`).join('')}</div>`;
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
  loadPlay(store.get('playLast', null) || undefined);
  setView(location.hash === '#play' ? 'play' : 'find');

  let knownMax = maxPuzzle();
  setInterval(() => {
    if (maxPuzzle() !== knownMax) {
      knownMax = maxPuzzle();
      renderFind(); renderPlay();
      toast('Ein neuer Tag, ein neues Rätsel #' + knownMax + '!');
    }
  }, 30000);
})();
