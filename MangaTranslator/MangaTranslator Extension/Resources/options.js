const $ = (id) => document.getElementById(id);
const FIELDS = ['baseUrl', 'apiKey', 'model', 'priceIn', 'priceOut'];

function radio(name, value) {
  if (value === undefined) return document.querySelector(`input[name=${name}]:checked`)?.value;
  const el = document.querySelector(`input[name=${name}][value="${value}"]`);
  if (el) el.checked = true;
}

function collect() {
  return {
    engine: radio('engine') || 'apple',
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    priceIn: $('priceIn').value.trim(),
    priceOut: $('priceOut').value.trim(),
    sendImage: $('sendImage').checked,
    style: radio('style') || 'auto',
    fontScale: Number($('fontScale').value) || 1,
  };
}

function syncVisibility() {
  $('ai').hidden = radio('engine') !== 'ai';
  $('fontScaleValue').textContent = `${Math.round(Number($('fontScale').value) * 100)}%`;
}

async function load() {
  const cfg = await browser.runtime.sendMessage({type: 'getSettings'});
  radio('engine', cfg.engine);
  radio('style', cfg.style);
  for (const f of FIELDS) $(f).value = cfg[f] || '';
  $('sendImage').checked = Boolean(cfg.sendImage);
  $('fontScale').value = cfg.fontScale || 1;
  // \u8ba9\u670d\u52a1\u5546\u4e0b\u62c9\u6846\u663e\u793a\u4e0e\u5f53\u524d\u5730\u5740\u5339\u914d\u7684\u90a3\u4e00\u9879\u3002
  const match = [...$('preset').options].find((o) => o.value.split('|')[0] === cfg.baseUrl);
  $('preset').value = match ? match.value : '';
  syncVisibility();
  refreshPrice();
  refreshUsage();
}

// ---------- \u5355\u4ef7\u4e0e\u7528\u91cf ----------

const fmtTok = (n) => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(2)}M`;
const fmtCost = (c) => c === 0 ? '\u00a50' : c < 0.01 ? `\u00a5${c.toFixed(4)}` : c < 1 ? `\u00a5${c.toFixed(3)}` : `\u00a5${c.toFixed(2)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

let priceTimer = 0;
async function refreshPrice() {
  const cfg = collect();
  const custom = cfg.priceIn !== '' || cfg.priceOut !== '';
  const price = await browser.runtime.sendMessage({type: 'priceOf', cfg: {...cfg, priceIn: '', priceOut: ''}});
  $('priceIn').placeholder = price ? `\u8f93\u5165 ${price.in}` : '\u8f93\u5165\u5355\u4ef7';
  $('priceOut').placeholder = price ? `\u8f93\u51fa ${price.out}` : '\u8f93\u51fa\u5355\u4ef7';
  $('priceHint').textContent = custom
    ? '\u4f7f\u7528\u81ea\u5b9a\u4e49\u5355\u4ef7\u3002\u6e05\u7a7a\u4e24\u4e2a\u6846\u5373\u53ef\u6062\u590d\u5185\u7f6e\u4ef7\u76ee\u3002'
    : price
      ? `\u7559\u7a7a\u5219\u6309\u5185\u7f6e\u53c2\u8003\u4ef7\uff1a${price.name}\uff0c\u8f93\u5165 ${price.in} / \u8f93\u51fa ${price.out} \u5143\u6bcf\u767e\u4e07 tokens\u3002\u4ef7\u683c\u53ef\u80fd\u53d8\u52a8\uff0c\u4ee5\u5b98\u7f51\u4e3a\u51c6\u3002`
      : '\u5185\u7f6e\u4ef7\u76ee\u8868\u91cc\u6ca1\u6709\u8fd9\u4e2a\u6a21\u578b\u3002\u586b\u4e0a\u5355\u4ef7\u540e\u624d\u80fd\u4f30\u7b97\u8d39\u7528\uff0c\u5426\u5219\u53ea\u7edf\u8ba1 token \u6570\u3002';
}

function row(name, s) {
  const cost = s.unpriced && !s.cost ? '\u2014' : fmtCost(s.cost) + (s.unpriced ? '+' : '');
  return `<tr><td>${esc(name)}</td><td>${s.pages}</td><td>${fmtTok(s.in)}</td><td>${fmtTok(s.out)}</td><td>${cost}</td></tr>`;
}

async function refreshUsage() {
  const {stats} = await browser.runtime.sendMessage({type: 'getUsage'});
  const box = $('usage');
  if (!stats || !stats.total.pages) { box.textContent = '\u6682\u65e0\u8bb0\u5f55\u3002\u5f00\u542f AI \u7ffb\u8bd1\u8bfb\u51e0\u9875\u6f2b\u753b\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a token \u7528\u91cf\u548c\u9884\u4f30\u8d39\u7528\u3002'; return; }
  const t = stats.total;
  const since = new Date(stats.since).toLocaleDateString('zh-CN');
  const perPage = t.pages ? t.cost / t.pages : 0;
  const books = Object.entries(stats.books).sort((a, b) => b[1].t - a[1].t);
  box.innerHTML = `<div><span class="big">${t.unpriced && !t.cost ? '\u2014' : fmtCost(t.cost)}</span>\u3000\u81ea ${since} \u8d77\u5171\u7ffb\u8bd1 ${t.pages} \u9875\uff0c`
    + `\u8f93\u5165 ${fmtTok(t.in)} + \u8f93\u51fa ${fmtTok(t.out)} tokens`
    + (t.cost ? `\uff0c\u5e73\u5747\u6bcf\u9875 ${fmtCost(perPage)}\uff0c200 \u9875\u4e00\u672c\u7ea6 ${fmtCost(perPage * 200)}` : '') + '\u3002</div>'
    + `<table><tr><th>\u4e66</th><th>\u9875\u6570</th><th>\u8f93\u5165</th><th>\u8f93\u51fa</th><th>\u8d39\u7528</th></tr>`
    + books.map(([id, s]) => row(s.title || id, s)).join('') + '</table>';
}

$('resetUsage').addEventListener('click', async () => {
  if (!confirm('\u6e05\u96f6\u6240\u6709\u7528\u91cf\u7edf\u8ba1\uff1f')) return;
  await browser.runtime.sendMessage({type: 'resetUsage'});
  refreshUsage();
});

browser.storage.onChanged.addListener((changes) => { if (changes.usageStats) refreshUsage(); });
for (const id of ['model', 'priceIn', 'priceOut']) {
  $(id).addEventListener('input', () => { clearTimeout(priceTimer); priceTimer = setTimeout(refreshPrice, 200); });
}

$('preset').addEventListener('change', () => {
  const [url, model] = $('preset').value.split('|');
  if (url) $('baseUrl').value = url;
  if (model) $('model').value = model;
  refreshPrice();
});

document.addEventListener('change', syncVisibility);
document.addEventListener('input', syncVisibility);

$('save').addEventListener('click', async () => {
  await browser.storage.local.set(collect());
  $('saved').style.opacity = 1;
  setTimeout(() => { $('saved').style.opacity = 0; }, 1500);
});

$('test').addEventListener('click', async () => {
  const out = $('result');
  out.className = '';
  out.textContent = '\u6b63\u5728\u8bf7\u6c42\u2026';
  const withTimeout = (promise, ms, what) => Promise.race([
    promise, new Promise((_, reject) => setTimeout(() => reject(new Error(what)), ms))]);
  let reply;
  try {
    out.textContent = '\u2460 \u68c0\u67e5\u540e\u53f0\u811a\u672c\u2026';
    await withTimeout(browser.runtime.sendMessage({type: 'ping'}), 5000,
      '\u540e\u53f0\u811a\u672c\u6ca1\u6709\u54cd\u5e94\u3002\u8bf7\u5230 Safari \u8bbe\u7f6e \u2192 \u6269\u5c55\uff0c\u628a\u201c\u6f2b\u753b\u65e5\u8bd1\u4e2d\u201d\u5173\u6389\u518d\u6253\u5f00\uff0c\u7136\u540e\u5237\u65b0\u672c\u9875\u3002');
    out.textContent = '\u2461 \u68c0\u67e5\u539f\u751f\u7ec4\u4ef6\u2026';
    const nativeReply = await withTimeout(browser.runtime.sendMessage({type: 'nativePing'}), 15000,
      '\u539f\u751f\u7ec4\u4ef6\u6ca1\u6709\u54cd\u5e94\u3002\u8bf7\u786e\u8ba4 MangaTranslator \u5e94\u7528\u5df2\u7528 Xcode \u8fd0\u884c\u8fc7\u4e00\u6b21\uff0c\u518d\u628a\u6269\u5c55\u5173\u6389\u91cd\u5f00\u3002');
    if (nativeReply?.error) throw new Error(`\u539f\u751f\u7ec4\u4ef6\u51fa\u9519\uff1a${nativeReply.error}`);
    out.textContent = '\u2462 \u6b63\u5728\u8bf7\u6c42 AI \u63a5\u53e3\u2026\uff08\u6700\u957f\u7ea6 2 \u5206\u949f\uff09';
    reply = await withTimeout(browser.runtime.sendMessage({type: 'testAI', cfg: collect()}), 150000,
      'AI \u63a5\u53e3\u8d85\u8fc7 2 \u5206\u949f\u6ca1\u6709\u8fd4\u56de\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u63a5\u53e3\u5730\u5740\u548c\u6a21\u578b\u540d\u79f0\u3002');
  } catch (error) {
    reply = {error: error.message || String(error)};
  }
  if (reply.error) {
    out.className = 'err';
    out.textContent = `\u5931\u8d25\uff1a${reply.error}`;
  } else {
    out.className = 'ok';
    const u = reply.usage;
    const cost = u && u.cost !== null && u.cost !== undefined ? `\uff0c\u7ea6 ${fmtCost(u.cost)}` : '';
    const tokens = u ? `\n\u672c\u6b21\u7528\u91cf\uff1a${u.estimated ? '\u7ea6 ' : ''}\u8f93\u5165 ${u.in} + \u8f93\u51fa ${u.out} tokens${cost}${u.estimated ? '\uff08\u63a5\u53e3\u6ca1\u6709\u8fd4\u56de\u7528\u91cf\uff0c\u6309\u5b57\u6570\u4f30\u7b97\uff09' : ''}` : '';
    out.textContent = `\u6210\u529f\uff08${reply.ms} ms\uff09\n\u300c${reply.source}\u300d\u2192\u300c${reply.text}\u300d${tokens}\n\u8bb0\u5f97\u70b9\u201c\u4fdd\u5b58\u201d\u3002`;
  }
});

load();
