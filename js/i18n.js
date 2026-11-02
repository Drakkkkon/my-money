// --- ЯЗЫКИ ПРИЛОЖЕНИЯ ---
// Русский — язык исходного текста. Остальные: English, Қазақша, Français, Deutsch — словари js/lang/<язык>.js
// (ключ — русская строка, значение — перевод; {0}, {1} — подставляемые значения), и «дореформенный русский» —
// русский текст, переписанный по правилам орфографии до 1918 года (ѣ, і, ъ на конце слов).
// Перевод накладывается на страницу целиком: тексты, кнопки, подсказки (placeholder, title, aria-label),
// окна alert/confirm/prompt и подписи диаграмм. Новые блоки, которые рисует приложение, переводятся сразу
// (MutationObserver). Данные пользователя (категории, комментарии, названия товаров и т. п.) не переводятся.
// Язык хранится на устройстве; при смене страница перезагружается.

const LANG_KEY = 'finance_lang';
const APP_LANGS = [
    { id: 'ru', name: 'Русский', locale: 'ru-RU' },
    { id: 'ru-old', name: 'Русскій дореволюціонный (старый слогъ)', locale: 'ru-RU', html: 'ru' },
    { id: 'en', name: 'English', locale: 'en-GB' },
    { id: 'kk', name: 'Қазақша', locale: 'kk-KZ' },
    { id: 'fr', name: 'Français', locale: 'fr-FR' },
    { id: 'de', name: 'Deutsch', locale: 'de-DE' }
];

let appLang = 'ru';
try { appLang = localStorage.getItem(LANG_KEY) || 'ru'; } catch (e) {}
if (!APP_LANGS.some(l => l.id === appLang)) appLang = 'ru';
const appLangInfo = APP_LANGS.find(l => l.id === appLang);
window.APP_LOCALE = appLangInfo.locale;
// Казахский: не во всех браузерах есть названия месяцев и дней недели — тогда берём русские и заменяем
if (appLang === 'kk') {
    let kkOk = false;
    try { kkOk = /қараша|қазан/i.test(new Intl.DateTimeFormat('kk-KZ', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 15)))); } catch (e) {}
    if (!kkOk) {
        window.APP_LOCALE = 'ru-RU';
        const KK_WORDS = [
            ['январ[ьяе]', 'қаңтар'], ['феврал[ьяе]', 'ақпан'], ['март[ае]?', 'наурыз'], ['апрел[ьяе]', 'сәуір'], ['ма[йяе]', 'мамыр'], ['июн[ьяе]', 'маусым'],
            ['июл[ьяе]', 'шілде'], ['август[ае]?', 'тамыз'], ['сентябр[ьяе]', 'қыркүйек'], ['октябр[ьяе]', 'қазан'], ['ноябр[ьяе]', 'қараша'], ['декабр[ьяе]', 'желтоқсан'],
            ['янв\\.?', 'қаң.'], ['февр?\\.?', 'ақп.'], ['апр\\.?', 'сәу.'], ['июн\\.?', 'мау.'], ['июл\\.?', 'шіл.'], ['авг\\.?', 'там.'], ['сент?\\.?', 'қыр.'], ['окт\\.?', 'қаз.'], ['нояб?\\.?', 'қар.'], ['дек\\.?', 'жел.'],
            ['понедельник', 'дүйсенбі'], ['вторник', 'сейсенбі'], ['среда', 'сәрсенбі'], ['четверг', 'бейсенбі'], ['пятница', 'жұма'], ['суббота', 'сенбі'], ['воскресенье', 'жексенбі'],
            ['пн', 'дс'], ['вт', 'сс'], ['ср', 'ср'], ['чт', 'бс'], ['пт', 'жм'], ['сб', 'сн'], ['вс', 'жс'], ['г\\.', 'ж.']
        ].map(([ru, kk]) => [new RegExp('(^|[^а-яё])' + ru + '(?![а-яё])', 'gi'), kk]);
        window.APP_DATE_FIX = s => {
            let out = s;
            KK_WORDS.forEach(([re, kk]) => {
                out = out.replace(re, (m, pre) => {
                    const w = m.slice(pre.length);
                    return pre + (w[0] && w[0] !== w[0].toLowerCase() ? kk[0].toUpperCase() + kk.slice(1) : kk);
                });
            });
            return out;
        };
    }
}
document.documentElement.lang = appLangInfo.html || appLang;

// Словарь подгружается сразу, пока страница ещё читается (до запуска остальных скриптов)
window.I18N_DICT = window.I18N_DICT || null;
if (['en', 'kk', 'fr', 'de'].includes(appLang)) {
    document.write('<script src="js/lang/' + appLang + '.js"><\/script>');
}

const I18N_CYR = /[А-Яа-яЁё]/;
// Блоки с данными пользователя — их не переводим
const I18N_SKIP = [
    'script', 'style', 'textarea', '.material-icons', '[data-i18n-skip]', 'datalist',
    '.tx-cat', '.tx-comment', '.goal-title', '.shop-name > span', '.pr-row-main > b', '.q-name > span', '.cat-chip-name',
    '.cat-tiles', '.icon-cat-name', '.dropdown-item:not(.dropdown-add)', '.sound-lib-info > b', '.ob-list', '.ob-why-list',
    '#user-email-display', '.receipt-item', '.receipt-raw', '.sub-info > strong', '.cat-list', '#ob-filter-person',
    '.theme-swatch.is-custom .theme-swatch-name', '.goal-draft-fields', '#salary-list strong', '.ob-person', '.import-preview td',
    '.price-table td:first-child', '.pr-row-main', '.shop-name > small:not(.shop-last)', '#profile-name', '.custom-categories', '.tf-panel-title', '.theme-folder.is-user .tf-name'
].join(', ');

// ---------- Дореформенная орфография ----------
// Упрощённые правила: ё → е; і перед гласной и й; ъ после согласной на конце слова; ѣ в частых корнях;
// «бес-» → «без-». Склонения на -ѣ и -аго не меняются (для интерфейса этого достаточно).
const OLD_YAT_ROOTS = [
    'бѣл', 'бѣд', 'бѣг', 'бѣж', 'вѣр', 'вѣт', 'вмѣст', 'гдѣ', 'дѣл', 'дѣти', 'дѣтей', 'дѣтск', 'дѣйств', 'звѣзд', 'лѣв', 'лѣс', 'лѣт', 'лѣкар',
    'мѣн', 'мѣр', 'мѣс', 'мѣст', 'мѣш', 'нѣт', 'нѣск', 'обѣд', 'побѣд', 'орѣх', 'пѣсн', 'рѣдк', 'рѣч', 'рѣш', 'сѣв',
    'свѣт', 'свѣж', 'сѣр', 'смѣн', 'смѣт', 'тѣл', 'тѣн', 'цѣл', 'цѣн', 'успѣ', 'хлѣб', 'ѣда', 'ѣду', 'ѣды', 'ѣдой', 'ѣх', 'ѣзд', 'послѣ',
    'сѣт', 'стѣн', 'слѣд', 'совѣт', 'отвѣт', 'привѣт', 'запрѣт', 'недѣл', 'лѣн', 'бесѣд', 'свидѣт', 'увѣд', 'вѣдом', 'намѣр', 'измѣр', 'размѣр', 'смѣл'
];
// корень с ѣ → регулярное выражение по началу слова или после приставки
const OLD_YAT_RE = OLD_YAT_ROOTS.map(r => {
    const plain = r.replace(/ѣ/g, 'е');
    return [new RegExp('(^|[^а-яё])((?:не|по|на|за|о|об|от|пере|при|про|раз|рас|с|у|в|вы|до|из|под|пред|без|бес)?)' + plain, 'gi'), r];
});
const OLD_EXCEPT = /^(тем[аыеуо]|темой|метро|телефон|текст|центр|сервис|интернет|экран|секунд|систем|меню|ресторан|кредит|интерес|тенге|верх|редакт|результ|менеджер|деталь|детал|сцен|пенси|двер)/i;

// ---------- «Старый слог»: нарочито вычурные слова вместо современных ----------
// Сначала слова заменяются (длинные фразы — раньше коротких), затем текст переписывается старой орфографией.
const OLD_STYLE_WORDS = [
    ['доброе утро', 'доброе утро, сударь'], ['добрый день', 'добраго дня, сударь'], ['добрый вечер', 'добраго вечера, сударь'],
    ['доброй ночи', 'покойной ночи, сударь'], ['добро пожаловать', 'милости просимъ'], ['разблокируйте', 'извольте отомкнуть'],
    ['история операций', 'лѣтопись дѣяній'], ['новая запись', 'новая грамота'], ['текущий баланс', 'нынѣшняя казна'],
    ['дневной лимит', 'дневное довольствіе'], ['список покупок', 'роспись закупокъ'], ['чек по фото', 'квитанція по дагерротипу'],
    ['темы оформления', 'обличья'], ['сохранить изменения', 'сберечь исправленія'], ['потому что', 'ибо'], ['не удалось', 'не вышло, увы'],
    ['мой банк', 'мой банкирскій домъ'], ['приоритетные цели', 'первѣйшія чаянія'], ['потрачено сегодня', 'издержано нынче'],
    ['записи', 'грамоты'], ['запись', 'грамота'], ['записей', 'грамотъ'], ['подписки', 'подписныя повинности'], ['подписка', 'подписная повинность'],
    ['зарплата', 'жалованье'], ['зарплату', 'жалованье'], ['статистика', 'счисленія'], ['отчёты', 'донесенія'], ['отчеты', 'донесенія'],
    ['цели', 'чаянія'], ['цель', 'чаяніе'], ['котировки', 'биржевыя вѣдомости'], ['цены', 'расцѣнки'], ['настройки', 'уставъ'],
    ['стена', 'стѣна почёта'], ['баланс', 'казна'], ['копилка', 'кубышка'], ['доходы', 'прибытки'], ['доход', 'прибытокъ'],
    ['расходы', 'издержки'], ['расход', 'издержка'], ['деньги', 'ассигнаціи'], ['добавить', 'присовокупить'], ['удалить', 'предать забвенію'],
    ['сохранить', 'сберечь'], ['отмена', 'отставить'], ['готово', 'исполнено'], ['закрыть', 'затворить'], ['открыть', 'отворить'],
    ['загрузить', 'испросить'], ['скачать', 'забрать'], ['нажмите', 'соизвольте нажать'], ['введите', 'извольте вписать'],
    ['выберите', 'соизвольте избрать'], ['выбрать', 'избрать'], ['найти', 'сыскать'], ['поиск', 'сыскъ'], ['не найдена', 'не сыскана'],
    ['не найдено', 'не сыскано'], ['найдено', 'сыскано'], ['очень', 'зѣло'], ['это', 'сіе'], ['этот', 'сей'], ['эта', 'сія'], ['эти', 'сіи'],
    ['сейчас', 'нынѣ'], ['теперь', 'отнынѣ'], ['сегодня', 'нынче'], ['вчера', 'намедни'], ['если', 'ежели'], ['можно', 'дозволено'],
    ['нельзя', 'не дозволено'], ['пока', 'покамѣстъ'], ['ещё', 'паки'], ['еще', 'паки'], ['только', 'токмо'], ['ошибка', 'оплошность'],
    ['телефон', 'телефонный аппаратъ'], ['телефоне', 'телефонномъ аппаратѣ'], ['интернет', 'всемірная паутина'], ['интернета', 'всемірной паутины'],
    ['кнопка', 'рычагъ'], ['кнопки', 'рычаги'], ['кнопку', 'рычагъ'], ['меню', 'перечень'], ['звуки', 'звоны'], ['шрифты', 'литеры'],
    ['язык', 'нарѣчіе'], ['уведомления', 'извѣщенія'], ['неделя', 'седмица'], ['неделю', 'седмицу'], ['недели', 'седмицы'],
    ['категория', 'разрядъ'], ['категории', 'разряды'], ['категорию', 'разрядъ'], ['комментарий', 'примѣчаніе'], ['магазин', 'лавка'],
    ['магазина', 'лавки'], ['покупки', 'закупки'], ['профиль', 'персона'], ['безопасность', 'охраненіе'], ['синхронизировать', 'свѣрить съ облакомъ'],
    ['выйти', 'откланяться'], ['спасибо', 'премного благодарны'], ['пожалуйста', 'извольте'], ['фото', 'дагерротипъ'], ['камера', 'фотографическій аппаратъ'],
    ['чек', 'квитанція'], ['чека', 'квитанціи'], ['калькулятор', 'счёты'], ['книга', 'фоліантъ'], ['книги', 'фоліанты'], ['книгу', 'фоліантъ'],
    ['обновить', 'освѣжить'], ['приложение', 'механизмъ'], ['приложения', 'механизма'], ['данные', 'свѣдѣнія'], ['файл', 'свитокъ'],
    ['папка', 'ларецъ'], ['папку', 'ларецъ'], ['папки', 'ларцы'], ['свернуть', 'свить'], ['развернуть', 'развить']
].sort((a, b) => b[0].length - a[0].length)
    .map(([w, old]) => [new RegExp('(^|[^а-яёіѣ])(' + w.replace(/ /g, '\\s+') + ')(?![а-яёіѣ])', 'gi'), old]);

function toOldStyle(text) {
    // уже переписанный текст (есть ѣ, і, ъ на конце или «сударь») второй раз не трогаем
    if (/[ѣіѲѳѢІ]|ъ(?![а-яё])|сударь/i.test(text)) return text;
    let out = text;
    OLD_STYLE_WORDS.forEach(([re, old]) => {
        out = out.replace(re, (m, pre, word) => {
            if (word === word.toUpperCase() && word.length > 1) return pre + old.toUpperCase();
            return pre + (word[0] !== word[0].toLowerCase() ? old[0].toUpperCase() + old.slice(1) : old);
        });
    });
    return out;
}

function toOldOrthography(text) {
    // слово — вместе со старыми буквами ѣ, і, ѳ, ѵ (иначе «покамѣстъ» разбился бы на части)
    return text.replace(/[А-Яа-яЁёѢѣІіѲѳѴѵ]+/g, word => {
        if (OLD_EXCEPT.test(word)) return word.replace(/ё/g, 'е').replace(/Ё/g, 'Е') + (/[бвгджзклмнпрстфхцчшщ]$/i.test(word) ? (word === word.toUpperCase() && word.length > 1 ? 'Ъ' : 'ъ') : '');
        let w = word.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
        // ѣ в корнях (с сохранением регистра первой буквы)
        for (const [re, root] of OLD_YAT_RE) {
            w = w.replace(re, (m, pre, prefix) => {
                const body = m.slice(pre.length + prefix.length);
                let rep = root;
                if (body[0] && body[0] !== body[0].toLowerCase()) rep = rep[0].toUpperCase() + rep.slice(1);
                return pre + prefix + rep;
            });
        }
        // і перед гласной и й
        w = w.replace(/и(?=[аеёиоуыэюяйѣ])/g, 'і').replace(/И(?=[аеёиоуыэюяйѣАЕЁИОУЫЭЮЯЙ])/g, 'І');
        // приставка бес- → без-
        w = w.replace(/^(Б|б)ес(?=[кпстфхцчшщ])/, '$1ез');
        // ъ на конце после согласной; сокращения без гласных («Пн», «г») — без ъ, кроме предлогов в, к, с
        const hasVowel = /[аеёиоуыэюяіѣ]/i.test(w) || /^[вкс]$/i.test(w);
        if (hasVowel && /[бвгджзклмнпрстфхцчшщ]$/i.test(w)) w += (w.length > 1 && w === w.toUpperCase()) ? 'Ъ' : 'ъ';
        return w;
    });
}

// ---------- Поиск перевода ----------
const i18nCache = new Map();
let i18nTemplates = null;

function i18nBuildTemplates() {
    i18nTemplates = [];
    const dict = window.I18N_DICT || {};
    Object.keys(dict).forEach(k => {
        if (!/\{\d+\}/.test(k)) return;
        const parts = k.split(/(\{\d+\})/);
        let src = '^';
        const order = [];
        parts.forEach(p => {
            const m = p.match(/^\{(\d+)\}$/);
            if (m) { src += '([\\s\\S]+?)'; order.push(Number(m[1])); }
            else src += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        });
        const literal = k.replace(/\{\d+\}/g, '');
        if (literal.replace(/[^А-Яа-яЁё]/g, '').length < 3) return; // шаблон почти без текста ловил бы что угодно
        i18nTemplates.push({ re: new RegExp(src + '$'), order, key: k });
    });
    // сначала длинные (точные) шаблоны
    i18nTemplates.sort((a, b) => b.key.length - a.key.length);
}

function i18nLookup(core, depth) {
    const dict = window.I18N_DICT;
    if (!dict) return null;
    if (Object.prototype.hasOwnProperty.call(dict, core) && dict[core]) return dict[core];
    if (!i18nTemplates) i18nBuildTemplates();
    for (const tpl of i18nTemplates) {
        const m = core.match(tpl.re);
        if (!m) continue;
        const tr = dict[tpl.key];
        if (!tr) continue;
        const vals = [];
        tpl.order.forEach((idx, i) => { vals[idx] = m[i + 1]; });
        return tr.replace(/\{(\d+)\}/g, (_, i) => {
            const v = vals[Number(i)];
            if (v === undefined) return '';
            return depth < 2 && I18N_CYR.test(v) ? translateText(v, depth + 1) : v;
        });
    }
    return null;
}

// Перевод строки (с сохранением пробелов по краям). Без перевода — исходный текст.
function translateText(text, depth = 0) {
    if (appLang === 'ru' || text == null) return text;
    const s = String(text);
    if (!I18N_CYR.test(s)) return s;
    if (appLang === 'ru-old') {
        if (i18nCache.has(s)) return i18nCache.get(s);
        const old = toOldOrthography(toOldStyle(s));
        if (i18nCache.size < 5000) i18nCache.set(s, old);
        return old;
    }
    if (i18nCache.has(s)) return i18nCache.get(s);
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2].replace(/[ \t ]*\n[ \t ]*/g, '\n');
    let res = null;
    const flat = core.replace(/\s+/g, ' ');
    if (core.includes('\n') && depth < 3) {
        // многострочные сообщения (alert, confirm): построчно, с сохранением переносов
        const lines = core.split('\n');
        const tr = lines.map(line => line.trim() ? translateText(line, depth + 1) : line);
        if (tr.some((l, i) => l !== lines[i])) {
            const out = m[1] + tr.join('\n') + m[3];
            if (i18nCache.size < 5000) i18nCache.set(s, out);
            return out;
        }
    }
    res = i18nLookup(flat, depth);
    if (res === null) {
        // «Цифры баланса:» → «Цифры баланса» + «:»
        const p = flat.match(/^([\s\S]*?[^\s:.!?…])(\s*[:.!?…]+)$/);
        if (p) { const r = i18nLookup(p[1], depth); if (r !== null) res = r + p[2]; }
    }
    if (res === null && /^[а-яё]/.test(flat)) {
        // «за 1 день» → ключ «За 1 день», первая буква перевода — строчная
        const r = i18nLookup(flat[0].toUpperCase() + flat.slice(1), depth);
        if (r !== null) res = r[0].toLowerCase() + r.slice(1);
    }
    if (res === null && /^[А-ЯЁ][а-яё]/.test(flat)) {
        // «Каждый день» → ключ «каждый день», первая буква перевода — заглавная
        const r = i18nLookup(flat[0].toLowerCase() + flat.slice(1), depth);
        if (r !== null) res = r[0].toUpperCase() + r.slice(1);
    }
    if (res === null && /[.!?]\s+\S/.test(flat) && depth < 2) {
        // несколько предложений, склеенных в коде: переводим по одному
        // делим только по знаку конца предложения с пробелом после (точка в «config.js» — не конец)
        const parts = [];
        let from = 0;
        for (let i = 0; i < flat.length; i++) {
            if ('.!?…'.includes(flat[i]) && flat[i + 1] === ' ') { parts.push(flat.slice(from, i + 2)); from = i + 2; }
        }
        parts.push(flat.slice(from));
        // самый длинный известный кусок из подряд идущих предложений; начало «Фраза: » отрезается
        const out = [];
        let any = false;
        for (let i = 0; i < parts.length;) {
            let done = false;
            for (let j = parts.length; j > i && !done; j--) {
                let cand = parts.slice(i, j).join('').trim();
                let pre = '';
                const cut = cand.match(/^(.{6,}?[:—–]\s)([\s\S]+)$/);
                let r = i18nLookup(cand, depth + 1);
                if (r === null && cut && window.I18N_DICT && window.I18N_DICT[cut[1].trim()]) {
                    const r2 = i18nLookup(cut[2], depth + 1);
                    if (r2 !== null) { pre = window.I18N_DICT[cut[1].trim()] + ' '; r = r2; }
                }
                if (r !== null) { out.push(pre + r); i = j; done = true; any = true; }
            }
            if (!done) { const r = translateText(parts[i], depth + 1); if (r !== parts[i]) any = true; out.push(r.trim()); i++; }
        }
        if (any) res = out.join(' ').replace(/\s{2,}/g, ' ').trim();
    }
    if (res === null && core.includes('\n')) {
        // многострочные сообщения (alert, confirm): построчно
        res = core.split('\n').map(line => line.trim() ? translateText(line, depth + 1) : line).join('\n');
    }
    if (res === null && depth < 2) {
        // начало строки — известная фраза, остальное — данные: «Не удалось сохранить: <ошибка>»
        const dict = window.I18N_DICT || {};
        const cut = flat.match(/^(.{6,}?[:—–]\s)([\s\S]+)$/);
        if (cut && dict[cut[1].trim()]) res = dict[cut[1].trim()] + ' ' + translateText(cut[2], depth + 1);
    }
    const out = res === null ? s : m[1] + res + m[3];
    if (i18nCache.size < 5000) i18nCache.set(s, out);
    return out;
}
window.t = translateText;

// ---------- Перевод страницы ----------
const I18N_ATTRS = ['placeholder', 'title', 'aria-label', 'data-title'];
const i18nOwn = new WeakMap(); // что мы сами записали в узел — чтобы не переводить повторно

function i18nSkipped(el) {
    return !el || (el.closest && el.closest(I18N_SKIP));
}

function i18nText(node) {
    const v = node.nodeValue;
    if (!v || !I18N_CYR.test(v) || i18nOwn.get(node) === v) return;
    if (i18nSkipped(node.parentElement)) return;
    const tr = translateText(v);
    if (tr !== v) { i18nOwn.set(node, tr); node.nodeValue = tr; }
}

const i18nOwnAttr = new WeakMap(); // элемент → { атрибут: что записали мы } — чтобы не переводить свой же перевод по кругу
function i18nAttrs(el) {
    if (i18nSkipped(el)) return;
    let own = i18nOwnAttr.get(el);
    I18N_ATTRS.forEach(a => {
        const v = el.getAttribute(a);
        if (!v || !I18N_CYR.test(v) || (own && own[a] === v)) return;
        const tr = translateText(v);
        if (tr !== v) {
            if (!own) { own = {}; i18nOwnAttr.set(el, own); }
            own[a] = tr;
            el.setAttribute(a, tr);
        }
    });
}

function translateTree(root) {
    if (appLang === 'ru' || !root) return;
    if (root.nodeType === 3) { i18nText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) i18nAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) i18nText(n);
    if (root.querySelectorAll) root.querySelectorAll('[placeholder],[title],[aria-label],[data-title]').forEach(i18nAttrs);
}

function i18nStart() {
    if (appLang === 'ru') return;
    translateTree(document.body);
    new MutationObserver(muts => {
        muts.forEach(m => {
            if (m.type === 'characterData') i18nText(m.target);
            else if (m.type === 'attributes') { if (m.target.nodeType === 1) i18nAttrs(m.target); }
            else m.addedNodes.forEach(translateTree);
        });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });

    // Окна браузера
    const wrap = name => {
        const orig = window[name].bind(window);
        window[name] = (msg, ...rest) => orig(translateText(String(msg ?? '')), ...rest.map(r => typeof r === 'string' ? translateText(r) : r));
    };
    ['alert', 'confirm', 'prompt'].forEach(wrap);

    // Подписи диаграмм (Chart.js рисует на холсте, мимо страницы)
    if (typeof window.upsertChart === 'function') {
        const origChart = window.upsertChart;
        window.upsertChart = (key, canvasId, config) => {
            try {
                if (config && config.data) {
                    if (Array.isArray(config.data.labels)) config.data.labels = config.data.labels.map(l => typeof l === 'string' ? translateText(l) : l);
                    (config.data.datasets || []).forEach(d => { if (typeof d.label === 'string') d.label = translateText(d.label); });
                }
            } catch (e) {}
            return origChart(key, canvasId, config);
        };
    }
}

// Скрипты приложения подключены ниже; запускаемся, когда страница прочитана целиком
document.addEventListener('DOMContentLoaded', i18nStart);

// ---------- Настройки → «Язык» ----------
function renderLangSettings() {
    const box = document.getElementById('lang-settings');
    if (!box) return;
    box.innerHTML = APP_LANGS.map(l => `
        <label class="lang-opt${l.id === appLang ? ' is-on' : ''}" data-i18n-skip>
            <input type="radio" name="app-lang" value="${l.id}" ${l.id === appLang ? 'checked' : ''} onchange="setAppLang(this.value)">
            <span>${l.name}</span>
        </label>`).join('');
}

function setAppLang(id) {
    if (!APP_LANGS.some(l => l.id === id) || id === appLang) return;
    try { localStorage.setItem(LANG_KEY, id); } catch (e) {}
    location.reload();
}

document.addEventListener('DOMContentLoaded', renderLangSettings);
