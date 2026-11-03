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

// HTML названия категории в истории операций с картинкой слева
function historyCategoryHtml(name) {
    const label = escapeHtml(name || 'Без категории');
    const mode = iconMode('history');
    const em = categoryEmoji(name || '', 'history');
    if (mode === 'text' || !em) return `<strong>${label}</strong>`;
    if (mode === 'icon') return `<span class="cat-emoji" title="${label}" aria-label="${label}">${em}</span>`;
    return `<span class="cat-emoji" aria-hidden="true">${em}</span><strong>${label}</strong>`;
}

// ---------- Плитки категорий в «Новой записи» ----------
function renderCategoryTiles() {
    const box = document.getElementById('cat-tiles');
    if (!box) return;
    const mode = iconMode('form');
    box.classList.toggle('is-icons', mode === 'icon');
    const owner = box.closest('.card'); if (owner) owner.classList.toggle('tiles-off', mode === 'text'); // в «Среднем» размере без плиток показываем поле категории
    box.style.display = mode === 'text' ? 'none' : '';
    if (mode === 'text') return;
    const input = document.getElementById('category');
    const current = input ? catKey(input.value) : '';
    box.innerHTML = allCategories().map(c => {
        const em = categoryEmoji(c, 'form') || '🏷️';
        const sel = catKey(c) === current ? ' is-selected' : '';
        const label = escapeHtml(c);
        return `<button type="button" class="cat-tile${sel}" data-cat="${label}" title="${label}" onclick="pickCategoryTile(this.dataset.cat)">` +
            `<span class="cat-tile-emoji" aria-hidden="true">${em}</span>${mode === 'both' ? `<span class="cat-tile-name">${label}</span>` : `<span class="sr-only">${label}</span>`}</button>`;
    }).join('');
}

function pickCategoryTile(name) {
    const input = document.getElementById('category');
    if (input) input.value = name;
    const drop = document.getElementById('category-dropdown');
    if (drop) drop.style.display = 'none';
    renderCategoryTiles();
}

// ---------- Настройки: «Картинки категорий» (form) и «Картинки в истории» (history) ----------
const ICON_MODES = [['icon', 'Картинки'], ['text', 'Текст'], ['both', 'Картинки и текст']];

function categoriesForIconSet(set) {
    const names = allCategories(categoryOptions.concat(typeof OB_DEFAULT_CATEGORIES !== 'undefined' ? OB_DEFAULT_CATEGORIES : []));
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

function renderIconSettings(set) {
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
                const changed = typeof own[catKey(n)] === 'string';
                return `<div class="icon-cat-row${changed ? ' is-changed' : ''}">
                    <button type="button" class="icon-cat-btn" data-cat="${escapeHtml(n)}" onclick="openEmojiPicker('${set}', this.dataset.cat)" aria-label="Выбрать картинку для «${escapeHtml(n)}»">${em || '<span class="material-icons">block</span>'}</button>
                    <span class="icon-cat-name">${escapeHtml(n)}</span>
                </div>`;
            }).join('')}
        </div>
        ${set === 'history' ? '<button type="button" class="btn-secondary btn-block" onclick="copyFormIconsToHistory()"><span class="material-icons">content_copy</span> Взять картинки из «Новой записи»</button>' : ''}
        <button type="button" class="btn-secondary btn-block" onclick="resetIconSet('${set}')"><span class="material-icons">restart_alt</span> Картинки по умолчанию</button>`;
}

function renderAllIconSettings() {
    renderIconSettings('form');
    renderIconSettings('history');
    renderCategoryTiles();
}

function setIconMode(set, mode) {
    uiPrefs.iconMode[set] = mode;
    commitUiPrefs();
}

function setCategoryEmoji(set, name, emoji) {
    const map = uiPrefs.catIcons[set] || (uiPrefs.catIcons[set] = {});
    if (emoji === null) delete map[catKey(name)];
    else map[catKey(name)] = emoji;
    closeEmojiPicker(true);
    commitUiPrefs();
}

function copyFormIconsToHistory() {
    uiPrefs.catIcons.history = { ...uiPrefs.catIcons.form };
    commitUiPrefs();
    showToast('Картинки из «Новой записи» перенесены в историю');
}

function resetIconSet(set) {
    if (!confirm('Вернуть картинки по умолчанию? Выбранные вами картинки в этом наборе сбросятся.')) return;
    uiPrefs.catIcons[set] = {};
    commitUiPrefs();
}

// ---------- Окно выбора картинки ----------
function openEmojiPicker(set, name) {
    closeEmojiPicker(false);
    const overlay = document.createElement('div');
    overlay.id = 'emoji-picker';
    overlay.className = 'export-sheet-overlay';
    const cur = categoryEmoji(name, set);
    overlay.innerHTML = `
        <div class="export-sheet emoji-picker" role="dialog" aria-modal="true" aria-label="Картинка категории">
            <div class="export-sheet-head">
                <h3>Картинка: ${escapeHtml(name)}</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            ${EMOJI_GROUPS.map(g => `<h4 class="emoji-group-title">${g.name}</h4>
                <div class="emoji-grid">${g.list.map(e => `<button type="button" class="emoji-cell${e === cur ? ' is-on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>`).join('')}
            <div class="emoji-own">
                <input type="text" id="emoji-own-input" maxlength="8" placeholder="Своё эмодзи с клавиатуры" aria-label="Своё эмодзи">
                <button type="button" class="btn-secondary" data-act="own">Поставить</button>
            </div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-secondary" data-act="none"><span class="material-icons">block</span> Без картинки</button>
                <button type="button" class="btn-secondary" data-act="default"><span class="material-icons">restart_alt</span> По умолчанию</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { closeEmojiPicker(true); return; }
        const cell = e.target.closest('.emoji-cell');
        if (cell) { setCategoryEmoji(set, name, cell.dataset.e); return; }
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
