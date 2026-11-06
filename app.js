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
      settings: { limits: [], protein: null, fat: null, stepGoal: null, onboarded: false, stallDismissed: null, baselineDismissed: false, weighSnooze: null, lastBackup: null },
      log: {}, custom: [], body: [], favs: [], act: {},
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
  const ui = { view: 'today', day: today(), meal: autoMeal(), mealTouched: false, draft: [], delArm: null, followToday: true, photo: null, photoItems: [] };

  // ---------- Иконки ----------
  const IC = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/></svg>',
  };

  // ---------- Рендер ----------
  function render() {
    document.querySelectorAll('.view[id^="v-"]').forEach(v => v.hidden = v.id !== 'v-' + ui.view);
    document.querySelectorAll('.tab').forEach(t => { if (t.dataset.tab === ui.view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (ui.view === 'today') renderToday();
    else if (ui.view === 'diary') renderDiary();
    else if (ui.view === 'act') renderAct();
    else if (ui.view === 'body') renderBody();
    else renderMore();
  }

  function renderToday() {
    const t = today();
    $('#dayTitle').textContent = fmtDay(ui.day);
    $('#dayNext').disabled = ui.day >= t;
    $('#foodLbl').textContent = ui.day === t ? 'Что съела?' : ui.day === addDays(t, -1) ? 'Что съела вчера?' : 'Что съела ' + fmtLong(ui.day) + '?';
    renderSummary();
    renderActMini();
    renderTips();
    renderMeals();
    renderPreview();
    renderQuick();
    renderEntries();
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
    const F = S.settings.fat;
    return `<div class="macros"><span><i class="dot" style="background:var(--fat)"></i>Жиры <span class="num">${g1(t.f)}${F ? ' / ' + nf(F) : ''}</span> г</span><span><i class="dot" style="background:var(--carb)"></i>Углеводы <span class="num">${g1(t.c)}</span> г</span></div>`;
  }

  function renderSummary() {
    const items = dayItems(ui.day);
    const t = totals(items);
    const L = limitFor(ui.day);
    const el = $('#summary');
    if (L) {
      const over = t.kcal > L;
      const frac = Math.min(1, t.kcal / L);
      const R = 54, CIRC = 2 * Math.PI * R;
      el.innerHTML = `<div class="summary">
        <div class="ring ${over ? 'over' : ''}" role="img" aria-label="Съедено ${nf(t.kcal)} из ${nf(L)} ккал">
          <svg viewBox="0 0 128 128"><circle class="trk" cx="64" cy="64" r="${R}" fill="none" stroke-width="12"/>
          <circle class="val" cx="64" cy="64" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - frac)).toFixed(1)}" ${t.kcal === 0 ? 'opacity="0"' : ''}/>${t.kcal > 0 && !over ? `<circle cx="${(64 + R * Math.cos(2 * Math.PI * frac)).toFixed(1)}" cy="${(64 + R * Math.sin(2 * Math.PI * frac)).toFixed(1)}" r="7.5" fill="url(#beadFill)" stroke="var(--surface)" stroke-width="2.5"/><circle cx="${(66 + R * Math.cos(2 * Math.PI * frac)).toFixed(1)}" cy="${(62 + R * Math.sin(2 * Math.PI * frac)).toFixed(1)}" r="1.8" fill="#fff"/>` : ''}</svg>
          <div class="mid"><div class="big">${nf(Math.abs(L - t.kcal))}</div><div class="cap">${over ? 'перебор' : 'осталось'}</div></div>
        </div>
        <div class="stats">
          <div class="stat-top"><b>${nf(t.kcal)}</b> <span class="muted">из ${nf(L)} ккал</span></div>
          ${proteinBlock(t)}
          ${macrosLine(t)}
        </div></div>`;
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
      ${proteinBlock(t)}
      ${macrosLine(t)}
      ${isToday && b.count < 5 ? '<p class="small muted" style="margin:0">Ешь как обычно и записывай всё, даже чай с сахаром. Через 5 дней посчитаю твою обычную калорийность и предложу лимит.</p>' : ''}
      ${isToday && b.count >= 5 && S.settings.baselineDismissed ? '<p class="small muted" style="margin:0">Лимит не задан. Его можно поставить в настройках.</p>' : ''}
    </div>`;
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
    el.innerHTML = photoRow() + rows + (known.length ? `<div class="ptotal"><span>Итого: <b class="num" id="ptK">${nf(t.kcal)}</b> ккал</span><span class="small" style="color:var(--protein)">белок <span class="num" id="ptP">${g1(t.p)}</span> г</span></div>
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
      nb.innerHTML = `<h2>Последний замер · ${fmtLong(last.d)}</h2><div><span class="baseline-big">${g1(last.w)}</span> <span class="muted">кг</span></div><p class="small" style="margin:8px 0 0">${dueTxt}</p>${prog}`;
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
      ${grid}<path class="ar" d="${area}"/><path class="ln" d="${line}"/>${dots}
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
    $('#setProtein').innerHTML = `<h2>Белок и жиры</h2>
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
      <div class="setrow" style="margin-top:14px"><label class="field"><span>Жиры, г в день (можно не задавать)</span><input id="sFat" type="text" inputmode="numeric" value="${F || ''}" placeholder="не задано"></label><button class="btn" data-act="save-fat">Сохранить</button></div>`;
    updateProteinHelper();

    const sug = stepSuggest();
    $('#setAct').innerHTML = `<h2>Активность</h2>
      <div class="setrow"><label class="field"><span>Цель по шагам в день</span><input id="sStepGoal" type="text" inputmode="numeric" value="${S.settings.stepGoal || ''}" placeholder="не задана"></label><button class="btn" data-act="save-stepgoal">Сохранить</button></div>
      <p class="hint">${sug ? `В среднем за последнюю неделю — ${nf(sug.avg)} шагов. ` : ''}Шаги удобнее прибавлять по 500 в неделю, а не сразу до 10 000.</p>
      <p class="hint">Веб-приложение на iPhone не может само читать шаги из «Здоровья», поэтому число вписывается вручную на экране «Активность».</p>`;
    $('#setAi').innerHTML = aiCard();
    $('#setFoods').innerHTML = `<h2>Мои продукты</h2>
      ${S.custom.length ? `<div class="list">${S.custom.map(c => `<div class="li"><div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(c.name)}</div><div class="tiny muted num">${nf(c.kcal)} ккал · Б ${g1(c.p)} · Ж ${g1(c.f)} · У ${g1(c.c)} на 100 г${c.portion ? ' · порция ' + c.portion + ' г' : ''}</div></div><button class="btn plain" style="min-height:36px;padding:6px 12px" data-act="edit-food" data-id="${c.id}">Изменить</button></div>`).join('')}</div>`
        : `<p class="small muted" style="margin:0 0 10px">Сюда попадают продукты, которых нет в базе, — например, твой любимый йогурт с цифрами с этикетки.</p>`}
      <button class="btn ghost block" data-act="add-food" style="margin-top:10px">Добавить продукт</button>`;

    $('#setBackup').innerHTML = `<h2>Резервная копия</h2>
      <p class="small" style="margin:0 0 12px">Записи хранятся только на этом телефоне. Если удалить приложение с экрана «Домой», они пропадут. Иногда сохраняй копию в «Файлы».</p>
      <p class="tiny muted" style="margin:0 0 12px">${S.settings.lastBackup ? 'Последняя копия: ' + fmtLong(S.settings.lastBackup) : 'Копию ещё не сохраняли.'}</p>
      <div class="row-btns"><button class="btn" data-act="export">Сохранить копию</button><button class="btn plain" data-act="import">Восстановить</button></div>`;

    $('#setDanger').innerHTML = `<h2>Данные</h2>${ui.delArm === 'all'
      ? `<p class="small" style="margin:0 0 10px">Удалить все записи, замеры и настройки? Это нельзя отменить.</p><div class="row-btns"><button class="btn danger" data-act="wipe-confirm">Да, удалить всё</button><button class="btn plain" data-act="wipe-cancel">Отмена</button></div>`
      : `<button class="btn danger block" data-act="wipe">Удалить все данные</button>`}`;
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
  function openSheet(html, onClose) {
    $('#sheet').innerHTML = '<div class="grab"></div>' + html;
    $('#backdrop').hidden = false;
    sheetClose = onClose || null;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#backdrop').hidden = true;
    $('#sheet').innerHTML = '';
    document.body.style.overflow = '';
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
    el.innerHTML = `<button class="actmini" data-act="goto-act"><span class="wic">${actIcon(ws.length ? ws[0].type : 'walk')}</span><span>${parts.length ? parts.join(' · ') : '<span class="muted">Добавить шаги или тренировку</span>'}${ws.length ? ' ' + GEM : ''}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>`;
  }

  function renderAct() {
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
      return `<button class="wday ${d === ui.day ? 'sel' : ''}" data-act="act-day" data-day="${d}" ${d > t ? 'disabled' : ''} aria-label="${fmtDay(d)}${n ? ', тренировка' : ''}"><span class="wd">${WD[i]}</span><span class="wg">${n ? GEM : '<i></i>'}</span><span class="ws num">${a.steps ? stepsK(a.steps) : '·'}</span></button>`;
    }).join('');
    const isThis = ws0 === weekStart(t);
    $('#actWeek').innerHTML = `<h2>${isThis ? 'Эта неделя' : 'Неделя с ' + fmtLong(ws0)}</h2><div class="week">${cells}</div>
      <p class="small" style="margin:12px 0 0">${nW ? `<b>${nW}</b> ${plural(nW, 'тренировка', 'тренировки', 'тренировок')}${mins ? ' · ' + fmtMin(mins) : ''}` : 'Тренировок пока нет'}${stepN ? ` · в среднем <b class="num">${nf(stepSum / stepN)}</b> шагов` : ''}</p>
      <p class="tiny muted" style="margin:4px 0 0">За каждый день с тренировкой — стразик.</p>`;

    const a = actDay(ui.day); const G = S.settings.stepGoal; const st = a.steps || 0;
    const sug = stepSuggest();
    let goalBlock = '';
    if (!G && sug) goalBlock = `<div class="helper"><div class="small">В среднем за неделю — <b class="num">${nf(sug.avg)}</b> шагов. Удобно прибавлять по 500 в неделю.</div><button class="btn ghost" data-act="step-goal-apply" data-g="${sug.goal}">Цель: ${nf(sug.goal)} шагов</button></div>`;
    else if (G && sug && sug.avg >= G && ui.day === t) goalBlock = `<div class="helper"><div class="small">Ты стабильно проходишь цель — в среднем <b class="num">${nf(sug.avg)}</b>. Можно прибавить 500.</div><button class="btn ghost" data-act="step-goal-apply" data-g="${G + 500}">Новая цель: ${nf(G + 500)}</button></div>`;
    $('#actSteps').innerHTML = `<h2>Шаги</h2>
      <div><span class="baseline-big">${a.steps ? nf(a.steps) : '—'}</span>${G ? ` <span class="muted">из ${nf(G)}</span>` : ''}${G && st >= G ? ' ' + GEM : ''}</div>
      ${G ? `<div class="bar accent" style="margin-top:10px"><i style="width:${Math.min(100, st / G * 100)}%"></i></div>` : ''}
      <div class="setrow" style="margin-top:12px"><label class="field"><span>Шагов за ${ui.day === t ? 'сегодня' : fmtLong(ui.day)}</span><input id="stepsIn" type="text" inputmode="numeric" value="${a.steps || ''}" placeholder="например, 7500"></label><button class="btn" data-act="steps-save">Сохранить</button></div>
      <p class="hint">Число — из приложения «Здоровье» или с часов. Удобно вписывать вечером.</p>
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
- Названия короткие, по-русски, с заглавной буквы: «Гречка отварная», «Куриная котлета».
- Если еды на фото нет, верни пустой список.
Ответь только JSON, без пояснений и без markdown:
{"items":[{"name":"Гречка отварная","grams":180,"kcal":198,"protein":7.6,"fat":2.0,"carbs":37.8}],"note":"коротко, в чём не уверен, или пустая строка"}`;

  async function claudeCall(cfg, content, maxTokens) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.model || AI_MODELS[0][0], max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
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
    return ((data && data.content) || []).filter(b => b.type === 'text').map(b => b.text).join('');
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
  function parseAi(txt) {
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    let o = null;
    if (a >= 0 && b > a) { try { o = JSON.parse(txt.slice(a, b + 1)); } catch (e) { o = null; } }
    if (!o || !Array.isArray(o.items)) throw new Error('Claude ответил не в том формате. Попробуй ещё раз.');
    const items = o.items.map(x => {
      const g = Math.max(1, Math.round(+x.grams || 100));
      const k = Math.max(0, +x.kcal || 0), P = Math.max(0, +x.protein || 0), F = Math.max(0, +x.fat || 0), Cc = Math.max(0, +x.carbs || 0);
      const name = String(x.name || 'Блюдо').trim().slice(0, 60);
      return { fid: null, ai: true, ph: { k: k / g * 100, p: P / g * 100, f: F / g * 100, c: Cc / g * 100 },
        name: name.charAt(0).toUpperCase() + name.slice(1), grams: g, kcal: Math.round(k), p: r1(P), f: r1(F), c: r1(Cc), label: g + ' г · по фото', src: 'фото' };
    });
    return { items, note: String(o.note || '').trim().slice(0, 200) };
  }

  async function analyzePhoto() {
    const ph = ui.photo; if (!ph) return;
    const cfg = aiCfg();
    ph.state = 'loading'; ph.msg = ''; renderPreview();
    try {
      if (!ph.b64) ph.b64 = await downscale(ph.file, 1024, 0.82);
      const txt = await claudeCall(cfg, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: ph.b64 } }, { type: 'text', text: PHOTO_PROMPT }], 1024);
      if (ui.photo !== ph) return; // фото уже убрали
      const r = parseAi(txt);
      ph.state = 'done'; ph.note = r.note;
      ui.photoItems = r.items;
      if (!r.items.length) { ph.state = 'error'; ph.msg = 'Еды на фото не нашлось.'; }
    } catch (e) {
      if (ui.photo !== ph) return;
      ph.state = 'error'; ph.msg = e.message || 'Что-то пошло не так.';
    }
    reparse();
  }

  function photoRow() {
    const ph = ui.photo; if (!ph) return '';
    const body = ph.state === 'loading' ? '<span class="spin" aria-hidden="true"></span> Claude смотрит на фото…'
      : ph.state === 'error' ? `<span style="color:var(--warn)">${esc(ph.msg)}</span> <button class="linkbtn small" data-act="photo-retry">Ещё раз</button>`
      : `Распознано по фото${ph.note ? ': ' + esc(ph.note) : ''}. Проверь граммы перед записью.`;
    return `<div class="phrow"><img src="${ph.url}" alt="Фото еды"><div class="small" style="min-width:0">${body}</div><button class="xbtn" data-act="photo-del" aria-label="Убрать фото">${IC.x}</button></div>`;
  }

  function aiCard() {
    const cfg = aiCfg();
    const model = cfg.model || AI_MODELS[0][0];
    return `<h2>Распознавание по фото</h2>
      <p class="small" style="margin:0 0 12px">Фото еды отправляется в Claude, он оценивает граммы и КБЖУ. Нужен ключ Claude API — он хранится только на этом телефоне и не попадает в резервную копию.</p>
      <label class="field"><span>${cfg.key ? 'Ключ сохранён: ' + esc(cfg.key.slice(0, 10)) + '…' + esc(cfg.key.slice(-4)) + '. Чтобы заменить — вставь новый' : 'Ключ Claude API'}</span><input id="aiKey" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <div class="field" style="margin-top:10px"><span>Модель</span><div class="chips">${AI_MODELS.map(([id, n]) => `<button class="seg" data-act="ai-model" data-m="${id}" aria-pressed="${model === id}">${n}</button>`).join('')}</div></div>
      <div class="row-btns" style="margin-top:12px"><button class="btn" data-act="ai-save">Сохранить ключ</button>${cfg.key ? '<button class="btn plain" data-act="ai-test">Проверить</button><button class="btn danger" data-act="ai-clear">Удалить</button>' : ''}</div>
      <p class="hint" id="aiRes"></p>
      <p class="tiny muted" style="margin:8px 0 0">Каждое фото — платный запрос к Claude API, обычно меньше цента. Оценка по фото примерная.</p>`;
  }

  // ---------- Тост ----------
  let toastTimer = null;
  function toast(msg, undo, shiny) {
    const el = $('#toast');
    el.innerHTML = `${shiny ? '<svg class="gem" viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px"><use href="#gem"/></svg>' : ''}<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Отменить</button>' : ''}`;
    el.hidden = false;
    el._undo = undo || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; el._undo = null; }, undo ? 5000 : 2600);
  }

  // ---------- Действия ----------
  function reparse() {
    const text = $('#food').value;
    if (!text.trim()) { ui.draft = ui.photoItems.slice(); renderPreview(); return; }
    const r = C.parse(text, S.custom);
    ui.draft = r.items.concat(ui.photoItems);
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
    ui.photo = null; ui.photoItems = [];
    $('#food').value = left.map(u => u.src).join(', ');
    ui.draft = left;
    ui.mealTouched = false;
    const sum = added.reduce((s, a) => s + a.k, 0);
    render();
    if (!left.length) $('#food').blur();
    toast(`Записано: ${nf(sum)} ккал`, () => undoAdd(added));
  }

  const actions = {
    'day-prev'() { ui.day = addDays(ui.day, -1); ui.followToday = false; render(); },
    'day-next'() { if (ui.day < today()) { ui.day = addDays(ui.day, 1); ui.followToday = ui.day === today(); render(); } },
    'day-today'() { ui.day = today(); ui.followToday = true; render(); },
    meal(b) { ui.meal = b.dataset.m; ui.mealTouched = true; renderMeals(); renderPreview(); renderQuick(); },
    'draft-del'(b) { const it = ui.draft[+b.dataset.idx]; ui.photoItems = ui.photoItems.filter(x => x !== it); ui.draft.splice(+b.dataset.idx, 1); if (!ui.draft.filter(x => !x.ai).length) $('#food').value = ''; renderPreview(); },
    commit() { commitDraft(); },
    quick(b) {
      const list = $('#quickWrap')._list || [];
      const q = list[+b.dataset.i]; if (!q) return;
      const added = addEntries([{ n: q.n, g: q.g, k: q.k, p: q.p, f: q.f, c: q.c, fid: q.fid, l: q.l, dr: q.dr, ph: q.ph }], ui.meal);
      render();
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
    'goto-limit'() { S.settings.baselineDismissed = true; save(); ui.view = 'more'; render(); setTimeout(() => { const i = $('#sLimit'); i && i.focus(); }, 50); },
    'goto-protein'() { ui.view = 'more'; render(); setTimeout(() => { const i = $('#setProtein'); i && i.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 50); },
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
    'save-fat'() { const v = num($('#sFat').value); S.settings.fat = v ? Math.round(v) : null; save(); toast(v ? `Цель по жирам: ${Math.round(v)} г` : 'Цель по жирам убрана'); render(); },
    'add-food'(b) { foodSheet(b.dataset.name || ''); },
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
    'onb-limit'() { S.settings.onboarded = true; save(); closeSheet(); ui.view = 'more'; render(); setTimeout(() => { const i = $('#sLimit'); i && i.focus(); }, 80); },
    'sheet-close'() { closeSheet(); },
    undo() { const el = $('#toast'); const f = el._undo; el.hidden = true; el._undo = null; if (f) f(); },
    export() { exportData(); },
    import() { $('#importFile').value = ''; $('#importFile').click(); },
    wipe() { ui.delArm = 'all'; renderMore(); },
    'wipe-cancel'() { ui.delArm = null; renderMore(); },
    'wipe-confirm'() { try { localStorage.removeItem(AI_STORE); } catch (e) { /* нет доступа */ } ui.photo = null; ui.photoItems = []; S = blank(); S.settings.onboarded = true; ui.delArm = null; save(); ui.draft = []; $('#food').value = ''; render(); toast('Все данные удалены'); },
    'import-confirm'() { const d = $('#sheet')._import; if (!d) return; S = Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings || {}) }); save(); closeSheet(); render(); toast('Данные восстановлены'); },
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
      toast(isNew ? 'Тренировка записана' : 'Сохранено', null, isNew);
    },
    'wk-open'(b) { wkDetail(b.dataset.day, b.dataset.id); },
    'wk-edit'(b) { const w = actDay(b.dataset.day).w.find(x => x.id === b.dataset.id); if (!w) return; wk = wkFromRecord(w, b.dataset.day); wkSheet(); },
    'wk-repeat'(b) {
      const w = actDay(b.dataset.day).w.find(x => x.id === b.dataset.id); if (!w) return;
      const copy = JSON.parse(JSON.stringify(w)); copy.id = uid(); copy.t = Date.now(); copy.note = '';
      actDayMut(today()).w.push(copy); save(); closeSheet(); render(); toast('Добавлено на сегодня');
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
    'goto-ai'() { closeSheet(); ui.view = 'more'; render(); setTimeout(() => { const c = $('#setAi'); c && c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); },
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

  // ---------- События ----------
  const KEEP_FOCUS = new Set(['photo', 'meal', 'draft-del', 'es-step', 'es-meal', 'ff-mode', 'wk-type', 'wk-int', 'wk-set-add', 'wk-ex-add', 'wk-set-del', 'wk-ex-del', 'wk-ex-copy']);
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('.tab');
    if (tab) { ui.view = tab.dataset.tab; ui.delArm = null; if ((ui.view === 'today' || ui.view === 'act') && ui.followToday) ui.day = today(); render(); window.scrollTo(0, 0); return; }
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
    if (ev.target.id === 'foodForm') {
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
      if (ui.view === 'today') reparse(); else render();
    }
  });

  // Прячем нижнюю панель, пока открыта клавиатура
  document.addEventListener('focusin', ev => { if (ev.target.matches('input, textarea')) document.body.classList.add('kb'); });
  document.addEventListener('focusout', () => { setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea')) document.body.classList.remove('kb'); }, 60); });

  // После полуночи «Сегодня» переключается на новый день
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (ui.followToday && ui.day !== today()) { ui.day = today(); ui.meal = autoMeal(); render(); }
      else if (!ui.mealTouched && !ui.draft.length) { ui.meal = autoMeal(); if (ui.view === 'today') { renderMeals(); renderPreview(); renderQuick(); } }
    }
  });

  // ---------- Запуск ----------
  render();
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
