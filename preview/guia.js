/* Guía de estilo. Solo información y prompt. No reproduce sprites. */
(async () => {
  const lead = document.getElementById('guideLead');
  const src = document.body.dataset.guide;
  const hex = (rgb) => '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
  let guide;
  try {
    guide = await (await fetch(src + '?v=' + Date.now(), { cache: 'no-store' })).json();
  } catch (err) {
    lead.textContent = 'No pude cargar la guía: ' + err;
    return;
  }
  document.title = guide.title || 'Guía de estilo';
  const h = document.getElementById('guideTitle');
  if (h) h.textContent = guide.title || 'Guía de estilo';
  const anchor = guide.anchor ? 'Ancla: ' + guide.anchor + '. ' : '';
  lead.textContent = anchor + [guide.anchorNote, guide.sacrifice].filter(Boolean).join(' ');
  const scale = document.getElementById('guideScale');
  if (scale) {
    scale.textContent = guide.scale
      ? [guide.scale.rule, guide.scale.fight, guide.scale.why, guide.scale.modelNote]
        .filter(Boolean).join(' ')
      : '';
  }
  const clip = document.getElementById('guideClip');
  if (clip) clip.textContent = [guide.clip, guide.key && guide.key.why].filter(Boolean).join(' ');

  const keyBox = document.getElementById('guideKey');
  const chips = [];
  if (guide.key) chips.push({ name: 'recorte', rgb: guide.key.rgb, extra: guide.key.hex });
  if (guide.nearest) chips.push({
    name: 'más cerca',
    rgb: guide.nearest.rgb,
    extra: guide.nearest.distance + ' de distancia'
  });
  chips.forEach(c => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.innerHTML = '<i></i><b></b><span></span>';
    d.querySelector('i').style.background = hex(c.rgb);
    d.querySelector('b').textContent = c.name;
    d.querySelector('span').textContent = c.extra;
    keyBox.appendChild(d);
  });

  const pal = document.getElementById('guidePal');
  (guide.palette || []).forEach(c => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.innerHTML = '<i></i><b></b><span></span>';
    d.querySelector('i').style.background = hex(c.rgb);
    d.querySelector('b').textContent = c.name;
    const extra = c.distance != null ? String(c.distance) : (c.rgb || []).join(', ');
    d.querySelector('span').textContent = extra;
    pal.appendChild(d);
  });

  const rules = document.getElementById('guideRules');
  (guide.rules || []).forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    rules.appendChild(li);
  });

  const beats = document.getElementById('guideBeats');
  if (beats && guide.idle && guide.idle.captions) {
    beats.hidden = false;
    const ul = document.createElement('ol');
    guide.idle.captions.forEach((cap, i) => {
      const li = document.createElement('li');
      const file = (guide.idle.frames || [])[i] || '';
      li.textContent = cap + (file ? ' · ' + file : '');
      ul.appendChild(li);
    });
    beats.appendChild(ul);
  }

  const pre = document.getElementById('guidePrompt');
  pre.textContent = guide.prompt || '';
  const copy = document.getElementById('copyPrompt');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        copy.textContent = 'Copiado';
      } catch (err) {
        copy.textContent = 'Selecciona el texto';
      }
    });
  }

  const lessons = document.getElementById('guideLessons');
  if (lessons) {
    (guide.lessons || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      lessons.appendChild(li);
    });
  }

  const log = document.getElementById('guideLog');
  (guide.changelog || []).forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    log.appendChild(li);
  });
})();
