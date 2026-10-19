(() => {
  const cv = document.getElementById('stagecv');
  if (!cv) return;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = false;
  const note = document.getElementById('stageNote');
  let spec = null, bg = null, ring = null, stance = null;
  const led = [], crowd = [], smoke = [];
  const neonImgs = { bars: [], letters: [] };
  let neonTimers = [];
  let fxCanvas = null;
  let scroll = 0.5, zoom = 0.7, jump = 0, t0 = performance.now();

  function load(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  }

  function world() {
    const v = spec.view;
    return { w: v.w / zoom, h: v.h / zoom };
  }
  // El suelo se puede bajar por página sin tocar la placa ni el visor viejo.
  function floor() { return window.STAGE_FLOOR_Y || spec.floorY; }

  function cam() {
    const w = world();
    const vw = Math.max(1, Math.round(w.w));
    const vh = Math.max(1, Math.round(w.h));
    const maxX = Math.max(0, bg.width - vw);
    const x = Math.round(scroll * maxX);
    // la línea de suelo queda hacia el centro del encuadre, con ring por debajo
    let y = floor() - vh * 0.62 - jump;
    y = Math.round(Math.max(0, Math.min(Math.max(0, bg.height - vh), y)));
    return { x, y, w: Math.min(vw, bg.width - x), h: Math.min(vh, bg.height - y) };
  }

  function paintBeam(fxx, lampX, lampY, floorX, floorY, w0, w1, rgb, alpha, cam) {
    const y0 = lampY - cam.y;
    const y1 = floorY - cam.y;
    const span = y1 - y0;
    if (span <= 1) return;
    fxx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    const yStart = Math.max(0, y0 | 0);
    const yEnd = Math.min(fxx.canvas.height - 1, y1 | 0);
    for (let y = yStart; y <= yEnd; y++) {
      const t = (y - y0) / span;
      const cxw = lampX + (floorX - lampX) * t - cam.x;
      const half = w0 + (w1 - w0) * t;
      const x0 = Math.round(cxw - half);
      const x1 = Math.round(cxw + half);
      const left = Math.max(0, x0);
      const right = Math.min(fxx.canvas.width, x1);
      if (right > left) fxx.fillRect(left, y, right - left, 1);
    }
  }

  function paintSpots(cam) {
    if (!fxCanvas) fxCanvas = document.createElement('canvas');
    if (fxCanvas.width !== cam.w || fxCanvas.height !== cam.h) {
      fxCanvas.width = cam.w;
      fxCanvas.height = cam.h;
    }
    const fxx = fxCanvas.getContext('2d');
    fxx.imageSmoothingEnabled = false;
    fxx.clearRect(0, 0, cam.w, cam.h);
    const t = performance.now() / 1000;
    for (const s of spec.spots) {
      const wobble = 0.85 + 0.15 * Math.sin(t * 7 + s.phase);
      const swing = Math.sin(t * s.speed + s.phase) * s.amp;
      const floorX = s.x + swing;
      paintBeam(fxx, s.x, s.y, floorX, s.y1, 1, s.wide, s.color, s.alpha * wobble, cam);
      paintBeam(fxx, s.x, s.y, floorX, s.y1, 1, s.wide * 0.35, s.color, s.alpha * 1.6 * wobble, cam);
    }
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    cx.drawImage(fxCanvas, 0, 0, cv.width, cv.height);
    cx.restore();
  }

  function armNeon(now) {
    if (!spec.neon || neonTimers.length) return;
    (spec.neon.bars || []).forEach((_, i) => {
      neonTimers.push({ kind: 'bar', i, offUntil: 0, next: now + 350 + Math.random() * 900 });
    });
    (spec.neon.letters || []).forEach((_, i) => {
      neonTimers.push({ kind: 'letter', i, offUntil: 0, next: now + 700 + Math.random() * 2200 });
    });
  }

  function paintNeon(blit) {
    const tog = document.getElementById('togNeon');
    if (!tog || !tog.checked || !spec.neon) return;
    const now = performance.now();
    armNeon(now);
    for (const t of neonTimers) {
      if (now >= t.next && now >= t.offUntil) {
        const dur = t.kind === 'bar' ? 80 + Math.random() * 170 : 60 + Math.random() * 130;
        t.offUntil = now + dur;
        let gap = t.kind === 'bar' ? 650 + Math.random() * 2400 : 1500 + Math.random() * 4200;
        if (Math.random() < 0.28) gap = 45 + Math.random() * 80;
        t.next = t.offUntil + gap;
      }
      if (now >= t.offUntil) continue;
      const img = t.kind === 'bar' ? neonImgs.bars[t.i] : neonImgs.letters[t.i];
      if (img) blit(img, spec.neon.x, spec.neon.y);
    }
  }

  function draw() {
    if (!spec || !bg) return;
    const c = cam();
    const tick = Math.floor((performance.now() - t0) / 140);
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(bg, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    const sx = cv.width / c.w, sy = cv.height / c.h;
    const blit = (img, x, y, dw, dh) => {
      const iw = dw == null ? img.width : dw;
      const ih = dh == null ? img.height : dh;
      cx.drawImage(img, Math.round((x - c.x) * sx), Math.round((y - c.y) * sy),
        Math.round(iw * sx), Math.round(ih * sy));
    };
    paintNeon(blit);
    const blitPart = (img, sx0, sy0, sw, sh, x, y, dw, dh, flip) => {
      dw = dw || sw;
      dh = dh || sh;
      const dx = Math.round((x - c.x) * sx);
      const dy = Math.round((y - c.y) * sy);
      const ddw = Math.max(1, Math.round(dw * sx));
      const ddh = Math.max(1, Math.round(dh * sy));
      if (!flip) {
        cx.drawImage(img, sx0, sy0, sw, sh, dx, dy, ddw, ddh);
        return;
      }
      cx.save();
      cx.translate(dx + ddw, dy);
      cx.scale(-1, 1);
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, sx0, sy0, sw, sh, 0, 0, ddw, ddh);
      cx.restore();
    };
    if (document.getElementById('togLed').checked && led.length) {
      const f = led[tick % led.length];
      for (const s of spec.screens) blit(f, s.x, s.y);
    }
    if (document.getElementById('togCrowd').checked && crowd.length) {
      const rows = spec.rows || (spec.crowd ? [spec.crowd] : []);
      for (const band of rows) {
        const step = band.step || crowd[0].width;
        const limit = band.xMax != null ? band.xMax : bg.width;
        let i = 0;
        for (let x = band.x0; x + step <= band.x1 + 8; x += step, i++) {
          const f = crowd[(tick + i + (band.phase || 0)) % crowd.length];
          let sw = f.width;
          if (x >= limit) continue;
          if (x + sw > limit) sw = limit - x;
          if (sw < 12) continue;
          blitPart(f, 0, 0, sw, f.height, x, band.feet - f.height);
        }
      }
      if (spec.sides && spec.figs) {
        for (const p of spec.sides) {
          const fi = (tick + (p.phase || 0)) % crowd.length;
          const box = spec.figs[fi][p.slot % spec.figs[fi].length];
          const f = crowd[fi];
          const dw = box[1] * p.scale;
          const dh = f.height * p.scale;
          blitPart(f, box[0], 0, box[1], f.height, p.x, p.feet - dh, dw, dh);
        }
      }
    }
    if (document.getElementById('togRing').checked && ring) {
      cx.drawImage(ring, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    }
    if (document.getElementById('togSmoke').checked && smoke.length && spec.smoke) {
      const now = performance.now();
      for (const s of spec.smoke) {
        const cycle = s.cycle || 20000;
        const puff = s.puff || 2400;
        const t = (now + (s.delay || 0)) % cycle;
        if (t >= puff) continue;
        const fi = Math.min(smoke.length - 1, Math.floor(t / puff * smoke.length));
        const f = smoke[fi];
        const sc = s.scale || 1;
        const dw = f.width * sc;
        const dh = f.height * sc;
        cx.save();
        cx.globalAlpha = s.alpha != null ? s.alpha : 0.5;
        blitPart(f, 0, 0, f.width, f.height, s.x - dw / 2, s.y - dh, dw, dh, s.flip);
        cx.restore();
      }
    }
    if (document.getElementById('togGirl').checked && stance) {
      const feet = floor() - jump;
      const fs = window.STAGE_FIGHTER_SCALE || 1;
      const fw = stance.width * fs;
      const fh = stance.height * fs;
      blit(stance, bg.width / 2 - fw / 2, feet - fh, fw, fh);
    }
    if (document.getElementById('togSpot').checked && spec.spots) {
      paintSpots(c);
    }
    if (document.getElementById('togFloor').checked) {
      const y = (floor() - c.y) * sy;
      cx.strokeStyle = '#ffcb3d';
      cx.setLineDash([6, 4]);
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(cv.width, y); cx.stroke();
      cx.setLineDash([]);
    }
    requestAnimationFrame(draw);
  }

  document.getElementById('stageScroll').oninput = e => { scroll = e.target.value / 1000; };
  const zoomEl = document.getElementById('stageZoom');
  if (zoomEl) zoom = Number(zoomEl.value) / 100 || zoom;
  zoomEl.oninput = e => { zoom = e.target.value / 100; };
  document.getElementById('stageJump').onclick = () => {
    const t = performance.now();
    const step = (now) => {
      const k = (now - t) / 700;
      jump = k < 1 ? Math.sin(k * Math.PI) * 170 : 0;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  (async () => {
    spec = await (await fetch('../voltia/stage/stage.json', { cache: 'no-store' })).json();
    bg = await load('../voltia/stage/' + spec.active);
    ring = spec.ring ? await load('../voltia/stage/' + spec.ring) : null;
    // La figura no puede tumbar el escenario entero: si falla, se sigue sin ella.
    try {
      stance = await load(window.STAGE_FIGHTER || ('../voltia/stage/' + (spec.fighter || 'fighter.png')));
    } catch (err) {
      stance = null;
      if (note) note.textContent = 'La figura no cargó (' +
        (window.STAGE_FIGHTER || spec.fighter) + '). El escenario sigue sin ella: ' + err;
    }
    for (let i = 0; i < 4; i++) {
      led.push(await load('../voltia/stage/led/f' + i + '.png'));
      crowd.push(await load('../voltia/stage/crowd/f' + i + '.png'));
    }
    for (let i = 0; i < 8; i++) {
      smoke.push(await load('../voltia/stage/fx/smoke_f' + i + '.png'));
    }
    if (spec.neon) {
      for (const name of spec.neon.bars || []) {
        neonImgs.bars.push(await load('../voltia/stage/fx/' + name));
      }
      for (const name of spec.neon.letters || []) {
        neonImgs.letters.push(await load('../voltia/stage/fx/' + name));
      }
    }
    const fs = window.STAGE_FIGHTER_SCALE || 1;
    note.innerHTML =
      `<b>${spec.name}</b> · ${bg.width}×${bg.height} px. ` +
      `Voltia ${stance.width}×${stance.height}, dibujada a ${fs}× (1 = pixel de la imagen). ` +
      `Ocupa ${Math.round(stance.height * fs)} px de mundo, con ${floor()} px de suelo. ` +
      `Zoom 100 = el pixel real.<br>` +
      `${spec.note} ` +
      `Orden: fondo, neón, pantallas, público, ring, humo, Voltia, focos. ` +
      `Música: tema «Puerto Voltaje», cumbia electrónica a pulso fijo, en bucle.`;
    draw();
  })().catch(err => { note.textContent = 'No se pudo cargar el escenario: ' + err; });
})();
