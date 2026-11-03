// --- ГОЛОСОВЫЕ ПОМОЩНИКИ: ИИ, облачное распознавание, браузер и на устройстве ---
// Общий модуль для «Голосового ввода» (js/voice.js). Устроен так же, как js/recognize.js (распознавание фото):
//   ИИ — слышит запись целиком и сразу отдаёт и текст, и сумму, категорию, тип (1–3 с): Gemini. Нужен свой ключ.
//   Веб — облачное распознавание речи, возвращает только текст, остальное разбирает приложение:
//         Groq (Whisper — самое быстрое), OpenAI, Google Cloud Speech-to-Text. Нужен свой ключ.
//   Браузер — встроенное распознавание Chrome / Edge / Safari (Web Speech API): без ключа, текст появляется по ходу речи.
//         В Chrome звук при этом распознают серверы Google; в Firefox и во многих «обёртках» сайта в приложение его нет.
//   На устройстве — Whisper (transformers.js): без ключей и без отправки звука, работает и без интернета после первой
//         загрузки модели (40–80 МБ). Медленнее и менее точен, чем облачные.
// Звук для ИИ, веб-сервисов и Whisper записывается через микрофон (MediaRecorder) и переводится в WAV 16 кГц — так он
// одинаково принимается всеми сервисами и на всех телефонах. «Авто»: ИИ с ключом → веб с ключом → браузер → Whisper.
// Ключи Gemini и OpenAI — те же, что у распознавания фото (localStorage finance_ocr_keys): вписывать дважды не нужно.
// Выбор помощника, язык и прочее — localStorage finance_voice_prefs (на устройстве, в синхронизацию не идёт).

const VOICE_PREFS_STORE = 'finance_voice_prefs';
const VOICE_KEYS_STORE = 'finance_ocr_keys';
const VOICE_AI_TIMEOUT_MS = 40000;
const VOICE_WEB_TIMEOUT_MS = 30000;
const VOICE_MAX_SECONDS = 45;
const VOICE_MIN_MS = 450;

// Языки речи: bcp — для распознавания в браузере и Google, iso — для Whisper-сервисов, whisper — для Whisper на устройстве
const VOICE_LANGS = [
    { id: 'ru', name: 'Русский', bcp: 'ru-RU', iso: 'ru', whisper: 'russian', sample: 'Потратил пять тысяч двести тенге на продукты' },
    { id: 'kk', name: 'Қазақша', bcp: 'kk-KZ', iso: 'kk', whisper: 'kazakh', sample: 'Азық-түлікке бес мың екі жүз теңге жұмсадым' },
    { id: 'en', name: 'English', bcp: 'en-US', iso: 'en', whisper: 'english', sample: 'Spent five thousand two hundred on groceries' },
    { id: 'fr', name: 'Français', bcp: 'fr-FR', iso: 'fr', whisper: 'french', sample: 'J’ai dépensé cinq mille deux cents en courses' },
    { id: 'de', name: 'Deutsch', bcp: 'de-DE', iso: 'de', whisper: 'german', sample: 'Ich habe fünftausendzweihundert für Lebensmittel ausgegeben' }
];

const VOICE_ENGINES = [
    { id: 'gemini', group: 'ai', name: 'Gemini (Google)', key: true, shared: true, model: 'gemini-2.5-flash', models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'],
      hint: 'ИИ слышит запись и сразу отдаёт текст, сумму, категорию, тип и день. Ключ тот же, что для распознавания фото (aistudio.google.com → Get API key; есть бесплатный лимит).',
      speed: '1–3 с', accuracy: 'очень высокая', keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'groq', group: 'web', name: 'Groq (Whisper)', key: true, model: 'whisper-large-v3-turbo', models: ['whisper-large-v3-turbo', 'whisper-large-v3'],
      hint: 'Самое быстрое облачное распознавание: модель Whisper на серверах Groq. Бесплатный лимит, ключ — в console.groq.com → API Keys.',
      speed: '0,5–1,5 с', accuracy: 'высокая; сумму и категорию разбирает приложение', keyUrl: 'https://console.groq.com/keys' },
    { id: 'openai', group: 'web', name: 'OpenAI (распознавание речи)', key: true, shared: true, model: 'gpt-4o-mini-transcribe', models: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'],
      hint: 'Облачное распознавание речи OpenAI. Ключ тот же, что для распознавания фото (platform.openai.com). Оплата за минуту записи — копейки.',
      speed: '1–3 с', accuracy: 'высокая; сумму и категорию разбирает приложение', keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'gspeech', group: 'web', name: 'Google Cloud Speech-to-Text', key: true,
      hint: 'Нужен проект Google Cloud с включённым Speech-to-Text API и ключом API (первые 60 минут в месяц бесплатно).',
      speed: '1–3 с', accuracy: 'высокая; сумму и категорию разбирает приложение', keyUrl: 'https://console.cloud.google.com/apis/library/speech.googleapis.com' },
    { id: 'browser', group: 'browser', name: 'Браузер (встроенное)', key: false, stream: true,
      hint: 'Встроенное распознавание Chrome, Edge и Safari: ключ не нужен, текст виден по ходу речи. В Chrome звук распознают серверы Google. Не работает в Firefox и во многих обёртках сайта в приложение — тогда помогут другие способы.',
      speed: '1–2 с', accuracy: 'средняя–высокая' },
    { id: 'whisper-base', group: 'local', name: 'На устройстве: точнее (Whisper base)', key: false, local: true, modelId: 'Xenova/whisper-base', size: '~80 МБ',
      hint: 'Whisper прямо в браузере: звук никуда не уходит, ключ не нужен, после первой загрузки модели (~80 МБ) работает без интернета.',
      speed: '5–20 с', accuracy: 'средняя' },
    { id: 'whisper-tiny', group: 'local', name: 'На устройстве: быстрее (Whisper tiny)', key: false, local: true, modelId: 'Xenova/whisper-tiny', size: '~40 МБ',
      hint: 'Самая лёгкая модель Whisper (~40 МБ): в 2–3 раза быстрее «base», но чаще ошибается в числах и редких словах.',
      speed: '3–10 с', accuracy: 'ниже средней' }
];
const VOICE_GROUP_NAMES = { ai: 'ИИ', web: 'Веб', browser: 'Браузер', local: 'На устройстве' };
const VOICE_PARSE_AI = [ // кто может «причесать» уже готовый текст фразы (ключи — те же, что у распознавания фото)
    { id: 'gemini', name: 'Gemini (Google)' }, { id: 'claude', name: 'Claude (Anthropic)' }, { id: 'openai', name: 'OpenAI (ChatGPT)' }
];

function voiceEngine(id) { return VOICE_ENGINES.find(e => e.id === id) || null; }
function voiceError(code, message, fatal) { const e = new Error(message); e.code = code; if (fatal) e.fatal = true; return e; }

// ---------- Ключи и настройки ----------
function voiceReadStore(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
function voiceKeys() { return voiceReadStore(VOICE_KEYS_STORE); }
function voiceSaveKeys(keys) { try { localStorage.setItem(VOICE_KEYS_STORE, JSON.stringify(keys)); } catch (e) {} }
function voiceKeyOf(id) {
    const own = String(voiceKeys()[id] || '').trim();
    if (own) return own;
    const cfg = window.MONEY_CONFIG && window.MONEY_CONFIG.ocrKeys; // ключ можно вписать и в js/config.js
    return cfg && typeof cfg[id] === 'string' ? cfg[id].trim() : '';
}
function voiceAvailable(id) { const e = voiceEngine(id); return !!e && (!e.key || !!voiceKeyOf(id)); }

function voicePrefs() {
    const p = voiceReadStore(VOICE_PREFS_STORE);
    const okId = v => v === 'auto' || !!voiceEngine(v);
    return {
        engine: okId(p.engine) ? p.engine : 'auto',
        lang: p.lang === 'app' || VOICE_LANGS.some(l => l.id === p.lang) ? (p.lang || 'app') : 'app',
        fallback: p.fallback !== false,
        autoStop: p.autoStop !== false,
        parseAi: p.parseAi === 'off' || VOICE_PARSE_AI.some(a => a.id === p.parseAi) ? p.parseAi : 'auto',
        models: (p.models && typeof p.models === 'object') ? p.models : {}
    };
}
function voiceSavePrefs(p) { try { localStorage.setItem(VOICE_PREFS_STORE, JSON.stringify(p)); } catch (e) {} }
function voiceModelOf(id) {
    const e = voiceEngine(id);
    return String((voicePrefs().models || {})[id] || '').trim() || (e && e.model) || '';
}

function voiceLang(prefs) {
    const want = (prefs || voicePrefs()).lang;
    let id = want;
    if (want === 'app') {
        const app = typeof appLang !== 'undefined' ? appLang : 'ru';
        id = app === 'ru-old' ? 'ru' : app;
    }
    return VOICE_LANGS.find(l => l.id === id) || VOICE_LANGS[0];
}

function voiceBrowserSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function voiceMicSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined'); }
function voiceOnline() { return typeof navigator === 'undefined' || navigator.onLine !== false; }

// Подходит ли способ на этом устройстве (для цепочки): браузерное распознавание есть не везде
function voiceUsable(id) {
    const e = voiceEngine(id);
    if (!e) return false;
    return e.stream ? voiceBrowserSupported() : voiceMicSupported(); // без записи звука остаётся только браузерный способ
}

// «Авто»: ИИ с ключом → веб с ключом → браузер → Whisper «быстрее» (последний шанс, модель скачивается один раз)
function voiceAutoChain() {
    const out = [];
    if (voiceOnline()) ['gemini', 'groq', 'openai', 'gspeech'].forEach(id => { if (voiceAvailable(id)) out.push(id); });
    out.push('browser', 'whisper-tiny');
    return out.filter(id => id === 'browser' ? voiceBrowserSupported() : voiceMicSupported());
}
function voiceChain(chosen) {
    const prefs = voicePrefs();
    const want = chosen || prefs.engine || 'auto';
    const auto = voiceAutoChain();
    if (want === 'auto') return auto;
    const chain = [want];
    if (prefs.fallback) auto.forEach(id => { if (!chain.includes(id)) chain.push(id); });
    return chain.filter(id => voiceUsable(id));
}

// ---------- Запись звука ----------
function voiceLevelOf(analyser, buf) {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / buf.length);
}

// Запись с микрофона. onLevel(0..1, секунды) — для индикатора. Останавливается сама, когда вы замолчали (autoStop),
// не услышав речи за 9 с или через VOICE_MAX_SECONDS. Результат — clip: { blob, mime, ms, heard, peakRms }
async function voiceCapture({ autoStop = true, onLevel } = {}) {
    if (!voiceMicSupported()) throw voiceError('nomic', 'Браузер не умеет записывать звук', false);
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
        const denied = /NotAllowed|Permission|Security/i.test(String((e && e.name) || '') + String((e && e.message) || ''));
        throw voiceError(denied ? 'denied' : 'nomic', denied
            ? 'Нет доступа к микрофону — разрешите его для сайта (значок замка в адресной строке) и в настройках телефона.'
            : 'Микрофон не найден или занят другим приложением.', denied);
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(m => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)) || '';
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch (e) { stream.getTracks().forEach(t => t.stop()); throw voiceError('nomic', 'Не удалось начать запись звука', false); }

    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    let ac = null, analyser = null, buf = null;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        const src = ac.createMediaStreamSource(stream);
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        buf = new Uint8Array(analyser.fftSize);
    } catch (e) { analyser = null; }

    const startedAt = Date.now();
    let heard = false, voiceMs = 0, lastVoice = 0, peak = 0, floor = 0.012, stopReason = '', cancelled = false, timer = null, stopped = false;
    const done = new Promise((resolve, reject) => {
        rec.onstop = () => {
            clearInterval(timer);
            stream.getTracks().forEach(t => t.stop());
            if (ac) ac.close().catch(() => {});
            if (cancelled) { reject(voiceError('cancelled', 'Запись отменена', true)); return; }
            resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), mime: rec.mimeType || mime || 'audio/webm',
                ms: Date.now() - startedAt, heard, peakRms: peak, reason: stopReason });
        };
        rec.onerror = () => { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); reject(voiceError('nomic', 'Сбой записи звука', false)); };
    });
    const stop = reason => {
        if (stopped) return;
        stopped = true; stopReason = reason || 'user';
        try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    };
    rec.start(250);
    timer = setInterval(() => {
        const now = Date.now(), elapsed = now - startedAt;
        let level = 0;
        if (analyser) {
            level = voiceLevelOf(analyser, buf);
            if (elapsed < 400) floor = Math.max(floor, Math.min(0.05, level * 1.4)); // шум помещения
            const gate = Math.max(0.022, floor * 2.2);
            if (level > peak) peak = level;
            if (level > gate) { voiceMs += 60; lastVoice = now; if (voiceMs >= 240) heard = true; }
        }
        if (onLevel) onLevel(Math.min(1, level * 5), elapsed / 1000);
        if (analyser && autoStop) {
            if (heard && now - lastVoice > 1600) stop('silence');
            else if (!heard && elapsed > 9000) stop('nospeech');
        }
        if (elapsed > VOICE_MAX_SECONDS * 1000) stop('max');
    }, 60);
    return { stop, done, cancel: () => { cancelled = true; stop('cancel'); }, hasMeter: !!analyser };
}

// ---------- Звук → WAV 16 кГц, моно ----------
function voiceEncodeWav(f32, rate) {
    const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Uint8Array(buf);
}
function voiceBase64(bytes) {
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(bin);
}

// Декодирует запись, приводит к 16 кГц моно и слегка выравнивает громкость. Результат запоминается в clip.prep
function voiceClipPrep(clip) {
    if (clip.prep) return clip.prep;
    clip.prep = (async () => {
        const AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AC || !OAC) throw voiceError('decode', 'браузер не умеет обрабатывать звук');
        const raw = await clip.blob.arrayBuffer();
        const ctx = new AC();
        let decoded;
        try { decoded = await new Promise((res, rej) => { const p = ctx.decodeAudioData(raw.slice(0), res, rej); if (p && p.catch) p.catch(rej); }); }
        catch (e) { throw voiceError('decode', 'не удалось прочитать запись (' + (clip.mime || 'неизвестный формат') + ')'); }
        finally { ctx.close().catch(() => {}); }
        const rate = 16000, frames = Math.max(1, Math.ceil(decoded.duration * rate));
        const off = new OAC(1, frames, rate), src = off.createBufferSource();
        src.buffer = decoded; src.connect(off.destination); src.start();
        const pcm = (await off.startRendering()).getChannelData(0).slice();
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
        if (peak > 0.002 && peak < 0.5) { const gain = Math.min(8, 0.9 / peak); for (let i = 0; i < pcm.length; i++) pcm[i] *= gain; }
        return { pcm, rate, peak, seconds: pcm.length / rate, wav: voiceEncodeWav(pcm, rate) };
    })();
    return clip.prep;
}
async function voiceClipWavBase64(clip) { const p = await voiceClipPrep(clip); return voiceBase64(p.wav); }

// ---------- Запросы к сервисам ----------
async function voiceHttp(url, options, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
        res = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    } catch (e) {
        if (e && e.name === 'AbortError') throw voiceError('timeout', 'сервис слишком долго отвечает');
        throw voiceError('net', voiceOnline() ? 'сервис недоступен (нет связи или запрос заблокирован)' : 'нет интернета');
    } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) {
        let detail = '';
        try { const j = await res.clone().json(); detail = (j.error && (j.error.message || j.error)) || j.message || ''; } catch (e) {}
        detail = String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 160);
        if (res.status === 401 || res.status === 403) throw voiceError('auth', 'ключ не принят' + (detail ? ' (' + detail + ')' : ''));
        if (res.status === 429) throw voiceError('quota', 'лимит запросов исчерпан, подождите или смените помощника');
        if (res.status === 404) throw voiceError('model', 'модель не найдена — проверьте название в настройках' + (detail ? ' (' + detail + ')' : ''));
        if (res.status === 400 && /api[_ ]?key/i.test(detail)) throw voiceError('auth', 'ключ не принят (' + detail + ')');
        throw voiceError('http', 'ошибка сервиса ' + res.status + (detail ? ': ' + detail : ''));
    }
    return res;
}

function voiceParseJson(text) {
    const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw voiceError('bad', 'ИИ вернул ответ не в том виде');
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw voiceError('bad', 'ИИ вернул ответ не в том виде'); }
}

// Описание задачи для ИИ. ctx: { lang, categories, today }
function voicePromptRules(ctx) {
    const cats = (ctx.categories || []).slice(0, 80).join(', ');
    return 'Правила: числа словами переведи в цифры («пять тысяч двести» → 5200, «полтора миллиона» → 1500000, «5к» → 5000, «две сотни» → 200); ' +
        'amount — одна сумма записи числом без пробелов и валюты (если сумм несколько, возьми итоговую или ту, что названа ценой); ' +
        'currency — KZT, USD, EUR или RUB, только если валюта названа вслух, иначе пустая строка; ' +
        'type — "income" для дохода (получил, заработал, зарплата, аванс, вернули, кэшбэк, подарили деньги), "expense" для траты (потратил, купил, заплатил, оплатил, отдал), если не ясно — пустая строка; ' +
        'category — ТОЛЬКО одно название из списка [' + cats + '], выбери по смыслу; если подходящего нет — пустая строка; ' +
        'comment — коротко, что куплено или откуда деньги (до 60 символов), без суммы и без слов «потратил»/«получил»; ' +
        'day — "yesterday" если сказано «вчера», "before_yesterday" если «позавчера», иначе "today". Сегодня ' + ctx.today + '. Ничего не выдумывай.';
}
const VOICE_JSON_SHAPE = '{"text": "дословная расшифровка", "amount": число или 0, "currency": "", "type": "", "category": "", "comment": "", "day": "today"}';

function voiceAudioPrompt(ctx) {
    return 'Это голосовая запись человека, который диктует запись в приложение учёта личных финансов (Казахстан, тенге ₸). Язык речи: ' + ctx.lang.name +
        ' (возможны вкрапления русского, казахского или английского). Пример: «' + ctx.lang.sample + '». Верни ТОЛЬКО JSON, без пояснений и markdown:\n' + VOICE_JSON_SHAPE + '\n' +
        voicePromptRules(ctx) + ' Если речи нет или она неразборчива — text пустой, amount 0.';
}
function voiceTextPrompt(text, ctx) {
    return 'Человек продиктовал запись для приложения учёта личных финансов (Казахстан, тенге ₸); распознавание речи записало: «' + text + '». Исправь явные ослышки по смыслу и верни ТОЛЬКО JSON, без пояснений и markdown:\n' +
        VOICE_JSON_SHAPE + '\n' + voicePromptRules(ctx) + ' В поле text верни исправленную фразу.';
}

// Gemini: слышит запись и сразу возвращает JSON
async function voiceAskGemini(clip, ctx) {
    const model = voiceModelOf('gemini'), gen = { responseMimeType: 'application/json', temperature: 0 };
    if (/2\.5/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };
    const data = await voiceClipWavBase64(clip);
    const res = await voiceHttp(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(voiceKeyOf('gemini'))}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: voiceAudioPrompt(ctx) }, { inline_data: { mime_type: 'audio/wav', data } }] }], generationConfig: gen })
    }, VOICE_AI_TIMEOUT_MS);
    const j = await res.json();
    const text = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
    if (!text) throw voiceError('bad', 'Gemini не вернул текст' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : ''));
    const obj = voiceParseJson(text);
    return { text: String(obj.text || '').trim(), fields: obj };
}

// Whisper-подобные сервисы (OpenAI и Groq принимают один и тот же запрос)
async function voiceWhisperHttp(url, key, model, clip, ctx) {
    const prep = await voiceClipPrep(clip).catch(() => null);
    const file = prep ? new Blob([prep.wav], { type: 'audio/wav' }) : clip.blob;
    const form = new FormData();
    form.append('file', file, prep ? 'voice.wav' : (/mp4/.test(clip.mime) ? 'voice.m4a' : 'voice.webm'));
    form.append('model', model);
    form.append('language', ctx.lang.iso);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', ctx.lang.sample + '.');
    const res = await voiceHttp(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form }, VOICE_WEB_TIMEOUT_MS);
    const j = await res.json();
    return { text: String(j.text || '').trim() };
}
const voiceWebOpenAI = (clip, ctx) => voiceWhisperHttp('https://api.openai.com/v1/audio/transcriptions', voiceKeyOf('openai'), voiceModelOf('openai'), clip, ctx);
const voiceWebGroq = (clip, ctx) => voiceWhisperHttp('https://api.groq.com/openai/v1/audio/transcriptions', voiceKeyOf('groq'), voiceModelOf('groq'), clip, ctx);

async function voiceWebGoogle(clip, ctx) {
    const data = await voiceClipWavBase64(clip);
    const res = await voiceHttp(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(voiceKeyOf('gspeech'))}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { encoding: 'LINEAR16', sampleRateHertz: 16000, languageCode: ctx.lang.bcp, enableAutomaticPunctuation: true }, audio: { content: data } })
    }, VOICE_WEB_TIMEOUT_MS);
    const j = await res.json();
    const text = (j.results || []).map(r => ((r.alternatives || [])[0] || {}).transcript || '').join(' ').replace(/\s+/g, ' ').trim();
    return { text };
}

// Whisper на устройстве: transformers.js подгружается с jsDelivr при первом использовании, модель — с Hugging Face (затем кэш браузера)
const VOICE_TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
const voiceWhisperPipes = {};
function voiceWhisperLoaded(id) { return !!(voiceWhisperPipes[id] && voiceWhisperPipes[id].ready); }
function voiceWhisperLoad(id, onProgress) {
    const e = voiceEngine(id);
    if (!e || !e.local) return Promise.reject(voiceError('bad', 'неизвестная модель'));
    if (!voiceWhisperPipes[id]) {
        const entry = voiceWhisperPipes[id] = { ready: false, promise: null };
        const files = {};
        entry.promise = (async () => {
            let mod;
            try { mod = await import(VOICE_TRANSFORMERS_URL); }
            catch (err) { throw voiceError('net', voiceOnline() ? 'не удалось загрузить модуль распознавания (jsDelivr недоступен)' : 'нет интернета — модуль ещё не скачан'); }
            mod.env.allowLocalModels = false;
            mod.env.useBrowserCache = true;
            try { mod.env.backends.onnx.wasm.numThreads = 1; } catch (err) {}
            const pipe = await mod.pipeline('automatic-speech-recognition', e.modelId, {
                progress_callback: p => {
                    if (!p || !onProgress) return;
                    if (p.status === 'progress' && p.file) {
                        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
                        const all = Object.values(files), total = all.reduce((s, f) => s + f.total, 0), loaded = all.reduce((s, f) => s + f.loaded, 0);
                        onProgress(total ? loaded / total : 0, total);
                    }
                }
            }).catch(err => { throw voiceError('net', (voiceOnline() ? 'не удалось загрузить модель ' : 'нет интернета — модель не загружена: ') + String(err && err.message || err).slice(0, 100)); });
            entry.ready = true;
            return pipe;
        })();
        entry.promise.catch(() => { delete voiceWhisperPipes[id]; });
    }
    return voiceWhisperPipes[id].promise;
}
async function voiceLocalWhisper(id, clip, ctx, onProgress) {
    const wasLoaded = voiceWhisperLoaded(id);
    const pipe = await voiceWhisperLoad(id, (p, total) => {
        if (onProgress) onProgress(`Загружаем модель распознавания (один раз, ${voiceEngine(id).size}): ${Math.round(p * 100)}%`, 0.05 + p * 0.6);
    });
    if (onProgress) onProgress(wasLoaded ? 'Распознаём…' : 'Модель загружена, распознаём…', 0.7);
    const prep = await voiceClipPrep(clip);
    const out = await pipe(prep.pcm, { language: ctx.lang.whisper, task: 'transcribe', chunk_length_s: 30, return_timestamps: false });
    return { text: String((out && out.text) || '').trim() };
}

// Готовый текст → поля записи через ИИ (Gemini, Claude, OpenAI). Ключи и модели — как у распознавания фото
function voiceParseAiModel(id) {
    if (typeof ocrModelOf === 'function' && typeof ocrEngine === 'function' && ocrEngine(id)) return ocrModelOf(id);
    return { gemini: 'gemini-2.5-flash', claude: 'claude-haiku-5-5', openai: 'gpt-5.4-nano' }[id];
}
function voiceParseAiPick() {
    const p = voicePrefs().parseAi;
    if (p === 'off' || !voiceOnline()) return '';
    const has = id => !!voiceKeyOf(id);
    if (p !== 'auto') return has(p) ? p : '';
    return ['gemini', 'claude', 'openai'].find(has) || '';
}
async function voiceAiParse(text, ctx, id) {
    const prompt = voiceTextPrompt(text, ctx), model = voiceParseAiModel(id), key = voiceKeyOf(id);
    let answer = '';
    if (id === 'gemini') {
        const gen = { responseMimeType: 'application/json', temperature: 0 };
        if (/2\.5/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };
        const res = await voiceHttp(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: gen })
        }, 12000);
        answer = (((((await res.json()).candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
    } else if (id === 'claude') {
        const res = await voiceHttp('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
        }, 12000);
        answer = ((await res.json()).content || []).map(c => c.text || '').join('');
    } else if (id === 'openai') {
        const res = await voiceHttp('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
        }, 12000);
        answer = ((((await res.json()).choices || [])[0] || {}).message || {}).content || '';
    }
    if (!answer) throw voiceError('bad', 'ИИ не вернул ответ');
    return voiceParseJson(answer);
}

// Один способ (кроме браузерного) → { text, fields? }
async function voiceRunEngine(id, clip, ctx, onProgress) {
    const e = voiceEngine(id);
    if (!e || e.stream) throw voiceError('bad', 'способ не подходит для записи');
    if (e.key && !voiceKeyOf(id)) throw voiceError('nokey', 'не вписан ключ (Настройки → Голосовой ввод)');
    if (clip.ms < VOICE_MIN_MS) throw voiceError('short', 'запись слишком короткая', true);
    if (!clip.heard && clip.peakRms < 0.012) throw voiceError('quiet', 'в записи не слышно голоса', true);
    if (onProgress) onProgress(`Ждём ответ: ${e.name}…`, 0.35);
    if (e.local) return voiceLocalWhisper(id, clip, ctx, onProgress);
    if (id === 'gemini') return voiceAskGemini(clip, ctx);
    if (id === 'groq') return voiceWebGroq(clip, ctx);
    if (id === 'openai') return voiceWebOpenAI(clip, ctx);
    if (id === 'gspeech') return voiceWebGoogle(clip, ctx);
    throw voiceError('bad', 'неизвестный способ');
}

// ---------- Браузерное распознавание (по ходу речи) ----------
function voiceListenBrowser({ lang, onInterim }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw voiceError('unsupported', 'в этом браузере нет распознавания речи');
    const rec = new SR();
    rec.lang = lang.bcp; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '', lastInterim = '', lastErr = '', cancelled = false;
    const done = new Promise((resolve, reject) => {
        rec.onresult = ev => {
            let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + ' ';
                else interim += ev.results[i][0].transcript;
            }
            lastInterim = interim;
            if (onInterim) onInterim((finalText + interim).trim());
        };
        rec.onerror = ev => { lastErr = ev.error || 'error'; };
        rec.onend = () => {
            const text = (finalText.trim() || lastInterim.trim());
            if (cancelled) { reject(voiceError('cancelled', 'Запись отменена', true)); return; }
            if (text) { resolve({ text }); return; }
            if (lastErr === 'not-allowed') reject(voiceError('denied', 'Нет доступа к микрофону — разрешите его для сайта (значок замка в адресной строке).', true));
            else if (lastErr === 'no-speech' || !lastErr) reject(voiceError('nospeech', 'Ничего не услышал — попробуйте ещё раз ближе к микрофону.', true));
            else if (lastErr === 'audio-capture') reject(voiceError('nomic', 'Микрофон не найден или занят другим приложением.', true));
            else if (lastErr === 'aborted') reject(voiceError('cancelled', 'Запись отменена', true));
            else if (lastErr === 'network') reject(voiceError('net', 'для браузерного распознавания нужен интернет'));
            else if (lastErr === 'service-not-allowed') reject(voiceError('blocked', 'браузер не разрешает распознавание речи на этой странице'));
            else if (lastErr === 'language-not-supported') reject(voiceError('lang', 'язык ' + lang.bcp + ' не поддерживается браузером'));
            else reject(voiceError('http', 'ошибка распознавания: ' + lastErr));
        };
        try { rec.start(); } catch (e) { reject(voiceError('start', 'не удалось включить микрофон: ' + (e.message || e))); }
    });
    return { stop: () => { try { rec.stop(); } catch (e) {} }, cancel: () => { cancelled = true; try { rec.abort(); } catch (e) {} }, done };
}

// ---------- Настройки: «Голосовой ввод» ----------
function voiceOptionsHtml(selected) {
    const cur = selected || voicePrefs().engine;
    const groups = ['ai', 'web', 'browser', 'local'].map(g => `<optgroup label="${VOICE_GROUP_NAMES[g]}">${VOICE_ENGINES.filter(e => e.group === g).map(e =>
        `<option value="${e.id}" ${cur === e.id ? 'selected' : ''}>${escapeHtml(e.name)}${e.key && !voiceKeyOf(e.id) ? ' — нужен ключ' : ''}</option>`).join('')}</optgroup>`).join('');
    return `<option value="auto" ${cur === 'auto' ? 'selected' : ''}>Авто (лучший из доступных)</option>${groups}`;
}
function renderVoiceSelects() {
    document.querySelectorAll('select[data-voice-select]').forEach(sel => { sel.innerHTML = voiceOptionsHtml(); });
}
function onVoiceSelectChange(sel) {
    const p = voicePrefs();
    p.engine = sel.value;
    voiceSavePrefs(p);
    renderVoiceSelects();
    renderVoiceSettings(true);
}

function voiceBadge(e) {
    const ready = voiceAvailable(e.id);
    let second;
    if (e.key) second = `<span class="ocr-badge ${ready ? 'is-ready' : 'is-nokey'}">${ready ? 'ключ есть' : 'нужен ключ'}</span>`;
    else if (e.local) second = `<span class="ocr-badge ${voiceWhisperLoaded(e.id) ? 'is-ready' : ''}">${voiceWhisperLoaded(e.id) ? 'модель загружена' : e.size}</span>`;
    else second = `<span class="ocr-badge ${voiceBrowserSupported() ? 'is-ready' : 'is-nokey'}">${voiceBrowserSupported() ? 'есть в этом браузере' : 'нет в этом браузере'}</span>`;
    return `<span class="ocr-badge is-${e.group === 'web' ? 'web' : (e.group === 'ai' ? 'ai' : 'local')}">${VOICE_GROUP_NAMES[e.group]}</span>${second}`;
}

function renderVoiceSettings(force) {
    const box = document.getElementById('voice-settings');
    if (!box) return;
    if (!force && box.contains(document.activeElement) && document.activeElement.matches('input')) return; // не мешаем вводу ключа
    const prefs = voicePrefs(), keys = voiceKeys();
    const row = e => `
        <div class="ocr-engine">
            <div class="ocr-engine-head"><b data-i18n-skip>${escapeHtml(e.name)}</b> ${voiceBadge(e)}</div>
            <p class="hint">${escapeHtml(e.hint)}<br>Скорость: ${escapeHtml(e.speed)} · точность: ${escapeHtml(e.accuracy)}</p>
            ${e.key ? `<div class="ocr-key-row">
                <input type="password" autocomplete="off" spellcheck="false" placeholder="Ключ (API key)${e.shared ? ' — общий с распознаванием фото' : ''}" value="${escapeHtml(keys[e.id] || '')}" onchange="voiceSetKey('${e.id}', this.value)">
                <a class="btn-secondary ocr-link" href="${escapeHtml(e.keyUrl)}" target="_blank" rel="noopener" title="Где взять ключ"><span class="material-icons">open_in_new</span></a></div>` : ''}
            ${e.models ? `<div class="ocr-key-row"><input type="text" list="voice-models-${e.id}" autocomplete="off" spellcheck="false" placeholder="Модель: ${escapeHtml(e.model)}" data-i18n-skip value="${escapeHtml((prefs.models || {})[e.id] || '')}" onchange="voiceSetModel('${e.id}', this.value)">
                <datalist id="voice-models-${e.id}">${e.models.map(m => `<option value="${escapeHtml(m)}">`).join('')}</datalist></div>` : ''}
            ${e.local ? `<div class="ocr-key-row"><button type="button" class="btn-secondary btn-block" onclick="voicePreload('${e.id}', this)" ${voiceWhisperLoaded(e.id) ? 'disabled' : ''}><span class="material-icons">download</span> ${voiceWhisperLoaded(e.id) ? 'Модель уже загружена' : 'Загрузить модель заранее (' + e.size + ')'}</button></div>` : ''}
        </div>`;
    const langOpts = `<option value="app" ${prefs.lang === 'app' ? 'selected' : ''}>Как язык приложения</option>` +
        VOICE_LANGS.map(l => `<option value="${l.id}" ${prefs.lang === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
    const parseOpts = [['auto', 'Авто (если есть ключ)'], ['off', 'Выключено']].concat(VOICE_PARSE_AI.map(a => [a.id, a.name]))
        .map(([v, n]) => `<option value="${v}" ${prefs.parseAi === v ? 'selected' : ''}>${escapeHtml(n)}${VOICE_PARSE_AI.some(a => a.id === v) && !voiceKeyOf(v) ? ' — нужен ключ' : ''}</option>`).join('');
    box.innerHTML = `
        <p class="hint ocr-privacy"><span class="material-icons">lock</span> <span><b>Куда уходит голос.</b> «ИИ» и «Веб» отправляют запись на сервер выбранной компании (Google, Groq, OpenAI). «Браузер» в Chrome отдаёт звук на распознавание Google. «На устройстве» — запись остаётся в телефоне. Запись нигде не сохраняется. Ключи хранятся только на этом устройстве: не попадают ни на Google Диск, ни в синхронизацию, ни в архив сайта.</span></p>
        <label class="field-inline"><span>Помощник</span><select data-voice-select onchange="onVoiceSelectChange(this)">${voiceOptionsHtml()}</select></label>
        <label class="field-inline"><span>Язык речи</span><select onchange="voiceSetPref('lang', this.value)">${langOpts}</select></label>
        <label class="field-inline"><span>Уточнять фразу ИИ</span><select onchange="voiceSetPref('parseAi', this.value)">${parseOpts}</select></label>
        <label class="hdr-part"><input type="checkbox" ${prefs.autoStop ? 'checked' : ''} onchange="voiceSetPref('autoStop', this.checked)"> Останавливать запись, когда вы замолчали</label>
        <label class="hdr-part"><input type="checkbox" ${prefs.fallback ? 'checked' : ''} onchange="voiceSetPref('fallback', this.checked)"> Если выбранный помощник не сработал — пробовать следующий</label>
        <p class="hint">«Авто»: ИИ с ключом → веб с ключом → браузер → Whisper на устройстве. «Уточнять фразу ИИ» (для веб-сервисов, браузера и Whisper): готовый текст дополнительно уходит в Gemini, Claude или OpenAI (ключи — как у распознавания фото), чтобы точнее найти сумму, категорию и тип; при сбое работает обычный разбор. Gemini в роли помощника справляется сам.</p>
        <h4 class="font-sub">ИИ</h4>${VOICE_ENGINES.filter(e => e.group === 'ai').map(row).join('')}
        <h4 class="font-sub">Веб-распознавание речи</h4>${VOICE_ENGINES.filter(e => e.group === 'web').map(row).join('')}
        <h4 class="font-sub">Браузер</h4>${VOICE_ENGINES.filter(e => e.group === 'browser').map(row).join('')}
        <h4 class="font-sub">На устройстве</h4>${VOICE_ENGINES.filter(e => e.group === 'local').map(row).join('')}
        <h4 class="font-sub">Разбор фразы ИИ: Claude</h4>
        <div class="ocr-engine">
            <div class="ocr-engine-head"><b data-i18n-skip>Claude (Anthropic)</b> <span class="ocr-badge is-ai">ИИ</span><span class="ocr-badge ${voiceKeyOf('claude') ? 'is-ready' : 'is-nokey'}">${voiceKeyOf('claude') ? 'ключ есть' : 'нужен ключ'}</span></div>
            <p class="hint">Claude не слушает звук, но отлично разбирает готовый текст фразы. Ключ общий с распознаванием фото (console.anthropic.com).</p>
            <div class="ocr-key-row"><input type="password" autocomplete="off" spellcheck="false" placeholder="Ключ (API key) — общий с распознаванием фото" value="${escapeHtml(keys.claude || '')}" onchange="voiceSetKey('claude', this.value)">
                <a class="btn-secondary ocr-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" title="Где взять ключ"><span class="material-icons">open_in_new</span></a></div>
        </div>
        <button type="button" class="btn-secondary btn-block" id="voice-test-btn" onclick="voiceSettingsTest()"><span class="material-icons">mic</span> Проверить микрофон и помощника</button>
        <button type="button" class="btn-secondary btn-block" id="voice-compare-btn" onclick="voiceSettingsCompare()"><span class="material-icons">speed</span> Сравнить помощников на одной записи</button>
        <p class="hint">Проверка записывает одну фразу и показывает, что услышал выбранный помощник и как быстро. Сравнение записывает фразу один раз и прогоняет её через все помощники с ключом (Whisper — только если модель уже загружена). Запись в приложение при этом не добавляется.</p>
        <div class="ocr-bench voice-test" id="voice-test" aria-live="polite"></div>`;
}
function voiceRefreshSettings() {
    renderVoiceSelects();
    renderVoiceSettings(true);
    if (typeof renderOcrSettings === 'function') renderOcrSettings(true);
    if (typeof renderOcrSelects === 'function') renderOcrSelects();
}
function voiceSetKey(id, value) {
    const keys = voiceKeys(), v = String(value || '').replace(/\s+/g, '');
    if (v) keys[id] = v; else delete keys[id];
    voiceSaveKeys(keys);
    voiceRefreshSettings();
}
function voiceSetModel(id, value) {
    const p = voicePrefs(), v = String(value || '').trim().slice(0, 60);
    if (v) p.models[id] = v; else delete p.models[id];
    voiceSavePrefs(p);
}
function voiceSetPref(name, value) {
    const p = voicePrefs();
    p[name] = value;
    voiceSavePrefs(p);
    renderVoiceSelects();
    renderVoiceSettings(true);
}
async function voicePreload(id, btn) {
    if (btn) { btn.disabled = true; btn.lastChild.textContent = ' Загрузка…'; }
    try {
        await voiceWhisperLoad(id, p => { if (btn) btn.lastChild.textContent = ` Загрузка: ${Math.round(p * 100)}%`; });
        if (typeof showToast === 'function') showToast('Модель загружена: теперь распознавание работает и без интернета');
    } catch (e) {
        if (typeof showToast === 'function') showToast('Не удалось загрузить модель: ' + (e && e.message ? e.message : e));
    }
    renderVoiceSettings(true);
}

// ---------- Проверка и сравнение ----------
function voiceFmtSec(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' с'; }
function voiceTestBox() { return document.getElementById('voice-test'); }

async function voiceSettingsTest() {
    const out = voiceTestBox();
    if (!out) return;
    if (voiceSession) { voiceStopOrCancel(); return; }
    out.innerHTML = `<p class="hint">Скажите, например: «${escapeHtml(voiceLang().sample)}».</p>`;
    const ui = {
        state: (phase, info) => { out.innerHTML = `<p class="hint">${phase === 'listening' ? 'Слушаю… (нажмите «Проверить» ещё раз, чтобы закончить)' : escapeHtml((info && info.text) || 'Обрабатываю…')}</p>`; },
        level() {}, interim: t => { out.innerHTML = `<p class="hint">Слышу: «${escapeHtml(t)}»</p>`; }, progress: t => { out.innerHTML = `<p class="hint">${escapeHtml(t)}</p>`; }, note: t => { out.innerHTML = `<p class="hint">${escapeHtml(t)}</p>`; }
    };
    try {
        const r = await voiceRecognize({ ui, test: true });
        const p = r.parsed;
        out.innerHTML = `<table class="ocr-bench-table"><thead><tr><th>Помощник</th><th>Время</th><th>Результат</th></tr></thead><tbody><tr><td data-i18n-skip>${escapeHtml(r.engineName)}</td><td>${voiceFmtSec(r.ms)}</td>
            <td class="is-good">✓ «${escapeHtml(r.text)}»<br><small>${p.amount ? 'сумма ' + p.amount.toLocaleString('ru-RU') : 'сумма не найдена'}${p.category ? ' · ' + escapeHtml(p.category) : ''}${p.type ? ' · ' + (p.type === 'income' ? 'доход' : 'расход') : ''}</small></td></tr></tbody></table>` +
            (r.tried.length ? `<p class="hint">Раньше не сработало: ${escapeHtml(r.tried.join('; '))}</p>` : '');
    } catch (err) {
        if (!(err && err.code === 'cancelled')) out.innerHTML = `<p class="hint is-bad">✗ ${escapeHtml(err && err.message ? err.message : String(err))}</p>`;
        else out.innerHTML = '';
    }
}

async function voiceSettingsCompare() {
    const out = voiceTestBox(), btn = document.getElementById('voice-compare-btn');
    if (!out) return;
    if (voiceSession) { voiceStopOrCancel(); return; }
    if (btn && btn.dataset.busy) return;
    const ids = VOICE_ENGINES.filter(e => !e.stream && (e.local ? voiceWhisperLoaded(e.id) : voiceAvailable(e.id))).map(e => e.id);
    if (!ids.length) { out.innerHTML = '<p class="hint is-bad">Нет помощников для сравнения: впишите хотя бы один ключ (Gemini, Groq, OpenAI, Google) или загрузите модель Whisper.</p>'; return; }
    const ctx = voiceContext(), rows = [];
    out.innerHTML = `<p class="hint">Скажите, например: «${escapeHtml(ctx.lang.sample)}». Запись закончится, когда вы замолчите.</p>`;
    let clip;
    try {
        voiceSession = { phase: 'listening', ctrl: null, compare: true };
        const cap = await voiceCapture({ autoStop: true, onLevel: (lv, sec) => { out.innerHTML = `<p class="hint">Слушаю… ${sec.toFixed(0)} с · уровень ${'▮'.repeat(Math.round(lv * 8)) || '·'}</p>`; } });
        voiceSession.ctrl = cap;
        clip = await cap.done;
    } catch (err) { voiceSession = null; if (!(err && err.code === 'cancelled')) out.innerHTML = `<p class="hint is-bad">✗ ${escapeHtml(err && err.message ? err.message : String(err))}</p>`; else out.innerHTML = ''; return; }
    voiceSession = null;
    if (btn) btn.dataset.busy = '1';
    const paint = () => { out.innerHTML = `<table class="ocr-bench-table"><thead><tr><th>Помощник</th><th>Время</th><th>Что услышал</th></tr></thead><tbody>${rows.join('')}</tbody></table>`; };
    for (const id of ids) {
        const e = voiceEngine(id), t0 = Date.now();
        rows.push(`<tr><td data-i18n-skip>${escapeHtml(e.name)}</td><td>…</td><td>слушает запись…</td></tr>`); paint();
        let cell;
        try {
            const r = await voiceRunEngine(id, clip, ctx);
            const f = voiceFields(r, ctx);
            cell = `<td>${voiceFmtSec(Date.now() - t0)}</td><td class="is-good">✓ «${escapeHtml(r.text || '')}»<br><small>${f.amount ? 'сумма ' + f.amount.toLocaleString('ru-RU') : 'сумма не найдена'}${f.category ? ' · ' + escapeHtml(f.category) : ''}</small></td>`;
        } catch (err) { cell = `<td>${voiceFmtSec(Date.now() - t0)}</td><td class="is-bad">✗ ${escapeHtml(err && err.message ? err.message : String(err))}</td>`; }
        rows[rows.length - 1] = `<tr><td data-i18n-skip>${escapeHtml(e.name)}</td>${cell}</tr>`; paint();
    }
    if (btn) delete btn.dataset.busy;
}

window.addEventListener('DOMContentLoaded', () => { renderVoiceSettings(true); renderVoiceSelects(); });
