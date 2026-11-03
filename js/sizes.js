// --- РАЗМЕРЫ БЛОКОВ: маленький / средний / большой ---
// У каждого блока в заголовке есть кнопка размера (js/layout.js → enhanceCards; рисуется под тему: css/v41.css).
// Размер задаётся в «клетках»: ширина × высота. Маленький 1×2, средний 2×2, большой 2×4 (клетка по высоте — 150 px).
// «Как было» — прежний вид блока. Ширина в клетках ограничивается числом колонок раздела (на телефоне колонка одна:
// меняется только высота); то, что не помещается по высоте, прокручивается внутри блока. Блоки на «Стене» меняют размер
// своими кнопками (js/wall.js), поэтому здесь для них кнопки нет.
// Выбор хранится в uiPrefs.sizes { id блока: 's' | 'm' | 'l' } и синхронизируется с Google Диском вместе с остальными настройками вида.

const CARD_SIZES = {
    s: { cols: 1, rows: 2, name: 'Маленький', dim: '1 × 2' },
    m: { cols: 2, rows: 2, name: 'Средний', dim: '2 × 2' },
    l: { cols: 2, rows: 4, name: 'Большой', dim: '2 × 4' }
};

function cardSizeOf(id) {
    const v = (uiPrefs.sizes || {})[id];
    return CARD_SIZES[v] ? v : '';
}

// Классы и подписи блока (без колонок)
function applyCardSize(card) {
    if (!card || !card.id || card.classList.contains('on-wall')) return;
    const size = cardSizeOf(card.id), def = CARD_SIZES[size];
    card.classList.toggle('card-sized', !!def);
    if (card.dataset.size !== size) card.dataset.size = size;
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
    sized.forEach(c => c.style.setProperty('--card-cols', Math.min(CARD_SIZES[cardSizeOf(c.id)].cols, cols)));
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

window.addEventListener('DOMContentLoaded', () => setTimeout(applyCardSizes, 0));
window.addEventListener('load', applyCardSizes);
window.addEventListener('app-layout', () => setTimeout(applyCardSizes, 60));
let cardSizeResizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(cardSizeResizeTimer); cardSizeResizeTimer = setTimeout(() => new Set([...document.querySelectorAll('main .card.card-sized')].map(c => c.parentElement)).forEach(applyCardCols), 120); });
