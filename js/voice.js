// --- ГОЛОСОВОЙ ВВОД (пока только русский) ---
// Кнопка 🎤 в «Новой записи»: фраза вроде «потратил пять тысяч на продукты, молоко и хлеб» превращается в текст
// (распознавание речи браузера — Web Speech API; в Chrome звук распознают серверы Google), из текста
// берутся сумма, категория и тип (доход/расход), остальное — в комментарий. Запись не сохраняется сама:
// поля заполняются, остаётся нажать «Доход» или «Расход».

const VOICE_INCOME_RE = /(доход|получил|получила|заработал|заработала|зарплат|аванс|премия|пришл[иао]|вернули|кэшбэк|кешбэк)/i;
const VOICE_NUM_WORDS = { 'ноль': 0, 'один': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9,
    'десять': 10, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90,
    'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400, 'пятьсот': 500, 'шестьсот': 600, 'семьсот': 700, 'восемьсот': 800, 'девятьсот': 900,
    'полтора': 1.5, 'полторы': 1.5 };

let voiceRec = null;
let voiceFinal = '';

function voiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// «пять тысяч двести» → 5200; «5 тыс» → 5000; «2,5 миллиона» → 2500000
function voiceAmount(text) {
    let t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
    t = t.replace(/(\d)[\s ](?=\d{3}\b)/g, '$1'); // «5 000» → «5000»
    const digit = t.match(/(\d+(?:[.,]\d+)?)\s*(тысяч[а-я]*|тыс\.?|к(?![а-я])|миллион[а-я]*|млн)?/);
    if (digit) {
        let n = parseFloat(digit[1].replace(',', '.'));
        if (digit[2]) n *= /милл|млн/.test(digit[2]) ? 1e6 : 1000;
        return { amount: Math.round(n), raw: digit[0].trim() };
    }
    // числа словами
    const words = t.split(/[^а-я]+/).filter(Boolean);
    let total = 0, cur = 0, used = [];
    words.forEach(w => {
        if (VOICE_NUM_WORDS[w] !== undefined) { cur += VOICE_NUM_WORDS[w]; used.push(w); }
        else if (/^тысяч/.test(w)) { total += (cur || 1) * 1000; cur = 0; used.push(w); }
        else if (/^миллион/.test(w)) { total += (cur || 1) * 1e6; cur = 0; used.push(w); }
    });
    total += cur;
    return total > 0 ? { amount: Math.round(total), raw: used.join(' ') } : null;
}

// Категория: известная (свои, стандартные) по первым буквам слов
function voiceCategory(text) {
    const lower = text.toLowerCase().replace(/ё/g, 'е');
    const cats = typeof allCategories === 'function' ? allCategories(categoryOptions.concat(typeof OB_DEFAULT_CATEGORIES !== 'undefined' ? OB_DEFAULT_CATEGORIES : [])) : [];
    for (const c of cats) {
        const stem = c.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(4, c.length - 2));
        if (stem.length >= 3 && new RegExp('(^|[^а-я])' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(lower)) return c;
    }
    // по смыслу (те же правила, что у картинок категорий)
    const guess = [[/продукт|молок|хлеб|магазин|супермаркет/, 'Продукты'], [/такси|бензин|заправк/, 'Такси'], [/кафе|ресторан|обед|ужин|кофе/, 'Еда'],
        [/аптек|лекарств|врач/, 'Здоровье'], [/одежд|обув/, 'Одежда'], [/зарплат|аванс/, 'Зарплата'], [/подарок|подарк/, 'Подарки']];
    const hit = guess.find(([re]) => re.test(lower));
    return hit ? hit[1] : '';
}

function voiceApply(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const amt = voiceAmount(clean);
    const cat = voiceCategory(clean);
    const income = VOICE_INCOME_RE.test(clean);
    const amountEl = document.getElementById('amount');
    const catEl = document.getElementById('category');
    if (amt && amountEl) { amountEl.value = amt.amount; amountEl.dispatchEvent(new Event('input', { bubbles: true })); }
    if (cat && catEl) { catEl.value = cat; if (typeof renderCategoryTiles === 'function') renderCategoryTiles(); }
    if (typeof setFormComment === 'function') setFormComment('tx', capitalizeRu(clean).slice(0, 100));
    const box = document.getElementById('voice-result');
    if (box) {
        box.hidden = false;
        box.innerHTML = `<span class="material-icons">record_voice_over</span><span>«${escapeHtml(clean)}»<br>` +
            `<small>${amt ? 'Сумма: ' + amt.amount.toLocaleString('ru-RU') + ' ₸. ' : 'Сумму не услышал — впишите её. '}${cat ? 'Категория: ' + escapeHtml(cat) + '. ' : ''}` +
            `Похоже на ${income ? 'доход' : 'расход'} — нажмите «${income ? 'Доход' : 'Расход'}».</small></span>`;
    }
    const btn = document.querySelector(income ? '#add-btns .btn-income' : '#add-btns .btn-expense');
    if (btn) { btn.classList.add('voice-suggest'); setTimeout(() => btn.classList.remove('voice-suggest'), 4000); }
}

function setVoiceState(listening, interim = '') {
    const btn = document.getElementById('voice-btn');
    const live = document.getElementById('voice-live');
    if (btn) {
        btn.classList.toggle('is-listening', listening);
        btn.setAttribute('aria-pressed', String(listening));
        const label = btn.querySelector('.voice-label');
        if (label) label.textContent = listening ? 'Слушаю… нажмите, чтобы закончить' : 'Сказать голосом';
    }
    if (live) { live.hidden = !listening; live.textContent = interim || (listening ? 'Говорите: «потратил 5000 на продукты»' : ''); }
}

function toggleVoiceInput() {
    if (voiceRec) { voiceRec.stop(); return; }
    if (!voiceSupported()) {
        alert('Этот браузер не умеет распознавать речь. Откройте приложение в Chrome (Android, ПК) или Safari (iPhone, iOS 14.5+).');
        return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    voiceFinal = '';
    rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) voiceFinal += e.results[i][0].transcript + ' ';
            else interim += e.results[i][0].transcript;
        }
        setVoiceState(true, (voiceFinal + interim).trim());
    };
    rec.onerror = e => {
        const msg = { 'not-allowed': 'Нет доступа к микрофону — разрешите его для сайта (значок замка в адресной строке).', 'no-speech': 'Ничего не услышал — попробуйте ещё раз ближе к микрофону.',
            'network': 'Для распознавания речи нужен интернет.', 'audio-capture': 'Микрофон не найден.' }[e.error];
        if (msg) showToast(msg);
    };
    rec.onend = () => {
        voiceRec = null;
        setVoiceState(false);
        if (voiceFinal.trim()) { voiceApply(voiceFinal); if (typeof playSound === 'function') playSound('success'); }
    };
    try {
        rec.start();
        voiceRec = rec;
        setVoiceState(true);
        if (typeof playSound === 'function') playSound('open');
    } catch (e) {
        voiceRec = null;
        alert('Не удалось включить микрофон: ' + (e.message || e));
    }
}
