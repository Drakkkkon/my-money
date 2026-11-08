// --- «СТЕНА» ---
// Отдельный раздел меню, куда можно вынести любой блок из любой части программы: булавка 📌 в заголовке блока.
// Блок переезжает на стену целиком (со всеми кнопками и обновлениями), а на старом месте остаётся заметка
// «Блок на стене» с кнопкой «Вернуть». На стене у каждого блока: ширина 1–4 колонки и высота (кнопки или
// уголок справа внизу — потянуть мышью или пальцем), «_» сворачивает, «□» разворачивает на весь экран.
// Раскладка стены — uiPrefs.wall (js/layout.js), синхронизируется через Google Диск.
// Постоянные блоки (атрибут data-wall-fixed в index.html, сейчас — каталог OldBook.kz) живут на стене всегда: их нельзя
// убрать со стены, но размер меняется так же, как у остальных; на «Стене» они идут первыми.

const WALL_HEIGHTS = [0, 260, 420, 640]; // 0 — по содержимому

function wallItem(id) {
    return (uiPrefs.wall || []).find(x => x.id === id);
}

function wallBox() {
    return document.getElementById('wall');
}

function wallFixedCards() {
    const wall = wallBox();
    return wall ? [...wall.querySelectorAll(':scope > .card[data-wall-fixed]')] : [];
}

function wallIsFixed(id) {
    return wallFixedCards().some(c => c.id === id);
}

// Постоянные блоки всегда есть в раскладке (и после синхронизации с другого устройства, где их записи нет)
function ensureWallFixed() {
    const fixed = wallFixedCards();
    if (!fixed.length) return;
    const own = fixed.map(c => wallItem(c.id) || { id: c.id, w: 4, h: 0 });
    uiPrefs.wall = [...own, ...(uiPrefs.wall || []).filter(x => !fixed.some(c => c.id === x.id))];
}

// Блок → на стену; заметка на старом месте
function moveCardToWall(card) {
    const wall = wallBox();
    if (!wall || !card || card.parentElement === wall) return;
    const ph = document.createElement('div');
    ph.className = 'wall-placeholder';
    ph.dataset.for = card.id;
    const title = (card.querySelector(':scope > h3') || {}).textContent || '';
    ph.innerHTML = `<span class="material-icons">push_pin</span><span>Блок «<b data-i18n-skip>${escapeHtml(title.trim().slice(0, 60))}</b>» на стене</span>` +
        `<button type="button" class="btn-secondary" onclick="unpinWallCard('${card.id}')"><span class="material-icons">undo</span> Вернуть</button>` +
        `<button type="button" class="btn-secondary" onclick="showTab('wall')"><span class="material-icons">dashboard</span> На стену</button>`;
    card.replaceWith(ph);
    wall.appendChild(card);
    card.classList.add('on-wall');
    card.classList.remove('is-collapsed');
    addWallTools(card);
    applyWallSize(card);
}

function moveCardBack(card) {
    if (card.hasAttribute('data-wall-fixed')) return;
    const ph = document.querySelector(`.wall-placeholder[data-for="${CSS.escape(card.id)}"]`);
    card.classList.remove('on-wall');
    card.style.removeProperty('--wall-w');
    card.style.removeProperty('height');
    ['wall-tools', 'wall-grip'].forEach(c => card.querySelectorAll(':scope > .' + c + ', :scope > h3 .' + c).forEach(e => e.remove()));
    if (ph) ph.replaceWith(card);
    else card.remove();
    syncPinButton(card);
}

function syncPinButton(card) {
    const pin = card.querySelector(':scope > h3 .w95-ctl-pin');
    if (!pin) return;
    const on = card.classList.contains('on-wall');
    pin.title = on ? 'Убрать со стены' : 'На стену';
    pin.setAttribute('aria-label', on ? 'Убрать блок со стены' : 'Добавить блок на стену');
    pin.classList.toggle('is-on', on);
}

function addWallTools(card) {
    const h = card.querySelector(':scope > h3');
    if (h && !h.querySelector('.wall-tools')) {
        const tools = document.createElement('span');
        tools.className = 'wall-tools';
        tools.innerHTML = `<button type="button" class="wall-tool" onclick="wallCycle('${card.id}', 'w')" title="Ширина" aria-label="Изменить ширину"><span class="material-icons">swap_horiz</span></button>` +
            `<button type="button" class="wall-tool" onclick="wallCycle('${card.id}', 'h')" title="Высота" aria-label="Изменить высоту"><span class="material-icons">swap_vert</span></button>`;
        h.insertBefore(tools, h.querySelector('.w95-ctls'));
    }
    if (!card.querySelector(':scope > .wall-grip')) {
        const grip = document.createElement('span');
        grip.className = 'wall-grip';
        grip.title = 'Потяните, чтобы изменить размер';
        grip.setAttribute('aria-hidden', 'true');
        grip.addEventListener('pointerdown', e => wallResizeStart(e, card));
        card.appendChild(grip);
    }
    syncPinButton(card);
}

function applyWallSize(card) {
    const it = wallItem(card.id) || { w: 2, h: 0 };
    card.style.setProperty('--wall-w', it.w);
    card.classList.toggle('wall-compact', !!it.c && Number(it.w) === 1); // 4.10.0: компактный (узкий) блок, css/pages.css
    if (it.h) card.style.height = it.h + 'px'; else card.style.removeProperty('height');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30); // диаграммы подстраиваются
}

// Кнопка-булавка: на стену / со стены
function toggleWallCard(btn) {
    const card = btn.closest('.card');
    if (!card || !card.id || card.hasAttribute('data-wall-fixed')) return;
    if (card.classList.contains('on-wall')) { unpinWallCard(card.id); return; }
    pinCardToWall(card, false);
}

// Блок → на стену. compact — узкий блок (одна колонка, не шире ~340 px на ПК), иначе — оригинальный размер блока
function pinCardToWall(card, compact) {
    if (!card || !card.id || card.hasAttribute('data-wall-fixed') || card.classList.contains('on-wall')) return;
    const w = compact ? 1 : (card.classList.contains('card-wide') ? 4 : 2);
    uiPrefs.wall = [...(uiPrefs.wall || []).filter(x => x.id !== card.id), { id: card.id, w, h: 0, ...(compact ? { c: true } : {}) }];
    moveCardToWall(card);
    renderWallEmpty();
    commitUiPrefs();
    if (typeof playSound === 'function') playSound('open');
    showToast('Блок добавлен на стену');
}

function unpinWallCard(id) {
    if (wallIsFixed(id)) return;
    const card = document.getElementById(id);
    uiPrefs.wall = (uiPrefs.wall || []).filter(x => x.id !== id);
    if (card) moveCardBack(card);
    renderWallEmpty();
    commitUiPrefs();
    if (typeof playSound === 'function') playSound('close');
}

function wallCycle(id, key) {
    const it = wallItem(id);
    const card = document.getElementById(id);
    if (!it || !card) return;
    if (key === 'w') { it.w = it.w >= 4 ? 1 : it.w + 1; delete it.c; }
    else {
        const i = WALL_HEIGHTS.findIndex(v => v >= it.h);
        it.h = WALL_HEIGHTS[(i < 0 ? 0 : i + (WALL_HEIGHTS[i] === it.h ? 1 : 0)) % WALL_HEIGHTS.length];
    }
    applyWallSize(card);
    commitUiPrefs();
}

// Уголок изменения размера: ширина — по колонкам сетки, высота — в пикселях
function wallResizeStart(e, card) {
    e.preventDefault();
    e.stopPropagation();
    const it = wallItem(card.id);
    const wall = wallBox();
    if (!it || !wall) return;
    const cols = getComputedStyle(wall).gridTemplateColumns.split(' ').length || 4;
    const colW = wall.clientWidth / cols;
    const start = { x: e.clientX, y: e.clientY, w: card.offsetWidth, h: card.offsetHeight };
    const grip = e.currentTarget;
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    card.classList.add('is-resizing');
    const move = ev => {
        const w = Math.max(1, Math.min(cols, Math.round((start.w + ev.clientX - start.x) / colW)));
        const h = Math.max(160, Math.min(1600, Math.round(start.h + ev.clientY - start.y)));
        it.w = cols < 4 ? Math.min(4, w) : w;
        it.h = h;
        delete it.c;
        card.classList.remove('wall-compact');
        card.style.setProperty('--wall-w', it.w);
        card.style.height = h + 'px';
    };
    const end = () => {
        card.classList.remove('is-resizing');
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        window.dispatchEvent(new Event('resize'));
        commitUiPrefs();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
}

function renderWallEmpty() {
    const info = document.getElementById('wall-empty');
    if (info) info.hidden = (uiPrefs.wall || []).some(x => !wallIsFixed(x.id));
}

// Раскладка стены из настроек (при запуске, после синхронизации и после перерисовки блоков)
function applyWall() {
    const wall = wallBox();
    if (!wall) return;
    ensureWallFixed();
    wallFixedCards().forEach(card => { card.classList.add('on-wall'); card.classList.remove('is-collapsed'); addWallTools(card); });
    const want = (uiPrefs.wall || []).map(x => x.id);
    // убранные на другом устройстве — вернуть на место
    wall.querySelectorAll(':scope > .card.on-wall').forEach(card => { if (!want.includes(card.id)) moveCardBack(card); });
    // устаревшие копии (блок перерисован заново в своём разделе)
    want.forEach(id => {
        const all = [...document.querySelectorAll(`[id="${CSS.escape(id)}"]`)];
        if (all.length > 1) all.filter(c => c.parentElement === wall).forEach(c => { c.remove(); });
    });
    want.forEach(id => {
        const card = document.getElementById(id);
        if (!card) return;
        if (card.parentElement !== wall) {
            const oldPh = document.querySelector(`.wall-placeholder[data-for="${CSS.escape(id)}"]`);
            if (oldPh) oldPh.remove();
            moveCardToWall(card);
        } else {
            applyWallSize(card);
        }
        wall.appendChild(card); // порядок — как в настройках
    });
    renderWallEmpty();
}

window.addEventListener('DOMContentLoaded', () => setTimeout(applyWall, 0));
window.addEventListener('load', applyWall);
