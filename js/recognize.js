// --- РАСПОЗНАВАНИЕ ФОТО: ИИ, веб-сервисы и на устройстве ---
// Общий модуль для «Чека по фото» (js/receipt.js) и «Каталога OldBook.kz» (js/obcatalog.js, обложки книг).
// Способы (выбор — в блоке и в Настройках → «Распознавание фото»; «Авто» идёт по порядку, пока не получится):
//   ИИ — понимает снимок целиком и сразу отдаёт название / сумму / позиции (2–6 с): Gemini, Claude, OpenAI. Нужен свой ключ.
//   Веб — Google Cloud Vision, OCR.space: возвращают текст, разбор делает приложение. Нужен свой ключ.
//   На устройстве — Tesseract.js («точно» и «быстро»): без ключей и без отправки фото, но медленнее (10–30 с на телефоне).
// Ключи хранятся ТОЛЬКО на этом устройстве (localStorage finance_ocr_keys): не в uiPrefs, не на Google Диске, не в архиве.

const OCR_KEYS_STORE = 'finance_ocr_keys';
const OCR_PREFS_STORE = 'finance_ocr_prefs';
const OCR_AI_TIMEOUT_MS = 40000;
const OCR_WEB_TIMEOUT_MS = 45000;

const OCR_ENGINES = [
    { id: 'gemini', group: 'ai', name: 'Gemini (Google)', key: true, model: 'gemini-2.5-flash', models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'],
      hint: 'ИИ. Удобнее всего для начала: есть бесплатный лимит, ключ — на aistudio.google.com (Get API key).', speed: '2–5 с', accuracy: 'очень высокая', keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'claude', group: 'ai', name: 'Claude (Anthropic)', key: true, model: 'claude-haiku-5-5', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
      hint: 'ИИ. Ключ — на console.anthropic.com. Оплата за запрос (копейки за чек).', speed: '2–5 с', accuracy: 'очень высокая', keyUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'openai', group: 'ai', name: 'OpenAI (ChatGPT)', key: true, model: 'gpt-5.4-nano', models: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-4o-mini'],
      hint: 'ИИ. Ключ — на platform.openai.com. Название модели можно поменять.', speed: '2–6 с', accuracy: 'высокая', keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'gvision', group: 'web', name: 'Google Cloud Vision', key: true,
      hint: 'Веб-распознавание текста. Нужен проект Google Cloud с включённым Vision API (первые 1000 запросов в месяц бесплатно).', speed: '1–3 с', accuracy: 'высокая (текст); суммы и позиции разбирает приложение', keyUrl: 'https://console.cloud.google.com/apis/library/vision.googleapis.com' },
    { id: 'ocrspace', group: 'web', name: 'OCR.space', key: true,
      hint: 'Веб-распознавание текста. Бесплатный ключ приходит на почту: ocr.space/ocrapi/freekey (фото сожмётся до 1 МБ само).', speed: '2–6 с', accuracy: 'средняя; суммы и позиции разбирает приложение', keyUrl: 'https://ocr.space/ocrapi/freekey' },
    { id: 'tess-best', group: 'local', name: 'На устройстве: точно', key: false,
      hint: 'Tesseract.js: фото никуда не уходит, ключ не нужен. Первый раз скачивается модуль (~5 МБ).', speed: '10–30 с', accuracy: 'средняя' },
    { id: 'tess-fast', group: 'local', name: 'На устройстве: быстро', key: false,
      hint: 'Tesseract.js в уменьшенном размере: в 2–3 раза быстрее, но чаще ошибается в мелком тексте (для обложек хорош).', speed: '5–15 с', accuracy: 'ниже средней' }
];
const OCR_GROUP_NAMES = { ai: 'ИИ', web: 'Веб', local: 'На устройстве' };

function ocrEngine(id) { return OCR_ENGINES.find(e => e.id === id) || null; }

// ---------- Ключи и выбор способа ----------
function ocrReadStore(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
function ocrKeys() { return ocrReadStore(OCR_KEYS_STORE); }
function ocrSaveKeys(keys) { try { localStorage.setItem(OCR_KEYS_STORE, JSON.stringify(keys)); } catch (e) {} }

// Ключ можно вписать и в js/config.js: ocrKeys: { gemini: '...' } (необязательно)
function ocrKeyOf(id) {
    const own = String(ocrKeys()[id] || '').trim();
    if (own) return own;
    const cfg = window.MONEY_CONFIG && window.MONEY_CONFIG.ocrKeys;
    return cfg && typeof cfg[id] === 'string' ? cfg[id].trim() : '';
}

function ocrPrefs() {
    const p = ocrReadStore(OCR_PREFS_STORE);
    const okId = v => v === 'auto' || !!ocrEngine(v);
    return { receipt: okId(p.receipt) ? p.receipt : 'auto', cover: okId(p.cover) ? p.cover : 'auto',
        models: (p.models && typeof p.models === 'object') ? p.models : {}, fallback: p.fallback !== false };
}
function ocrSavePrefs(p) { try { localStorage.setItem(OCR_PREFS_STORE, JSON.stringify(p)); } catch (e) {} }

function ocrModelOf(id) {
    const e = ocrEngine(id);
    return String((ocrPrefs().models || {})[id] || '').trim() || (e && e.model) || '';
}
function ocrAvailable(id) { const e = ocrEngine(id); return !!e && (!e.key || !!ocrKeyOf(id)); }

// «Авто»: ИИ с ключом → веб с ключом → на устройстве (для чека «точно», для обложки «быстро»)
function ocrAutoChain(kind) {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const order = [];
    if (online) ['gemini', 'claude', 'openai', 'gvision', 'ocrspace'].forEach(id => { if (ocrAvailable(id)) order.push(id); });
    order.push(kind === 'cover' ? 'tess-fast' : 'tess-best');
    return order;
}
function ocrChain(kind, chosen) {
    const prefs = ocrPrefs();
    const want = chosen || prefs[kind] || 'auto';
    if (want === 'auto') return ocrAutoChain(kind);
    const chain = [want];
    if (prefs.fallback) ocrAutoChain(kind).forEach(id => { if (!chain.includes(id)) chain.push(id); });
    return chain;
}

// ---------- Подготовка изображения ----------
function ocrLoadImage(file) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
        i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото')); };
        i.src = url;
    });
}
function ocrDrawScaled(img, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
}

// Адаптивная бинаризация (метод Брэдли): текст на мятом или неровно освещённом чеке → чёрный на белом
function ocrAdaptiveThreshold(gray, w, h, windowSize, percent) {
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) { row += gray[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row; }
    }
    const s = Math.max(3, windowSize | 0) >> 1, t = 1 - (percent || 15) / 100, out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const y1 = Math.max(0, y - s), y2 = Math.min(h - 1, y + s);
        for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s), x2 = Math.min(w - 1, x + s);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);
            const sum = integral[(y2 + 1) * (w + 1) + x2 + 1] - integral[y1 * (w + 1) + x2 + 1] - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
            out[y * w + x] = gray[y * w + x] * count < sum * t ? 0 : 255;
        }
    }
    return out;
}

// Растяжение контраста по перцентилям; если текста мало (почти белый чек) — контраст не трогаем
function ocrStretchContrast(gray, total) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < total; i++) hist[gray[i]]++;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.005) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    if (hi - lo < 64) { lo = 0; hi = 255; }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < total; i++) gray[i] = Math.max(0, Math.min(255, (gray[i] - lo) * 255 / span));
}

// Для распознавания на устройстве: серый, больше контраста, при необходимости чёрно-белый
async function prepareOcrCanvas(file, { maxSide = 1800, binarize = false } = {}) {
    const canvas = ocrDrawScaled(await ocrLoadImage(file), maxSide);
    const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h), px = data.data, gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) gray[p] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    ocrStretchContrast(gray, w * h);
    const fin = binarize ? ocrAdaptiveThreshold(gray, w, h, Math.round(w / 8), 15) : gray;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) { px[i] = px[i + 1] = px[i + 2] = fin[p]; px[i + 3] = 255; }
    ctx.putImageData(data, 0, 0);
    return canvas;
}

// Для ИИ и веб-сервисов: JPEG в base64; maxBytes — предел размера (у OCR.space бесплатно до 1 МБ)
async function ocrImageToBase64(file, { maxSide = 1600, quality = 0.85, maxBytes = 0 } = {}) {
    const img = await ocrLoadImage(file);
    let side = maxSide, q = quality, blob = null;
    for (let n = 0; n < 6; n++) {
        blob = await new Promise(res => ocrDrawScaled(img, side).toBlob(res, 'image/jpeg', q));
        if (!blob) throw new Error('Не удалось подготовить фото');
        if (!maxBytes || blob.size <= maxBytes) break;
        if (q > 0.55) q -= 0.15; else side = Math.round(side * 0.8);
    }
    const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('Не удалось прочитать фото'));
        r.readAsDataURL(blob);
    });
    return { base64, mime: 'image/jpeg', bytes: blob.size };
}

// ---------- Запросы к сервисам ----------
function ocrError(code, message) { const e = new Error(message); e.code = code; return e; }

async function ocrHttp(url, options, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
        res = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    } catch (e) {
        if (e && e.name === 'AbortError') throw ocrError('timeout', 'сервис слишком долго отвечает');
        throw ocrError('net', navigator.onLine === false ? 'нет интернета' : 'сервис недоступен (нет связи или запрос заблокирован)');
    } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) {
        let detail = '';
        try { const j = await res.clone().json(); detail = (j.error && (j.error.message || j.error)) || j.message || ''; } catch (e) {}
        detail = String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 160);
        if (res.status === 401 || res.status === 403) throw ocrError('auth', 'ключ не принят' + (detail ? ' (' + detail + ')' : ''));
        if (res.status === 429) throw ocrError('quota', 'лимит запросов исчерпан, подождите или смените способ');
        if (res.status === 404) throw ocrError('model', 'модель не найдена — проверьте название в настройках' + (detail ? ' (' + detail + ')' : ''));
        if (res.status === 400 && /api[_ ]?key/i.test(detail)) throw ocrError('auth', 'ключ не принят (' + detail + ')');
        throw ocrError('http', 'ошибка сервиса ' + res.status + (detail ? ': ' + detail : ''));
    }
    return res;
}

const OCR_RECEIPT_PROMPT =
    'Это фото кассового чека (Казахстан, тенге ₸; язык русский или казахский, названия бывают и латиницей). Прочитай чек и верни ТОЛЬКО JSON, без пояснений и markdown:\n' +
    '{"store": "название магазина или пустая строка", "date": "YYYY-MM-DDTHH:MM или пустая строка", "total": число — итог к оплате, ' +
    '"items": [{"name": "название товара как на чеке", "price": число — сумма по строке за всё количество, "unit_text": "количество или вес, например 1,250 кг или 2 шт, либо пустая строка"}], ' +
    '"raw_text": "весь прочитанный текст чека построчно"}\n' +
    'Правила: числа с точкой как десятичным разделителем, без пробелов и валюты; ничего не выдумывай — чего не видно, оставь пустым или 0; ' +
    'скидки и служебные строки (НДС, сдача, наличные, карта, ФП, ФД) в items не включай; total — именно сумма к оплате (ИТОГО), а не наличные и не сдача. Если на фото не чек — верни пустые поля.';
const OCR_COVER_PROMPT =
    'Это фото обложки или корешка книги. Верни ТОЛЬКО JSON, без пояснений и markdown:\n' +
    '{"title": "название книги", "author": "автор или авторы как на обложке", "text": "весь видимый текст построчно"}\n' +
    'Язык — как на обложке, ничего не переводи и не выдумывай; чего не видно — пустая строка. Если на фото нет книги — пустые поля.';

function ocrParseJson(text) {
    const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw ocrError('bad', 'ИИ вернул ответ не в том виде');
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw ocrError('bad', 'ИИ вернул ответ не в том виде'); }
}
function ocrNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const n = parseFloat(String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
}
function ocrLetters(s) { return (String(s || '').match(/[a-zа-яёәіңғүұқөһ]/gi) || []).length; }

// JSON чека от ИИ → тот же вид, что даёт parseReceiptText: { total, store, date, items:[{name, price, raw}], text }
function ocrNormalizeReceipt(obj, nowMs) {
    const o = obj && typeof obj === 'object' ? obj : {};
    let total = ocrNum(o.total);
    if (!(total > 0 && total < 100000000)) total = 0;
    const items = [];
    (Array.isArray(o.items) ? o.items : []).forEach(it => {
        if (!it) return;
        const name = String(it.name || '').replace(/\s+/g, ' ').trim(), price = ocrNum(it.price);
        if (ocrLetters(name) < 2 || !(price > 0) || price >= 10000000 || (total && price > total + 0.01)) return;
        const unit = String(it.unit_text || it.unit || '').replace(/\s+/g, ' ').trim();
        items.push({ name: name.slice(0, 40), price: Math.round(price * 100) / 100, raw: (name + (unit ? ' ' + unit : '')).slice(0, 80) });
    });
    if (!total && items.length) total = items.reduce((s, it) => s + it.price, 0);
    let date = '';
    const dm = String(o.date || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (dm) {
        const now = nowMs || Date.now(), t = Date.parse(`${dm[1]}-${dm[2]}-${dm[3]}`);
        if (!isNaN(t) && +dm[2] >= 1 && +dm[2] <= 12 && +dm[3] >= 1 && +dm[3] <= 31 && +dm[1] >= 2000 && t <= now + 2 * 86400000 && t >= now - 3650 * 86400000)
            date = `${dm[1]}-${dm[2]}-${dm[3]}T${dm[4] && +dm[4] < 24 && +dm[5] < 60 ? dm[4] + ':' + dm[5] : '12:00'}`;
    }
    const store = String(o.store || '').replace(/["«»“”]/g, '').replace(/^(тоо|too|ип|ao|ао|ооо|ooo)\s+/i, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return { total: Math.round(total * 100) / 100, store, date, items, text: String(o.raw_text || o.text || '').trim() || items.map(it => it.raw + ' ' + it.price).join('\n') };
}
function ocrNormalizeCover(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    const clean = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const title = clean(o.title, 120), author = clean(o.author, 80);
    return { title, author, text: String(o.text || '').trim() || [author, title].filter(Boolean).join('\n') };
}
// Текст обложки от обычного распознавания: строки с буквами, без мусора
function ocrCoverFromText(raw) {
    const lines = String(raw || '').split('\n').map(l => l.replace(/[^A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ0-9 .,:«»"'-]/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(l => (l.match(/[A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]/g) || []).length >= 3);
    return { title: '', author: '', text: lines.slice(0, 6).join('\n'), lines: lines.slice(0, 4) };
}

// ИИ: возвращают текст ответа модели
async function ocrAskGemini(img, prompt) {
    const model = ocrModelOf('gemini'), gen = { responseMimeType: 'application/json', temperature: 0 };
    if (/2\.5/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 }; // без «раздумий» — быстрее
    const res = await ocrHttp(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ocrKeyOf('gemini'))}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.base64 } }] }], generationConfig: gen })
    }, OCR_AI_TIMEOUT_MS);
    const j = await res.json();
    const text = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
    if (!text) throw ocrError('bad', 'Gemini не вернул текст' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : ''));
    return text;
}
async function ocrAskClaude(img, prompt) {
    const res = await ocrHttp('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ocrKeyOf('claude'), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: ocrModelOf('claude'), max_tokens: 1800, messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } }, { type: 'text', text: prompt }] }] })
    }, OCR_AI_TIMEOUT_MS);
    const text = ((await res.json()).content || []).map(c => c.text || '').join('');
    if (!text) throw ocrError('bad', 'Claude не вернул текст');
    return text;
}
async function ocrAskOpenAI(img, prompt) {
    const res = await ocrHttp('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ocrKeyOf('openai') },
        body: JSON.stringify({ model: ocrModelOf('openai'), response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [
            { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } }] }] })
    }, OCR_AI_TIMEOUT_MS);
    const text = ((((await res.json()).choices || [])[0] || {}).message || {}).content || '';
    if (!text) throw ocrError('bad', 'OpenAI не вернул текст');
    return text;
}

// Веб-распознавание: возвращают просто текст
async function ocrWebGoogleVision(img) {
    const res = await ocrHttp(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(ocrKeyOf('gvision'))}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: img.base64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['ru', 'kk', 'en'] } }] })
    }, OCR_WEB_TIMEOUT_MS);
    const r = ((await res.json()).responses || [])[0] || {};
    if (r.error) throw ocrError('http', 'Vision: ' + String(r.error.message || '').slice(0, 140));
    return (r.fullTextAnnotation && r.fullTextAnnotation.text) || '';
}
async function ocrWebOcrSpace(img) {
    const form = new FormData();
    form.append('apikey', ocrKeyOf('ocrspace'));
    form.append('language', 'rus');
    form.append('OCREngine', '2');
    form.append('scale', 'true');
    form.append('isTable', 'true');
    form.append('base64Image', `data:${img.mime};base64,${img.base64}`);
    const j = await (await ocrHttp('https://api.ocr.space/parse/image', { method: 'POST', body: form }, OCR_WEB_TIMEOUT_MS)).json();
    if (j.IsErroredOnProcessing) {
        const msg = Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join(' ') : String(j.ErrorMessage || 'ошибка');
        throw ocrError(/key/i.test(msg) ? 'auth' : 'http', 'OCR.space: ' + msg.slice(0, 140));
    }
    return ((j.ParsedResults || [])[0] || {}).ParsedText || '';
}

// На устройстве: Tesseract.js (модуль и worker — в js/receipt.js)
async function ocrLocal(id, kind, file, onProgress) {
    if (typeof getReceiptWorker !== 'function') throw ocrError('bad', 'модуль распознавания на устройстве не загружен');
    const best = id === 'tess-best', progress = (t, p) => { if (onProgress) onProgress(t, p); };
    progress('Подготавливаем фото…', 0.05);
    const canvas = await prepareOcrCanvas(file, { maxSide: best ? 2000 : 1300, binarize: best && kind === 'receipt' });
    progress('Загружаем модуль распознавания (только в первый раз, ~5 МБ)…', 0.1);
    const worker = await getReceiptWorker((status, p) => {
        if (status === 'recognizing text') progress(`Читаем… ${Math.round(p * 100)}%`, 0.2 + p * 0.8);
        else if (/load/i.test(status)) progress('Загружаем словарь русского языка…', 0.1 + p * 0.1);
    });
    try { await worker.setParameters({ tessedit_pageseg_mode: kind === 'receipt' ? '6' : (best ? '3' : '11') }); } catch (e) {}
    progress('Читаем…', 0.2);
    return (await worker.recognize(canvas)).data.text || '';
}

// Один способ → единый результат
async function ocrRunEngine(id, kind, file, onProgress) {
    const e = ocrEngine(id);
    if (!e) throw ocrError('bad', 'неизвестный способ');
    if (e.key && !ocrKeyOf(id)) throw ocrError('nokey', 'не вписан ключ (Настройки → Распознавание фото)');
    const progress = (t, p) => { if (onProgress) onProgress(t, p); };
    if (e.group === 'local') {
        const text = await ocrLocal(id, kind, file, onProgress);
        return kind === 'receipt' ? parseReceiptText(text) : ocrCoverFromText(text);
    }
    progress(`Готовим фото для «${e.name}»…`, 0.1);
    const img = await ocrImageToBase64(file, id === 'ocrspace' ? { maxSide: 1700, quality: 0.8, maxBytes: 950 * 1024 } : { maxSide: 1600, quality: 0.85 });
    progress(`Ждём ответ: ${e.name}…`, 0.35);
    if (e.group === 'ai') {
        const answer = await ({ gemini: ocrAskGemini, claude: ocrAskClaude, openai: ocrAskOpenAI }[id])(img, kind === 'receipt' ? OCR_RECEIPT_PROMPT : OCR_COVER_PROMPT);
        const obj = ocrParseJson(answer);
        return kind === 'receipt' ? ocrNormalizeReceipt(obj) : ocrNormalizeCover(obj);
    }
    const text = await (id === 'gvision' ? ocrWebGoogleVision(img) : ocrWebOcrSpace(img));
    return kind === 'receipt' ? parseReceiptText(text) : ocrCoverFromText(text);
}

// Главная функция. kind: 'receipt' | 'cover'. Результат + { engine, engineName, ms, tried: [отказы] }
async function ocrRecognize(kind, file, { engine, onProgress } = {}) {
    const chain = ocrChain(kind, engine), tried = [], started = Date.now();
    for (const id of chain) {
        const e = ocrEngine(id);
        try {
            const t0 = Date.now();
            const result = await ocrRunEngine(id, kind, file, onProgress);
            return { ...result, kind, engine: id, engineName: e.name, ms: Date.now() - t0, totalMs: Date.now() - started, tried };
        } catch (err) {
            console.warn('Распознавание:', id, err);
            tried.push(`${e.name}: ${err && err.message ? err.message : err}`);
            if (typeof adminLog === 'function') adminLog('scan_fail', { kind, engine: id, code: (err && err.code) || '' });
        }
    }
    const err = new Error(tried.join('; ') || 'ни один способ не сработал');
    err.tried = tried;
    throw err;
}

// Загрузить модуль «на устройстве» заранее, пока человек снимает фото
function ocrWarmUp(kind) {
    try {
        const e = ocrEngine(ocrChain(kind)[0]);
        if (e && e.group === 'local' && typeof getReceiptWorker === 'function' && navigator.onLine !== false) getReceiptWorker().catch(() => {});
    } catch (e) {}
}

// ---------- Выбор способа: рядом с кнопками камеры и в Настройках ----------
function ocrOptionsHtml(kind, selected) {
    const cur = selected || ocrPrefs()[kind];
    const groups = ['ai', 'web', 'local'].map(g => `<optgroup label="${OCR_GROUP_NAMES[g]}">${OCR_ENGINES.filter(e => e.group === g).map(e =>
        `<option value="${e.id}" ${cur === e.id ? 'selected' : ''}>${escapeHtml(e.name)}${e.key && !ocrKeyOf(e.id) ? ' — нужен ключ' : ''}</option>`).join('')}</optgroup>`).join('');
    return `<option value="auto" ${cur === 'auto' ? 'selected' : ''}>Авто (лучший)</option>${groups}`;
}
function renderOcrSelects() {
    document.querySelectorAll('select[data-ocr-kind]').forEach(sel => { sel.innerHTML = ocrOptionsHtml(sel.dataset.ocrKind); });
}
function onOcrSelectChange(sel) {
    const prefs = ocrPrefs();
    prefs[sel.dataset.ocrKind] = sel.value;
    ocrSavePrefs(prefs);
    renderOcrSelects();
    renderOcrSettings(true);
    ocrWarmUp(sel.dataset.ocrKind);
}

function ocrBadge(e) {
    const ready = ocrAvailable(e.id);
    return `<span class="ocr-badge is-${e.group}">${OCR_GROUP_NAMES[e.group]}</span>` +
        (e.key ? `<span class="ocr-badge ${ready ? 'is-ready' : 'is-nokey'}">${ready ? 'ключ есть' : 'нужен ключ'}</span>` : '<span class="ocr-badge is-ready">без ключа</span>');
}

function renderOcrSettings(force) {
    const box = document.getElementById('ocr-settings');
    if (!box) return;
    if (!force && box.contains(document.activeElement) && document.activeElement.matches('input')) return; // не мешаем вводу ключа
    const prefs = ocrPrefs();
    const row = e => `
        <div class="ocr-engine">
            <div class="ocr-engine-head"><b data-i18n-skip>${escapeHtml(e.name)}</b> ${ocrBadge(e)}</div>
            <p class="hint">${escapeHtml(e.hint)}<br>Скорость: ${escapeHtml(e.speed)} · точность: ${escapeHtml(e.accuracy)}</p>
            ${e.key ? `<div class="ocr-key-row">
                <input type="password" autocomplete="off" spellcheck="false" placeholder="Ключ (API key)" value="${escapeHtml(ocrKeys()[e.id] || '')}" onchange="ocrSetKey('${e.id}', this.value)">
                <a class="btn-secondary ocr-link" href="${escapeHtml(e.keyUrl)}" target="_blank" rel="noopener" title="Где взять ключ"><span class="material-icons">open_in_new</span></a></div>` : ''}
            ${e.group === 'ai' ? `<div class="ocr-key-row"><input type="text" list="ocr-models-${e.id}" autocomplete="off" spellcheck="false" placeholder="Модель: ${escapeHtml(e.model)}" data-i18n-skip value="${escapeHtml((prefs.models || {})[e.id] || '')}" onchange="ocrSetModel('${e.id}', this.value)">
                <datalist id="ocr-models-${e.id}">${(e.models || []).map(m => `<option value="${escapeHtml(m)}">`).join('')}</datalist></div>` : ''}
        </div>`;
    box.innerHTML = `
        <p class="hint ocr-privacy"><span class="material-icons">lock</span> <span><b>Куда уходит фото.</b> «ИИ» и «Веб» отправляют снимок на сервер выбранной компании (Google, Anthropic, OpenAI, OCR.space). «На устройстве» — фото остаётся в телефоне. Ключи хранятся только на этом устройстве: не попадают ни на Google Диск, ни в синхронизацию, ни в архив сайта.</span></p>
        <label class="field-inline"><span>Для чеков</span><select data-ocr-kind="receipt" onchange="onOcrSelectChange(this)">${ocrOptionsHtml('receipt')}</select></label>
        <label class="field-inline"><span>Для обложек книг</span><select data-ocr-kind="cover" onchange="onOcrSelectChange(this)">${ocrOptionsHtml('cover')}</select></label>
        <label class="hdr-part"><input type="checkbox" ${prefs.fallback ? 'checked' : ''} onchange="ocrSetFallback(this.checked)"> Если выбранный способ не сработал — пробовать следующий</label>
        <p class="hint">«Авто»: сначала ИИ (если вписан ключ), потом веб, потом на устройстве. Без ключей всё работает на устройстве, как раньше.</p>
        <h4 class="font-sub">ИИ</h4>${OCR_ENGINES.filter(e => e.group === 'ai').map(row).join('')}
        <h4 class="font-sub">Веб-распознавание текста</h4>${OCR_ENGINES.filter(e => e.group === 'web').map(row).join('')}
        <h4 class="font-sub">На устройстве</h4>${OCR_ENGINES.filter(e => e.group === 'local').map(row).join('')}
        <button type="button" class="btn-secondary btn-block" id="ocr-bench-btn" onclick="ocrBenchmark()"><span class="material-icons">speed</span> Проверить скорость и точность</button>
        <p class="hint">Прогоняет через каждый доступный способ одну учебную картинку-чек (верный итог 1 250) и показывает время. На настоящих чеках результаты могут отличаться.</p>
        <div class="ocr-bench" id="ocr-bench" aria-live="polite"></div>`;
}
function ocrSetKey(id, value) {
    const keys = ocrKeys(), v = String(value || '').replace(/\s+/g, '');
    if (v) keys[id] = v; else delete keys[id];
    ocrSaveKeys(keys);
    renderOcrSelects();
    renderOcrSettings(true);
}
function ocrSetModel(id, value) {
    const prefs = ocrPrefs(), v = String(value || '').trim().slice(0, 60);
    if (v) prefs.models[id] = v; else delete prefs.models[id];
    ocrSavePrefs(prefs);
}
function ocrSetFallback(on) { const p = ocrPrefs(); p.fallback = !!on; ocrSavePrefs(p); }

// Учебный чек на холсте: итог 1 250,00
function ocrBenchFile() {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 640);
    g.fillStyle = '#111'; g.font = 'bold 30px monospace';
    let y = 50;
    [['ТОО "МАГНУМ"', ''], ['Чек № 4821  18.10.2026 14:32', ''], ['--------------------------', ''], ['Молоко 3,2% 1л', '650,00'], ['Хлеб белый', '250,00'],
        ['Сыр Российский 0,300 кг', '350,00'], ['--------------------------', ''], ['ИТОГО', '1 250,00'], ['Наличные', '1 500,00'], ['Сдача', '250,00']].forEach(([l, r]) => {
        g.textAlign = 'left'; g.fillText(l, 20, y);
        if (r) { g.textAlign = 'right'; g.fillText(r, 620, y); }
        y += 54;
    });
    return new Promise(res => c.toBlob(b => res(new File([b], 'bench.png', { type: 'image/png' })), 'image/png'));
}
async function ocrBenchmark() {
    const out = document.getElementById('ocr-bench'), btn = document.getElementById('ocr-bench-btn');
    if (!out) return;
    if (btn) btn.disabled = true;
    out.innerHTML = '<p class="hint">Проверяем… (первый запуск «на устройстве» скачивает модуль)</p>';
    const file = await ocrBenchFile(), rows = [];
    for (const e of OCR_ENGINES.filter(x => ocrAvailable(x.id))) {
        const t0 = Date.now();
        let status, ok = false;
        try {
            const r = await ocrRunEngine(e.id, 'receipt', file);
            ok = Math.abs((r.total || 0) - 1250) < 0.01;
            status = `итог ${r.total ? String(r.total).replace('.', ',') : 'не найден'}, позиций ${r.items.length}`;
        } catch (err) { status = err && err.message ? err.message : String(err); }
        rows.push(`<tr><td data-i18n-skip>${escapeHtml(e.name)}</td><td>${((Date.now() - t0) / 1000).toFixed(1)} с</td><td class="${ok ? 'is-good' : 'is-bad'}">${ok ? '✓ ' : '✗ '}${escapeHtml(status)}</td></tr>`);
        out.innerHTML = `<table class="ocr-bench-table"><thead><tr><th>Способ</th><th>Время</th><th>Результат</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }
    if (btn) btn.disabled = false;
}

window.addEventListener('DOMContentLoaded', () => { renderOcrSettings(true); renderOcrSelects(); });
