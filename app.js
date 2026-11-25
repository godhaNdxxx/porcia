/* Порция — интерфейс. Данные хранятся в localStorage этого телефона. */
(function () {
  'use strict';
  const C = window.PorciaCore;
  const KEY = 'porcia.v1';
  const MEALS = [['b', 'Завтрак'], ['l', 'Обед'], ['d', 'Ужин'], ['s', 'Перекус']];
  const MEAL_NAME = { b: 'Завтрак', l: 'Обед', d: 'Ужин', s: 'Перекус' };
  const MEAL_TO = { b: 'в завтрак', l: 'в обед', d: 'в ужин', s: 'в перекус' };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = n => Math.round(n).toLocaleString('ru-RU');
  const g1 = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
  const num = s => { const v = parseFloat(String(s == null ? '' : s).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(v) ? v : null; };
  const r10 = n => Math.round(n / 10) * 10;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Даты ----------
  const z = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  const today = () => iso(new Date());
  const toDate = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const fmtLong = s => toDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const fmtShort = s => toDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  function fmtDay(s) {
    const t = today();
    if (s === t) return 'Сегодня';
    if (s === addDays(t, -1)) return 'Вчера';
    const w = toDate(s).toLocaleDateString('ru-RU', { weekday: 'short' });
    return w.charAt(0).toUpperCase() + w.slice(1) + ', ' + fmtLong(s);
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

  // ---------- Хранилище ----------
  function blank() {
    return {
      v: 1, created: today(),
      settings: { limits: [], protein: null, fat: null, stepGoal: null, onboarded: false, stallDismissed: null, baselineDismissed: false, weighSnooze: null, lastBackup: null, water: null },
      log: {}, custom: [], body: [], favs: [], act: {}, water: {}, waterLog: {},
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const b = blank();
        return Object.assign(b, d, { settings: Object.assign(b.settings, d.settings || {}) });
      }
    } catch (e) { /* пустое хранилище */ }
    return blank();
  }
  let S = load();
  let storageOk = true;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { if (storageOk) toast('Не получилось сохранить: память браузера недоступна'); storageOk = false; }
  }

  // ---------- Расчёты ----------
  const dayItems = d => S.log[d] || [];
  const totals = items => items.reduce((a, i) => ({ kcal: a.kcal + (i.k || 0), p: a.p + (i.p || 0), f: a.f + (i.f || 0), c: a.c + (i.c || 0) }), { kcal: 0, p: 0, f: 0, c: 0 });
  function limitFor(day) { let L = null; for (const l of S.settings.limits) if (l.d <= day) L = l.k; return L; }
  function currentLimitEntry() { const t = today(); let e = null; for (const l of S.settings.limits) if (l.d <= t) e = l; return e && e.k ? e : null; }
  function setLimit(k) {
    const d = today();
    S.settings.limits = S.settings.limits.filter(l => l.d !== d);
    S.settings.limits.push({ d, k: k ? Math.round(k) : null });
    S.settings.limits.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    save();
  }
  function loggedDaysBefore(day) { return Object.keys(S.log).filter(d => d < day && S.log[d].length).sort(); }
  function baseline() {
    const days = loggedDaysBefore(today());
    const last5 = days.slice(-5);
    const avg = last5.length ? last5.reduce((s, d) => s + totals(S.log[d]).kcal, 0) / last5.length : 0;
    return { count: days.length, last5, avg, limit: r10(avg * 0.9) };
  }
  function weights() { return S.body.filter(b => b.w).slice().sort((a, b) => a.d < b.d ? -1 : 1); }
  function stall() {
    const L = currentLimitEntry(); if (!L) return null;
    const w = weights(); if (w.length < 2) return null;
    const last = w[w.length - 1];
    if (daysBetween(L.d, last.d) < 14) return null;
    const prev = w.slice().reverse().find(x => daysBetween(x.d, last.d) >= 12);
    if (!prev || prev.w - last.w >= 0.3) return null;
    if (S.settings.stallDismissed === last.d) return null;
    return { from: prev, to: last, limit: L.k, next: r10(L.k * 0.9) };
  }
  // ---------- Вода ----------
  // Объём стакана можно задать самой (S.settings.glass), иначе цель делится на 4–10 стаканов примерно по 250 мл.
  // В S.water хранятся выпитые мл по дням — поэтому смена объёма стакана не меняет уже выпитое.
  const GLASS_MIN = 50, GLASS_MAX = 1000, GLASS_PRESETS = [150, 200, 250, 300, 330, 500];
  function waterPlan(goal, glass) {
    const g = goal === undefined ? S.settings.water : goal;
    if (!g) return null;
    const gs = glass === undefined ? S.settings.glass : glass;
    if (gs) return { goal: g, n: Math.min(25, Math.max(1, Math.ceil(g / gs - 0.001))), size: gs, custom: true };
    const n = Math.min(10, Math.max(4, Math.round(g / 250)));
    return { goal: g, n, size: g / n };
  }
  function waterStore() { if (!S.water || typeof S.water !== 'object' || Array.isArray(S.water)) S.water = {}; return S.water; }
  function waterMl(day) { return Math.max(0, +waterStore()[day] || 0); }
  function waterCount(day, plan) { return Math.max(0, Math.min(plan.n, Math.floor(waterMl(day) / plan.size + 0.02))); }
  function setWaterMl(day, ml) {
    const W = waterStore();
    ml = Math.max(0, Math.min(20000, Math.round(ml)));
    if (ml) W[day] = ml; else delete W[day];
    save();
  }
  // Из чего сложилось выпитое: S.waterLog[день] — каждое добавление отдельно (кружка 350, стакан 400…),
  // чтобы объёмы можно было мешать, а «−» убирал ровно последнее. base — выпитое до этой версии или без записи.
  function waterLogStore() { if (!S.waterLog || typeof S.waterLog !== 'object' || Array.isArray(S.waterLog)) S.waterLog = {}; return S.waterLog; }
  function waterParts(day) {
    const total = waterMl(day);
    let adds = (Array.isArray(waterLogStore()[day]) ? waterLogStore()[day] : []).map(Number).filter(v => v > 0).map(Math.round);
    let sum = adds.reduce((a, b) => a + b, 0);
    if (sum > total) { adds = []; sum = 0; }
    return { base: total - sum, adds };
  }
  function waterSave(day, base, adds) {
    const L = waterLogStore();
    if (adds.length) L[day] = adds; else delete L[day];
    setWaterMl(day, Math.max(0, base) + adds.reduce((a, b) => a + b, 0));
  }
  // Объёмы, которые она добавляла недавно (кроме стакана по умолчанию) — для быстрых кнопок
  function waterRecent(skip, max) {
    const out = [], L = waterLogStore();
    for (const d of Object.keys(L).sort().reverse()) {
      const a = Array.isArray(L[d]) ? L[d] : [];
      for (let i = a.length - 1; i >= 0; i--) { const v = Math.round(+a[i]); if (v >= 10 && v <= 3000 && v !== skip && !out.includes(v)) out.push(v); }
      if (out.length >= max) break;
    }
    for (const v of glassMine()) if (out.length < max && v !== skip && !out.includes(v)) out.push(v);
    return out.slice(0, max);
  }
  function waterPlanText(plan) {
    const exact = Math.abs(plan.size - Math.round(plan.size)) < 0.01;
    return `${plan.n} ${plural(plan.n, 'стакан', 'стакана', 'стаканов')} ${exact ? 'по' : 'примерно по'} ${nf(plan.size)} мл`;
  }
  function autoMeal() { const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 11 ? 'b' : h < 16 ? 'l' : h < 21.5 ? 'd' : 's'; }
  function foodOf(fid) { return fid ? C.findFood(fid, S.custom) : null; }
  function phFood(ph, drink) { return { kcal: ph.k, p: ph.p, f: ph.f, c: ph.c, units: {}, drink: !!drink }; }
  function itemFood(it) { return it.fid ? foodOf(it.fid) : it.ph ? phFood(it.ph, it.drink || it.dr) : null; }
  function labelFor(food, g) {
    const u = food.units && food.units.pc;
    const gl = g + (food.drink ? ' мл' : ' г');
    if (u && !food.drink && Math.abs(g / u - Math.round(g / u)) < 0.01 && g / u <= 20) return Math.round(g / u) + ' шт · ' + gl;
    return gl;
  }

  // ---------- Состояние интерфейса ----------
  const ui = { view: 'today', day: today(), meal: autoMeal(), mealTouched: false, draft: [], delArm: null, followToday: true, photo: null, photoItems: [], dismissed: new Set() };

  // ---------- Иконки ----------
  const IC = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5.5 12h13"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  };
  const GLASS = 'M3.5 2.5h21a1.5 1.5 0 0 1 1.5 1.7l-2.5 26a3.6 3.6 0 0 1-3.6 3.3H8.1a3.6 3.6 0 0 1-3.6-3.3L2 4.2a1.5 1.5 0 0 1 1.5-1.7z';

  // ---------- Оформление 1.8: лента недели, плитки макросов, карточки приёмов, цель по весу ----------
  const ND = () => true;
  const DZ = () => true;
  const APP_VER = '1.18.1';
  const svgI = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const MEAL_IC = {
    b: svgI('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c0 1 1 1.5 1 2.6M12.5 3.5c0 1 1 1.5 1 2.6"/>'),
    l: svgI('<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 20.5h8"/><path d="M14 7.5l4.5-4"/>'),
    d: svgI('<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>'),
    s: svgI('<path d="M12 7.2c-1.5-1-5-1.2-6.4 1.6C4 12 6 18 8.6 19.6c1.2.7 2.2.2 3.4.2s2.2.5 3.4-.2C18 18 20 12 18.4 8.8 17 6 13.5 6.2 12 7.2z"/><path d="M12 7.2c0-2 1-3.5 2.6-4.2"/>'),
  };
  function renderWeekStrip() {
    const el = $('#weekStrip');
    if (!ND()) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const t = today(), ws = weekStart(ui.day), WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const R = 13, CI = 2 * Math.PI * R;
    el.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(ws, i), k = totals(dayItems(d)).kcal, L = limitFor(d);
      const frac = k ? (L ? Math.min(1, k / L) : 1) : 0, over = !!(L && k > L);
      return `<button class="wsd${d === ui.day ? ' sel' : ''}${d === t ? ' now' : ''}${over ? ' over' : ''}" data-act="strip-day" data-day="${d}" ${d > t ? 'disabled' : ''} aria-label="${fmtDay(d)}${k ? ', ' + nf(k) + ' ккал' : ''}"><span class="wd">${WD[i]}</span><span class="wr"><svg viewBox="0 0 32 32" aria-hidden="true"><circle class="trk" cx="16" cy="16" r="${R}"/><circle class="val" cx="16" cy="16" r="${R}" stroke-dasharray="${CI.toFixed(1)}" stroke-dashoffset="${(CI * (1 - frac)).toFixed(1)}" ${frac ? '' : 'opacity="0"'}/></svg><b class="num">${toDate(d).getDate()}</b></span></button>`;
    }).join('');
  }
  function macroTiles(t) {
    const P = S.settings.protein, F = S.settings.fat, Cg = S.settings.carb, K = t.kcal || 0;
    const R = 17, CI = 2 * Math.PI * R;
    const tile = (name, v, goal, kpg, c, act) => {
      const pct = goal ? v / goal * 100 : (K ? v * kpg / K * 100 : 0);
      const frac = Math.min(1, pct / 100);
      // Компактная плитка: название и процент, граммы, полоска прогресса (цель — в подписи для экранного диктора)
      const inner = `<span class="nm">${name}</span><span class="pc num">${Math.round(pct)}%</span><span class="v num" aria-label="${g1(v)} г${goal ? ' из ' + nf(goal) + ' г' : ''}">${g1(v)} г</span><span class="bar" aria-hidden="true"><i style="width:${(frac * 100).toFixed(1)}%"></i></span>${goal ? '' : `<span class="s">${act ? 'задать цель' : 'доля ккал'}</span>`}`;
      return act && !goal ? `<button class="mtile" style="--c:var(--${c})" data-act="${act}">${inner}</button>` : `<div class="mtile" style="--c:var(--${c})">${inner}</div>`;
    };
    return `<div class="mtiles">${tile('Белок', t.p, P, 4, 'protein', 'goto-protein')}${tile('Жиры', t.f, F, 9, 'fat', 'goto-macros')}${tile('Углеводы', t.c, Cg, 4, 'carb', 'goto-macros')}</div>`;
  }
  const entryBtn = e => `<button class="entry" data-act="entry" data-id="${e.id}"><div style="min-width:0"><div class="nm">${esc(e.n)}</div><div class="sub">${esc(e.l || (e.g ? e.g + ' г' : ''))}</div></div><div class="kc">${nf(e.k)}<small>${g1(e.p)} г белка</small></div></button>`;
  function renderMealCards(items, el) {
    el.className = 'mealcards';
    el.innerHTML = MEALS.map(([k, n]) => {
      const arr = items.filter(i => i.m === k), t = totals(arr);
      return `<div class="card mcard${arr.length ? '' : ' mempty'}"><div class="mchead"><span class="wic">${MEAL_IC[k]}</span><div class="mct"><h3>${n}</h3><span class="small muted num">${arr.length ? nf(t.kcal) + ' ккал · белок ' + g1(t.p) + ' г' : 'пока пусто'}</span></div><button class="madd" data-act="meal-add" data-m="${k}" aria-label="Добавить: ${n.toLowerCase()}">${IC.plus}</button></div>${arr.map(entryBtn).join('')}</div>`;
    }).join('');
  }
  function bodyTrio(w, dueTxt) {
    const first = w[0], last = w[w.length - 1], G = S.settings.goalWeight;
    const dw = last.w - first.w;
    let bar = '';
    if (G && first.w > G) {
      const frac = Math.max(0, Math.min(1, (first.w - last.w) / (first.w - G)));
      bar = `<div class="bar" style="margin-top:14px"><i style="width:${(frac * 100).toFixed(0)}%"></i></div><div class="mrow tiny muted" style="margin:6px 0 0"><span>пройдено ${Math.round(frac * 100)}% пути</span><span>${last.w > G ? 'осталось ' + g1(last.w - G) + ' кг' : 'цель достигнута'}</span></div>`;
    }
    return `<h2>Прогресс</h2><div class="wtrio">
      <div><span class="l">Старт</span><b>${g1(first.w)}</b><span class="s">${fmtShort(first.d)}</span></div>
      <div class="now"><span class="l">Сейчас</span><b>${g1(last.w)}</b><span class="s">${w.length > 1 ? (dw > 0 ? '+' : dw < 0 ? '−' : '') + g1(Math.abs(dw)) + ' кг' : fmtShort(last.d)}</span></div>
      <button class="goal" data-act="goal-weight"><span class="l">Цель</span><b>${G ? g1(G) : '—'}</b><span class="s">${G ? 'изменить' : 'задать'}</span></button>
    </div>${bar}<p class="small" style="margin:12px 0 0">${dueTxt}</p>`;
  }

  // ---------- Мишка ----------
  const BEAR_PAL = [
    ['lilac', 'Сиреневый', null, '#E9D3F3', '#F4A9C8'],
    ['pink', 'Розовый', ['#F7C6DA', '#FDEDF4', '#EBA3C2', '#F28DB5'], '#F7C6DA', '#F28DB5'],
    ['honey', 'Медовый', ['#EDCFA4', '#F9EEDC', '#D9AE74', '#F2A39A'], '#EDCFA4', '#F2A39A'],
    ['mint', 'Мятный', ['#C3E8D9', '#ECF9F3', '#96D0BA', '#F4A9C8'], '#C3E8D9', '#F4A9C8'],
    ['sky', 'Голубой', ['#C6DCF6', '#EDF4FD', '#9EBEE8', '#F4A9C8'], '#C6DCF6', '#F4A9C8'],
    ['cream', 'Молочный', ['#F7EFE4', '#FFFFFF', '#E3D3BE', '#F4B3C2'], '#F7EFE4', '#F4B3C2'],
    ['choco', 'Шоколадный', ['#BE9175', '#EBD6C5', '#9A6D52', '#F2A0B0'], '#BE9175', '#F2A0B0'],
  ];
  const BEAR_HATS = [['none', 'Без шапки'], ['panama', 'Панама'], ['muffs', 'Меховые наушники'], ['nightcap', 'Ночной колпак'], ['beanie', 'Шапка с помпоном'], ['beret', 'Беретик'], ['sunhat', 'Шляпка'], ['santa', 'Новогодний колпак'], ['crown', 'Корона']];
  const BEAR_COATS = [['none', 'Без одежды'], ['puffer', 'Пуховичок']];
  const BEAR_EYES = [['none', 'Без очков'], ['round', 'Круглые'], ['heart', 'Сердечки'], ['star', 'Звёздочки'], ['classic', 'Классика'], ['cat', 'Лисички']];
  const BEAR_NECK = [['none', 'Без украшений'], ['gold', 'Золотая цепь'], ['silver', 'Серебряная цепь'], ['rose', 'Цепь с бриллиантом'], ['pearl', 'Жемчуг']];
  const BEAR_ITEMS = [['none', 'Ничего'], ['umbrella', 'Зонтик'], ['skis', 'Лыжи'], ['snowboard', 'Сноуборд'], ['suitcase', 'Чемодан'], ['balloon', 'Шарик'], ['cocoa', 'Кружка какао']];
  // Расцветки вещей: [ключ, название, [цвет1, цвет2, цвет3], узор]
  const WARD_COL = {"coat": [["pink", "Розовый", ["#F7B8D2", "#EFA0C1", "#DD86AD"], ""], ["lilac", "Сиреневый", ["#CDB8F6", "#B9A0EF", "#9E80E2"], ""], ["mint", "Мятный", ["#AEE0CE", "#95D3BE", "#73BCA3"], ""], ["milk", "Молочный", ["#F8F1E8", "#ECE1D3", "#D6C5B0"], ""], ["black", "Чёрный", ["#433A50", "#352D41", "#5E5370"], ""], ["sky", "Голубой", ["#BFD8F7", "#A6C6F0", "#86ABE3"], ""]], "santa": [["red", "Красный", ["#EC8394", "#FFFFFF", ""], ""], ["pink", "Розовый", ["#F6A9C8", "#FFFFFF", ""], ""], ["lilac", "Сиреневый", ["#BFA6F5", "#FFF6FB", ""], ""], ["mint", "Мятный", ["#9ED9C4", "#FFFFFF", ""], ""]], "cocoa": [["pink", "Розовая", ["#F7B0CC", "#E58EB2", ""], ""], ["mint", "Мятная", ["#9ED9C4", "#7CC4AB", ""], ""], ["lilac", "Сиреневая", ["#C3ACF4", "#A48AE8", ""], ""], ["milk", "Молочная", ["#FBF6EF", "#E2D3C0", ""], ""]],"panama": [["white", "Белая", ["#FBF8F3", "#EFE8DD", "#F4A9C8"], ""], ["pink", "Розовая", ["#F8C2D8", "#F0ABC8", "#FFFFFF"], ""], ["denim", "Джинсовая", ["#9DB9E4", "#86A6D8", "#F6CC62"], ""], ["lemon", "Лимонная", ["#FBE59A", "#F3D774", "#9BD7C2"], ""]], "muffs": [["pink", "Розовые", ["#F9C6DC", "#E996BB", ""], ""], ["white", "Белые", ["#FFFFFF", "#C9B7EC", ""], ""], ["lilac", "Сиреневые", ["#D7C6F7", "#9E80E2", ""], ""]], "umbrella": [["red", "Красный в горошек", ["#F26D7D", "#F26D7D", "#B9475A"], "dots"], ["yellow", "Жёлтый", ["#F8CE5E", "#F8CE5E", "#C9952A"], ""], ["lilac", "Сиреневый в полоску", ["#C6AEF8", "#A88AEF", "#7C5BCB"], "stripes"], ["clear", "Прозрачный с сердечками", ["rgba(230,240,255,.78)", "#fff", "#9AA6C2"], "hearts"]], "skis": [["pink", "Розовые", ["#F48DB8", "#FFFFFF", "#5C536D"], ""], ["mint", "Мятные", ["#7FD1B6", "#FFFFFF", "#5C536D"], ""], ["lilac", "Сиреневые", ["#A88AEF", "#F6CC62", "#3E3650"], ""]], "snowboard": [["stars", "Сиреневый со звёздами", ["#A88AEF", "#8E6FE0", "#3E3650"], "stars"], ["hearts", "Розовый с сердечками", ["#F48DB8", "#E2709F", "#3E3650"], "hearts"], ["wave", "Мятный с волнами", ["#7FD1B6", "#5DBB9C", "#3E3650"], "wave"]], "suitcase": [["pink", "Розовый", ["#F7B0CC", "#E58EB2", ""], ""], ["mint", "Мятный", ["#9ED9C4", "#7CC4AB", ""], ""], ["lilac", "Сиреневый", ["#C3ACF4", "#A48AE8", ""], ""], ["lemon", "Лимонный", ["#F8DC82", "#E8C35A", ""], ""]], "balloon": [["pink", "Розовый", ["#F7A1C4", "#E2709F", ""], ""], ["red", "Красный", ["#F2647A", "#C9465B", ""], ""], ["lilac", "Сиреневый", ["#B89BF4", "#9070E2", ""], ""]]};
  const wardPal = (key, ck) => { const L = WARD_COL[key] || []; return L.find(p => p[0] === ck) || L[0] || null; };
  const LOOKS = [
    { k: 'base', n: 'Как обычно', set: { hat: 'none', scarf: 'none', coat: 'none', eyes: 'none', neck: 'none', item: 'none' } },
    { k: 'autumn', n: 'Осенний', s: 'autumn', set: { hat: 'beret', scarf: 'plaid', coat: 'none', eyes: 'none', neck: 'none', item: 'umbrella' }, col: { umbrella: 'red' } },
    { k: 'winter', n: 'Зимний', s: 'winter', set: { hat: 'muffs', scarf: 'long', coat: 'puffer', eyes: 'none', neck: 'none', item: 'skis' }, col: { muffs: 'white', coat: 'pink', skis: 'pink' } },
    { k: 'board', n: 'Сноубордист', s: 'winter', set: { hat: 'beanie', scarf: 'knit', coat: 'puffer', eyes: 'classic', neck: 'none', item: 'snowboard' }, col: { coat: 'lilac', snowboard: 'stars' } },
    { k: 'cozy', n: 'Уютный', s: 'winter', set: { hat: 'none', scarf: 'snood', coat: 'none', eyes: 'round', neck: 'none', item: 'cocoa' }, col: { cocoa: 'pink' } },
    { k: 'newyear', n: 'Новогодний', s: 'winter', set: { hat: 'santa', scarf: 'none', coat: 'puffer', eyes: 'star', neck: 'none', item: 'cocoa' }, col: { santa: 'red', coat: 'milk', cocoa: 'mint' } },
    { k: 'spring', n: 'Весенний', s: 'spring', set: { hat: 'none', scarf: 'bandana', coat: 'none', eyes: 'cat', neck: 'pearl', item: 'balloon' }, col: { balloon: 'pink' } },
    { k: 'summer', n: 'Летний', s: 'summer', set: { hat: 'panama', scarf: 'none', coat: 'none', eyes: 'heart', neck: 'none', item: 'balloon' }, col: { panama: 'lemon', balloon: 'red' } },
    { k: 'travel', n: 'В путешествие', set: { hat: 'panama', scarf: 'none', coat: 'none', eyes: 'star', neck: 'none', item: 'suitcase' }, col: { panama: 'white', suitcase: 'pink' } },
    { k: 'rap', n: 'Звезда рэпа', set: { hat: 'beanie', scarf: 'none', coat: 'puffer', eyes: 'classic', neck: 'gold', item: 'none' }, col: { coat: 'black' } },
  ];
  const BEAR_SCARVES = [['none', 'Без шарфа'], ['mint', 'Мятный в полоску'], ['polka', 'Розовый в горошек'], ['plaid', 'Сиреневый клетчатый'], ['knit', 'Голубой вязаный'], ['long', 'Длинный полосатый'], ['snood', 'Тёплый снуд'], ['bandana', 'Бандана']];
  const BEAR_ACC = [['bow', 'Бантик'], ['heart', 'Сердечко'], ['flower', 'Цветочек']];
  const BEAR_DEF = { c: 'lilac', hat: 'none', scarf: 'none', coat: 'none', eyes: 'none', neck: 'none', item: 'none', a: { bow: 1, heart: 1 }, talk: true, stars: true, season: true };
  function bearCfg() {
    const b = S.settings.bear && typeof S.settings.bear === 'object' ? S.settings.bear : {};
    const ok = (list, v) => list.some(x => x[0] === v) ? v : 'none';
    const col = Object.assign({}, b.col && typeof b.col === 'object' ? b.col : {});
    // старые «Очки» из «Ещё» превращаются в круглые очки
    const eyes = b.eyes ? ok(BEAR_EYES, b.eyes) : (b.a && b.a.glasses ? 'round' : 'none');
    return { c: b.c || BEAR_DEF.c, hat: ok(BEAR_HATS, b.hat), scarf: ok(BEAR_SCARVES, b.scarf), coat: ok(BEAR_COATS, b.coat), eyes, neck: ok(BEAR_NECK, b.neck), item: ok(BEAR_ITEMS, b.item), col,
      a: Object.assign({}, BEAR_DEF.a, b.a || {}), talk: b.talk !== false, stars: b.stars !== false, season: b.season !== false };
  }
  function bearSet(patch) { S.settings.bear = Object.assign(bearCfg(), patch); save(); bearApply(); }
  function bearApply() {
    const B = bearCfg(), r = document.documentElement.style;
    const pal = (BEAR_PAL.find(p => p[0] === B.c) || BEAR_PAL[0])[2];
    ['--plush', '--plush-2', '--plush-3', '--blush'].forEach((k, i) => { if (pal) r.setProperty(k, pal[i]); else r.removeProperty(k); });
    Object.entries(bearVars(B)).forEach(([k, v]) => r.setProperty(k, v));
  }
  // Все переменные наряда: какие вещи видны и каких они цветов
  function bearVars(B) {
    const v = {};
    BEAR_ACC.forEach(([k]) => { v['--b-' + k] = B.a[k] ? '1' : '0'; });
    BEAR_HATS.forEach(([k]) => { if (k !== 'none') v['--b-hat-' + k] = B.hat === k ? '1' : '0'; });
    BEAR_SCARVES.forEach(([k]) => { if (k !== 'none') v['--b-scarf-' + k] = B.scarf === k ? '1' : '0'; });
    v['--b-hatany'] = B.hat !== 'none' ? '1' : '0';
    v['--b-coat'] = B.coat !== 'none' ? '1' : '0';
    v['--b-glasses'] = B.eyes === 'round' ? '1' : '0';
    BEAR_EYES.forEach(([k]) => { if (k !== 'none' && k !== 'round') v['--b-eyes-' + k] = B.eyes === k ? '1' : '0'; });
    BEAR_NECK.forEach(([k]) => { if (k !== 'none') v['--b-neck-' + k] = B.neck === k ? '1' : '0'; });
    BEAR_ITEMS.forEach(([k]) => { if (k !== 'none') v['--b-item-' + k] = B.item === k ? '1' : '0'; });
    const put = (pref, key) => { const pal = wardPal(key, B.col[key]); if (pal) pal[2].forEach((c, i) => { if (c) v[`--${pref}${i + 1}`] = c; }); return pal; };
    if (WARD_COL[B.hat]) put('bh', B.hat);
    if (B.coat !== 'none') put('bc', 'coat');
    ['dots', 'stripes', 'hearts', 'stars', 'wave'].forEach(k => { v['--bi-pat-' + k] = '0'; });
    if (B.item !== 'none') { const pal = put('bi', B.item); if (pal && pal[3]) v['--bi-pat-' + pal[3]] = '1'; }
    return v;
  }
  const varsStyle = B => Object.entries(bearVars(B)).map(([k, v]) => `${k}:${v}`).join(';');
  // Мишка спит с часу ночи до шести; «перед сном» — с 21:00 до часу
  const isNight = () => { const hr = new Date().getHours(); return hr >= 1 && hr < 6; };
  const partOf = hr => hr >= 6 && hr < 11 ? 'morning' : hr >= 11 && hr < 17 ? 'day' : hr >= 17 && hr < 21 ? 'evening' : hr >= 21 || hr < 1 ? 'bed' : null;

  const BEAR_SAY = {
    morning: [
      'Доброе утро! Сегодня всё получится', 'С добрым утром! Я в тебя верю', 'Новый день — новые маленькие победы',
      'Доброе утро, солнышко! Начнём день нежно', 'Проснулась? А я уже соскучился', 'Утро — лучшее время, чтобы себя похвалить',
      'Доброе утро! Начнём со стаканчика воды?', 'Сегодня будет хороший день, я чувствую', 'Улыбнись — день начинается с тебя',
      'Доброе утро! Ты уже молодец, что здесь', 'Потянись, улыбнись — и вперёд', 'Утро доброе, а с тобой — ещё добрее',
    ],
    day: [
      'Ты молодец, что не бросаешь', 'Маленькие шаги — тоже шаги', 'Горжусь тобой, правда', 'Ты справляешься лучше, чем думаешь',
      'Не забывай отдыхать — это тоже важно', 'Ты сильнее, чем кажется', 'Каждая запись — маленькая победа',
      'Сделай глубокий вдох — ты всё успеваешь', 'Я рядом и болею за тебя', 'Не нужно идеально — нужно просто продолжать',
      'Держи обнимашку на середину дня', 'Полдня позади — так держать', 'Ты у меня такая упорная', 'Помни: ты делаешь это для себя',
    ],
    evening: [
      'Какой хороший день получился', 'Ты сегодня большая молодец', 'Пора немного отдохнуть — ты заслужила',
      'Вечер — время для чего-то приятного', 'Ты сегодня старалась, я видел', 'Укутайся в плед и выдохни',
      'Чем бы ни закончился день — ты умница', 'Вечерние обнимашки уже в пути', 'Сегодня ты снова сделала шаг к цели',
    ],
    bed: [
      'Спокойной ночи! Ты сегодня молодец', 'Сладких снов — завтра будет хороший день', 'Пора в кроватку, а я посторожу твои записи',
      'Ложись отдыхать — ты сегодня всё сделала', 'Спокойной ночи, обнимаю', 'Хороший сон — тоже забота о себе. Спать пора',
      'Завтра продолжим вместе. Сладких снов', 'Откладывай телефон — и баиньки', 'Ты сегодня была прекрасна. Доброй ночи',
      'Пусть приснится что-нибудь волшебное',
    ],
    any: [
      'У тебя всё получится', 'Обнимаю крепко-крепко', 'Ты сегодня прекрасна', 'Мишка в тебя верит', 'Не забывай себя хвалить',
      'Ты — моя любимая хозяйка', 'Ты заслуживаешь заботы, особенно своей', 'Я так рад тебя видеть', 'Ты — самая лучшая',
      'Будь к себе добрее, ладно?', 'Без тебя мне было скучно', 'Ты сияешь, как стразик',
    ],
  };
  const BEAR_SEASON = {
    autumn: ['Осень — время пледа, какао и заботы о себе', 'Дождик за окном, а у нас уютно', 'Листья падают, а ты — сияешь', 'Осенью особенно важно себя баловать'],
    winter: ['Укутывайся теплее, снежинка', 'Зима — чтобы пить тёплый чай и мечтать', 'Снег идёт, а мишка тебя греет', 'Ты моя самая тёплая зимняя радость',
      'Ух, ну и холодок на улице! Утепляйся', 'Я так рад зиме — обожаю снежок', 'Шарфик надела? Я проверю', 'У меня лапки замёрзли — согреешь?',
      'Медведи зимой спят, а я не могу — скучаю по тебе', 'Если увидишь снеговика — передай привет от меня', 'Снежинки сегодня почти такие же красивые, как ты',
      'Какао с зефирками — тоже забота о себе', 'Варежки, шапка, улыбка — всё на месте?', 'Скользко! Иди аккуратно, как пингвинчик',
      'Зимой воду пить тоже надо — тёплую можно', 'Я слепил бы тебе снеговика, но он бы растаял от твоей улыбки',
      'Носик не замёрз? Мой вот розовый', 'Под пледом и с тобой — никакой мороз не страшен', 'Зима — время для уютных вечеров и тёплых носочков',
      'Снег хрустит, как свежий огурчик', 'Я сегодня в шубке, а ты?'],
    spring: ['Весна! Всё расцветает — и ты тоже', 'Пахнет весной и новыми победами', 'Весеннее солнышко тебе к лицу', 'Весной всё получается легче'],
    summer: ['Лето! Не забывай пить воду — жарко', 'Солнышко светит, а ты — ярче', 'Летом прогулки — лучшая тренировка', 'Пусть лето будет лёгким и вкусным'],
  };
  // Зимой к утренним и вечерним фразам добавляются свои; с середины декабря до Рождества — новогодние
  const BEAR_WINTER_PART = {
    morning: ['Доброе утро! За окном холодно — оденься потеплее', 'С добрым зимним утром! Начнём с тёплого чая?', 'Утро, снежинка! Не забудь шапку',
      'Вылезать из-под одеяла зимой — уже подвиг. Ты молодец', 'Доброе утро! Пусть сегодня будет тёпленько'],
    bed: ['Спокойной ночи! Укройся потеплее', 'Пусть снятся снежинки и какао', 'За окном метель, а у тебя — тёплое одеяло. Сладких снов',
      'Носочки тёплые надела? Тогда баиньки', 'Доброй ночи! Я посторожу, чтобы мороз не пробрался'],
  };
  const BEAR_NY = ['Скоро Новый год! Что попросишь у Деда Мороза?', 'Я уже нарядил ёлочку — стразиками, конечно', 'Мандаринки — самый новогодний перекус',
    'Новогоднее настроение уже включилось?', 'В этом году ты была очень хорошей — я Деду Морозу так и напишу', 'Пахнет ёлкой и мандаринами'];
  function nyTime() { const d = new Date(), m = d.getMonth(), dd = d.getDate(); return (m === 11 && dd >= 15) || (m === 0 && dd <= 8); }
  function seasonLines(part) {
    const sn = seasonNow();
    let L = part === 'morning' || part === 'bed' ? (sn === 'winter' ? BEAR_WINTER_PART[part] : []) : BEAR_SEASON[sn];
    if (nyTime() && part !== 'bed') L = L.concat(BEAR_NY);
    return L;
  }
  function bearLines(part) {
    const hr = new Date().getHours(), t = today(), items = dayItems(t), tot = totals(items), L = limitFor(t);
    const out = [];
    const plan = waterPlan();
    if (plan && hr >= 13 && part !== 'bed') { const c = waterCount(t, plan); if (c < plan.n / 2) out.push(`Стаканчик воды? Пока ${c} из ${plan.n}`); }
    const P = S.settings.protein;
    if (P && hr >= 16 && part !== 'bed' && items.length && tot.p < P * 0.7) out.push(`Белка пока ${g1(tot.p)} из ${nf(P)} г — творог или яйца выручат`);
    if (actDay(t).w.length) out.push(part === 'bed' ? 'Сегодня была тренировка — мышцы скажут спасибо за сон' : 'Тренировка есть — я тобой горжусь!');
    if (L && hr >= 18 && items.length && tot.kcal <= L) out.push(part === 'bed' ? 'День в лимите — спи сладко, умница' : 'Сегодня в лимите — умница!');
    if (L && tot.kcal > L) out.push('Чуть выше лимита — ничего страшного. Завтра просто продолжаем');
    if (!items.length && hr >= 12 && part !== 'bed') out.push('Не забудь записать, что ела, — я подожду');
    return out;
  }
  // reason: 'morning' | 'day' | 'evening' | 'bed' — фраза к этому времени; без reason — по нажатию или «между делом»
  function bearPick(reason) {
    if (isNight()) return 'Ззз… я сплю, но я рядом. И тебе пора отдыхать';
    if (bdayToday()) {
      const B = ['С днём рождения! Сегодня можно всё 🎂', 'Сегодня твой день, королева 👑', '26 — красивое число, прямо как ты', 'Я бы испёк тебе торт, но у меня лапки 🧁', 'Загадала желание? Оно сбудется ✨', 'Сегодня никаких лимитов в голове — только праздник', 'Ты самая лучшая, и сегодня особенно 💜'];
      return B[Math.floor(Math.random() * B.length)];
    }
    const part = reason || partOf(new Date().getHours()) || 'day';
    const ctx = part === 'morning' ? [] : bearLines(part);
    const base = part === 'morning' || part === 'bed' ? BEAR_SAY[part].concat(seasonLines(part)) : BEAR_SAY[part].concat(BEAR_SAY.any, seasonLines(part));
    const useCtx = ctx.length && Math.random() < (part === 'bed' ? 0.3 : 0.5);
    const pool = useCtx ? ctx : base;
    const st = bearState(), recent = Array.isArray(st.recent) ? st.recent : [];
    const fresh = pool.filter(x => !recent.includes(x));
    const from = fresh.length ? fresh : pool;
    const txt = from[Math.floor(Math.random() * from.length)];
    st.recent = recent.concat(txt).slice(-12); bearStateSave(st);
    const g = G(), name = g && String(g.prefs().name || '').trim();
    return name && Math.random() < 0.3 && !/[?]$/.test(txt) ? `${name}, ${txt.charAt(0).toLowerCase()}${txt.slice(1)}` : txt;
  }
  const BEAR_STORE = 'porcia.bearsay'; // когда мишка говорил — не в резервной копии
  function bearState() { try { return JSON.parse(localStorage.getItem(BEAR_STORE)) || {}; } catch (e) { return {}; } }
  function bearStateSave(s) { try { localStorage.setItem(BEAR_STORE, JSON.stringify(s)); } catch (e) { /* без памяти */ } }
  let bubbleTimer = null;
  function bearHop(el) { if (!el || calm() || el.classList.contains('nod')) return; el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
  function bearSay(txt) {
    const b = $('#bearBubble'); if (!b || ui.view !== 'today') return;
    clearTimeout(bubbleTimer);
    b.classList.remove('out'); b.textContent = txt || bearPick(); b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    bearHop($('.peek'));
    bubbleTimer = setTimeout(bearHush, 6500);
  }
  function bearHush() {
    const b = $('#bearBubble'); if (!b || b.hidden) return;
    clearTimeout(bubbleTimer);
    if (calm()) { b.hidden = true; return; }
    b.classList.add('out'); bubbleTimer = setTimeout(() => { b.hidden = true; b.classList.remove('out'); }, 260);
  }
  // Сам по себе: утром при первом заходе, днём, вечером и перед сном — по разу,
  // и иногда «между делом» — на третий заход после прошлой фразы. Между фразами не меньше полутора часов, всего до 5 в день.
  const BEAR_GAP = 90 * 60e3, BEAR_MAX = 5, BEAR_EVERY = 3;
  function bearMaybe(isOpen) {
    const B = bearCfg();
    if (!B.talk || isNight()) return;
    const st = bearState(), t = today(), now = Date.now();
    if (st.d !== t) { st.d = t; st.n = 0; st.slots = {}; st.since = 0; }
    if (!st.slots) st.slots = {};
    if (isOpen) st.since = (st.since || 0) + 1;
    const ready = ui.view === 'today' && ui.day === t && $('#backdrop').hidden && st.n < BEAR_MAX && (!st.n || now - (st.last || 0) >= BEAR_GAP);
    const part = partOf(new Date().getHours());
    let reason = null;
    if (ready && part && !st.slots[part]) reason = part;
    else if (ready && isOpen && st.since >= BEAR_EVERY) reason = 'cheer';
    if (reason) {
      if (reason !== 'cheer') st.slots[reason] = 1;
      st.n++; st.last = now; st.since = 0;
    }
    bearStateSave(st);
    if (reason) bearSay(bearPick(reason === 'cheer' ? null : reason));
  }
  function bearWhenFree(fn, extra) {
    // ждём, пока закончится приветствие
    const tick = () => { if (document.querySelector('.pg') || document.documentElement.classList.contains('pg-hold')) setTimeout(tick, 400); else setTimeout(fn, extra || 0); };
    tick();
  }
  function renderPeek() {
    const p = $('.peek'); if (!p) return;
    const sleep = isNight() && ui.day === today();
    p.classList.toggle('sleep', sleep);
    p.style.setProperty('--b-sleep', sleep ? '1' : '0');
  }
  function bearCard() {
    const B = bearCfg(), night = ui.bearNight;
    return `<h2>Мишка</h2>
      <div class="bearset"><button class="bearprev" data-act="bear-prev" aria-label="Мишка — нажми" style="--b-sleep:${night ? 1 : 0}"><svg class="bear" viewBox="0 0 120 120" aria-hidden="true"><use href="#bear"/></svg></button>
        <div class="field"><span>Посмотреть</span><div class="chips"><button class="seg" data-act="bear-night" data-n="0" aria-pressed="${!night}">Днём</button><button class="seg" data-act="bear-night" data-n="1" aria-pressed="${!!night}">Ночью</button></div></div></div>
      <div class="field"><span>Цвет</span><div class="swatches" role="group" aria-label="Цвет мишки">${BEAR_PAL.map(([k, n, , sw, swb]) => `<button class="swatch" data-act="bear-color" data-c="${k}" style="--sw:${sw};--swb:${swb}" aria-pressed="${B.c === k}" aria-label="${n}" title="${n}"><i></i></button>`).join('')}</div></div>
      ${wardrobeHTML(B)}
      <div class="field" style="margin-top:14px"><span>Послушать, что он говорит</span><div class="chips">${[['morning', 'Утром'], ['day', 'Днём'], ['evening', 'Вечером'], ['bed', 'Перед сном']].map(([k, n]) => `<button class="seg" data-act="bear-sample" data-p="${k}">${n}</button>`).join('')}</div>${ui.bearSample ? `<div class="saybox">${esc(ui.bearSample)}</div>` : ''}</div>
      ${DZ() ? `<div style="margin-top:8px">${swRow('talk', 'Облачко со словами', B.talk, 'Мишка говорит на экране «Сегодня»')}</div>` : `<div class="field" style="margin-top:14px"><span>Облачко со словами на «Сегодня»</span><div class="chips"><button class="seg" data-act="bear-talk" data-on="1" aria-pressed="${B.talk}">Показывать</button><button class="seg" data-act="bear-talk" data-on="0" aria-pressed="${!B.talk}">Выключить</button></div></div>`}
      <p class="hint">Сам мишка говорит утром при первом заходе, один раз днём, вечером и перед сном, а иногда и просто между делом. Между фразами — не меньше полутора часов, всего не больше пяти в день. Если нажать на него на «Сегодня», скажет в любой момент. С часу ночи до шести утра он спит.</p>`;
  }

  // ---------- Гардероб ----------
  const WARD_TABS = [['looks', 'Образы'], ['hat', 'Шапка'], ['coat', 'Одежда'], ['scarf', 'Шарф'], ['eyes', 'Очки'], ['neck', 'Украшения'], ['item', 'В лапках'], ['more', 'Ещё']];
  const chipsOf = (list, cur, act) => `<div class="chips">${list.map(([k, n]) => `<button class="seg" data-act="${act}" data-k="${k}" aria-pressed="${cur === k}">${n}</button>`).join('')}</div>`;
  function swatchesOf(key, B) {
    const L = WARD_COL[key]; if (!L) return '';
    const cur = wardPal(key, B.col[key]);
    return `<div><div class="lbl">Расцветка · <b>${cur[1]}</b></div><div class="swatches" role="group" aria-label="Расцветка">${L.map(([k, n, c]) => `<button class="swatch" data-act="bear-col" data-k="${key}" data-v="${k}" style="--sw:${c[0]};--swb:${c[1] && c[1] !== c[0] ? c[1] : 'transparent'}" aria-pressed="${cur[0] === k}" aria-label="${n}" title="${n}"><i></i></button>`).join('')}</div></div>`;
  }
  function wardrobeHTML(B) {
    const t = ui.wardTab || 'looks', sn = seasonNow();
    let body = '';
    if (t === 'looks') {
      body = `<div class="looks">${LOOKS.map(L => {
        const cfg = Object.assign({}, B, L.set, { col: Object.assign({}, B.col, L.col || {}) });
        return `<button class="look" data-act="bear-look" data-k="${L.k}">${L.s === sn ? '<span class="nowtag">сейчас</span>' : ''}<svg viewBox="0 0 120 120" style="${varsStyle(cfg)}" aria-hidden="true"><use href="#bear"/></svg>${L.n}</button>`;
      }).join('')}</div><p class="hint" style="margin:0">Образ надевает сразу шапку, шарф, одежду, очки и вещь в лапках. Потом любую вещь можно поменять в разделах.</p>`;
    } else if (t === 'hat') body = chipsOf(BEAR_HATS, B.hat, 'bear-hat') + swatchesOf(B.hat, B);
    else if (t === 'coat') body = chipsOf(BEAR_COATS, B.coat, 'bear-coat') + (B.coat !== 'none' ? swatchesOf('coat', B) : '');
    else if (t === 'scarf') body = chipsOf(BEAR_SCARVES, B.scarf, 'bear-scarf');
    else if (t === 'eyes') body = chipsOf(BEAR_EYES, B.eyes, 'bear-eyes');
    else if (t === 'neck') body = chipsOf(BEAR_NECK, B.neck, 'bear-neck');
    else if (t === 'item') body = chipsOf(BEAR_ITEMS, B.item, 'bear-item') + (B.item !== 'none' ? swatchesOf(B.item, B) : '');
    else {
      const notes = [B.hat !== 'none' ? 'в шапке бантик и цветочек прячутся' : '', B.scarf === 'bandana' ? 'под банданой сердечко прячется' : '', B.coat !== 'none' ? 'на пуховичке сердечко становится маленькой нашивкой' : '', B.item === 'cocoa' ? 'с кружкой какао сердечко переезжает на кружку' : ''].filter(Boolean);
      body = `<div class="chips" role="group" aria-label="Аксессуары">${BEAR_ACC.map(([k, n]) => `<button class="seg" data-act="bear-acc" data-a="${k}" aria-pressed="${!!B.a[k]}">${n}</button>`).join('')}</div>${notes.length ? `<p class="hint" style="margin:0">${notes.join('; ')}.</p>` : ''}`;
    }
    return `<div class="field" style="margin-top:14px"><span>Гардероб</span><div class="wtabs" role="tablist" aria-label="Гардероб">${WARD_TABS.map(([k, n]) => `<button class="seg" role="tab" data-act="ward-tab" data-t="${k}" aria-pressed="${t === k}" aria-selected="${t === k}">${n}</button>`).join('')}</div></div>
      <div class="wpanel">${body}</div>`;
  }
  // перерисовать карточку мишки, не сбрасывая прокрутку вкладок гардероба
  function bearRerender() {
    const el = $('#setBear'); if (!el) return;
    const tabs = el.querySelector('.wtabs'), sl = tabs ? tabs.scrollLeft : 0;
    el.innerHTML = bearCard();
    const t2 = el.querySelector('.wtabs'); if (t2) t2.scrollLeft = sl;
  }

  // ---------- 1.10: детали ----------
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-5.6-3.7-9-7-9-10.6C3 7.6 5.1 5.5 7.8 5.5c1.8 0 3.2.9 4.2 2.4 1-1.5 2.4-2.4 4.2-2.4 2.7 0 4.8 2.1 4.8 4.9 0 3.6-3.4 6.9-9 10.6z" fill="currentColor"/></svg>';
  function bearHeart() {
    const p = $('.peek'); if (!p || calm() || ui.view !== 'today') return;
    const s = document.createElement('span'); s.className = 'bh'; s.style.color = 'var(--blush)'; s.innerHTML = HEART;
    p.appendChild(s); setTimeout(() => s.remove(), 1600);
  }
  function bearNod() {
    const p = $('.peek'); if (!p || calm() || !DZ() || p.classList.contains('sleep')) return;
    p.classList.remove('nod'); void p.offsetWidth; p.classList.add('nod');
    setTimeout(() => p.classList.remove('nod'), 950);
  }
  function bearAte() { if (!DZ()) return; setTimeout(() => { bearNod(); setTimeout(bearHeart, 250); }, 380); }
  // взгляд вниз, пока пишешь в поле «Что съела?»
  function bearLook(on) {
    const p = $('.peek'); if (!p) return;
    on = on && DZ() && !p.classList.contains('sleep');
    p.classList.toggle('lean', on);
    p.style.setProperty('--b-look-x', on ? '-1.8px' : '0px');
    p.style.setProperty('--b-look-y', on ? '2.4px' : '0px');
  }
  // моргает раз в несколько секунд
  (function blinkLoop() {
    setTimeout(() => {
      const p = $('.peek');
      if (p && DZ() && !calm() && !p.classList.contains('sleep') && document.visibilityState === 'visible') {
        p.style.setProperty('--b-blink', '1'); setTimeout(() => p.style.setProperty('--b-blink', '0'), 130);
        if (Math.random() < 0.3) setTimeout(() => { p.style.setProperty('--b-blink', '1'); setTimeout(() => p.style.setProperty('--b-blink', '0'), 120); }, 300);
      }
      blinkLoop();
    }, 3200 + Math.random() * 3800);
  })();
  // сердечко вечером, если день в лимите — раз в день
  function eveningHeart() {
    if (!DZ() || ui.view !== 'today' || ui.day !== today()) return;
    const hr = new Date().getHours(), t = totals(dayItems(today())), L = limitFor(today());
    if (hr < 18 || !L || !t.kcal || t.kcal > L) return;
    const st = bearState(); if (st.eh === today()) return;
    st.eh = today(); bearStateSave(st); setTimeout(bearHeart, 1200);
  }
  function proteinHearts() {
    const tile = $('#summary .mtile'); if (!tile || calm()) return;
    const r = tile.getBoundingClientRect(), cx = r.width / 2, cy = 28;
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('span'); s.className = 'hb'; s.innerHTML = HEART;
      const ang = Math.PI * (1.1 + Math.random() * 0.8), d = 36 + Math.random() * 34, sz = 10 + Math.random() * 8;
      s.style.cssText = `left:${(cx - sz / 2).toFixed(0)}px;top:${(cy - sz / 2).toFixed(0)}px;--s:${sz.toFixed(0)}px;--dx:${(Math.cos(ang) * d).toFixed(0)}px;--dy:${(Math.sin(ang) * d).toFixed(0)}px;--r:${(Math.random() * 50 - 25).toFixed(0)}deg;animation-delay:${i * 35}ms`;
      tile.appendChild(s); setTimeout(() => s.remove(), 1400);
    }
    bearHeart();
  }
  // небо по времени суток
  function skyPhase() { const hr = new Date().getHours(); return hr >= 5 && hr < 10 ? 'morning' : hr >= 10 && hr < 17 ? 'day' : hr >= 17 && hr < 21 ? 'sunset' : 'night'; }
  let skyLock = null;
  function skyApply(phase) {
    const r = document.documentElement, ph = phase || skyLock || skyPhase();
    r.dataset.sky = ph;
    const el = $('#skyTint'); if (!el) return;
    if (!el.childElementCount) {
      el.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="left:${(5 + Math.random() * 90).toFixed(1)}%;top:${(8 + Math.random() * 46).toFixed(1)}%;animation-delay:${(-Math.random() * 4).toFixed(1)}s;animation-duration:${(3 + Math.random() * 3).toFixed(1)}s"></i>`).join('');
    }
    el.hidden = ui.view !== 'today';
    statusTint();
  }
  setInterval(() => { if (!skyLock) skyApply(); }, 5 * 60e3);
  // Верх экрана с часами iPhone красит сам, в цвет theme-color. Подкрашиваем его в цвет неба,
  // а градиент неба начинается ровно с этого цвета — шва нет.
  const SKY_TOP = { light: { morning: '#FFDCCB', day: '#CBE2FA', sunset: '#F8C4D6', night: '#CFC8F2' }, dark: { morning: '#4A2F3D', day: '#2A5182', sunset: '#4E2742', night: '#1C2350' } };
  const BG_TOP = { light: '#F5F3F8', dark: '#100E14' };
  function statusTint() {
    const r = document.documentElement, th = r.getAttribute('data-theme');
    const sky = DZ() && !r.classList.contains('dz-nosky') && ui.view === 'today' && r.dataset.sky;
    // Пока на экране заставка-приветствие, полосу с часами красит она (greet.js)
    if (r.style.getPropertyValue('--pg-bar')) return;
    // Открыта шторка — страница затемнена, и полоса с часами затемняется так же, иначе сверху светлый шов
    const bd = $('#backdrop'), dim = !!(bd && !bd.hidden && !bd.classList.contains('closing'));
    const barOf = dark => { const c = sky ? SKY_TOP[dark ? 'dark' : 'light'][sky] : BG_TOP[dark ? 'dark' : 'light']; return dim ? dimHex(c) : c; };
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      const dark = th === 'dark' || (!th && (m.getAttribute('media') || '').includes('dark'));
      const c = barOf(dark);
      if (m.getAttribute('content') !== c) m.setAttribute('content', c);
    });
    // iOS 26: цвет берётся у краёв страницы — невидимая полоска сверху и фон страницы начинаются цветом неба
    const darkNow = th === 'dark' || (!th && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    const top = sky ? SKY_TOP[darkNow ? 'dark' : 'light'][sky] : '';
    if (sky || dim) r.style.setProperty('--top-tint', barOf(darkNow)); else r.style.removeProperty('--top-tint');
    if (top) {
      r.style.backgroundColor = top;
      r.style.backgroundImage = `linear-gradient(${top}, var(--bg) 320px)`;
    } else {
      r.style.backgroundColor = '';
      r.style.backgroundImage = '';
    }
  }
  // цвет под затемнением шторки: rgba(10, 6, 18, .42) поверх цвета
  function dimHex(hex) {
    const n = parseInt(hex.slice(1), 16), a = 0.42, o = [10, 6, 18];
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * (1 - a) + o[i] * a).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', statusTint) : mq.addListener && mq.addListener(statusTint)); }
  window.addEventListener('porcia:greet-done', statusTint);
  // iPhone держит приложение в памяти и замораживает таймеры: открыла днём после ночи — небо сразу переключается
  const skyWake = () => { if (document.visibilityState === 'visible' && !skyLock) skyApply(); };
  document.addEventListener('visibilitychange', skyWake);
  window.addEventListener('pageshow', skyWake);
  window.addEventListener('focus', skyWake);
  // иконка вкладки оживает при переходе
  function tabPop(tab) {
    if (!DZ() || calm() || !tab) return;
    tab.classList.remove('pop'); void tab.offsetWidth; tab.classList.add('pop');
    setTimeout(() => tab.classList.remove('pop'), 900);
  }
  // шторку можно смахнуть вниз
  (function sheetDrag() {
    const sh = $('#sheet'); let y0 = null, dy = 0, t0 = 0, active = false;
    const start = (y, target, touch) => {
      if (!DZ() || calm() || $('#backdrop').hidden) return;
      if (target.closest('input, textarea, select')) return;
      if (!touch && !target.closest('.grab')) return;
      if (sh.scrollTop > 0) return;
      y0 = y; dy = 0; t0 = Date.now(); active = false;
    };
    const move = (y, ev) => {
      if (y0 == null) return;
      dy = Math.max(0, y - y0);
      if (!active && dy > 8) { active = true; sh.classList.add('drag'); sh.classList.remove('snap'); }
      if (active) { if (ev.cancelable) ev.preventDefault(); sh.style.transform = `translateY(${dy}px)`; $('#backdrop').style.backgroundColor = `rgba(10, 6, 18, ${(0.42 * Math.max(0.2, 1 - dy / 400)).toFixed(3)})`; }
    };
    const end = () => {
      if (y0 == null) return; y0 = null;
      if (!active) return;
      sh.classList.remove('drag');
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      if (dy > 110 || (fast && dy > 40)) {
        sh.classList.add('snap'); sh.style.transform = 'translateY(110%)';
        setTimeout(() => { sh.classList.remove('snap'); sh.style.transform = ''; $('#backdrop').style.backgroundColor = ''; const bd = $('#backdrop'); bd.hidden = true; bd.classList.remove('closing'); sh.innerHTML = ''; document.body.style.overflow = ''; statusTint(); const f = sheetClose; sheetClose = null; if (f) f(); }, 260);
      } else {
        sh.classList.add('snap'); sh.style.transform = ''; $('#backdrop').style.backgroundColor = '';
        setTimeout(() => sh.classList.remove('snap'), 300);
      }
      sh._dragged = Date.now();
    };
    sh.addEventListener('touchstart', ev => start(ev.touches[0].clientY, ev.target, true), { passive: true });
    sh.addEventListener('touchmove', ev => move(ev.touches[0].clientY, ev), { passive: false });
    sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
    sh.addEventListener('mousedown', ev => start(ev.clientY, ev.target, false));
    window.addEventListener('mousemove', ev => move(ev.clientY, ev));
    window.addEventListener('mouseup', end);
  })();
  // переключатели: родной switch в Safari, нарисованный — в остальных браузерах
  if (!('switch' in HTMLInputElement.prototype)) document.documentElement.classList.add('sw-fb');
  const swRow = (key, label, on, note) => `<label class="swrow"><span>${label}${note ? `<small>${note}</small>` : ''}</span><input type="checkbox" switch data-sw="${key}" ${on ? 'checked' : ''} aria-label="${label}"></label>`;
  function swChange(key, on) {
    if (key === 'stars') bearSet({ stars: on });
    else if (key === 'season') { bearSet({ season: on }); if (!on) { const w = document.querySelector('body > .wx'); if (w) w.remove(); } }
    else if (key === 'talk') { bearSet({ talk: on }); if (!on) bearHush(); }
    else if (key === 'greet') { const g = G(); if (g) { const p = g.prefs(); p.on = on; g.setPrefs(p); } }
    else if (key === 'sky') { S.settings.sky = on; save(); document.documentElement.classList.toggle('dz-nosky', !on); statusTint(); }
  }
  // «Что нового» — один раз после обновления
  const WN_KEY = 'porcia.whatsnew';
  // Пункты по версиям: показываем всё, что вышло после той версии, которую она видела последней
  // (если обновление пропустила — увидит пункты сразу за несколько версий). Новые версии — сверху.
  const WHATS_NEW_BY = [
    ['1.18.1', [
      ['⛄', 'Зимние заставки', 'при входе теперь встречают снеговик и мишка с какао, а с 15 декабря — ёлочка в стразиках'],
    ]],
    ['1.18.0', [
      ['✍️', 'Записать еду — сразу', 'на «Сегодня» стало компактнее: поле «Что съела?» видно без прокрутки, а привычки и шаги переехали ниже'],
      ['❄️', 'Мишка встречает зиму', 'много новых зимних фраз, а ближе к Новому году — праздничные'],
      ['🧣', 'Зимний гардероб', 'новогодний колпак, кружка какао в лапках, голубой пуховичок и образы «Уютный» и «Новогодний»'],
      ['⚙️', 'Аккуратные настройки', 'разделы теперь сворачиваются — открывай только нужный'],
    ]],
    ['1.17.0', [
      ['✅', 'Новая вкладка «Привычки»', 'добавляй свои: витамины, растяжку, книгу — и отмечай каждый день. Каждая отметка — стразик в шкатулку'],
      ['🎛', 'Как тебе удобно', 'каждый день, по дням недели, N раз в неделю или раз в N дней. Галочкой, счётчиком, таймером или «держалась»'],
      ['📊', 'Неделя и год', 'отчёт за неделю, год в квадратиках и карточка каждой привычки с сериями и календарём'],
      ['🌙', 'Пауза без вины', 'заболела или в отпуске — поставь паузу, серия не сгорит'],
    ]],
    ['1.16.0', [
      ['🎂', 'Праздник!', 'сегодня всё приложение празднует твой день рождения: каждый вход — новая праздничная заставка'],
    ]],
    ['1.15.1', [
      ['🌈', 'Стразики переливаются', 'соседние стразики больше не бывают одного цвета — неделя всегда разноцветная'],
    ]],
    ['1.15.0', [
      ['💎', '14 расцветок стразиков', 'к шести прежним добавились персик, барвинок, аква, опал, сахарная вата, шампань, орхидея и коралл'],
    ]],
    ['1.14.0', [
      ['🥤', 'Вода — точно до миллилитра', 'кружка 350, стакан 400 — добавляй вперемешку, всё сложится ровно. «−» убирает именно последнее'],
      ['⚡', 'Частые объёмы — одной кнопкой', 'под стаканами появляются те, что ты уже добавляла. А в «стакане» видно, из чего сложился день'],
      ['🌸', 'Спокойнее про лимит', 'если съела чуть больше — никакого красного, просто мягкий розовый хвостик на кольце'],
      ['✨', 'Небо до самых часов', 'убрал шов сверху: и днём, и при открытии, и когда открыта шторка'],
      ['🎀', 'Всё аккуратнее', 'кнопки, цвета и отступы стали ровнее на любом экране'],
    ]],
  ];
  const verNum = v => String(v || '0').split('.').reduce((a, x) => a * 1000 + (parseInt(x, 10) || 0), 0);
  const WN_NOTE = 'Даже если день вышел не по плану — я всё равно тобой горжусь 💜';
  // ---------- День рождения Сони: только 20 ноября 2026 (дата и возраст — BDAY в greet.js) ----------
  const BDAY_SEEN = 'porcia.bdaycard';
  const bdayToday = () => { const g = G(); return !!(g && g.bdayToday && g.bdayToday()); };
  const bdayIsDay = d => { const g = G(); return !!(g && g.BDAY && d === g.BDAY.key); };
  function bdayCardSeen() { try { return localStorage.getItem(BDAY_SEEN) === G().BDAY.key; } catch (e) { return true; } }
  function bdayCard() {
    const g = G(); if (!g || !g.BDAY) return;
    try { localStorage.setItem(BDAY_SEEN, g.BDAY.key); } catch (e) { /* покажется ещё раз — не страшно */ }
    const name = String(g.prefs().name || '').trim() || 'Сонечка';
    // мишка в короне и с шариком — только на открытке, её гардероб не меняется
    const B0 = bearCfg(), col = Object.assign({}, B0.col); delete col.balloon; delete col.crown;
    const dress = varsStyle(Object.assign({}, B0, { hat: 'crown', item: 'balloon', col }));
    openSheet(`<div class="wn bd">
      <svg class="bear" viewBox="0 0 120 120" aria-hidden="true" style="${dress}"><use href="#bear"/></svg>
      <span class="ver">20 ноября · ${g.BDAY.age} лет</span>
      <div class="bd-age" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#gem-candy"/></svg><span>${g.BDAY.age}</span><svg viewBox="0 0 24 24"><use href="#gem-opal"/></svg></div>
      <h2>С днём рождения, ${esc(name)}!</h2>
      <p>Сегодня тебе ${g.BDAY.age}, и я хочу сказать главное: ты самая нежная, заботливая и сильная. Каждый день ты бережёшь себя, а сегодня позволь побаловать тебя.</p>
      <p>Сегодня можно торт, вкусняшки и никаких мыслей о лимитах — это праздник. Пусть этот год будет тёплым, лёгким и полным поводов улыбаться.</p>
      <div class="sign">Твой мишка 🧸</div>
      <div class="ps">и кое-кто, кто очень тебя любит 💜</div>
      <button class="btn block" style="margin-top:12px" data-act="sheet-close">Спасибо, мишка! 💜</button></div>`, () => setTimeout(() => whatsNew(false), 900));
    setTimeout(() => { if (g.confetti && !calm()) g.confetti(110, true); }, 250);
  }
  function bdayCardMaybe() { if (bdayToday() && !bdayCardSeen() && $('#backdrop').hidden) bdayCard(); }
  function whatsNew(force) {
    // в день рождения сначала открытка, «Что нового» — после неё; поверх другой шторки не открываем
    if (!force && ((bdayToday() && !bdayCardSeen()) || !$('#backdrop').hidden)) return;
    let seen = null; try { seen = localStorage.getItem(WN_KEY); } catch (e) { /* нет памяти */ }
    if (!force && (seen === APP_VER || !S.settings.onboarded)) { try { localStorage.setItem(WN_KEY, APP_VER); } catch (e) { /* */ } return; }
    try { localStorage.setItem(WN_KEY, APP_VER); } catch (e) { /* */ }
    // из настроек — последние две версии; после обновления — всё, что новее увиденной
    const fresh = WHATS_NEW_BY.filter(([v]) => force ? true : verNum(v) > verNum(seen)).slice(0, force ? 2 : 99);
    const WHATS_NEW = (fresh.length ? fresh : WHATS_NEW_BY.slice(0, 1)).flatMap(([, list]) => list);
    const g = G(), name = g && String(g.prefs().name || '').trim();
    openSheet(`<div class="wn"><svg class="bear" viewBox="0 0 120 120" aria-hidden="true"><use href="#bear"/></svg><span class="ver">версия ${APP_VER}</span>
      <h2>${name ? esc(name) + ', смотри' : 'Смотри'}, что нового!</h2>
      <ul>${WHATS_NEW.map(([e, t, d], i) => `<li style="--i:${i}"><span class="e" aria-hidden="true">${e}</span><span><b>${t}</b><span class="small muted">${d}</span></span></li>`).join('')}</ul>
      ${WN_NOTE ? `<p class="note">${WN_NOTE}</p>` : ''}
      <div class="sign">Твой мишка 🧸</div>
      <button class="btn block" style="margin-top:12px" data-act="sheet-close">Ура, спасибо!</button></div>`);
  }
  // настройки «Детали»
  function detailCard() {
    return `<h2>Детали</h2>${swRow('sky', 'Небо по времени суток', S.settings.sky !== false, 'Цвет шапки «Сегодня» меняется утром, днём, на закате и ночью')}
      ${bdayToday() ? '<button class="btn ghost block" style="margin-top:10px" data-act="bday-card">Открытка от мишки 🎂</button>' : ''}
      <button class="btn plain block" style="margin-top:10px" data-act="whatsnew">Что нового в версии ${APP_VER}</button>`;
  }

  // ---------- Падающие звёзды ----------
  function skyInit() {
    if (calm()) return;
    const sky = document.createElement('div'); sky.className = 'sky'; sky.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(sky, document.body.firstChild);
    const free = () => document.visibilityState === 'visible' && bearCfg().stars && !document.querySelector('.pg') && $('#backdrop').hidden && !document.body.classList.contains('kb');
    function star() {
      const W = innerWidth, Hh = innerHeight, s = document.createElement('i');
      // старт у правого верхнего угла, финиш у левого нижнего
      const x0 = W * (0.72 + Math.random() * 0.36), y0 = Hh * (0.05 + Math.random() * 0.12); // не от самого верха — там полоса с часами
      const x1 = W * (-0.12 + Math.random() * 0.3), y1 = Hh * (0.8 + Math.random() * 0.3);
      const dx = x1 - x0, dy = y1 - y0;
      s.className = 'shoot';
      s.style.cssText = `left:${x0.toFixed(0)}px;top:${y0.toFixed(0)}px;--ang:${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}deg;--len:${Math.hypot(dx, dy).toFixed(0)}px;--dur:${(2.8 + Math.random() * 1.2).toFixed(2)}s`;
      sky.appendChild(s); setTimeout(() => s.remove(), 4200);
    }
    // одна звезда раз в 15–35 секунд, иногда парой
    const later = () => setTimeout(spawn, 15e3 + Math.random() * 20e3);
    function spawn() {
      if (free()) { star(); if (Math.random() < 0.25) setTimeout(() => { if (free()) star(); }, 500 + Math.random() * 900); }
      later();
    }
    setTimeout(spawn, 10e3);
  }

  // ---------- Сезонная погода ----------
  // Иногда, примерно раз в 3–6 минут, на фоне за карточками секунд 20 идёт погода по сезону.
  const SEASONS = [['autumn', 'Осень'], ['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето']];
  const SEASON_IN = { autumn: 'осень', winter: 'зима', spring: 'весна', summer: 'лето' };
  // зима — с 20 ноября: в это время уже холодно и идёт снег
  function seasonNow() { const d = new Date(), m = d.getMonth(); return m === 11 || m < 2 || (m === 10 && d.getDate() >= 20) ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'; }
  const LEAF = ['#EFA04C', '#E2794E', '#D9B04A', '#C9693A'];
  function wxPlay(season, opt) {
    opt = opt || {};
    if (calm()) return null;
    const host = opt.host || document.body;
    const prev = host.querySelector(':scope > .wx'); if (prev) prev.remove();
    const kind = season === 'winter' ? 's' : season === 'spring' ? 'p' : season === 'summer' ? 'g' : 'l'; // осенью только листья — дождик убран по просьбе
    const k = opt.host ? 0.6 : 1;
    const n = Math.round(({ r: 70, s: 46, p: 18, l: 14, g: 22 })[kind] * k);
    const lay = document.createElement('div'); lay.className = 'wx' + (opt.host ? ' wx-pg' : ''); lay.setAttribute('aria-hidden', 'true');
    let html = '';
    const R = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < n; i++) {
      let st = `left:${R(-5, 112).toFixed(1)}%;`;
      if (kind === 'r') { const d = R(0.55, 0.95); st += `--h:${R(10, 20).toFixed(0)}px;animation-duration:${d.toFixed(2)}s;animation-delay:${(-R(0, d)).toFixed(2)}s`; }
      else if (kind === 's') { const d = R(8, 14); st += `--z:${R(4, 8).toFixed(1)}px;--sx:${R(-20, 20).toFixed(0)}px;opacity:${R(.55, 1).toFixed(2)};animation-duration:${d.toFixed(1)}s;animation-delay:${(-R(0, d)).toFixed(1)}s`; }
      else if (kind === 'p' || kind === 'l') { const d = R(9, 14); st += `--z:${R(kind === 'p' ? 8 : 10, kind === 'p' ? 12 : 14).toFixed(1)}px;--sx:${R(-40, 40).toFixed(0)}px;${kind === 'l' ? `--c:${LEAF[i % 4]};` : ''}animation-duration:${d.toFixed(1)}s;animation-delay:${(-R(0, d)).toFixed(1)}s`; }
      else { const d = R(10, 16); st = `left:${R(0, 100).toFixed(1)}%;--z:${R(8, 13).toFixed(1)}px;--sx:${R(-30, 30).toFixed(0)}px;animation-duration:${d.toFixed(1)}s;animation-delay:${(-R(0, d)).toFixed(1)}s`; }
      html += `<i class="${kind}" style="${st}"></i>`;
    }
    lay.innerHTML = html;
    if (opt.host) host.appendChild(lay); else host.insertBefore(lay, host.firstChild);
    const dur = opt.dur || 22e3;
    if (!opt.host) setTimeout(() => { lay.classList.add('wx-out'); setTimeout(() => lay.remove(), 1900); }, dur);
    return lay;
  }
  function wxInit() {
    if (calm()) return;
    const free = () => document.visibilityState === 'visible' && bearCfg().season && !document.body.classList.contains('kb') && !document.querySelector('body > .wx');
    const later = () => setTimeout(tick, 180e3 + Math.random() * 180e3);
    function tick(first) { if (free() && (!first || Math.random() < 0.5)) wxPlay(seasonNow()); later(); }
    setTimeout(() => tick(true), 8e3 + Math.random() * 6e3);
    // Заставка при входе — тоже с погодой по сезону
    const dress = el => { if (bearCfg().season && el && el.classList && el.classList.contains('pg') && !el.classList.contains('pg-bday') && !el.querySelector('.wx')) wxPlay(seasonNow(), { host: el }); };
    document.querySelectorAll('.pg').forEach(dress);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(dress))).observe(document.body, { childList: true });
  }

  // ---------- Брызги, когда выпита вся вода ----------
  function waterBurst() {
    const card = $('#water'), last = card && card.querySelector('.glasses .glass:last-child');
    if (!card || !last || calm()) return;
    const cr = card.getBoundingClientRect(), gr = last.getBoundingClientRect();
    const cx = gr.left - cr.left + gr.width / 2, cy = gr.top - cr.top + gr.height / 2;
    for (let i = 0; i < 10; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'wsp'); s.setAttribute('aria-hidden', 'true');
      s.innerHTML = `<use href="#${i % 3 ? 'sparkle' : 'gem-blue'}"/>`;
      const ang = Math.PI * (1.05 + Math.random() * 0.9), r = 34 + Math.random() * 40, sz = 10 + Math.random() * 9;
      s.style.cssText = `left:${(cx - sz / 2).toFixed(0)}px;top:${(cy - sz / 2).toFixed(0)}px;--s:${sz.toFixed(0)}px;--dx:${(Math.cos(ang) * r).toFixed(0)}px;--dy:${(Math.sin(ang) * r).toFixed(0)}px;animation-delay:${(i * 25)}ms`;
      card.appendChild(s); setTimeout(() => s.remove(), 1200);
    }
  }

  // ---------- Анимация переходов ----------
  const TAB_ORDER = ['today', 'act', 'body', 'habits', 'diary', 'sudoku', 'more'];
  // «Вес и замеры» открывается из «Активности», поэтому подсвечивается её вкладка
  const TAB_OF = { body: 'act' };
  const ANIM = ['from-r', 'from-l', 'day-r', 'day-l'];
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prevScreen = { view: null, day: null };
  let animTimer = null;
  function playEnter(el, cls) {
    if (!el || calm()) return;
    document.querySelectorAll('.view[id^="v-"]').forEach(v => v.classList.remove(...ANIM));
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(animTimer);
    animTimer = setTimeout(() => el.classList.remove(...ANIM), 460);
  }

  // ---------- Рендер ----------
  function render() {
    if (ui.view !== 'today') { const bb = $('#bearBubble'); if (bb && !bb.hidden) { clearTimeout(bubbleTimer); bb.hidden = true; } }
    const viewChanged = prevScreen.view !== null && prevScreen.view !== ui.view;
    const dayChanged = !viewChanged && (ui.view === 'today' || ui.view === 'act') && prevScreen.day !== null && prevScreen.day !== ui.day;
    document.querySelectorAll('.view[id^="v-"]').forEach(v => v.hidden = v.id !== 'v-' + ui.view);
    const curTab = TAB_OF[ui.view] || ui.view;
    document.querySelectorAll('.tab').forEach(t => { if (t.dataset.tab === curTab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (ui.view === 'today') renderToday();
    else if (ui.view === 'diary') renderDiary();
    else if (ui.view === 'act') renderAct();
    else if (ui.view === 'sudoku') renderSudoku();
    else if (ui.view === 'body') renderBody();
    else if (ui.view === 'habits') renderHabits();
    else renderMore();
    if (viewChanged) playEnter($('#v-' + ui.view), TAB_ORDER.indexOf(ui.view) > TAB_ORDER.indexOf(prevScreen.view) ? 'from-r' : 'from-l');
    else if (dayChanged) playEnter($('#v-' + ui.view), ui.day > prevScreen.day ? 'day-r' : 'day-l');
    if (viewChanged) tabPop(document.querySelector(`.tab[data-tab="${TAB_OF[ui.view] || ui.view}"]`));
    prevScreen.view = ui.view; prevScreen.day = ui.day;
    skyApply();
    if (ui.view === 'today') eveningHeart();
  }

  function renderToday() {
    const t = today();
    $('#dayTitle').textContent = fmtDay(ui.day);
    $('#dayNext').disabled = ui.day >= t;
    renderWeekStrip();
    renderPeek();
    $('#foodLbl').textContent = ui.day === t ? 'Что съела?' : ui.day === addDays(t, -1) ? 'Что съела вчера?' : 'Что съела ' + fmtLong(ui.day) + '?';
    renderSummary();
    renderWater();
    renderHabMini();
    renderActMini();
    renderTips();
    renderMeals();
    renderPreview();
    renderQuick();
    renderEntries();
    renderFoodTools();
  }
  function renderFoodTools() {
    const n = S.custom.length;
    $('#foodTools').innerHTML = `<button class="ftbtn" data-act="add-food">${IC.plus}Свой продукт</button>${n ? `<button class="ftbtn" data-act="my-foods">Мои продукты <span class="num muted">${n}</span></button>` : ''}`;
  }
  function myFoodsSheet() {
    openSheet(`<h2>Мои продукты</h2>
      <p class="muted small" style="margin:0">Они находятся по названию, когда пишешь, что съела.</p>
      <div class="list" style="margin-top:8px">${S.custom.map(c => `<div class="li"><div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(c.name)}</div><div class="tiny muted num">${nf(c.kcal)} ккал · Б ${g1(c.p)} · Ж ${g1(c.f)} · У ${g1(c.c)} на 100 г${c.portion ? ' · порция ' + c.portion + ' г' : ''}</div></div><button class="btn plain" style="min-height:36px;padding:6px 12px" data-act="edit-food" data-id="${c.id}">Изменить</button></div>`).join('')}</div>
      <div class="stack"><button class="btn ghost block" data-act="add-food">Добавить продукт</button><button class="btn plain block" data-act="sheet-close">Закрыть</button></div>`);
  }

  function proteinBlock(t) {
    const P = S.settings.protein;
    if (P) {
      const w = Math.min(100, t.p / P * 100);
      return `<div><div class="mrow"><span>Белок</span><span class="k num">${g1(t.p)} / ${nf(P)} г</span></div><div class="bar"><i style="width:${w}%"></i></div></div>`;
    }
    return `<div><div class="mrow"><span>Белок</span><span class="k num">${g1(t.p)} г</span></div><button class="linkbtn tiny" data-act="goto-protein" style="padding:0">Задать цель по белку</button></div>`;
  }
  function macrosLine(t) {
    const F = S.settings.fat, Cg = S.settings.carb;
    return `<div class="macros"><span><i class="dot" style="background:var(--fat)"></i>Жиры <span class="num">${g1(t.f)}${F ? ' / ' + nf(F) : ''}</span> г</span><span><i class="dot" style="background:var(--carb)"></i>Углеводы <span class="num">${g1(t.c)}${Cg ? ' / ' + nf(Cg) : ''}</span> г</span></div>`;
  }

  // Одометр: каждая цифра — колонка 0–9, которая прокручивается к новому значению
  function odoHTML(str) {
    return '<span class="odo" aria-hidden="true">' + [...str].map(ch => /\d/.test(ch)
      ? `<span class="dg"><span class="col" style="transform:translateY(calc(-${ch} * var(--lh)))">${'0123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>`
      : `<span class="sp"></span>`).join('') + '</span>';
  }
  function odoRoll(el, from, to) {
    if (!el) return;
    const fs = nf(from), ts = nf(to);
    el.setAttribute('aria-label', ts);
    if (!DZ() || calm() || from === to) { el.innerHTML = ts; return; }
    const w = Math.max(fs.length, ts.length), F = fs.padStart(w, ' '), T = ts.padStart(w, ' ');
    el.innerHTML = odoHTML(T.replace(/ /g, '\u00a0'));
    const cols = el.querySelectorAll('.dg .col'); let k = 0;
    const tchars = [...T];
    tchars.forEach((ch, i) => {
      if (!/\d/.test(ch)) return;
      const col = cols[k++]; const f = /\d/.test(F[i]) ? F[i] : '0';
      col.style.transition = 'none'; col.style.transform = `translateY(calc(-${f} * var(--lh)))`;
      col.style.setProperty('--od', ((tchars.length - i) * 45) + 'ms');
    });
    void el.offsetWidth;
    cols.forEach(c => { c.style.transition = ''; });
    k = 0;
    tchars.forEach(ch => { if (/\d/.test(ch)) cols[k++].style.transform = `translateY(calc(-${ch} * var(--lh)))`; });
    clearTimeout(el._odoT); el._odoT = setTimeout(() => { el.textContent = ts; }, 1300);
  }
  const prevSum = { day: null, kcal: 0, p: 0 };
  function renderSummary() {
    const was = prevSum.day === ui.day ? { kcal: prevSum.kcal, p: prevSum.p } : null;
    renderSummaryInner();
    const t = totals(dayItems(ui.day)), L = limitFor(ui.day);
    prevSum.day = ui.day; prevSum.kcal = t.kcal; prevSum.p = t.p;
    if (!was || was.kcal === t.kcal || !DZ()) return;
    // кольцо и бусина плавно едут со старого места
    const val = $('#summary .ring .val'), bead = $('#summary .ring .bead');
    if (L && val) {
      const R = 54, CI = 2 * Math.PI * R, f0 = Math.min(1, was.kcal / L), f1 = Math.min(1, t.kcal / L);
      val.style.transition = 'none'; val.setAttribute('stroke-dashoffset', (CI * (1 - f0)).toFixed(1)); val.removeAttribute('opacity');
      if (bead) { bead.style.transition = 'none'; bead.style.transform = `rotate(${(f0 * 360).toFixed(1)}deg)`; }
      void val.getBoundingClientRect();
      val.style.transition = ''; val.setAttribute('stroke-dashoffset', (CI * (1 - f1)).toFixed(1));
      if (bead) { bead.style.transition = ''; bead.style.transform = `rotate(${(f1 * 360).toFixed(1)}deg)`; }
    }
    const big = $('#summary .ring .big'), top = $('#summary .stat-top b');
    // сверх лимита число показывается со знаком «+» — его одометр не крутит
    if (L && big && was.kcal <= L && t.kcal <= L) { odoRoll(big, L - was.kcal, L - t.kcal); }
    if (top) odoRoll(top, was.kcal, t.kcal);
    // сердечки, когда набран белок
    const P = S.settings.protein;
    if (P && was.p < P && t.p >= P && ui.day === today()) setTimeout(proteinHearts, 450);
  }
  function renderSummaryInner() {
    const items = dayItems(ui.day);
    const t = totals(items);
    const L = limitFor(ui.day);
    const el = $('#summary');
    if (L) {
      const over = t.kcal > L, extra = t.kcal - L;
      const frac = Math.min(1, t.kcal / L);
      const R = 54, CIRC = 2 * Math.PI * R;
      // Сверх лимита — без красного: кольцо остаётся своим цветом, а лишнее показано мягким «хвостиком» второго круга
      const ofrac = over ? Math.min(1, extra / L) : 0;
      const overArc = over ? `<circle class="ovr" cx="64" cy="64" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - Math.max(ofrac, 0.015))).toFixed(1)}"/>` : '';
      const overText = bdayIsDay(ui.day) ? 'сегодня праздник 🎂' : extra <= L * 0.1 ? 'чуть больше лимита' : 'больше лимита';
      el.innerHTML = `<div class="summary">
        <div class="ring ${over ? 'over' : ''}" role="img" aria-label="Съедено ${nf(t.kcal)} из ${nf(L)} ккал${over ? `, на ${nf(extra)} больше лимита` : ''}">
          <svg viewBox="0 0 128 128"><circle class="trk" cx="64" cy="64" r="${R}" fill="none" stroke-width="12"/>
          <circle class="val" cx="64" cy="64" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - frac)).toFixed(1)}" ${t.kcal === 0 ? 'opacity="0"' : ''}/>${overArc}${t.kcal > 0 && !over ? `<g class="bead" style="transform:rotate(${(frac * 360).toFixed(1)}deg)"><circle cx="${64 + R}" cy="64" r="7.5" fill="url(#beadFill)" stroke="var(--surface)" stroke-width="2.5"/><circle cx="${66 + R}" cy="62" r="1.8" fill="#fff"/></g>` : ''}</svg>
          <div class="mid">${over ? `<div class="big">+${nf(extra)}</div><div class="cap">сверх лимита</div>` : `<div class="big">${nf(L - t.kcal)}</div><div class="cap">осталось</div>`}</div>
        </div>
        <div class="stats">
          <div class="stat-top"><b>${nf(t.kcal)}</b> <span class="muted">из ${nf(L)} ккал</span></div>
          ${ND() ? `<div class="formula"><span>лимит <b class="num">${nf(L)}</b></span><span>съедено <b class="num">${nf(t.kcal)}</b></span></div><div><span class="chip-state${over ? ' soft' : ''}">${over ? overText : 'в лимите'}</span></div>` : proteinBlock(t) + macrosLine(t)}
        </div></div>${ND() ? macroTiles(t) : ''}`;
      return;
    }
    const isToday = ui.day === today();
    const b = baseline();
    let head = '';
    if (isToday && b.count < 5) {
      const dayN = Math.min(5, b.count + 1);
      const steps = [0, 1, 2, 3, 4].map(i => `<i class="${i < b.count || (i === b.count && items.length) ? 'on' : ''}"></i>`).join('');
      head = `<div class="chip-state">Неделя наблюдения · день ${dayN} из 5</div><div class="steps5" aria-hidden="true">${steps}</div>`;
    }
    el.innerHTML = `<div style="display:grid;gap:12px">
      ${head}
      <div><span class="baseline-big">${nf(t.kcal)}</span> <span class="muted">ккал за день</span></div>
      ${ND() ? macroTiles(t) : proteinBlock(t) + macrosLine(t)}
      ${isToday && b.count < 5 ? '<p class="small muted" style="margin:0">Ешь как обычно и записывай всё, даже чай с сахаром. Через 5 дней посчитаю твою обычную калорийность и предложу лимит.</p>' : ''}
      ${isToday && b.count >= 5 && S.settings.baselineDismissed ? '<p class="small muted" style="margin:0">Лимит не задан. Его можно поставить в настройках.</p>' : ''}
    </div>`;
  }

  // Карточка воды: разметка строится один раз на день, дальше меняются только классы — чтобы работала анимация
  function renderWater(popFrom) {
    const el = $('#water');
    const plan = waterPlan();
    if (!plan) { el.hidden = true; el.innerHTML = ''; el.dataset.sig = ''; return; }
    el.hidden = false;
    const ml = waterMl(ui.day), c = waterCount(ui.day, plan);
    const sig = ui.day + '|' + plan.n + '|' + plan.size;
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      popFrom = null;
      let cups = '';
      for (let i = 0; i < plan.n; i++) {
        cups += `<button class="glass${i < c ? ' on' : ''}" data-act="water-glass" data-i="${i}"><svg viewBox="0 0 28 36" aria-hidden="true"><clipPath id="glassClip${i}"><path d="${GLASS}"/></clipPath><path class="gl" d="${GLASS}"/><g clip-path="url(#glassClip${i})"><rect class="wt" x="0" y="0" width="28" height="36"/></g></svg></button>`;
      }
      const many = plan.n > 10, cols = many ? Math.ceil(plan.n / Math.ceil(plan.n / 10)) : plan.n;
      el.innerHTML = `<div class="whead"><h2>Вода</h2><div class="wctl"><button class="wsize" data-act="water-size" aria-label="Объём стакана: ${nf(plan.size)} мл. Изменить">стакан <span class="num">${nf(plan.size)} мл</span>${IC.pen}</button><button class="wbtn" data-act="water-minus" aria-label="Убрать последнее">${IC.minus}</button><button class="wbtn" data-act="water-plus" aria-label="Добавить стакан ${nf(plan.size)} мл">${IC.plus}</button></div></div>
        <div class="wstat"><span><b class="num" id="wMl"></b> <span class="muted">из ${nf(plan.goal)} мл</span></span><span class="small" id="wLeft"></span></div>
        <div class="glasses${many ? ' many' : ''}" style="--cols:${cols}" role="group" aria-label="Стаканы воды">${cups}</div>
        <div class="wquick" id="wQuick"></div>`;
    }
    // Быстрые кнопки: объёмы, которые она добавляла раньше (кружка 350 и т. п.), и «другой объём»
    const quick = waterRecent(plan.size, 3).map(v => `<button class="wq" data-act="water-add" data-v="${v}">+${nf(v)} мл</button>`).join('') + '<button class="wq other" data-act="water-size">другой объём</button>';
    const wq = $('#wQuick'); if (wq.dataset.h !== quick) { wq.dataset.h = quick; wq.innerHTML = quick; }
    el.querySelectorAll('.glass').forEach((g, i) => {
      const f = Math.max(0, Math.min(1, (ml - i * plan.size) / plan.size));
      const on = f > 0.98;
      g.style.setProperty('--f', f > 0.98 ? 1 : f.toFixed(3));
      const pop = popFrom != null && f > 0 && i >= popFrom;
      g.classList.remove('pop');
      g.style.setProperty('--gd', pop ? (i - popFrom) * 70 + 'ms' : '0ms');
      g.classList.toggle('on', on);
      g.setAttribute('aria-pressed', on);
      g.setAttribute('aria-label', `Стакан ${i + 1} из ${plan.n}`);
      if (pop && !calm()) { void g.offsetWidth; g.classList.add('pop'); }
    });
    $('#wMl').textContent = nf(ml);
    const done = ml >= plan.goal - 0.5;
    const wl = $('#wLeft');
    wl.textContent = done ? (ml - plan.goal >= 1 ? `Цель выполнена · +${nf(ml - plan.goal)} мл` : 'Цель выполнена') : `${c} из ${plan.n} ${plural(plan.n, 'стакана', 'стаканов', 'стаканов')}`;
    wl.classList.toggle('done', done);
    el.querySelector('[data-act="water-minus"]').disabled = ml <= 0;
    el.querySelector('[data-act="water-plus"]').disabled = ml >= 20000;
    renderHabMini(); // привычка «Вода» отмечается сама — сводка привычек обновляется вместе с водой
  }
  function waterCommit(base, adds) {
    const plan = waterPlan(); if (!plan) return;
    const prev = waterMl(ui.day), prevC = waterCount(ui.day, plan);
    waterSave(ui.day, base, adds);
    const next = waterMl(ui.day);
    if (next === prev) return;
    renderWater(next > prev ? prevC : null);
    if (prev < plan.goal && next >= plan.goal) { setTimeout(waterBurst, 260); if (bearCfg().talk && ui.day === today() && !isNight()) setTimeout(() => bearSay('Вся вода на сегодня выпита — умница!'), 500); }
  }
  // Добавить ровно столько, сколько выпила (times раз), — без подгонки под размер стакана
  function waterAdd(ml, times) {
    ml = Math.round(ml); times = times || 1;
    const { base, adds } = waterParts(ui.day);
    if (waterMl(ui.day) + ml * times > 20000) { toast('Больше 20 литров за день не записываю'); return; }
    for (let i = 0; i < times; i++) adds.push(ml);
    waterCommit(base, adds);
  }
  // Убрать последнее добавление (ровно его объём); для выпитого до обновления — по стакану
  function waterUndo() {
    const plan = waterPlan(); if (!plan) return 0;
    let { base, adds } = waterParts(ui.day);
    let v = 0;
    if (adds.length) v = adds.pop();
    else if (base > 0) { v = Math.min(base, Math.round(plan.size)); base -= v; }
    if (v) waterCommit(base, adds);
    return v;
  }
  // Свои объёмы (не из списка) запоминаются и потом выбираются одним нажатием
  function glassMine() { return (Array.isArray(S.settings.glassMine) ? S.settings.glassMine : []).filter(v => v >= GLASS_MIN && v <= GLASS_MAX && !GLASS_PRESETS.includes(v)); }
  function glassList() { const cur = S.settings.glass; return [...new Set([...GLASS_PRESETS, ...glassMine(), ...(cur >= GLASS_MIN && cur <= GLASS_MAX ? [cur] : [])])].sort((a, b) => a - b); }
  function glassChips(cur, src) {
    return `<div class="gchips" role="group" aria-label="Объём стакана"><button class="seg" data-act="glass-pick" data-v="auto" data-src="${src}" aria-pressed="${!cur}">Авто</button>${glassList().map(v => `<button class="seg" data-act="glass-pick" data-v="${v}" data-src="${src}" aria-pressed="${cur === v}">${v} мл</button>`).join('')}</div>`;
  }
  // Шторка «Вода»: добавить любой объём, выбрать стакан для «+», посмотреть и поправить, из чего сложился день
  function glassSheet() {
    const cur = S.settings.glass || null, plan = waterPlan();
    const amounts = [...new Set([...glassList(), ...waterRecent(0, 4)])].sort((a, b) => a - b);
    const { base, adds } = waterParts(ui.day);
    const logRow = (v, i, label) => `<span class="wlog-i"><span class="num">${label || nf(v) + ' мл'}</span><button class="xbtn" data-act="water-del" data-i="${i}" aria-label="Убрать ${nf(v)} мл">${IC.x}</button></span>`;
    const log = (base > 0 ? logRow(base, -1, `раньше · ${nf(base)} мл`) : '') + adds.map((v, i) => logRow(v, i)).join('');
    openSheet(`<h2>Вода</h2>
      <h3 class="wsub">Выпила сейчас</h3>
      <div class="gchips" role="group" aria-label="Добавить воду">${amounts.map(v => `<button class="seg wadd" data-act="water-add" data-v="${v}" data-src="sheet">+${nf(v)}</button>`).join('')}</div>
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Свой объём, мл</span><input id="wOnce" type="text" inputmode="numeric" placeholder="например, 750"></label><button class="btn" data-act="water-once">Добавить</button></div>
      <h3 class="wsub">Стакан для кнопки «+»</h3>
      ${glassChips(cur, 'sheet')}
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Свой стакан, мл</span><input id="gsIn" type="text" inputmode="numeric" value="${cur && !glassList().includes(cur) ? cur : ''}" placeholder="например, 180"></label><button class="btn plain" data-act="glass-save" data-src="sheet">Сохранить</button></div>
      ${plan ? `<p class="hint">Сейчас: ${waterPlanText(plan)}. Выпитое при смене стакана не меняется.</p>` : ''}
      ${log ? `<h3 class="wsub">${ui.day === today() ? 'Сегодня' : 'За этот день'} · ${nf(waterMl(ui.day))} мл</h3><div class="wlog">${log}</div>` : ''}`);
  }
  function glassApply(v, src) {
    const old = S.settings.glass;
    S.settings.glass = v;
    // запоминаем и новый свой объём, и тот, с которого переключилась (например, 400 мл, заданные раньше)
    const keep = [v, old].filter(x => x && !GLASS_PRESETS.includes(x));
    if (keep.length) S.settings.glassMine = [...new Set([...keep, ...glassMine()])].slice(0, 4);
    save();
    if (src === 'sheet') closeSheet();
    render();
    const plan = waterPlan();
    toast(v ? `Стакан: ${nf(v)} мл${plan ? ' — ' + waterPlanText(plan) : ''}` : `Объём стакана — авто${plan ? ': ' + waterPlanText(plan) : ''}`);
  }

  function renderTips() {
    const el = $('#tips');
    const out = [];
    if (ui.day === today()) {
      const L = currentLimitEntry();
      const b = baseline();
      if (!L && b.count >= 5 && !S.settings.baselineDismissed) {
        out.push(`<div class="card tip"><p>Пять дней записаны. В среднем ты ешь <b class="num">${nf(b.avg)} ккал</b> в день. Лимит на 10% меньше — <b class="num">${nf(b.limit)} ккал</b>.</p>
          <p class="small muted">Есть можно что угодно, главное — не выше лимита. Не хочется есть — не заставляй себя.</p>
          <div class="row-btns"><button class="btn" data-act="apply-baseline">Поставить ${nf(b.limit)}</button><button class="btn plain" data-act="goto-limit">Задать свой</button></div></div>`);
      }
      const st = stall();
      if (st) {
        out.push(`<div class="card tip warn"><p>Вес почти не меняется две недели: <span class="num">${g1(st.from.w)} → ${g1(st.to.w)} кг</span>. Можно срезать ещё 10%: <b class="num">${nf(st.limit)} → ${nf(st.next)} ккал</b>.</p>
          <div class="row-btns"><button class="btn" data-act="apply-stall" data-k="${st.next}">Срезать до ${nf(st.next)}</button><button class="btn plain" data-act="dismiss-stall" data-d="${st.to.d}">Пока нет</button></div></div>`);
      }
      const w = weights();
      const last = w[w.length - 1];
      const due = last ? daysBetween(last.d, today()) >= 14 : Object.keys(S.log).some(d => S.log[d].length);
      if (due && S.settings.weighSnooze !== today()) {
        out.push(`<div class="card tip"><p>${last ? 'Прошло две недели с последнего замера — пора взвеситься.' : 'Сделай первый замер веса и объёмов — от него будем считать прогресс.'} <span class="muted">Утром, натощак, после туалета.</span></p>
          <div class="row-btns"><button class="btn ghost" data-act="goto-body">Записать замер</button><button class="btn plain" data-act="snooze-weigh">Позже</button></div></div>`);
      }
    }
    el.innerHTML = out.join('');
    el.hidden = !out.length;
  }

  function renderMeals() {
    $('#meals').innerHTML = MEALS.map(([k, n]) => `<button class="seg" data-act="meal" data-m="${k}" aria-pressed="${ui.meal === k}">${n}</button>`).join('');
  }

  function previewTotals() {
    return totals(ui.draft.filter(i => !i.unknown).map(i => ({ k: i.kcal, p: i.p, f: i.f, c: i.c })));
  }
  function renderPreview() {
    const el = $('#preview');
    const has = ui.draft.length > 0 || !!ui.photo;
    $('#foodHint').hidden = has || $('#food').value.trim().length > 0;
    if (!has) { el.innerHTML = ''; return; }
    const known = ui.draft.filter(i => !i.unknown);
    const rows = ui.draft.map((it, idx) => {
      if (it.unknown) {
        return `<div class="punk"><div><div class="nm">«${esc(it.src)}» — не нашла</div><div class="tiny muted">Добавь продукт с калорийностью, и я его запомню. Или напиши так: «${esc(it.name || 'блюдо')} 300 ккал».</div></div>
          <button class="btn ghost" style="min-height:38px;padding:8px 12px" data-act="add-food" data-name="${esc(it.name || it.src)}">Добавить</button></div>`;
      }
      const gram = it.fid || it.ph
        ? `<label class="gram"><input type="text" inputmode="numeric" value="${it.grams}" data-idx="${idx}" aria-label="Граммы: ${esc(it.name)}"><span>${it.drink ? 'мл' : 'г'}</span></label>`
        : `<span class="tiny muted">вручную</span>`;
      return `<div class="pitem" data-idx="${idx}"><div style="min-width:0"><div class="nm">${esc(it.name)}</div><div class="sub" data-sub="${idx}"><span class="num">${nf(it.kcal)}</span> ккал · <span class="pr">белок ${g1(it.p)} г</span></div></div>${gram}<button class="xbtn" data-act="draft-del" data-idx="${idx}" aria-label="Убрать ${esc(it.name)}">${IC.x}</button></div>`;
    }).join('');
    const t = previewTotals();
    const note = known.length ? '<p class="tiny muted" style="margin:0 0 2px">Это предпросмотр. В дневник попадёт после кнопки «Записать».</p>' : '';
    el.innerHTML = photoRow() + note + rows + (known.length ? `<div class="ptotal"><span>Итого: <b class="num" id="ptK">${nf(t.kcal)}</b> ккал</span><span class="small" style="color:var(--protein)">белок <span class="num" id="ptP">${g1(t.p)}</span> г</span></div>
      <button class="btn block" data-act="commit">Записать ${MEAL_TO[ui.meal]}</button>` : '');
  }

  function quickList() {
    const favKeys = new Set(S.favs.map(f => f.key));
    const cut = addDays(today(), -45);
    const map = new Map();
    for (const [d, arr] of Object.entries(S.log)) {
      if (d < cut) continue;
      for (const e of arr) {
        const key = (e.fid || 'n:' + e.n) + '|' + e.g;
        if (favKeys.has(key)) continue;
        const cur = map.get(key);
        if (cur) { cur.count++; if (e.t > cur.e.t) cur.e = e; } else map.set(key, { count: 1, e, key });
      }
    }
    const freq = [...map.values()].filter(x => x.count >= 2).sort((a, b) => b.count - a.count || b.e.t - a.e.t)
      .slice(0, Math.max(0, 10 - S.favs.length)).map(x => Object.assign(tpl(x.e), { key: x.key, fav: false }));
    return S.favs.map(f => Object.assign({}, f, { fav: true })).concat(freq);
  }
  function tpl(e) { return Object.assign({ fid: e.fid || null, n: e.n, g: e.g, k: e.k, p: e.p, f: e.f, c: e.c, l: e.l, dr: e.dr || 0 }, e.ph ? { ph: e.ph } : {}); }
  function renderQuick() {
    const list = quickList();
    const el = $('#quickWrap');
    if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="card"><h2>Часто ешь</h2><p class="tiny muted" style="margin:-4px 0 10px">Нажми — и добавлю ${MEAL_TO[ui.meal]}</p><div class="quick">${list.map((q, i) =>
      `<button class="qchip ${q.fav ? 'fav' : ''}" data-act="quick" data-i="${i}"><span class="nm">${q.fav ? IC.star + ' ' : ''}${esc(q.n)}</span><span class="sub num">${q.l && !/ккал$/.test(q.l) ? esc(q.l) + ' · ' : ''}${nf(q.k)} ккал</span></button>`).join('')}</div></div>`;
    el._list = list;
  }

  function renderEntries() {
    const items = dayItems(ui.day);
    const el = $('#entries');
    if (ND()) { renderMealCards(items, el); return; }
    el.className = 'card';
    if (!items.length) { el.innerHTML = `<h2>Записи</h2>${emptyBear('Здесь появится всё, что ты съешь за день.')}`; return; }
    const groups = MEALS.map(([k, n]) => {
      const arr = items.filter(i => i.m === k);
      if (!arr.length) return '';
      const t = totals(arr);
      return `<div class="meal-group"><div class="mg-head"><h3>${n}</h3><span class="num">${nf(t.kcal)} ккал · белок ${g1(t.p)} г</span></div>
        ${arr.map(e => `<button class="entry" data-act="entry" data-id="${e.id}"><div style="min-width:0"><div class="nm">${esc(e.n)}</div><div class="sub">${esc(e.l || (e.g ? e.g + ' г' : ''))}</div></div><div class="kc">${nf(e.k)}<small>${g1(e.p)} г белка</small></div></button>`).join('')}</div>`;
    }).join('');
    el.innerHTML = `<h2>Записи</h2>${groups}`;
  }

  // ---------- Дневник ----------
  function renderDiary() {
    const t = today();
    const days = new Set(Object.keys(S.log).filter(d => S.log[d].length).concat(Object.keys(S.act).filter(d => S.act[d].steps || (S.act[d].w || []).length)));
    days.add(t);
    const list = [...days].sort().reverse().slice(0, 90);
    const last7 = [];
    for (let i = 0; i < 7; i++) { const d = addDays(t, -i); if (S.log[d] && S.log[d].length) last7.push(d); }
    let avgK = 0, avgP = 0, inL = 0, withL = 0;
    last7.forEach(d => { const tt = totals(S.log[d]); avgK += tt.kcal; avgP += tt.p; const L = limitFor(d); if (L) { withL++; if (tt.kcal <= L) inL++; } });
    if (last7.length) { avgK /= last7.length; avgP /= last7.length; }
    $('#diarySum').innerHTML = last7.length
      ? `<h2>Последние 7 дней</h2><div class="kpis">
          <div class="kpi"><div class="v">${nf(avgK)}</div><div class="l">ккал в среднем</div></div>
          <div class="kpi"><div class="v" style="color:var(--protein)">${g1(avgP)}</div><div class="l">г белка в среднем</div></div>
          <div class="kpi"><div class="v">${withL ? inL + '/' + withL : '—'}</div><div class="l">${withL ? 'дней в лимите' : 'лимит не задан'}</div></div>
        </div><p class="tiny muted" style="margin:10px 0 0">Записано дней: ${last7.length} из 7</p>`
      : `<h2>Последние 7 дней</h2>${emptyBear('Пока нет записей. Начни с экрана «Сегодня».')}`;
    const maxK = Math.max(1, ...list.map(d => totals(dayItems(d)).kcal));
    $('#diaryList').innerHTML = list.map(d => {
      const items = dayItems(d); const tt = totals(items); const L = limitFor(d);
      const base = L || maxK;
      const w = Math.min(100, tt.kcal / base * 100);
      const over = L && tt.kcal > L;
      const ad = actDay(d); const good = L && tt.kcal > 0 && tt.kcal <= L && d < today();
      return `<button class="drow" data-act="open-day" data-day="${d}"><span class="d">${fmtDay(d)}</span>
        <span class="v">${good ? GEM + ' ' : ''}${nf(tt.kcal)} <small>${L ? '/ ' + nf(L) : 'ккал'}</small></span>
        <div class="bar ${over ? 'over' : 'accent'}"><i style="width:${w}%"></i></div>
        <div class="meta"><span style="color:var(--protein)">белок ${g1(tt.p)} г</span><span>жиры ${g1(tt.f)} г</span><span>${items.length} ${plural(items.length, 'запись', 'записи', 'записей')}</span>${ad.steps ? `<span>шаги ${nf(ad.steps)}</span>` : ''}${(ad.w || []).length ? `<span style="color:var(--accent)">${ad.w.map(w => (ACT[w.type] || ACT.other).n.toLowerCase()).join(', ')}</span>` : ''}</div></button>`;
    }).join('');
  }

  // ---------- Вес ----------
  function renderBody() {
    const w = weights();
    const last = w[w.length - 1];
    const first = w[0];
    const nb = $('#bodyNext');
    if (!last) {
      nb.innerHTML = `<h2>Замеры</h2><p style="margin:0">Первый замер — точка отсчёта. Взвешивайся раз в 2 недели, утром натощак, после туалета.</p>`;
    } else {
      const since = daysBetween(last.d, today());
      const left = 14 - since;
      const dueTxt = left <= 0 ? '<span class="chip-state">Пора взвеситься</span>' : `Следующий замер — через ${left} ${plural(left, 'день', 'дня', 'дней')}, ${fmtLong(addDays(last.d, 14))}`;
      let prog = '';
      if (w.length > 1) {
        const dw = last.w - first.w;
        const withWaist = S.body.filter(b => b.waist).sort((a, b) => a.d < b.d ? -1 : 1);
        const dwaist = withWaist.length > 1 ? withWaist[withWaist.length - 1].waist - withWaist[0].waist : null;
        prog = `<p class="small" style="margin:8px 0 0">С ${fmtLong(first.d)}: <b class="num" style="color:${dw <= 0 ? 'var(--protein)' : 'var(--warn)'}">${dw > 0 ? '+' : dw < 0 ? '−' : ''}${g1(Math.abs(dw))} кг</b>${dwaist != null ? ` · талия <b class="num">${dwaist > 0 ? '+' : dwaist < 0 ? '−' : ''}${g1(Math.abs(dwaist))} см</b>` : ''}</p>`;
      }
      if (ND()) nb.innerHTML = bodyTrio(w, dueTxt);
      else nb.innerHTML = `<h2>Последний замер · ${fmtLong(last.d)}</h2><div><span class="baseline-big">${g1(last.w)}</span> <span class="muted">кг</span></div><p class="small" style="margin:8px 0 0">${dueTxt}</p>${prog}`;
    }
    $('#bodyChart').innerHTML = `<h2>Вес</h2>` + (w.length >= 2 ? chartSvg(w) : emptyBear('График появится после второго замера.'));
    if (!$('#bDate').value) $('#bDate').value = today();
    $('#bDate').max = today();
    const all = S.body.slice().sort((a, b) => a.d < b.d ? 1 : -1);
    if (!all.length) { $('#bodyList').innerHTML = `<h2>История</h2>${emptyBear('Замеров пока нет.')}`; return; }
    const rows = all.map((b, i) => {
      const prev = all.slice(i + 1).find(x => x.w);
      const dw = b.w && prev ? b.w - prev.w : null;
      return `<tr data-act="body-entry" data-id="${b.id}"><td>${fmtShort(b.d)}</td><td>${b.w ? g1(b.w) : '—'}</td><td class="${dw == null ? '' : dw < 0 ? 'dn' : dw > 0 ? 'up' : ''}">${dw == null ? '' : (dw > 0 ? '+' : dw < 0 ? '−' : '') + g1(Math.abs(dw))}</td><td>${b.waist ? g1(b.waist) : '—'}</td><td>${b.hips ? g1(b.hips) : '—'}</td></tr>`;
    }).join('');
    $('#bodyList').innerHTML = `<h2>История</h2><div class="tablewrap"><table class="wtable"><thead><tr><th>Дата</th><th>Вес, кг</th><th>Δ</th><th>Талия</th><th>Бёдра</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function chartSvg(w) {
    const W = 330, H = 170, pl = 34, pr = 14, pt = 18, pb = 26;
    const ys = w.map(x => x.w);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const GW = ND() && S.settings.goalWeight;
    if (GW) { lo = Math.min(lo, GW); hi = Math.max(hi, GW); }
    const padY = Math.max(0.5, (hi - lo) * 0.15);
    lo = Math.floor((lo - padY) * 2) / 2; hi = Math.ceil((hi + padY) * 2) / 2;
    const t0 = toDate(w[0].d).getTime(), t1 = toDate(w[w.length - 1].d).getTime();
    const X = d => pl + (t1 === t0 ? (W - pl - pr) / 2 : (toDate(d).getTime() - t0) / (t1 - t0) * (W - pl - pr));
    const Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    const pts = w.map(x => [X(x.d), Y(x.w)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - pb} L${pts[0][0].toFixed(1)} ${H - pb} Z`;
    const range = hi - lo;
    const step = range <= 2.5 ? 0.5 : range <= 5 ? 1 : range <= 10 ? 2 : 5;
    let grid = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const y = Y(v);
      grid += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${pl - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${g1(v)}</text>`;
    }
    const lastP = pts[pts.length - 1];
    const dots = pts.map((p, i) => `<circle class="pt ${i === pts.length - 1 ? 'last' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3.2}"/>`).join('');
    const lx = Math.min(W - pr - 2, lastP[0]);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса">
      ${grid}${GW ? `<line class="goal" x1="${pl}" x2="${W - pr}" y1="${Y(GW).toFixed(1)}" y2="${Y(GW).toFixed(1)}"/><text class="gl" x="${pl + 4}" y="${(Y(GW) - 5).toFixed(1)}">цель ${g1(GW)}</text>` : ''}<path class="ar" d="${area}"/><path class="ln" d="${line}"/>${dots}
      <text class="vl" x="${lx.toFixed(1)}" y="${(lastP[1] - 10).toFixed(1)}" text-anchor="end">${g1(w[w.length - 1].w)}</text>
      <text x="${pl}" y="${H - 6}">${fmtShort(w[0].d)}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${fmtShort(w[w.length - 1].d)}</text></svg>`;
  }

  // ---------- Настройки ----------
  function renderMore() {
    const L = currentLimitEntry();
    const b = baseline();
    $('#setLimit').innerHTML = `<h2>Лимит калорий</h2>
      <div class="setrow"><label class="field"><span>Ккал в день</span><input id="sLimit" type="text" inputmode="numeric" value="${L ? L.k : ''}" placeholder="не задан"></label><button class="btn" data-act="save-limit">Сохранить</button></div>
      <p class="hint">Как считается: 5 дней ешь как обычно и записываешь всё, потом лимит = среднее минус 10%. Если вес стоит 2 недели — минус ещё 10%.</p>
      ${b.count >= 5 ? `<div class="helper"><div class="res">Среднее за последние 5 дней с записями: <b class="num" style="color:var(--ink)">${nf(b.avg)}</b> ккал → лимит <b class="num">${nf(b.limit)}</b></div><button class="btn ghost" data-act="apply-baseline">Поставить ${nf(b.limit)}</button></div>`
        : `<p class="hint">Записано полных дней: ${b.count} из 5.</p>`}
      ${L ? `<button class="linkbtn small" data-act="clear-limit" style="margin-top:6px">Убрать лимит</button>` : ''}`;

    const P = S.settings.protein, F = S.settings.fat;
    const lastW = weights().slice(-1)[0];
    $('#setProtein').innerHTML = `<h2>Белок, жиры и углеводы</h2>
      <div class="setrow"><label class="field"><span>Белок, г в день</span><input id="sProtein" type="text" inputmode="numeric" value="${P || ''}" placeholder="не задан"></label><button class="btn" data-act="save-protein">Сохранить</button></div>
      <div class="helper">
        <div class="small">Формула: 2 г белка на 1 кг сухой массы тела — это вес без жира.</div>
        <div class="fgrid">
          <label class="field"><span>Вес, кг</span><input id="hW" type="text" inputmode="decimal" value="${lastW ? String(lastW.w).replace('.', ',') : ''}" placeholder="58"></label>
          <label class="field"><span>Жир, %</span><input id="hBf" type="text" inputmode="decimal" placeholder="28"></label>
        </div>
        <div class="res" id="hRes"></div>
        <div class="tiny muted">Если процент жира неизвестен, у девушек он обычно 25–32%. Белок лучше подтягивать постепенно, не за один день.</div>
      </div>
      <div class="setrow" style="margin-top:16px"><label class="field"><span>Жиры, г в день</span><input id="sFat" type="text" inputmode="numeric" value="${F || ''}" placeholder="не задано"></label><button class="btn" data-act="save-fat">Сохранить</button></div>
      <div class="hint" id="sFatHint"></div>
      <div class="setrow" style="margin-top:16px"><label class="field"><span>Углеводы, г в день</span><input id="sCarb" type="text" inputmode="numeric" value="${S.settings.carb || ''}" placeholder="не задано"></label><button class="btn" data-act="save-carb">Сохранить</button></div>
      <div class="hint" id="sCarbHint"></div>
      <p class="hint" style="margin-top:10px">Все три цели можно не задавать — тогда в плитках на «Сегодня» показывается доля от калорий.</p>`;
    updateProteinHelper();
    updateMacroHints();

    const WG = S.settings.water;
    $('#setWater').innerHTML = `<h2>Вода</h2>
      <div class="setrow"><label class="field"><span>Цель, мл в день</span><input id="sWater" type="text" inputmode="numeric" value="${WG || ''}" placeholder="не задана"></label><button class="btn" data-act="save-water">Сохранить</button></div>
      <p class="hint" id="sWaterHint"></p>
      ${WG ? `<button class="linkbtn small" data-act="clear-water" style="margin-top:6px">Убрать цель</button>` : ''}
      <div class="field" style="margin-top:16px"><span>Объём стакана</span>${glassChips(S.settings.glass || null, 'set')}</div>
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Свой объём, мл</span><input id="sGlass" type="text" inputmode="numeric" value="${S.settings.glass && !glassList().includes(S.settings.glass) ? S.settings.glass : ''}" placeholder="например, 180"></label><button class="btn" data-act="glass-save" data-src="set">Сохранить</button></div>
      <p class="hint">«Авто» делит цель на 4–10 стаканов примерно по 250 мл. Объём можно быстро поменять и прямо в карточке воды на «Сегодня».</p>`;
    updateWaterHint();

    const sug = stepSuggest();
    $('#setAct').innerHTML = `<h2>Активность</h2>
      <div class="setrow"><label class="field"><span>Цель по шагам в день</span><input id="sStepGoal" type="text" inputmode="numeric" value="${S.settings.stepGoal || ''}" placeholder="не задана"></label><button class="btn" data-act="save-stepgoal">Сохранить</button></div>
      <p class="hint">${sug ? `В среднем за последнюю неделю — ${nf(sug.avg)} шагов. ` : ''}Шаги удобнее прибавлять по 500 в неделю, а не сразу до 10 000.</p>
      <p class="hint">Веб-приложение на iPhone не может само читать шаги из «Здоровья», поэтому число вписывается вручную на экране «Активность».</p>`;
    $('#setLook').innerHTML = lookCard();
    bearRerender();
    const sd = $('#setDetail'); if (sd) { sd.hidden = !DZ(); sd.innerHTML = DZ() ? detailCard() : ''; }
    $('#setAi').innerHTML = aiCard();
    $('#setFoods').innerHTML = `<h2>Мои продукты</h2>
      ${S.custom.length ? `<div class="list">${S.custom.map(c => `<div class="li"><div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(c.name)}</div><div class="tiny muted num">${nf(c.kcal)} ккал · Б ${g1(c.p)} · Ж ${g1(c.f)} · У ${g1(c.c)} на 100 г${c.portion ? ' · порция ' + c.portion + ' г' : ''}</div></div><button class="btn plain" style="min-height:36px;padding:6px 12px" data-act="edit-food" data-id="${c.id}">Изменить</button></div>`).join('')}</div>`
        : `<p class="small muted" style="margin:0 0 10px">Сюда попадают продукты, которых нет в базе, — например, твой любимый йогурт с цифрами с этикетки.</p>`}
      <button class="btn ghost block" data-act="add-food" style="margin-top:10px">Добавить продукт</button>`;

    $('#setBackup').innerHTML = `<h2>Резервная копия</h2>
      <p class="small muted" style="margin:0 0 8px">Записи хранятся только на этом телефоне. Если удалить приложение с экрана «Домой», они пропадут. Иногда сохраняй копию в «Файлы».</p>
      <p class="tiny muted" style="margin:0 0 12px">${S.settings.lastBackup ? 'Последняя копия: ' + fmtLong(S.settings.lastBackup) : 'Копию ещё не сохраняли.'}</p>
      <div class="btn-col"><button class="btn block" data-act="export">Сохранить копию</button><button class="btn plain block" data-act="import">Восстановить</button></div>`;

    $('#setDanger').innerHTML = `<h2>Данные</h2>${ui.delArm === 'all'
      ? `<p class="small" style="margin:0 0 10px">Удалить все записи, замеры и настройки? Это нельзя отменить.</p><div class="row-btns"><button class="btn danger" data-act="wipe-confirm">Да, удалить всё</button><button class="btn plain" data-act="wipe-cancel">Отмена</button></div>`
      : `<button class="btn danger block" data-act="wipe">Удалить все данные</button>`}`;
    setFolds();
  }
  // Разделы настроек сворачиваются: открыт только лимит, остальные — по нажатию на заголовок (запоминается)
  const SET_OPEN_KEY = 'porcia.setopen';
  function setOpenList() { try { const v = JSON.parse(localStorage.getItem(SET_OPEN_KEY)); if (Array.isArray(v)) return v; } catch (e) { /* */ } return ['setLimit']; }
  function setFolds() {
    const open = setOpenList();
    document.querySelectorAll('#v-more > .card').forEach(c => {
      const k = c.id || 'how', h = c.querySelector(':scope > h2:first-child'); if (!h) return;
      const on = open.includes(k);
      c.classList.toggle('fold', !on);
      h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', on);
    });
  }
  function setToggle(c, force) {
    const k = c.id || 'how', open = setOpenList().filter(x => x !== k), on = force != null ? force : c.classList.contains('fold');
    if (on) open.push(k);
    try { localStorage.setItem(SET_OPEN_KEY, JSON.stringify(open)); } catch (e) { /* */ }
    setFolds();
  }
  function setUnfold(id) { const c = $('#' + id); if (c && c.classList.contains('fold')) setToggle(c, true); }
  document.addEventListener('click', e => { const h = e.target.closest('#v-more > .card > h2:first-child'); if (h) setToggle(h.parentElement); });
  document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const h = e.target.closest && e.target.closest('#v-more > .card > h2:first-child'); if (h) { e.preventDefault(); setToggle(h.parentElement); } });
  // ---------- Оформление: тема и приветствие ----------
  const THEMES = [['auto', 'Как в телефоне'], ['light', 'Светлая'], ['dark', 'Тёмная']];
  function themeGet() { try { const t = localStorage.getItem('porcia.theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } }
  function themeSet(t) {
    const r = document.documentElement;
    try { if (t === 'auto') localStorage.removeItem('porcia.theme'); else localStorage.setItem('porcia.theme', t); } catch (e) { /* только до перезапуска */ }
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      const sysDark = (m.getAttribute('media') || '').includes('dark');
      m.setAttribute('content', t === 'auto' ? (sysDark ? '#100E14' : '#F5F3F8') : t === 'dark' ? '#100E14' : '#F5F3F8');
    });
    statusTint();
  }
  const G = () => window.PorciaGreet;
  function lookCard() {
    const th = themeGet(), g = G(), gp = g ? g.prefs() : {};
    const on = gp.on !== false;
    return `<h2>Оформление</h2>
      <div class="field"><span>Тема</span><div class="chips" role="group" aria-label="Тема">${THEMES.map(([k, n]) => `<button class="seg" data-act="theme" data-t="${k}" aria-pressed="${th === k}">${n}</button>`).join('')}</div></div>
      ${DZ() ? `<div style="margin-top:12px">${swRow('stars', 'Падающие звёзды', bearCfg().stars, 'Иногда пролетают за карточками')}${swRow('season', 'Погода по сезону', bearCfg().season, 'Сейчас ' + SEASON_IN[seasonNow()])}</div>` : `<div class="field" style="margin-top:16px"><span>Падающие звёзды иногда пролетают по экрану</span><div class="chips"><button class="seg" data-act="stars" data-on="1" aria-pressed="${bearCfg().stars}">Показывать</button><button class="seg" data-act="stars" data-on="0" aria-pressed="${!bearCfg().stars}">Выключить</button></div></div>
      <div class="field" style="margin-top:16px"><span>Погода по сезону — сейчас ${SEASON_IN[seasonNow()]}</span><div class="chips"><button class="seg" data-act="season" data-on="1" aria-pressed="${bearCfg().season}">Показывать</button><button class="seg" data-act="season" data-on="0" aria-pressed="${!bearCfg().season}">Выключить</button></div></div>`}
      <div class="field" style="margin-top:12px"><span>Посмотреть, как выглядит</span><div class="chips">${SEASONS.map(([k, n]) => `<button class="seg" data-act="season-try" data-s="${k}">${n}</button>`).join('')}</div></div>
      <p class="hint">Иногда, примерно раз в 3–6 минут, на фоне за карточками секунд двадцать идёт погода: осенью листья, зимой снег, весной лепестки, летом солнечные искорки. На заставке при входе — тоже.</p>
      ${g ? `${DZ() ? `<div style="margin-top:6px">${swRow('greet', 'Приветствие при открытии', on, 'Заставка, если не заходила 3 часа')}</div>` : `<div class="field" style="margin-top:16px"><span>Приветствие при открытии</span><div class="chips" role="group" aria-label="Приветствие">
        <button class="seg" data-act="greet-on" data-on="1" aria-pressed="${on}">Показывать</button><button class="seg" data-act="greet-on" data-on="0" aria-pressed="${!on}">Выключить</button></div></div>`}
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Имя в приветствии</span><input id="sGName" type="text" value="${esc(gp.name || '')}" placeholder="можно не писать" autocomplete="off" maxlength="24"></label><button class="btn" data-act="save-gname">Сохранить</button></div>
      <p class="hint">Появляется, если не заходила 3 часа и больше. Всего ${g.V.length} заставок: одна показывается два раза, потом включается следующая.</p>
      <button class="btn ghost block" data-act="greet-preview" style="margin-top:12px">Посмотреть заставки по очереди</button>` : ''}`;
  }

  function updateWaterHint() {
    const el = $('#sWaterHint'); if (!el) return;
    const raw = $('#sWater').value.trim();
    const v = num(raw);
    if (!raw) { el.textContent = S.settings.glass ? `От 200 до 5000 мл. Стакан — ${nf(S.settings.glass)} мл.` : 'От 200 до 5000 мл. Цель сама делится на 4–10 стаканов примерно по 250 мл: например, 2000 мл — это 8 стаканов.'; return; }
    if (!v || v < 200 || v > 5000) { el.textContent = 'Введи число от 200 до 5000 мл.'; return; }
    el.textContent = `Это ${waterPlanText(waterPlan(Math.round(v)))}. Отмечай их на экране «Сегодня».`;
  }
  // Подсказки: жиры — около 30% калорий (или ~0,9 г на кг веса), углеводы — то, что остаётся от лимита после белка и жиров
  const round5 = v => Math.round(v / 5) * 5;
  function fatSuggest() {
    const L = limitFor(today()), w = (weights().slice(-1)[0] || {}).w;
    if (L) return { g: round5(L * 0.3 / 9), why: `обычно это около 30% калорий: при лимите ${nf(L)} ккал` };
    if (w) return { g: round5(w * 0.9), why: `обычно около 0,9 г на кг веса: при ${g1(w)} кг` };
    return null;
  }
  function carbSuggest() {
    const L = limitFor(today()); if (!L) return null;
    const P = S.settings.protein, F = S.settings.fat || (fatSuggest() || {}).g;
    if (!P || !F) return { need: true };
    const g = round5((L - P * 4 - F * 9) / 4);
    return g > 0 ? { g, why: `что остаётся от ${nf(L)} ккал после белка ${nf(P)} г и жиров ${nf(F)} г` } : null;
  }
  function updateMacroHints() {
    const fh = $('#sFatHint'), ch = $('#sCarbHint'); if (!fh || !ch) return;
    const fs = fatSuggest(), cs = carbSuggest();
    fh.innerHTML = fs ? `<span class="small muted">Подсказка: ≈ <b class="num">${fs.g} г</b> — ${fs.why}.</span>${S.settings.fat === fs.g ? '' : ` <button class="linkbtn small" data-act="use-fat" data-g="${fs.g}">Поставить ${fs.g} г</button>`}` : '';
    ch.innerHTML = !cs ? (limitFor(today()) ? '' : '<span class="small muted">Подсказка появится, когда задан лимит калорий.</span>')
      : cs.need ? '<span class="small muted">Задай цель по белку — и подскажу, сколько остаётся на углеводы.</span>'
      : `<span class="small muted">Подсказка: ≈ <b class="num">${cs.g} г</b> — ${cs.why}.</span>${S.settings.carb === cs.g ? '' : ` <button class="linkbtn small" data-act="use-carb" data-g="${cs.g}">Поставить ${cs.g} г</button>`}`;
  }
  function updateProteinHelper() {
    const w = num($('#hW') && $('#hW').value), bf = num($('#hBf') && $('#hBf').value);
    const el = $('#hRes'); if (!el) return;
    if (!w) { el.innerHTML = '<span class="muted small">Введи вес и примерный % жира.</span>'; return; }
    const pct = bf == null ? 28 : Math.min(60, Math.max(5, bf));
    const lean = w * (1 - pct / 100);
    const goal = Math.round(lean * 2 / 5) * 5;
    el.innerHTML = `Сухая масса ≈ <span class="num">${g1(lean)}</span> кг → цель ≈ <b class="num">${goal} г</b> белка ${bf == null ? '<span class="tiny muted">(при 28% жира)</span>' : ''}
      <div style="margin-top:8px"><button class="btn ghost" data-act="use-protein" data-g="${goal}">Поставить ${goal} г</button></div>`;
  }

  // ---------- Шторка ----------
  let sheetClose = null;
  let sheetTimer = null;
  const sheetClosing = () => $('#backdrop').classList.contains('closing');
  function openSheet(html, onClose) {
    const bd = $('#backdrop'), sh = $('#sheet');
    clearTimeout(sheetTimer);
    const wasClosing = sheetClosing();
    bd.classList.remove('closing');
    sh.innerHTML = '<div class="grab"></div>' + html;
    bd.hidden = false;
    // Шторку открыли, пока прежняя ещё уезжала: запускаем появление заново
    if (wasClosing) { sh.scrollTop = 0; bd.style.animation = sh.style.animation = 'none'; void sh.offsetWidth; bd.style.animation = sh.style.animation = ''; }
    sheetClose = onClose || null;
    document.body.style.overflow = 'hidden';
    statusTint();
  }
  function closeSheet() {
    const bd = $('#backdrop');
    document.body.style.overflow = '';
    clearTimeout(sheetTimer);
    const finish = () => { bd.hidden = true; bd.classList.remove('closing'); $('#sheet').innerHTML = ''; statusTint(); };
    if (bd.hidden || calm()) finish();
    else { bd.classList.add('closing'); statusTint(); sheetTimer = setTimeout(finish, 210); }
    const f = sheetClose; sheetClose = null; if (f) f();
  }

  function howtoSheet(first) {
    openSheet(`<div class="hero">${bearSvg()}<h2>${first ? 'Привет! Это «Порция»' : 'Как это работает'}</h2></div>
      <p class="muted small" style="margin:0 0 14px">Пишешь, что съела, обычными словами — приложение считает калории и белок. А на вкладке «Активность» — тренировки и шаги.</p>
      <ol class="howto">
        <li><span><b>5 дней наблюдения.</b> Ешь как обычно и честно записывай всё. Так станет понятно, сколько ты ешь в среднем.</span></li>
        <li><span><b>Лимит = среднее минус 10%.</b> Есть можно что угодно, главное — не выше лимита. Не хочется есть — не заставляй себя.</span></li>
        <li><span><b>Замеры раз в 2 недели.</b> Вес и объёмы утром, натощак, после туалета.</span></li>
        <li><span><b>Вес стоит 2 недели — ещё минус 10%.</b> Пока вес идёт вниз, ничего не меняй. Приложение само подскажет.</span></li>
        <li><span><b>Потом белок.</b> Когда лимит станет привычным, задай цель по белку в настройках и подтягивай её постепенно.</span></li>
      </ol>
      <div class="stack">
        ${first ? `<button class="btn block" data-act="onb-start">Начать 5 дней наблюдения</button><button class="btn plain block" data-act="onb-limit">У меня уже есть лимит</button>` : `<button class="btn block" data-act="sheet-close">Понятно</button>`}
        <p class="tiny muted" style="margin:0">Совет: в Safari нажми «Поделиться» → «На экран Домой», чтобы «Порция» открывалась как приложение.</p>
      </div>`, () => { if (first) { S.settings.onboarded = true; save(); } });
  }

  function entrySheet(id) {
    const e = dayItems(ui.day).find(x => x.id === id); if (!e) return;
    const food = itemFood(e);
    const favKey = (e.fid || 'n:' + e.n) + '|' + e.g;
    const isFav = S.favs.some(f => f.key === favKey);
    const step = food && food.units && food.units.pc && !food.drink ? food.units.pc : 10;
    openSheet(`<h2>${esc(e.n)}</h2>
      <p class="muted small" style="margin:0" id="esInfo"></p>
      <div class="stack">
        ${food ? `<div class="field"><span>${food.drink ? 'Объём, мл' : 'Вес, г'}</span><div style="display:flex;gap:8px;align-items:center">
            <button class="btn plain" style="min-width:52px" data-act="es-step" data-d="${-step}" aria-label="Меньше">−</button>
            <input id="esG" type="text" inputmode="numeric" value="${e.g}" style="text-align:center;font-size:20px">
            <button class="btn plain" style="min-width:52px" data-act="es-step" data-d="${step}" aria-label="Больше">+</button></div></div>`
        : `<label class="field"><span>Калории</span><input id="esK" type="text" inputmode="numeric" value="${e.k}"></label>`}
        <div class="meals" role="group" aria-label="Приём пищи">${MEALS.map(([k, n]) => `<button class="seg" data-act="es-meal" data-m="${k}" aria-pressed="${e.m === k}">${n}</button>`).join('')}</div>
        <button class="btn block" data-act="es-save" data-id="${e.id}">Сохранить</button>
        <button class="btn ghost block" data-act="es-fav" data-id="${e.id}">${isFav ? 'Убрать из частого' : 'Закрепить в «Часто ешь»'}</button>
        <button class="btn danger block" data-act="es-del" data-id="${e.id}" id="esDel">Удалить</button>
      </div>`);
    $('#sheet').dataset.meal = e.m;
    updateEntrySheetInfo(e, food);
  }
  function updateEntrySheetInfo(e, food) {
    const info = $('#esInfo'); if (!info) return;
    if (food) {
      const g = Math.max(1, Math.round(num($('#esG').value) || 0));
      const n = C.nutrientsFor(food, g);
      info.innerHTML = `<span class="num">${nf(n.kcal)}</span> ккал · <span style="color:var(--protein)">белок ${g1(n.p)} г</span> · жиры ${g1(n.f)} г · углеводы ${g1(n.c)} г`;
    } else {
      info.textContent = 'Записано вручную';
    }
  }

  function foodSheet(prefillName, id) {
    const cf = id ? S.custom.find(c => c.id === id) : null;
    openSheet(`<h2>${cf ? 'Изменить продукт' : 'Новый продукт'}</h2>
      <p class="muted small" style="margin:0">Цифры проще всего взять с этикетки. Потом этот продукт будет находиться по названию.</p>
      <form class="stack" id="foodForm" autocomplete="off">
        <label class="field"><span>Название</span><input id="ffName" type="text" value="${esc(cf ? cf.name : prefillName || '')}" placeholder="Йогурт Греческий 2%"></label>
        <div class="meals" role="group" aria-label="На что указаны цифры">
          <button type="button" class="seg" data-act="ff-mode" data-m="100" aria-pressed="true">На 100 г</button>
          <button type="button" class="seg" data-act="ff-mode" data-m="portion" aria-pressed="false">На порцию</button>
        </div>
        <div class="fgrid">
          <label class="field"><span>Ккал</span><input id="ffK" type="text" inputmode="decimal" value="${cf ? cf.kcal : ''}"></label>
          <label class="field"><span>Белки, г</span><input id="ffP" type="text" inputmode="decimal" value="${cf ? cf.p : ''}"></label>
          <label class="field"><span>Жиры, г</span><input id="ffF" type="text" inputmode="decimal" value="${cf ? cf.f : ''}"></label>
          <label class="field"><span>Углеводы, г</span><input id="ffC" type="text" inputmode="decimal" value="${cf ? cf.c : ''}"></label>
        </div>
        <label class="field"><span>Вес порции, г <span class="tiny">(сколько записывать, если не указано)</span></span><input id="ffPortion" type="text" inputmode="numeric" value="${cf ? cf.portion || '' : ''}" placeholder="100"></label>
        <label class="field"><span>Вес 1 штуки, г <span class="tiny">(если считается штуками)</span></span><input id="ffUnit" type="text" inputmode="numeric" value="${cf && cf.unit ? cf.unit : ''}" placeholder="—"></label>
        <p class="tiny muted" id="ffNote" style="margin:0"></p>
        <button class="btn block" type="submit">Сохранить продукт</button>
        ${cf ? `<button class="btn danger block" type="button" data-act="ff-del" data-id="${cf.id}" id="ffDel">Удалить продукт</button>` : ''}
      </form>`);
    $('#sheet').dataset.ffMode = '100';
    $('#sheet').dataset.ffId = cf ? cf.id : '';
    $('#sheet').dataset.ffPrefill = cf ? '' : (prefillName || '');
  }

  function bodyEntrySheet(id) {
    const b = S.body.find(x => x.id === id); if (!b) return;
    const parts = [['Вес', b.w, 'кг'], ['Талия', b.waist, 'см'], ['Бёдра', b.hips, 'см'], ['Грудь', b.chest, 'см'], ['Живот', b.belly, 'см']].filter(p => p[1]);
    openSheet(`<h2>Замер ${fmtLong(b.d)}</h2>
      <div class="list" style="margin-top:8px">${parts.map(p => `<div class="li"><span>${p[0]}</span><b class="num">${g1(p[1])} ${p[2]}</b></div>`).join('')}</div>
      <div class="stack"><button class="btn danger block" data-act="body-del" data-id="${b.id}" id="bdDel">Удалить замер</button><button class="btn plain block" data-act="sheet-close">Закрыть</button></div>`);
  }


  // ---------- Активность ----------
  const ACT_TYPES = [
    ['strength', 'Силовая', 5], ['volley', 'Волейбол', 4], ['walk', 'Прогулка', 3.5], ['run', 'Бег', 9], ['cardio', 'Кардио', 7],
    ['bike', 'Велосипед', 7], ['yoga', 'Йога, растяжка', 2.5], ['dance', 'Танцы', 5.5], ['swim', 'Плавание', 6], ['other', 'Другое', 4],
  ];
  const ACT = {}; ACT_TYPES.forEach(([k, n, met]) => ACT[k] = { n, met });
  const INTS = [['l', 'Лёгкая'], ['m', 'Средняя'], ['h', 'Тяжёлая']];
  const INT_NAME = { l: 'лёгкая', m: 'средняя', h: 'тяжёлая' };
  const INT_K = { l: 0.8, m: 1, h: 1.25 };
  const ACT_IC = {
    strength: '<path d="M6.5 7.5v9M3.5 9.5v5M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
    volley: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-2.2 3.2-2.2 6.3 0 8.5 2.2 2.2 5.6 2.6 8.3 1.3M4.1 9.4c3.3-1.1 6.2-.2 7.9 2.6M6.6 18.6c-.2-3.3 1.6-5.6 5.4-6.6"/>',
    walk: '<path d="M8.2 4.5c1.4 0 2.2 1.5 1.9 3.3-.3 1.8-1.2 2.9-2.3 2.9S5.7 9.4 6 7.6c.2-1.8.9-3.1 2.2-3.1zM6.3 13.4l3.8.6-.4 2.5c-.2 1.2-1.1 1.9-2.2 1.7s-1.7-1.1-1.5-2.3zM15.9 8.5c1.3 0 2 1.3 1.8 3s-1 2.7-2.1 2.7-1.8-1.2-1.6-2.8.7-2.9 1.9-2.9zM13.9 17.3l3.8-.6.4 2.3c.2 1.2-.6 2.1-1.6 2.3s-2-.5-2.2-1.6z"/>',
    run: '<circle cx="14.5" cy="4.6" r="1.9"/><path d="M7.5 20.5l3.2-5 3 2.2v3.8M9 10.6l3.6-2.1 2.6 3 3.3 1M12.6 8.5l-2 6.2M5.5 11.5l3.5-.9"/>',
    cardio: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/><path d="M7.5 12.5h2.3l1.2-2.2 2 4 1.2-1.8h2.3"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7.5h5.5L18 16M10 8.5l3.5 7.5M13.5 6h2.5"/>',
    yoga: '<path d="M12 18.5c-4.2 0-7.2-2-8.2-5.2 3.2 0 5.6 1.3 8.2 5.2zm0 0c4.2 0 7.2-2 8.2-5.2-3.2 0-5.6 1.3-8.2 5.2zm0 0c-2.2-3.2-2.2-7.4 0-11.5 2.2 4.1 2.2 8.3 0 11.5z"/>',
    dance: '<path d="M9 18V6.5l10-2.2v11.5"/><circle cx="6.8" cy="18" r="2.2"/><circle cx="16.8" cy="15.8" r="2.2"/>',
    swim: '<path d="M3 15.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 19.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/><circle cx="16" cy="7" r="2"/><path d="M6 12l4-3.2 3.2 2.2"/>',
    other: '<path d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/>',
  };
  const actIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACT_IC[k] || ACT_IC.other}</svg>`;
  const GEM = '<svg class="gem" viewBox="0 0 24 24" aria-hidden="true"><use href="#gem"/></svg>';
  // Разноцветные стразики: у каждой тренировки свой цвет, он не меняется
  // С версии 1.15 расцветок 14 (добавились персик, барвинок, аква, опал, сахарная вата, шампань, орхидея, коралл).
  // Тренировки, записанные раньше, остаются со своими старыми цветами: для них — прежние 6.
  const GEM_OLD = ['', '-lilac', '-blue', '-mint', '-gold', '-ruby'];
  const GEM_COLORS = [...GEM_OLD, '-peach', '-peri', '-aqua', '-opal', '-candy', '-champ', '-orchid', '-coral'];
  function gemBase(id) {
    const s = String(id || ''); let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const born = parseInt(s.slice(0, 8), 36), from = S.settings.gemV2;
    const pal = from && born >= from ? GEM_COLORS : GEM_OLD;
    return { pal, i: h % pal.length };
  }
  // Цвет выбирается по тренировке, но не повторяет два предыдущих стразика (по порядку тренировок):
  // иначе случайно выпадало три золотых подряд. Цвет уже записанной тренировки не меняется,
  // пока не добавить или не удалить тренировку раньше неё.
  let gemMap = {}, gemSig = null;
  function gemColors() {
    const all = [];
    for (const d of Object.keys(S.act || {})) for (const w of ((S.act[d] && S.act[d].w) || [])) all.push([d, +w.t || 0, w.id]);
    all.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]);
    const sig = all.map(x => x[2]).join(',');
    if (sig === gemSig) return gemMap;
    const m = {}; let p1 = null, p2 = null;
    for (const [, , id] of all) {
      const { pal } = gemBase(id); let { i } = gemBase(id); let c = pal[i];
      for (let k = 0; k < pal.length && (c === p1 || c === p2); k++) { i = (i + 1) % pal.length; c = pal[i]; }
      m[id] = c; p2 = p1; p1 = c;
    }
    gemSig = sig; gemMap = m;
    return m;
  }
  function gemColor(id) {
    const m = gemColors();
    if (Object.prototype.hasOwnProperty.call(m, id)) return m[id];
    const { pal, i } = gemBase(id); return pal[i];
  }
  const gemOf = (id, style) => `<svg class="gem" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}><use href="#gem${gemColor(id)}"/></svg>`;
  const bearSvg = () => '<svg class="bear" viewBox="0 0 120 120" aria-hidden="true"><use href="#bear"/></svg>';
  const emptyBear = txt => `<div class="empty">${bearSvg()}<div>${txt}</div></div>`;
  const EX_NAMES = ['Приседания', 'Приседания со штангой', 'Гоблет-приседания', 'Жим ногами', 'Выпады', 'Болгарские выпады', 'Ягодичный мост', 'Ягодичный мост со штангой',
    'Румынская тяга', 'Становая тяга', 'Отведение ноги в кроссовере', 'Отведение бедра в тренажёре', 'Сведение бедра в тренажёре', 'Разгибание ног', 'Сгибание ног',
    'Гиперэкстензия', 'Тяга верхнего блока', 'Тяга горизонтального блока', 'Тяга гантели в наклоне', 'Подтягивания в гравитроне', 'Жим гантелей лёжа', 'Жим гантелей сидя',
    'Разведения гантелей в стороны', 'Сгибания на бицепс', 'Разгибания на трицепс', 'Отжимания', 'Планка', 'Скручивания', 'Подъём ног в висе', 'Подъём на носки'];

  const actDay = d => S.act[d] || { steps: null, w: [] };
  function actDayMut(d) { if (!S.act[d]) S.act[d] = { steps: null, w: [] }; if (!S.act[d].w) S.act[d].w = []; return S.act[d]; }
  function weightOn(d) { const w = weights(); let v = null; for (const x of w) if (x.d <= d) v = x.w; return v || (w.length ? w[w.length - 1].w : null); }
  function wkKcal(w, d) { const kg = weightOn(d); const min = num(w.min); if (!kg || !min) return null; const a = ACT[w.type] || ACT.other; return Math.round(a.met * (INT_K[w.int] || 1) * kg * min / 60); }
  function fmtMin(m) { if (!m) return ''; const h = Math.floor(m / 60), r = m % 60; return h ? h + ' ч' + (r ? ' ' + r + ' мин' : '') : r + ' мин'; }
  const stepsK = n => n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ru-RU') + 'к' : String(n);
  function weekStart(d) { return addDays(d, -((toDate(d).getDay() + 6) % 7)); }
  function stepSuggest() {
    const t = today(); const arr = [];
    for (let i = 1; i <= 7; i++) { const a = S.act[addDays(t, -i)]; if (a && a.steps) arr.push(a.steps); }
    if (arr.length < 3) return null;
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    return { avg: Math.round(avg), goal: Math.round((avg + 500) / 100) * 100, n: arr.length };
  }
  function wkSummary(w, d) {
    const n = (w.ex || []).length; const k = wkKcal(w, d);
    return [fmtMin(w.min), w.int ? INT_NAME[w.int] : '', n ? n + ' ' + plural(n, 'упражнение', 'упражнения', 'упражнений') : '', k ? '≈ ' + k + ' ккал' : ''].filter(Boolean).join(' · ') || 'Тренировка отмечена';
  }
  const setsTxt = sets => sets.map(s => (s.w != null && s.w !== '' ? g1(+s.w) + ' кг' : '') + ((s.w != null && s.w !== '') && s.r ? ' × ' : '') + (s.r ? s.r + (s.w != null && s.w !== '' ? '' : ' раз') : '')).filter(Boolean).join(', ');
  function lastSets(name, beforeDay, exceptId) {
    const key = String(name || '').trim().toLowerCase(); if (!key) return null;
    const days = Object.keys(S.act).filter(d => d <= beforeDay).sort().reverse();
    for (const d of days) for (const w of (S.act[d].w || []).slice().reverse()) {
      if (w.id === exceptId) continue;
      const e = (w.ex || []).find(x => x.n.trim().toLowerCase() === key);
      if (e && e.sets && e.sets.length) return { d, sets: e.sets };
    }
    return null;
  }
  function allExNames() { const set = new Set(EX_NAMES); Object.values(S.act).forEach(a => (a.w || []).forEach(w => (w.ex || []).forEach(e => set.add(e.n)))); return [...set]; }
  function wcard(w, d, withDate) {
    return `<button class="wcard" data-act="wk-open" data-day="${d}" data-id="${w.id}"><span class="wic">${actIcon(w.type)}</span><span style="min-width:0"><span class="nm">${esc((ACT[w.type] || ACT.other).n)}${withDate ? ` <span class="muted small" style="font-weight:400">· ${fmtDay(d)}</span>` : ''}</span><span class="sub">${esc(wkSummary(w, d))}</span></span></button>`;
  }

  function renderActMini() {
    const el = $('#actMini'); const a = actDay(ui.day); const G = S.settings.stepGoal;
    const ws = a.w || [];
    const parts = [];
    if (a.steps) parts.push(`шаги <b class="num">${nf(a.steps)}</b>${G ? ' / ' + nf(G) : ''}`);
    if (ws.length) parts.push(ws.map(w => (ACT[w.type] || ACT.other).n.toLowerCase()).join(', '));
    el.innerHTML = `<button class="actmini" data-act="goto-act"><span class="wic">${actIcon(ws.length ? ws[0].type : 'walk')}</span><span>${parts.length ? parts.join(' · ') : '<span class="muted">Добавить шаги или тренировку</span>'}${ws.length ? ' ' + ws.map(w => gemOf(w.id)).join('') : ''}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>`;
  }

  const SCALE_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="4"/><path d="M8.5 10a3.5 3.5 0 0 1 7 0"/><path d="M12 10l1.5-2"/></svg>';
  function renderActBody() {
    const w = weights(), last = w[w.length - 1];
    let sub;
    if (!last) sub = 'Сделай первый замер — от него считается прогресс';
    else {
      const left = 14 - daysBetween(last.d, today());
      sub = left <= 0 ? `<span class="due">Пора взвеситься</span> · последний ${g1(last.w)} кг`
        : `${g1(last.w)} кг, ${fmtLong(last.d)} · следующий через ${left} ${plural(left, 'день', 'дня', 'дней')}`;
    }
    $('#actBody').innerHTML = `<button class="actmini" data-act="goto-body"><span class="wic">${SCALE_IC}</span><span><b class="ttl">Вес и замеры</b><span class="sub">${sub}</span></span>${'<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'}</button>`;
  }

  function renderAct() {
    renderGems();
    renderActBody();
    const t = today();
    $('#actTitle').textContent = fmtDay(ui.day);
    $('#actNext').disabled = ui.day >= t;
    const ws0 = weekStart(ui.day);
    const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    let nW = 0, mins = 0, stepSum = 0, stepN = 0;
    const cells = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(ws0, i); const a = actDay(d); const n = (a.w || []).length;
      nW += n; mins += (a.w || []).reduce((s, w) => s + (num(w.min) || 0), 0);
      if (a.steps) { stepSum += a.steps; stepN++; }
      return `<button class="wday ${d === ui.day ? 'sel' : ''}" data-act="act-day" data-day="${d}" ${d > t ? 'disabled' : ''} aria-label="${fmtDay(d)}${n ? ', тренировка' : ''}"><span class="wd">${WD[i]}</span><span class="wg">${n ? gemOf(a.w[a.w.length - 1].id) + (n > 1 ? `<b class="gx">${n}</b>` : '') : '<i></i>'}</span><span class="ws num">${a.steps ? stepsK(a.steps) : '·'}</span></button>`;
    }).join('');
    const isThis = ws0 === weekStart(t);
    $('#actWeek').innerHTML = `<h2>${isThis ? 'Эта неделя' : 'Неделя с ' + fmtLong(ws0)}</h2><div class="week">${cells}</div>
      <p class="small" style="margin:12px 0 0">${nW ? `<b>${nW}</b> ${plural(nW, 'тренировка', 'тренировки', 'тренировок')}${mins ? ' · ' + fmtMin(mins) : ''}` : 'Тренировок пока нет'}${stepN ? ` · в среднем <b class="num">${nf(stepSum / stepN)}</b> шагов` : ''}</p>
      <p class="tiny muted" style="margin:4px 0 0">За каждую тренировку — стразик в шкатулку.</p>`;

    const a = actDay(ui.day); const G = S.settings.stepGoal; const st = a.steps || 0;
    const sug = stepSuggest();
    let goalBlock = '';
    if (!G && sug) goalBlock = `<div class="helper"><div class="small">В среднем за неделю — <b class="num">${nf(sug.avg)}</b> шагов. Удобно прибавлять по 500 в неделю.</div><button class="btn ghost" data-act="step-goal-apply" data-g="${sug.goal}">Цель: ${nf(sug.goal)} шагов</button></div>`;
    else if (G && sug && sug.avg >= G && ui.day === t) goalBlock = `<div class="helper"><div class="small">Ты стабильно проходишь цель — в среднем <b class="num">${nf(sug.avg)}</b>. Можно прибавить 500.</div><button class="btn ghost" data-act="step-goal-apply" data-g="${G + 500}">Новая цель: ${nf(G + 500)}</button></div>`;
    $('#actSteps').innerHTML = `<h2>Шаги</h2>
      <div><span class="baseline-big">${a.steps ? nf(a.steps) : '—'}</span>${G ? ` <span class="muted">из ${nf(G)}</span>` : ''}${G && st >= G ? ' ' + GEM : ''}</div>
      ${G ? `<div class="bar accent" style="margin-top:10px"><i style="width:${Math.min(100, st / G * 100)}%"></i></div>` : ''}
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Шагов за ${ui.day === t ? 'сегодня' : fmtLong(ui.day)}</span><input id="stepsIn" type="text" inputmode="numeric" value="${a.steps || ''}" placeholder="например, 7500"></label><button class="btn" data-act="steps-save">Сохранить</button></div>
      ${a.steps ? '' : '<p class="hint">Число — из приложения «Здоровье» или с часов. Удобно вписывать вечером.</p>'}
      ${goalBlock}`;

    $('#actAdd').innerHTML = `<h2>Добавить тренировку</h2><div class="types">${ACT_TYPES.map(([k, n]) => `<button class="tchip" data-act="wk-new" data-type="${k}">${actIcon(k)}<span>${n}</span></button>`).join('')}</div>
      <p class="hint">Можно просто отметить факт. Для силовой — по желанию упражнения и веса.</p>`;

    const list = a.w || [];
    $('#actList').innerHTML = `<h2>Тренировки · ${ui.day === t ? 'сегодня' : fmtLong(ui.day)}</h2>` +
      (list.length ? `<div class="wlist">${list.map(w => wcard(w, ui.day)).join('')}</div>` : emptyBear('В этот день тренировок нет. Прогулка тоже считается!'));

    const recent = [];
    Object.keys(S.act).filter(d => d !== ui.day).sort().reverse().forEach(d => (S.act[d].w || []).slice().reverse().forEach(w => recent.push([d, w])));
    $('#actRecent').hidden = !recent.length;
    $('#actRecent').innerHTML = recent.length ? `<h2>Недавние</h2><div class="wlist">${recent.slice(0, 8).map(([d, w]) => wcard(w, d, true)).join('')}</div>` : '';
  }

  // Редактор тренировки
  let wk = null;
  function wkSheet(focusSel) {
    const scroll = $('#sheet').scrollTop;
    const isStr = wk.type === 'strength';
    const k = wkKcal(wk, wk.d);
    const mins = [20, 30, 45, 60, 90];
    const exHtml = isStr ? `<div class="exs"><div class="exh"><b>Упражнения</b><span class="tiny muted">по желанию</span></div>
      ${wk.ex.map((e, i) => {
        const L = lastSets(e.n, wk.d, wk.id);
        return `<div class="ex">
          <div class="exrow"><input class="exname" list="exList" data-ex="${i}" value="${esc(e.n)}" placeholder="Например, приседания" autocapitalize="sentences"><button class="xbtn" data-act="wk-ex-del" data-ex="${i}" aria-label="Убрать упражнение">${IC.x}</button></div>
          <div class="lasthint" data-hint="${i}" data-key="${esc(String(e.n || '').trim().toLowerCase())}">${L ? `В прошлый раз, ${fmtLong(L.d)}: ${esc(setsTxt(L.sets))} <button class="linkbtn" data-act="wk-ex-copy" data-ex="${i}">Повторить</button>` : ''}</div>
          ${e.sets.map((s, j) => `<div class="set"><span class="sn">${j + 1}</span><input class="sw" data-ex="${i}" data-set="${j}" inputmode="decimal" value="${esc(s.w)}" placeholder="кг" aria-label="Вес, подход ${j + 1}"><span class="x">×</span><input class="sr" data-ex="${i}" data-set="${j}" inputmode="numeric" value="${esc(s.r)}" placeholder="раз" aria-label="Повторы, подход ${j + 1}"><button class="xbtn" data-act="wk-set-del" data-ex="${i}" data-set="${j}" aria-label="Убрать подход">${IC.x}</button></div>`).join('')}
          <div><button class="linkbtn small" data-act="wk-set-add" data-ex="${i}">+ подход</button></div></div>`;
      }).join('')}
      <button class="btn ghost block" data-act="wk-ex-add">+ упражнение</button>
      <datalist id="exList">${allExNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>` : '';
    openSheet(`<h2>${wk.id ? 'Изменить тренировку' : 'Новая тренировка'}</h2><p class="muted small" style="margin:0">${fmtDay(wk.d)}</p>
      <div class="stack">
        <div class="types sm" role="group" aria-label="Вид">${ACT_TYPES.map(([kk, n]) => `<button class="tchip" data-act="wk-type" data-type="${kk}" aria-pressed="${wk.type === kk}">${actIcon(kk)}<span>${n}</span></button>`).join('')}</div>
        <div class="field"><span>Длительность</span><div class="chips">${mins.map(m => `<button class="seg" data-act="wk-min" data-m="${m}" aria-pressed="${+wk.min === m}">${m} мин</button>`).join('')}<input id="wkMin" type="text" inputmode="numeric" value="${wk.min && !mins.includes(+wk.min) ? esc(wk.min) : ''}" placeholder="другое" aria-label="Минуты"></div></div>
        <div class="field"><span>Интенсивность</span><div class="chips">${INTS.map(([kk, n]) => `<button class="seg" data-act="wk-int" data-i="${kk}" aria-pressed="${wk.int === kk}">${n}</button>`).join('')}</div></div>
        ${exHtml}
        <label class="field"><span>Заметка</span><textarea id="wkNote" rows="2" style="min-height:56px" placeholder="Например: с тренером, ноги + ягодицы">${esc(wk.note)}</textarea></label>
        <p class="tiny muted" id="wkKcal" style="margin:0">${k ? `Примерный расход ≈ ${k} ккал. К лимиту еды он не прибавляется.` : 'Укажи длительность и вес в «Весе», и я примерно посчитаю расход. К лимиту еды он не прибавляется.'}</p>
        <button class="btn block" data-act="wk-save">${wk.id ? 'Сохранить' : 'Записать тренировку'}</button>
        ${wk.id ? `<button class="btn plain block" data-act="sheet-close">Отмена</button>` : ''}
      </div>`, () => { wk = null; });
    $('#sheet').scrollTop = scroll;
    if (focusSel) { const f = $('#sheet').querySelector(focusSel); if (f) f.focus(); }
  }
  function wkFromRecord(w, d) {
    return { id: w.id, d, type: w.type, min: w.min ? String(w.min) : '', int: w.int || 'm', note: w.note || '',
      ex: (w.ex || []).map(e => ({ n: e.n, sets: (e.sets.length ? e.sets : [{}]).map(s => ({ w: s.w != null ? String(s.w).replace('.', ',') : '', r: s.r != null ? String(s.r) : '' })) })) };
  }
  function wkDetail(d, id) {
    const w = actDay(d).w.find(x => x.id === id); if (!w) return;
    openSheet(`<div class="hero"><span class="wic" style="width:52px;height:52px;border-radius:16px">${actIcon(w.type)}</span><div><h2>${esc((ACT[w.type] || ACT.other).n)}</h2><div class="muted small">${fmtDay(d)}</div></div></div>
      <p class="small" style="margin:8px 0 0">${esc(wkSummary(w, d))}</p>
      ${w.ex && w.ex.length ? `<div class="list" style="margin-top:10px">${w.ex.map(e => `<div class="exview"><b>${esc(e.n)}</b><span class="small muted">${esc(setsTxt(e.sets)) || 'без подходов'}</span></div>`).join('')}</div>` : ''}
      ${w.note ? `<p class="small" style="margin:10px 0 0">${esc(w.note)}</p>` : ''}
      <div class="stack">
        <button class="btn block" data-act="wk-edit" data-day="${d}" data-id="${w.id}">Изменить</button>
        ${d !== today() ? `<button class="btn ghost block" data-act="wk-repeat" data-day="${d}" data-id="${w.id}">Повторить сегодня</button>` : ''}
        <button class="btn danger block" data-act="wk-del" data-day="${d}" data-id="${w.id}">Удалить</button>
      </div>`);
  }


  // ---------- Фото → Claude ----------
  const AI_STORE = 'porcia.ai'; // ключ хранится отдельно и не попадает в резервную копию
  const AI_MODELS = [['claude-haiku-5-5', 'Быстрее и дешевле'], ['claude-sonnet-5-5', 'Точнее']];
  function aiCfg() { try { return JSON.parse(localStorage.getItem(AI_STORE)) || {}; } catch (e) { return {}; } }
  function aiSave(c) { try { localStorage.setItem(AI_STORE, JSON.stringify(c)); return true; } catch (e) { return false; } }
  const PHOTO_PROMPT = `На фото еда или напиток. Определи каждое отдельное блюдо или продукт, оцени вес порции в граммах (для напитков — в мл) и КБЖУ для всей этой порции.
Правила:
- Учитывай масло, соусы, заправки, сыр и сладкие добавки, если их видно или они обычно есть в таком блюде.
- Если на фото упаковка с этикеткой, бери цифры с неё.
- Если одинаковых штук много (котлеты, пельмени, конфеты), запиши их одной строкой с общим весом и укажи количество в названии: «Тефтели, ~12 шт».
- Названия короткие, по-русски, с заглавной буквы: «Гречка отварная», «Куриная котлета».
- Если еды на фото нет, верни пустой список.
Запиши результат через инструмент record_food.`;
  // Ответ в строгой структуре: Claude «вызывает инструмент», и данные приходят готовым объектом, а не текстом
  const FOOD_TOOL = {
    name: 'record_food',
    description: 'Записать еду, распознанную на фото, с оценкой порций и КБЖУ.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Короткое название блюда по-русски' },
              grams: { type: 'number', description: 'Вес порции в граммах (для напитков — в мл)' },
              kcal: { type: 'number', description: 'Калории на всю порцию' },
              protein: { type: 'number', description: 'Белки на всю порцию, г' },
              fat: { type: 'number', description: 'Жиры на всю порцию, г' },
              carbs: { type: 'number', description: 'Углеводы на всю порцию, г' },
            },
            required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carbs'],
          },
        },
        note: { type: 'string', description: 'Коротко, в чём не уверен; пустая строка, если всё ясно' },
      },
      required: ['items'],
    },
  };

  async function claudeRequest(cfg, body) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(Object.assign({ model: cfg.model || AI_MODELS[0][0] }, body)),
      });
    } catch (e) { throw new Error('Нет связи с Claude. Проверь интернет и попробуй ещё раз.'); }
    let data = null; try { data = await res.json(); } catch (e) { /* пустой ответ */ }
    if (!res.ok) {
      const m = (data && data.error && data.error.message) || '';
      if (res.status === 401) throw new Error('Ключ не подошёл. Проверь его в настройках.');
      if (res.status === 403) throw new Error('У этого ключа нет доступа к Claude API.' + (m ? ' (' + m + ')' : ''));
      if (res.status === 429) throw new Error('Слишком много запросов. Попробуй через минуту.');
      if (/credit|balance/i.test(m)) throw new Error('На балансе Claude API закончились деньги.');
      if (res.status === 404 || /model/i.test(m)) throw new Error('Эта модель недоступна для ключа. Выбери другую в настройках.');
      if (res.status >= 500) throw new Error('Claude сейчас перегружен. Попробуй чуть позже.');
      throw new Error('Claude вернул ошибку' + (m ? ': ' + m : ' ' + res.status));
    }
    return data || {};
  }
  const textOf = data => (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  async function claudeCall(cfg, content, maxTokens) {
    return textOf(await claudeRequest(cfg, { max_tokens: maxTokens, messages: [{ role: 'user', content }] }));
  }
  async function claudeFood(cfg, b64) {
    const data = await claudeRequest(cfg, {
      max_tokens: 4096,
      tools: [FOOD_TOOL],
      tool_choice: { type: 'tool', name: 'record_food' },
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: PHOTO_PROMPT }] }],
    });
    const use = (data.content || []).find(b => b.type === 'tool_use' && b.input);
    if (use) return { obj: use.input, raw: JSON.stringify(use.input), stop: data.stop_reason };
    return { obj: null, raw: textOf(data), stop: data.stop_reason };
  }

  function downscale(file, max, q) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', q).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть фото. Попробуй другое.')); };
      img.src = url;
    });
  }

  const r1 = n => Math.round(n * 10) / 10;
  class FormatError extends Error {}
  // Запасной разбор, если вместо структуры пришёл текст: блок ```json, затем любой кусок от «{» до «}»
  function jsonFromText(txt) {
    const tries = [];
    const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) tries.push(fence[1]);
    const b = txt.lastIndexOf('}');
    for (let a = txt.indexOf('{'); a >= 0 && a < b; a = txt.indexOf('{', a + 1)) tries.push(txt.slice(a, b + 1));
    for (const t of tries) {
      for (const v of [t, t.replace(/,\s*([}\]])/g, '$1')]) {
        try { const o = JSON.parse(v); if (o && (Array.isArray(o.items) || Array.isArray(o))) return Array.isArray(o) ? { items: o } : o; } catch (e) { /* дальше */ }
      }
    }
    return null;
  }
  const numOf = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
  function parseAi(res) {
    let o = res.obj;
    if (o && !Array.isArray(o.items) && typeof o.items === 'string') { try { o = Object.assign({}, o, { items: JSON.parse(o.items) }); } catch (e) { /* ниже */ } }
    if (!o || !Array.isArray(o.items)) o = jsonFromText(res.raw || '');
    if (!o) {
      const err = new FormatError(res.stop === 'max_tokens' ? 'На фото слишком много всего — ответ не поместился. Сними поближе одну тарелку.'
        : !/[{]/.test(res.raw || '') ? 'Claude не смог разобрать это фото. Попробуй снять ближе и при хорошем свете.' : 'Claude ответил не в том формате. Попробуй ещё раз.');
      err.raw = res.raw; throw err;
    }
    const items = o.items.map(x => {
      const g = Math.max(1, Math.round(numOf(x.grams || x.weight) || 100));
      const k = Math.max(0, numOf(x.kcal || x.calories)), P = Math.max(0, numOf(x.protein)), F = Math.max(0, numOf(x.fat)), Cc = Math.max(0, numOf(x.carbs || x.carbohydrates));
      const name = String(x.name || 'Блюдо').trim().slice(0, 60);
      return { fid: null, ai: true, ph: { k: k / g * 100, p: P / g * 100, f: F / g * 100, c: Cc / g * 100 },
        name: name.charAt(0).toUpperCase() + name.slice(1), grams: g, kcal: Math.round(k), p: r1(P), f: r1(F), c: r1(Cc), label: g + ' г · по фото', src: 'фото' };
    });
    return { items, note: String(o.note || '').trim().slice(0, 200) };
  }

  async function analyzePhoto() {
    const ph = ui.photo; if (!ph) return;
    const cfg = aiCfg();
    ph.state = 'loading'; ph.msg = ''; ph.raw = ''; renderPreview();
    try {
      if (!ph.b64) ph.b64 = await downscale(ph.file, 1024, 0.82);
      const res = await claudeFood(cfg, ph.b64);
      if (ui.photo !== ph) return; // фото уже убрали
      const r = parseAi(res);
      ph.state = 'done'; ph.note = r.note;
      ui.photoItems = r.items;
      if (!r.items.length) { ph.state = 'error'; ph.msg = 'Еды на фото не нашлось.'; }
    } catch (e) {
      if (ui.photo !== ph) return;
      ph.state = 'error'; ph.msg = e.message || 'Что-то пошло не так.'; ph.raw = e.raw || '';
    }
    reparse();
  }

  function photoRow() {
    const ph = ui.photo; if (!ph) return '';
    const body = ph.state === 'loading' ? '<span class="spin" aria-hidden="true"></span> Claude смотрит на фото…'
      : ph.state === 'error' ? `<span style="color:var(--warn)">${esc(ph.msg)}</span> <button class="linkbtn small" data-act="photo-retry">Ещё раз</button>${ph.raw ? `<details class="tiny muted" style="margin-top:4px"><summary>Подробнее</summary><div style="overflow-wrap:anywhere;margin-top:4px">Ответ Claude: ${esc(String(ph.raw).slice(0, 400))}</div></details>` : ''}`
      : `Распознано по фото${ph.note ? ': ' + esc(ph.note) : ''}. Проверь граммы перед записью.`;
    return `<div class="phrow"><img src="${ph.url}" alt="Фото еды"><div class="small" style="min-width:0">${body}</div><button class="xbtn" data-act="photo-del" aria-label="Убрать фото">${IC.x}</button></div>`;
  }

  function aiCard() {
    const cfg = aiCfg();
    const model = cfg.model || AI_MODELS[0][0];
    return `<h2>Распознавание по фото</h2>
      <p class="small muted" style="margin:0 0 12px">Фото еды отправляется в Claude, он оценивает граммы и КБЖУ. Нужен ключ Claude API — он хранится только на этом телефоне и не попадает в резервную копию.</p>
      <label class="field"><span>${cfg.key ? 'Ключ сохранён: ' + esc(cfg.key.slice(0, 10)) + '…' + esc(cfg.key.slice(-4)) + '. Чтобы заменить — вставь новый' : 'Ключ Claude API'}</span><input id="aiKey" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <div class="field" style="margin-top:10px"><span>Модель</span><div class="chips">${AI_MODELS.map(([id, n]) => `<button class="seg" data-act="ai-model" data-m="${id}" aria-pressed="${model === id}">${n}</button>`).join('')}</div></div>
      <div class="row-btns" style="margin-top:12px"><button class="btn" data-act="ai-save">Сохранить ключ</button>${cfg.key ? '<button class="btn plain" data-act="ai-test">Проверить</button><button class="btn danger" data-act="ai-clear">Удалить</button>' : ''}</div>
      <p class="hint" id="aiRes"></p>
      <p class="tiny muted" style="margin:8px 0 0">Каждое фото — платный запрос к Claude API, обычно меньше цента. Оценка по фото примерная.</p>`;
  }


  // ---------- Шкатулка со стразиками ----------
  // в шкатулке — стразики за тренировки и за привычки
  function gemsTotal() { return Object.values(S.act).reduce((s, a) => s + ((a && a.w) || []).length, 0) + habitGems(); }
  function gemsWeek(d) { const ws = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) n += actDay(addDays(ws, i)).w.length; return n + habitGems(ws, addDays(ws, 6)); }
  const gemWord = n => plural(n, 'стразик', 'стразика', 'стразиков');
  function renderGems() {
    const total = gemsTotal(); const wk = gemsWeek(today());
    const ws0 = weekStart(today()), gemsHtml = [];
    for (let i = 0; i < 7; i++) actDay(addDays(ws0, i)).w.forEach(w => gemsHtml.push(gemOf(w.id)));
    habitGemColors(ws0, addDays(ws0, 6)).forEach(c => gemsHtml.push(gemC(c)));
    const shown = Math.min(gemsHtml.length, 14);
    $('#actGems').innerHTML = `<div class="gembox"><svg class="gem gembig" viewBox="0 0 24 24" aria-hidden="true"><use href="#gem"/></svg>
      <div><div><span class="baseline-big">${total}</span> <span class="muted">${gemWord(total)} в шкатулке</span></div>
      <div class="small muted">${wk ? `На этой неделе: +${wk}` : 'За тренировки и привычки — стразики'}</div></div></div>
      ${shown ? `<div class="gemrow" aria-hidden="true">${gemsHtml.slice(0, shown).join('')}${gemsHtml.length > shown ? `<span class="small muted">+${gemsHtml.length - shown}</span>` : ''}</div>` : ''}`;
  }
  function gemToast(id) { const n = gemsTotal(); toast(`+1 стразик · всего ${n}`, null, id || true); }

  // ---------- Привычки ----------
  // S.habits — список привычек; S.hlog[id][день] — отметка (true или число: раза / минуты); S.htime[id][день] — час отметки.
  // Вода и шаги не хранятся отдельно: привычка «отмечается сама», когда выполнена цель в карточке воды или шагов.
  // Удалённая привычка только прячется (archived), чтобы её стразики остались в шкатулке.
  const HB_TOD = [['morning', 'Утро'], ['day', 'День'], ['evening', 'Вечер'], ['any', 'В любое время']];
  const HB_COL = { '': '#F3A9D0', '-lilac': '#C6A6FF', '-blue': '#94C8F5', '-mint': '#86DDBE', '-gold': '#F6CC62', '-ruby': '#F38FA4', '-peach': '#FFC4A8', '-peri': '#B8C1FF', '-aqua': '#9EE6E0', '-opal': '#E6DCFF', '-candy': '#E8C6FF', '-champ': '#F2D7B6', '-orchid': '#DDB1F4', '-coral': '#FFB3A7' };
  const HB_WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], HB_WDs = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const HB_WDL = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const HB_MON = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const HB_MONL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const gemC = (c, style) => `<svg class="gem" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}><use href="#gem${c || ''}"/></svg>`;
  const hbChev = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  function hbStore() { if (!Array.isArray(S.habits)) S.habits = []; if (!S.hlog || typeof S.hlog !== 'object') S.hlog = {}; if (!S.htime || typeof S.htime !== 'object') S.htime = {}; }
  function hbList() { hbStore(); return S.habits.filter(h => !h.archived); }
  function hbFind(id) { hbStore(); return S.habits.find(h => h.id === id); }
  function hbLog(h) { hbStore(); return S.hlog[h.id] || (S.hlog[h.id] = {}); }
  const hbWd = d => (toDate(d).getDay() + 6) % 7;
  function hbFull(h) { return h.type === 'count' || h.type === 'timer' ? h.target : true; }
  function hbAutoGoal(h) { if (h.src === 'steps') return S.settings.stepGoal || 0; const p = waterPlan(); return p ? p.goal : 0; }
  function hbVal(h, d) { if (h.type === 'auto') return h.src === 'steps' ? (actDay(d).steps || 0) : waterMl(d); return (S.hlog[h.id] || {})[d]; }
  function hbDone(h, d) { const v = hbVal(h, d); if (h.type === 'auto') { const g = hbAutoGoal(h); return !!g && v >= g; } if (h.type === 'count' || h.type === 'timer') return (+v || 0) >= h.target; return !!v; }
  function hbFrac(h, d) { const v = +hbVal(h, d) || 0; if (h.type === 'auto') { const g = hbAutoGoal(h); return g ? Math.min(1, v / g) : 0; } if (h.type === 'count' || h.type === 'timer') return Math.min(1, v / h.target); return hbVal(h, d) ? 1 : 0; }
  function hbWeekCount(h, d) { const ws = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) { const x = addDays(ws, i); if (x <= d && hbDone(h, x)) n++; } return n; }
  function hbPaused(h, d) { return !!(h.paused && h.paused <= d); }
  function hbDue(h, d, past) {
    if (d < h.start || hbPaused(h, d)) return false;
    const s = h.sched;
    if (s.k === 'days') return (s.days || []).includes(hbWd(d));
    if (s.k === 'every') { const n = daysBetween(s.from || h.start, d); return n >= 0 && n % s.n === 0; }
    if (s.k === 'weekly') return past ? true : hbWeekCount(h, addDays(d, -1)) < s.n || hbDone(h, d);
    return true;
  }
  // что показывать в выбранный день: для «N раз в неделю» сегодня прячем, если план недели уже выполнен
  function hbDueOn(d) { const t = today(); return hbList().filter(h => hbDue(h, d, d !== t) && !(d === t && h.sched.k === 'weekly' && hbWeekCount(h, addDays(t, -1)) >= h.sched.n && !hbDone(h, d))); }
  function hbSchedText(h) {
    const s = h.sched;
    if (s.k === 'days') return s.days.length === 7 ? 'каждый день' : s.days.map(i => HB_WDs[i]).join(', ');
    if (s.k === 'weekly') return `${s.n} ${plural(s.n, 'раз', 'раза', 'раз')} в неделю`;
    if (s.k === 'every') return s.n === 2 ? 'через день' : `раз в ${s.n} ${plural(s.n, 'день', 'дня', 'дней')}`;
    return 'каждый день';
  }
  function hbTypeText(h) {
    if (h.type === 'count') return `${h.target} ${h.unit || ''}`.trim();
    if (h.type === 'timer') return `${h.target} мин`;
    if (h.type === 'quit') return 'держаться';
    if (h.type === 'auto') return 'отмечается сама';
    return '';
  }
  // «Сила привычки», как в Loop: каждый плановый день немного сдвигает её к 100 % или к 0 — один пропуск не обнуляет
  function hbStrength(h) {
    const t = today();
    if (h.sched.k === 'weekly') { let s = 0; const ws = weekStart(t); for (let w = 12; w >= 1; w--) { const end = addDays(ws, -7 * w + 6); if (end < h.start) continue; s = s * .75 + .25 * Math.min(1, hbWeekCount(h, end) / h.sched.n); } s = s * .85 + .15 * Math.min(1, hbWeekCount(h, t) / h.sched.n); return Math.round(s * 100); }
    let s = 0;
    for (let i = 90; i >= 0; i--) { const d = addDays(t, -i); if (i === 0 && !hbDone(h, d)) continue; if (!hbDue(h, d, true)) continue; s = s * .9 + .1 * hbFrac(h, d); }
    return Math.round(s * 100);
  }
  function hbWeeks(h, best) {
    const t = today(), ws = weekStart(t); let run = hbWeekCount(h, t) >= h.sched.n ? 1 : 0, top = run;
    for (let w = 1; w < 60; w++) { const end = addDays(ws, -7 * w + 6); if (end < h.start) break; if (hbWeekCount(h, end) >= h.sched.n) { run++; top = Math.max(top, run); } else { if (!best) return run; run = 0; } }
    return best ? top : run;
  }
  function hbStreak(h) {
    if (h.sched.k === 'weekly') return hbWeeks(h, false);
    const t = today(); let n = 0;
    for (let i = 0; i < 400; i++) { const d = addDays(t, -i); if (d < h.start) break; if (!hbDue(h, d, true)) continue; if (hbDone(h, d)) n++; else if (i === 0) continue; else break; }
    return n;
  }
  function hbBest(h) {
    if (h.sched.k === 'weekly') return hbWeeks(h, true);
    const t = today(), n0 = Math.min(400, Math.max(0, daysBetween(h.start, t))); let run = 0, top = 0;
    for (let i = n0; i >= 0; i--) { const d = addDays(t, -i); if (!hbDue(h, d, true)) continue; if (hbDone(h, d)) { run++; top = Math.max(top, run); } else if (i > 0) run = 0; }
    return top;
  }
  const hbUnit = h => h.sched.k === 'weekly' ? 'нед.' : 'дн.';
  function hbDoneDays(h) {
    if (h.type === 'auto') return Object.keys(h.src === 'steps' ? (S.act || {}) : (S.water || {})).filter(d => d >= h.start && hbDone(h, d));
    return Object.keys(S.hlog[h.id] || {}).filter(d => hbDone(h, d));
  }
  // стразики за привычки: по одному за каждое выполнение и бонус за выполненный план недели
  function habitGems(from, to) {
    hbStore(); let n = 0;
    S.habits.forEach(h => {
      const days = hbDoneDays(h).filter(d => (!from || d >= from) && (!to || d <= to)); n += days.length;
      if (h.sched.k === 'weekly') { const wk = {}; days.forEach(d => { const w = weekStart(d); wk[w] = (wk[w] || 0) + 1; }); n += Object.values(wk).filter(c => c >= h.sched.n).length; }
    });
    return n;
  }
  function habitGemColors(from, to) { const out = []; hbStore(); S.habits.forEach(h => hbDoneDays(h).forEach(d => { if (d >= from && d <= to) out.push(h.c); })); return out; }

  function hbFly(from, c) {
    const target = $('#habBox');
    if (!from || !from.isConnected || !target || calm()) return;
    const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
    const el = document.createElement('div'); el.className = 'hab-fly'; el.innerHTML = gemC(c, 'width:22px;height:22px');
    el.style.left = (a.left + a.width / 2 - 11) + 'px'; el.style.top = (a.top + a.height / 2 - 11) + 'px';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.8)`; el.style.opacity = '.4'; }));
    setTimeout(() => { el.remove(); target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); }, 700);
  }
  // отметка за день: стразик за выполнение, бонус за недельный план
  function hbSet(h, d, v, from) {
    const was = hbDone(h, d), we = addDays(weekStart(d), 6), wasWeek = h.sched.k === 'weekly' && hbWeekCount(h, we) >= h.sched.n;
    const L = hbLog(h);
    if (v === 0 || v === false || v == null) { delete L[d]; if (S.htime[h.id]) delete S.htime[h.id][d]; }
    else { L[d] = v; if (!S.htime[h.id]) S.htime[h.id] = {}; if (S.htime[h.id][d] == null) S.htime[h.id][d] = d === today() ? new Date().getHours() : ({ morning: 9, day: 14, evening: 20, any: 13 })[h.tod] || 13; }
    save();
    const now = hbDone(h, d);
    if (!was && now) { hbFly(from, h.c); toast(`+1 стразик · ${h.name}`, null, { c: h.c }); }
    if (h.sched.k === 'weekly' && !wasWeek && hbWeekCount(h, we) >= h.sched.n) setTimeout(() => toast(`Бонус за план недели · ${h.name}`, null, { c: '-gold' }), 1100);
    render();
  }

  // ---------- Вкладка «Привычки» ----------
  function hbRingSvg(f, size, r, w, color) { const C = 2 * Math.PI * r; return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${w}"/>${f > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || 'var(--accent)'}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.min(1, f))).toFixed(1)}"/>` : ''}</svg>`; }
  function hbDayFrac(d) { const due = hbDueOn(d); return due.length ? due.reduce((s, h) => s + hbFrac(h, d), 0) / due.length : 0; }
  function renderHabits() {
    hbStore();
    const t = today();
    if (ui.hbFollow !== false || !ui.hbDay || ui.hbDay > t) ui.hbDay = t;
    if (!ui.hbMode) ui.hbMode = 'day';
    const list = hbList();
    // в начале недели отчёт открывается на прошлой (полной) — если привычки тогда уже были
    if (ui.hbRep == null) ui.hbRep = hbWd(t) <= 2 && list.some(h => h.start < weekStart(t)) ? -1 : 0;
    $('#habBox').innerHTML = `${gemC('')}<span>${gemsTotal()}</span>`;
    const has = list.length > 0;
    $('#habTabs').hidden = !has;
    $('#habTabs').innerHTML = [['day', 'День'], ['week', 'Неделя'], ['year', 'Год']].map(([k, n]) => `<button data-act="hb-mode" data-m="${k}" aria-pressed="${ui.hbMode === k}">${n}</button>`).join('');
    const wk = $('#habWeek'); wk.hidden = !has || ui.hbMode !== 'day';
    if (!wk.hidden) {
      const ws = weekStart(ui.hbDay);
      wk.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(ws, i), f = d > t ? 0 : hbDayFrac(d);
        return `<button class="wsd${d === ui.hbDay ? ' sel' : ''}${d === t ? ' now' : ''}" data-act="hb-day" data-day="${d}" ${d > t ? 'disabled' : ''} aria-label="${fmtDay(d)}"><span class="wd">${HB_WD[i]}</span><span class="wr">${hbRingSvg(f, 32, 13, 3)}<b class="num">${toDate(d).getDate()}</b></span></button>`; }).join('');
    }
    const body = $('#habBody');
    if (!has) { body.innerHTML = hbEmpty(); return; }
    body.innerHTML = ui.hbMode === 'week' ? hbWeekHTML() : ui.hbMode === 'year' ? hbYearHTML() : hbDayHTML();
  }
  function hbTplList() {
    const L = HB_TPL.slice();
    if (waterPlan()) L.unshift({ name: 'Вода', emo: '💧', c: '-blue', type: 'auto', src: 'water', sched: { k: 'daily' }, tod: 'any' });
    if (S.settings.stepGoal) L.splice(1, 0, { name: 'Шаги', emo: '👟', c: '-aqua', type: 'auto', src: 'steps', sched: { k: 'daily' }, tod: 'any' });
    return L;
  }
  function hbEmpty() {
    return `<div class="card hab-empty">${bearSvg()}<h2>Здесь будут твои привычки</h2>
      <p class="small muted" style="margin:0">Отмечай их каждый день — за каждую отметку стразик в шкатулку, а за неделю по плану ещё бонусный.</p>
      <div class="hab-tpls">${hbTplList().slice(0, 7).map((p, i) => `<button class="hab-tpl" data-act="hb-quick" data-v="${i}">${p.emo} ${esc(p.name)}</button>`).join('')}</div>
      <button class="btn block" style="margin-top:8px" data-act="hb-new">Своя привычка</button></div>`;
  }
  function hbRow(h, d) {
    const f = hbFrac(h, d), done = hbDone(h, d), v = +hbVal(h, d) || 0, t = today();
    let right = '';
    if (h.type === 'check' || h.type === 'quit') right = `<span class="chk">${done ? hbChev('M5 12.5l4.5 4.5L19 7.5') : ''}</span>`;
    else if (h.type === 'count') right = `<span class="v num">${v}/${h.target}</span>`;
    else if (h.type === 'timer') right = `<span class="v num">${done ? '✓ ' + h.target : v ? v + '/' + h.target : '▶ ' + h.target} мин</span>`;
    else if (h.type === 'auto') right = `<span class="v num">${done ? '✓' : h.src === 'steps' ? nf(v) : nf(v) + ' мл'}</span>`;
    const parts = [];
    if (h.type === 'quit') parts.push(done ? 'держалась' : 'держалась сегодня?');
    else if (h.type === 'auto') { const g = hbAutoGoal(h); parts.push(done ? 'цель выполнена' : g ? `из ${nf(g)} ${h.src === 'steps' ? 'шагов' : 'мл'} · отметится сама` : 'задай цель в настройках'); }
    else if (hbTypeText(h)) parts.push(hbTypeText(h));
    parts.push(h.sched.k === 'weekly' ? `${hbWeekCount(h, d)} из ${h.sched.n} на неделе` : hbSchedText(h));
    if (d === t) { const st = hbStreak(h); if (st >= 2) parts.push(`${st} ${hbUnit(h)} подряд`); }
    return `<div class="hab-row${done ? ' done' : ''}" style="--hc:${HB_COL[h.c] || HB_COL['']};--f:${f.toFixed(3)}" data-act="hb-tap" data-id="${h.id}" role="button" tabindex="0" aria-label="${esc(h.name)}: ${done ? 'сделано' : 'отметить'}"><span class="ico">${h.emo}</span><span><div class="nm">${esc(h.name)}</div><div class="sub">${parts.join(' · ')}</div></span>${right}<button class="more" data-act="hb-detail" data-id="${h.id}" aria-label="Статистика: ${esc(h.name)}">${hbChev('M9 5l7 7-7 7')}</button></div>`;
  }
  function hbDayHTML() {
    const d = ui.hbDay, t = today(), due = hbDueOn(d), done = due.filter(h => hbDone(h, d)).length;
    let html = `<div class="card hab-sum"><div class="hab-ring">${hbRingSvg(due.length ? done / due.length : 0, 48, 20, 5)}<b>${done}/${due.length}</b></div><div><div class="t">${due.length && done === due.length ? 'Всё сделано! 🎉' : d === t ? `Осталось ${due.length - done}` : fmtDay(d)}</div><div class="s">${d === t ? 'нажми на привычку — отметка и стразик' : 'можно отметить задним числом'}</div></div></div>`;
    HB_TOD.forEach(([k, n]) => { const L = due.filter(h => (h.tod || 'any') === k); if (L.length) html += `<div class="hab-grp"><span>${n}</span>${L.map(h => hbRow(h, d)).join('')}</div>`; });
    const not = hbList().filter(h => !due.includes(h));
    if (not.length) html += `<div class="hab-not">Не в этот день: ${not.map(h => `${h.emo} ${esc(h.name)}${hbPaused(h, d) ? ' — пауза' : h.sched.k === 'weekly' && d === t ? ' — план недели готов' : ''}`).join(', ')}</div>`;
    return html;
  }
  function hbWeekHTML() {
    const t = today(), ws = addDays(weekStart(t), 7 * ui.hbRep), we = addDays(ws, 6), fresh = ui.hbRep === 0, list = hbList();
    let cells = `<span></span>${HB_WD.map(n => `<span class="h">${n}</span>`).join('')}`, due = 0, dn = 0; const per = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(h => {
      cells += `<span class="n">${h.emo}<span>${esc(h.name)}</span></span>`;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i), fut = d > t, isD = hbDue(h, d, true), ok = hbDone(h, d);
        if (!fut && isD && h.sched.k !== 'weekly' && (d < t || ok)) { due++; if (ok) dn++; }
        if (ok) per[i]++;
        const cls = fut ? 'fut' : ok ? 'on' : hbFrac(h, d) > 0 ? 'part' : isD && h.sched.k !== 'weekly' && d < t ? 'miss' : isD ? '' : 'no';
        cells += `<i class="${cls}${d === t ? ' today' : ''}" style="--hc:${HB_COL[h.c] || HB_COL['']}"></i>`;
      }
    });
    list.filter(h => h.sched.k === 'weekly').forEach(h => { const c = Math.min(h.sched.n, hbWeekCount(h, we)); due += fresh ? c : h.sched.n; dn += c; });
    const pct = due ? Math.round(dn / due * 100) : 0, total = per.reduce((a, b) => a + b, 0), best = per.indexOf(Math.max(...per));
    const daily = list.filter(h => h.sched.k !== 'weekly'), bs = daily.length ? Math.max(...daily.map(hbBest)) : 0, bsH = daily.find(h => hbBest(h) === bs);
    const gw = habitGems(ws, we);
    const note = fresh && hbWd(t) <= 3 ? `Неделя только началась — уже ${total} ${plural(total, 'отметка', 'отметки', 'отметок')}. Всё впереди, я рядом 💜`
      : !total ? 'На этой неделе отметок нет — ничего страшного. Начнём с одной маленькой привычки 💜'
      : pct >= 80 ? `Неделя на ${pct}% — ты огонь! Лучше всего получилось в ${HB_WDL[best]}.` : pct >= 50 ? `Больше половины плана — это уже победа. В ${HB_WDL[best]} у тебя лучше всего получается 💜` : 'Неделя была непростой — ничего страшного. Начнём заново, я рядом 💜';
    const title = fresh ? 'Эта неделя' : ui.hbRep === -1 ? 'Прошлая неделя' : `${fmtShort(ws)} — ${fmtShort(we)}`;
    return `<div class="card"><div class="hab-nav"><button data-act="hb-wk" data-d="-1" ${ui.hbRep <= -52 ? 'disabled' : ''} aria-label="Прошлая неделя">${hbChev('M15 5l-7 7 7 7')}</button><b>${title}</b><button data-act="hb-wk" data-d="1" ${fresh ? 'disabled' : ''} aria-label="Следующая неделя">${hbChev('M9 5l7 7-7 7')}</button></div><div class="hab-rep">${cells}</div></div>
      <div class="hab-kpi">
        <div><span class="em">🎯</span><b class="num">${pct}<small>%</small></b><span>выполнено по плану</span></div>
        <div><span class="em">💎</span><b class="num">${gw}</b><span>${plural(gw, 'стразик', 'стразика', 'стразиков')} за неделю</span></div>
        <div><span class="em">🌟</span><b>${total ? HB_WD[best] : '—'}</b><span>лучший день недели</span></div>
        <div><span class="em">🔥</span><b class="num">${bs}<small> дн.</small></b><span>лучшая серия${bsH ? ': ' + esc(bsH.name).toLowerCase() : ''}</span></div>
      </div>
      <div class="card hab-note">${bearSvg()}<span>${note}</span></div>`;
  }
  function hbHeat(h, weeks) {
    const t = today(), start = addDays(weekStart(t), -7 * (weeks - 1)), col = HB_COL[h.c] || HB_COL[''];
    let cells = '', labs = '', lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const d0 = addDays(start, w * 7), dd = toDate(d0);
      labs += `<span>${dd.getDate() <= 7 && dd.getMonth() !== lastM ? HB_MON[dd.getMonth()] : ''}</span>`; if (dd.getDate() <= 7) lastM = dd.getMonth();
      for (let i = 0; i < 7; i++) { const d = addDays(d0, i); if (d > t) { cells += '<i class="e"></i>'; continue; } const f = d < h.start ? 0 : hbFrac(h, d); cells += `<i${f ? ` style="background:color-mix(in srgb, ${col} ${Math.round(35 + f * 65)}%, var(--surface-2))"` : ''}></i>`; }
    }
    return `<div class="hab-ml" style="grid-template-columns:repeat(${weeks},minmax(0,1fr))">${labs}</div><div class="hab-hm" style="grid-template-columns:repeat(${weeks},minmax(0,1fr))">${cells}</div>`;
  }
  function hbYearHTML() {
    const t = today(), y0 = t.slice(0, 4) + '-01-01', list = hbList();
    const total = list.reduce((s, h) => s + hbDoneDays(h).filter(d => d >= y0).length, 0);
    return `<div class="card"><div class="hab-yhead"><b class="num">${t.slice(0, 4)}</b><span>в квадратиках</span></div><div class="small muted" style="margin-top:4px">${nf(total)} ${plural(total, 'отметка', 'отметки', 'отметок')} за год — каждая клеточка твоя 💜</div></div>
      ${list.map(h => `<button class="card hab-yh" data-act="hb-detail" data-id="${h.id}"><span class="t">${h.emo} ${esc(h.name)}<small>${hbDoneDays(h).filter(d => d >= y0).length} за год · сила ${hbStrength(h)}%</small></span>${hbHeat(h, 48)}</button>`).join('')}`;
  }
  function renderHabMini() {
    const el = $('#habMini'); if (!el) return;
    const list = hbList();
    if (!list.length || ui.day !== today()) { el.innerHTML = ''; return; }
    const due = hbDueOn(today()), done = due.filter(h => hbDone(h, today())).length;
    el.innerHTML = `<button class="actmini" data-act="hb-open"><span class="wic" style="font-size:17px">${due.slice(0, 1).map(h => h.emo).join('') || '✨'}</span><span>${due.length ? `Привычки: <b>${done} из ${due.length}</b>${done === due.length ? ' · всё сделано 🎉' : ''}` : 'Привычки: сегодня отдыхаем'}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>`;
  }

  // ---------- Карточка привычки ----------
  function hbDetail(id, keep) {
    const h = hbFind(id); if (!h) return;
    const t = today(), col = HB_COL[h.c] || HB_COL[''];
    if (!keep || !ui.hbCal) ui.hbCal = t.slice(0, 8) + '01';
    const m0 = ui.hbCal, md = toDate(m0), y = md.getFullYear(), m = md.getMonth(), days = new Date(y, m + 1, 0).getDate();
    let cal = HB_WD.map(n => `<span class="h">${n}</span>`).join('') + '<span class="x"></span>'.repeat(hbWd(m0)); let mDone = 0;
    for (let i = 1; i <= days; i++) {
      const d = m0.slice(0, 8) + z(i), fut = d > t, pre = d < h.start, ok = hbDone(h, d); if (ok) mDone++;
      const cls = fut || pre ? '' : hbPaused(h, d) ? 'pause' : ok ? 'on' : hbFrac(h, d) > 0 ? 'part' : hbDue(h, d, true) && d < t && h.sched.k !== 'weekly' ? 'miss' : '';
      cal += `<button class="${cls}${d === t ? ' today' : ''}" data-act="hb-cal" data-id="${h.id}" data-day="${d}" ${fut || pre || h.type === 'auto' ? 'disabled' : ''} aria-label="${i} ${HB_MONL[m]}${ok ? ', сделано' : ''}">${i}</button>`;
    }
    const months = []; for (let i = 11; i >= 0; i--) { const x = new Date(toDate(t).getFullYear(), toDate(t).getMonth() - i, 1, 12); months.push(iso(x).slice(0, 7)); }
    const doneDays = hbDoneDays(h), mc = months.map(mm => doneDays.filter(d => d.startsWith(mm)).length), mx = Math.max(1, ...mc);
    const tb = [0, 0, 0, 0]; Object.entries(S.htime[h.id] || {}).forEach(([d, hr]) => { if (hbDone(h, d)) tb[hr < 12 ? 0 : hr < 17 ? 1 : hr < 22 ? 2 : 3]++; });
    const tt = tb.reduce((a, b) => a + b, 0);
    const prevOk = m0 > h.start.slice(0, 8) + '01', nextOk = m0 < t.slice(0, 8) + '01';
    openSheet(`<div class="hab-d" style="--hc:${col}">
      <div class="hab-dh"><span class="ico">${h.emo}</span><div><h2>${esc(h.name)}</h2><div class="sub">${[hbTypeText(h), hbSchedText(h), ((HB_TOD.find(x => x[0] === h.tod) || [])[1] || '').toLowerCase()].filter(Boolean).join(' · ')}${h.paused ? ' · на паузе' : ''}</div></div><button class="iconbtn" data-act="hb-edit" data-id="${h.id}" aria-label="Изменить привычку"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>
      <div class="hab-tiles">
        <div class="hab-tile"><div class="tt"><b class="num">${hbStrength(h)}<small>%</small></b><i>💪</i></div><span>сила привычки</span></div>
        <div class="hab-tile"><div class="tt"><b class="num">${doneDays.length}</b><i>✅</i></div><span>всего выполнений</span></div>
        <div class="hab-tile"><div class="tt"><b class="num">${hbStreak(h)}<small> ${hbUnit(h)}</small></b><i>🔥</i></div><span>текущая серия</span></div>
        <div class="hab-tile"><div class="tt"><b class="num">${hbBest(h)}<small> ${hbUnit(h)}</small></b><i>👑</i></div><span>лучшая серия</span></div>
      </div>
      <div class="hab-box2"><div class="hab-nav"><button data-act="hb-month" data-id="${h.id}" data-d="-1" ${prevOk ? '' : 'disabled'} aria-label="Предыдущий месяц">${hbChev('M15 5l-7 7 7 7')}</button><b>${HB_MONL[m].charAt(0).toUpperCase() + HB_MONL[m].slice(1)} ${y} · ${mDone} ${plural(mDone, 'раз', 'раза', 'раз')}</b><button data-act="hb-month" data-id="${h.id}" data-d="1" ${nextOk ? '' : 'disabled'} aria-label="Следующий месяц">${hbChev('M9 5l7 7-7 7')}</button></div><div class="hab-cal">${cal}</div>${h.type === 'auto' ? '' : '<p class="hint" style="margin-top:8px">Нажми на день, чтобы отметить или снять отметку.</p>'}</div>
      <div class="hab-box2"><h3>Год</h3><div style="margin-top:10px">${hbHeat(h, 48)}</div></div>
      <div class="hab-box2"><h3>Выполнений по месяцам</h3><div class="hab-bars">${mc.map((n, i) => `<div><i style="height:${Math.max(3, Math.round(n / mx * 88))}px" title="${n}"></i><span>${HB_MON[+months[i].slice(5, 7) - 1]}</span></div>`).join('')}</div></div>
      ${tt ? `<div class="hab-box2"><h3>Когда отмечаешь</h3><div class="hab-tod">${[['Утро', tb[0]], ['День', tb[1]], ['Вечер', tb[2]], ['Ночь', tb[3]]].map(([n, v]) => `<div><span>${n}</span><span class="b"><i style="width:${Math.round(v / tt * 100)}%"></i></span><b>${Math.round(v / tt * 100)}%</b></div>`).join('')}</div></div>` : ''}
      <label class="swrow" style="border:0;padding:4px 2px"><span>Пауза<small>Болезнь или отпуск — дни не пропуски, серия не сгорает</small></span><input type="checkbox" switch data-hbpause="${h.id}" ${h.paused ? 'checked' : ''} aria-label="Пауза"></label>
    </div>`);
  }

  // ---------- Новая привычка и правка ----------
  const HB_TPL = [
    { name: 'Витамины', emo: '💊', c: '-peach', type: 'check', sched: { k: 'daily' }, tod: 'morning' },
    { name: 'Растяжка', emo: '🧘‍♀️', c: '-lilac', type: 'timer', target: 10, sched: { k: 'daily' }, tod: 'morning' },
    { name: 'Уход за кожей', emo: '🧴', c: '-candy', type: 'count', target: 2, unit: 'раза', sched: { k: 'daily' }, tod: 'any' },
    { name: 'Книга', emo: '📖', c: '-mint', type: 'count', target: 10, unit: 'стр.', sched: { k: 'weekly', n: 5 }, tod: 'evening' },
    { name: 'Сон до 23:00', emo: '🌙', c: '-peri', type: 'check', sched: { k: 'daily' }, tod: 'evening' },
    { name: 'Без сладкого после 20:00', emo: '🍫', c: '-coral', type: 'quit', sched: { k: 'daily' }, tod: 'evening' },
    { name: 'Без телефона перед сном', emo: '📵', c: '-orchid', type: 'quit', sched: { k: 'daily' }, tod: 'evening' },
    { name: 'Медитация', emo: '🌸', c: '', type: 'timer', target: 5, sched: { k: 'days', days: [0, 2, 4] }, tod: 'morning' },
    { name: 'Прогулка', emo: '🚶‍♀️', c: '-aqua', type: 'timer', target: 30, sched: { k: 'every', n: 2 }, tod: 'day' },
    { name: 'Дневник', emo: '✍️', c: '-champ', type: 'check', sched: { k: 'weekly', n: 3 }, tod: 'evening' },
  ];
  const HB_EMO = ['💊', '🧘‍♀️', '📖', '🧴', '🌙', '📵', '🚶‍♀️', '🌸', '🥗', '🍎', '🦷', '✍️', '🎧', '💤', '🏋️‍♀️', '🍫', '🎨', '🧹', '🪴', '💅', '🎹', '💧', '👟', '🫶'];
  const HB_TYPES = [['check', 'Сделала', 'да или нет'], ['count', 'Сколько', 'страницы, разы'], ['timer', 'По времени', 'с таймером'], ['quit', 'Отказ', 'держаться']];
  const HB_SCHED = [['daily', 'Каждый день'], ['days', 'Дни недели'], ['weekly', 'N раз в неделю'], ['every', 'Раз в N дней']];
  const HB_MINS = [5, 10, 15, 20, 30, 45, 60];
  let hbF = null, hbEditId = null;
  const hbBlank = () => ({ name: '', emo: '🌸', c: '-candy', type: 'check', target: 10, unit: 'стр.', src: null, sched: { k: 'daily', days: [0, 2, 4], n: 3 }, tod: 'any' });
  function hbForm(id) {
    hbEditId = id || null;
    const h = id && hbFind(id);
    hbF = h ? JSON.parse(JSON.stringify(Object.assign(hbBlank(), h, { sched: Object.assign(hbBlank().sched, h.sched) }))) : hbBlank();
    hbFormDraw(true);
  }
  function hbFormDraw(fresh) {
    const f = hbF, s = f.sched, sh = $('#sheet'), y = fresh ? 0 : sh.scrollTop;
    const segs = (list, cur, act) => list.map(([k, n, sub]) => `<button class="seg" data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${n}${sub ? `<small>${sub}</small>` : ''}</button>`).join('');
    const auto = f.type === 'auto';
    const typeExtra = f.type === 'count' ? `<span class="lbl2">Цель за день</span><div class="hab-step"><button data-act="hbf-tg" data-d="-1" aria-label="Меньше">−</button><b class="num">${f.target}</b><button data-act="hbf-tg" data-d="1" aria-label="Больше">+</button><input id="hbUnit" value="${esc(f.unit || '')}" placeholder="стр., раза" maxlength="12" aria-label="Единица"></div>`
      : f.type === 'timer' ? `<span class="lbl2">Время на привычку</span><div class="segs">${HB_MINS.map(m => `<button class="seg" data-act="hbf-min" data-v="${m}" aria-pressed="${f.target === m}">${m} мин</button>`).join('')}</div>`
      : f.type === 'quit' ? '<p class="hint">Отмечается вечером: «держалась». Без «нельзя» — просто бережное напоминание.</p>'
      : auto ? `<p class="hint">Отмечается сама, когда выполнена цель ${f.src === 'steps' ? 'по шагам' : 'по воде'} на «Сегодня».</p>` : '';
    const schedExtra = s.k === 'days' ? `<div class="hab-wd">${HB_WD.map((n, i) => `<button data-act="hbf-wd" data-v="${i}" aria-pressed="${s.days.includes(i)}">${n}</button>`).join('')}</div>`
      : s.k === 'weekly' ? `<div class="hab-step"><button data-act="hbf-sn" data-d="-1" aria-label="Меньше">−</button><b class="num">${s.n}</b><button data-act="hbf-sn" data-d="1" aria-label="Больше">+</button><span class="muted small">${plural(s.n, 'раз', 'раза', 'раз')} в неделю, в любые дни</span></div>`
      : s.k === 'every' ? `<div class="hab-step"><span class="muted small">раз в</span><button data-act="hbf-sn" data-d="-1" aria-label="Меньше">−</button><b class="num">${s.n}</b><button data-act="hbf-sn" data-d="1" aria-label="Больше">+</button><span class="muted small">${plural(s.n, 'день', 'дня', 'дней')}</span></div>` : '';
    openSheet(`<div class="hab-form"><h2>${hbEditId ? 'Изменить привычку' : 'Новая привычка'}</h2>
      ${hbEditId ? '' : `<span class="lbl2">Быстрый старт</span><div class="tplrow">${hbTplList().map((p, i) => `<button class="hab-tpl" data-act="hbf-tpl" data-v="${i}">${p.emo} ${esc(p.name)}</button>`).join('')}</div>`}
      <span class="lbl2">Название</span><div class="field"><input id="hbName" type="text" value="${esc(f.name)}" placeholder="например, растяжка" maxlength="40" autocomplete="off"></div><div class="hab-err" id="hbErr"></div>
      <span class="lbl2">Значок</span><div class="emo">${HB_EMO.map(e => `<button data-act="hbf-emo" data-v="${e}" aria-pressed="${f.emo === e}">${e}</button>`).join('')}</div>
      <span class="lbl2">Цвет — такой стразик будет падать за неё</span><div class="gems">${Object.keys(HB_COL).map(c => `<button data-act="hbf-c" data-v="${c}" aria-pressed="${f.c === c}" aria-label="Цвет стразика">${gemC(c)}</button>`).join('')}</div>
      ${auto ? '' : `<span class="lbl2">Как отмечать</span><div class="segs two">${segs(HB_TYPES, f.type, 'hbf-type')}</div>`}${typeExtra}
      ${auto ? '' : `<span class="lbl2">Как часто</span><div class="segs">${segs(HB_SCHED, s.k, 'hbf-sk')}</div>${schedExtra}`}
      <span class="lbl2">Когда</span><div class="segs">${segs(HB_TOD, f.tod, 'hbf-tod')}</div>
      <div class="hab-reward">${gemC(f.c)}<span>За каждое выполнение — стразик этого цвета.${s.k === 'weekly' ? ' За выполненный план недели — ещё бонусный.' : ''}</span></div>
      <div class="stack"><button class="btn block" data-act="hbf-save">${hbEditId ? 'Сохранить' : 'Добавить привычку'}</button>
      ${hbEditId ? `<button class="btn danger block" data-act="hbf-del" data-id="${hbEditId}">Удалить привычку</button>` : ''}</div></div>`);
    sh.scrollTop = y;
    const n = $('#hbName'); n.addEventListener('input', () => { hbF.name = n.value; $('#hbErr').textContent = ''; });
    const u = $('#hbUnit'); if (u) u.addEventListener('input', () => { hbF.unit = u.value; });
  }
  function hbFromTpl(p) { return Object.assign(hbBlank(), JSON.parse(JSON.stringify(p)), { sched: Object.assign(hbBlank().sched, p.sched) }); }
  function hbCreate(f) {
    const t = today(), sched = { k: f.sched.k };
    if (sched.k === 'days') sched.days = f.sched.days.slice().sort((a, b) => a - b);
    if (sched.k === 'weekly' || sched.k === 'every') sched.n = f.sched.n;
    if (sched.k === 'every') sched.from = t;
    const rec = { name: f.name.trim().slice(0, 40), emo: f.emo, c: f.c, type: f.type, target: f.type === 'count' || f.type === 'timer' ? f.target : null, unit: f.type === 'count' ? String(f.unit || '').trim().slice(0, 12) : '', src: f.type === 'auto' ? (f.src || 'water') : null, sched, tod: f.tod };
    hbStore();
    if (hbEditId) {
      const h = hbFind(hbEditId);
      if (sched.k === 'every' && h.sched.k === 'every' && h.sched.from) sched.from = h.sched.from;
      Object.assign(h, rec); save(); closeSheet(); render(); toast('Сохранено');
    } else {
      S.habits.push(Object.assign({ id: uid(), start: t, paused: null, archived: false }, rec)); save();
      closeSheet(); ui.hbMode = 'day'; ui.hbFollow = true; render();
      toast(`Новая привычка: ${rec.name}`, null, { c: rec.c });
    }
  }

  // ---------- Таймер с мишкой (идёт по часам — не сбивается, если телефон уснул) ----------
  let hbTm = null;
  function hbTimer(id, d) {
    const h = hbFind(id); if (!h) return;
    const total = h.target * 60, have = Math.min(total, (+hbVal(h, d) || 0) * 60), C = 2 * Math.PI * 98;
    const st = { run: false, from: 0, acc: have };
    const left = () => Math.max(0, total - st.acc - (st.run ? (Date.now() - st.from) / 1000 : 0));
    const draw = () => { const sh = $('#sheet'), r = sh.querySelector('.hab-timer .v'); if (!r) return; const l = left(); r.setAttribute('stroke-dashoffset', (C * (l / total)).toFixed(1)); sh.querySelector('.hab-timer b').textContent = `${Math.floor(Math.ceil(l) / 60)}:${z(Math.ceil(l) % 60)}`; sh.querySelector('[data-hbt="go"]').textContent = st.run ? 'Пауза' : st.acc > 0 ? 'Продолжить' : 'Старт'; if (st.run && l <= 0) finish(); };
    const stop = () => { if (st.run) { st.acc += (Date.now() - st.from) / 1000; st.run = false; } clearInterval(hbTm); hbTm = null; };
    let ended = false;
    const finish = () => { if (ended) return; ended = true; stop(); closeSheet(); hbSet(h, d, h.target, document.querySelector(`.hab-row[data-id="${h.id}"]`)); };
    openSheet(`<div style="text-align:center"><h2>${h.emo} ${esc(h.name)}</h2><div class="muted small">${h.target} минут — мишка считает вместе с тобой</div>
      <div class="hab-timer"><svg class="r" viewBox="0 0 220 220"><circle cx="110" cy="110" r="98" fill="none" stroke="var(--track)" stroke-width="14"/><circle class="v" cx="110" cy="110" r="98" fill="none" stroke="${HB_COL[h.c] || HB_COL['']}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg><div class="tm">${bearSvg()}<b class="num">${h.target}:00</b><span>осталось</span></div></div>
      <div class="stack"><button class="btn block" data-hbt="go">Старт</button><button class="btn plain block" data-hbt="done">Уже сделала</button></div></div>`, () => {
      // закрыла раньше — сохраняем пройденные минуты, если их больше, чем было
      if (ended) return; stop(); const mins = Math.floor(st.acc / 60);
      if (mins > (+hbVal(h, d) || 0) && mins < h.target) { hbLog(h)[d] = mins; save(); render(); toast(`Засчитано ${mins} мин из ${h.target}`); }
    });
    const sh = $('#sheet');
    sh.querySelector('[data-hbt="go"]').onclick = () => { if (st.run) stop(); else { st.run = true; st.from = Date.now(); clearInterval(hbTm); hbTm = setInterval(draw, 250); } draw(); };
    sh.querySelector('[data-hbt="done"]').onclick = finish;
    draw();
  }

  // ---------- Судоку ----------
  const SDK_DIFF = [['easy', 'Лёгкий', 38], ['medium', 'Средний', 31], ['hard', 'Сложный', 26]];
  const SDK_NAME = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
  const RW = i => (i / 9) | 0, CL = i => i % 9, BX = i => ((RW(i) / 3) | 0) * 3 + ((CL(i) / 3) | 0);
  const PEERS = [];
  for (let i = 0; i < 81; i++) { const p = []; for (let j = 0; j < 81; j++) if (j !== i && (RW(j) === RW(i) || CL(j) === CL(i) || BX(j) === BX(i))) p.push(j); PEERS.push(p); }
  const bitCount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // Решатель с битовыми масками: считает решения до limit, запоминает первое
  function sdkSolve(grid, limit, random) {
    const g = grid.slice(); const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    for (let i = 0; i < 81; i++) if (g[i]) { const b = 1 << g[i]; if ((rows[RW(i)] | cols[CL(i)] | boxes[BX(i)]) & b) return { count: 0 }; rows[RW(i)] |= b; cols[CL(i)] |= b; boxes[BX(i)] |= b; }
    let count = 0, first = null;
    (function rec() {
      let best = -1, mask = 0, cnt = 10;
      for (let i = 0; i < 81; i++) if (!g[i]) {
        const m = ~(rows[RW(i)] | cols[CL(i)] | boxes[BX(i)]) & 0x3FE; const c = bitCount(m);
        if (c < cnt) { cnt = c; best = i; mask = m; if (c <= 1) break; }
      }
      if (best < 0) { count++; if (!first) first = g.slice(); return; }
      if (!mask) return;
      const ds = []; for (let d = 1; d <= 9; d++) if (mask & (1 << d)) ds.push(d);
      if (random) shuffleArr(ds);
      const r = RW(best), c = CL(best), x = BX(best);
      for (const d of ds) {
        const b = 1 << d; g[best] = d; rows[r] |= b; cols[c] |= b; boxes[x] |= b;
        rec();
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[x] &= ~b;
        if (count >= limit) return;
      }
    })();
    return { count, first };
  }
  function sdkGenerate(diff) {
    const target = (SDK_DIFF.find(d => d[0] === diff) || SDK_DIFF[0])[2];
    const sol = sdkSolve(Array(81).fill(0), 1, true).first;
    const pz = sol.slice(); let clues = 81;
    for (const i of shuffleArr([...Array(41).keys()])) {
      if (clues <= target) break;
      const j = 80 - i; const a = pz[i], b = pz[j];
      pz[i] = 0; pz[j] = 0;
      if (sdkSolve(pz, 2, false).count !== 1) { pz[i] = a; pz[j] = b; } else clues -= i === j ? 1 : 2;
    }
    // Добиваем до нужного числа подсказок по одной клетке
    for (const i of shuffleArr([...Array(81).keys()])) {
      if (clues <= target) break;
      if (!pz[i]) continue;
      const a = pz[i]; pz[i] = 0;
      if (sdkSolve(pz, 2, false).count !== 1) pz[i] = a; else clues--;
    }
    return { diff, puzzle: pz.join(''), solution: sol.join(''), vals: pz.join(''), notes: Array(81).fill(0), elapsed: 0, hints: 0, done: false, check: S.sudoku ? S.sudoku.check !== false : true };
  }
  const sdkUndo = [];
  let sdkSel = -1, sdkNotes = false, sdkTimer = null, sdkSaveTick = 0;
  const fmtTime = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function sdkSetVal(i, v) { const g = S.sudoku; g.vals = g.vals.slice(0, i) + v + g.vals.slice(i + 1); }
  function sdkStats() { if (!S.sudokuStats) S.sudokuStats = { solved: {}, best: {} }; return S.sudokuStats; }

  function sdkTimerSync() {
    const run = ui.view === 'sudoku' && S.sudoku && !S.sudoku.done && document.visibilityState === 'visible';
    if (run && !sdkTimer) sdkTimer = setInterval(() => {
      if (!S.sudoku || S.sudoku.done) return;
      S.sudoku.elapsed++; const t = $('#sdkTime'); if (t) t.textContent = fmtTime(S.sudoku.elapsed);
      if (++sdkSaveTick % 10 === 0) save();
    }, 1000);
    if (!run && sdkTimer) { clearInterval(sdkTimer); sdkTimer = null; save(); }
  }

  function renderSudoku() {
    const g = S.sudoku;
    if (!g) {
      $('#sdkBoard').innerHTML = `${emptyBear('Выбери сложность — и поехали.')}<div class="chips" style="justify-content:center;margin-top:12px">${SDK_DIFF.map(([k, n]) => `<button class="btn ghost" data-act="sdk-new" data-d="${k}">${n}</button>`).join('')}</div>`;
      $('#sdkStats').innerHTML = sdkStatsHtml(); return;
    }
    const sel = sdkSel, selV = sel >= 0 ? +g.vals[sel] : 0;
    const cells = [];
    for (let i = 0; i < 81; i++) {
      const v = +g.vals[i], given = g.puzzle[i] !== '0';
      const cls = ['sc'];
      if (given) cls.push('given'); else if (v) cls.push('mine');
      if (i === sel) cls.push('sel');
      else if (sel >= 0 && (RW(i) === RW(sel) || CL(i) === CL(sel) || BX(i) === BX(sel))) cls.push('peer');
      if (v && selV && v === selV && i !== sel) cls.push('same');
      if (v && !given) {
        const wrong = g.check !== false ? v !== +g.solution[i] : PEERS[i].some(j => +g.vals[j] === v);
        if (wrong) cls.push('bad');
      }
      let inner = '';
      if (v) inner = v;
      else if (g.notes[i]) { inner = '<span class="nt">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<i>${g.notes[i] & (1 << d) ? d : ''}</i>`).join('') + '</span>'; }
      cells[i] = (`<button class="${cls.join(' ')}" data-act="sdk-cell" data-i="${i}" aria-label="Ряд ${RW(i) + 1}, столбец ${CL(i) + 1}${v ? ', ' + v : ', пусто'}">${inner}</button>`);
    }
    const counts = Array(10).fill(0); for (const ch of g.vals) counts[+ch]++;
    $('#sdkBoard').innerHTML = `<div class="sdkhead"><span class="chip-state">${SDK_NAME[g.diff]}</span><span class="num sdktime" id="sdkTime">${fmtTime(g.elapsed)}</span><button class="linkbtn" data-act="sdk-newmenu">Новая игра</button></div>
      <div class="sdkgrid" role="grid" aria-label="Поле судоку">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(bx => `<div class="sbox">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => cells[(((bx / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (bx % 3) * 3 + (k % 3)]).join('')}</div>`).join('')}</div>
      <div class="sdktools">
        <button class="tool" data-act="sdk-undo" ${sdkUndo.length ? '' : 'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>Отменить</button>
        <button class="tool" data-act="sdk-erase"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H9l-5-5 10-10 7 7-6 6"/><path d="M7 12l6 6"/></svg>Стереть</button>
        <button class="tool ${sdkNotes ? 'on' : ''}" data-act="sdk-notes" aria-pressed="${sdkNotes}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>Заметки</button>
        <button class="tool" data-act="sdk-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>Подсказка</button>
      </div>
      <div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="nk" data-act="sdk-num" data-d="${d}" ${counts[d] >= 9 ? 'disabled' : ''}><b>${d}</b><small>${9 - counts[d] > 0 ? 9 - counts[d] : ''}</small></button>`).join('')}</div>
      <div class="chips" style="margin-top:12px"><button class="seg" data-act="sdk-check" aria-pressed="${g.check !== false}">Подсвечивать ошибки</button>${g.hints ? `<span class="tiny muted">Подсказок: ${g.hints}</span>` : ''}</div>`;
    $('#sdkStats').innerHTML = sdkStatsHtml();
    sdkTimerSync();
  }
  function sdkStatsHtml() {
    const st = sdkStats();
    const rows = SDK_DIFF.map(([k, n]) => `<div class="li"><span>${n}</span><span class="small muted num">решено ${st.solved[k] || 0}${st.best[k] ? ' · лучшее ' + fmtTime(st.best[k]) : ''}</span></div>`).join('');
    return `<h2>Статистика</h2><div class="list">${rows}</div>`;
  }
  function sdkPlace(d) {
    const g = S.sudoku; const i = sdkSel;
    if (!g || g.done || i < 0 || g.puzzle[i] !== '0') return;
    sdkUndo.push({ vals: g.vals, notes: g.notes.slice() });
    if (sdkNotes) {
      if (+g.vals[i]) return;
      g.notes[i] ^= 1 << d;
    } else {
      sdkSetVal(i, +g.vals[i] === d ? 0 : d);
      g.notes[i] = 0;
      if (+g.vals[i]) PEERS[i].forEach(j => { g.notes[j] &= ~(1 << d); });
    }
    if (sdkUndo.length > 200) sdkUndo.shift();
    save(); sdkCheckWin(); renderSudoku();
  }
  function sdkCheckWin() {
    const g = S.sudoku;
    if (g.vals !== g.solution || g.done) return;
    g.done = true;
    const st = sdkStats();
    st.solved[g.diff] = (st.solved[g.diff] || 0) + 1;
    const best = st.best[g.diff]; const record = !g.hints && (!best || g.elapsed < best);
    if (record) st.best[g.diff] = g.elapsed;
    save(); sdkTimerSync();
    setTimeout(() => openSheet(`<div class="hero">${bearSvg()}<h2>Судоку решено!</h2></div>
      <p class="small" style="margin:0">${SDK_NAME[g.diff]} уровень за <b class="num">${fmtTime(g.elapsed)}</b>${g.hints ? `, подсказок: ${g.hints}` : ''}.${record ? ' Это новый рекорд!' : ''}</p>
      <div class="stack">${SDK_DIFF.map(([k, n]) => `<button class="btn ${k === g.diff ? '' : 'ghost'} block" data-act="sdk-new" data-d="${k}">Ещё одну · ${n}</button>`).join('')}<button class="btn plain block" data-act="sheet-close">Полюбоваться</button></div>`), 250);
  }

  // ---------- Тост ----------
  let toastTimer = null;
  function toast(msg, undo, shiny) {
    const el = $('#toast');
    el.innerHTML = `${shiny ? (typeof shiny === 'object' ? gemC(shiny.c, 'width:22px;height:22px') : typeof shiny === 'string' ? gemOf(shiny, 'width:22px;height:22px') : '<svg class="gem" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px"><use href="#gem"/></svg>') : ''}<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Отменить</button>' : ''}`;
    el.hidden = false;
    el._undo = undo || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; el._undo = null; }, undo ? 5000 : 2600);
  }

  // ---------- Действия ----------
  const draftKey = i => i.fid || 'n:' + String(i.name || '').toLowerCase();
  function reparse() {
    const text = $('#food').value;
    if (!text.trim()) { ui.dismissed.clear(); ui.draft = ui.photoItems.slice(); renderPreview(); return; }
    const r = C.parse(text, S.custom);
    // Убранное крестиком не возвращаем, пока не очищено поле или не нажато «Записать»
    ui.draft = r.items.filter(i => i.unknown || !ui.dismissed.has(draftKey(i))).concat(ui.photoItems);
    if (r.meal && !ui.mealTouched && r.meal !== ui.meal) { ui.meal = r.meal; renderMeals(); renderQuick(); }
    renderPreview();
  }
  function addEntries(list, meal) {
    const arr = S.log[ui.day] || (S.log[ui.day] = []);
    const t = Date.now();
    const added = list.map(i => Object.assign({ id: uid(), t, m: meal, n: i.n, g: i.g, k: i.k, p: i.p, f: i.f, c: i.c, fid: i.fid || null, l: i.l, dr: i.dr || 0 }, i.ph ? { ph: i.ph } : {}));
    arr.push(...added);
    save();
    return added;
  }
  function undoAdd(added) {
    const arr = S.log[ui.day]; if (!arr) return;
    const ids = new Set(added.map(a => a.id));
    S.log[ui.day] = arr.filter(e => !ids.has(e.id));
    save(); render();
  }
  function commitDraft() {
    const ok = ui.draft.filter(i => !i.unknown);
    if (!ok.length) return;
    const added = addEntries(ok.map(i => ({ n: i.name, g: i.grams, k: i.kcal, p: i.p, f: i.f, c: i.c, fid: i.fid, l: i.label, dr: i.drink ? 1 : 0, ph: i.ph })), ui.meal);
    const left = ui.draft.filter(i => i.unknown);
    ui.photo = null; ui.photoItems = []; ui.dismissed.clear();
    $('#food').value = left.map(u => u.src).join(', ');
    ui.draft = left;
    ui.mealTouched = false;
    const sum = added.reduce((s, a) => s + a.k, 0);
    render();
    if (!left.length) $('#food').blur();
    bearAte();
    toast(`Записано: ${nf(sum)} ккал`, () => undoAdd(added));
  }

  const actions = {
    'day-prev'() { ui.day = addDays(ui.day, -1); ui.followToday = false; render(); },
    'day-next'() { if (ui.day < today()) { ui.day = addDays(ui.day, 1); ui.followToday = ui.day === today(); render(); } },
    'day-today'() { ui.day = today(); ui.followToday = true; render(); },
    meal(b) { ui.meal = b.dataset.m; ui.mealTouched = true; renderMeals(); renderPreview(); renderQuick(); },
    'draft-del'(b) { const it = ui.draft[+b.dataset.idx]; if (it && !it.ai) ui.dismissed.add(draftKey(it)); ui.photoItems = ui.photoItems.filter(x => x !== it); ui.draft.splice(+b.dataset.idx, 1); if (!ui.draft.filter(x => !x.ai).length) $('#food').value = ''; renderPreview(); },
    commit() { commitDraft(); },
    quick(b) {
      const list = $('#quickWrap')._list || [];
      const q = list[+b.dataset.i]; if (!q) return;
      const added = addEntries([{ n: q.n, g: q.g, k: q.k, p: q.p, f: q.f, c: q.c, fid: q.fid, l: q.l, dr: q.dr, ph: q.ph }], ui.meal);
      render(); bearAte();
      toast(`${q.n}: ${nf(q.k)} ккал — ${MEAL_TO[ui.meal]}`, () => undoAdd(added));
    },
    entry(b) { entrySheet(b.dataset.id); },
    'es-step'(b) {
      const inp = $('#esG'); const v = Math.max(1, Math.round((num(inp.value) || 0) + +b.dataset.d)); inp.value = v;
      const e = dayItems(ui.day).find(x => x.id === $('#sheet').querySelector('[data-act="es-save"]').dataset.id);
      updateEntrySheetInfo(e, e && itemFood(e));
    },
    'es-meal'(b) { $('#sheet').dataset.meal = b.dataset.m; $('#sheet').querySelectorAll('[data-act="es-meal"]').forEach(x => x.setAttribute('aria-pressed', x === b)); },
    'es-save'(b) {
      const e = dayItems(ui.day).find(x => x.id === b.dataset.id); if (!e) return;
      const food = itemFood(e);
      if (food) {
        const g = Math.max(1, Math.round(num($('#esG').value) || e.g));
        const n = C.nutrientsFor(food, g);
        Object.assign(e, { g, k: n.kcal, p: n.p, f: n.f, c: n.c, l: labelFor(food, g) + (e.ph ? ' · по фото' : '') });
      } else {
        const k = num($('#esK').value); if (k != null) { const r = e.k ? k / e.k : 0; e.k = Math.round(k); e.p = Math.round(e.p * r * 10) / 10; e.f = Math.round(e.f * r * 10) / 10; e.c = Math.round(e.c * r * 10) / 10; e.l = Math.round(k) + ' ккал'; }
      }
      e.m = $('#sheet').dataset.meal || e.m;
      save(); closeSheet(); render(); toast('Сохранено');
    },
    'es-fav'(b) {
      const e = dayItems(ui.day).find(x => x.id === b.dataset.id); if (!e) return;
      const key = (e.fid || 'n:' + e.n) + '|' + e.g;
      if (S.favs.some(f => f.key === key)) { S.favs = S.favs.filter(f => f.key !== key); toast('Убрано из частого'); }
      else { S.favs.unshift(Object.assign(tpl(e), { key })); S.favs = S.favs.slice(0, 10); toast('Закреплено в «Часто ешь»'); }
      save(); closeSheet(); render();
    },
    'es-del'(b) {
      if (ui.delArm !== b.dataset.id) { ui.delArm = b.dataset.id; b.textContent = 'Точно удалить? Нажми ещё раз'; return; }
      const arr = S.log[ui.day] || [];
      const e = arr.find(x => x.id === b.dataset.id);
      S.log[ui.day] = arr.filter(x => x.id !== b.dataset.id);
      ui.delArm = null; save(); closeSheet(); render();
      if (e) toast('Удалено', () => { (S.log[ui.day] || (S.log[ui.day] = [])).push(e); save(); render(); });
    },
    'open-day'(b) { ui.day = b.dataset.day; ui.followToday = ui.day === today(); ui.view = 'today'; render(); window.scrollTo(0, 0); },
    'apply-baseline'() { const b = baseline(); setLimit(b.limit); toast(`Лимит: ${nf(b.limit)} ккал в день`); render(); },
    'goto-limit'() { S.settings.baselineDismissed = true; save(); ui.view = 'more'; render(); setUnfold('setLimit'); setTimeout(() => { const i = $('#sLimit'); i && i.focus(); }, 50); },
    'goto-protein'() { ui.view = 'more'; render(); setUnfold('setProtein'); setTimeout(() => { const i = $('#setProtein'); i && i.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 50); },
    'goto-body'() { ui.view = 'body'; render(); window.scrollTo(0, 0); },
    'snooze-weigh'() { S.settings.weighSnooze = today(); save(); renderTips(); },
    'apply-stall'(b) { setLimit(+b.dataset.k); toast(`Новый лимит: ${nf(+b.dataset.k)} ккал`); render(); },
    'dismiss-stall'(b) { S.settings.stallDismissed = b.dataset.d; save(); renderTips(); },
    'save-limit'() {
      const v = num($('#sLimit').value);
      if (!v || v < 800 || v > 6000) { toast('Введи число от 800 до 6000'); return; }
      setLimit(v); toast(`Лимит: ${nf(v)} ккал в день`); render();
    },
    'clear-limit'() { setLimit(null); toast('Лимит убран'); render(); },
    'save-protein'() { const v = num($('#sProtein').value); S.settings.protein = v ? Math.round(v) : null; save(); toast(v ? `Цель по белку: ${Math.round(v)} г` : 'Цель по белку убрана'); render(); },
    'use-protein'(b) { S.settings.protein = +b.dataset.g; save(); toast(`Цель по белку: ${b.dataset.g} г`); render(); },
    'water-glass'(b) {
      const plan = waterPlan(); if (!plan) return;
      const i = +b.dataset.i, ml = waterMl(ui.day), f = (ml - i * plan.size) / plan.size;
      // полный стакан — убрать последнее добавление; неполный — плюс один стакан;
      // пустой — налить стаканы до него. Всегда ровно по объёму стакана, без подгонки (350 + стакан 400 = 750)
      if (f > 0.98) { const v = waterUndo(); if (v) toast(`Убрала ${nf(v)} мл`); return; }
      const firstEmpty = Math.ceil(ml / plan.size - 0.02);
      waterAdd(plan.size, f > 0 ? 1 : Math.max(1, i - firstEmpty + 1));
    },
    'water-plus'() { const plan = waterPlan(); if (plan) waterAdd(plan.size); },
    'water-minus'() { const v = waterUndo(); if (v) toast(`Убрала ${nf(v)} мл`); },
    'water-add'(b) {
      const v = +b.dataset.v; if (!v) return;
      if (b.dataset.src === 'sheet') closeSheet();
      waterAdd(v);
      toast(`+${nf(v)} мл воды`);
    },
    'water-del'(b) {
      const i = +b.dataset.i;
      let { base, adds } = waterParts(ui.day);
      if (i < 0) base = 0; else adds.splice(i, 1);
      waterCommit(base, adds);
      glassSheet();
    },
    'water-size'() { glassSheet(); },
    'water-once'() {
      const v = num($('#wOnce') && $('#wOnce').value);
      if (!v || v < 10 || v > 3000) { toast('Сколько выпила — от 10 до 3000 мл'); return; }
      closeSheet();
      waterAdd(v);
      toast(`+${nf(Math.round(v))} мл воды`);
    },
    'glass-pick'(b) { glassApply(b.dataset.v === 'auto' ? null : +b.dataset.v, b.dataset.src); },
    'glass-save'(b) {
      const inp = b.dataset.src === 'sheet' ? $('#gsIn') : $('#sGlass');
      const v = num(inp && inp.value);
      if (!v || v < GLASS_MIN || v > GLASS_MAX) { toast(`Объём стакана — от ${GLASS_MIN} до ${GLASS_MAX} мл`); return; }
      glassApply(Math.round(v), b.dataset.src);
    },
    'save-water'() {
      const raw = $('#sWater').value.trim();
      if (!raw) {
        if (S.settings.water) { S.settings.water = null; save(); toast('Цель по воде убрана'); render(); }
        else toast('Введи число от 200 до 5000');
        return;
      }
      const v = num(raw);
      if (!v || v < 200 || v > 5000) { toast('Введи число от 200 до 5000'); return; }
      S.settings.water = Math.round(v); save();
      toast(`Вода: ${nf(v)} мл в день`); render();
    },
    'clear-water'() { S.settings.water = null; save(); toast('Цель по воде убрана'); render(); },
    'save-carb'() { const v = num($('#sCarb').value); S.settings.carb = v ? Math.round(v) : null; save(); toast(v ? `Цель по углеводам: ${Math.round(v)} г` : 'Цель по углеводам убрана'); render(); },
    'use-fat'(b) { S.settings.fat = +b.dataset.g; save(); toast(`Цель по жирам: ${b.dataset.g} г`); render(); },
    'use-carb'(b) { S.settings.carb = +b.dataset.g; save(); toast(`Цель по углеводам: ${b.dataset.g} г`); render(); },
    'goto-macros'() { ui.view = 'more'; render(); setUnfold('setProtein'); setTimeout(() => { const i = $('#sFat'); i && i.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50); },
    'save-fat'() { const v = num($('#sFat').value); S.settings.fat = v ? Math.round(v) : null; save(); toast(v ? `Цель по жирам: ${Math.round(v)} г` : 'Цель по жирам убрана'); render(); },
    'add-food'(b) { foodSheet(b.dataset.name || ''); },
    'my-foods'() { if (S.custom.length) myFoodsSheet(); else foodSheet(''); },
    'edit-food'(b) { foodSheet('', b.dataset.id); },
    'ff-mode'(b) {
      $('#sheet').dataset.ffMode = b.dataset.m;
      $('#sheet').querySelectorAll('[data-act="ff-mode"]').forEach(x => x.setAttribute('aria-pressed', x === b));
      $('#ffNote').textContent = b.dataset.m === 'portion' ? 'Укажи вес порции ниже — пересчитаю на 100 г. Если вес неизвестен, порция будет считаться за 100 г.' : '';
    },
    'ff-del'(b) {
      if (ui.delArm !== 'ff' + b.dataset.id) { ui.delArm = 'ff' + b.dataset.id; b.textContent = 'Точно удалить? Нажми ещё раз'; return; }
      S.custom = S.custom.filter(c => c.id !== b.dataset.id); ui.delArm = null; save(); closeSheet(); render(); toast('Продукт удалён');
    },
    'body-entry'(b) { bodyEntrySheet(b.dataset.id); },
    'body-del'(b) {
      if (ui.delArm !== 'b' + b.dataset.id) { ui.delArm = 'b' + b.dataset.id; b.textContent = 'Точно удалить? Нажми ещё раз'; return; }
      S.body = S.body.filter(x => x.id !== b.dataset.id); ui.delArm = null; save(); closeSheet(); render(); toast('Замер удалён');
    },
    howto() { howtoSheet(false); },
    'onb-start'() { S.settings.onboarded = true; save(); closeSheet(); setTimeout(() => $('#food').focus(), 80); },
    'onb-limit'() { S.settings.onboarded = true; save(); closeSheet(); ui.view = 'more'; render(); setUnfold('setLimit'); setTimeout(() => { const i = $('#sLimit'); i && i.focus(); }, 80); },
    'sheet-close'() { closeSheet(); },
    // --- привычки ---
    'hb-open'() { ui.view = 'habits'; ui.hbFollow = true; ui.hbMode = 'day'; render(); window.scrollTo(0, 0); },
    'hb-mode'(b) { ui.hbMode = b.dataset.m; render(); },
    'hb-day'(b) { ui.hbDay = b.dataset.day; ui.hbFollow = ui.hbDay === today(); render(); },
    'hb-wk'(b) { ui.hbRep = Math.min(0, Math.max(-52, (ui.hbRep || 0) + +b.dataset.d)); render(); },
    'hb-tap'(b) {
      const h = hbFind(b.dataset.id); if (!h) return;
      const d = ui.hbDay || today();
      if (h.type === 'auto') { toast(h.src === 'steps' ? 'Шаги отметятся сами, когда наберётся цель' : 'Вода отметится сама, когда наберёшь цель на «Сегодня»'); return; }
      if (h.type === 'timer') { if (hbDone(h, d)) hbSet(h, d, 0); else if (d === today()) hbTimer(h.id, d); else hbSet(h, d, h.target, b); return; }
      if (h.type === 'count') { const v = +hbVal(h, d) || 0; hbSet(h, d, v >= h.target ? 0 : v + 1, b); return; }
      hbSet(h, d, !hbDone(h, d), b);
    },
    'hb-detail'(b) { hbDetail(b.dataset.id); },
    'hb-month'(b) { const m = toDate(ui.hbCal); m.setMonth(m.getMonth() + +b.dataset.d, 1); ui.hbCal = iso(m); const y = $('#sheet').scrollTop; hbDetail(b.dataset.id, true); $('#sheet').scrollTop = y; },
    'hb-cal'(b) { const h = hbFind(b.dataset.id); if (!h) return; const d = b.dataset.day; hbSet(h, d, hbDone(h, d) ? 0 : hbFull(h)); const y = $('#sheet').scrollTop; hbDetail(h.id, true); $('#sheet').scrollTop = y; },
    'hb-edit'(b) { hbForm(b.dataset.id); },
    'hb-new'() { hbForm(); },
    'hb-quick'(b) { const p = hbTplList()[+b.dataset.v]; if (!p) return; hbEditId = null; hbCreate(hbFromTpl(p)); },
    'hbf-tpl'(b) { const p = hbTplList()[+b.dataset.v]; if (!p) return; hbF = hbFromTpl(p); hbFormDraw(); },
    'hbf-emo'(b) { hbF.emo = b.dataset.v; hbFormDraw(); },
    'hbf-c'(b) { hbF.c = b.dataset.v; hbFormDraw(); },
    'hbf-type'(b) { hbF.type = b.dataset.v; if (hbF.type === 'timer' && !HB_MINS.includes(hbF.target)) hbF.target = 10; if (hbF.type === 'count' && !(hbF.target >= 1 && hbF.target <= 99)) hbF.target = 10; hbFormDraw(); },
    'hbf-tg'(b) { hbF.target = Math.max(1, Math.min(99, (hbF.target || 1) + +b.dataset.d)); hbFormDraw(); },
    'hbf-min'(b) { hbF.target = +b.dataset.v; hbFormDraw(); },
    'hbf-sk'(b) { const s = hbF.sched; s.k = b.dataset.v; if (s.k === 'weekly') s.n = Math.min(6, Math.max(1, s.n || 3)); if (s.k === 'every') s.n = Math.max(2, Math.min(14, s.n || 2)); if (!Array.isArray(s.days) || !s.days.length) s.days = [0, 2, 4]; hbFormDraw(); },
    'hbf-wd'(b) { const i = +b.dataset.v, d = hbF.sched.days; hbF.sched.days = d.includes(i) ? (d.length > 1 ? d.filter(x => x !== i) : d) : d.concat(i); hbFormDraw(); },
    'hbf-sn'(b) { const s = hbF.sched, ev = s.k === 'every'; s.n = Math.max(ev ? 2 : 1, Math.min(ev ? 14 : 6, (s.n || 1) + +b.dataset.d)); hbFormDraw(); },
    'hbf-tod'(b) { hbF.tod = b.dataset.v; hbFormDraw(); },
    'hbf-save'() { if (!hbF.name.trim()) { $('#hbErr').textContent = 'Назови привычку — например, «Растяжка»'; $('#hbName').focus(); return; } hbCreate(hbF); },
    'hbf-del'(b) {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Точно удалить? Стразики останутся'; return; }
      const h = hbFind(b.dataset.id); if (!h) return; h.archived = true; save(); closeSheet(); render(); toast(`Привычка «${h.name}» удалена`);
    },
    undo() { const el = $('#toast'); const f = el._undo; el.hidden = true; el._undo = null; if (f) f(); },
    export() { exportData(); },
    import() { $('#importFile').value = ''; $('#importFile').click(); },
    wipe() { ui.delArm = 'all'; renderMore(); },
    'wipe-cancel'() { ui.delArm = null; renderMore(); },
    'wipe-confirm'() { try { localStorage.removeItem(AI_STORE); } catch (e) { /* нет доступа */ } ui.photo = null; ui.photoItems = []; S = blank(); S.settings.onboarded = true; ui.delArm = null; save(); ui.draft = []; $('#food').value = ''; bearApply(); render(); toast('Все данные удалены'); },
    'import-confirm'() { const d = $('#sheet')._import; if (!d) return; S = Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings || {}) }); save(); closeSheet(); bearApply(); render(); toast('Данные восстановлены'); },
  };


  Object.assign(actions, {
    'goto-act'() { ui.view = 'act'; render(); window.scrollTo(0, 0); },
    'act-day'(b) { ui.day = b.dataset.day; ui.followToday = ui.day === today(); render(); },
    'steps-save'() {
      const raw = $('#stepsIn').value.trim(); const v = num(raw);
      if (raw && (v == null || v > 100000)) { toast('Проверь число шагов'); return; }
      actDayMut(ui.day).steps = v ? Math.round(v) : null; save(); render();
      const G = S.settings.stepGoal;
      toast(v ? (G && v >= G ? 'Цель по шагам выполнена' : 'Шаги сохранены') : 'Шаги убраны', null, !!(v && G && v >= G));
    },
    'step-goal-apply'(b) { S.settings.stepGoal = +b.dataset.g; save(); render(); toast(`Цель: ${nf(+b.dataset.g)} шагов`); },
    theme(b) { themeSet(b.dataset.t); $('#setLook').innerHTML = lookCard(); },
    'greet-on'(b) { const g = G(); if (!g) return; const p = g.prefs(); p.on = b.dataset.on === '1'; g.setPrefs(p); $('#setLook').innerHTML = lookCard(); toast(p.on ? 'Приветствие включено' : 'Приветствие выключено'); },
    'save-gname'() { const g = G(); if (!g) return; const p = g.prefs(); p.name = $('#sGName').value.trim().slice(0, 24); g.setPrefs(p); $('#setLook').innerHTML = lookCard(); toast(p.name ? 'Имя сохранено' : 'Приветствие будет без имени'); },
    'greet-preview'() { const g = G(); if (!g) return; const p = g.prefs(), n = $('#sGName') && $('#sGName').value.trim(); if (n && n !== p.name) { p.name = n.slice(0, 24); g.setPrefs(p); } g.showNext(); },
    'save-stepgoal'() { const v = num($('#sStepGoal').value); S.settings.stepGoal = v ? Math.round(v) : null; save(); render(); toast(v ? `Цель: ${nf(v)} шагов` : 'Цель по шагам убрана'); },
    'wk-new'(b) { wk = { id: null, d: ui.day, type: b.dataset.type, min: '', int: 'm', note: '', ex: b.dataset.type === 'strength' ? [{ n: '', sets: [{ w: '', r: '' }] }] : [] }; wkSheet(); },
    'wk-type'(b) { wk.type = b.dataset.type; if (wk.type === 'strength' && !wk.ex.length) wk.ex.push({ n: '', sets: [{ w: '', r: '' }] }); wkSheet(); },
    'wk-min'(b) { wk.min = +wk.min === +b.dataset.m ? '' : b.dataset.m; wkSheet(); },
    'wk-int'(b) { wk.int = b.dataset.i; wkSheet(); },
    'wk-ex-add'() { wk.ex.push({ n: '', sets: [{ w: '', r: '' }] }); wkSheet(`.exname[data-ex="${wk.ex.length - 1}"]`); },
    'wk-ex-del'(b) { wk.ex.splice(+b.dataset.ex, 1); wkSheet(); },
    'wk-set-add'(b) { const e = wk.ex[+b.dataset.ex]; const l = e.sets[e.sets.length - 1] || { w: '', r: '' }; e.sets.push({ w: l.w, r: l.r }); wkSheet(`.sw[data-ex="${b.dataset.ex}"][data-set="${e.sets.length - 1}"]`); },
    'wk-set-del'(b) { const e = wk.ex[+b.dataset.ex]; e.sets.splice(+b.dataset.set, 1); if (!e.sets.length) e.sets.push({ w: '', r: '' }); wkSheet(); },
    'wk-ex-copy'(b) { const e = wk.ex[+b.dataset.ex]; const L = lastSets(e.n, wk.d, wk.id); if (!L) return; e.sets = L.sets.map(s => ({ w: s.w != null ? String(s.w).replace('.', ',') : '', r: s.r != null ? String(s.r) : '' })); wkSheet(); },
    'wk-save'() {
      const minV = num(wk.min);
      const rec = {
        id: wk.id || uid(), t: Date.now(), type: wk.type, min: minV ? Math.round(minV) : null, int: wk.int, note: String(wk.note || '').trim(),
        ex: wk.type === 'strength' ? wk.ex.filter(e => e.n.trim()).map(e => ({ n: e.n.trim(), sets: e.sets.map(s => ({ w: num(s.w), r: num(s.r) != null ? Math.round(num(s.r)) : null })).filter(s => s.w != null || s.r != null) })) : [],
      };
      const day = actDayMut(wk.d);
      const i = day.w.findIndex(x => x.id === rec.id);
      if (i >= 0) day.w[i] = rec; else day.w.push(rec);
      const isNew = i < 0;
      save(); closeSheet(); render();
      if (isNew) gemToast(rec.id); else toast('Сохранено');
    },
    'wk-open'(b) { wkDetail(b.dataset.day, b.dataset.id); },
    'wk-edit'(b) { const w = actDay(b.dataset.day).w.find(x => x.id === b.dataset.id); if (!w) return; wk = wkFromRecord(w, b.dataset.day); wkSheet(); },
    'wk-repeat'(b) {
      const w = actDay(b.dataset.day).w.find(x => x.id === b.dataset.id); if (!w) return;
      const copy = JSON.parse(JSON.stringify(w)); copy.id = uid(); copy.t = Date.now(); copy.note = '';
      actDayMut(today()).w.push(copy); save(); closeSheet(); render(); gemToast(copy.id);
    },
    'wk-del'(b) {
      if (ui.delArm !== 'w' + b.dataset.id) { ui.delArm = 'w' + b.dataset.id; b.textContent = 'Точно удалить? Нажми ещё раз'; return; }
      const day = actDayMut(b.dataset.day); day.w = day.w.filter(x => x.id !== b.dataset.id);
      ui.delArm = null; save(); closeSheet(); render(); toast('Тренировка удалена');
    },
  });


  Object.assign(actions, {
    photo() {
      if (!aiCfg().key) {
        openSheet(`<div class="hero">${bearSvg()}<h2>Фото еды</h2></div>
          <p class="small">Чтобы считать КБЖУ по фото, нужен ключ Claude API. Его вставляют один раз в настройках, и он хранится только на этом телефоне.</p>
          <div class="stack"><button class="btn block" data-act="goto-ai">Открыть настройки</button><button class="btn plain block" data-act="sheet-close">Позже</button></div>`);
        return;
      }
      const f = $('#photoFile'); f.value = ''; f.click();
    },
    'goto-ai'() { closeSheet(); ui.view = 'more'; render(); setUnfold('setAi'); setTimeout(() => { const c = $('#setAi'); c && c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); },
    'photo-retry'() { analyzePhoto(); },
    'photo-del'() { if (ui.photo && ui.photo.url) URL.revokeObjectURL(ui.photo.url); ui.photo = null; ui.photoItems = []; reparse(); },
    'ai-model'(b) { const c = aiCfg(); c.model = b.dataset.m; aiSave(c); $('#setAi').innerHTML = aiCard(); },
    'ai-save'() {
      const v = ($('#aiKey').value || '').trim();
      if (!v) { toast('Вставь ключ в поле'); return; }
      if (!/^sk-ant-/.test(v)) { toast('Ключ должен начинаться с sk-ant-'); return; }
      const c = aiCfg(); c.key = v; if (!aiSave(c)) { toast('Не получилось сохранить ключ'); return; }
      $('#setAi').innerHTML = aiCard(); toast('Ключ сохранён');
    },
    async 'ai-test'() {
      const res = $('#aiRes'); res.textContent = 'Проверяю…';
      try { await claudeCall(aiCfg(), [{ type: 'text', text: 'Ответь одним словом: ок' }], 5); res.innerHTML = '<span style="color:var(--protein)">Ключ работает. Можно фотографировать еду.</span>'; }
      catch (e) { res.innerHTML = `<span style="color:var(--warn)">${esc(e.message)}</span>`; }
    },
    'ai-clear'(b) {
      if (ui.delArm !== 'ai') { ui.delArm = 'ai'; b.textContent = 'Точно удалить?'; return; }
      ui.delArm = null; const c = aiCfg(); delete c.key; aiSave(c); $('#setAi').innerHTML = aiCard(); toast('Ключ удалён');
    },
  });

  $('#photoFile').addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    if (ui.photo && ui.photo.url) URL.revokeObjectURL(ui.photo.url);
    ui.photo = { file, url: URL.createObjectURL(file), state: 'loading' };
    ui.photoItems = [];
    if (ui.view !== 'today') { ui.view = 'today'; render(); }
    reparse();
    setTimeout(() => { const p = $('#preview'); p && p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 50);
    analyzePhoto();
  });


  Object.assign(actions, {
    'sdk-new'(b) {
      closeSheet();
      $('#sdkBoard').innerHTML = '<div class="empty"><span class="spin"></span> Собираю поле…</div>';
      setTimeout(() => { S.sudoku = sdkGenerate(b.dataset.d); sdkUndo.length = 0; sdkSel = -1; sdkNotes = false; save(); renderSudoku(); }, 30);
    },
    'sdk-newmenu'() {
      openSheet(`<h2>Новая игра</h2><p class="small muted" style="margin:0">Текущая партия${S.sudoku && !S.sudoku.done ? ' не решена и' : ''} будет заменена.</p>
        <div class="stack">${SDK_DIFF.map(([k, n]) => `<button class="btn ghost block" data-act="sdk-new" data-d="${k}">${n}</button>`).join('')}<button class="btn plain block" data-act="sheet-close">Отмена</button></div>`);
    },
    'sdk-cell'(b) { sdkSel = +b.dataset.i; renderSudoku(); },
    'sdk-num'(b) { sdkPlace(+b.dataset.d); },
    'sdk-erase'() {
      const g = S.sudoku; const i = sdkSel; if (!g || g.done || i < 0 || g.puzzle[i] !== '0') return;
      sdkUndo.push({ vals: g.vals, notes: g.notes.slice() }); sdkSetVal(i, 0); g.notes[i] = 0; save(); renderSudoku();
    },
    'sdk-undo'() { const g = S.sudoku; const u = sdkUndo.pop(); if (!g || !u || g.done) return; g.vals = u.vals; g.notes = u.notes; save(); renderSudoku(); },
    'sdk-notes'() { sdkNotes = !sdkNotes; renderSudoku(); },
    'sdk-check'() { const g = S.sudoku; if (!g) return; g.check = g.check === false; save(); renderSudoku(); },
    'sdk-hint'() {
      const g = S.sudoku; if (!g || g.done) return;
      let i = sdkSel;
      if (i < 0 || g.puzzle[i] !== '0' || g.vals[i] === g.solution[i]) {
        const empty = []; for (let k = 0; k < 81; k++) if (g.vals[k] !== g.solution[k]) empty.push(k);
        if (!empty.length) return; i = empty[Math.random() * empty.length | 0];
      }
      sdkUndo.push({ vals: g.vals, notes: g.notes.slice() });
      const d = +g.solution[i]; sdkSetVal(i, d); g.notes[i] = 0; PEERS[i].forEach(j => { g.notes[j] &= ~(1 << d); });
      g.hints++; sdkSel = i; save(); sdkCheckWin(); renderSudoku();
    },
  });
  document.addEventListener('keydown', ev => {
    if (ui.view !== 'sudoku' || !S.sudoku || !$('#backdrop').hidden || ev.target.matches('input, textarea')) return;
    if (/^[1-9]$/.test(ev.key)) { sdkPlace(+ev.key); ev.preventDefault(); }
    else if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === '0') { actions['sdk-erase'](); ev.preventDefault(); }
    else if (ev.key.startsWith('Arrow') && sdkSel >= 0) {
      const r = RW(sdkSel), c = CL(sdkSel);
      const nr = ev.key === 'ArrowUp' ? (r + 8) % 9 : ev.key === 'ArrowDown' ? (r + 1) % 9 : r;
      const nc = ev.key === 'ArrowLeft' ? (c + 8) % 9 : ev.key === 'ArrowRight' ? (c + 1) % 9 : c;
      sdkSel = nr * 9 + nc; renderSudoku(); ev.preventDefault();
    }
  });

  async function exportData() {
    const json = JSON.stringify({ app: 'porcia', v: 1, exported: new Date().toISOString(), data: S });
    const name = 'porcia-' + today() + '.json';
    const done = () => { S.settings.lastBackup = today(); save(); if (ui.view === 'more') renderMore(); };
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Порция — копия данных' });
        done(); toast('Копия сохранена'); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      done(); toast('Файл копии скачан');
    } catch (e) { toast('Не получилось сохранить файл'); }
  }

  $('#importFile').addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        const d = obj && obj.app === 'porcia' ? obj.data : null;
        if (!d || typeof d.log !== 'object') throw new Error('bad');
        const nDays = Object.keys(d.log).filter(k => d.log[k] && d.log[k].length).length;
        openSheet(`<h2>Восстановить копию?</h2><p class="small">Копия от ${obj.exported ? fmtLong(iso(new Date(obj.exported))) : 'неизвестной даты'}: ${nDays} ${plural(nDays, 'день', 'дня', 'дней')} записей, ${(d.body || []).length} замеров. Текущие данные на телефоне заменятся.</p>
          <div class="stack"><button class="btn block" data-act="import-confirm">Восстановить</button><button class="btn plain block" data-act="sheet-close">Отмена</button></div>`);
        $('#sheet')._import = d;
      } catch (e) { toast('Это не файл копии «Порции»'); }
    };
    rd.readAsText(file);
  });

  Object.assign(actions, {
    'strip-day'(b) { ui.day = b.dataset.day; ui.followToday = ui.day === today(); render(); },
    'meal-add'(b) {
      ui.meal = b.dataset.m; ui.mealTouched = true; renderMeals(); renderPreview(); renderQuick();
      $('#food').focus({ preventScroll: true });
      $('.composer').scrollIntoView({ block: 'start', behavior: calm() ? 'auto' : 'smooth' });
    },
    'goal-weight'() {
      const G = S.settings.goalWeight;
      openSheet(`<h2>Целевой вес</h2><p class="muted small" style="margin:0">Появится на графике пунктиром, а над ним — сколько пути уже пройдено.</p>
        <div class="stack"><div class="setrow"><label class="field"><span>Вес, кг</span><input id="gwIn" type="text" inputmode="decimal" value="${G ? String(G).replace('.', ',') : ''}" placeholder="например, 55"></label><button class="btn" data-act="goal-weight-save">Сохранить</button></div>
        ${G ? '<button class="btn plain block" data-act="goal-weight-clear">Убрать цель</button>' : ''}</div>`);
    },
    'goal-weight-save'() {
      const v = num($('#gwIn').value);
      if (!v || v < 30 || v > 250) { toast('Проверь вес — похоже на опечатку'); return; }
      S.settings.goalWeight = Math.round(v * 10) / 10; save(); closeSheet(); render(); toast(`Цель: ${g1(S.settings.goalWeight)} кг`);
    },
    'goal-weight-clear'() { S.settings.goalWeight = null; save(); closeSheet(); render(); toast('Цель по весу убрана'); },
  });

  Object.assign(actions, {
    'bear-tap'() { if (ui.view === 'today') { const b = $('#bearBubble'); if (b && !b.hidden && !b.classList.contains('out')) bearHush(); else bearSay(); } },
    'bear-prev'(b) { bearHop(b); },
    'bear-night'(b) { ui.bearNight = b.dataset.n === '1'; bearRerender(); },
    'bear-color'(b) { bearSet({ c: b.dataset.c }); bearRerender(); bearHop($('.bearprev')); },
    'bear-acc'(b) { const B = bearCfg(); B.a[b.dataset.a] = B.a[b.dataset.a] ? 0 : 1; bearSet({ a: B.a }); bearRerender(); bearHop($('.bearprev')); },
    whatsnew() { closeSheet(); setTimeout(() => whatsNew(true), 230); },
    'bday-card'() { bdayCard(); },
    'ward-tab'(b) { ui.wardTab = b.dataset.t; bearRerender(); },
    'bear-coat'(b) { bearSet({ coat: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-eyes'(b) { bearSet({ eyes: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-neck'(b) { bearSet({ neck: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-item'(b) { bearSet({ item: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-col'(b) { const B = bearCfg(); bearSet({ col: Object.assign({}, B.col, { [b.dataset.k]: b.dataset.v }) }); bearRerender(); bearHop($('.bearprev')); },
    'bear-look'(b) {
      const L = LOOKS.find(x => x.k === b.dataset.k); if (!L) return;
      const B = bearCfg();
      bearSet(Object.assign({}, L.set, { col: Object.assign({}, B.col, L.col || {}) }));
      bearRerender(); bearHop($('.bearprev'));
      toast(L.k === 'base' ? 'Мишка переоделся в обычное' : `Образ «${L.n}»`);
    },
    'bear-hat'(b) { bearSet({ hat: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-scarf'(b) { bearSet({ scarf: b.dataset.k }); bearRerender(); bearHop($('.bearprev')); },
    'bear-sample'(b) {
      const all = BEAR_SAY[b.dataset.p], prev = ui.bearSample;
      let txt = all[Math.floor(Math.random() * all.length)];
      if (txt === prev && all.length > 1) txt = all[(all.indexOf(txt) + 1) % all.length];
      ui.bearSample = txt;
      bearRerender(); bearHop($('.bearprev'));
    },
    'bear-talk'(b) { bearSet({ talk: b.dataset.on === '1' }); bearRerender(); },
    stars(b) { bearSet({ stars: b.dataset.on === '1' }); $('#setLook').innerHTML = lookCard(); },
    season(b) { bearSet({ season: b.dataset.on === '1' }); $('#setLook').innerHTML = lookCard(); if (b.dataset.on !== '1') { const w = document.querySelector('body > .wx'); if (w) w.remove(); } },
    'season-try'(b) { wxPlay(b.dataset.s, { dur: 14e3 }); toast({ autumn: 'Летят листья — смотри по краям и между карточками', winter: 'Пошёл снег — смотри по краям', spring: 'Летят лепестки — смотри по краям', summer: 'Солнечные искорки — смотри по краям' }[b.dataset.s]); },
  });
  $('#bearBubble').addEventListener('click', ev => { ev.stopPropagation(); bearHush(); });

  // ---------- События ----------
  const KEEP_FOCUS = new Set(['photo', 'meal', 'draft-del', 'es-step', 'es-meal', 'ff-mode', 'wk-type', 'wk-int', 'wk-set-add', 'wk-ex-add', 'wk-set-del', 'wk-ex-del', 'wk-ex-copy']);
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('.tab');
    if (tab && tab.dataset.tab === 'today' && ui.view !== 'today') setTimeout(() => bearMaybe(false), 450);
    if (tab) { ui.view = tab.dataset.tab; setTimeout(sdkTimerSync, 0); ui.delArm = null; if ((ui.view === 'today' || ui.view === 'act') && ui.followToday) ui.day = today(); render(); window.scrollTo(0, 0); return; }
    if (sheetClosing() && ev.target.closest('#backdrop')) return;
    if (ev.target === $('#backdrop')) { closeSheet(); return; }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const fn = actions[b.dataset.act];
    if (!fn) return;
    if (b.tagName === 'BUTTON' && b.type === 'submit') ev.preventDefault();
    // На iPhone нажатие кнопки не убирает клавиатуру — убираем сами
    const ae = document.activeElement;
    if (ae && ae.matches('input, textarea') && !KEEP_FOCUS.has(b.dataset.act)) { ae.blur(); document.body.classList.remove('kb'); }
    fn(b);
  });

  let parseTimer = null;
  $('#food').addEventListener('input', () => { clearTimeout(parseTimer); parseTimer = setTimeout(reparse, 160); autoGrow(); });
  $('#food').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); clearTimeout(parseTimer); reparse(); commitDraft(); }
  });
  function autoGrow() { const t = $('#food'); t.style.height = 'auto'; t.style.height = Math.min(200, Math.max(76, t.scrollHeight + 2)) + 'px'; }

  // Правка граммов в предпросмотре — без перерисовки, чтобы не терять фокус
  $('#preview').addEventListener('input', ev => {
    const inp = ev.target.closest('.gram input'); if (!inp) return;
    const idx = +inp.dataset.idx; const it = ui.draft[idx]; if (!it || !(it.fid || it.ph)) return;
    const food = itemFood(it); const g = Math.max(1, Math.round(num(inp.value) || 0));
    if (!food || !num(inp.value)) return;
    const n = C.nutrientsFor(food, g);
    Object.assign(it, { grams: g, kcal: n.kcal, p: n.p, f: n.f, c: n.c, label: labelFor(food, g) + (it.ai ? ' · по фото' : '') });
    const sub = document.querySelector(`[data-sub="${idx}"]`);
    if (sub) sub.innerHTML = `<span class="num">${nf(it.kcal)}</span> ккал · <span class="pr">белок ${g1(it.p)} г</span>`;
    const t = previewTotals();
    if ($('#ptK')) $('#ptK').textContent = nf(t.kcal);
    if ($('#ptP')) $('#ptP').textContent = g1(t.p);
  });

  document.addEventListener('input', ev => {
    const el = ev.target;
    if (wk && $('#sheet').contains(el)) {
      if (el.classList.contains('exname')) wk.ex[+el.dataset.ex].n = el.value;
      else if (el.classList.contains('sw')) wk.ex[+el.dataset.ex].sets[+el.dataset.set].w = el.value;
      else if (el.classList.contains('sr')) wk.ex[+el.dataset.ex].sets[+el.dataset.set].r = el.value;
      else if (el.id === 'wkNote') wk.note = el.value;
      else if (el.id === 'wkMin') {
        wk.min = el.value;
        $('#sheet').querySelectorAll('[data-act="wk-min"]').forEach(x => x.setAttribute('aria-pressed', 'false'));
        const k = wkKcal(wk, wk.d); const kc = $('#wkKcal');
        if (kc && k) kc.textContent = `Примерный расход ≈ ${k} ккал. К лимиту еды он не прибавляется.`;
      }
    }
    if (ev.target.id === 'hW' || ev.target.id === 'hBf') updateProteinHelper();
    if (ev.target.id === 'sWater') updateWaterHint();
    if (ev.target.id === 'esG') { const e = dayItems(ui.day).find(x => x.id === $('#sheet').querySelector('[data-act="es-save"]').dataset.id); updateEntrySheetInfo(e, e && itemFood(e)); }
  });

  document.addEventListener('change', ev => {
    const el = ev.target;
    if (wk && el.classList && el.classList.contains('exname')) {
      const i = +el.dataset.ex; const h = $('#sheet').querySelector(`[data-hint="${i}"]`);
      const key = el.value.trim().toLowerCase();
      if (!h || h.dataset.key === key) return; // не пересоздаём кнопку «Повторить», пока по ней нажимают
      h.dataset.key = key;
      const L = lastSets(el.value, wk.d, wk.id);
      h.innerHTML = L ? `В прошлый раз, ${fmtLong(L.d)}: ${esc(setsTxt(L.sets))} <button class="linkbtn" data-act="wk-ex-copy" data-ex="${i}">Повторить</button>` : '';
    }
  });

  document.addEventListener('submit', ev => {
    ev.preventDefault();
    if (ev.target.id === 'bodyForm') {
      const d = $('#bDate').value || today();
      const rec = { id: uid(), d, w: num($('#bW').value), waist: num($('#bWaist').value), hips: num($('#bHips').value), chest: num($('#bChest').value), belly: num($('#bBelly').value) };
      if (!rec.w && !rec.waist && !rec.hips && !rec.chest && !rec.belly) { toast('Заполни хотя бы вес'); return; }
      if (rec.w && (rec.w < 25 || rec.w > 300)) { toast('Проверь вес — похоже на опечатку'); return; }
      S.body = S.body.filter(x => x.d !== d);
      S.body.push(rec); save();
      ['#bW', '#bWaist', '#bHips', '#bChest', '#bBelly'].forEach(s => $(s).value = '');
      $('#bDate').value = today();
      renderBody(); toast('Замер сохранён');
    }
    if (ev.target.id === 'foodForm' && !sheetClosing()) {
      const name = $('#ffName').value.trim();
      let k = num($('#ffK').value), p = num($('#ffP').value) || 0, f = num($('#ffF').value) || 0, c = num($('#ffC').value) || 0;
      const portion = Math.round(num($('#ffPortion').value) || 0) || null;
      const unit = Math.round(num($('#ffUnit').value) || 0) || null;
      if (!name) { toast('Напиши название'); return; }
      if (k == null) { toast('Укажи калории'); return; }
      if ($('#sheet').dataset.ffMode === 'portion') {
        const base = portion || 100;
        const r = 100 / base; k *= r; p *= r; f *= r; c *= r;
      }
      const id = $('#sheet').dataset.ffId || 'my:' + uid();
      const old = S.custom.find(x => x.id === id);
      const aliases = (old && old.aliases ? old.aliases.slice() : []);
      const pre = ($('#sheet').dataset.ffPrefill || '').trim();
      if (pre && pre.toLowerCase() !== name.toLowerCase() && !aliases.includes(pre)) aliases.push(pre);
      const rec = { id, name, aliases, kcal: Math.round(k * 10) / 10, p: Math.round(p * 10) / 10, f: Math.round(f * 10) / 10, c: Math.round(c * 10) / 10, portion: portion || (unit || 100), unit };
      const i = S.custom.findIndex(x => x.id === id);
      if (i >= 0) S.custom[i] = rec; else S.custom.unshift(rec);
      save(); closeSheet(); toast('Продукт сохранён');
      if (ui.view === 'today') { reparse(); renderFoodTools(); } else render();
    }
  });

  // Прячем нижнюю панель, пока открыта клавиатура
  document.addEventListener('focusin', ev => { if (ev.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea')) document.body.classList.add('kb'); if (ev.target.id === 'food') bearLook(true); });
  document.addEventListener('change', ev => { const sw = ev.target.closest && ev.target.closest('input[data-sw]'); if (sw) swChange(sw.dataset.sw, sw.checked); });
  // пауза привычки — переключатель в её карточке
  document.addEventListener('change', ev => {
    const p = ev.target.closest && ev.target.closest('input[data-hbpause]'); if (!p) return;
    const h = hbFind(p.dataset.hbpause); if (!h) return;
    h.paused = p.checked ? today() : null; save(); render();
    toast(p.checked ? `«${h.name}» на паузе — дни не считаются пропусками` : `«${h.name}» снова в деле`);
    const y = $('#sheet').scrollTop; hbDetail(h.id, true); $('#sheet').scrollTop = y;
  });
  // привычку можно отметить и с клавиатуры
  document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.hab-row')) { ev.preventDefault(); ev.target.click(); } });
  document.addEventListener('focusout', ev => { if (ev.target.id === 'food') bearLook(false); });
  document.addEventListener('focusout', () => { setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea')) document.body.classList.remove('kb'); }, 60); });

  // После полуночи «Сегодня» переключается на новый день
  let bearHiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    sdkTimerSync();
    if (document.visibilityState === 'hidden') bearHiddenAt = Date.now();
    if (document.visibilityState === 'visible') {
      const away = bearHiddenAt ? Date.now() - bearHiddenAt : 0;
      setTimeout(() => { renderPeek(); if (away >= 10 * 60e3) bearWhenFree(() => bearMaybe(true), 700); if (S.settings.onboarded) bearWhenFree(bdayCardMaybe, 300); }, 0);
      if (ui.followToday && ui.day !== today()) { ui.day = today(); ui.meal = autoMeal(); render(); }
      else if (!ui.mealTouched && !ui.draft.length) { ui.meal = autoMeal(); if (ui.view === 'today') { renderMeals(); renderPreview(); renderQuick(); } }
    }
  });

  // ---------- Запуск ----------
  { const v = $('#appVer'); if (v) v.textContent = 'Порция · версия ' + APP_VER; }
  if (!S.settings.gemV2) { S.settings.gemV2 = Date.now(); save(); } // с этого момента у новых стразиков 14 расцветок
  bearApply();
  if (S.settings.sky === false) document.documentElement.classList.add('dz-nosky');
  render();
  skyInit();
  wxInit();
  if (S.settings.onboarded) bearWhenFree(bdayCardMaybe, 300);
  if (DZ()) bearWhenFree(() => whatsNew(false), 1400);
  if (S.settings.onboarded) bearWhenFree(() => bearMaybe(true), 900);
  if (!S.settings.onboarded) howtoSheet(true);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* нет поддержки */ }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Новая версия приложения: перезагружаемся, если ничего не набрано
      if (!hadController || reloading || $('#food').value.trim() || !$('#backdrop').hidden) return;
      reloading = true; location.reload();
    });
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
