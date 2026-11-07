// \u5185\u5bb9\u811a\u672c\uff1a\u627e\u5230 Kindle \u5f53\u524d\u663e\u793a\u7684\u6f2b\u753b\u9875 \u2192 \u53d6\u539f\u56fe \u2192 \u4ea4\u7ed9\u540e\u53f0\u7ffb\u8bd1 \u2192 \u628a\u8bd1\u6587\u53e0\u52a0\u5728\u9875\u9762\u4e0a\u3002
// \u7ffb\u9875\u65f6\u81ea\u52a8\u91cd\u65b0\u7ffb\u8bd1\uff1b\u6309\u4f4f Option(\u2325) \u952e\u53ef\u4e34\u65f6\u9690\u85cf\u8bd1\u6587\u770b\u539f\u6587\u3002
(() => {
  const isTop = window === window.top;
  let cfg = {enabled: false, style: 'auto', fontScale: 1};
  const overlays = new Map();     // img \u2192 {box, sig, src}
  const results = new Map();      // \u7b7e\u540d \u2192 \u7ed3\u679c\uff08\u672c\u9875\u7f13\u5b58\uff0c\u7ffb\u56de\u53bb\u65f6\u79d2\u5f00\uff09
  const pending = new Map();      // \u7b7e\u540d \u2192 Promise
  let lastKey = null, scanTimer = null, fallbackOverlay = null, pill = null, peeking = false;

  // ---------- \u9875\u9762\u56fe\u7247 ----------

  function pageImages() {
    const vw = innerWidth, vh = innerHeight;
    const all = [...document.querySelectorAll('img[src^="blob:"]')].filter((img) => img.naturalWidth > 300 && img.naturalHeight > 300);
    const visible = all.filter((img) => {
      const r = img.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w < 150 || h < 150) return false;
      for (let el = img; el && el !== document.documentElement; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      }
      return true;
    });
    // Kindle \u4f1a\u628a\u524d\u540e\u9875\u53e0\u653e\u5728\u540c\u4e00\u4f4d\u7f6e\uff1b\u7528\u70b9\u51fb\u6d4b\u8bd5\u627e\u51fa\u771f\u6b63\u5728\u6700\u4e0a\u5c42\u7684\u90a3\u5f20\u3002
    const shown = [];
    for (const img of visible) {
      const r = img.getBoundingClientRect();
      const stack = document.elementsFromPoint(Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), Math.min(vh - 1, Math.max(0, r.top + r.height / 2)));
      const rival = visible.filter((o) => o !== img && sameRect(o.getBoundingClientRect(), r));
      if (!rival.length) { shown.push(img); continue; }
      const mine = stack.indexOf(img);
      if (mine >= 0 && rival.every((o) => { const k = stack.indexOf(o); return k < 0 || mine < k; })) shown.push(img);
    }
    return {shown, hidden: all.filter((img) => !shown.includes(img))};
  }

  function sameRect(a, b) {
    return Math.abs(a.left - b.left) < 4 && Math.abs(a.top - b.top) < 4 && Math.abs(a.width - b.width) < 4;
  }

  async function grab(img) {
    // decode() \u5728\u540e\u53f0\u6807\u7b7e\u9875\u53ef\u80fd\u6c38\u4e0d\u8fd4\u56de\uff1b\u6700\u591a\u7b49 1.5 \u79d2\uff0c\u56fe\u7247\u5df2\u52a0\u8f7d\u5c31\u7ee7\u7eed\u3002
    try { await Promise.race([img.decode(), new Promise((r) => setTimeout(r, 1500))]); } catch { return null; }
    if (!img.complete || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(img, 0, 0);
    try {
      return {image: canvas.toDataURL('image/png'), sig: signature(canvas), canvas};
    } catch {
      return null;   // \u753b\u5e03\u88ab\u6c61\u67d3\uff0c\u65e0\u6cd5\u8bfb\u53d6\u50cf\u7d20
    }
  }

  /// 32\u00d732 \u7070\u5ea6\u7f29\u7565\u56fe\u4f5c\u4e3a\u9875\u9762\u6307\u7eb9\uff1aKindle \u7684 blob \u5730\u5740\u7ecf\u5e38\u53d8\uff0c\u4f46\u5185\u5bb9\u4e0d\u53d8\u3002
  function signature(source) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(source, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let s = `${source.width}x${source.height}:`;
    for (let i = 0; i < d.length; i += 4) s += ((d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10 >> 4).toString(16);
    return s;
  }

  function bookId() {
    return /[/=?&](B[A-Z0-9]{9})/.exec(location.href)?.[1] || location.pathname;
  }

  async function translate(grabbed) {
    if (results.has(grabbed.sig)) return results.get(grabbed.sig);
    if (!pending.has(grabbed.sig)) {
      const job = browser.runtime.sendMessage({type: 'translatePage', image: grabbed.image, sig: grabbed.sig, book: bookId(), title: document.title.replace(/\s*[-|\uff5c].*Kindle.*$/i, '').trim().slice(0, 60)})
        .then((r) => {
          // \u672c\u6b21\u4f1a\u8bdd\u91cc\u518d\u7ffb\u56de\u8fd9\u4e00\u9875\u4e0d\u4f1a\u518d\u82b1\u94b1\uff0c\u5b58\u8d77\u6765\u65f6\u6807\u6210\u201c\u5df2\u7f13\u5b58\u201d\u3002
          if (r && !r.error && !r.notice) results.set(grabbed.sig, {...r, usage: r.usage && {...r.usage, cached: true}});
          return r;
        })
        .finally(() => pending.delete(grabbed.sig));
      pending.set(grabbed.sig, job);
    }
    return pending.get(grabbed.sig);
  }

  // ---------- \u7ffb\u9875\u68c0\u6d4b ----------

  function key(imgs) {
    return imgs.map((img) => `${img.src}|${img.naturalWidth}`).join(',');
  }

  function scan() {
    if (!cfg.enabled) return;
    const {shown} = pageImages();
    const k = key(shown);
    if (k === lastKey) return;
    lastKey = k;
    for (const [img, o] of overlays) if (!shown.includes(img)) { o.box.remove(); overlays.delete(img); }
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => run(shown), 250);
  }

  async function run(shown) {
    if (!shown.length) { if (isTop && location.pathname.startsWith('/manga/')) return runFallback(); if (isTop) status('warn', '\u672a\u627e\u5230\u6f2b\u753b\u9875'); return; }
    removeFallback();
    status('busy', '\u6b63\u5728\u8bc6\u522b\u5e76\u7ffb\u8bd1\u2026');
    let failed = '';
    let notice = '';
    const pageUsage = {in: 0, out: 0, cost: 0, unpriced: false, cached: true, any: false, estimated: false};
    let bookUsage = null;
    await Promise.all(shown.map(async (img) => {
      const src = img.src;
      const grabbed = await grab(img);
      if (!grabbed || img.src !== src) return;
      if (overlays.get(img)?.sig === grabbed.sig) return;
      const r = await translate(grabbed);
      if (img.src !== src || !cfg.enabled) return;   // \u7ffb\u8bd1\u671f\u95f4\u5df2\u7ffb\u9875
      if (r.error) { failed = r.error; return; }
      if (r.notice) notice = r.notice;
      addUsage(pageUsage, r);
      if (r.bookUsage) bookUsage = r.bookUsage;
      render(img, grabbed.sig, r.blocks, grabbed.canvas);
    }));
    if (failed) status('error', failed);
    else if (notice) status('warn', notice);
    else status('ok', usageText(pageUsage, bookUsage));
    prefetch();
  }

  /// \u9884\u7ffb\u8bd1 Kindle \u5df2\u52a0\u8f7d\u4f46\u672a\u663e\u793a\u7684\u524d\u540e\u9875\uff0c\u7ffb\u9875\u65f6\u53ef\u76f4\u63a5\u663e\u793a\u3002
  async function prefetch() {
    const {hidden} = pageImages();
    for (const img of hidden.slice(0, 3)) {
      if (!cfg.enabled) return;
      const grabbed = await grab(img);
      if (grabbed && !results.has(grabbed.sig)) await translate(grabbed).catch(() => {});
    }
  }

  // ---------- \u540e\u5907\u65b9\u6848\uff1a\u622a\u53d6\u53ef\u89c1\u533a\u57df\uff08\u627e\u4e0d\u5230\u9875\u9762\u56fe\u7247\u65f6\uff09 ----------

  async function runFallback() {
    status('busy', '\u6b63\u5728\u8bc6\u522b\u5e76\u7ffb\u8bd1\u2026');
    hideAll(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let shot;
    try { shot = await browser.runtime.sendMessage({type: 'captureTab'}); } finally { hideAll(false); }
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = shot.image; });
    const sig = signature(img);
    if (fallbackOverlay?.sig === sig) return status('ok', '');
    const r = await translate({image: shot.image, sig});
    if (r.error) return status('error', r.error);
    removeFallback();
    fallbackOverlay = {sig, box: makeBox()};
    Object.assign(fallbackOverlay.box.style, {left: '0', top: '0', width: '100vw', height: '100vh'});
    fill(fallbackOverlay.box, r.blocks, innerHeight);
    const pageUsage = {in: 0, out: 0, cost: 0, unpriced: false, cached: true, any: false, estimated: false};
    addUsage(pageUsage, r);
    status(r.notice ? 'warn' : 'ok', r.notice || usageText(pageUsage, r.bookUsage));
  }

  // ---------- \u7528\u91cf\u663e\u793a ----------

  function addUsage(sum, r) {
    if (!r.usage) return;
    sum.any = true;
    if (r.usage.cached) return;
    sum.cached = false;
    sum.in += r.usage.in; sum.out += r.usage.out;
    if (r.usage.estimated) sum.estimated = true;
    if (r.usage.cost === null || r.usage.cost === undefined) sum.unpriced = true; else sum.cost += r.usage.cost;
  }

  const fmtTok = (n) => n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
  const fmtCost = (c) => c === 0 ? '\u00a50' : c < 0.01 ? `\u00a5${c.toFixed(4)}` : c < 1 ? `\u00a5${c.toFixed(3)}` : `\u00a5${c.toFixed(2)}`;

  function usageText(page, book) {
    if (!page.any && !book) return '';
    let s;
    if (!page.any || page.cached) s = '\u672c\u9875\u5df2\u7f13\u5b58\uff0c\u514d\u8d39';
    else s = `\u672c\u9875 ${page.estimated ? '\u7ea6' : ''}${fmtTok(page.in + page.out)} tokens${page.unpriced ? '' : ' \u2248 ' + fmtCost(page.cost)}`;
    if (book) s += ` \u00b7 \u672c\u4e66 ${book.pages} \u9875 ${fmtTok(book.in + book.out)} tokens${book.unpriced && !book.cost ? '' : ' \u2248 ' + fmtCost(book.cost)}`;
    return s;
  }

  function removeFallback() { fallbackOverlay?.box.remove(); fallbackOverlay = null; }

  // ---------- \u6e32\u67d3 ----------

  function makeBox() {
    const box = document.createElement('div');
    box.className = 'mt-layer';
    document.documentElement.appendChild(box);
    return box;
  }

  function render(img, sig, blocks, canvas) {
    overlays.get(img)?.box.remove();
    const box = makeBox();
    overlays.set(img, {box, sig});
    place(img, box);
    fill(box, blocks, img.getBoundingClientRect().height, canvas);
  }

  /// \u91c7\u6837\u6587\u5b57\u5468\u56f4\u4e00\u5708\u7684\u989c\u8272\uff1a\u82e5\u662f\u7eaf\u8272\uff08\u5982\u767d\u8272\u6c14\u6ce1\uff09\u8fd4\u56de\u8be5\u989c\u8272\uff0c\u5426\u5219\u8fd4\u56de null\uff08\u6587\u5b57\u538b\u5728\u753b\u9762\u4e0a\uff09\u3002
  function backgroundOf(canvas, x, y, w, h) {
    if (!canvas) return null;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const pts = [];
    // \u53ea\u53d6\u6bcf\u6761\u8fb9\u4e2d\u95f4 60%\uff1a\u6c14\u6ce1\u591a\u4e3a\u692d\u5706\uff0c\u5916\u63a5\u77e9\u5f62\u7684\u56db\u89d2\u5e38\u843d\u5728\u6c14\u6ce1\u5916\u3002
    for (let i = 0; i <= 12; i++) {
      const t = 0.2 + 0.6 * i / 12;
      pts.push([x + w * t, y], [x + w * t, y + h], [x, y + h * t], [x + w, y + h * t]);
    }
    const samples = [];
    for (const [px, py] of pts) {
      const cx = Math.round(Math.min(W - 1, Math.max(0, px * W))), cy = Math.round(Math.min(H - 1, Math.max(0, py * H)));
      const d = ctx.getImageData(cx, cy, 1, 1).data;
      samples.push([d[0], d[1], d[2], (d[0] * 3 + d[1] * 6 + d[2]) / 10]);
    }
    samples.sort((a, b) => a[3] - b[3]);
    const mid = samples[samples.length >> 1];
    const close = samples.filter((p) => Math.abs(p[3] - mid[3]) < 22).length;
    return close / samples.length >= 0.8 ? mid : null;
  }

  function place(img, box) {
    const r = img.getBoundingClientRect();
    Object.assign(box.style, {left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`});
  }

  /// \u6587\u5b57\u5468\u56f4\u4e00\u5708\u989c\u8272\u7684\u4e2d\u4f4d\u6570\uff08\u4e0d\u8981\u6c42\u7eaf\u8272\uff09\uff0c\u7528\u4e8e\u7ed9\u538b\u5728\u753b\u9762\u4e0a\u7684\u6587\u5b57\u914d\u5e95\u677f\u3002
  function ringMedian(canvas, x, y, w, h) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const W = canvas.width, H = canvas.height, out = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      for (const [px, py] of [[x + w * t, y], [x + w * t, y + h], [x, y + h * t], [x + w, y + h * t]]) {
        const d = ctx.getImageData(Math.round(Math.min(W - 1, Math.max(0, px * W))), Math.round(Math.min(H - 1, Math.max(0, py * H))), 1, 1).data;
        out.push([d[0], d[1], d[2], (d[0] * 3 + d[1] * 6 + d[2]) / 10]);
      }
    }
    out.sort((a, b) => a[3] - b[3]);
    return out[out.length >> 1];
  }

  /// \u9010\u50cf\u7d20\u62b9\u9664\u6c14\u6ce1\u91cc\u7684\u65e5\u6587\uff1a
  /// 1) \u4ece\u6587\u5b57\u5916\u5708\u7684\u80cc\u666f\u8272\u50cf\u7d20\u51fa\u53d1\u505a\u6d2a\u6c34\u586b\u5145\uff0c\u5f97\u5230\u201c\u6c14\u6ce1\u5185\u90e8\u7684\u80cc\u666f\u201d\uff1b
  /// 2) \u518d\u4ece\u88c1\u526a\u533a\u8fb9\u7f18\u586b\u5145\uff0c\u5f97\u5230\u201c\u6c14\u6ce1\u5916\u90e8\u201d\uff08\u542b\u6c14\u6ce1\u8fb9\u6846\u548c\u753b\u9762\uff09\uff1b
  /// 3) \u4e24\u8005\u90fd\u4e0d\u662f\u7684\u50cf\u7d20\u5c31\u662f\u88ab\u6c14\u6ce1\u5305\u4f4f\u7684\u5b57\u8ff9\uff0c\u6d82\u6210\u80cc\u666f\u8272\u3002
  /// \u53ea\u5904\u7406\u6587\u5b57\u6846\u5916\u6269\u7ea6 1.2 \u4e2a\u5b57\u5bbd\u7684\u8303\u56f4\uff0c\u907f\u514d\u8bef\u4f24\u522b\u5904\u3002\u8fd4\u56de\u4e00\u4e2a\u53e0\u52a0\u7528\u7684 canvas\uff0c\u5931\u8d25\u8fd4\u56de null\u3002
  function eraseInk(canvas, b, bg) {
    if (!canvas) return null;
    const W = canvas.width, H = canvas.height, cs = Math.max(4, b.charSize * H);
    const bx0 = b.x * W, by0 = b.y * H, bx1 = (b.x + b.width) * W, by1 = (b.y + b.height) * H;
    const m = cs * 2.5;
    const x0 = Math.max(0, Math.floor(bx0 - m)), y0 = Math.max(0, Math.floor(by0 - m));
    const x1 = Math.min(W, Math.ceil(bx1 + m)), y1 = Math.min(H, Math.ceil(by1 + m));
    const w = x1 - x0, h = y1 - y0;
    if (w < 4 || h < 4 || w * h > 4e6) return null;
    const src = canvas.getContext('2d', {willReadFrequently: true}).getImageData(x0, y0, w, h).data;
    const n = w * h, lum = new Uint8Array(n);
    for (let i = 0; i < n; i++) lum[i] = (src[i * 4] * 3 + src[i * 4 + 1] * 6 + src[i * 4 + 2]) / 10;
    const bgL = bg[3];
    const isBg = (i) => Math.abs(lum[i] - bgL) < 45;

    // 1) \u6c14\u6ce1\u5185\u80cc\u666f\uff1a\u4ece\u6587\u5b57\u5916 0.3 \u5b57\u5bbd\u7684\u4e00\u5708\u91cc\u53d6\u79cd\u5b50\u3002
    const region = new Uint8Array(n), queue = new Int32Array(n);
    let head = 0, tail = 0;
    const seed = (px, py) => {
      const ix = Math.round(px) - x0, iy = Math.round(py) - y0;
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
      const i = iy * w + ix;
      if (!region[i] && isBg(i)) { region[i] = 1; queue[tail++] = i; }
    };
    const r = cs * 0.3;
    for (let t = 0; t <= 1; t += 0.02) {
      seed(bx0 - r + (bx1 - bx0 + 2 * r) * t, by0 - r); seed(bx0 - r + (bx1 - bx0 + 2 * r) * t, by1 + r);
      seed(bx0 - r, by0 - r + (by1 - by0 + 2 * r) * t); seed(bx1 + r, by0 - r + (by1 - by0 + 2 * r) * t);
    }
    if (!tail) return null;
    while (head < tail) {
      const i = queue[head++], ix = i % w;
      if (ix > 0 && !region[i - 1] && isBg(i - 1)) { region[i - 1] = 1; queue[tail++] = i - 1; }
      if (ix < w - 1 && !region[i + 1] && isBg(i + 1)) { region[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= w && !region[i - w] && isBg(i - w)) { region[i - w] = 1; queue[tail++] = i - w; }
      if (i < n - w && !region[i + w] && isBg(i + w)) { region[i + w] = 1; queue[tail++] = i + w; }
    }

    // 2) \u6c14\u6ce1\u5916\u90e8\uff1a\u4ece\u88c1\u526a\u533a\u56db\u8fb9\u51fa\u53d1\uff0c\u8d70\u6240\u6709\u201c\u975e\u6c14\u6ce1\u5185\u80cc\u666f\u201d\u7684\u50cf\u7d20\u3002
    const outside = new Uint8Array(n);
    head = 0; tail = 0;
    const push = (i) => { if (!region[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
    for (let ix = 0; ix < w; ix++) { push(ix); push((h - 1) * w + ix); }
    for (let iy = 0; iy < h; iy++) { push(iy * w); push(iy * w + w - 1); }
    while (head < tail) {
      const i = queue[head++], ix = i % w;
      if (ix > 0) push(i - 1);
      if (ix < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }

    // 3) \u88ab\u5305\u4f4f\u7684\u5b57\u8ff9\uff08\u9650\u5b9a\u5728\u6587\u5b57\u6846\u5916\u6269 1.2 \u5b57\u5bbd\u5185\uff09\uff0c\u5916\u6269 2px \u53bb\u6389\u6297\u952f\u9f7f\u6b8b\u5f71\u3002
    const zx0 = Math.max(0, Math.floor(bx0 - cs * 1.2) - x0), zy0 = Math.max(0, Math.floor(by0 - cs * 1.2) - y0);
    const zx1 = Math.min(w, Math.ceil(bx1 + cs * 1.2) - x0), zy1 = Math.min(h, Math.ceil(by1 + cs * 1.2) - y0);
    const ink = new Uint8Array(n);
    let count = 0;
    for (let iy = zy0; iy < zy1; iy++) for (let ix = zx0; ix < zx1; ix++) {
      const i = iy * w + ix;
      if (!region[i] && !outside[i]) { ink[i] = 1; count++; }
    }
    if (!count) return null;
    const out = new ImageData(w, h), d = out.data;
    const grow = 2;
    for (let iy = zy0; iy < zy1; iy++) for (let ix = zx0; ix < zx1; ix++) {
      const i = iy * w + ix;
      if (!ink[i]) continue;
      for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= w || jy >= h) continue;
        const j = jy * w + jx;
        if (outside[j] && !ink[j]) continue;   // \u4e0d\u6d82\u5230\u6c14\u6ce1\u8fb9\u6846\u4e0a
        d[j * 4] = bg[0]; d[j * 4 + 1] = bg[1]; d[j * 4 + 2] = bg[2]; d[j * 4 + 3] = 255;
      }
    }
    const layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    layer.getContext('2d').putImageData(out, 0, 0);
    layer.className = 'mt-erase';
    Object.assign(layer.style, {left: `${x0 / W * 100}%`, top: `${y0 / H * 100}%`, width: `${w / W * 100}%`, height: `${h / H * 100}%`});
    return layer;
  }

  function fill(box, blocks, pageHeight, canvas) {
    for (const b of blocks) {
      const el = document.createElement('div');
      // \u8bc6\u522b\u6846\u53ea\u5305\u4f4f\u6587\u5b57\uff1b\u7a0d\u5fae\u5916\u6269\uff0c\u8ba9\u8bd1\u6587\u6709\u7a7a\u95f4\u3002
      const padX = b.width * 0.25 + 0.006, padY = b.height * 0.12 + 0.006;
      let style = cfg.style;
      if (style === 'auto') {
        // \u53ea\u5728\u7d27\u8d34\u6587\u5b57\u7684\u4e00\u5708\u91c7\u6837\uff08\u7ea6 0.3 \u4e2a\u5b57\u5bbd\uff09\uff0c\u8fd9\u5708\u57fa\u672c\u90fd\u5728\u6c14\u6ce1\u5185\u90e8\u3002
        const aspect = canvas ? canvas.height / canvas.width : 1;
        const ry = b.charSize * 0.3, rx = ry * aspect;
        const ring = [b.x - rx, b.y - ry, b.width + rx * 2, b.height + ry * 2];
        const bg = backgroundOf(canvas, ...ring);
        const erased = bg && eraseInk(canvas, b, bg);
        if (erased) {
          // \u6c14\u6ce1\u5185\uff1a\u9010\u50cf\u7d20\u62b9\u6389\u65e5\u6587\uff08\u542b OCR \u6f0f\u6389\u7684\u5217\uff09\uff0c\u4e0d\u78b0\u6c14\u6ce1\u8fb9\u6846\u548c\u753b\u9762\u3002
          box.appendChild(erased);
          el.style.color = bg[3] < 110 ? '#fff' : '#111';
          style = 'match';
        } else {
          // \u6587\u5b57\u538b\u5728\u753b\u9762\u4e0a\uff1a\u5728\u6587\u5b57\u533a\u57df\u57ab\u4e00\u5757\u5468\u56f4\u989c\u8272\u7684\u5e95\u677f\uff0c\u907f\u514d\u4e2d\u65e5\u6587\u91cd\u53e0\u3002
          const tone = bg || ringMedian(canvas, ...ring) || [255, 255, 255, 255];
          const color = `rgba(${tone[0]},${tone[1]},${tone[2]},0.97)`;
          const plate = document.createElement('div');
          plate.className = 'mt-plate';
          const py = b.charSize * 0.45, px = py * aspect;
          Object.assign(plate.style, {
            left: `${(b.x - px) * 100}%`, top: `${(b.y - py) * 100}%`, width: `${(b.width + px * 2) * 100}%`, height: `${(b.height + py * 2) * 100}%`,
            background: color, boxShadow: `0 0 ${Math.max(3, b.charSize * pageHeight * 0.3)}px ${Math.max(2, b.charSize * pageHeight * 0.2)}px ${color}`,
          });
          box.appendChild(plate);
          const dark = tone[3] < 110;
          el.style.color = dark ? '#fff' : '#111';
          el.style.textShadow = dark ? '0 0 2px #000, 0 0 3px #000' : '0 0 2px #fff, 0 0 3px #fff';
          style = 'match';
        }
      }
      el.className = `mt-block mt-${style}`;
      Object.assign(el.style, {
        left: `${(b.x - padX) * 100}%`, top: `${(b.y - padY) * 100}%`,
        width: `${(b.width + padX * 2) * 100}%`, height: `${(b.height + padY * 2) * 100}%`,
      });
      const vertical = b.vertical && b.height > b.width * 1.2;
      if (vertical) el.classList.add('mt-vertical');
      el.textContent = b.text;
      el.title = b.source;
      box.appendChild(el);
      fit(el, Math.max(10, b.charSize * pageHeight * 0.95 * (cfg.fontScale || 1)));
    }
  }

  function fit(el, size) {
    for (let s = size; s >= 9; s -= Math.max(0.5, s * 0.08)) {
      el.style.fontSize = `${s}px`;
      if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) return;
    }
    el.style.overflow = 'visible';
  }

  function follow() {
    for (const [img, o] of overlays) {
      if (!img.isConnected) { o.box.remove(); overlays.delete(img); continue; }
      place(img, o.box);
    }
  }

  function hideAll(hidden) {
    document.documentElement.classList.toggle('mt-hidden', hidden);
  }

  function clearAll() {
    for (const o of overlays.values()) o.box.remove();
    overlays.clear();
    removeFallback();
    lastKey = null;
  }

  // ---------- \u72b6\u6001\u63d0\u793a ----------

  const touch = matchMedia('(pointer: coarse)').matches;

  function status(kind, text) {
    if (!isTop && kind === 'ok') { pill?.remove(); pill = null; return; }
    if (!cfg.enabled) { pill?.remove(); pill = null; return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'mt-pill';
      pill.innerHTML = '<span class="mt-dot"></span><span class="mt-text"></span><button data-act="peek" title="\u6309\u4f4f\u770b\u539f\u6587">\u539f</button><button data-act="opt" title="\u8bbe\u7f6e">\u2699</button><button data-act="off" title="\u5173\u95ed\u81ea\u52a8\u7ffb\u8bd1">\u2715</button>';
      pill.addEventListener('click', (e) => {
        const act = e.target.dataset?.act;
        if (act === 'opt') browser.runtime.sendMessage({type: 'openOptions'});
        if (act === 'off') browser.storage.local.set({enabled: false});
      });
      // \u89e6\u5c4f\uff08iPad/iPhone\uff09\u6ca1\u6709 \u2325 \u952e\uff1a\u6309\u4f4f\u300c\u539f\u300d\u6309\u94ae\u770b\u539f\u6587\u3002
      const peekBtn = pill.querySelector('[data-act=peek]');
      const setPeek = (on) => { peeking = on; document.documentElement.classList.toggle('mt-peek', on); };
      peekBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setPeek(true); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) peekBtn.addEventListener(ev, () => setPeek(false));
      peekBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      document.documentElement.appendChild(pill);
    }
    pill.dataset.kind = kind;
    pill.querySelector('.mt-text').textContent = text || (touch ? '\u5df2\u7ffb\u8bd1 \u00b7 \u6309\u4f4f\u300c\u539f\u300d\u770b\u539f\u6587' : '\u5df2\u7ffb\u8bd1 \u00b7 \u6309\u4f4f \u2325 \u770b\u539f\u6587');
    pill.title = touch ? '\u6309\u4f4f\u300c\u539f\u300d\u770b\u539f\u6587' : '\u6309\u4f4f \u2325 Option \u6216\u300c\u539f\u300d\u770b\u539f\u6587';
  }

  // ---------- \u6837\u5f0f ----------

  const css = document.createElement('style');
  css.textContent = `
    .mt-layer{position:fixed;z-index:2147483646;pointer-events:none}
    .mt-hidden .mt-layer,.mt-hidden .mt-pill,.mt-peek .mt-layer{visibility:hidden!important}
    .mt-block{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;
      overflow:hidden;overflow-wrap:anywhere;line-height:1.18;font-weight:700;color:#111;
      font-family:"PingFang SC","Hiragino Sans GB","Heiti SC",sans-serif;padding:2px}
    .mt-vertical{writing-mode:vertical-rl;text-orientation:mixed;line-height:1.1}
    .mt-outline{text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,1px 1px 0 #fff,-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,2px 0 1px #fff,-2px 0 1px #fff,0 2px 1px #fff,0 -2px 1px #fff}
    .mt-soft{background:rgba(255,255,255,.78);border-radius:10px;box-shadow:0 0 6px 4px rgba(255,255,255,.78)}
    .mt-solid{background:#fff;border-radius:8px}
    .mt-erase{position:absolute}
    .mt-plate{position:absolute;border-radius:40%}
    .mt-pill{position:fixed;z-index:2147483647;right:14px;bottom:14px;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 28px);
      padding:5px 6px 5px 10px;border-radius:16px;background:rgba(30,30,30,.82);color:#fff;font:12px/1.3 -apple-system,sans-serif;opacity:.55;transition:opacity .2s}
    .mt-pill:hover,.mt-pill[data-kind=error],.mt-pill[data-kind=warn]{opacity:1}
    .mt-pill button{all:unset;cursor:pointer;padding:0 4px;opacity:.8;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
    .mt-pill button[data-act=peek]{padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.18)}
    .mt-pill button:hover{opacity:1}
    .mt-dot{width:8px;height:8px;border-radius:50%;background:#3c3;flex:none}
    .mt-pill[data-kind=busy] .mt-dot{background:#fb3;animation:mt-pulse 1s infinite}
    .mt-pill[data-kind=warn] .mt-dot{background:#f93}
    .mt-pill[data-kind=error] .mt-dot{background:#f44}
    @keyframes mt-pulse{50%{opacity:.3}}`;
  document.documentElement.appendChild(css);

  // ---------- \u4e8b\u4ef6 ----------

  addEventListener('keydown', (e) => { if (e.key === 'Alt' && !peeking) { peeking = true; document.documentElement.classList.add('mt-peek'); } });
  addEventListener('keyup', (e) => { if (e.key === 'Alt') { peeking = false; document.documentElement.classList.remove('mt-peek'); } });
  addEventListener('blur', () => { peeking = false; document.documentElement.classList.remove('mt-peek'); });
  addEventListener('resize', () => { follow(); if (fallbackOverlay) { removeFallback(); lastKey = null; } });
  addEventListener('scroll', follow, true);

  // \u7ffb\u9875\u4f1a\u6539\u52a8\u56fe\u7247 src \u6216\u589e\u5220\u8282\u70b9\uff1b\u6ca1\u6709\u56fe\u7247\u5143\u7d20\u65f6\uff08\u540e\u5907\u622a\u56fe\u6a21\u5f0f\uff09\u9760\u952e\u76d8/\u70b9\u51fb/\u6eda\u8f6e\u89e6\u53d1\u3002
  let throttle = 0;
  new MutationObserver(() => { if (!throttle) throttle = setTimeout(() => { throttle = 0; scan(); }, 200); }).observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style', 'class']});
  for (const type of ['keyup', 'click', 'wheel', 'touchend']) {
    addEventListener(type, () => setTimeout(() => {
      if (fallbackOverlay || !overlays.size) lastKey = null;
      scan();
    }, 600), true);
  }
  setInterval(() => { scan(); follow(); }, 700);

  async function applySettings() {
    cfg = await browser.runtime.sendMessage({type: 'getSettings'});
    clearAll();
    results.clear();
    if (cfg.enabled) { status('busy', '\u6b63\u5728\u67e5\u627e\u6f2b\u753b\u9875\u2026'); scan(); }
    else status('ok', '');
  }
  const KEYS = ['enabled', 'engine', 'baseUrl', 'apiKey', 'model', 'sendImage', 'style', 'fontScale'];
  browser.storage.onChanged.addListener((changes) => { if (KEYS.some((k) => k in changes)) applySettings(); });
  applySettings();
})();

