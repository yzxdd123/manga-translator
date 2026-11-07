const $ = (id) => document.getElementById(id);
const FIELDS = ['baseUrl', 'apiKey', 'model'];

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
}

$('preset').addEventListener('change', () => {
  const [url, model] = $('preset').value.split('|');
  if (url) $('baseUrl').value = url;
  if (model) $('model').value = model;
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
    out.textContent = `\u6210\u529f\uff08${reply.ms} ms\uff09\n\u300c${reply.source}\u300d\u2192\u300c${reply.text}\u300d\n\u8bb0\u5f97\u70b9\u201c\u4fdd\u5b58\u201d\u3002`;
  }
});

load();
