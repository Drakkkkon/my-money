// --- ВИД ПРИЛОЖЕНИЯ: настройки вида, кнопки окон у блоков, настройка блока «Текущий баланс» ---
// uiPrefs синхронизируется через Google Диск (cloud.js, вместе с копилкой, лимитом и т. п.):
//   header  — что показывать в блоке баланса и размеры цифр и текста;
//   quotes  — котировка в шапке и на заставке, скрытые стандартные котировки (js/quotes.js);
//   catIcons / iconMode — картинки категорий в «Новой записи» и в истории (js/emoji.js).
// Свёрнутые блоки запоминаются только на этом устройстве (finance_collapsed).

const UI_PREFS_KEY = 'finance_ui';
const COLLAPSED_KEY = 'finance_collapsed';

const UI_DEFAULTS = {
    header: { hide: [], balance: 1, time: 1, text: 1 },
    quotes: { header: 'AAPL', splash: ['AAPL', 'KSPI'], hidden: [] },
    catIcons: { form: {}, history: {} },
    iconMode: { form: 'both', history: 'both' }
};

function normalizeUiPrefs(p) {
    const src = (p && typeof p === 'object') ? p : {};
    const obj = (v, d) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : d;
    const h = obj(src.header, {});
    const q = obj(src.quotes, {});
    const ci = obj(src.catIcons, {});
    const im = obj(src.iconMode, {});
    const scale = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0.5 && n <= 2.5 ? n : d; };
    const mode = v => ['icon', 'text', 'both'].includes(v) ? v : 'both';
    return {
        header: {
            hide: Array.isArray(h.hide) ? h.hide.filter(x => typeof x === 'string') : [],
            balance: scale(h.balance, 1), time: scale(h.time, 1), text: scale(h.text, 1)
        },
        quotes: {
            header: typeof q.header === 'string' ? q.header : UI_DEFAULTS.quotes.header,
            splash: Array.isArray(q.splash) ? q.splash.filter(x => typeof x === 'string').slice(0, 4) : UI_DEFAULTS.quotes.splash.slice(),
            hidden: Array.isArray(q.hidden) ? q.hidden.filter(x => typeof x === 'string') : []
        },
        catIcons: { form: obj(ci.form, {}), history: obj(ci.history, {}) },
        iconMode: { form: mode(im.form), history: mode(im.history) },
        notify: normalizeNotifyPrefs(obj(src.notify, {})),
        bank: normalizeBankPrefs(obj(src.bank, {})),
        fonts: obj(src.fonts, {}),
        // «Стена» (js/wall.js): [{ id блока, w — ширина в колонках 1–4, h — высота в px или 0 (по содержимому) }]
        wall: Array.isArray(src.wall) ? src.wall.filter(x => x && typeof x.id === 'string')
            .map(x => ({ id: x.id.slice(0, 80), w: Math.min(4, Math.max(1, Number(x.w) || 2)), h: Math.min(1600, Math.max(0, Number(x.h) || 0)) })) : [],
        // Размеры блоков (js/sizes.js): { id блока: 's' | 'm' | 'l' }
        sizes: Object.fromEntries(Object.entries(obj(src.sizes, {})).filter(([k, v]) => typeof k === 'string' && k.length < 80 && ['s', 'm', 'l'].includes(v)).slice(0, 200)),
        layout: normalizeLayoutPrefs(obj(src.layout, {}))
    };
}

// Разметка (js/layout.js ниже): ширина и колонки на ПК, плотность, вид меню, заставка на ПК
function normalizeLayoutPrefs(l) {
    const pick = (v, list, d) => list.includes(v) ? v : d;
    const pct = Number(l.widthPct);
    return {
        pcWidth: pick(l.pcWidth, ['auto', 'full', 'narrow', 'custom'], 'auto'),
        widthPct: Number.isFinite(pct) && pct >= 50 && pct <= 100 ? pct : 80,
        pcCols: pick(String(l.pcCols || 'auto'), ['auto', '1', '2', '3'], 'auto'),
        density: pick(l.density, ['compact', 'normal', 'roomy'], 'normal'),
        pcMenu: pick(l.pcMenu, ['left', 'burger'], 'left'),
        mobileMenu: pick(l.mobileMenu, ['bottom', 'left', 'burger'], 'bottom'),
        pcSplash: l.pcSplash !== false,
        // 4.9.0: «страницы вместо блоков» — каждый блок раздела отдельной страницей на весь экран (js/pages.js)
        noBlocks: l.noBlocks === true
    };
}

// Уведомления (js/notify.js): утро 9:00 с целями, выгрузка за день в 23:00, напоминания подписок по умолчанию
function normalizeNotifyPrefs(n) {
    const offsets = ['1w', '3d', '1d', '3h', '1h', '0'];
    return {
        morning: n.morning !== false,
        daily: n.daily !== false,
        subDefault: Array.isArray(n.subDefault) ? n.subDefault.filter(o => offsets.includes(o)) : ['1d'],
        bank: n.bank !== false
    };
}

// Банк (js/bank.js): выбранный банк, остаток из выписки или уведомления и пороги предупреждений
function normalizeBankPrefs(b) {
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    return {
        name: typeof b.name === 'string' ? b.name.slice(0, 30) : 'kaspi',
        balance: num(b.balance),
        balanceAt: typeof b.balanceAt === 'string' ? b.balanceAt.slice(0, 16) : '',
        source: typeof b.source === 'string' ? b.source.slice(0, 20) : '',
        low: Math.max(0, num(b.low) || 0),
        big: Math.max(0, num(b.big) || 0),
        summary: (b.summary && typeof b.summary === 'object') ? b.summary : null
    };
}

let uiPrefs = normalizeUiPrefs(null);
try { uiPrefs = normalizeUiPrefs(JSON.parse(localStorage.getItem(UI_PREFS_KEY) || 'null')); } catch (e) {}

function saveUiPrefsLocal() {
    try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch (e) {}
}

// Настройки пришли с другого устройства
function setUiPrefs(p) {
    uiPrefs = normalizeUiPrefs(p);
    saveUiPrefsLocal();
    applyHeaderPrefs();
    renderHeaderSettings();
    if (typeof renderNotifySettings === 'function') renderNotifySettings();
    applyLayoutPrefs();
    renderLayoutSettings();
    if (typeof applyWall === 'function') applyWall();
    if (typeof applyCardSizes === 'function') applyCardSizes();
    if (typeof applyTheme === 'function' && typeof currentThemeId !== 'undefined') applyTheme(currentThemeId, { save: false }); // шрифты с другого устройства
}

// Изменение настроек на этом устройстве: сохранить и отправить в облако
function commitUiPrefs() {
    saveUiPrefsLocal();
    if (typeof updateUI === 'function') updateUI(true);
}

// ---------- Кнопки окна у блоков: «_» сворачивает, «□» разворачивает на весь экран с прокруткой ----------
function readCollapsed() {
    try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function cardKey(card) {
    if (card.id) return card.id;
    const tab = card.closest('.tab');
    const h = card.querySelector(':scope > h3');
    return (tab ? tab.id : 'x') + ':' + (h ? h.textContent.trim().slice(0, 40) : '');
}

// Постоянные id блоков без id: «card-<раздел>-<номер>» по порядку в разметке (нужны для «Стены» и свёрнутых блоков)
let cardIdsAssigned = false;
function assignCardIds() {
    if (cardIdsAssigned) return;
    cardIdsAssigned = true;
    document.querySelectorAll('main > .tab').forEach(tab => {
        let i = 0;
        tab.querySelectorAll('.card').forEach(card => {
            if (!card.id) card.id = `card-${tab.id}-${i}`;
            i++;
        });
    });
}

function enhanceCards(root = document) {
    assignCardIds();
    const collapsed = readCollapsed();
    root.querySelectorAll('main .card').forEach(card => {
        const h = card.querySelector(':scope > h3');
        if (!h) return;
        if (!h.querySelector('.w95-ctls')) {
            h.classList.add('has-controls');
            const ctls = document.createElement('span');
            ctls.className = 'w95-ctls';
            ctls.innerHTML =
                (card.id && !card.classList.contains('wall-info') && !card.hasAttribute('data-wall-fixed') ? '<button type="button" class="w95-ctl w95-ctl-pin" onclick="toggleWallCard(this)" title="На стену" aria-label="Добавить блок на стену"><span class="material-icons">push_pin</span></button>' : '') +
                (card.id && !card.classList.contains('wall-info') ? '<button type="button" class="w95-ctl w95-ctl-size" onclick="openCardSizeMenu(this)" title="Размер блока" aria-label="Размер блока" aria-haspopup="menu"></button>' : '') +
                '<button type="button" class="w95-ctl w95-ctl-min" onclick="toggleCardCollapse(this)" title="Свернуть" aria-label="Свернуть блок"></button>' +
                '<button type="button" class="w95-ctl w95-ctl-max" onclick="toggleMaximize(this)" title="Развернуть" aria-label="Развернуть на весь экран"></button>' +
                '<span class="w95-ctl w95-ctl-close" aria-hidden="true"></span>';
            h.appendChild(ctls);
        } else {
            // готовая панель кнопок в разметке: «_» тоже становится настоящей кнопкой, и появляется булавка «На стену»
            const ctlsBox = h.querySelector('.w95-ctls');
            if (card.id && !card.hasAttribute('data-wall-fixed') && !ctlsBox.querySelector('.w95-ctl-pin')) {
                ctlsBox.insertAdjacentHTML('afterbegin', '<button type="button" class="w95-ctl w95-ctl-pin" onclick="toggleWallCard(this)" title="На стену" aria-label="Добавить блок на стену"><span class="material-icons">push_pin</span></button>');
            }
            if (card.id && !card.classList.contains('wall-info') && !ctlsBox.querySelector('.w95-ctl-size')) {
                const before = ctlsBox.querySelector('.w95-ctl-min');
                (before || ctlsBox).insertAdjacentHTML(before ? 'beforebegin' : 'afterbegin', '<button type="button" class="w95-ctl w95-ctl-size" onclick="openCardSizeMenu(this)" title="Размер блока" aria-label="Размер блока" aria-haspopup="menu"></button>');
            }
            const min = h.querySelector('.w95-ctl-min');
            if (min && min.tagName !== 'BUTTON') {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = min.className;
                b.title = 'Свернуть';
                b.setAttribute('aria-label', 'Свернуть блок');
                b.setAttribute('onclick', 'toggleCardCollapse(this)');
                min.replaceWith(b);
            }
        }
        // двойное нажатие по заголовку тоже сворачивает (как в Windows)
        if (!h._dbl) {
            h._dbl = true;
            h.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, a, input, select')) return;
                const min = h.querySelector('.w95-ctl-min');
                if (min) toggleCardCollapse(min);
            });
        }
        // 4.9.0: в режиме «страницы вместо блоков» свёрнутость игнорируется (js/pages.js), сохранённое значение остаётся
        const pagesOn = typeof pagesActive === 'function' && pagesActive() && !card.classList.contains('on-wall');
        card.classList.toggle('is-collapsed', !pagesOn && !!collapsed[cardKey(card)] && !card.classList.contains('is-maximized'));
        syncCollapseButton(card);
    });
}

function syncCollapseButton(card) {
    const min = card.querySelector(':scope > h3 .w95-ctl-min');
    if (!min) return;
    const c = card.classList.contains('is-collapsed');
    min.title = c ? 'Развернуть блок' : 'Свернуть';
    min.setAttribute('aria-label', c ? 'Развернуть блок' : 'Свернуть блок');
    min.setAttribute('aria-expanded', String(!c));
}

function toggleCardCollapse(btn) {
    const card = btn.closest('.card');
    if (!card) return;
    if (card.classList.contains('is-maximized')) {
        const max = card.querySelector('.w95-ctl-max');
        if (max) toggleMaximize(max);
    }
    const collapsed = !card.classList.contains('is-collapsed');
    card.classList.toggle('is-collapsed', collapsed);
    syncCollapseButton(card);
    const state = readCollapsed();
    if (collapsed) state[cardKey(card)] = 1; else delete state[cardKey(card)];
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state)); } catch (e) {}
    if (typeof playSound === 'function') playSound(collapsed ? 'close' : 'open');
    // диаграммы в развёрнутом блоке пересчитывают размер
    if (!collapsed) setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

// ---------- Блок «Текущий баланс» ----------
const HEADER_PARTS = [
    { id: 'label', name: 'Надпись «Текущий баланс»', sel: '.balance-main > .balance-label' },
    { id: 'balance', name: 'Сумма баланса', sel: '#balance' },
    { id: 'limit', name: 'Дневной лимит', sel: '.limits > p:nth-child(1)' },
    { id: 'savings', name: 'Копилка', sel: '.limits > p:nth-child(2)' },
    { id: 'date', name: 'Дата', sel: '#hdr-date' },
    { id: 'time', name: 'Время', sel: '#hdr-time' },
    { id: 'weather', name: 'Погода', sel: '#hdr-weather' },
    { id: 'rates', name: 'Курсы валют', sel: '#hdr-rates' },
    { id: 'quote', name: 'Котировка акции', sel: '#hdr-quote' },
    { id: 'title', name: 'Название приложения (на телефоне)', sel: '.header-top' }
];

function applyHeaderPrefs() {
    const header = document.getElementById('main-header');
    if (!header) return;
    const hp = uiPrefs.header;
    HEADER_PARTS.forEach(p => header.querySelectorAll(p.sel).forEach(el => el.classList.toggle('hdr-off', hp.hide.includes(p.id))));
    const off = id => hp.hide.includes(id);
    const mainEmpty = ['label', 'balance', 'limit', 'savings'].every(off);
    const infoEmpty = ['date', 'time', 'weather', 'rates', 'quote'].every(off);
    const grid = header.querySelector('.balance-grid');
    const card = header.querySelector('.balance-card');
    if (grid) {
        grid.classList.toggle('hdr-one-col', mainEmpty !== infoEmpty);
        const m = grid.querySelector('.balance-main');
        const i = grid.querySelector('.balance-info');
        if (m) m.classList.toggle('hdr-off', mainEmpty);
        if (i) i.classList.toggle('hdr-off', infoEmpty);
    }
    if (card) card.classList.toggle('hdr-off', mainEmpty && infoEmpty);
    const limits = header.querySelector('.limits');
    if (limits) limits.classList.toggle('hdr-off', off('limit') && off('savings'));
    const zoom = (sel, v) => header.querySelectorAll(sel).forEach(el => { el.style.zoom = v === 1 ? '' : String(v); });
    zoom('#balance', hp.balance);
    zoom('#hdr-time', hp.time);
    zoom('.balance-main > .balance-label, .limits, #hdr-date, .info-lines', hp.text);
    if (typeof updateMobileNavHeight === 'function') updateMobileNavHeight();
}

function renderHeaderSettings() {
    const box = document.getElementById('header-settings');
    if (!box) return;
    const hp = uiPrefs.header;
    const slider = (key, label) => `
        <label class="hdr-slider">
            <span>${label}: <b id="hdr-val-${key}">${Math.round(hp[key] * 100)}%</b></span>
            <input type="range" min="0.6" max="2" step="0.05" value="${hp[key]}" oninput="setHeaderScale('${key}', this.value)" onchange="commitUiPrefs()">
        </label>`;
    box.innerHTML = `
        <div class="hdr-parts">
            ${HEADER_PARTS.map(p => `<label class="hdr-part"><input type="checkbox" ${hp.hide.includes(p.id) ? '' : 'checked'} onchange="toggleHeaderPart('${p.id}', this.checked)"> ${p.name}</label>`).join('')}
        </div>
        ${slider('balance', 'Цифры баланса')}
        ${slider('time', 'Цифры времени')}
        ${slider('text', 'Надписи и строки')}
        <button type="button" class="btn-secondary btn-block" onclick="resetHeaderPrefs()"><span class="material-icons">restart_alt</span> Вернуть как было</button>`;
}

function toggleHeaderPart(id, show) {
    const hide = uiPrefs.header.hide.filter(x => x !== id);
    if (!show) hide.push(id);
    uiPrefs.header.hide = hide;
    applyHeaderPrefs();
    renderHeaderSettings();
    commitUiPrefs();
}

function setHeaderScale(key, value) {
    uiPrefs.header[key] = Math.round(Number(value) * 100) / 100;
    const v = document.getElementById('hdr-val-' + key);
    if (v) v.textContent = Math.round(uiPrefs.header[key] * 100) + '%';
    applyHeaderPrefs();
}

function resetHeaderPrefs() {
    uiPrefs.header = normalizeUiPrefs(null).header;
    applyHeaderPrefs();
    renderHeaderSettings();
    commitUiPrefs();
}

function openHeaderSettings() {
    showTab('settings');
    const card = document.getElementById('header-settings-card');
    if (!card) return;
    card.classList.remove('is-collapsed');
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// ---------- Разметка: ПК по центру, колонки, плотность; вид меню (внизу / слева / гамбургер) ----------
// Всё задаётся атрибутами на <html>, оформление — css/layout.css.
function isDesktopView() {
    return window.innerWidth >= 769;
}

function applyLayoutPrefs() {
    const l = uiPrefs.layout;
    const root = document.documentElement;
    const desktop = isDesktopView();
    root.setAttribute('data-pc-width', l.pcWidth);
    root.style.setProperty('--pc-width-pct', l.widthPct + 'vw');
    root.setAttribute('data-pc-cols', l.pcCols);
    root.setAttribute('data-density', l.density);
    const menu = desktop ? l.pcMenu : l.mobileMenu;
    root.setAttribute('data-menu', menu);
    root.toggleAttribute('data-pc-splash', l.pcSplash);
    if (menu !== 'burger') toggleBurgerMenu(false);
    if (typeof updateMobileNavHeight === 'function') updateMobileNavHeight();
    window.dispatchEvent(new Event('app-layout'));
}

function setLayoutPref(key, value) {
    if (key === 'widthPct') value = Math.round(Number(value));
    if (key === 'pcSplash' || key === 'noBlocks') value = !!value;
    uiPrefs.layout = normalizeLayoutPrefs({ ...uiPrefs.layout, [key]: value });
    applyLayoutPrefs();
    if (key !== 'widthPct') renderLayoutSettings();
    else { const v = document.getElementById('lay-width-val'); if (v) v.textContent = uiPrefs.layout.widthPct + '%'; }
    commitUiPrefs();
}

function toggleBurgerMenu(open) {
    const root = document.documentElement;
    const next = typeof open === 'boolean' ? open : !root.classList.contains('menu-open');
    root.classList.toggle('menu-open', next);
    const btn = document.getElementById('burger-btn');
    if (btn) btn.setAttribute('aria-expanded', String(next));
    if (typeof open !== 'boolean' && typeof playSound === 'function') playSound(next ? 'open' : 'close');
}

function renderLayoutSettings() {
    const box = document.getElementById('layout-settings');
    if (!box) return;
    const l = uiPrefs.layout;
    const seg = (key, opts) => `<div class="seg-buttons" role="radiogroup">${opts.map(([v, label]) =>
        `<button type="button" role="radio" aria-checked="${String(l[key]) === v}" class="seg-btn${String(l[key]) === v ? ' is-on' : ''}" onclick="setLayoutPref('${key}', '${v}')">${label}</button>`).join('')}</div>`;
    box.innerHTML = `
        <h4 class="font-sub">Страницы вместо блоков</h4>
        <label class="hdr-part"><input type="checkbox" ${l.noBlocks ? 'checked' : ''} onchange="setLayoutPref('noBlocks', this.checked)"> Каждый блок — отдельная страница</label>
        <p class="hint">Вместо сетки блоков в каждом разделе — один блок на весь экран. Если блоков немного, они переключаются вкладками сверху, если много — списком. Кнопки размера, «На стену», «свернуть» и «развернуть» убираются. «Стена» остаётся как есть. Не действует в темах «Windows 95_Пуск» и «Windows 95_Экстра» (у них свои окна).</p>
        <h4 class="font-sub">Меню на телефоне</h4>
        ${seg('mobileMenu', [['bottom', 'Внизу'], ['left', 'Слева'], ['burger', 'Гамбургер ☰']])}
        <div class="layout-pc-only">
            <h4 class="font-sub">Меню на ПК</h4>
            ${seg('pcMenu', [['left', 'Слева'], ['burger', 'Гамбургер ☰']])}
            <h4 class="font-sub">Ширина приложения на ПК</h4>
            ${seg('pcWidth', [['auto', 'По центру 16:9'], ['narrow', 'Узко'], ['custom', 'Своя'], ['full', 'Во весь экран']])}
            ${l.pcWidth === 'custom' ? `<label class="hdr-slider"><span>Ширина: <b id="lay-width-val">${l.widthPct}%</b> экрана</span>
                <input type="range" min="50" max="100" step="5" value="${l.widthPct}" oninput="setLayoutPref('widthPct', this.value)"></label>` : ''}
            <p class="hint">«По центру 16:9»: на очень широких экранах приложение не растягивается, а стоит посередине.</p>
            <h4 class="font-sub">Блоки в строке</h4>
            ${seg('pcCols', [['auto', 'Авто'], ['1', '1'], ['2', '2'], ['3', '3']])}
            <h4 class="font-sub">Плотность</h4>
            ${seg('density', [['compact', 'Компактно'], ['normal', 'Обычно'], ['roomy', 'Просторно']])}
            <label class="hdr-part"><input type="checkbox" ${l.pcSplash ? 'checked' : ''} onchange="setLayoutPref('pcSplash', this.checked)"> Экран приветствия с ползунком при запуске на ПК</label>
        </div>`;
}

// ---------- Экран приветствия: баланс, траты за сегодня, главная цель ----------
function renderSplashExtra() {
    const el = document.getElementById('splash-extra');
    if (!el || typeof transactions === 'undefined') return;
    const balance = transactions.reduce((a, tx) => tx.type === 'income' ? a + tx.amount : a - tx.amount, 0);
    const today = almatyIsoNow().slice(0, 10);
    const spent = transactions.filter(tx => tx.type === 'expense' && !tx.isSystem && getTxDateStr(tx.date) === today).reduce((s, tx) => s + tx.amount, 0);
    const fmt = n => Math.round(n).toLocaleString('ru-RU') + ' ₸';
    let goalHtml = '';
    if (typeof sortedGoals === 'function') {
        const g = sortedGoals().find(x => goalSaved(x) < x.price);
        if (g) goalHtml = `<div class="splash-stat"><span>Цель</span><b data-i18n-skip>${escapeHtml(g.title.slice(0, 40))}</b><small>${Math.round(goalSaved(g) / g.price * 100)}%</small></div>`;
    }
    el.innerHTML = `<div class="splash-stat"><span>Баланс</span><b>${fmt(balance)}</b></div>
        <div class="splash-stat"><span>Потрачено сегодня</span><b>${fmt(spent)}</b></div>${goalHtml}`;
}

window.addEventListener('DOMContentLoaded', () => {
    enhanceCards();
    applyHeaderPrefs();
    renderHeaderSettings();
    applyLayoutPrefs();
    renderLayoutSettings();
    // гамбургер: выбор пункта закрывает меню
    const nav = document.getElementById('sidebar-nav');
    if (nav) nav.addEventListener('click', e => { if (e.target.closest('button')) toggleBurgerMenu(false); });
    // заставка на ПК открывается и клавишей Enter / пробелом
    document.addEventListener('keydown', e => {
        const splash = document.getElementById('splash-screen');
        if ((e.key === 'Enter' || e.key === ' ') && splash && !splash.classList.contains('is-gone') && getComputedStyle(splash).display !== 'none' && typeof proceedFromSplash === 'function') {
            e.preventDefault();
            proceedFromSplash();
        }
        if (e.key === 'Escape' && document.documentElement.classList.contains('menu-open')) toggleBurgerMenu(false);
    });
});
window.addEventListener('load', renderSplashExtra);
let layoutWasDesktop = null;
window.addEventListener('resize', () => {
    const d = isDesktopView();
    if (d !== layoutWasDesktop) { layoutWasDesktop = d; applyLayoutPrefs(); }
});
