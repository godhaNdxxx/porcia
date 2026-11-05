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
      settings: { limits: [], protein: null, fat: null, onboarded: false, stallDismissed: null, baselineDismissed: false, weighSnooze: null, lastBackup: null },
      log: {}, custom: [], body: [], favs: [],
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
  function labelFor(food, g) {
    const u = food.units && food.units.pc;
    const gl = g + (food.drink ? ' мл' : ' г');
    if (u && !food.drink && Math.abs(g / u - Math.round(g / u)) < 0.01 && g / u <= 20) return Math.round(g / u) + ' шт · ' + gl;
    return gl;
  }

  // ---------- Состояние интерфейса ----------
  const ui = { view: 'today', day: today(), meal: autoMeal(), mealTouched: false, draft: [], delArm: null, followToday: true };

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
    else if (ui.view === 'body') renderBody();
    else renderMore();
  }

  function renderToday() {
    const t = today();
    $('#dayTitle').textContent = fmtDay(ui.day);
    $('#dayNext').disabled = ui.day >= t;
    $('#foodLbl').textContent = ui.day === t ? 'Что съела?' : ui.day === addDays(t, -1) ? 'Что съела вчера?' : 'Что съела ' + fmtLong(ui.day) + '?';
    renderSummary();
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
          <circle class="val" cx="64" cy="64" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - frac)).toFixed(1)}" ${t.kcal === 0 ? 'opacity="0"' : ''}/></svg>
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
    const has = ui.draft.length > 0;
    $('#foodHint').hidden = has || $('#food').value.trim().length > 0;
    if (!has) { el.innerHTML = ''; return; }
    const known = ui.draft.filter(i => !i.unknown);
    const rows = ui.draft.map((it, idx) => {
      if (it.unknown) {
        return `<div class="punk"><div><div class="nm">«${esc(it.src)}» — не нашла</div><div class="tiny muted">Добавь продукт с калорийностью, и я его запомню. Или напиши так: «${esc(it.name || 'блюдо')} 300 ккал».</div></div>
          <button class="btn ghost" style="min-height:38px;padding:8px 12px" data-act="add-food" data-name="${esc(it.name || it.src)}">Добавить</button></div>`;
      }
      const gram = it.fid
        ? `<label class="gram"><input type="text" inputmode="numeric" value="${it.grams}" data-idx="${idx}" aria-label="Граммы: ${esc(it.name)}"><span>${it.drink ? 'мл' : 'г'}</span></label>`
        : `<span class="tiny muted">вручную</span>`;
      return `<div class="pitem" data-idx="${idx}"><div style="min-width:0"><div class="nm">${esc(it.name)}</div><div class="sub" data-sub="${idx}"><span class="num">${nf(it.kcal)}</span> ккал · <span class="pr">белок ${g1(it.p)} г</span></div></div>${gram}<button class="xbtn" data-act="draft-del" data-idx="${idx}" aria-label="Убрать ${esc(it.name)}">${IC.x}</button></div>`;
    }).join('');
    const t = previewTotals();
    el.innerHTML = rows + (known.length ? `<div class="ptotal"><span>Итого: <b class="num" id="ptK">${nf(t.kcal)}</b> ккал</span><span class="small" style="color:var(--protein)">белок <span class="num" id="ptP">${g1(t.p)}</span> г</span></div>
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
  function tpl(e) { return { fid: e.fid || null, n: e.n, g: e.g, k: e.k, p: e.p, f: e.f, c: e.c, l: e.l, dr: e.dr || 0 }; }
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
    if (!items.length) { el.innerHTML = `<h2>Записи</h2><div class="empty">Здесь появится всё, что ты съешь за день.</div>`; return; }
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
    const days = new Set(Object.keys(S.log).filter(d => S.log[d].length));
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
      : `<h2>Последние 7 дней</h2><div class="empty">Пока нет записей. Начни с экрана «Сегодня».</div>`;
    const maxK = Math.max(1, ...list.map(d => totals(dayItems(d)).kcal));
    $('#diaryList').innerHTML = list.map(d => {
      const items = dayItems(d); const tt = totals(items); const L = limitFor(d);
      const base = L || maxK;
      const w = Math.min(100, tt.kcal / base * 100);
      const over = L && tt.kcal > L;
      return `<button class="drow" data-act="open-day" data-day="${d}"><span class="d">${fmtDay(d)}</span>
        <span class="v">${nf(tt.kcal)} <small>${L ? '/ ' + nf(L) : 'ккал'}</small></span>
        <div class="bar ${over ? 'over' : 'accent'}"><i style="width:${w}%"></i></div>
        <div class="meta"><span style="color:var(--protein)">белок ${g1(tt.p)} г</span><span>жиры ${g1(tt.f)} г</span><span>${items.length} ${plural(items.length, 'запись', 'записи', 'записей')}</span></div></button>`;
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
    $('#bodyChart').innerHTML = `<h2>Вес</h2>` + (w.length >= 2 ? chartSvg(w) : `<div class="empty">График появится после второго замера.</div>`);
    if (!$('#bDate').value) $('#bDate').value = today();
    $('#bDate').max = today();
    const all = S.body.slice().sort((a, b) => a.d < b.d ? 1 : -1);
    if (!all.length) { $('#bodyList').innerHTML = `<h2>История</h2><div class="empty">Замеров пока нет.</div>`; return; }
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
    openSheet(`<h2>${first ? 'Привет! Это «Порция»' : 'Как это работает'}</h2>
      <p class="muted small" style="margin:0 0 14px">Пишешь, что съела, обычными словами — приложение считает калории и белок.</p>
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
    const food = foodOf(e.fid);
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

  // ---------- Тост ----------
  let toastTimer = null;
  function toast(msg, undo) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Отменить</button>' : ''}`;
    el.hidden = false;
    el._undo = undo || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; el._undo = null; }, undo ? 5000 : 2600);
  }

  // ---------- Действия ----------
  function reparse() {
    const text = $('#food').value;
    if (!text.trim()) { ui.draft = []; renderPreview(); return; }
    const r = C.parse(text, S.custom);
    ui.draft = r.items;
    if (r.meal && !ui.mealTouched && r.meal !== ui.meal) { ui.meal = r.meal; renderMeals(); renderQuick(); }
    renderPreview();
  }
  function addEntries(list, meal) {
    const arr = S.log[ui.day] || (S.log[ui.day] = []);
    const t = Date.now();
    const added = list.map(i => ({ id: uid(), t, m: meal, n: i.n, g: i.g, k: i.k, p: i.p, f: i.f, c: i.c, fid: i.fid || null, l: i.l, dr: i.dr || 0 }));
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
    const added = addEntries(ok.map(i => ({ n: i.name, g: i.grams, k: i.kcal, p: i.p, f: i.f, c: i.c, fid: i.fid, l: i.label, dr: i.drink ? 1 : 0 })), ui.meal);
    const left = ui.draft.filter(i => i.unknown);
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
    'draft-del'(b) { ui.draft.splice(+b.dataset.idx, 1); if (!ui.draft.length) $('#food').value = ''; renderPreview(); },
    commit() { commitDraft(); },
    quick(b) {
      const list = $('#quickWrap')._list || [];
      const q = list[+b.dataset.i]; if (!q) return;
      const added = addEntries([{ n: q.n, g: q.g, k: q.k, p: q.p, f: q.f, c: q.c, fid: q.fid, l: q.l, dr: q.dr }], ui.meal);
      render();
      toast(`${q.n}: ${nf(q.k)} ккал — ${MEAL_TO[ui.meal]}`, () => undoAdd(added));
    },
    entry(b) { entrySheet(b.dataset.id); },
    'es-step'(b) {
      const inp = $('#esG'); const v = Math.max(1, Math.round((num(inp.value) || 0) + +b.dataset.d)); inp.value = v;
      const e = dayItems(ui.day).find(x => x.id === $('#sheet').querySelector('[data-act="es-save"]').dataset.id);
      updateEntrySheetInfo(e, foodOf(e && e.fid));
    },
    'es-meal'(b) { $('#sheet').dataset.meal = b.dataset.m; $('#sheet').querySelectorAll('[data-act="es-meal"]').forEach(x => x.setAttribute('aria-pressed', x === b)); },
    'es-save'(b) {
      const e = dayItems(ui.day).find(x => x.id === b.dataset.id); if (!e) return;
      const food = foodOf(e.fid);
      if (food) {
        const g = Math.max(1, Math.round(num($('#esG').value) || e.g));
        const n = C.nutrientsFor(food, g);
        Object.assign(e, { g, k: n.kcal, p: n.p, f: n.f, c: n.c, l: labelFor(food, g) });
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
    'wipe-confirm'() { S = blank(); S.settings.onboarded = true; ui.delArm = null; save(); ui.draft = []; $('#food').value = ''; render(); toast('Все данные удалены'); },
    'import-confirm'() { const d = $('#sheet')._import; if (!d) return; S = Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings || {}) }); save(); closeSheet(); render(); toast('Данные восстановлены'); },
  };

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
  const KEEP_FOCUS = new Set(['meal', 'draft-del', 'es-step', 'es-meal', 'ff-mode']);
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('.tab');
    if (tab) { ui.view = tab.dataset.tab; ui.delArm = null; if (ui.view === 'today' && ui.followToday) ui.day = today(); render(); window.scrollTo(0, 0); return; }
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
    const idx = +inp.dataset.idx; const it = ui.draft[idx]; if (!it || !it.fid) return;
    const food = foodOf(it.fid); const g = Math.max(1, Math.round(num(inp.value) || 0));
    if (!food || !num(inp.value)) return;
    const n = C.nutrientsFor(food, g);
    Object.assign(it, { grams: g, kcal: n.kcal, p: n.p, f: n.f, c: n.c, label: labelFor(food, g) });
    const sub = document.querySelector(`[data-sub="${idx}"]`);
    if (sub) sub.innerHTML = `<span class="num">${nf(it.kcal)}</span> ккал · <span class="pr">белок ${g1(it.p)} г</span>`;
    const t = previewTotals();
    if ($('#ptK')) $('#ptK').textContent = nf(t.kcal);
    if ($('#ptP')) $('#ptP').textContent = g1(t.p);
  });

  document.addEventListener('input', ev => {
    if (ev.target.id === 'hW' || ev.target.id === 'hBf') updateProteinHelper();
    if (ev.target.id === 'esG') { const e = dayItems(ui.day).find(x => x.id === $('#sheet').querySelector('[data-act="es-save"]').dataset.id); updateEntrySheetInfo(e, foodOf(e && e.fid)); }
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
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
