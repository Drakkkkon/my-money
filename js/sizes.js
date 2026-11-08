// --- РАЗМЕРЫ БЛОКОВ: маленький / средний / большой ---
// У каждого блока в заголовке есть кнопка размера (js/layout.js → enhanceCards; рисуется под тему: css/v41.css).
// Размер задаётся в «клетках»: ширина × высота. Маленький 1×2, средний 2×2, большой 2×4 (клетка по высоте — 150 px).
// «Как было» — прежний вид блока. Ширина в клетках ограничивается числом колонок раздела (на телефоне колонка одна:
// меняется только высота); то, что не помещается по высоте, прокручивается внутри блока. Блоки на «Стене» меняют размер
// своими кнопками (js/wall.js), поэтому здесь для них кнопки нет.
// 4.2: размер меняет и содержимое. Каждый прямой потомок блока получает уровень data-t: 1 — главное (видно при любом размере),
// 2 — кнопки и варианты (средний и большой), 3 — всё остальное (только большой = «классический» вид). Уровни ставит tierCard();
// где нужен точный выбор, в разметке пишется data-tier="1|2|3". Скрытие — css/v41.css (раздел 4.2).
// На одной колонке (телефон) высоты 1 / 2 / 4 клетки, чтобы каждый шаг был заметным; на нескольких колонках — 2 / 2 / 4 и ширина 1 / 2 / 2.
// Выбор хранится в uiPrefs.sizes { id блока: 's' | 'm' | 'l' } и синхронизируется с Google Диском вместе с остальными настройками вида.

const CARD_SIZES = {
    s: { cols: 1, rows: 2, name: 'Маленький', dim: '1 × 2' },
    m: { cols: 2, rows: 2, name: 'Средний', dim: '2 × 2' },
    l: { cols: 2, rows: 4, name: 'Большой', dim: '2 × 4' }
};

// Высота в клетках: на одной колонке «маленький» — одна клетка (иначе он не отличался бы от среднего)
const CARD_ROWS_1COL = { s: 1, m: 2, l: 4 };

// ---------- Уровни содержимого ----------
const TIER_SKIP = 'h3, script, style, datalist, template, input[type="hidden"], .w95-sb';
const TIER_ACTION = 'button, .btn-group, .btn-stack, .ob-keypad, .calc-tape-tools, [class*="-btns"], .tx-actions';
function tierHasField(k) { return k.matches('input:not([type="hidden"]), select, textarea') || !!k.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea'); }
function tierIsAction(k) { return k.matches(TIER_ACTION); }
function tierIsHint(k) { return (k.matches('p, h4, .hint') && !k.querySelector('input, select, textarea, button')); }

function tierCard(card) {
    const kids = [...card.children].filter(k => !k.matches(TIER_SKIP));
    const plain = kids.filter(k => !k.dataset.tier);
    let primaryDone = false, firstField = null, nextFieldTaken = false, actions = 0;
    // 1) главное: первый не-подсказка; если это поле-фильтр, к нему в пару идёт первый блок с данными (список, таблица, диаграмма)
    const body = plain.filter(k => !tierIsHint(k));
    const first = body[0];
    const pair = new Set();
    if (first) {
        pair.add(first);
        if (tierHasField(first) && !tierIsAction(first)) {
            const data = body.find(k => k !== first && !tierHasField(k) && !tierIsAction(k));
            if (data && body.indexOf(data) <= 2) pair.add(data);
        }
    }
    plain.forEach(k => {
        let t = 3;
        if (pair.has(k)) t = 1;
        else if (tierIsHint(k)) t = 3;
        else if (tierIsAction(k)) { if (actions++ < 2) t = 2; }
        else if (first && tierHasField(first) && tierHasField(k) && !nextFieldTaken) { nextFieldTaken = true; t = 2; }
        k.dataset.t = t;
    });
    kids.filter(k => k.dataset.tier).forEach(k => { k.dataset.t = k.dataset.tier; });
}

function cardSizeOf(id) {
    const v = (uiPrefs.sizes || {})[id];
    return CARD_SIZES[v] ? v : '';
}

// Классы и подписи блока (без колонок)
function applyCardSize(card) {
    if (!card || !card.id || card.classList.contains('on-wall')) return;
    // 4.9.0: в режиме «страницы вместо блоков» и в меню Настроек (js/pages.js) размеры не действуют: блок целиком (сами значения не стираются)
    if (typeof pagesIgnoreLayout === 'function' && pagesIgnoreLayout(card)) {
        card.classList.remove('card-sized');
        card.removeAttribute('data-size');
        card.style.removeProperty('--card-rows');
        card.style.removeProperty('--card-cols');
        return;
    }
    const size = cardSizeOf(card.id), def = CARD_SIZES[size];
    card.classList.toggle('card-sized', !!def);
    if (card.dataset.size !== size) card.dataset.size = size;
    if (def) tierCard(card);
    const btn = card.querySelector(':scope > h3 .w95-ctl-size');
    if (btn) {
        btn.dataset.size = size;
        btn.title = def ? `Размер блока: ${def.name.toLowerCase()} (${def.dim})` : 'Размер блока';
        btn.setAttribute('aria-label', btn.title);
    }
    if (def) card.style.setProperty('--card-rows', def.rows);
    else { card.style.removeProperty('--card-rows'); card.style.removeProperty('--card-cols'); }
}

// Ширина в клетках: не больше числа колонок раздела. Колонки считаем, пока у всех блоков раздела ширина 1,
// иначе сама «растяжка» создаёт лишнюю колонку и счёт сбивается. У скрытых разделов — позже, при показе.
function applyCardCols(parent) {
    if (!parent || parent.offsetParent === null) return;
    const sized = [...parent.children].filter(c => c.classList.contains('card-sized') && !c.classList.contains('on-wall'));
    if (!sized.length) return;
    sized.forEach(c => c.style.setProperty('--card-cols', 1));
    let cols = 1;
    if (parent.matches('main > .tab') && parent.id !== 'transactions') {
        cols = Math.max(1, getComputedStyle(parent).gridTemplateColumns.split(' ').filter(t => parseFloat(t) > 0).length);
    }
    sized.forEach(c => {
        const k = cardSizeOf(c.id), def = CARD_SIZES[k];
        c.style.setProperty('--card-cols', Math.min(def.cols, cols));
        c.style.setProperty('--card-rows', cols === 1 ? CARD_ROWS_1COL[k] : def.rows);
    });
}

function applyCardSizes() {
    const parents = new Set();
    document.querySelectorAll('main .card').forEach(card => { applyCardSize(card); if (card.parentElement) parents.add(card.parentElement); });
    parents.forEach(applyCardCols);
    window.dispatchEvent(new Event('resize')); // диаграммы подстраиваются
}

function setCardSize(id, size) {
    const sizes = { ...(uiPrefs.sizes || {}) };
    if (CARD_SIZES[size]) sizes[id] = size; else delete sizes[id];
    uiPrefs.sizes = sizes;
    const card = document.getElementById(id);
    applyCardSize(card);
    if (card) applyCardCols(card.parentElement);
    closeCardSizeMenu();
    commitUiPrefs();
    if (typeof playSound === 'function') playSound('click');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

// ---------- Меню выбора размера ----------
function closeCardSizeMenu() {
    const m = document.getElementById('card-size-menu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', cardSizeOutside, true);
    document.removeEventListener('keydown', cardSizeEsc, true);
}
function cardSizeOutside(e) { if (!e.target.closest('#card-size-menu') && !e.target.closest('.w95-ctl-size')) closeCardSizeMenu(); }
function cardSizeEsc(e) { if (e.key === 'Escape') closeCardSizeMenu(); }

function openCardSizeMenu(btn) {
    const card = btn.closest('.card');
    if (!card || !card.id) return;
    const wasOpen = document.getElementById('card-size-menu') && document.getElementById('card-size-menu').dataset.for === card.id;
    closeCardSizeMenu();
    if (wasOpen) return;
    const cur = cardSizeOf(card.id);
    const item = (key, label, dim) => `<button type="button" class="size-opt${cur === key ? ' is-on' : ''}" data-size="${key}" onclick="setCardSize('${card.id}', '${key}')">
        <span class="size-glyph" data-size="${key}"></span><span class="size-opt-name">${label}</span><span class="size-opt-dim">${dim}</span></button>`;
    const menu = document.createElement('div');
    menu.id = 'card-size-menu';
    menu.className = 'card-size-menu';
    menu.dataset.for = card.id;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = Object.keys(CARD_SIZES).map(k => item(k, CARD_SIZES[k].name, CARD_SIZES[k].dim)).join('') + item('', 'Как было', 'авто');
    document.body.appendChild(menu);
    // под кнопкой; если не помещается справа или снизу — сдвигаем внутрь экрана
    const r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(6, Math.min(window.innerWidth - mw - 6, r.right - mw)) + 'px';
    menu.style.top = (r.bottom + mh + 8 > window.innerHeight ? Math.max(6, r.top - mh - 4) : r.bottom + 4) + 'px';
    document.addEventListener('pointerdown', cardSizeOutside, true);
    document.addEventListener('keydown', cardSizeEsc, true);
    if (typeof playSound === 'function') playSound('open');
}

// Блоки, которые перерисовываются целиком (котировки и др.), теряют размер: следим за разделами и применяем снова
let cardSizeWatchTimer = null;
const cardSizeObserver = new MutationObserver(() => {
    clearTimeout(cardSizeWatchTimer);
    cardSizeWatchTimer = setTimeout(() => { if (typeof enhanceCards === 'function') enhanceCards(); applyCardSizes(); }, 60);
});
function watchCardSizes() {
    document.querySelectorAll('main > .tab').forEach(tab => { if (!tab._sizeWatched) { tab._sizeWatched = true; cardSizeObserver.observe(tab, { childList: true }); } });
}
window.addEventListener('DOMContentLoaded', () => setTimeout(() => { applyCardSizes(); watchCardSizes(); }, 0));
window.addEventListener('load', applyCardSizes);
window.addEventListener('app-layout', () => setTimeout(applyCardSizes, 60));
let cardSizeResizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(cardSizeResizeTimer); cardSizeResizeTimer = setTimeout(() => new Set([...document.querySelectorAll('main .card.card-sized')].map(c => c.parentElement)).forEach(applyCardCols), 120); });
