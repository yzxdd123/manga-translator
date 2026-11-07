// \u540e\u53f0\uff1a\u63a5\u6536\u5185\u5bb9\u811a\u672c\u53d1\u6765\u7684\u9875\u9762\u56fe\u7247 \u2192 \u539f\u751f OCR \u2192 AI\uff08\u6216\u82f9\u679c\u7cfb\u7edf\uff09\u7ffb\u8bd1 \u2192 \u8fd4\u56de\u8bd1\u6587\u5757\u3002
const NATIVE = 'application.id';
const DEFAULTS = {
  enabled: false,          // \u81ea\u52a8\u7ffb\u8bd1\u603b\u5f00\u5173\uff08\u70b9\u5de5\u5177\u680f\u6309\u94ae\u5207\u6362\uff09
  engine: 'ai',            // 'apple' | 'ai'\uff08\u672a\u586b key \u65f6\u81ea\u52a8\u7528\u7cfb\u7edf\u7ffb\u8bd1\uff09
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  // \u963f\u91cc\u4e91\u767e\u70bc\u5de5\u4f5c\u7a7a\u95f4
  apiKey: '',
  model: 'qwen3.7-flash',
  sendImage: false,        // \u628a\u9875\u9762\u56fe\u7247\u4e00\u8d77\u53d1\u7ed9\u6a21\u578b\uff08\u9700\u6a21\u578b\u652f\u6301\u770b\u56fe\uff09
  style: 'auto',           // 'auto' \u81ea\u9002\u5e94 | 'outline' \u900f\u660e\u63cf\u8fb9 | 'soft' \u534a\u900f\u660e | 'solid' \u767d\u5e95
  fontScale: 1,
};

async function settings() {
  return {...DEFAULTS, ...(await browser.storage.local.get(Object.keys(DEFAULTS)))};
}

const pageCache = new Map();          // \u9875\u9762\u7b7e\u540d \u2192 \u7ed3\u679c
const history = new Map();            // \u4e66 \u2192 \u6700\u8fd1\u51e0\u9875\u7684 [{source, text}]
let queue = Promise.resolve();        // \u539f\u751f\u8c03\u7528\u4e32\u884c\u6267\u884c

// \u8bd1\u6587\u6301\u4e45\u7f13\u5b58\uff1a\u6d4f\u89c8\u5668\u91cd\u542f\u540e\uff0c\u8bfb\u8fc7\u7684\u9875\u9762\u4e0d\u5fc5\u518d\u82b1 API \u8d39\u7528\u3002
const CACHE_LIMIT = 400;

async function cacheKey(sig, cfg) {
  const raw = `${sig}|${cfg.engine}|${cfg.engine === 'ai' ? `${cfg.baseUrl}|${cfg.model}|${cfg.sendImage}` : ''}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return 'p:' + [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function recall(key) {
  if (pageCache.has(key)) return pageCache.get(key);
  const stored = (await browser.storage.local.get(key))[key];
  if (stored) pageCache.set(key, stored);
  return stored;
}

async function remember(key, result) {
  pageCache.set(key, result);
  while (pageCache.size > 60) pageCache.delete(pageCache.keys().next().value);
  const index = ((await browser.storage.local.get('cacheIndex')).cacheIndex || []).filter((k) => k !== key);
  index.push(key);
  const evicted = index.splice(0, Math.max(0, index.length - CACHE_LIMIT));
  if (evicted.length) await browser.storage.local.remove(evicted);
  await browser.storage.local.set({[key]: result, cacheIndex: index});
}

function native(message) {
  // OCR \u4e32\u884c\u6267\u884c\u907f\u514d\u5360\u6ee1\u5185\u5b58\uff1b\u7f51\u7edc\u8bf7\u6c42\u548c\u7cfb\u7edf\u7ffb\u8bd1\u53ef\u4ee5\u5e76\u884c\u3002
  const call = () => browser.runtime.sendNativeMessage(NATIVE, message);
  let run;
  if (message.action === 'ocr') { run = queue.then(call); queue = run.catch(() => {}); } else run = call();
  return run.then((reply) => {
    if (!reply) throw new Error('\u539f\u751f\u6269\u5c55\u6ca1\u6709\u54cd\u5e94');
    if (reply.error) throw new Error(reply.error);
    return reply;
  });
}

// ---------- AI \u7ffb\u8bd1 ----------

const SYSTEM_PROMPT = `\u4f60\u662f\u8d44\u6df1\u65e5\u6f2b\u6c49\u5316\u7ec4\u7684\u8bd1\u8005\u517c\u5d4c\u5b57\u6da6\u8272\uff0c\u628a\u65e5\u6587\u6f2b\u753b\u5bf9\u767d\u7ffb\u6210\u5730\u9053\u7684\u7b80\u4f53\u4e2d\u6587\u3002
\u8981\u6c42\uff1a
- \u8bd1\u610f\u4e0d\u8bd1\u5b57\uff0c\u8fd8\u539f\u89d2\u8272\u7684\u8bed\u6c14\u3001\u60c5\u7eea\u548c\u6027\u683c\uff08\u7c97\u9c81\u3001\u6492\u5a07\u3001\u656c\u8bed\u3001\u65b9\u8a00\u3001\u53e3\u7656\u7b49\u90fd\u8981\u4f53\u73b0\uff09\uff0c\u50cf\u4e2d\u6587\u6f2b\u753b\u539f\u751f\u53f0\u8bcd\u4e00\u6837\u81ea\u7136\u3002
- \u4eba\u540d\u3001\u5730\u540d\u3001\u62db\u5f0f\u540d\u7b49\u4e13\u6709\u540d\u8bcd\u524d\u540e\u7edf\u4e00\uff1b\u5df2\u7ed9\u51fa\u7684\u201c\u8bd1\u540d\u8868\u201d\u5fc5\u987b\u7167\u7528\u3002\u65e5\u6587\u4eba\u540d\u7528\u5e38\u89c1\u4e2d\u6587\u8bd1\u6cd5\uff0c\u65e0\u6cd5\u786e\u5b9a\u65f6\u7528\u97f3\u8bd1\u3002
- \u62df\u58f0\u8bcd/\u97f3\u6548\u8bd1\u6210\u7b80\u77ed\u7684\u4e2d\u6587\u62df\u58f0\u8bcd\uff08\u5982\u201c\u7830\uff01\u201d\u201c\u5530\u2014\u2014\u201d\uff09\u3002
- \u8bd1\u6587\u957f\u5ea6\u5c3d\u91cf\u63a5\u8fd1\u539f\u6587\uff0c\u6c14\u6ce1\u7a7a\u95f4\u6709\u9650\uff0c\u4e0d\u8981\u6dfb\u52a0\u89e3\u91ca\u6216\u6ce8\u91ca\u3002
- OCR \u8bc6\u522b\u7ed3\u679c\u53ef\u80fd\u6709\u9519\u5b57\u3001\u6f0f\u5b57\u6216\u65ad\u53e5\u9519\u8bef\uff0c\u8bf7\u7ed3\u5408\u4e0a\u4e0b\u6587${'{IMAGE_HINT}'}\u5408\u7406\u63a8\u65ad\u539f\u610f\u3002
- \u82e5\u67d0\u6761\u660e\u663e\u4e0d\u662f\u6f2b\u753b\u5185\u5bb9\uff08\u9875\u7801\u3001\u6c34\u5370\u3001\u9605\u8bfb\u5668\u754c\u9762\u6587\u5b57\u7b49\uff09\uff0c\u8bd1\u6587\u7559\u7a7a\u5b57\u7b26\u4e32\u3002
\u53ea\u8f93\u51fa JSON\uff0c\u683c\u5f0f\uff1a{"translations":[{"id":1,"text":"\u8bd1\u6587"}],"names":{"\u65e5\u6587\u4e13\u6709\u540d\u8bcd":"\u4e2d\u6587\u8bd1\u540d"}}
names \u53ea\u5217\u672c\u9875\u51fa\u73b0\u7684\u4eba\u540d/\u4e13\u6709\u540d\u8bcd\uff0c\u6ca1\u6709\u5c31\u7ed9\u7a7a\u5bf9\u8c61\u3002`;

async function aiTranslate(blocks, cfg, book, imageDataUrl) {
  const prev = history.get(book) || [];
  const glossary = (await browser.storage.local.get('glossary')).glossary || {};
  const names = glossary[book] || {};
  const items = blocks.map((b, i) => ({id: i + 1, text: b.source, \u6392\u7248: b.vertical ? '\u7ad6\u6392' : '\u6a2a\u6392'}));
  let prompt = '';
  if (Object.keys(names).length) prompt += `\u8bd1\u540d\u8868\uff1a${JSON.stringify(names)}\n\n`;
  if (prev.length) prompt += `\u524d\u6587\uff08\u4f9b\u7406\u89e3\u5267\u60c5\u548c\u79f0\u547c\uff0c\u52ff\u91cd\u590d\u7ffb\u8bd1\uff09\uff1a\n${prev.map((p) => `${p.source} \u2192 ${p.text}`).join('\n')}\n\n`;
  prompt += `\u672c\u9875\u5bf9\u767d\uff08\u5df2\u6309\u9605\u8bfb\u987a\u5e8f\u6392\u5217${imageDataUrl ? '\uff0c\u7f16\u53f7\u4e0e\u56fe\u4e2d\u7ea2\u8272\u6570\u5b57\u5bf9\u5e94' : ''}\uff09\uff1a\n${JSON.stringify(items)}`;

  const system = SYSTEM_PROMPT.replace('{IMAGE_HINT}', imageDataUrl ? '\u548c\u9875\u9762\u56fe\u7247' : '');
  const userContent = imageDataUrl
    ? [{type: 'image_url', image_url: {url: imageDataUrl}}, {type: 'text', text: prompt}]
    : prompt;
  // \u7528\u6d41\u5f0f\u8fd4\u56de\uff1a\u4f1a\u201c\u601d\u8003\u201d\u7684\u6a21\u578b\u53ef\u80fd\u5f88\u4e45\u624d\u51fa\u7b2c\u4e00\u4e2a\u5b57\uff0c\u6d41\u5f0f\u4e0b\u53ea\u8981\u670d\u52a1\u7aef\u6301\u7eed\u53d1\u6570\u636e\u5c31\u4e0d\u4f1a\u8d85\u65f6\u3002
  const body = {model: cfg.model, messages: [{role: 'system', content: system}, {role: 'user', content: userContent}], response_format: {type: 'json_object'}, stream: true};

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  // \u963f\u91cc\u4e91\u767e\u70bc\u7684 Qwen \u9ed8\u8ba4\u53ef\u80fd\u5148\u201c\u601d\u8003\u201d\u518d\u56de\u7b54\uff0c\u7ffb\u8bd1\u7528\u4e0d\u7740\uff0c\u5173\u6389\u80fd\u5feb\u5f88\u591a\u3002
  if (/dashscope|aliyuncs\.com/i.test(cfg.baseUrl)) body.enable_thinking = false;
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}`};
  const send = async () => {
    // \u9047\u5230\u9650\u6d41(429)\u6216\u670d\u52a1\u7aef\u9519\u8bef(5xx)\u65f6\u7a0d\u7b49\u91cd\u8bd5\uff0c\u6700\u591a\u4e24\u6b21\u3002
    for (let attempt = 0; ; attempt++) {
      const r = await native({action: 'http', url, headers, body: JSON.stringify(body), stream: Boolean(body.stream), timeout: 60});
      if ((r.status === 429 || r.status >= 500) && attempt < 2) {
        await new Promise((ok) => setTimeout(ok, (attempt + 1) * 3000));
        continue;
      }
      return r;
    }
  };
  let reply = await send();
  // \u670d\u52a1\u5546\u4e0d\u652f\u6301\u67d0\u4e2a\u53c2\u6570\u65f6\uff0c\u53bb\u6389\u5b83\u518d\u8bd5\uff08JSON \u6a21\u5f0f\u3001\u5173\u95ed\u601d\u8003\u3001\u6d41\u5f0f\uff09\u3002
  for (const [param, pattern] of [['response_format', /response_format|json_object|json mode/i], ['enable_thinking', /enable_thinking|thinking/i], ['stream', /stream/i]]) {
    if (reply.status !== 400 || !(param in body) || !pattern.test(reply.body)) continue;
    delete body[param];
    reply = await send();
  }
  if (reply.status < 200 || reply.status >= 300) {
    let detail = reply.body.slice(0, 300);
    try { detail = JSON.parse(reply.body).error?.message || detail; } catch {}
    throw new Error(`AI \u63a5\u53e3\u8fd4\u56de ${reply.status}\uff1a${detail}`);
  }
  const content = JSON.parse(reply.body).choices?.[0]?.message?.content || '';
  const json = JSON.parse(content.replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[\s\S]*\}/)?.[0] || 'null');
  if (!json || !Array.isArray(json.translations)) throw new Error('AI \u8fd4\u56de\u683c\u5f0f\u65e0\u6cd5\u89e3\u6790');

  const byId = new Map(json.translations.map((t) => [Number(t.id), String(t.text ?? '')]));
  const texts = blocks.map((_, i) => byId.has(i + 1) ? byId.get(i + 1) : null);

  if (book !== '__test__' && json.names && typeof json.names === 'object') {
    const merged = {...names, ...json.names};
    const keys = Object.keys(merged).slice(-80);
    glossary[book] = Object.fromEntries(keys.map((k) => [k, merged[k]]));
    await browser.storage.local.set({glossary});
  }
  return texts;
}

/// \u7ed9\u53d1\u9001\u7ed9\u6a21\u578b\u7684\u56fe\u7247\u6807\u4e0a\u7f16\u53f7\uff0c\u5e76\u538b\u5230 1600px \u4ee5\u5185\u4ee5\u8282\u7701\u8d39\u7528\u3002
async function annotateImage(dataUrl, blocks) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = dataUrl;
  });
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const size = Math.max(16, Math.round(canvas.height / 45));
  ctx.font = `bold ${size}px sans-serif`;
  blocks.forEach((b, i) => {
    const x = b.x * canvas.width, y = b.y * canvas.height;
    ctx.strokeStyle = 'rgba(255,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, b.width * canvas.width, b.height * canvas.height);
    ctx.fillStyle = 'red'; ctx.lineWidth = 4; ctx.strokeStyle = 'white';
    ctx.strokeText(String(i + 1), x - size * 0.6, y + size * 0.4);
    ctx.fillText(String(i + 1), x - size * 0.6, y + size * 0.4);
  });
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ---------- \u6574\u9875\u6d41\u7a0b ----------

async function translatePage({image, sig, book}) {
  const cfg = await settings();
  const key = await cacheKey(sig || image.slice(-200), cfg);
  const cached = await recall(key);
  if (cached) return cached;
  const ocr = await native({action: 'ocr', image});
  const blocks = ocr.blocks || [];
  if (!blocks.length) { const empty = {blocks: []}; await remember(key, empty); return empty; }

  let texts = null, notice = '';
  if (cfg.engine === 'ai' && cfg.baseUrl && cfg.apiKey && cfg.model) {
    try {
      const annotated = cfg.sendImage ? await annotateImage(image, blocks) : null;
      texts = await aiTranslate(blocks, cfg, book, annotated);
    } catch (error) {
      notice = `AI \u7ffb\u8bd1\u5931\u8d25\uff0c\u5df2\u6539\u7528\u7cfb\u7edf\u7ffb\u8bd1\uff1a${error.message || error}`;
    }
  } else if (cfg.engine === 'ai') {
    notice = 'AI \u63a5\u53e3\u672a\u914d\u7f6e\u5b8c\u6574\uff0c\u5df2\u6539\u7528\u7cfb\u7edf\u7ffb\u8bd1\u3002\u8bf7\u5728\u6269\u5c55\u8bbe\u7f6e\u4e2d\u586b\u5199\u3002';
  }
  // AI \u6f0f\u6389\u7684\u6761\u76ee\u3001\u6216 AI \u4e0d\u53ef\u7528\u65f6\uff0c\u7528\u7cfb\u7edf\u7ffb\u8bd1\u8865\u9f50\u3002
  const missing = texts ? blocks.map((b, i) => texts[i] === null ? i : -1).filter((i) => i >= 0) : blocks.map((_, i) => i);
  if (missing.length) {
    try {
      const filled = (await native({action: 'translate', texts: missing.map((i) => blocks[i].source)})).texts;
      texts = texts || blocks.map(() => '');
      missing.forEach((i, k) => { texts[i] = filled[k]; });
    } catch (error) {
      if (!texts) throw error;
    }
  }

  const result = {blocks: blocks.map((b, i) => ({...b, text: texts[i] || ''})).filter((b) => b.text.trim()), notice};
  const prev = history.get(book) || [];
  prev.push(...result.blocks.map((b) => ({source: b.source, text: b.text})));
  history.set(book, prev.slice(-24));
  if (!notice) await remember(key, result);
  return result;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'translatePage') return translatePage(message).catch((error) => ({error: String(error.message || error)}));
  if (message.type === 'captureTab') {
    return browser.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'}).then((image) => ({image}));
  }
  if (message.type === 'getSettings') return settings();
  if (message.type === 'ping') return Promise.resolve({pong: true});
  if (message.type === 'nativePing') {
    return browser.runtime.sendNativeMessage(NATIVE, {action: 'ping'})
      .then((r) => (r && r.pong ? {pong: true} : {error: '\u539f\u751f\u90e8\u5206\u8fd4\u56de\u5f02\u5e38\uff1a' + JSON.stringify(r)}))
      .catch((error) => ({error: String(error.message || error)}));
  }
  if (message.type === 'testAI') {
    const cfg = message.cfg;
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) return Promise.resolve({error: '\u8bf7\u586b\u5199\u63a5\u53e3\u5730\u5740\u3001API Key \u548c\u6a21\u578b\u540d\u79f0'});
    const source = '\u3046\u308b\u305b\u3047\uff01\u3066\u3081\u3047\u306b\u8a00\u308f\u308c\u308b\u7b4b\u5408\u3044\u306f\u306d\u3047\u3093\u3060\u3088\uff01';
    const started = Date.now();
    return aiTranslate([{source, vertical: true}], cfg, '__test__', null)
      .then((texts) => (texts[0] ? {source, text: texts[0], ms: Date.now() - started} : {error: '\u6a21\u578b\u6ca1\u6709\u8fd4\u56de\u8bd1\u6587'}))
      .catch((error) => ({error: String(error.message || error)}));
  }
  if (message.type === 'openOptions') return browser.runtime.openOptionsPage();
  return undefined;
});

// \u5de5\u5177\u680f\u6309\u94ae\uff1a\u5f00\u542f / \u5173\u95ed\u81ea\u52a8\u7ffb\u8bd1\u3002
async function refreshBadge() {
  const {enabled} = await settings();
  await browser.browserAction.setBadgeText({text: enabled ? '\u5f00' : ''});
  await browser.browserAction.setTitle({title: enabled ? '\u81ea\u52a8\u7ffb\u8bd1\uff1a\u5f00\uff08\u70b9\u51fb\u5173\u95ed\uff09' : '\u81ea\u52a8\u7ffb\u8bd1\uff1a\u5173\uff08\u70b9\u51fb\u5f00\u542f\uff09'});
}

browser.browserAction.onClicked.addListener(async () => {
  const {enabled} = await settings();
  await browser.storage.local.set({enabled: !enabled});
  await refreshBadge();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.enabled) refreshBadge();
});
refreshBadge();
