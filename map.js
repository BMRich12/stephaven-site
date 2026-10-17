// StepHaven: the walking map. Draws the margin grid numbers, the contour
// lines, and the footpath that walks down the page as you scroll.
(() => {
  const sheet = document.getElementById('sheet');
  if (!sheet) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // What a page's worth of steps would buy in the game (prices from the shop).
  const PAGE_STEPS = 2400;
  const BUYS = [
    [0, 'so far on this page'],
    [66, 'enough for a <em>bench</em>'],
    [113, 'enough for an <em>oak tree</em>'],
    [300, 'enough for a <em>little house</em>'],
    [700, 'enough for <em>two houses</em>'],
    [1200, 'a house and a <em>garden</em>'],
    [1800, 'a <em>lane</em> of cottages'],
  ];

  // ---------- Grid numbers in the margin ----------
  const nums = document.getElementById('gridnums');
  function drawGridNumbers() {
    if (!nums) return;
    const cell = parseFloat(getComputedStyle(sheet).getPropertyValue('--cell')) || 128;
    const w = sheet.clientWidth, h = sheet.clientHeight;
    let html = '';
    for (let x = cell, n = 34; x < w - 8; x += cell, n++) html += `<span class="x" style="left:${x}px">${n % 100}</span>`;
    for (let y = cell, n = 98; y < h - 8; y += cell, n--) html += `<span class="y" style="top:${y}px">${((n % 100) + 100) % 100}</span>`;
    nums.innerHTML = html;
  }

  // ---------- Contour lines (value noise + marching squares) ----------
  function noiseField(seed) {
    const rand = (x, y) => {
      let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
      h = (h ^ (h >>> 13)) * 1274126177 | 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = t => t * t * (3 - 2 * t);
    const value = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
      const a = rand(xi, yi), b = rand(xi + 1, yi), c = rand(xi, yi + 1), d = rand(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y) => value(x, y) * 0.6 + value(x * 2.1 + 5, y * 2.1 + 9) * 0.28 + value(x * 4.3 + 11, y * 4.3 + 3) * 0.12;
  }

  function drawContours(canvas) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const f = noiseField(+canvas.dataset.seed || 1);
    const step = 7, scale = 1 / 230;
    const cols = Math.ceil(r.width / step) + 1, rows = Math.ceil(r.height / step) + 1;
    const g = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) g[j * cols + i] = f(i * step * scale, j * step * scale);
    const levels = [];
    for (let v = 0.22; v < 0.8; v += 0.035) levels.push(v);
    levels.forEach((lv, li) => {
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = g[j * cols + i], b = g[j * cols + i + 1], c = g[(j + 1) * cols + i + 1], d = g[(j + 1) * cols + i];
        const idx = (a > lv) | ((b > lv) << 1) | ((c > lv) << 2) | ((d > lv) << 3);
        if (idx === 0 || idx === 15) continue;
        const x = i * step, y = j * step;
        const lerp = (p, q) => (lv - p) / (q - p);
        const top = [x + step * lerp(a, b), y], right = [x + step, y + step * lerp(b, c)];
        const bottom = [x + step * lerp(d, c), y + step], left = [x, y + step * lerp(a, d)];
        const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bottom); break;
          case 5: seg(left, top); seg(right, bottom); break;
          case 10: seg(top, right); seg(left, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, bottom); break;
        }
      }
      const index = li % 5 === 0;
      ctx.strokeStyle = index ? 'rgba(185,113,44,.55)' : 'rgba(185,113,44,.32)';
      ctx.lineWidth = index ? 1.6 : 1;
      ctx.stroke();
    });
  }

  // ---------- The footpath ----------
  const svg = document.getElementById('trail');
  const dash = document.getElementById('dashPath');
  const walker = document.getElementById('walker');
  const stepsEl = document.getElementById('steps');
  const buysEl = document.getElementById('buys');
  const pedo = document.getElementById('pedo');
  const cover = document.querySelector('.cover');
  const NS = 'http://www.w3.org/2000/svg', STEP = 4, PIECE = 60;
  let total = 0, samples = [], marks = [], drawn = 0, target = 0, raf = 0, lastBuy = -1;
  let line = [], pieces = [];
  const head = document.createElementNS(NS, 'path');
  head.setAttribute('class', 'dash');
  svg.insertBefore(head, walker);
  const poly = (a, b) => 'M' + line.slice(a, b + 1).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');


  // ---------- The town, built beside the path as you walk it ----------
  // Map symbols for the game's pieces, drawn round (0, 0) at about 20pt.
  const PIECES = {
    house: r => `<rect x="-8" y="-6" width="16" height="11" fill="#1B2A1D"/><path d="M-10 -5 0 -13 10 -5" fill="none" stroke="${r}" stroke-width="3" stroke-linejoin="round"/>`,
    tree: () => '<path d="M-1 3h2v7h-2z" fill="#6B4A2B"/><circle r="7" cy="-2" fill="#86B865" stroke="#2F6A39" stroke-width="1.6"/>',
    pine: () => '<path d="M0 -12 7 4H-7z" fill="#2F6A39"/><path d="M-1 4h2v5h-2z" fill="#6B4A2B"/>',
    bench: () => '<path d="M-8 -2h16v3H-8zM-6 1v5M6 1v5" fill="#6B4A2B" stroke="#6B4A2B" stroke-width="1.6"/>',
    pond: () => '<ellipse rx="11" ry="6" fill="#4E9DD0"/><ellipse rx="6" ry="2.4" cx="-2" cy="-1" fill="#CDE5F0" opacity=".8"/>',
    lamp: () => '<circle r="6" fill="#F0C34E" opacity=".35"/><circle r="2.6" fill="#1B2A1D"/>',
  };
  const ROOFS = ['#D33F27', '#B9712C', '#4E6FA3', '#7A4E8C'];
  const PLAN = [['bench', 'tree'], ['house', 'house', 'tree']];
  const POOL = ['house', 'house', 'house', 'tree', 'tree', 'pine', 'pine', 'pond', 'bench'];
  const built = new Set();
  let town = null;
  function rng(seed) { let t = seed; return () => { t = (t + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function buildTown(w) {
    if (town) town.remove();
    town = document.createElementNS(NS, 'g');
    svg.insertBefore(town, svg.firstChild);
    const phone = innerWidth < 900;
    const cell = parseFloat(getComputedStyle(sheet).getPropertyValue('--cell')) || 128;
    const tile = cell / 4;                 // pieces sit on the quarter-cell lattice
    marks.forEach((m, n) => {
      if (m.el.hasAttribute('data-end')) return;
      const lot = document.createElementNS(NS, 'g');
      lot.setAttribute('class', 'lot' + (built.has(n) ? ' built' : ''));
      const r = rng(n * 97 + 13);
      if (phone) {
        // One piece tucked under the marker, clear of the path.
        const k = (PLAN[n] || POOL)[Math.floor(r() * (PLAN[n] || POOL).length)];
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'piece');
        g.setAttribute('transform', `translate(${Math.max(14, m.x - 30).toFixed(1)} ${(m.y + 34).toFixed(1)}) scale(1.05)`);
        g.innerHTML = `<g>${PIECES[k](ROOFS[n % ROOFS.length])}</g>`;
        lot.appendChild(g);
        town.appendChild(lot); m.lot = lot;
        return;
      }
      const ref = document.createElementNS(NS, 'text');
      ref.setAttribute('class', 'gridref'); ref.setAttribute('x', m.x - 28); ref.setAttribute('y', m.y + 4);
      ref.textContent = `${34 + Math.floor(m.x / cell)} ${98 - Math.floor(m.y / cell)}`;
      lot.appendChild(ref);
      const kinds = PLAN[n] || Array.from({ length: Math.min(3 + n, 7) }, () => POOL[Math.floor(r() * POOL.length)]);
      // Free lattice points in a band one to two cells left of the path.
      const open = [];
      for (let gx = Math.floor((m.x - 66) / tile); gx * tile > m.x - 66 - tile * 4; gx--)
        for (let gy = Math.round((m.y - tile) / tile); gy * tile <= m.y + tile * 2; gy++)
          if (gx * tile > 24) open.push([gx * tile, gy * tile]);
      kinds.forEach((k, i) => {
        if (!open.length) return;
        // Fill nearest the path first, so the hamlet grows out from the line.
        open.sort((a, b) => Math.hypot(a[0] - m.x, a[1] - m.y) - Math.hypot(b[0] - m.x, b[1] - m.y) + (r() - .5) * 18);
        const [x, y] = open.shift();
        for (let j = open.length - 1; j >= 0; j--) if (Math.hypot(open[j][0] - x, open[j][1] - y) < tile * 1.05) open.splice(j, 1);
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'piece');
        g.setAttribute('transform', `translate(${x} ${y}) scale(1.35)`);
        g.innerHTML = `<g style="transition-delay:${(i * 70)}ms">${PIECES[k](ROOFS[Math.floor(r() * ROOFS.length)])}</g>`;
        lot.appendChild(g);
      });
      town.appendChild(lot);
      m.lot = lot;
    });
  }

  function centre(el) {
    const s = sheet.getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2];
  }

  // Smooth curve through the points (Catmull-Rom as cubic Béziers).
  function curve(pts) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function layoutTrail() {
    const here = document.getElementById('here');
    const wps = [...document.querySelectorAll('[data-wp]')];
    svg.style.height = '0px'; svg.setAttribute('height', 0);   // measure the page without the path
    const w = sheet.clientWidth, h = sheet.scrollHeight;
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.height = h + 'px';

    const stops = (here ? [here] : []).concat(wps);
    const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail')) || 64;
    const sTop = sheet.getBoundingClientRect().top;
    const pts = [];
    stops.forEach((el, i) => {
      const p = centre(el);
      if (el === here) {
        p[1] += 16;                        // set off just below the marker
        pts.push(p);
        // On a phone the cover is one column, with the button under the
        // picture: leave by the right-hand edge instead of through it.
        if (innerWidth < 900) {
          const coverBottom = cover.getBoundingClientRect().bottom - sTop;
          const x = w - 18;
          pts.push([Math.min(x, p[0] + 60), p[1] + 34]);
          pts.push([x, p[1] + 110]);
          pts.push([x, coverBottom - 30]);
        }
        return;
      }
      if (i > 0) {
        const q = pts[pts.length - 1];
        const gap = p[1] - q[1];
        const sec = el.closest('section, header');
        if (Math.abs(p[0] - q[0]) > 60 && sec) {
          // Changing column: walk down, cross in the open ground at the top
          // of the next section, then carry on, so the path never cuts text.
          const turn = Math.max(q[1] + 40, sec.getBoundingClientRect().top - sTop + 36);
          pts.push([q[0], turn - 26]);
          pts.push([(q[0] + p[0]) / 2, turn]);
          pts.push([p[0], turn + 26]);
        } else if (gap > 140) {
          // A long straight: let the path wander a little inside the margin.
          const sway = Math.min(rail * 0.32, 46) * (i % 2 ? 1 : -1);
          const clampX = x => Math.max(10, x);
          pts.push([clampX(q[0] + sway), q[1] + gap * 0.36]);
          pts.push([clampX(p[0] - sway * 0.7), q[1] + gap * 0.72]);
        }
      }
      pts.push(p);
    });
    if (pts.length < 2) return;
    const d = curve(pts);
    dash.setAttribute('d', d);
    total = dash.getTotalLength();
    // The path is laid as short dashed pieces of polyline: one dash list or
    // mask over a page this tall breaks in WebKit and on dense screens.
    line = [];
    for (let l = 0; l < total; l += STEP) { const p = dash.getPointAtLength(l); line.push([p.x, p.y]); }
    const last = dash.getPointAtLength(total); line.push([last.x, last.y]);
    samples = line.map((p, i) => [Math.min(i * STEP, total), p[1]]);
    pieces.forEach(p => p.remove()); pieces = [];
    for (let i = 0; i < line.length - 1; i += PIECE) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('class', 'dash');
      el.setAttribute('d', poly(i, Math.min(i + PIECE, line.length - 1)));
      el.style.strokeDashoffset = -((i * STEP) % 13);
      el.style.display = 'none';
      svg.insertBefore(el, walker);
      pieces.push(el);
    }
    head.style.strokeDashoffset = 0;
    marks = wps.map(el => ({ el, x: centre(el)[0], y: centre(el)[1] }));
    buildTown(w);
    target = targetLength();
    if (reduce || drawn > 0) drawn = target;
    paint();
  }

  // How far along the path sits the point level with 62% down the screen.
  function targetLength() {
    if (!samples.length) return 0;
    const y = scrollY + innerHeight * 0.62 - (sheet.getBoundingClientRect().top + scrollY);
    let best = 0;
    for (let k = 0; k < samples.length; k++) { if (samples[k][1] <= y) best = Math.max(best, samples[k][0]); }
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) best = total;
    return best;
  }

  function paint() {
    if (!total) return;
    const tipIndex = Math.min(line.length - 1, Math.floor(drawn / STEP));
    pieces.forEach((el, n) => { el.style.display = (n + 1) * PIECE <= tipIndex ? '' : 'none'; });
    const from = Math.floor(tipIndex / PIECE) * PIECE;
    head.style.strokeDashoffset = -((from * STEP) % 13);
    head.setAttribute('d', tipIndex > from ? poly(from, tipIndex) : '');
    const pt = { x: line[tipIndex][0], y: line[tipIndex][1] };
    walker.setAttribute('cx', pt.x.toFixed(1)); walker.setAttribute('cy', pt.y.toFixed(1));
    walker.style.opacity = drawn > 4 && drawn < total - 2 ? 1 : 0;
    marks.forEach((m, n) => {
      const on = pt.y >= m.y - 6 || drawn >= total - 1;
      m.el.classList.toggle('reached', on);
      if (on && m.lot && !built.has(n)) { built.add(n); m.lot.classList.add('built'); }
    });
    const steps = Math.round((drawn / total) * PAGE_STEPS);
    stepsEl.textContent = steps.toLocaleString();
    let bi = 0;
    BUYS.forEach(([n], i) => { if (steps >= n) bi = i; });
    if (bi !== lastBuy) {
      buysEl.innerHTML = BUYS[bi][1];
      if (lastBuy >= 0 && !reduce) { buysEl.classList.remove('bump'); void buysEl.offsetWidth; buysEl.classList.add('bump'); }
      lastBuy = bi;
    }
  }

  function tick() {
    raf = 0;
    const diff = target - drawn;
    if (Math.abs(diff) < 0.5) { drawn = target; paint(); return; }
    drawn += diff * (reduce ? 1 : 0.18);
    paint();
    raf = requestAnimationFrame(tick);
  }

  function onScroll() {
    target = targetLength();
    if (!raf) raf = requestAnimationFrame(tick);
    if (pedo && cover) pedo.classList.toggle('on', cover.getBoundingClientRect().bottom < 60);
  }

  // ---------- Video: only play while on screen ----------
  const video = document.getElementById('preview');
  if (video && 'IntersectionObserver' in window) {
    if (reduce) video.controls = true;
    // Open on the railway scene, not the first seconds of empty grass.
    video.addEventListener('loadedmetadata', () => { if (video.currentTime < 1) video.currentTime = 8; }, { once: true });     // nothing plays by itself; let people press play
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !reduce) { video.preload = 'auto'; video.play().catch(() => {}); }
      else video.pause();
    }, { threshold: 0.35 }).observe(video);
  }

  let resizeTimer = 0;
  function relayout() {
    drawGridNumbers();
    document.querySelectorAll('canvas.contours').forEach(drawContours);
    layoutTrail();
    onScroll();
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 150); });
  addEventListener('load', relayout);
  if (document.fonts) document.fonts.ready.then(relayout);
  relayout();

  // The opening: the path sets off from "You are here".
  if (!reduce) { drawn = 0; target = targetLength(); raf = requestAnimationFrame(tick); }
})();
