// --- ГОЛОСОВОЙ ВВОД (4.3: несколько голосовых помощников) ---
// Кнопка 🎤 в «Новой записи»: фраза вроде «потратил пять тысяч на продукты, молоко и хлеб» превращается в текст,
// из текста берутся сумма, валюта, категория, тип (доход/расход) и день («вчера»), остальное — в комментарий.
// Запись не сохраняется сама: поля заполняются, остаётся нажать «Доход» или «Расход».
// Кто превращает голос в текст — решает js/voiceengines.js (Gemini, Groq, OpenAI, Google, браузер, Whisper на устройстве;
// выбор — в «Новой записи» (большой размер блока) и в Настройках → «Голосовой ввод»). Здесь — разбор фразы и сам ввод.

let voiceSession = null;   // идёт запись или обработка: { phase, ctrl, cancelled }
let voiceLast = null;      // последний результат (для исправления фразы руками)

function voiceSupported() { return voiceBrowserSupported() || voiceMicSupported(); }

// ---------- Числа словами: русский, казахский, английский ----------
const VOICE_NUM = {};
function vnAdd(lang, type, value, words) { words.split(' ').forEach(w => { (VOICE_NUM[lang] = VOICE_NUM[lang] || {})[w] = { t: type, v: value }; }); }
// t: w — слагаемое, m — множитель тысяч/миллионов (умножает набранное), h — «сотня» (умножает набранное на 100)
(function () {
    const ru = (v, w) => vnAdd('ru', 'w', v, w);
    ru(0, 'ноль нуль'); ru(1, 'один одна одно одну одного одной'); ru(2, 'два две двух двум'); ru(3, 'три трех трем'); ru(4, 'четыре четырех');
    ru(5, 'пять пяти'); ru(6, 'шесть шести'); ru(7, 'семь семи'); ru(8, 'восемь восьми'); ru(9, 'девять девяти'); ru(10, 'десять десяти');
    ru(11, 'одиннадцать одиннадцати'); ru(12, 'двенадцать двенадцати'); ru(13, 'тринадцать тринадцати'); ru(14, 'четырнадцать четырнадцати');
    ru(15, 'пятнадцать пятнадцати'); ru(16, 'шестнадцать шестнадцати'); ru(17, 'семнадцать семнадцати'); ru(18, 'восемнадцать восемнадцати'); ru(19, 'девятнадцать девятнадцати');
    ru(20, 'двадцать двадцати'); ru(30, 'тридцать тридцати'); ru(40, 'сорок сорока'); ru(50, 'пятьдесят пятидесяти'); ru(60, 'шестьдесят шестидесяти');
    ru(70, 'семьдесят семидесяти'); ru(80, 'восемьдесят восьмидесяти'); ru(90, 'девяносто девяноста');
    ru(100, 'сто ста'); ru(200, 'двести двухсот'); ru(300, 'триста трехсот'); ru(400, 'четыреста четырехсот'); ru(500, 'пятьсот пятисот');
    ru(600, 'шестьсот шестисот'); ru(700, 'семьсот семисот'); ru(800, 'восемьсот восьмисот'); ru(900, 'девятьсот девятисот');
    ru(1.5, 'полтора полторы');
    ['тысяча тысячи тысяч тысячу тысячей тыс косарь косаря косарей', 'миллион миллиона миллионов млн'].forEach((w, i) => vnAdd('ru', 'm', i ? 1e6 : 1e3, w));
    const kk = (v, w) => vnAdd('kk', 'w', v, w);
    kk(0, 'нөл'); kk(1, 'бір'); kk(2, 'екі'); kk(3, 'үш'); kk(4, 'төрт'); kk(5, 'бес'); kk(6, 'алты'); kk(7, 'жеті'); kk(8, 'сегіз'); kk(9, 'тоғыз');
    kk(10, 'он'); kk(20, 'жиырма'); kk(30, 'отыз'); kk(40, 'қырық'); kk(50, 'елу'); kk(60, 'алпыс'); kk(70, 'жетпіс'); kk(80, 'сексен'); kk(90, 'тоқсан');
    vnAdd('kk', 'h', 100, 'жүз'); vnAdd('kk', 'm', 1e3, 'мың'); vnAdd('kk', 'm', 1e6, 'миллион млн');
    const en = (v, w) => vnAdd('en', 'w', v, w);
    en(0, 'zero'); en(1, 'one'); en(2, 'two'); en(3, 'three'); en(4, 'four'); en(5, 'five'); en(6, 'six'); en(7, 'seven'); en(8, 'eight'); en(9, 'nine'); en(10, 'ten');
    en(11, 'eleven'); en(12, 'twelve'); en(13, 'thirteen'); en(14, 'fourteen'); en(15, 'fifteen'); en(16, 'sixteen'); en(17, 'seventeen'); en(18, 'eighteen'); en(19, 'nineteen');
    en(20, 'twenty'); en(30, 'thirty'); en(40, 'forty'); en(50, 'fifty'); en(60, 'sixty'); en(70, 'seventy'); en(80, 'eighty'); en(90, 'ninety');
    vnAdd('en', 'h', 100, 'hundred'); vnAdd('en', 'm', 1e3, 'thousand grand'); vnAdd('en', 'm', 1e6, 'million');
})();

// Слово-валюта → код. Проверяется по началу слова; «руб» не должно ловить «рубашку»
const VOICE_CURRENCY_WORDS = [
    ['KZT', /^(тенге|теңге|тг|тнг|tenge|kzt|₸)$/], ['RUB', /^(рубл[а-я]*|руб|rub|rubles?|₽)$/], ['USD', /^(долл[а-я]*|бакс[а-я]*|usd|dollars?|bucks?|\$)$/], ['EUR', /^(евро|eur|euros?|€)$/]
];
function voiceCurrencyOf(word) { const hit = VOICE_CURRENCY_WORDS.find(([, re]) => re.test(word)); return hit ? hit[0] : ''; }
const VOICE_AMOUNT_TRIGGERS = new Set(['за', 'на', 'сумму', 'суммой', 'сумма', 'стоил', 'стоила', 'стоило', 'стоят', 'потратил', 'потратила', 'получил', 'получила', 'заплатил', 'заплатила',
    'оплатил', 'оплатила', 'итого', 'цена', 'ценой', 'купил', 'купила', 'for', 'spent', 'paid', 'cost', 'costs', 'received', 'earned', 'price', 'жұмсадым', 'төледім', 'алдым', 'бағасы']);

// Все числа во фразе: [{ value, wordOnly, currency, trigger, pos }]
function voiceNumberCandidates(text, langId) {
    const t = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
    const prep = t.replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1').replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1');
    const table = VOICE_NUM[langId] || (langId === 'fr' || langId === 'de' ? {} : VOICE_NUM.ru); // французский и немецкий — только цифры
    const re = /\d+(?:[.,]\d+)?|[a-zа-яәіңғүұқөһ][a-zа-яәіңғүұқөһ'’-]*|[$€₸₽]/g;
    const toks = [];
    let m;
    while ((m = re.exec(prep))) toks.push({ w: m[0], i: m.index, e: m.index + m[0].length });
    const cands = [];
    let run = null;
    const open = tok => (run = run || { total: 0, cur: 0, prev: '', words: 0, digits: 0, start: tok.i, end: tok.e, first: tok, trigger: false, currency: '' });
    const close = (nextIdx) => {
        if (run && (run.words || run.digits)) {
            const value = Math.round((run.total + run.cur) * 100) / 100;
            let currency = run.currency;
            const next = toks[nextIdx];
            if (!currency && next && next.i - run.end <= 2) currency = voiceCurrencyOf(next.w);
            const idx = toks.indexOf(run.first);
            if (!run.trigger) for (let k = Math.max(0, idx - 3); k < idx; k++) if (VOICE_AMOUNT_TRIGGERS.has(toks[k].w)) run.trigger = true;
            if (value > 0) cands.push({ value, wordOnly: !run.digits, currency, trigger: run.trigger, pos: run.start });
        }
        run = null;
    };
    toks.forEach((tok, k) => {
        const w = tok.w;
        if (/^\d/.test(w)) {
            if (run && run.prev === 'D') close(k);
            const r = open(tok);
            r.cur += parseFloat(w.replace(',', '.'));
            r.prev = 'D'; r.digits++; r.end = tok.e;
            const before = toks[k - 1];
            if (!r.currency && before && /^[$€₸₽]$/.test(before.w) && tok.i - before.e <= 1) r.currency = voiceCurrencyOf(before.w);
            return;
        }
        if (run && run.prev === 'D' && (w === 'к' || w === 'k') && tok.i === run.end) { run.total += run.cur * 1000; run.cur = 0; run.prev = 'M'; run.end = tok.e; return; }
        const e = table[w];
        if (e && e.t === 'w') {
            const r = open(tok);
            if (r.prev === 'W' && e.v < 10 && r.cur % 10 !== 0 && r.cur < 20) { close(k); open(tok); }
            run.cur += e.v; run.prev = 'W'; run.words++; run.end = tok.e;
            return;
        }
        if (e && e.t === 'm') {
            const r = open(tok);
            r.total += (r.cur || 1) * e.v; r.cur = 0; r.prev = 'M'; r.words++; r.end = tok.e;
            return;
        }
        if (e && e.t === 'h') {
            const r = open(tok);
            r.cur = (r.cur || 1) * e.v; r.prev = 'W'; r.words++; r.end = tok.e;
            return;
        }
        if (run && (w === 'и' || w === 'and') && run.prev) return; // «две тысячи и пятьсот»
        close(k);
        if (/^[$€₸₽]$/.test(w)) return;
    });
    close(toks.length);
    return cands;
}

// Сумма фразы: число рядом с названием валюты — важнее всего, затем число после «за», «на», «потратил»…, затем самое большое.
// «Одну», «три» словами без валюты — скорее обычные слова («купил одну булочку»), чем сумма, поэтому такие числа до 10 игнорируются.
function voiceAmount(text, langId) {
    const cands = voiceNumberCandidates(text, langId || 'ru');
    let best = null, bestScore = -1;
    cands.forEach(c => {
        if (c.wordOnly && c.value < 10 && !c.currency) return;
        const score = (c.currency ? 100 : 0) + (c.trigger ? 50 : 0) + (c.wordOnly ? 0 : 10) + Math.log10(c.value + 1);
        if (score > bestScore) { best = c; bestScore = score; }
    });
    return best ? { amount: best.value, currency: best.currency, raw: String(best.value) } : null;
}

// ---------- Остальное из фразы ----------
const VOICE_INCOME_RE = /(доход|получил|получила|заработал|заработала|зарплат|аванс|премия|пришл[иао]|вернули|кэшбэк|кешбэк|подарили|начислили|перевели мне|income|received|earned|salary|refund|cashback|got paid|кіріс|түсті|жалақы)/;
const VOICE_EXPENSE_RE = /(расход|потратил|потратила|купил|купила|заплатил|заплатила|оплатил|оплатила|отдал|отдала|снял|spent|bought|paid|шығын|жұмсадым|төледім|сатып алдым)/;
const VOICE_CATEGORY_GUESS = [
    [/продукт|молок|хлеб|магазин|супермаркет|овощ|фрукт|мясо|grocer|азық/, 'Продукты'], [/такси|бензин|заправк|автобус|метро|проезд|taxi|fuel|gas\b/, 'Такси'],
    [/кафе|ресторан|обед|ужин|завтрак|кофе|пицц|coffee|lunch|dinner/, 'Еда'], [/аптек|лекарств|врач|больниц|pharmac|doctor/, 'Здоровье'],
    [/одежд|обув|куртк|кроссовк|clothes|shoes/, 'Одежда'], [/зарплат|аванс|salary|жалақы/, 'Зарплата'], [/подарок|подарк|gift/, 'Подарки']
];

function voiceNormalize(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

// Категория: своя или стандартная — по первым буквам слова (учитывает окончания); иначе по смыслу
function voiceCategory(text, categories) {
    const lower = voiceNormalize(text);
    const cats = Array.isArray(categories) ? categories : [];
    let best = null;
    cats.forEach(c => {
        const norm = voiceNormalize(c), stem = norm.slice(0, Math.max(4, norm.length - 2));
        if (stem.length < 3) return;
        const idx = lower.search(new RegExp('(^|[^a-zа-яәіңғүұқөһ])' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (idx < 0) return;
        if (!best || stem.length > best.len || (stem.length === best.len && idx < best.idx)) best = { name: c, len: stem.length, idx };
    });
    if (best) return best.name;
    const hit = VOICE_CATEGORY_GUESS.find(([re]) => re.test(lower));
    return hit ? hit[1] : '';
}

function voiceTypeOf(text) {
    const lower = voiceNormalize(text), inc = lower.search(VOICE_INCOME_RE), exp = lower.search(VOICE_EXPENSE_RE);
    if (inc >= 0 && (exp < 0 || inc < exp)) return 'income';
    if (exp >= 0) return 'expense';
    return '';
}
function voiceDayOf(text) {
    const lower = voiceNormalize(text);
    if (/позавчера|day before yesterday/.test(lower)) return 2;
    if (/вчера|yesterday|кеше/.test(lower)) return 1;
    return 0;
}

// Фраза → поля записи (обычный разбор, без ИИ)
function voiceParseLocal(text, ctx) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    const amt = voiceAmount(clean, ctx && ctx.lang ? ctx.lang.id : 'ru');
    return { amount: amt ? amt.amount : 0, currency: amt ? amt.currency : '', type: voiceTypeOf(clean), category: voiceCategory(clean, ctx ? ctx.categories : []),
        comment: capitalizeRu(clean).slice(0, 100), day: voiceDayOf(clean) };
}

// Поля от ИИ проверяются; чего нет или что не подходит — берём из обычного разбора по тексту
function voiceFields(result, ctx) {
    const text = String(result.text || '').trim();
    const local = voiceParseLocal(text, ctx), ai = result.fields;
    if (!ai || typeof ai !== 'object') return { ...local, text, byAi: false };
    const amount = typeof ai.amount === 'number' ? ai.amount : parseFloat(String(ai.amount || '').replace(/\s/g, '').replace(',', '.'));
    const catName = String(ai.category || '').trim().toLowerCase();
    const cat = catName ? (ctx.categories || []).find(c => String(c).toLowerCase() === catName) : '';
    const comment = String(ai.comment || '').replace(/\s+/g, ' ').trim();
    const day = ai.day === 'yesterday' ? 1 : (ai.day === 'before_yesterday' ? 2 : (ai.day === 'today' ? 0 : local.day));
    return {
        text,
        amount: Number.isFinite(amount) && amount > 0 && amount < 1e9 ? Math.round(amount * 100) / 100 : local.amount,
        currency: ['KZT', 'USD', 'EUR', 'RUB'].includes(ai.currency) ? ai.currency : local.currency,
        type: ai.type === 'income' || ai.type === 'expense' ? ai.type : local.type,
        category: cat || local.category,
        comment: comment ? capitalizeRu(comment).slice(0, 100) : local.comment,
        day, byAi: true
    };
}

function voiceContext() {
    const lang = voiceLang();
    let categories = [];
    try { categories = allCategories(); } catch (e) {}
    const now = typeof almatyIsoNow === 'function' ? almatyIsoNow() : new Date().toISOString();
    return { lang, categories, today: now.slice(0, 10) };
}

// ---------- Что видит человек ----------
function voiceEls() { return { btn: document.getElementById('voice-btn'), live: document.getElementById('voice-live'), box: document.getElementById('voice-result') }; }
function voiceClock(sec) { const s = Math.floor(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function voiceSetButton(phase) {
    const { btn } = voiceEls();
    if (!btn) return;
    const listening = phase === 'listening', busy = phase === 'processing';
    btn.classList.toggle('is-listening', listening);
    btn.classList.toggle('is-busy', busy);
    btn.setAttribute('aria-pressed', String(listening));
    const label = btn.querySelector('.voice-label'), icon = btn.querySelector('.material-icons');
    const text = listening ? 'Слушаю… нажмите, чтобы закончить' : (busy ? 'Распознаю… нажмите, чтобы отменить' : 'Сказать голосом');
    if (label) label.textContent = text;
    if (icon) icon.textContent = listening ? 'stop' : (busy ? 'hourglass_top' : 'mic');
    btn.title = text; btn.setAttribute('aria-label', text);
}

// Интерфейс главного ввода: полоска «Слушаю…» с индикатором уровня над рядом кнопок
function voiceMainUi() {
    const { live } = voiceEls();
    let bars = [], textEl = null, engineName = '';
    const build = () => {
        if (!live) return;
        live.hidden = false;
        live.innerHTML = '<span class="voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="voice-live-text"></span>';
        bars = [...live.querySelectorAll('.voice-bars i')]; textEl = live.querySelector('.voice-live-text');
    };
    const say = t => { if (live && live.hidden) build(); if (textEl) textEl.textContent = t; };
    return {
        state(phase, info = {}) {
            voiceSetButton(phase);
            if (phase === 'idle') { if (live) { live.hidden = true; live.innerHTML = ''; } return; }
            if (!textEl || !live || live.hidden) build();
            if (info.engine) engineName = info.engine.name;
            live && live.classList.toggle('is-busy', phase === 'processing');
            if (phase === 'listening') say(info.stream ? `Говорите: «${voiceLang().sample}»` : `Слушаю… нажмите, чтобы закончить${engineName ? ' · ' + engineName : ''}`);
            else say(info.text || `Распознаю: ${engineName || '…'}`);
        },
        level(lv, sec) {
            if (!bars.length) return;
            bars.forEach((b, i) => { b.style.transform = `scaleY(${(0.16 + Math.min(1, lv * 1.15) * (0.5 + 0.5 * Math.abs(Math.sin(sec * 9 + i * 1.4)))).toFixed(2)})`; });
            if (textEl) textEl.textContent = `Слушаю… ${voiceClock(sec)} · нажмите, чтобы закончить${engineName ? ' · ' + engineName : ''}`;
        },
        interim(t) { say(t || `Говорите: «${voiceLang().sample}»`); },
        progress(t, p) { say(`${t}`); },
        note(t) { say(t); if (typeof showToast === 'function') showToast(t); }
    };
}
function voiceUiReset() { voiceSetButton('idle'); const { live } = voiceEls(); if (live) { live.hidden = true; live.innerHTML = ''; } }

// ---------- Ввод ----------
function voiceStopOrCancel() {
    const s = voiceSession;
    if (!s) return;
    if (s.phase === 'listening' && s.ctrl) s.ctrl.stop();
    else { s.cancelled = true; if (s.ctrl && s.ctrl.cancel) s.ctrl.cancel(); voiceUiReset(); }
}

// Слушает, распознаёт и разбирает фразу. ui — куда показывать ход дела. Результат:
// { text, parsed, engine, engineName, ms, tried }. Ошибка с code === 'cancelled' — человек сам отменил.
async function voiceRecognize({ ui, chosen = null } = {}) {
    const ctx = voiceContext(), prefs = voicePrefs();
    let chain = voiceChain(chosen);
    if (!chain.length) throw voiceError('none', 'Нет доступного помощника: впишите ключ в Настройках → «Голосовой ввод» или откройте приложение в Chrome / Safari.');
    const sess = { phase: 'listening', ctrl: null, cancelled: false };
    voiceSession = sess;
    const cancelled = () => voiceError('cancelled', 'Запись отменена', true);
    const tried = [];
    const finish = async (r, engine, ms) => {
        if (sess.cancelled) throw cancelled();
        let text = String(r.text || '').trim(), fields = r.fields || null, extra = '';
        if (!text && !fields) throw voiceError('empty', 'ничего не распознано');
        if (!fields && text) {
            const aiId = voiceParseAiPick();
            if (aiId) {
                const aiName = (VOICE_PARSE_AI.find(a => a.id === aiId) || {}).name || aiId;
                sess.phase = 'processing';
                ui.state('processing', { engine, text: `Уточняю фразу: ${aiName}…` });
                try {
                    fields = await voiceAiParse(text, ctx, aiId);
                    if (fields && fields.text && String(fields.text).trim()) text = String(fields.text).trim();
                    extra = ' + ' + aiName.replace(/ \(.*\)$/, '');
                } catch (err) { console.warn('Разбор фразы ИИ не удался', err); fields = null; }
            }
        }
        if (sess.cancelled) throw cancelled();
        const parsed = voiceFields({ text, fields }, ctx);
        return { text: parsed.text || text, parsed, engine: engine.id, engineName: engine.name + extra, ms, tried, byAi: parsed.byAi };
    };
    try {
        while (chain.length) {
            if (sess.cancelled) throw cancelled();
            const first = voiceEngine(chain[0]);
            if (first.stream) { // браузерное распознавание: текст появляется по ходу речи
                ui.state('listening', { engine: first, stream: true });
                try {
                    const ctrl = voiceListenBrowser({ lang: ctx.lang, onInterim: t => ui.interim(t) });
                    sess.ctrl = ctrl;
                    const r = await ctrl.done;
                    sess.ctrl = null; sess.phase = 'processing';
                    return await finish({ text: r.text }, first, 0);
                } catch (err) {
                    sess.ctrl = null;
                    if (sess.cancelled || err.fatal) throw err;
                    tried.push(`${first.name}: ${err.message}`);
                    chain = chain.slice(1).filter(id => !voiceEngine(id).stream);
                    if (!chain.length) throw voiceError('all', tried.join('; '));
                    if (ui.note) ui.note(`Браузерное распознавание не сработало (${err.message}). Скажите ещё раз — запишу звук.`);
                    continue;
                }
            }
            // запись звука для ИИ, веб-сервисов и Whisper
            ui.state('listening', { engine: first, stream: false });
            let clip;
            try {
                const cap = await voiceCapture({ autoStop: prefs.autoStop, onLevel: (lv, sec) => ui.level(lv, sec) });
                sess.ctrl = cap;
                if (sess.cancelled) cap.cancel();
                clip = await cap.done;
            } catch (err) {
                sess.ctrl = null;
                if (sess.cancelled || err.fatal) throw err;
                tried.push(`Запись звука: ${err.message}`);
                chain = chain.filter(id => voiceEngine(id).stream); // без записи остаётся только браузерное распознавание
                if (!chain.length) throw voiceError('all', tried.join('; '));
                continue;
            }
            sess.ctrl = null; sess.phase = 'processing';
            if (sess.cancelled) throw cancelled();
            if (clip.reason === 'nospeech' && !clip.heard) throw voiceError('nospeech', 'Ничего не услышал — попробуйте ещё раз ближе к микрофону.', true);
            for (const id of chain.filter(x => !voiceEngine(x).stream)) {
                if (sess.cancelled) throw cancelled();
                const engine = voiceEngine(id), t0 = Date.now();
                ui.state('processing', { engine });
                try {
                    const r = await voiceRunEngine(id, clip, ctx, (t, p) => ui.progress(t, p));
                    return await finish(r, engine, Date.now() - t0);
                } catch (err) {
                    if (sess.cancelled || err.code === 'cancelled') throw cancelled();
                    if (err.fatal) throw err; // слишком коротко или тихо — другие помощники не помогут
                    console.warn('Голосовой ввод:', id, err);
                    tried.push(`${engine.name}: ${err.message}`);
                    if (typeof adminLog === 'function') adminLog('voice_fail', { engine: id, code: err.code || '' });
                }
            }
            throw voiceError('all', tried.join('; ') || 'ни один помощник не сработал');
        }
        throw voiceError('none', 'Нет доступного помощника.');
    } finally {
        if (voiceSession === sess) voiceSession = null;
    }
}

async function toggleVoiceInput() {
    if (voiceSession) { voiceStopOrCancel(); return; }
    const ui = voiceMainUi();
    if (!voiceSupported()) {
        alert('Этот браузер не умеет ни распознавать речь, ни записывать звук. Откройте приложение в Chrome (Android, ПК) или Safari (iPhone, iOS 14.5+).');
        return;
    }
    if (typeof playSound === 'function') playSound('open');
    try {
        const r = await voiceRecognize({ ui });
        voiceUiReset();
        voiceApply(r);
        if (typeof playSound === 'function') playSound('success');
        if (typeof adminLog === 'function') adminLog('voice', { engine: r.engine, ms: r.ms, ok: r.parsed.amount > 0 });
    } catch (err) {
        voiceUiReset();
        if (err && err.code === 'cancelled') return;
        console.warn('Голосовой ввод не удался', err);
        if (typeof showToast === 'function') showToast(err && err.message ? err.message : 'Голосовой ввод не удался');
        if (typeof adminLog === 'function') adminLog('voice_fail', { engine: (err && err.engine) || '', code: (err && err.code) || '' });
    }
}

// Заполняет форму «Новая запись»
function voiceApply(result) {
    const p = result.parsed;
    voiceLast = result;
    const amountEl = document.getElementById('amount'), catEl = document.getElementById('category'), dtEl = document.getElementById('tx-datetime');
    if (p.currency && p.currency !== 'KZT' && typeof setTxCurrency === 'function') setTxCurrency(p.currency);
    else if (p.currency === 'KZT' && typeof setTxCurrency === 'function' && typeof txCurrency === 'function' && txCurrency() !== 'KZT') setTxCurrency('KZT');
    if (p.amount && amountEl) {
        const cur = typeof txCurrency === 'function' ? txCurrency() : 'KZT';
        amountEl.value = cur === 'KZT' ? Math.round(p.amount) : p.amount;
        amountEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (p.category && catEl) { catEl.value = p.category; if (typeof renderCategoryTiles === 'function') renderCategoryTiles(); }
    if (p.day && dtEl && typeof almatyIsoNow === 'function') dtEl.value = almatyIsoNow(-p.day);
    if (typeof setFormComment === 'function') setFormComment('tx', p.comment || capitalizeRu(result.text).slice(0, 100));
    voiceShowResult(result);
    const guess = p.type || 'expense';
    const btn = document.querySelector(guess === 'income' ? '#add-btns .btn-income' : '#add-btns .btn-expense');
    if (btn) { btn.classList.add('voice-suggest'); setTimeout(() => btn.classList.remove('voice-suggest'), 4000); }
}

function voiceShowResult(result) {
    const { box } = voiceEls();
    if (!box) return;
    const p = result.parsed, sym = p.currency && typeof TX_CURRENCIES !== 'undefined' && TX_CURRENCIES[p.currency] ? TX_CURRENCIES[p.currency].sign : '₸';
    const typeName = p.type === 'income' ? 'доход' : 'расход';
    box.hidden = false;
    box.innerHTML = `<span class="material-icons">record_voice_over</span>
        <span class="voice-res-body">
            <span class="voice-res-head"><b data-i18n-skip>${escapeHtml(result.engineName)}</b>${result.ms ? `<span class="voice-res-ms">${voiceFmtSec(result.ms)}</span>` : ''}${p.day ? `<span class="voice-res-ms">${p.day === 1 ? 'вчера' : 'позавчера'}</span>` : ''}</span>
            <input type="text" class="voice-res-text" maxlength="160" value="${escapeHtml(result.text)}" onchange="voiceReparse(this.value)" aria-label="Распознанная фраза — можно исправить" title="Можно исправить: сумма и категория пересчитаются">
            <small>${p.amount ? 'Сумма: ' + p.amount.toLocaleString('ru-RU') + ' ' + sym + '. ' : 'Сумму не услышал — впишите её. '}${p.category ? 'Категория: ' + escapeHtml(p.category) + '. ' : ''}${p.type ? `Похоже на ${typeName} — нажмите «${p.type === 'income' ? 'Доход' : 'Расход'}».` : 'Доход или расход — нажмите нужную кнопку (обычно это расход).'}</small>
        </span>
        <button type="button" class="voice-res-retry" onclick="toggleVoiceInput()" title="Сказать ещё раз" aria-label="Сказать ещё раз"><span class="material-icons">replay</span></button>`;
}

// Человек поправил фразу руками: сумма, категория и тип пересчитываются обычным разбором
function voiceReparse(text) {
    const ctx = voiceContext(), clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const base = voiceLast || { engine: 'manual', engineName: 'Вручную', ms: 0, tried: [] };
    voiceApply({ ...base, text: clean, parsed: { ...voiceFields({ text: clean }, ctx), text: clean }, ms: 0 });
}
