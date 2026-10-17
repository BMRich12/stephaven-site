// StepHaven: turn the clock on the cover picture. Six real captures a
// season (dawn to night), blended by the hour as the sun is dragged along
// the day track; four seasons, crossfaded. Opens at the visitor's own time
// and season, as the game does.
(() => {
  const dial = document.getElementById('dial');
  if (!dial) return;
  const scene = dial.querySelector('.scene');
  const track = dial.querySelector('.daytrack');
  const knob = dial.querySelector('.knob');
  const label = dial.querySelector('.clock b');
  const note = dial.querySelector('.clock small');
  const seasonButtons = [...dial.querySelectorAll('.seasons button')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The game's own lighting keyframes, by clock hour.
  const STOPS = [['dawn', 5.75], ['morning', 8], ['midday', 12.5], ['afternoon', 16.5], ['dusk', 19], ['night', 21.5]];
  const START = 5, END = 23;
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

  const layers = {};            // season -> [img per stop]
  let season = 'summer', hour = 12.5, shown = null;

  // ---------- The living town: a short loop at each daytime stop ----------
  // Rendered from the game (dawn to afternoon; the renderer can't draw lamp
  // light, so dusk and night stay as pictures). Loaded only when the sun
  // rests on a stop, and never under Reduce Motion or Data Saver.
  const LOOPS = new Set(['dawn', 'morning', 'midday', 'afternoon']);
  const saveData = navigator.connection && navigator.connection.saveData;
  const video = document.createElement('video');
  video.className = 'loop';
  video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');
  scene.appendChild(video);
  let loopKey = null, onScreen = true;
  function loopOff() {
    video.classList.remove('on');
    loopKey = null;
    setTimeout(() => { if (!loopKey) video.pause(); }, 300);
  }
  function loopOn(tolerance = 0.01) {
    if (reduce || saveData) return;
    const stop = STOPS.find(([, h]) => Math.abs(h - hour) < tolerance);
    if (!stop || !LOOPS.has(stop[0])) { loopOff(); return; }
    const key = `${season}-${stop[0]}`;
    if (key === loopKey) return;
    loopKey = key;
    video.classList.remove('on');
    video.src = `img/dial/loop/${key}${innerWidth < 900 ? '-720' : ''}.mp4`;
    video.addEventListener('playing', function show() {
      video.removeEventListener('playing', show);
      if (loopKey === key) video.classList.add('on');
    });
    if (onScreen) video.play().catch(() => {});
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (!onScreen) video.pause(); else if (loopKey) video.play().catch(() => {});
    }, { threshold: 0.2 }).observe(scene);
  }

  // Let go of the sun and it settles on the nearest stop, like a dial
  // clicking into place; then the town comes alive.
  let settleRaf = 0;
  function settle() {
    const target = STOPS.reduce((a, [, h]) => Math.abs(h - hour) < Math.abs(a - hour) ? h : a, STOPS[0][1]);
    const from = hour, t0 = performance.now(), dur = reduce ? 0 : 320;
    cancelAnimationFrame(settleRaf);
    const step = now => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      hour = from + (target - from) * (1 - Math.pow(1 - p, 3));
      render();
      if (p < 1) settleRaf = requestAnimationFrame(step); else { hour = target; render(); loopOn(); }
    };
    settleRaf = requestAnimationFrame(step);
  }

  function imagesFor(s) {
    if (layers[s]) return layers[s];
    layers[s] = STOPS.map(([t]) => {
      // AVIF where the browser takes it, JPEG otherwise.
      const pic = document.createElement('picture');
      const source = document.createElement('source');
      source.type = 'image/avif';
      source.sizes = '(max-width: 899px) 92vw, 760px';
      source.srcset = `img/dial/${s}-${t}-900.avif 900w, img/dial/${s}-${t}.avif 1600w`;
      const img = new Image();
      img.decoding = 'async';
      img.alt = '';
      img.sizes = source.sizes;
      img.srcset = `img/dial/${s}-${t}-900.jpg 900w, img/dial/${s}-${t}.jpg 1600w`;
      img.src = `img/dial/${s}-${t}.jpg`;
      img.dataset.season = s;
      img.style.opacity = 0;
      pic.append(source, img);
      scene.appendChild(pic);
      return img;
    });
    return layers[s];
  }

  // Which two captures straddle the hour, and how far between them.
  function blend(h) {
    if (h <= STOPS[0][1]) return [0, 0, 0];
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i][1], b = STOPS[i + 1][1];
      if (h <= b) return [i, i + 1, (h - a) / (b - a)];
    }
    return [STOPS.length - 1, STOPS.length - 1, 0];
  }

  function render() {
    const imgs = imagesFor(season);
    const [i, j, f] = blend(hour);
    const ease = f * f * (3 - 2 * f);
    imgs.forEach((img, n) => {
      // The earlier capture stays fully opaque underneath, the later one
      // fades in over it, so the blend never shows paper through.
      img.style.opacity = n === i ? 1 : n === j ? ease : 0;
      img.style.zIndex = n === j ? 2 : n === i ? 1 : 0;
    });
    // Other seasons fade out under the new one.
    Object.keys(layers).forEach(s => {
      if (s === season) return;
      layers[s].forEach(img => { img.style.opacity = 0; img.style.zIndex = 0; });
    });
    const p = (hour - START) / (END - START);
    knob.style.left = `${(p * 100).toFixed(2)}%`;
    const day = hour > 6.4 && hour < 19.6;
    knob.classList.toggle('moon', !day);
    track.setAttribute('aria-valuenow', hour.toFixed(2));
    const text = clock(hour);
    track.setAttribute('aria-valuetext', `${text}, ${season}`);
    label.textContent = text;
    dial.dataset.time = STOPS[f < .5 ? i : j][0];
    // Preload the neighbours of what's showing.
    [i - 1, j + 1].forEach(n => { if (imgs[n] && !imgs[n].complete) imgs[n].fetchPriority = 'low'; });
    shown = STOPS[i][0];
  }

  function clock(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60 / 5) * 5;
    const d = new Date(2026, 0, 1, hh, mm === 60 ? 59 : mm);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function setHour(h, fromUser) {
    hour = Math.max(START, Math.min(END, h));
    if (fromUser) { dial.classList.add('touched'); note.textContent = 'Drag the sun to change the time'; }
    render();
  }

  function setSeason(s, fromUser) {
    season = s;
    seasonButtons.forEach(b => {
      const on = b.dataset.season === s;
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
    if (fromUser) { dial.classList.add('touched'); loopOff(); }
    imagesFor(s);
    render();
    if (fromUser) setTimeout(loopOn, 750);   // after the season's crossfade
  }

  // ---------- Dragging the sun ----------
  function hourAt(clientX) {
    const r = track.getBoundingClientRect();
    return START + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (END - START);
  }
  let dragging = false;
  track.addEventListener('pointerdown', e => {
    dragging = true; track.setPointerCapture(e.pointerId);
    cancelAnimationFrame(settleRaf); loopOff();
    dial.classList.add('dragging');
    setHour(hourAt(e.clientX), true);
  });
  track.addEventListener('pointermove', e => { if (dragging) setHour(hourAt(e.clientX), true); });
  const stop = () => { if (!dragging) return; dragging = false; dial.classList.remove('dragging'); settle(); };
  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);
  track.addEventListener('keydown', e => {
    const k = e.key;
    let h = null;
    if (k === 'ArrowRight' || k === 'ArrowUp') h = hour + 0.5;
    if (k === 'ArrowLeft' || k === 'ArrowDown') h = hour - 0.5;
    if (k === 'PageUp') h = hour + 2;
    if (k === 'PageDown') h = hour - 2;
    if (k === 'Home') h = START;
    if (k === 'End') h = END;
    if (h !== null) { e.preventDefault(); loopOff(); setHour(h, true); clearTimeout(keyTimer); keyTimer = setTimeout(settle, 600); }
  });
  let keyTimer = 0;

  // ---------- Seasons ----------
  seasonButtons.forEach((b, n) => {
    b.addEventListener('click', () => setSeason(b.dataset.season, true));
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = seasonButtons[(n + d + seasonButtons.length) % seasonButtons.length];
      next.focus(); setSeason(next.dataset.season, true);
    });
  });

  // ---------- Open at the visitor's own time and season ----------
  const now = new Date();
  let h = now.getHours() + now.getMinutes() / 60;
  if (h < START) h = END;              // the small hours look like night
  const m = now.getMonth();
  let s = m === 11 || m < 2 ? 3 : m < 5 ? 0 : m < 8 ? 1 : 2;
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  if (/^(Australia|Antarctica)\/|Pacific\/(Auckland|Chatham|Fiji)|America\/(Sao_Paulo|Argentina|Santiago|Montevideo|Asuncion)|Africa\/(Johannesburg|Maputo|Windhoek)/.test(tz)) s = (s + 2) % 4;
  setSeason(SEASONS[s], false);
  setHour(h, false);
  const near = STOPS.find(([t, sh]) => LOOPS.has(t) && Math.abs(sh - h) < 0.75);
  // Near a daytime stop, the town comes alive straight away; the clock
  // keeps the visitor's own time.
  if (near) addEventListener('load', () => setTimeout(() => loopOn(0.75), 900));
  // Other seasons load only when someone reaches for the season buttons,
  // so a visitor who never touches them downloads one season, not four.
  const warm = () => SEASONS.forEach(x => imagesFor(x));
  dial.querySelector('.seasons').addEventListener('pointerenter', warm, { once: true });
  dial.querySelector('.seasons').addEventListener('touchstart', warm, { once: true, passive: true });
  dial.querySelector('.seasons').addEventListener('focusin', warm, { once: true });
  if (reduce) dial.classList.add('still');
})();
