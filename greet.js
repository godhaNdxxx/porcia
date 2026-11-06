/* Порция — приветствие при открытии. 10 заставок, показываются не при каждом входе. */
(function () {
  'use strict';
  const STORE = 'porcia.greet';
  const GAP = 3 * 3600e3;   // показывать, если не заходила 3 часа и больше
  const EVERY = 2;          // одна заставка показывается 2 раза подряд, потом следующая
  const DUR = 3000, OUT = 700;

  const GREET = { morning: 'Доброе утро', day: 'Добрый день', evening: 'Добрый вечер', night: 'Доброй ночи' };
  const V = [
    { id: 'moon', name: 'Лунная ночь', when: ['evening', 'night'], sub: { evening: 'Пусть вечер будет уютным', night: 'Звёзды уже зажглись' } },
    { id: 'bear', name: 'Мишка с шариком', sub: 'Мишка соскучился' },
    { id: 'uni', name: 'Единорог и радуга', sub: 'Сегодня всё получится' },
    { id: 'box', name: 'Шкатулка', sub: 'Пора собирать стразики' },
    { id: 'waves', name: 'Перламутр', sub: 'Как хорошо, что ты здесь' },
    { id: 'bunny', name: 'Зайка с сердечком', sub: 'Зайка уже ждёт' },
    { id: 'stars', name: 'Звездопад', when: ['evening', 'night'], sub: 'Загадай желание' },
    { id: 'bubbles', name: 'Мыльные пузыри', sub: 'Пусть всё будет легко' },
    { id: 'bloom', name: 'Сакура', sub: 'Ты сегодня прекрасна' },
    { id: 'crown', name: 'Диадема', sub: 'Корона уже на месте' },
  ];
  const byId = id => V.find(v => v.id === id);
  const todOf = (d = new Date()) => { const h = d.getHours(); return h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 23 ? 'evening' : 'night'; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const GEMS = ['pg-gem', 'pg-gem-lilac', 'pg-gem-blue', 'pg-gem-mint', 'pg-gem-gold', 'pg-gem-ruby'];
  const ico = (id, cls, style) => `<svg class="${cls}" style="${style || ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;
  const pic = (vb, cls, inner, style) => `<svg class="${cls}" style="${style || ''}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;

  // ---------- Картинки ----------
  const GEM_PATH = 'M12 2.5l6.7 2.8 2.8 6.7-2.8 6.7-6.7 2.8-6.7-2.8L2.5 12l2.8-6.7z';
  const SPRITE = `<svg id="pg-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="pg-gF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3F1"/><stop offset=".5" stop-color="#F3A9D0"/><stop offset="1" stop-color="#B7A4FF"/></linearGradient>
    <linearGradient id="pg-gF-lilac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2E6FF"/><stop offset=".5" stop-color="#C6A6FF"/><stop offset="1" stop-color="#8E7CF0"/></linearGradient>
    <linearGradient id="pg-gF-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E3F3FF"/><stop offset=".5" stop-color="#94C8F5"/><stop offset="1" stop-color="#7F92FF"/></linearGradient>
    <linearGradient id="pg-gF-mint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0FFF3"/><stop offset=".5" stop-color="#86DDBE"/><stop offset="1" stop-color="#5EAFE0"/></linearGradient>
    <linearGradient id="pg-gF-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6D2"/><stop offset=".5" stop-color="#F6CC62"/><stop offset="1" stop-color="#EE9460"/></linearGradient>
    <linearGradient id="pg-gF-ruby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE2E6"/><stop offset=".5" stop-color="#F38FA4"/><stop offset="1" stop-color="#C9579A"/></linearGradient>
    <radialGradient id="pg-gCore" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".25"/></radialGradient>
    <linearGradient id="pg-spF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4FB"/><stop offset="1" stop-color="#FFC2E0"/></linearGradient>
    <linearGradient id="pg-spF2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC2E0"/><stop offset="1" stop-color="#B49CFF"/></linearGradient>
    <radialGradient id="pg-bead" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#F7B9DA"/><stop offset="1" stop-color="#A98BF0"/></radialGradient>
    <linearGradient id="pg-moonF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6D6"/><stop offset="1" stop-color="#FFD98A"/></linearGradient>
    <linearGradient id="pg-goldF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0B3"/><stop offset=".55" stop-color="#F6C75E"/><stop offset="1" stop-color="#E89A4C"/></linearGradient>
    <linearGradient id="pg-hornF" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#F3B95F"/></linearGradient>
    <linearGradient id="pg-balF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC8E0"/><stop offset="1" stop-color="#E86FA6"/></linearGradient>
    <linearGradient id="pg-boxF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8A6F4"/><stop offset="1" stop-color="#9A72DC"/></linearGradient>
    <linearGradient id="pg-lidF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9C0FA"/><stop offset="1" stop-color="#B58DEB"/></linearGradient>
    <linearGradient id="pg-pillowF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBD3E6"/><stop offset="1" stop-color="#E89BC2"/></linearGradient>
  </defs>
    <symbol id="pg-gemShape" viewBox="0 0 24 24"><path d="M12 7l3.5 1.5L17 12l-1.5 3.5L12 17l-3.5-1.5L7 12l1.5-3.5z" fill="url(#pg-gCore)" opacity=".92"/><path d="M12 2.5V7M18.7 5.3l-3.2 3.2M21.5 12H17M18.7 18.7l-3.2-3.2M12 21.5V17M5.3 18.7l3.2-3.2M2.5 12H7M5.3 5.3l3.2 3.2" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/><circle cx="9.4" cy="8.7" r="1.3" fill="#fff"/></symbol>
    ${['', '-lilac', '-blue', '-mint', '-gold', '-ruby'].map(c => `<symbol id="pg-gem${c}" viewBox="0 0 24 24"><path d="${GEM_PATH}" fill="url(#pg-gF${c})"/><use href="#pg-gemShape"/></symbol>`).join('')}
    <symbol id="pg-spark" viewBox="0 0 24 24"><path d="M12 1.5c.7 5.6 3.4 8.6 10.5 10.5-7.1 1.9-9.8 4.9-10.5 10.5-.7-5.6-3.4-8.6-10.5-10.5C8.6 10.1 11.3 7.1 12 1.5z" fill="url(#pg-spF)"/></symbol>
    <symbol id="pg-spark2" viewBox="0 0 24 24"><path d="M12 1.5c.7 5.6 3.4 8.6 10.5 10.5-7.1 1.9-9.8 4.9-10.5 10.5-.7-5.6-3.4-8.6-10.5-10.5C8.6 10.1 11.3 7.1 12 1.5z" fill="url(#pg-spF2)"/></symbol>
    <symbol id="pg-heartp" viewBox="0 0 24 22"><path d="M12 21C5 16 1 12 1 7.2 1 3.8 3.6 1.2 6.8 1.2c2.2 0 4 1.1 5.2 3 1.2-1.9 3-3 5.2-3 3.2 0 5.8 2.6 5.8 6 0 4.8-4 8.8-11 13.8z" fill="url(#pg-balF)"/><path d="M5.5 5.2c-1 .8-1.4 2-1.2 3.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".75"/></symbol>
    <symbol id="pg-petal" viewBox="0 0 20 20"><path d="M10 1c5 4 7 10 0 18C3 11 5 5 10 1z" fill="#FFB7D2"/><path d="M10 4c1.6 3 1.8 7 0 11" stroke="#FFE1EC" stroke-width="1.4" fill="none" stroke-linecap="round"/></symbol>
  </svg>`;

  const pv = (v, d) => `var(${v},${d})`;
  const BEAR = `
    <ellipse cx="44" cy="111" rx="12" ry="7" style="fill:${pv('--plush-3', '#D5B8E8')}"/><ellipse cx="76" cy="111" rx="12" ry="7" style="fill:${pv('--plush-3', '#D5B8E8')}"/>
    <ellipse cx="60" cy="94" rx="29" ry="22" style="fill:${pv('--plush', '#E9D3F3')}"/>
    <ellipse cx="33" cy="90" rx="9" ry="13" transform="rotate(-28 33 90)" style="fill:${pv('--plush', '#E9D3F3')}"/>
    <ellipse cx="88" cy="80" rx="9" ry="13" transform="rotate(-150 88 80)" style="fill:${pv('--plush', '#E9D3F3')}"/>
    <path d="M60 107c-7-4.6-10.5-8.4-10.5-12.2 0-2.6 2-4.6 4.6-4.6 2.4 0 4.3 1.3 5.9 3.4 1.6-2.1 3.5-3.4 5.9-3.4 2.6 0 4.6 2 4.6 4.6 0 3.8-3.5 7.6-10.5 12.2z" style="fill:${pv('--blush', '#F4A9C8')}"/>
    <circle cx="33" cy="27" r="12.5" style="fill:${pv('--plush', '#E9D3F3')}"/><circle cx="87" cy="27" r="12.5" style="fill:${pv('--plush', '#E9D3F3')}"/>
    <circle cx="33" cy="28" r="6.5" style="fill:${pv('--blush', '#F4A9C8')}"/><circle cx="87" cy="28" r="6.5" style="fill:${pv('--blush', '#F4A9C8')}"/>
    <ellipse cx="60" cy="52" rx="35" ry="31" style="fill:${pv('--plush', '#E9D3F3')}"/>
    <path d="M60 22.5v11" style="stroke:${pv('--plush-3', '#D5B8E8')}" stroke-width="1.6" stroke-dasharray="2.4 2.4" stroke-linecap="round"/>
    <ellipse cx="60" cy="64" rx="15" ry="11" style="fill:${pv('--plush-2', '#F8EEFB')}"/>
    <ellipse cx="40" cy="61" rx="5.5" ry="3.4" style="fill:${pv('--blush', '#F4A9C8')}" opacity=".75"/><ellipse cx="80" cy="61" rx="5.5" ry="3.4" style="fill:${pv('--blush', '#F4A9C8')}" opacity=".75"/>
    <circle cx="46" cy="50" r="3.8" style="fill:${pv('--plush-ink', '#3B2C47')}"/><circle cx="74" cy="50" r="3.8" style="fill:${pv('--plush-ink', '#3B2C47')}"/>
    <circle cx="47.4" cy="48.6" r="1.3" fill="#fff"/><circle cx="75.4" cy="48.6" r="1.3" fill="#fff"/>
    <path d="M55.6 59.2c0-1.8 8.8-1.8 8.8 0 0 2.2-2.4 3.9-4.4 3.9s-4.4-1.7-4.4-3.9z" style="fill:${pv('--plush-ink', '#3B2C47')}"/>
    <path d="M60 63v2.6M60 65.6c-1.2 1.9-3.6 2.2-5 .8M60 65.6c1.2 1.9 3.6 2.2 5 .8" fill="none" style="stroke:${pv('--plush-ink', '#3B2C47')}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M77 21l-9-6.5v13zM77 21l9-6.5v13z" style="fill:${pv('--blush', '#F4A9C8')}"/><circle cx="77" cy="21" r="3.4" fill="url(#pg-bead)" stroke="#fff" stroke-width="1"/>`;
  const UNICORN = `
    <circle cx="96" cy="44" r="22" fill="#C9AEFF"/><circle cx="104" cy="70" r="19" fill="#F7A8CF"/><circle cx="98" cy="94" r="16" fill="#9FD3F7"/><circle cx="108" cy="112" r="12" fill="#FFD6A8"/>
    <path d="M58 86c-4 18-6 34-6 54h48c0-22-4-38-12-56z" fill="#FFF8FD"/>
    <ellipse cx="66" cy="66" rx="34" ry="28" transform="rotate(-18 66 66)" fill="#FFF8FD"/>
    <ellipse cx="40" cy="80" rx="20" ry="15" transform="rotate(-18 40 80)" fill="#FFE1EE"/>
    <ellipse cx="31" cy="80" rx="2.2" ry="2.8" fill="#D88AB2"/><ellipse cx="41" cy="77" rx="2.2" ry="2.8" fill="#D88AB2"/>
    <path d="M34 89c4 3 10 3 14-1" fill="none" stroke="#9C5C86" stroke-width="2" stroke-linecap="round"/>
    <path d="M74 32l9-18 7 20z" fill="#FFF8FD"/><path d="M77 30l6-11 4 12z" fill="#FFC6DE"/>
    <path d="M58 40L50 4l17 31z" fill="url(#pg-hornF)"/><path d="M53 16l9 4M55 24l9 4M57 31l8 3" stroke="#E7A04E" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M68 38c6-10 20-14 30-6-4 2-6 6-6 10-6-6-16-6-24-4z" fill="#F7A8CF"/><path d="M62 40c2-8 10-12 16-10-4 3-5 7-4 11-4-2-8-2-12-1z" fill="#C9AEFF"/>
    <path d="M60 64c3 4 9 4 12 0" fill="none" stroke="#3B2C47" stroke-width="2.4" stroke-linecap="round"/><path d="M61 66l-3 3M65 67.5l-1 3.6M70 66.5l1.5 3.4" stroke="#3B2C47" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="56" cy="76" rx="6" ry="3.6" fill="#F7A8CF" opacity=".7"/>
    <circle cx="62" cy="114" r="5" fill="url(#pg-bead)" stroke="#fff" stroke-width="1"/><path d="M57 110c-6-4-12-2-14 3M67 110c6-4 12-2 14 3" fill="none" stroke="#F7A8CF" stroke-width="4" stroke-linecap="round"/>`;
  const MOON = `
    <mask id="pg-moonCut"><rect width="120" height="120" fill="#fff"/><circle cx="86" cy="40" r="42" fill="#000"/></mask>
    <circle cx="60" cy="60" r="50" fill="url(#pg-moonF)" mask="url(#pg-moonCut)"/>
    <circle cx="30" cy="70" r="5" fill="#F6C46A" opacity=".5" mask="url(#pg-moonCut)"/><circle cx="44" cy="96" r="3.5" fill="#F6C46A" opacity=".5"/>
    <path d="M28 58c3 3 7 3 10 0" fill="none" stroke="#6A4A78" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M38 76c3 4 9 4 12 0" fill="none" stroke="#6A4A78" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="25" cy="68" rx="5" ry="3" fill="#F7A8CF" opacity=".8"/>`;
  const CLOUD = '<path d="M24 66C10 66 2 57 2 47c0-11 9-19 20-19 2-14 14-24 29-24 12 0 22 6 27 16 4-3 10-5 16-5 15 0 27 11 28 25h2c13 0 24 8 24 19s-10 17-22 17z" fill="#FFFFFF"/>';
  const BALLOON = '<path d="M40 92C22 80 6 66 6 46 6 32 16 22 28 22c6 0 10 3 12 7 2-4 6-7 12-7 12 0 22 10 22 24 0 20-16 34-34 46z" fill="url(#pg-balF)"/><path d="M22 34c-4 3-6 8-5 13" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".7"/><path d="M36 92l4 6 4-6z" fill="#E86FA6"/><path d="M40 98c-6 12 6 20 0 32s-8 14-14 20" stroke="#B48BD8" stroke-width="2" fill="none" stroke-linecap="round"/>';
  const BIGHEART = '<path d="M50 88C20 66 2 48 2 28 2 13 13 2 27 2c9 0 17 5 23 13C56 7 64 2 73 2c14 0 25 11 25 26 0 20-18 38-48 60z" fill="#FFFFFF"/>';
  const BOX = `
    <ellipse cx="85" cy="124" rx="70" ry="6" fill="#7A52B8" opacity=".18"/>
    <rect x="12" y="58" width="146" height="64" rx="14" fill="url(#pg-boxF)"/>
    <rect x="12" y="58" width="146" height="12" rx="6" fill="#F6CC62"/>
    <path d="M30 96c10-8 20 8 30 0s20 8 30 0 20 8 30 0 20 8 30 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M85 104c-6-4-9-7-9-10 0-2 2-4 4-4s3.5 1 5 3c1.5-2 3-3 5-3s4 2 4 4c0 3-3 6-9 10z" fill="#F6CC62"/>
    <g class="pg-lid"><rect x="8" y="34" width="154" height="26" rx="12" fill="url(#pg-lidF)"/><rect x="8" y="50" width="154" height="10" rx="5" fill="#F6CC62"/><circle cx="85" cy="40" r="6" fill="url(#pg-bead)" stroke="#fff" stroke-width="1.5"/></g>`;
  const BUNNY = `
    <g transform="rotate(-10 52 72)"><g class="pg-ear"><ellipse cx="52" cy="40" rx="15" ry="36" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="2"/><ellipse cx="52" cy="45" rx="7.5" ry="25" fill="#F9B8D3"/></g></g>
    <g transform="rotate(12 88 72)"><g class="pg-ear pg-ear-r"><ellipse cx="88" cy="40" rx="15" ry="36" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="2"/><ellipse cx="88" cy="45" rx="7.5" ry="25" fill="#F9B8D3"/></g></g>
    <ellipse cx="48" cy="170" rx="14" ry="7" fill="#F3DCEA"/><ellipse cx="92" cy="170" rx="14" ry="7" fill="#F3DCEA"/>
    <ellipse cx="70" cy="148" rx="42" ry="28" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="2"/>
    <ellipse cx="70" cy="100" rx="44" ry="37" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="2"/>
    <circle cx="54" cy="98" r="4.2" fill="#3B2C47"/><circle cx="86" cy="98" r="4.2" fill="#3B2C47"/>
    <circle cx="55.4" cy="96.6" r="1.4" fill="#fff"/><circle cx="87.4" cy="96.6" r="1.4" fill="#fff"/>
    <ellipse cx="43" cy="110" rx="7" ry="4" fill="#F9B8D3" opacity=".85"/><ellipse cx="97" cy="110" rx="7" ry="4" fill="#F9B8D3" opacity=".85"/>
    <path d="M66 105.5h8l-4 4.2z" fill="#F38FB4" stroke="#F38FB4" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M70 110v3M70 113c-1.5 2.5-4.5 2.8-6 1M70 113c1.5 2.5 4.5 2.8 6 1" stroke="#3B2C47" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M70 166c-10-6.5-15.5-12-15.5-17.5 0-3.8 2.9-6.6 6.6-6.6 3.6 0 6.4 2 8.9 5 2.5-3 5.3-5 8.9-5 3.7 0 6.6 2.8 6.6 6.6 0 5.5-5.5 11-15.5 17.5z" fill="url(#pg-balF)"/>
    <ellipse cx="53" cy="150" rx="9" ry="7" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="1.5"/><ellipse cx="87" cy="150" rx="9" ry="7" fill="#FFF6FA" stroke="#EBD3E4" stroke-width="1.5"/>
    <use href="#pg-gem-ruby" x="90" y="58" width="16" height="16"/>`;
  function starPath(cx, cy, R, r) {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = (-90 + k * 36) * Math.PI / 180, rr = k % 2 ? r : R;
      d += (k ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
    }
    return d + 'z';
  }
  const STAR = `
    <path d="${starPath(70, 72, 58, 30)}" fill="url(#pg-goldF)" stroke="#F6C75E" stroke-width="12" stroke-linejoin="round"/>
    <path d="M48 52c-4 4-5 9-4 13" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".7"/>
    <circle cx="58" cy="76" r="4.2" fill="#3B2C47"/><circle cx="82" cy="76" r="4.2" fill="#3B2C47"/>
    <circle cx="59.4" cy="74.6" r="1.4" fill="#fff"/><circle cx="83.4" cy="74.6" r="1.4" fill="#fff"/>
    <ellipse cx="50" cy="86" rx="6" ry="3.6" fill="#F7A8CF" opacity=".85"/><ellipse cx="90" cy="86" rx="6" ry="3.6" fill="#F7A8CF" opacity=".85"/>
    <path d="M65 86c3 3.5 7 3.5 10 0" stroke="#3B2C47" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  function flower(x, y, s, dl) {
    let p = '';
    for (let k = 0; k < 5; k++) p += `<ellipse cx="0" cy="-9" rx="7" ry="9.5" fill="#FFC3DA" transform="rotate(${k * 72})"/><ellipse cx="0" cy="-10" rx="3" ry="4.5" fill="#FFE3EE" transform="rotate(${k * 72})"/>`;
    let dots = '';
    for (let k = 0; k < 5; k++) { const a = (k * 72 + 36) * Math.PI / 180; dots += `<circle cx="${(Math.cos(a) * 5.5).toFixed(1)}" cy="${(Math.sin(a) * 5.5).toFixed(1)}" r="1.3" fill="#F28FB3"/>`; }
    return `<g transform="translate(${x} ${y}) scale(${s})"><g class="pg-fl" style="--dl:${dl}s">${p}<circle r="4.2" fill="#FFF0B8"/>${dots}</g></g>`;
  }
  const BRANCH = `
    <path class="pg-twig" d="M310 30C260 50 230 80 205 125S150 215 70 250" stroke="#9A6A78" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path class="pg-twig" d="M205 125c-25-6-45 0-62 16" stroke="#9A6A78" stroke-width="5" fill="none" stroke-linecap="round" style="--dl:.5s"/>
    <path class="pg-twig" d="M150 205c12 22 10 42-4 58" stroke="#9A6A78" stroke-width="5" fill="none" stroke-linecap="round" style="--dl:.6s"/>
    ${[[268, 46, 1.1, .5], [232, 92, .9, .6], [192, 148, 1.25, .72], [146, 142, .85, .82], [176, 196, 1, .9], [118, 228, 1.1, 1], [72, 248, .85, 1.1], [144, 262, .8, 1.18], [250, 72, .55, 1.25], [96, 214, .5, 1.3]]
      .map(([x, y, sc, dl]) => flower(x, y, sc * 1.45, dl)).join('')}
    <circle cx="214" cy="120" r="4" fill="#FF9EC4"/><circle cx="164" cy="218" r="3.5" fill="#FF9EC4"/><circle cx="286" cy="34" r="3.5" fill="#FF9EC4"/>`;
  function tiara() {
    const pts = [[22, 102], [34, 62], [52, 88], [72, 46], [88, 80], [100, 20], [112, 80], [128, 46], [148, 88], [166, 62], [178, 102]];
    let d = 'M' + pts.map(p => p.join(' ')).join(' L') + ' Q100 84 22 102z';
    let pearls = '';
    for (let x = 34; x <= 166; x += 11) { const t = (x - 22) / 156, y = 102 - 36 * t + 36 * t * t; pearls += `<circle cx="${x}" cy="${(y + 7).toFixed(1)}" r="3.3" fill="#FFFFFF" stroke="#F3D7EA" stroke-width=".8"/>`; }
    const gem = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#pg-gF${c})" stroke="#fff" stroke-width="1.2"/><circle cx="${x - r * .35}" cy="${y - r * .35}" r="${r * .3}" fill="#fff"/>`;
    const sp = (x, y, s, dl) => `<use class="pg-tsp" href="#pg-spark" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" style="--dl:${dl}s"/>`;
    return `<path d="${d}" fill="url(#pg-goldF)" stroke="#F6C75E" stroke-width="6" stroke-linejoin="round"/>
      <path d="M22 106Q100 88 178 106" stroke="#E89A4C" stroke-width="3" fill="none" opacity=".5"/>
      ${pearls}${gem(100, 36, 10, '-ruby')}${gem(72, 60, 7, '-lilac')}${gem(128, 60, 7, '-lilac')}${gem(36, 74, 5.5, '-blue')}${gem(164, 74, 5.5, '-blue')}${gem(100, 76, 6, '-mint')}
      ${sp(112, 22, 16, 1.2)}${sp(62, 46, 12, 1.4)}${sp(140, 48, 12, 1.55)}${sp(26, 64, 10, 1.7)}${sp(176, 64, 10, 1.8)}`;
  }
  const PILLOW = '<path d="M22 28Q110 2 198 28Q214 52 198 74Q110 98 22 74Q6 52 22 28z" fill="url(#pg-pillowF)"/><path d="M40 40Q110 22 180 40" stroke="#fff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/><circle cx="20" cy="26" r="6" fill="url(#pg-goldF)"/><circle cx="200" cy="26" r="6" fill="url(#pg-goldF)"/><circle cx="20" cy="76" r="6" fill="url(#pg-goldF)"/><circle cx="200" cy="76" r="6" fill="url(#pg-goldF)"/>';

  // ---------- Стили ----------
  const dk = (sel, body) => `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) ${sel}{${body}}}\n:root[data-theme="dark"] ${sel}{${body}}`;
  const CSS = `
.pg{position:absolute;inset:0;z-index:30;overflow:hidden;font-family:var(--font-body,-apple-system,system-ui,sans-serif);-webkit-user-select:none;user-select:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pg.pg-fixed{position:fixed;z-index:1000}
.pg svg{display:block;overflow:visible}
.pg-a{position:absolute}
.pg-out{animation:pgOut .7s cubic-bezier(.6,0,.4,1) forwards}
@keyframes pgOut{to{opacity:0;transform:scale(1.08);filter:blur(4px)}}
.pg-hello{position:absolute;left:24px;right:24px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:5}
.pg-h{font:800 31px/1.08 var(--font-display,ui-rounded,system-ui,sans-serif);letter-spacing:-.01em;animation:pgRise .7s .35s cubic-bezier(.2,.9,.3,1.2) both}
.pg-s{margin-top:8px;font-size:15px;opacity:.85;animation:pgRise .6s .6s ease-out both}
@keyframes pgRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.pg-sp{position:absolute;width:var(--s,14px);height:var(--s,14px);animation:pgTw var(--d,1.6s) var(--dl,0s) ease-in-out infinite both}
@keyframes pgTw{0%,100%{transform:scale(.3) rotate(0);opacity:.2}50%{transform:scale(1) rotate(20deg);opacity:1}}
.pg-gm{position:absolute;width:var(--s,18px);height:var(--s,18px)}
.pg-dot{width:var(--s,3px);height:var(--s,3px);border-radius:50%;background:#fff;box-shadow:0 0 6px #fff}
.pg-drift{animation:pgDrift var(--d,2.4s) var(--dl,0s) ease-out both}
@keyframes pgDrift{from{transform:translateY(40px);opacity:0}30%{opacity:1}to{transform:translateY(-120px);opacity:0}}
.pg-cloud{width:170px}
@keyframes pgCloudL{from{transform:translateX(-120%)}to{transform:none}}
@keyframes pgCloudR{from{transform:translateX(120%)}to{transform:none}}
@keyframes pgUp{from{transform:translateY(110%)}to{transform:none}}

/* 1 Луна */
.pg-v-moon{background:radial-gradient(120% 70% at 50% 110%,#E9A6D3 0%,#8A5BC8 35%,#3A2366 70%,#1E1338 100%);color:#fff}
.pg-v-moon .pg-moon{right:18px;top:calc(env(safe-area-inset-top,0px) + 170px);width:150px;animation:pgMoonIn 1.2s .1s cubic-bezier(.2,.9,.3,1.15) both,pgBob 3s 1.3s ease-in-out infinite}
@keyframes pgMoonIn{from{transform:translate(60px,-80px) rotate(-30deg) scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes pgBob{50%{transform:translateY(-6px) rotate(-3deg)}}
.pg-v-moon .pg-cloud{bottom:70px;left:0;opacity:.95;animation:pgCloudL 1.4s .2s ease-out both}
.pg-v-moon .pg-cloud.pg-c2{width:130px;right:-20px;left:auto;bottom:120px;animation-name:pgCloudR;opacity:.8}
.pg-fall{animation:pgFall var(--d,1.6s) var(--dl,0s) ease-in both}
@keyframes pgFall{from{transform:translate(0,-60px) rotate(0);opacity:0}20%{opacity:1}to{transform:translate(var(--dx,60px),var(--dy,360px)) rotate(360deg);opacity:0}}

/* 2 Мишка */
.pg-v-bear{background:linear-gradient(170deg,#FFE6F1 0%,#F6DDF5 45%,#E3D6FF 100%);color:#4A2A73}
.pg-v-bear .pg-bear{width:200px;left:50%;bottom:24px;margin-left:-100px;animation:pgUp 1s .15s cubic-bezier(.2,.9,.3,1.35) both}
.pg-v-bear .pg-balloon{width:82px;left:50%;bottom:190px;margin-left:40px;transform-origin:30% 100%;animation:pgBalloon 1.4s .5s cubic-bezier(.2,.8,.3,1) both,pgSway 2.6s 1.9s ease-in-out infinite}
@keyframes pgBalloon{from{transform:translateY(160px) scale(.4);opacity:0}to{transform:none;opacity:1}}
@keyframes pgSway{50%{transform:rotate(-6deg) translateY(-6px)}}
.pg-burst{left:50%;top:52%;animation:pgBurst 1.3s var(--dl,.9s) cubic-bezier(.1,.8,.3,1) both}
@keyframes pgBurst{from{transform:translate(-50%,-50%) scale(.2);opacity:0}15%{opacity:1}to{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) rotate(var(--r,200deg)) scale(1);opacity:.9}}
.pg-v-bear .pg-heartbg{left:50%;top:46%;width:260px;margin-left:-130px;opacity:.35;animation:pgPulse 1.6s .2s ease-out both}
@keyframes pgPulse{from{transform:scale(.3);opacity:0}60%{opacity:.45}to{transform:scale(1);opacity:.3}}
${dk('.pg-v-bear', 'background:linear-gradient(170deg,#2E1C40 0%,#3A2150 50%,#22183A 100%);color:#FBEFFF')}
${dk('.pg-v-bear .pg-heartbg path', 'fill:#B794F6')}

/* 3 Единорог */
.pg-v-uni{background:linear-gradient(180deg,#D9EBFF 0%,#F3E6FF 55%,#FFE3F0 100%);color:#45307A}
.pg-v-uni .pg-rainbow{left:-10%;width:120%;bottom:180px}
.pg-v-uni .pg-rainbow path{fill:none;stroke-linecap:round;stroke-dasharray:520;stroke-dashoffset:520;animation:pgDraw 1.1s ease-out forwards}
.pg-v-uni .pg-rainbow path:nth-child(2){animation-delay:.12s}.pg-v-uni .pg-rainbow path:nth-child(3){animation-delay:.24s}.pg-v-uni .pg-rainbow path:nth-child(4){animation-delay:.36s}.pg-v-uni .pg-rainbow path:nth-child(5){animation-delay:.48s}
@keyframes pgDraw{to{stroke-dashoffset:0}}
.pg-v-uni .pg-uni{width:200px;right:-6px;bottom:40px;transform-origin:50% 100%;animation:pgHop 1.1s .5s cubic-bezier(.2,.9,.3,1.3) both,pgNod 2.4s 1.8s ease-in-out infinite}
@keyframes pgHop{0%{transform:translate(140%,0)}60%{transform:translate(-6%,-30px)}100%{transform:none}}
@keyframes pgNod{50%{transform:rotate(-3deg)}}
.pg-v-uni .pg-cloud{width:150px;left:-20px;bottom:150px;animation:pgCloudL 1.2s .3s ease-out both}
.pg-v-uni .pg-cloud.pg-c2{width:120px;left:auto;right:10px;bottom:300px;animation:pgCloudR 1.2s .4s ease-out both}
${dk('.pg-v-uni', 'background:linear-gradient(180deg,#1F2350 0%,#3A2A66 55%,#5A2D5E 100%);color:#fff')}
${dk('.pg-v-uni .pg-cloud', 'opacity:.85')}

/* 4 Шкатулка */
.pg-v-box{background:radial-gradient(90% 60% at 50% 75%,#FFFFFF 0%,#F3E8FF 45%,#D9C4F5 100%);color:#4A2A73}
.pg-v-box .pg-glow{left:50%;bottom:120px;width:300px;height:300px;margin-left:-150px;border-radius:50%;background:radial-gradient(circle,rgba(255,220,245,.95) 0%,rgba(255,220,245,0) 65%);animation:pgGlow 1.2s .8s ease-out both}
@keyframes pgGlow{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
.pg-v-box .pg-box{width:170px;left:50%;margin-left:-85px;bottom:90px;animation:pgBoxIn .7s .1s cubic-bezier(.2,.9,.3,1.3) both}
@keyframes pgBoxIn{from{transform:translateY(60px) scale(.7);opacity:0}to{transform:none;opacity:1}}
.pg-lid{transform-box:fill-box;transform-origin:0% 100%;animation:pgLid .7s .75s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes pgLid{to{transform:rotate(-13deg) translate(-2px,-4px)}}
.pg-fly{left:50%;bottom:190px;animation:pgFly 1.4s var(--dl,1s) cubic-bezier(.2,.7,.4,1) both}
@keyframes pgFly{0%{transform:translate(-50%,0) scale(.3);opacity:0}15%{opacity:1}60%{transform:translate(calc(-50% + var(--dx)*.7),calc(var(--dy)*1.1)) scale(1.1) rotate(180deg)}100%{transform:translate(calc(-50% + var(--dx)),var(--dy)) scale(1) rotate(360deg);opacity:1}}
.pg-v-box .pg-h{background:linear-gradient(90deg,#6A3FB5 0%,#E26AA8 40%,#FFFFFF 50%,#E26AA8 60%,#6A3FB5 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pgRise .7s .35s cubic-bezier(.2,.9,.3,1.2) both,pgShine 2.2s .9s ease-in-out both}
@keyframes pgShine{from{background-position:100% 0}to{background-position:0 0}}
${dk('.pg-v-box', 'background:radial-gradient(90% 60% at 50% 75%,#4A2F70 0%,#2A1B40 55%,#17111F 100%);color:#F3E8FF')}
${dk('.pg-v-box .pg-glow', 'background:radial-gradient(circle,rgba(255,170,220,.45) 0%,rgba(255,170,220,0) 65%)')}
${dk('.pg-v-box .pg-h', 'background-image:linear-gradient(90deg,#E4D2FF 0%,#FF9CCB 40%,#FFFFFF 50%,#FF9CCB 60%,#E4D2FF 100%)')}

/* 5 Перламутр */
.pg-v-waves{background:#1A1226;color:#fff}
.pg-v-waves .pg-orb{left:-35%;width:170%;aspect-ratio:1;bottom:-380px;border-radius:50%;background:conic-gradient(from 200deg,#F7B6D8,#B79CFF,#8FD3F6,#FFD7A8,#F7B6D8);filter:blur(2px);animation:pgOrb 2.6s cubic-bezier(.2,.8,.2,1) both,pgSpin 12s linear infinite}
.pg-v-waves .pg-orb::after{content:"";position:absolute;inset:2.5%;border-radius:50%;background:radial-gradient(circle at 50% 30%,#3A2560 0%,#1A1226 60%)}
@keyframes pgOrb{from{transform:translateY(30%) scale(.9);opacity:0}to{transform:none;opacity:1}}
@keyframes pgSpin{to{rotate:360deg}}
.pg-v-waves .pg-haze{left:-20%;right:-20%;bottom:60px;height:300px;background:radial-gradient(60% 40% at 50% 60%,rgba(247,182,216,.55),rgba(183,156,255,.25) 50%,transparent 75%);animation:pgOrb 2s .2s ease-out both}
.pg-v-waves .pg-gm{animation:pgRise .8s var(--dl,1s) cubic-bezier(.2,.9,.3,1.3) both}

/* 6 Зайка */
.pg-v-bunny{background:linear-gradient(170deg,#E4FBF1 0%,#FDF0F6 50%,#FFDDEB 100%);color:#4A2A73}
.pg-v-bunny .pg-bunny{width:210px;left:50%;margin-left:-105px;bottom:10px;animation:pgUp 1s .15s cubic-bezier(.2,.9,.3,1.35) both}
.pg-ear{transform-box:fill-box;transform-origin:50% 100%;animation:pgEar 1.4s 1.1s ease-in-out infinite}
.pg-ear-r{animation-name:pgEarR;animation-delay:1.3s}
@keyframes pgEar{50%{transform:rotate(-9deg)}}
@keyframes pgEarR{50%{transform:rotate(9deg)}}
.pg-float{bottom:var(--b,200px);left:var(--x);width:var(--s,22px);height:var(--s,22px);animation:pgFloat var(--d,2.2s) var(--dl,.8s) ease-out both}
@keyframes pgFloat{from{transform:translateY(30px) scale(.4);opacity:0}20%{opacity:1}to{transform:translate(var(--dx,0),-260px) scale(1) rotate(var(--r,0deg));opacity:0}}
${dk('.pg-v-bunny', 'background:linear-gradient(170deg,#1C2B33 0%,#2D2340 55%,#3D2038 100%);color:#fff')}

/* 7 Звездопад */
.pg-v-stars{background:linear-gradient(180deg,#141A3D 0%,#3B2A6E 55%,#7A4C9E 100%);color:#fff}
.pg-shoot{transform:rotate(28deg);transform-origin:0 0}
.pg-shoot i{display:block;width:150px;height:3px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,0),#FFE7F4);box-shadow:0 0 8px rgba(255,200,235,.7);animation:pgShoot 1s var(--dl,.2s) ease-in both;position:relative}
.pg-shoot i::after{content:"";position:absolute;right:-4px;top:-3.5px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px rgba(255,214,240,.9)}
@keyframes pgShoot{from{transform:translateX(-180px);opacity:0}15%{opacity:1}80%{opacity:1}to{transform:translateX(520px);opacity:0}}
.pg-v-stars .pg-dot{animation:pgTw var(--d,2s) var(--dl,0s) ease-in-out infinite both}
.pg-v-stars .pg-cloud{width:200px;left:50%;margin-left:-100px;bottom:36px;opacity:.95;animation:pgUp 1s .1s ease-out both}
.pg-v-stars .pg-star{width:140px;left:50%;margin-left:-70px;bottom:78px;animation:pgDrop 1.1s .6s cubic-bezier(.3,1.35,.5,1) both,pgBob 2.6s 1.8s ease-in-out infinite}
@keyframes pgDrop{from{transform:translateY(-520px) rotate(-40deg);opacity:0}30%{opacity:1}to{transform:none;opacity:1}}

/* 8 Пузыри */
.pg-v-bubbles{background:linear-gradient(180deg,#E3F1FF 0%,#EFE4FF 50%,#FFE6F3 100%);color:#45307A}
.pg-bub{left:var(--x);bottom:-120px;width:var(--s);height:var(--s);animation:pgBub var(--d,3s) var(--dl,0s) cubic-bezier(.3,.6,.4,1) both}
@keyframes pgBub{from{transform:translateY(0);opacity:0}10%{opacity:1}to{transform:translateY(calc(-1 * var(--h,760px)));opacity:1}}
.pg-bub>i{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 30% 28%,rgba(255,255,255,.95) 0 9%,rgba(255,255,255,.15) 26%,rgba(183,156,255,.12) 62%,rgba(247,182,216,.5) 100%);border:1.5px solid rgba(255,255,255,.75);box-shadow:inset -4px -6px 14px rgba(143,211,246,.35),inset 4px 4px 10px rgba(247,182,216,.3);animation:pgWob 1.8s ease-in-out infinite alternate}
.pg-bub>i svg{width:42%;height:42%}
@keyframes pgWob{from{transform:translateX(-10px) scale(1,.96)}to{transform:translateX(10px) scale(.96,1)}}
.pg-v-bubbles .pg-bear{width:150px;left:-24px;bottom:-34px;transform:rotate(12deg);animation:pgPeek 1s .3s cubic-bezier(.2,.9,.3,1.3) both}
@keyframes pgPeek{from{transform:translateY(120%) rotate(12deg)}to{transform:rotate(12deg)}}
${dk('.pg-v-bubbles', 'background:linear-gradient(180deg,#14213D 0%,#2B2050 55%,#3D1F45 100%);color:#fff')}

/* 9 Сакура */
.pg-v-bloom{background:linear-gradient(170deg,#FFF1F4 0%,#FFE1EC 50%,#F1E3FF 100%);color:#5A2A63}
.pg-v-bloom .pg-branch{right:-16px;top:34%;width:340px}
.pg-twig{stroke-dasharray:420;stroke-dashoffset:420;animation:pgDraw .9s var(--dl,.1s) ease-out forwards}
.pg-fl{transform-box:fill-box;transform-origin:center;animation:pgPop .6s var(--dl,.6s) cubic-bezier(.2,.9,.3,1.5) both}
@keyframes pgPop{from{transform:scale(0) rotate(-90deg)}to{transform:none}}
.pg-petal{top:-30px;left:var(--x);width:var(--s,16px);height:var(--s,16px);animation:pgPetal var(--d,3s) var(--dl,0s) linear both}
@keyframes pgPetal{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translate(var(--dx,80px),800px) rotate(var(--r,540deg));opacity:.9}}
${dk('.pg-v-bloom', 'background:linear-gradient(170deg,#2E1A2E 0%,#3A1F3A 50%,#261B3D 100%);color:#FFE9F2')}
${dk('.pg-v-bloom .pg-twig', 'stroke:#C99AA8')}

/* 10 Диадема */
.pg-v-crown{background:radial-gradient(80% 55% at 50% 50%,#FFFFFF 0%,#F6E9FF 45%,#DCC6F7 100%);color:#4A2A73}
.pg-crownset{left:50%;top:44%;width:240px;margin-left:-120px}
.pg-rays{left:50%;top:50%;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.85) 0 8deg,rgba(255,255,255,0) 8deg 24deg);-webkit-mask:radial-gradient(circle,#000 0 22%,transparent 62%);mask:radial-gradient(circle,#000 0 22%,transparent 62%);animation:pgGlow 1s .9s ease-out both,pgSpin 16s linear infinite}
.pg-tiara{position:relative;width:220px;margin:0 auto -26px;animation:pgDrop 1s .45s cubic-bezier(.3,1.35,.5,1) both}
.pg-pillow{position:relative;width:240px;animation:pgBoxIn .7s .1s cubic-bezier(.2,.9,.3,1.3) both}
.pg-tsp{transform-box:fill-box;transform-origin:center;animation:pgTw 1.4s var(--dl,1.2s) ease-in-out infinite both}
${dk('.pg-v-crown', 'background:radial-gradient(80% 55% at 50% 50%,#4D3570 0%,#2A1D40 55%,#160F20 100%);color:#fff')}
${dk('.pg-rays', 'background:repeating-conic-gradient(from 0deg,rgba(255,220,245,.28) 0 8deg,rgba(255,220,245,0) 8deg 24deg)')}

.pg-still,.pg-still *{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}
`;

  function ensure() {
    if (document.getElementById('pg-css')) return;
    const st = document.createElement('style'); st.id = 'pg-css'; st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.innerHTML = SPRITE; document.body.insertBefore(box.firstElementChild, document.body.firstChild);
  }

  // ---------- Сцены ----------
  function scene(id) {
    let h = '';
    const g = i => GEMS[i % GEMS.length];
    switch (id) {
      case 'moon':
        for (let i = 0; i < 16; i++) h += ico('pg-spark', 'pg-sp', `left:${rnd(4, 92)}%;top:${rnd(18, 70)}%;--s:${rnd(8, 18)}px;--d:${rnd(1.2, 2.4)}s;--dl:${rnd(0, 1.2)}s`);
        for (let i = 0; i < 9; i++) h += ico(g(i), 'pg-gm pg-fall', `left:${rnd(5, 85)}%;top:${rnd(30, 42)}%;--s:${rnd(14, 22)}px;--d:${rnd(1.6, 2.4)}s;--dl:${rnd(.5, 1.6)}s;--dx:${rnd(-40, 70)}px;--dy:${rnd(220, 360)}px`);
        h += pic('0 0 120 120', 'pg-a pg-moon', MOON) + pic('0 0 160 70', 'pg-a pg-cloud', CLOUD) + pic('0 0 160 70', 'pg-a pg-cloud pg-c2', CLOUD);
        return h;
      case 'bear':
        h += pic('0 0 100 90', 'pg-a pg-heartbg', BIGHEART);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + rnd(-.2, .2), r = rnd(110, 170); h += ico(g(i), 'pg-gm pg-burst', `--s:${rnd(16, 26)}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--dl:${rnd(.85, 1.1)}s;--r:${rnd(120, 360)}deg`); }
        for (let i = 0; i < 8; i++) h += ico('pg-spark2', 'pg-sp', `left:${rnd(5, 90)}%;top:${rnd(30, 70)}%;--s:${rnd(10, 18)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(.3, 1.4)}s`);
        h += pic('0 0 80 150', 'pg-a pg-balloon', BALLOON) + pic('0 0 120 120', 'pg-a pg-bear', BEAR);
        return h;
      case 'uni': {
        const cols = ['#F7A8CF', '#FFD6A8', '#FFF1A8', '#A8E6CF', '#B9C8FF'];
        h += pic('0 0 400 220', 'pg-a pg-rainbow', cols.map((c, i) => `<path d="M${30 + i * 14} 220A${170 - i * 14} ${170 - i * 14} 0 0 1 ${370 - i * 14} 220" stroke="${c}" stroke-width="14"/>`).join(''));
        h += pic('0 0 160 70', 'pg-a pg-cloud', CLOUD) + pic('0 0 160 70', 'pg-a pg-cloud pg-c2', CLOUD);
        for (let i = 0; i < 12; i++) h += ico(i % 2 ? 'pg-spark2' : 'pg-spark', 'pg-sp', `right:${rnd(70, 190)}px;bottom:${rnd(170, 300)}px;--s:${rnd(10, 20)}px;--d:${rnd(1, 1.8)}s;--dl:${rnd(1.2, 2)}s`);
        h += pic('0 0 140 140', 'pg-a pg-uni', UNICORN);
        return h;
      }
      case 'box':
        h += '<div class="pg-a pg-glow"></div>';
        for (let i = 0; i < 14; i++) { const a = Math.PI * (1.05 + (i / 13) * .9), r = rnd(120, 170); h += ico(g(i), 'pg-gm pg-fly', `--s:${rnd(18, 26)}px;--dx:${-Math.cos(a) * r}px;--dy:${Math.sin(a) * r * 1.2}px;--dl:${(1 + i * .06).toFixed(2)}s`); }
        for (let i = 0; i < 10; i++) h += ico('pg-spark2', 'pg-sp', `left:${rnd(10, 85)}%;top:${rnd(35, 65)}%;--s:${rnd(10, 16)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(1, 2)}s`);
        h += pic('0 0 170 130', 'pg-a pg-box', BOX);
        return h;
      case 'waves':
        h += '<div class="pg-a pg-orb"></div><div class="pg-a pg-haze"></div>';
        for (let i = 0; i < 40; i++) h += `<i class="pg-a pg-dot pg-drift" style="left:${rnd(0, 100)}%;top:${rnd(40, 92)}%;--s:${rnd(2, 4)}px;--d:${rnd(1.6, 2.8)}s;--dl:${rnd(0, 1.4)}s"></i>`;
        for (let i = 0; i < 5; i++) h += ico(g(i + 1), 'pg-gm', `left:${18 + i * 15}%;top:${rnd(62, 70)}%;--s:${rnd(16, 22)}px;--dl:${(1 + i * .1).toFixed(2)}s`);
        for (let i = 0; i < 8; i++) h += ico('pg-spark', 'pg-sp', `left:${rnd(5, 92)}%;top:${rnd(40, 75)}%;--s:${rnd(8, 14)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(.4, 1.6)}s`);
        return h;
      case 'bunny':
        for (let i = 0; i < 10; i++) h += ico('pg-heartp', 'pg-a pg-float', `--x:${rnd(8, 84)}%;--b:${rnd(180, 300)}px;--s:${rnd(16, 28)}px;--d:${rnd(1.8, 2.6)}s;--dl:${rnd(.7, 1.6)}s;--dx:${rnd(-40, 40)}px;--r:${rnd(-30, 30)}deg`);
        for (let i = 0; i < 6; i++) h += ico(g(i), 'pg-gm pg-sp', `left:${rnd(6, 88)}%;top:${rnd(32, 60)}%;--s:${rnd(14, 20)}px;--d:${rnd(1.4, 2.2)}s;--dl:${rnd(.3, 1.2)}s`);
        for (let i = 0; i < 6; i++) h += ico('pg-spark2', 'pg-sp', `left:${rnd(6, 90)}%;top:${rnd(30, 62)}%;--s:${rnd(10, 16)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(.2, 1.4)}s`);
        h += pic('0 0 140 180', 'pg-a pg-bunny', BUNNY);
        return h;
      case 'stars':
        for (let i = 0; i < 46; i++) h += `<i class="pg-a pg-dot" style="left:${rnd(0, 100)}%;top:${rnd(22, 80)}%;--s:${rnd(1.5, 3.5)}px;--d:${rnd(1.4, 2.6)}s;--dl:${rnd(0, 1.5)}s"></i>`;
        [[-10, 24, .25], [20, 30, .9], [-30, 44, 1.5]].forEach(([x, y, dl]) => { h += `<div class="pg-a pg-shoot" style="left:${x}%;top:${y}%"><i style="--dl:${dl}s"></i></div>`; });
        for (let i = 0; i < 6; i++) h += ico(g(i + 2), 'pg-gm pg-sp', `left:${rnd(8, 88)}%;top:${rnd(34, 62)}%;--s:${rnd(14, 20)}px;--d:${rnd(1.4, 2.2)}s;--dl:${rnd(.6, 1.6)}s`);
        h += pic('0 0 160 70', 'pg-a pg-cloud', CLOUD) + pic('0 0 140 150', 'pg-a pg-star', STAR);
        return h;
      case 'bubbles':
        for (let i = 0; i < 14; i++) {
          const s = rnd(34, 92), gem = i % 3 === 0 ? ico(g(i / 3), '', '') : '';
          h += `<div class="pg-a pg-bub" style="--x:${rnd(-4, 84)}%;--s:${s.toFixed(0)}px;--d:${rnd(2.6, 3.4)}s;--dl:${rnd(0, .8)}s;--h:${rnd(280, 560).toFixed(0)}px"><i style="animation-delay:-${rnd(0, 1.8).toFixed(2)}s">${gem}</i></div>`;
        }
        for (let i = 0; i < 7; i++) h += ico('pg-spark', 'pg-sp', `left:${rnd(6, 90)}%;top:${rnd(30, 70)}%;--s:${rnd(10, 16)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(.3, 1.5)}s`);
        h += pic('0 0 120 120', 'pg-a pg-bear', BEAR);
        return h;
      case 'bloom':
        for (let i = 0; i < 16; i++) h += ico('pg-petal', 'pg-a pg-petal', `--x:${rnd(-10, 95)}%;--s:${rnd(12, 22)}px;--d:${rnd(2.6, 3.8)}s;--dl:${rnd(0, 1.4)}s;--dx:${rnd(30, 140)}px;--r:${rnd(300, 720)}deg`);
        for (let i = 0; i < 5; i++) h += ico(i % 2 ? 'pg-spark2' : 'pg-spark', 'pg-sp', `right:${rnd(30, 260)}px;top:${rnd(38, 64)}%;--s:${rnd(10, 16)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(1, 1.8)}s`);
        h += pic('0 0 300 300', 'pg-a pg-branch', BRANCH);
        return h;
      case 'crown':
        h += `<div class="pg-a pg-crownset"><div class="pg-a pg-rays"></div>${pic('0 0 200 120', 'pg-tiara', tiara())}${pic('0 0 220 100', 'pg-pillow', PILLOW)}</div>`;
        for (let i = 0; i < 10; i++) h += ico(i % 2 ? 'pg-spark2' : 'pg-spark', 'pg-sp', `left:${rnd(6, 90)}%;top:${rnd(30, 75)}%;--s:${rnd(10, 18)}px;--d:${rnd(1.2, 2)}s;--dl:${rnd(.8, 1.8)}s`);
        for (let i = 0; i < 6; i++) h += ico(g(i), 'pg-gm pg-sp', `left:${rnd(6, 88)}%;top:${rnd(64, 86)}%;--s:${rnd(14, 20)}px;--d:${rnd(1.6, 2.4)}s;--dl:${rnd(1, 1.8)}s`);
        return h;
    }
    return h;
  }

  function hello(v, o) {
    const t = o.tod || todOf(), n = String(o.name || '').trim();
    const sub = typeof v.sub === 'string' ? v.sub : (v.sub[t] || Object.values(v.sub)[0]);
    return `<div class="pg-hello"><div class="pg-h">${n ? `${GREET[t]},<br>${esc(n)}` : GREET[t] + '!'}</div><div class="pg-s">${esc(sub)}</div></div>`;
  }

  // ---------- Показ ----------
  let current = null;
  function play(id, o = {}) {
    ensure();
    const v = byId(id) || V[0];
    if (current) current.kill();
    const host = o.container || document.body;
    const el = document.createElement('div');
    el.className = 'pg pg-v-' + v.id + (o.container ? '' : ' pg-fixed');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = scene(v.id) + hello(v, o);
    host.appendChild(el);
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) el.classList.add('pg-still');
    let done = false, t2 = null;
    const kill = () => { clearTimeout(t1); clearTimeout(t2); el.remove(); if (current && current.el === el) current = null; };
    const finish = () => {
      if (done) return; done = true; clearTimeout(t1);
      el.classList.add('pg-out');
      t2 = setTimeout(() => { kill(); o.onDone && o.onDone(); }, reduce ? 50 : OUT);
    };
    const t1 = setTimeout(finish, reduce ? 1400 : (o.duration || DUR));
    el.addEventListener('click', finish);
    current = { el, finish, kill, id: v.id };
    return current;
  }

  // ---------- Когда и какую показывать ----------
  function prefs() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function setPrefs(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); return true; } catch (e) { return false; } }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function due(p) { return p.on !== false && Date.now() - (p.last || 0) >= GAP; }
  function pick(p, t) {
    const ok = id => { const v = byId(id); return v && (!v.when || v.when.includes(t)); };
    if (!p.cur || !ok(p.cur) || !(p.left > 0)) {
      if (!Array.isArray(p.order)) p.order = [];
      p.order = p.order.filter(byId);
      let i = p.order.findIndex(ok);
      if (i < 0) { p.order = p.order.concat(shuffle(V.map(v => v.id).filter(id => id !== p.cur && !p.order.includes(id)))); i = p.order.findIndex(ok); }
      if (i < 0) { p.order = shuffle(V.map(v => v.id)); i = p.order.findIndex(ok); }
      p.cur = p.order.splice(i, 1)[0];
      p.left = EVERY;
    }
    p.left -= 1;
    return p.cur;
  }
  function maybe() {
    const p = prefs();
    if (!due(p)) return false;
    const t = todOf(), id = pick(p, t);
    p.last = Date.now();
    if (!setPrefs(p)) return false; // без памяти не показываем, иначе заставка была бы при каждом входе
    play(id, { name: p.name, tod: t });
    return true;
  }
  let preview = 0;
  function showNext() { const p = prefs(); const v = V[preview++ % V.length]; play(v.id, { name: p.name }); return v; }

  window.PorciaGreet = { V, play, prefs, setPrefs, maybe, showNext, todOf, GAP, EVERY };

  // Автозапуск только внутри приложения (на демо-странице его нет)
  if (document.documentElement.hasAttribute('data-porcia')) {
    try { maybe(); } catch (e) { /* приветствие не должно ломать приложение */ }
    document.documentElement.classList.remove('pg-hold');
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= GAP) { try { maybe(); } catch (e) { /* ничего */ } }
    });
  }
})();
