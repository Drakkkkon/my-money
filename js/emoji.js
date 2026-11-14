// --- КАРТИНКИ КАТЕГОРИЙ (эмодзи) ---
// Два независимых набора: для выбора категории в «Новой записи» (form) и для истории операций (history).
// У каждого свой вид: только картинки, только текст или картинки и текст. Свои картинки хранятся в uiPrefs.catIcons
// (js/layout.js) и синхронизируются через Google Диск; без них берутся картинки по умолчанию или по смыслу названия.

const CAT_EMOJI_DEFAULTS = {
    'паковка вб': '📦', 'паковка озон': '📦', 'паковка каспи': '📦', 'доставка': '🚚', 'смена': '⏱️',
    'инвентаризация': '📋', 'еда': '🍔', 'магазин': '🛒', 'тэму': '🛍️', 'подписка': '🔁', 'другое': '📌',
    'продукты': '🥦', 'еда вне дома': '🍽️', 'проезд': '🚌', 'одежда': '👕', 'учёба': '📚', 'кружки и секции': '⚽',
    'развлечения': '🎮', 'подарки': '🎁', 'здоровье': '💊', 'карманные деньги': '🪙', 'зарплата': '💰'
};

// Картинка по смыслу названия, если своей и стандартной нет
const CAT_EMOJI_GUESS = [
    [/копилк/i, '🐷'], [/приоритетн/i, '⭐'], [/подписк/i, '🔁'], [/зарплат|аванс|оклад|преми/i, '💰'],
    [/такси|бензин|топлив|заправк|авто|машин|парков/i, '🚗'], [/автобус|метро|проезд|транспорт/i, '🚌'],
    [/самол|билет|авиа|путеш|отпуск/i, '✈️'], [/кафе|ресторан|обед|ужин|завтрак/i, '🍽️'], [/кофе/i, '☕'],
    [/продукт|магазин|супермаркет|рынок|базар/i, '🛒'], [/еда|пицц|бургер|доставк.*ед/i, '🍔'],
    [/аптек|лекарств|врач|здоров|больниц|стомат/i, '💊'], [/спорт|зал|фитнес|секци/i, '🏋️'],
    [/одежд|обув|куртк/i, '👕'], [/квартир|аренд|жиль|коммунал|свет|газ|вода/i, '🏠'], [/интернет|связь|телефон|мобил/i, '📱'],
    [/кредит|долг|рассрочк|банк/i, '🏦'], [/подар/i, '🎁'], [/учеб|учёб|курс|школ|книг/i, '📚'], [/кино|игр|развлеч/i, '🎮'],
    [/дет|ребен|ребён|сад/i, '🧸'], [/живот|кот|собак|корм/i, '🐾'], [/красот|салон|парикмах|космет/i, '💅'],
    [/доставк|курьер|посылк/i, '🚚'], [/паковк|упаковк|склад/i, '📦'], [/ремонт|инструмент/i, '🔧'], [/налог|штраф/i, '🧾'],
    [/перевод/i, '💸'], [/доход|выручк|продаж/i, '💵']
];

const EMOJI_GROUPS = [
    { name: 'Деньги и работа', list: ['💰', '💵', '💸', '🪙', '💳', '🏦', '🧾', '📈', '📉', '💼', '🏢', '⏱️', '📋', '📦', '🚚', '🏷️', '🔁', '🐷', '⭐', '📌'] },
    { name: 'Еда', list: ['🛒', '🥦', '🍎', '🍞', '🥛', '🧀', '🥩', '🍗', '🍔', '🍕', '🌯', '🍣', '🍜', '🍽️', '☕', '🧃', '🍰', '🍫', '🍺', '🍷'] },
    { name: 'Транспорт', list: ['🚗', '🚕', '🚌', '🚇', '🚆', '✈️', '⛽', '🅿️', '🚲', '🛴', '🛵', '🚚'] },
    { name: 'Дом и покупки', list: ['🏠', '💡', '🔥', '💧', '🧹', '🧺', '🛋️', '🔧', '🛍️', '👕', '👟', '👗', '💄', '💅', '🎁', '📱', '💻', '🎧', '📺', '🧸'] },
    { name: 'Здоровье и спорт', list: ['💊', '🩺', '🦷', '🏥', '🏋️', '⚽', '🏊', '🧘', '🚴', '💆'] },
    { name: 'Досуг и учёба', list: ['🎮', '🎬', '🎵', '🎨', '📚', '🎓', '✏️', '🎟️', '🏖️', '⛺', '🎉', '🐾', '🌸', '❤️', '😊', '🔒'] }
];

function catKey(name) {
    return String(name || '').trim().toLowerCase().replace(/ё/g, 'е');
}

function defaultCategoryEmoji(name) {
    const key = catKey(name);
    for (const [k, v] of Object.entries(CAT_EMOJI_DEFAULTS)) if (catKey(k) === key) return v;
    // «Подписка: iCloud», «Приоритетная вещь: телефон» — по началу названия
    const base = key.split(':')[0];
    for (const [k, v] of Object.entries(CAT_EMOJI_DEFAULTS)) if (catKey(k) === base) return v;
    const hit = CAT_EMOJI_GUESS.find(([re]) => re.test(name));
    return hit ? hit[1] : '🏷️';
}

// Картинка категории для набора 'form' или 'history'. '' — пользователь выбрал «без картинки».
function categoryEmoji(name, set = 'history') {
    const own = (uiPrefs.catIcons[set] || {})[catKey(name)];
    if (typeof own === 'string') return own;
    // в истории: «Подписка: iCloud» берёт картинку категории «Подписка», если для неё выбрана своя
    const base = catKey(name).split(':')[0];
    const ownBase = (uiPrefs.catIcons[set] || {})[base];
    if (base !== catKey(name) && typeof ownBase === 'string') return ownBase;
    return defaultCategoryEmoji(name);
}

function iconMode(set) {
    return uiPrefs.iconMode[set] || 'both';
}

// Цвет картинки категории. Сами эмодзи не меняются: цвет — это фильтр поверх них (css/pages.css, [data-ec]).
// '' — «как было» (родные цвета эмодзи). Цвет хранится отдельно для каждой категории в uiPrefs.catColors.
const EMOJI_COLORS = [
    ['red', 'Красный', '#e53935'], ['orange', 'Оранжевый', '#fb8c00'], ['yellow', 'Жёлтый', '#fdd835'],
    ['green', 'Зелёный', '#43a047'], ['cyan', 'Бирюзовый', '#00acc1'], ['blue', 'Синий', '#1e66f5'],
    ['purple', 'Фиолетовый', '#8e24aa'], ['pink', 'Розовый', '#ec407a']
];

function categoryColor(name, set = 'history') {
    const map = (uiPrefs.catColors && uiPrefs.catColors[set]) || {};
    const ok = id => typeof id === 'string' && EMOJI_COLORS.some(c => c[0] === id);
    const key = catKey(name);
    if (ok(map[key])) return map[key];
    const base = key.split(':')[0];
    if (base !== key && ok(map[base])) return map[base];
    return '';
}

// Атрибут data-ec для картинки категории ('' если цвет не выбран)
// 4.14.0: эмодзи показываются как в системе (без окраски фильтром) — цвет больше не применяется, сохранённые значения не стираются
function ecAttr(name, set) {
    return '';
}

// HTML названия категории в истории операций с картинкой слева
function historyCategoryHtml(name) {
    const label = escapeHtml(name || 'Без категории');
    const mode = iconMode('history');
    const em = categoryEmoji(name || '', 'history');
    if (mode === 'text' || !em) return `<strong>${label}</strong>`;
    const ec = ecAttr(name || '', 'history');
    if (mode === 'icon') return `<span class="cat-emoji sys-emoji"${ec} title="${label}" aria-label="${label}">${em}</span>`;
    return `<span class="cat-emoji sys-emoji"${ec} aria-hidden="true">${em}</span><strong>${label}</strong>`;
}

// ---------- Плитки категорий в «Новой записи» ----------
// 4.14.0: плитки — разделы; у раздела с подкатегориями значок ▾, нажатие открывает ряд его подкатегорий.
// Категорий нет — вместо плиток подсказка со ссылкой на Настройки → «Категории».
let catTileOpen = ''; // раздел, чьи подкатегории сейчас раскрыты

function catTileHtml(full, label, mode, selected, extra = '') {
    const em = categoryEmoji(full, 'form') || '🏷️';
    const name = escapeHtml(label);
    return `<button type="button" class="cat-tile${selected ? ' is-selected' : ''}${extra}" data-cat="${escapeHtml(full)}" title="${escapeHtml(full)}" onclick="pickCategoryTile(this.dataset.cat)">` +
        `<span class="cat-tile-emoji sys-emoji" aria-hidden="true">${em}</span>${mode === 'both' ? `<span class="cat-tile-name">${name}</span>` : `<span class="sr-only">${name}</span>`}</button>`;
}

function renderCategoryTiles() {
    const box = document.getElementById('cat-tiles');
    if (!box) return;
    const mode = iconMode('form');
    const owner = box.closest('.card');
    const tops = typeof catTops === 'function' ? catTops() : [];
    if (!tops.length) {
        box.classList.remove('is-icons');
        if (owner) owner.classList.remove('tiles-off');
        box.style.display = '';
        box.innerHTML = `<p class="hint cat-tiles-empty">Категорий пока нет — запись можно сохранить и без неё. Добавить: <a href="#" onclick="openSettingsCard('categories-card'); return false;">Настройки → «Категории»</a>.</p>`;
        return;
    }
    box.classList.toggle('is-icons', mode === 'icon');
    if (owner) owner.classList.toggle('tiles-off', mode === 'text'); // в «Среднем» размере без плиток показываем поле категории
    box.style.display = mode === 'text' ? 'none' : '';
    if (mode === 'text') return;
    const input = document.getElementById('category');
    const current = input ? catKey(input.value) : '';
    const curTop = current.split(':')[0].trim();
    if (catTileOpen && !tops.some(p => p.id === catTileOpen)) catTileOpen = '';
    let html = tops.map(p => {
        const kids = catChildren(p.id);
        const sel = catKey(p.name) === curTop;
        return catTileHtml(p.name, p.name, mode, sel, (kids.length ? ' has-sub' : '') + (p.id === catTileOpen ? ' is-open' : ''));
    }).join('');
    const open = tops.find(p => p.id === catTileOpen);
    if (open) {
        const kids = catChildren(open.id);
        html += `<div class="cat-subtiles" role="group" aria-label="Подкатегории «${escapeHtml(open.name)}»">` +
            kids.map(k => { const full = open.name + CAT_SEP + k.name; return catTileHtml(full, k.name, mode, catKey(full) === current); }).join('') + '</div>';
    }
    box.innerHTML = html;
}

function pickCategoryTile(name) {
    const input = document.getElementById('category');
    const top = (typeof catTops === 'function' ? catTops() : []).find(p => catKey(p.name) === catKey(name));
    if (top) {
        const hasKids = catChildren(top.id).length > 0;
        // повторное нажатие на раскрытый раздел — свернуть
        if (hasKids && catTileOpen === top.id && input && catKey(input.value) === catKey(name)) catTileOpen = '';
        else catTileOpen = hasKids ? top.id : '';
    }
    if (input) input.value = name;
    const drop = document.getElementById('category-dropdown');
    if (drop) drop.style.display = 'none';
    renderCategoryTiles();
}

// ---------- Настройки: «Картинки категорий» (form) и «Картинки в истории» (history) ----------
const ICON_MODES = [['icon', 'Картинки'], ['text', 'Текст'], ['both', 'Картинки и текст']];

function categoriesForIconSet(set) {
    const names = allCategories();
    if (set === 'history') {
        // и категории из уже сделанных записей (без «Подписка: …», у них картинка общей категории)
        const seen = new Set(names.map(catKey));
        transactions.forEach(t => {
            const n = String(t.category || '').trim();
            if (!n || n.includes(':') || seen.has(catKey(n))) return;
            seen.add(catKey(n));
            names.push(n);
        });
        ['Автоперенос в копилку', 'Приоритетная вещь'].forEach(n => { if (!seen.has(catKey(n))) names.push(n); });
    }
    return names;
}

function renderCategoryIconSettings(set) {
    const box = document.getElementById('icon-settings-' + set);
    if (!box) return;
    const mode = iconMode(set);
    const own = uiPrefs.catIcons[set] || {};
    box.innerHTML = `
        <div class="seg-buttons" role="radiogroup" aria-label="Как показывать категории">
            ${ICON_MODES.map(([v, l]) => `<button type="button" role="radio" aria-checked="${mode === v}" class="seg-btn${mode === v ? ' is-on' : ''}" onclick="setIconMode('${set}', '${v}')">${l}</button>`).join('')}
        </div>
        <div class="icon-cat-list">
            ${categoriesForIconSet(set).map(n => {
                const em = categoryEmoji(n, set);
                const changed = typeof own[catKey(n)] === 'string' || !!categoryColor(n, set);
                return `<div class="icon-cat-row${changed ? ' is-changed' : ''}">
                    <button type="button" class="icon-cat-btn" data-cat="${escapeHtml(n)}" onclick="openEmojiPicker('${set}', this.dataset.cat)" aria-label="Выбрать картинку для «${escapeHtml(n)}»">${em ? `<span class="ec"${ecAttr(n, set)}>${em}</span>` : '<span class="material-icons">block</span>'}</button>
                    <span class="icon-cat-name">${escapeHtml(n)}</span>
                </div>`;
            }).join('')}
        </div>
        ${set === 'history' ? '<button type="button" class="btn-secondary btn-block" onclick="copyFormIconsToHistory()"><span class="material-icons">content_copy</span> Взять картинки из «Новой записи»</button>' : ''}
        <button type="button" class="btn-secondary btn-block" onclick="resetIconSet('${set}')"><span class="material-icons">restart_alt</span> Картинки по умолчанию</button>`;
}

function renderAllIconSettings() {
    renderCategoryIconSettings('form');
    renderCategoryIconSettings('history');
    renderCategoryViewSettings();
    renderCategoryTiles();
}

// 4.14.0: Настройки → «Категории»: как показывать категории в «Новой записи» и в истории операций
function renderCategoryViewSettings() {
    const box = document.getElementById('cat-view-settings');
    if (!box) return;
    const seg = set => {
        const mode = iconMode(set);
        return `<div class="seg-buttons" role="radiogroup" aria-label="Как показывать категории">` +
            ICON_MODES.map(([v, l]) => `<button type="button" role="radio" aria-checked="${mode === v}" class="seg-btn${mode === v ? ' is-on' : ''}" onclick="setIconMode('${set}', '${v}')">${l}</button>`).join('') + '</div>';
    };
    box.innerHTML = `
        <h4 class="font-sub">В «Новой записи»</h4>${seg('form')}
        <h4 class="font-sub">В «Истории операций»</h4>${seg('history')}
        <button type="button" class="btn-secondary btn-block" onclick="resetIconSet('both')"><span class="material-icons">restart_alt</span> Картинки по умолчанию</button>`;
}

function setIconMode(set, mode) {
    uiPrefs.iconMode[set] = mode;
    commitUiPrefs();
}

function setCategoryEmoji(set, name, emoji) {
    (set === 'both' ? ['form', 'history'] : [set]).forEach(s => {
        const map = uiPrefs.catIcons[s] || (uiPrefs.catIcons[s] = {});
        if (emoji === null) delete map[catKey(name)];
        else map[catKey(name)] = emoji;
    });
    closeEmojiPicker(true);
    commitUiPrefs();
}

// Цвет картинки категории: id из EMOJI_COLORS или '' («как было»)
function setCategoryColor(set, name, color) {
    const all = uiPrefs.catColors || (uiPrefs.catColors = { form: {}, history: {} });
    const map = all[set] || (all[set] = {});
    if (color) map[catKey(name)] = color;
    else delete map[catKey(name)];
    commitUiPrefs();
}

function copyFormIconsToHistory() {
    uiPrefs.catIcons.history = { ...uiPrefs.catIcons.form };
    uiPrefs.catColors.history = { ...uiPrefs.catColors.form };
    commitUiPrefs();
    showToast('Картинки из «Новой записи» перенесены в историю');
}

function resetIconSet(set) {
    if (!confirm('Вернуть картинки по умолчанию? Выбранные вами картинки категорий сбросятся.')) return;
    (set === 'both' ? ['form', 'history'] : [set]).forEach(s => { uiPrefs.catIcons[s] = {}; uiPrefs.catColors[s] = {}; });
    commitUiPrefs();
}

// ---------- Окно выбора картинки ----------
// 4.14.0: картинки — системные эмодзи того устройства, на котором открыт сайт (шрифт эмодзи системы, без окраски).
// Любое эмодзи можно поставить с системной клавиатуры эмодзи. set: 'form' | 'history' | 'both' (Настройки → «Категории»).
function emojiKeyboardHint() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'кнопка 😊 на клавиатуре телефона';
    if (/Mac/i.test(ua)) return 'Control + Command + Пробел';
    if (/Windows/i.test(ua)) return 'Win + . (точка)';
    return 'клавиатура эмодзи вашей системы';
}

function openEmojiPicker(set, name) {
    closeEmojiPicker(false);
    const overlay = document.createElement('div');
    overlay.id = 'emoji-picker';
    overlay.className = 'export-sheet-overlay';
    const cur = categoryEmoji(name, set === 'both' ? 'form' : set);
    const cell = e => `<button type="button" class="emoji-cell${e === cur ? ' is-on' : ''}" data-e="${e}"><span class="ec sys-emoji">${e}</span></button>`;
    overlay.innerHTML = `
        <div class="export-sheet emoji-picker" role="dialog" aria-modal="true" aria-label="Картинка категории">
            <div class="export-sheet-head">
                <h3>Картинка: ${escapeHtml(name)}</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="emoji-own">
                <input type="text" id="emoji-own-input" maxlength="8" placeholder="Любое эмодзи с клавиатуры" aria-label="Своё эмодзи" class="sys-emoji-input">
                <button type="button" class="btn-secondary" data-act="own">Поставить</button>
            </div>
            <p class="hint">Эмодзи такие же, как в вашей системе. Любое другое: ${escapeHtml(emojiKeyboardHint())}.</p>
            ${EMOJI_GROUPS.map(g => `<h4 class="emoji-group-title">${g.name}</h4>
                <div class="emoji-grid">${g.list.map(cell).join('')}</div>`).join('')}
            <div class="export-sheet-actions">
                <button type="button" class="btn-secondary" data-act="none"><span class="material-icons">block</span> Без картинки</button>
                <button type="button" class="btn-secondary" data-act="default"><span class="material-icons">restart_alt</span> По умолчанию</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { closeEmojiPicker(true); return; }
        const cellEl = e.target.closest('.emoji-cell');
        if (cellEl) { setCategoryEmoji(set, name, cellEl.dataset.e); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'none') setCategoryEmoji(set, name, '');
        else if (act.dataset.act === 'default') setCategoryEmoji(set, name, null);
        else if (act.dataset.act === 'own') {
            const v = (document.getElementById('emoji-own-input').value || '').trim();
            if (!v || /[a-zа-яё0-9]/i.test(v)) { alert('Введите одно эмодзи (картинку) с клавиатуры телефона или ПК.'); return; }
            setCategoryEmoji(set, name, Array.from(v).slice(0, 4).join(''));
        }
    });
    document.body.appendChild(overlay);
    playSound('open');
}

function closeEmojiPicker(withSound) {
    const el = document.getElementById('emoji-picker');
    if (!el) return;
    el.remove();
    if (withSound) playSound('close');
}
