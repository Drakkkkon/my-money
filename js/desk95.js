// --- ТЕМА «WINDOWS 95_ПУСК» (И ПАПКА «WINDOWS 95_ЭКСТРА»): РАБОЧИЙ СТОЛ, ОКНА, ПАНЕЛЬ ЗАДАЧ, МЕНЮ «ПУСК», ОБОИ ---
// Отдельная тема с другой логикой. После заставки и ПИН-кода — рабочий стол со значками разделов меню (Записи, Стена, Подписки,
// Зарплата, Статистика, Отчёты, Цели, Котировки, Цены, Настройки; порядок и набор — как в Настройки → «Пункты меню») и панелью задач внизу.
// Нажатие на значок открывает страницу в окне с анимацией (рамка «растёт» из значка, как в Windows 95); страница в окне — обычная
// страница сайта, но без блока с балансом, датой и временем, на сером «рабочем поле». Крестик закрывает окно, «_» сворачивает,
// «□» разворачивает (на ПК), заголовок окна можно двигать.
//
// 4.7.0:
// • Окна бывают двух видов. Окно СТРАНИЦЫ показывает страницу целиком (ключ окна — id страницы). Окно БЛОКА показывает один блок
//   страницы (ключ — «b:<id блока>»): блок переезжает из страницы в окно, на его месте остаётся заглушка «открыт в отдельном окне»
//   (как у «Стены»), при закрытии окна блок возвращается на своё место. «Пуск» открывает именно окно блока, а не страницу целиком.
// • У блоков больше нет синей полосы с кнопками «закрыть / развернуть / на стену»: всё это переехало в строку меню окна
//   (js/desk95-menu.js: Файл, Правка, Вид, Блоки), у блока остаётся плоская подпись.
// • «Пуск» → страница → диалог-«табличка» (значок слева, название блока, размер, кнопка «На стол»).
// • Остальное — отдельными файлами: js/desk95-desktop.js (значки на столе: страницы и блоки, перетаскивание куда угодно),
//   js/desk95-tools.js (часы и дата на панели задач, кнопка масштаба в углу каждого окна).
//
// Панель задач: слева кнопка «Пуск», дальше квадратная иконка (без подписи) на каждое открытое окно — как в Windows 95
// (нажатая — окно сверху, поднятая — свёрнуто; нажатие сворачивает или возвращает окно), справа часы с датой и квадратная кнопка «Свернуть все».
// Название окна — всплывающей подсказкой: при наведении мыши или при долгом нажатии пальцем.
// Обои: Настройки → «Обои рабочего стола» → «Изменить обои» (js/desk95-walls.js, 18 классических обоев).
//
// Как это устроено: раздел (div.tab) по-прежнему тот же самый элемент с теми же id и обработчиками — он только переезжает
// из <main> страницы в <main> окна и возвращается обратно при закрытии (карточка блока — так же). Все остальные темы этот файл
// не затрагивает: пока тема не выбрана, ничего не создаётся. Оформление — css/desk95.css (только при html[data-w95="desk95"]).
//
// Общий объект window.DESK95 — доступ для файлов desk95-menu.js, desk95-desktop.js, desk95-tools.js (подключаются после этого).

(function () {
    'use strict';

    const THEME = 'desk95';
    const WALL_KEY = 'finance_desk95_wall';
    const root = document.documentElement;
    const isDesk = () => root.getAttribute('data-w95') === THEME;
    const isWide = () => window.innerWidth >= 769; // как isDesktopView() в js/layout.js
    const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const sound = (n) => { try { if (typeof playSound === 'function') playSound(n); } catch (e) {} };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iconSvg = (id) => (window.DESK95_ICONS && (window.DESK95_ICONS[id] || window.DESK95_ICONS.generic)) || '';
    const toast = (t) => { try { if (typeof showToast === 'function') showToast(t); } catch (e) {} };
    const glyphHtml = (g) => `<span class="bglyph"><span class="material-icons">${esc(g || 'view_agenda')}</span></span>`;

    // ---------- общий объект для остальных файлов темы ----------
    const D = window.DESK95 = {
        _h: {},
        on(name, fn) { (this._h[name] = this._h[name] || []).push(fn); },
        emit(name, ...args) { (this._h[name] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error('desk95:' + name, e); } }); },
        esc, sound, toast, isWide, reduceMotion, iconSvg, glyphHtml
    };

    let started = false;      // рабочий стол построен (тема выбрана)
    let root95 = null;        // #desk95 — весь экран темы
    let stage = null;         // .desk-stage — рабочий стол над панелью задач: значки и окна
    let iconsBox = null;      // контейнер значков
    let bar = null;           // панель задач
    let startBtn = null;      // «Пуск»
    let tasksBox = null;      // иконки открытых окон
    let minBtn = null;        // «Свернуть все»
    let menu = null;          // меню «Пуск»
    let flyout = null;        // диалог с блоками страницы (открыт или null)
    let tip = null;           // всплывающая подсказка
    let origWrap = null;      // обычная страница (.main-wrapper), скрыта темой
    let origMain = null;      // её <main>: сюда возвращаются закрытые разделы
    const wins = new Map();   // ключ окна → { key, id, kind, page, title, el, body, main, tab|card, min, max } (в порядке открытия)
    const taskBtns = new Map(); // ключ окна → кнопка на панели задач
    let order = [];           // ключи окон: впереди — верхнее
    let cascade = 0;          // сдвиг каждого нового окна на ПК

    // исходные функции script.js, extras.js: их вызывает тема, остальные темы работают как раньше
    const orig = {
        showTab: typeof window.showTab === 'function' ? window.showTab : null,
        renderMenus: typeof window.renderMenus === 'function' ? window.renderMenus : null,
        swipeBlocked: typeof window.swipeBlocked === 'function' ? window.swipeBlocked : null,
        editTx: typeof window.editTx === 'function' ? window.editTx : null
    };

    // ---------- меню ----------
    function menuItems() {
        const items = typeof MENU_ITEMS !== 'undefined' ? MENU_ITEMS : [];
        let ids = items.map(i => i.id);
        try {
            if (typeof getMenuState === 'function') {
                const st = getMenuState();
                ids = st.order.filter(id => !st.hidden.includes(id));
            }
        } catch (e) {}
        return ids.map(id => items.find(i => i.id === id)).filter(Boolean);
    }
    const itemOf = (id) => (typeof MENU_ITEMS !== 'undefined' ? MENU_ITEMS : []).find(i => i.id === id);
    const blockKey = (cardId) => 'b:' + cardId;

    // ---------- построение рабочего стола ----------
    function build() {
        const wrapper = document.querySelector('.app-wrapper');
        origWrap = document.querySelector('.main-wrapper');
        origMain = origWrap ? origWrap.querySelector(':scope > main') : null;
        if (!wrapper || !origMain) return false;

        root95 = document.createElement('div');
        root95.id = 'desk95';
        root95.innerHTML =
            '<div class="desk-stage"><div class="desk-icons" role="group" aria-label="Рабочий стол"></div></div>' +
            '<div class="desk-taskbar" role="toolbar" aria-label="Панель задач">' +
            '<button type="button" id="desk-start" class="tb-start" aria-haspopup="true" aria-expanded="false" aria-controls="desk-start-menu">' +
            '<span class="tb-start-ico"></span><span class="tb-start-text">Пуск</span></button>' +
            '<span class="tb-sep" aria-hidden="true"></span>' +
            '<div class="tb-tasks" role="group" aria-label="Открытые окна"></div>' +
            '<span class="tb-sep" aria-hidden="true"></span>' +
            '<div class="tb-tray" role="timer" aria-label="Время и дата"></div>' +
            '<button type="button" id="desk-min-all" class="is-idle" data-tip="Свернуть все" aria-label="Свернуть все"></button>' +
            '</div>' +
            '<div id="desk-start-menu" class="desk-start-menu" role="menu" aria-label="Пуск" hidden></div>' +
            '<div class="desk-tip" role="tooltip" hidden></div>';
        wrapper.appendChild(root95);
        stage = root95.querySelector('.desk-stage');
        iconsBox = root95.querySelector('.desk-icons');
        bar = root95.querySelector('.desk-taskbar');
        startBtn = root95.querySelector('#desk-start');
        tasksBox = root95.querySelector('.tb-tasks');
        minBtn = root95.querySelector('#desk-min-all');
        menu = root95.querySelector('#desk-start-menu');
        tip = root95.querySelector('.desk-tip');
        startBtn.querySelector('.tb-start-ico').innerHTML = iconSvg('start');
        minBtn.innerHTML = iconSvg('minall');

        minBtn.addEventListener('click', () => { if (!consumeLongPress()) minimizeAll(); });

        // панель задач: иконка окна — свернуть / вернуть / поднять окно
        tasksBox.addEventListener('click', (e) => {
            const b = e.target.closest('.tb-task');
            if (!b || consumeLongPress()) return;
            const w = wins.get(b.dataset.key);
            if (!w) return;
            hideTip();
            closeMenus();
            D.emit('closepopups');
            if (w.min) present(w, b);
            else if (frontWin() === w) { minimize(w); const f = frontWin(); if (f) focusWin(f); else syncIconStates(); sound('close'); }
            else focusWin(w);
        });
        startBtn.addEventListener('click', () => toggleStart());
        menu.addEventListener('click', onMenuClick);
        setupTips();

        D.emit('build', { root: root95, stage, iconsBox, bar });
        renderStart();
        applyWall();
        return true;
    }

    function syncIconStates() {
        if (minBtn) minBtn.classList.toggle('is-idle', !frontWin());
        D.emit('states');
        syncTasks();
    }

    // ---------- панель задач ----------
    // Квадратные иконки без подписи: по кнопке на каждое открытое окно, в порядке открытия.
    // Нажатая (is-active) — окно сверху, поднятая (is-min) — окно свёрнуто.
    function syncTasks() {
        if (!tasksBox) return;
        const f = frontWin();
        taskBtns.forEach((b, key) => { if (!wins.has(key)) { b.remove(); taskBtns.delete(key); } });
        let prev = null;
        wins.forEach((w, key) => {
            let b = taskBtns.get(key);
            if (!b) {
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'tb-task';
                b.dataset.key = key;
                b.innerHTML = w.iconHtml;
                taskBtns.set(key, b);
            }
            b.classList.toggle('is-block', w.kind === 'block');
            b.dataset.tip = w.title;
            b.setAttribute('aria-label', w.title);
            b.classList.toggle('is-min', !!w.min);
            b.classList.toggle('is-active', f === w);
            b.setAttribute('aria-pressed', f === w ? 'true' : 'false');
            const want = prev ? prev.nextSibling : tasksBox.firstChild;
            if (b.parentNode !== tasksBox || (prev ? b.previousSibling !== prev : b !== tasksBox.firstChild)) tasksBox.insertBefore(b, want);
            prev = b;
        });
    }

    // ---------- подсказки: наведение мыши и долгое нажатие пальцем ----------
    let tipFor = null, hoverT = 0, pressT = 0, hideT = 0, pressed = false, pressedT = 0;
    function showTip(el) {
        if (!tip || !el || !el.dataset.tip) return;
        tip.textContent = el.dataset.tip;
        tip.hidden = false;
        const R = root95.getBoundingClientRect(), b = el.getBoundingClientRect();
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        const left = Math.max(4, Math.min(b.left - R.left + b.width / 2 - tw / 2, R.width - tw - 4));
        tip.style.left = Math.round(left) + 'px';
        tip.style.top = Math.round(b.top - R.top - th - 6) + 'px';
        tipFor = el;
    }
    function hideTip() {
        clearTimeout(hoverT); clearTimeout(pressT); clearTimeout(hideT);
        tipFor = null;
        if (tip) tip.hidden = true;
    }
    // после долгого нажатия палец отпускается — браузер может прислать «click»: его глотаем, чтобы окно не свернулось
    function consumeLongPress() {
        if (!pressed) return false;
        pressed = false;
        clearTimeout(pressedT);
        return true;
    }
    function setupTips() {
        bar.addEventListener('pointerover', (e) => {
            if (e.pointerType === 'touch') return;
            const el = e.target.closest('[data-tip]');
            if (!el || el === tipFor) return;
            clearTimeout(hoverT);
            hoverT = setTimeout(() => showTip(el), 380);
        });
        bar.addEventListener('pointerout', (e) => {
            if (e.pointerType === 'touch') return;
            const el = e.target.closest('[data-tip]');
            if (el && el.contains(e.relatedTarget)) return;
            hideTip();
        });
        bar.addEventListener('pointerdown', (e) => {
            hideTip();
            const el = e.target.closest('[data-tip]');
            if (!el || e.pointerType !== 'touch') return;
            pressT = setTimeout(() => {
                showTip(el);
                pressed = true;
                clearTimeout(pressedT);
                pressedT = setTimeout(() => { pressed = false; }, 900);
                hideT = setTimeout(hideTip, 2400);
            }, 450);
        });
        ['pointerup', 'pointercancel'].forEach(t => bar.addEventListener(t, () => clearTimeout(pressT)));
        bar.addEventListener('contextmenu', (e) => e.preventDefault()); // долгое нажатие на телефоне не открывает системное меню
        bar.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.tip && e.target.matches(':focus-visible')) showTip(e.target); });
        bar.addEventListener('focusout', hideTip);
    }

    // ---------- меню «Пуск» ----------
    function renderStart() {
        if (!menu) return;
        menu.innerHTML =
            '<div class="sm-banner" aria-hidden="true"><span><b>Money</b> Pro 95</span></div>' +
            '<div class="sm-list">' + menuItems().map(it =>
                `<button type="button" class="sm-item" role="menuitem" aria-haspopup="dialog" data-id="${esc(it.id)}">` +
                `<span class="sm-ico">${iconSvg(it.id)}</span><span class="sm-label">${esc(it.label)}</span><span class="sm-arrow" aria-hidden="true"></span></button>`).join('') +
            '</div>';
    }

    const menuOpen = () => !!(menu && !menu.hidden);

    function toggleStart(force) {
        if (!started) return;
        const open = typeof force === 'boolean' ? force : !menuOpen();
        if (open === menuOpen()) return;
        hideTip();
        if (open) {
            closeWallDialog();
            D.emit('closepopups');
            menu.hidden = false;
            startBtn.classList.add('is-open');
            startBtn.setAttribute('aria-expanded', 'true');
            sound('open');
        } else {
            closeMenus();
        }
    }

    // silent — без звука (например, когда меню закрывается, потому что открывается окно)
    function closeMenus(silent) {
        closeFlyout();
        if (!menu) return;
        const was = !menu.hidden;
        menu.hidden = true;
        if (startBtn) { startBtn.classList.remove('is-open'); startBtn.setAttribute('aria-expanded', 'false'); }
        if (was && !silent) sound('close');
    }

    function onMenuClick(e) {
        const b = e.target.closest('.sm-item');
        if (!b) return;
        if (flyout && flyout.dataset.id === b.dataset.id) { closeFlyout(); return; }
        openFlyout(b.dataset.id, b);
    }

    // ---------- блоки страницы ----------
    // Блоки страницы — карточки (.card) с заголовком. Список собирается в момент открытия, поэтому учитывает блоки, закреплённые на «Стене»
    // (они в списке «Стены»), и блоки, которые сейчас открыты в своих окнах (на их месте в странице стоит заглушка .desk-ph).
    function cardTitle(h3) {
        const c = h3.cloneNode(true);
        c.querySelectorAll('.material-icons, button, .w95-ctls, .w95-ctl, .wall-tools, .cl-tag').forEach(n => n.remove());
        return c.textContent.replace(/\s+/g, ' ').trim();
    }

    // Описание блока: { el, id, title, icon, page } или null, если это не блок с заголовком
    function metaOf(card) {
        const h3 = card.querySelector(':scope > h3') || card.querySelector('h3');
        if (!h3) return null;
        const title = cardTitle(h3);
        if (!title) return null;
        const mi = h3.querySelector('.material-icons');
        const icon = mi && /^[a-z0-9_]{2,40}$/.test(mi.textContent.trim()) ? mi.textContent.trim() : 'view_agenda';
        const tab = card.closest('main > .tab');
        const page = (tab && tab.id) || card.dataset.deskPage || '';
        if (page) card.dataset.deskPage = page;
        return { el: card, id: card.id || '', title, icon, page };
    }

    function blocksOf(id) {
        const tab = document.getElementById(id);
        if (!tab) return [];
        const admin = root.getAttribute('data-admin') === '1';
        const shown = getComputedStyle(tab).display !== 'none'; // страница сейчас в окне: можно спросить у браузера, виден ли блок
        const out = [];
        const consider = (card, inWin) => {
            if (card.parentElement && card.parentElement.closest('.card')) return; // блок внутри блока
            if (card.id === 'header-settings-card') return; // настройка блока баланса: в этой теме такого блока нет
            if (card.hidden || card.closest('[hidden]') || card.style.display === 'none') return;
            if (!inWin && shown && getComputedStyle(card).display === 'none') return;
            if (card.hasAttribute('data-admin-only') && !admin) return;
            const m = metaOf(card);
            if (m) { m.page = id; out.push(m); }
        };
        tab.querySelectorAll('.card, .desk-ph').forEach(n => {
            if (n.classList.contains('desk-ph')) {
                const w = wins.get(blockKey(n.dataset.for));
                if (w && w.card) consider(w.card, true);
                return;
            }
            consider(n, false);
        });
        return out;
    }

    // ---------- «папка» страницы: диалог-табличка с блоками ----------
    const SIZE_NAMES = { s: 'Маленький', m: 'Средний', l: 'Большой' };
    const sizeNameOf = (cardId) => {
        try { const k = typeof cardSizeOf === 'function' ? cardSizeOf(cardId) : ''; return SIZE_NAMES[k] || 'Авто'; } catch (e) { return 'Авто'; }
    };

    function flyRow(b, i) {
        const onDesk = !!(D.desktop && b.id && D.desktop.hasBlock(b.id));
        const pin = b.id
            ? `<button type="button" class="fl-pin${onDesk ? ' is-on' : ''}" data-i="${i}" title="${onDesk ? 'Значок уже на рабочем столе — нажмите, чтобы убрать' : 'Добавить значок блока на рабочий стол'}" aria-pressed="${onDesk}">${onDesk ? '✓ На столе' : '+ На стол'}</button>`
            : '<span class="fl-pin-none" aria-hidden="true">—</span>';
        return `<div class="fl-row" role="row">` +
            `<button type="button" class="fl-main" role="cell" data-i="${i}" aria-label="${esc(b.title)}">` +
            `<span class="fl-namecell"><span class="fl-bico">${glyphHtml(b.icon)}</span><span class="fl-bname">${esc(b.title)}</span></span>` +
            `<span class="fl-size">${b.id ? esc(sizeNameOf(b.id)) : '—'}</span></button>` +
            `<span class="fl-deskcell" role="cell">${pin}</span></div>`;
    }

    function openFlyout(id, itemBtn) {
        closeFlyout();
        const it = itemOf(id);
        if (!it || !menu) return;
        const blocks = blocksOf(id);
        flyout = document.createElement('section');
        flyout.className = 'desk-flyout';
        flyout.dataset.id = id;
        flyout.setAttribute('role', 'dialog');
        flyout.setAttribute('aria-label', it.label);
        flyout.innerHTML =
            '<div class="desk-titlebar">' +
            `<span class="dt-icon">${iconSvg(id)}</span><span class="dt-title">${esc(it.label)} — блоки</span>` +
            '<span class="dt-btns"><button type="button" class="dt-btn dt-close fl-close" title="Закрыть" aria-label="Закрыть"></button></span></div>' +
            '<div class="fl-table" role="table" aria-label="Блоки страницы">' +
            '<div class="fl-head" role="row"><span class="fl-h-name" role="columnheader">Блок</span><span class="fl-h-size" role="columnheader">Размер</span><span class="fl-h-desk" role="columnheader">Рабочий стол</span></div>' +
            '<div class="fl-rows" role="rowgroup">' + (blocks.length ? blocks.map(flyRow).join('') : '<p class="fl-empty">На этой странице пока нет блоков.</p>') + '</div></div>' +
            `<div class="fl-status">Блоков: ${blocks.length} · нажмите на блок, чтобы открыть его в окне</div>` +
            '<div class="fl-btns"><button type="button" class="dlg-btn fl-open">Вся страница</button><button type="button" class="dlg-btn fl-close2">Закрыть</button></div>';
        root95.appendChild(flyout);
        flyout._blocks = blocks;
        menu.querySelectorAll('.sm-item.is-open').forEach(x => x.classList.remove('is-open'));
        if (itemBtn) itemBtn.classList.add('is-open');
        placeFlyout(itemBtn);
        sound('open');

        flyout.querySelector('.fl-close').addEventListener('click', () => { closeFlyout(); sound('close'); });
        flyout.querySelector('.fl-close2').addEventListener('click', () => { closeFlyout(); sound('close'); });
        flyout.querySelector('.fl-open').addEventListener('click', () => { closeMenus(true); open(id, startBtn); });
        flyout.querySelector('.fl-table').addEventListener('click', (e) => {
            const pin = e.target.closest('.fl-pin');
            if (pin) { toggleDeskBlock(blocks[Number(pin.dataset.i)]); return; }
            const b = e.target.closest('.fl-main');
            if (!b) return;
            const m = blocks[Number(b.dataset.i)];
            closeMenus(true);
            if (m.id) openBlock(m.id, startBtn);
            else open(id, startBtn, false, () => setTimeout(() => goToBlock(id, m.title, 0), 40)); // блок без id: страница целиком, прокрутка к блоку
        });
        // правый щелчок / долгое нажатие по строке — меню блока
        flyout.querySelector('.fl-table').addEventListener('contextmenu', (e) => {
            const r = e.target.closest('.fl-row');
            if (!r) return;
            e.preventDefault();
            const m = blocks[Number(r.querySelector('.fl-main').dataset.i)];
            if (D.menu && m && m.id) D.menu.popup(blockContextItems(m, id), { x: e.clientX, y: e.clientY });
        });
        flyout.addEventListener('keydown', onFlyoutKey);
    }

    function blockContextItems(m, pageId) {
        const onDesk = !!(D.desktop && D.desktop.hasBlock(m.id));
        return [
            { label: 'Открыть в окне', action: () => { closeMenus(true); openBlock(m.id, startBtn); } },
            { label: 'Открыть всю страницу', action: () => { closeMenus(true); open(pageId, startBtn); } },
            { sep: true },
            { label: onDesk ? 'Убрать значок с рабочего стола' : 'Добавить на рабочий стол', action: () => toggleDeskBlock(m) }
        ];
    }

    function toggleDeskBlock(m) {
        if (!m || !m.id || !D.desktop) return;
        if (D.desktop.hasBlock(m.id)) D.desktop.removeBlock(m.id);
        else D.desktop.addBlock({ id: m.id, page: m.page, title: m.title, icon: m.icon });
        refreshFlyoutPins();
    }

    function refreshFlyoutPins() {
        if (!flyout || !flyout._blocks) return;
        flyout.querySelectorAll('.fl-pin').forEach(p => {
            const m = flyout._blocks[Number(p.dataset.i)];
            const on = !!(m && D.desktop && D.desktop.hasBlock(m.id));
            p.classList.toggle('is-on', on);
            p.setAttribute('aria-pressed', String(on));
            p.textContent = on ? '✓ На столе' : '+ На стол';
            p.title = on ? 'Значок уже на рабочем столе — нажмите, чтобы убрать' : 'Добавить значок блока на рабочий стол';
        });
    }
    D.on('desk-blocks', refreshFlyoutPins);

    function placeFlyout(itemBtn) {
        if (!flyout) return;
        const wide = isWide();
        flyout.classList.toggle('is-sheet', !wide);
        flyout.style.left = flyout.style.top = '';
        if (!wide) return;
        const R = root95.getBoundingClientRect(), m = menu.getBoundingClientRect();
        const w = flyout.offsetWidth, h = flyout.offsetHeight, tb = bar.offsetHeight;
        let left = m.right - R.left - 2;
        if (left + w > R.width - 4) left = Math.max(4, R.width - w - 4);
        const ib = itemBtn ? itemBtn.getBoundingClientRect() : m;
        const top = Math.max(4, Math.min(ib.top - R.top - 3, R.height - tb - h - 4));
        flyout.style.left = Math.round(left) + 'px';
        flyout.style.top = Math.round(top) + 'px';
    }

    function closeFlyout() {
        if (!flyout) return;
        flyout.remove();
        flyout = null;
        if (menu) menu.querySelectorAll('.sm-item.is-open').forEach(x => x.classList.remove('is-open'));
    }

    function onFlyoutKey(e) {
        const mains = [...flyout.querySelectorAll('.fl-main')];
        const a = document.activeElement;
        const i = mains.indexOf(a);
        let n = -1;
        if (e.key === 'ArrowDown') n = Math.min(mains.length - 1, i + 1);
        else if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
        if (n >= 0 && mains.length) { e.preventDefault(); mains[n].focus(); return; }
        if (e.key === 'ArrowRight' && i >= 0) { const p = a.closest('.fl-row').querySelector('.fl-pin'); if (p) { e.preventDefault(); p.focus(); } }
        else if (e.key === 'ArrowLeft' && a.classList.contains('fl-pin')) { e.preventDefault(); a.closest('.fl-row').querySelector('.fl-main').focus(); }
    }

    // Прокрутить страницу в окне к блоку и ненадолго подсветить его
    function flashBlock(w, card) {
        if (!w || !card) return;
        const sc = w.body;
        const top = card.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 8;
        try { sc.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (e) { sc.scrollTop = Math.max(0, top); }
        card.classList.remove('desk-flash');
        void card.offsetWidth;
        card.classList.add('desk-flash');
        setTimeout(() => card.classList.remove('desk-flash'), 1700);
    }

    function goToBlock(id, title, idx) {
        const w = wins.get(id);
        if (!w || w.min) return;
        const list = blocksOf(id);
        const b = list.find(x => x.title === title) || list[idx];
        if (b) flashBlock(w, b.el);
    }

    // меню закрывается нажатием в любом другом месте и клавишей Esc; Ctrl+Esc открывает «Пуск», как в Windows
    document.addEventListener('pointerdown', (e) => {
        if (!started) return;
        if (menuOpen() && !e.target.closest('#desk-start-menu, .desk-flyout, #desk-start, .desk-dd')) closeMenus();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (!started || e.key !== 'Escape') return;
        if (e.ctrlKey) { e.preventDefault(); toggleStart(); return; }
        if (wallModal) { closeWallDialog(); return; }
        if (flyout) {
            const id = flyout.dataset.id;
            closeFlyout();
            const b = menu.querySelector(`.sm-item[data-id="${id}"]`);
            if (b) b.focus();
            return;
        }
        if (menuOpen()) { closeMenus(); startBtn.focus(); }
    });
    // стрелки вверх и вниз по пунктам «Пуска»
    document.addEventListener('keydown', (e) => {
        if (!started || !menuOpen() || !menu.contains(document.activeElement)) return;
        const items = [...menu.querySelectorAll('.sm-item')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'ArrowRight' && i >= 0) { e.preventDefault(); items[i].click(); const f = flyout && flyout.querySelector('.fl-main'); if (f) f.focus(); }
    });

    // ---------- окна ----------
    function frontWin() {
        for (const key of order) {
            const w = wins.get(key);
            if (w && !w.min) return w;
        }
        return null;
    }

    function applyZ() {
        order.forEach((key, i) => {
            const w = wins.get(key);
            if (w) w.el.style.zIndex = String(10 + (order.length - i));
        });
    }

    function focusWin(w) {
        order = [w.key].concat(order.filter(x => x !== w.key));
        applyZ();
        wins.forEach(x => x.el.classList.toggle('is-inactive', x !== w));
        if (typeof currentTabId === 'string') currentTabId = w.page || w.id;
        syncIconStates();
    }

    // Ширина полосы со значками страниц (справа от неё на ПК открываются окна, чтобы значки оставались доступны)
    function iconStripWidth() {
        return D.iconStrip ? D.iconStrip() : 0;
    }

    // Размер и положение нового окна: на телефоне окно на весь экран (css), на ПК — большое окно справа от значков со сдвигом «лесенкой».
    // Окно блока уже и по высоте ровно по содержимому.
    function placeWin(w) {
        if (!isWide()) return;
        const W = stage.clientWidth, H = stage.clientHeight, n = cascade++ % 5;
        const strip = iconStripWidth(), free = W - strip - 14;
        if (w.kind === 'block') {
            const width = Math.max(300, Math.min(580, free - 20, W - 12));
            const left = strip + 18 + n * 24;
            w.el.style.width = width + 'px';
            w.el.style.height = '';
            w.el.style.left = Math.max(6, Math.min(left, W - width - 6)) + 'px';
            w.el.style.top = (14 + n * 22) + 'px';
            return;
        }
        const width = Math.min(1100, Math.max(Math.min(640, W - 12), free)), height = Math.max(240, Math.min(920, H - 100));
        const slack = Math.max(0, free - width); // свободное место справа от значков: окно стоит посередине и сдвигается лесенкой
        const left = strip + Math.max(0, Math.min(slack, Math.round(slack / 2) + (n - 2) * 22));
        w.el.style.width = width + 'px';
        w.el.style.height = height + 'px';
        w.el.style.left = Math.max(6, Math.min(left, W - width - 6)) + 'px';
        w.el.style.top = (10 + n * 20) + 'px';
    }

    // Общая «оболочка» окна: заголовок с кнопками, место под меню, тело с <main>
    function makeWin(spec) {
        const el = document.createElement('section');
        el.className = 'desk-win' + (spec.kind === 'block' ? ' is-block' : '');
        el.dataset.key = spec.key;
        el.dataset.kind = spec.kind;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', spec.title);
        el.innerHTML =
            '<div class="desk-titlebar">' +
            `<span class="dt-icon">${spec.titleIcon}</span><span class="dt-title">${esc(spec.title)}</span>` +
            '<span class="dt-btns">' +
            '<button type="button" class="dt-btn dt-min" title="Свернуть" aria-label="Свернуть"></button>' +
            '<button type="button" class="dt-btn dt-max" title="Развернуть" aria-label="Развернуть"></button>' +
            '<button type="button" class="dt-btn dt-close" title="Закрыть" aria-label="Закрыть"></button>' +
            '</span></div>' +
            '<div class="desk-body"><main></main></div>';
        const w = {
            key: spec.key, id: spec.key, kind: spec.kind, page: spec.page, title: spec.title, iconHtml: spec.taskIcon,
            el, body: el.querySelector('.desk-body'), main: el.querySelector('main'), min: false, max: false
        };
        stage.appendChild(el);
        wins.set(w.key, w);
        order.unshift(w.key);

        const bar2 = el.querySelector('.desk-titlebar');
        el.querySelector('.dt-min').addEventListener('click', () => { minimize(w); const f = frontWin(); if (f) focusWin(f); else syncIconStates(); sound('close'); });
        el.querySelector('.dt-max').addEventListener('click', () => toggleMax(w));
        el.querySelector('.dt-close').addEventListener('click', () => closeWin(w.key));
        bar2.addEventListener('dblclick', (e) => { if (!e.target.closest('.dt-btn')) toggleMax(w); });
        el.addEventListener('pointerdown', () => { if (order[0] !== w.key && !w.min) focusWin(w); }, true);
        enableDrag(w, bar2);
        return w;
    }

    function createWindow(id) {
        const it = itemOf(id);
        const w = makeWin({ key: id, kind: 'page', page: id, title: it.label, titleIcon: iconSvg(id), taskIcon: iconSvg(id) });
        w.tab = document.getElementById(id);
        w.main.appendChild(w.tab);
        D.emit('win', w);
        placeWin(w);
        return w;
    }

    // Окно одного блока: карточка переезжает в окно, на её месте остаётся заглушка
    function createBlockWindow(card, m) {
        const w = makeWin({ key: blockKey(m.id), kind: 'block', page: m.page, title: m.title, titleIcon: glyphHtml(m.icon), taskIcon: glyphHtml(m.icon) });
        w.card = card;
        w.icon = m.icon;
        // свёрнутый «_» блок в окне не бывает: кнопки сворачивания у блоков в этой теме нет, а окно — это и есть блок
        if (card.classList.contains('is-collapsed')) {
            const mb = card.querySelector(':scope > h3 .w95-ctl-min');
            if (mb && typeof toggleCardCollapse === 'function') toggleCardCollapse(mb);
            card.classList.remove('is-collapsed');
        }
        const ph = document.createElement('div');
        ph.className = 'desk-ph';
        ph.dataset.for = m.id;
        ph.innerHTML = `<span class="material-icons">open_in_new</span><span class="ph-text">Блок «<b data-i18n-skip>${esc(m.title)}</b>» открыт в отдельном окне</span>` +
            '<button type="button" class="btn-secondary ph-back"><span class="material-icons">undo</span> Вернуть сюда</button>';
        ph.querySelector('.ph-back').addEventListener('click', () => closeWin(w.key));
        card.replaceWith(ph);
        w.ph = ph;
        const host = document.createElement('div');
        host.className = 'desk-blockhost';
        host.appendChild(card);
        w.main.appendChild(host);
        D.emit('win', w);
        placeWin(w);
        return w;
    }

    // Карточка блока возвращается на своё место (или, если страницу перерисовали заново, лишняя копия убирается)
    function restoreCard(w) {
        const card = w.card;
        if (!card) return;
        w.card = null;
        const dup = [...document.querySelectorAll(`[id="${CSS.escape(card.id)}"]`)].some(e => e !== card);
        if (w.ph && w.ph.isConnected) w.ph.replaceWith(card);
        else if (dup) { card.remove(); return; }
        else {
            const tab = document.getElementById(w.page) || origMain;
            if (tab) tab.appendChild(card);
        }
        if (w.ph && w.ph.isConnected) w.ph.remove();
        w.ph = null;
        card.classList.remove('desk-flash');
    }

    function toggleMax(w) {
        if (!isWide()) return;
        w.max = !w.max;
        w.el.classList.toggle('is-max', w.max);
        const b = w.el.querySelector('.dt-max');
        b.title = w.max ? 'Восстановить' : 'Развернуть';
        b.setAttribute('aria-label', b.title);
        window.dispatchEvent(new Event('resize')); // диаграммы и полосы прокрутки подстраиваются
    }

    function enableDrag(w, bar2) {
        bar2.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('.dt-btn') || !isWide() || w.max) return;
            const start = rectIn(w.el), sx = e.clientX, sy = e.clientY;
            try { bar2.setPointerCapture(e.pointerId); } catch (err) {}
            const move = (ev) => {
                const W = stage.clientWidth, H = stage.clientHeight;
                w.el.style.left = Math.max(-start.w + 120, Math.min(W - 60, start.x + ev.clientX - sx)) + 'px';
                w.el.style.top = Math.max(0, Math.min(H - 34, start.y + ev.clientY - sy)) + 'px';
            };
            const up = () => {
                bar2.removeEventListener('pointermove', move);
                bar2.removeEventListener('pointerup', up);
                bar2.removeEventListener('pointercancel', up);
                window.dispatchEvent(new Event('resize'));
            };
            bar2.addEventListener('pointermove', move);
            bar2.addEventListener('pointerup', up);
            bar2.addEventListener('pointercancel', up);
        });
    }

    // ---------- анимация «рамка из значка в окно» (как в Windows 95) ----------
    // координаты — внутри #desk95 (рабочий стол начинается в его левом верхнем углу, поэтому для окон они те же, что в рабочем столе)
    function rectIn(el) {
        const r = el.getBoundingClientRect(), d = root95.getBoundingClientRect();
        return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
    }

    // Несколько пунктирных рамок ступенчато движутся от from к to, затем вызывается done
    function wire(from, to, ms, done) {
        if (reduceMotion() || !from || !to) { done(); return; }
        const N = 3, STEPS = 6, frames = [];
        for (let i = 0; i < N; i++) {
            const f = document.createElement('div');
            f.className = 'desk-wire';
            f.style.display = 'none';
            root95.appendChild(f);
            frames.push(f);
        }
        const t0 = performance.now();
        const lerp = (a, b, t) => a + (b - a) * t;
        const step = (now) => {
            const p = Math.min(1, (now - t0) / ms), k = Math.ceil(p * STEPS);
            frames.forEach((f, i) => {
                const kk = k - i;
                if (kk < 1) { f.style.display = 'none'; return; }
                const t = kk / STEPS;
                f.style.display = '';
                f.style.left = lerp(from.x, to.x, t) + 'px';
                f.style.top = lerp(from.y, to.y, t) + 'px';
                f.style.width = Math.max(2, lerp(from.w, to.w, t)) + 'px';
                f.style.height = Math.max(2, lerp(from.h, to.h, t)) + 'px';
            });
            if (p < 1 && k < STEPS + N) requestAnimationFrame(step);
            else { frames.forEach(f => f.remove()); done(); }
        };
        requestAnimationFrame(step);
    }

    // ---------- открыть / свернуть / закрыть ----------
    // Побочные действия обычного showTab (подсветка, «Котировки», «Цены», размеры блоков, журнал администратора),
    // при этом остальные открытые окна страниц остаются видимыми
    function runShowTab(page) {
        if (orig.showTab && page) orig.showTab(page, null);
        wins.forEach(x => { if (!x.min && x.tab) x.tab.style.display = ''; });
        if (typeof currentTabId === 'string' && page) currentTabId = page;
    }

    const iconElOf = (key, src) => (D.iconEl ? D.iconEl(key) : null) || src || null;

    // Показать окно (создано, но скрыто или свёрнуто): анимация и побочные действия страницы.
    // after — что сделать, когда окно открыто и страница показана (например, прокрутить к блоку из «Пуска»)
    function present(w, fromEl, instant, after) {
        if (!w.min && w.shown) { focusWin(w); if (after) after(w); return; } // уже открыто — на передний план
        w.min = false;
        w.el.classList.remove('is-min');
        focusWin(w);
        sound('open');

        const reveal = () => {
            w.el.style.visibility = '';
            w.busy = false;
            if (w.min || wins.get(w.key) !== w) return;
            w.shown = true;
            if (!instant) { w.el.classList.add('is-pop'); setTimeout(() => w.el.classList.remove('is-pop'), 200); }
            runShowTab(w.page);
            focusWin(w);
            window.dispatchEvent(new Event('resize'));
            D.emit('shown', w);
            if (after) after(w);
        };
        if (instant || reduceMotion()) { reveal(); return; }
        w.busy = true;
        w.el.style.visibility = 'hidden';
        const src = fromEl || taskBtns.get(w.key) || iconElOf(w.key);
        const from = src ? rectIn(src.querySelector('.di-img') || src) : null;
        wire(from, rectIn(w.el), 200, reveal);
    }

    // Страница целиком
    function open(id, fromEl, instant, after) {
        if (!started || !itemOf(id) || !document.getElementById(id)) return;
        let w = wins.get(id);
        if (!w) w = createWindow(id);
        present(w, fromEl, instant, after);
        return w;
    }

    // Один блок страницы
    function openBlock(cardId, fromEl, instant, after) {
        if (!started || !cardId) return null;
        let w = wins.get(blockKey(cardId));
        if (!w) {
            const card = document.getElementById(cardId);
            const m = card && metaOf(card);
            if (!m || !m.page || !itemOf(m.page)) { toast('Этот блок сейчас недоступен'); return null; }
            m.id = cardId;
            if (card.classList.contains('on-wall') || card.hasAttribute('data-wall-fixed')) {
                // блок на «Стене» остаётся на ней: открываем «Стену» целиком и показываем блок
                open('wall', fromEl, instant, (ww) => setTimeout(() => flashBlock(ww, card), 40));
                return null;
            }
            w = createBlockWindow(card, m);
        }
        present(w, fromEl, instant, after);
        return w;
    }

    function minimize(w) {
        if (w.min) return;
        w.min = true;
        const target = taskBtns.get(w.key) || iconElOf(w.key);
        const to = target ? rectIn(target.querySelector('.di-img') || target) : null;
        const from = rectIn(w.el);
        const finish = () => { if (w.min) { w.el.classList.add('is-min'); w.el.style.visibility = ''; } syncIconStates(); };
        if (reduceMotion() || w.busy || w.el.style.visibility === 'hidden') { finish(); return; }
        w.el.style.visibility = 'hidden';
        wire(from, to, 190, finish);
        syncIconStates();
    }

    function minimizeAll() {
        const list = order.map(key => wins.get(key)).filter(w => w && !w.min);
        if (!list.length) return;
        sound('close');
        closeMenus(true);
        D.emit('closepopups');
        list.forEach(minimize);
        syncIconStates();
    }

    function closeWin(key) {
        const w = wins.get(key);
        if (!w) return;
        sound('close');
        D.emit('winclose', w);
        wins.delete(key);
        order = order.filter(x => x !== key);
        const f = frontWin();
        if (f) focusWin(f); else syncIconStates();
        const cleanup = () => {
            // раздел или блок возвращается на скрытую обычную страницу (если его уже не забрало новое окно)
            if (w.kind === 'block') restoreCard(w);
            else if (w.tab.parentNode === w.main && origMain) { w.tab.style.display = 'none'; origMain.appendChild(w.tab); }
            w.el.remove();
            syncIconStates();
        };
        if (reduceMotion()) { cleanup(); return; }
        w.el.classList.add('is-closing');
        setTimeout(cleanup, 130);
    }

    // ---------- обои рабочего стола ----------
    const wallData = () => window.DESK95_WALLS || { list: [], byId: {} };
    function savedWall() { try { return localStorage.getItem(WALL_KEY) || ''; } catch (e) { return ''; } }
    function themeWallId() {
        try { const t = resolveTheme(currentThemeId); return (t && t.wall) || 'none'; } catch (e) { return 'none'; }
    }
    // выбранные пользователем обои, а если не выбраны — обои темы
    function activeWall() {
        const W = wallData();
        return W.byId[savedWall()] || W.byId[themeWallId()] || W.byId.none || null;
    }
    function applyWall() {
        if (!root95) return;
        const w = activeWall(), st = root95.style;
        ['image', 'size', 'repeat', 'color'].forEach(k => st.removeProperty('--desk-wall-' + k));
        if (w) { // у «(Нет)» картинки нет и цвета нет: остаётся цвет рабочего стола темы
            st.setProperty('--desk-wall-image', w.image);
            st.setProperty('--desk-wall-size', w.size);
            st.setProperty('--desk-wall-repeat', w.repeat);
            if (w.color) st.setProperty('--desk-wall-color', w.color);
        }
        renderWallCard();
    }
    // уменьшенный фон для предпросмотра: плитки сжимаются вдвое, большие картинки остаются на весь образец
    function swatchStyle(w, k) {
        let size = w.size;
        const m = /^(\d+)px (\d+)px$/.exec(size);
        if (m) size = Math.max(2, Math.round(m[1] * k)) + 'px ' + Math.max(2, Math.round(m[2] * k)) + 'px';
        const bg = w.id === 'none' ? 'var(--w95-desktop)' : (w.color || 'var(--w95-desktop)');
        return `background-color:${bg};background-image:${w.image};background-size:${size};background-repeat:${w.repeat};background-position:center;`;
    }
    function renderWallCard() {
        const card = document.getElementById('desk-wall-card');
        if (!card) return;
        const w = activeWall();
        if (!w) return;
        const th = card.querySelector('.dwc-thumb'), nm = card.querySelector('.dwc-name'), sub = card.querySelector('.dwc-sub');
        if (th) th.setAttribute('style', swatchStyle(w, 0.4));
        if (nm) nm.textContent = w.name;
        if (sub) sub.textContent = savedWall() && wallData().byId[savedWall()] ? 'выбраны вами' : 'обои темы по умолчанию';
        const reset = card.querySelector('.dwc-reset');
        if (reset) reset.disabled = !(savedWall() && wallData().byId[savedWall()]);
    }
    function resetWall() {
        try { localStorage.removeItem(WALL_KEY); } catch (e) {}
        applyWall();
        sound('success');
    }

    let wallModal = null;
    function closeWallDialog() {
        if (!wallModal) return;
        wallModal.remove();
        wallModal = null;
    }
    // Окно «Свойства: Экран» → «Фон»: образец на мониторе, список обоев, кнопки «OK», «Отмена», «Применить»
    function openWallDialog() {
        if (!started) return;
        closeMenus(true);
        D.emit('closepopups');
        closeWallDialog();
        const W = wallData();
        let sel = (activeWall() || W.byId.none).id;
        let useTheme = !savedWall() || !W.byId[savedWall()]; // обои темы по умолчанию (в памяти ничего не выбрано)
        wallModal = document.createElement('div');
        wallModal.className = 'desk-modal';
        wallModal.innerHTML =
            '<section class="desk-dlg" role="dialog" aria-modal="true" aria-label="Свойства: Экран">' +
            '<div class="desk-titlebar"><span class="dt-icon">' + iconSvg('settings') + '</span><span class="dt-title">Свойства: Экран</span>' +
            '<span class="dt-btns"><button type="button" class="dt-btn dt-close" data-act="cancel" title="Закрыть" aria-label="Закрыть"></button></span></div>' +
            '<div class="dlg-body"><div class="dlg-tab"><span>Фон</span></div><div class="dlg-page">' +
            '<div class="dlg-monitor" aria-hidden="true"><div class="dm-screen"></div><div class="dm-neck"></div><div class="dm-foot"></div></div>' +
            '<div class="dlg-list-wrap"><span class="dlg-cap" id="dlg-cap">Обои:</span>' +
            '<div class="dlg-list" role="listbox" tabindex="0" aria-labelledby="dlg-cap">' + W.list.map(w =>
                `<div class="dlg-item" role="option" data-id="${esc(w.id)}" aria-selected="false">` +
                `<span class="dlg-sw" style="${esc(swatchStyle(w, 0.4))}"></span><span class="dlg-name">${esc(w.name)}</span><span class="dlg-en">${esc(w.en)}</span></div>`).join('') +
            '</div></div></div></div>' +
            '<div class="dlg-btns"><button type="button" class="dlg-btn" data-act="ok">OK</button><button type="button" class="dlg-btn" data-act="cancel">Отмена</button>' +
            '<button type="button" class="dlg-btn" data-act="apply">Применить</button><button type="button" class="dlg-btn" data-act="theme">Как в теме</button></div>' +
            '</section>';
        root95.appendChild(wallModal);
        const screen = wallModal.querySelector('.dm-screen'), list = wallModal.querySelector('.dlg-list');
        const show = (scroll) => {
            const w = W.byId[sel];
            if (w) screen.setAttribute('style', swatchStyle(w, 0.5));
            list.querySelectorAll('.dlg-item').forEach(x => {
                const on = x.dataset.id === sel;
                x.classList.toggle('is-sel', on);
                x.setAttribute('aria-selected', on ? 'true' : 'false');
                if (on && scroll) x.scrollIntoView({ block: 'nearest' });
            });
        };
        const apply = () => {
            try { if (useTheme) localStorage.removeItem(WALL_KEY); else localStorage.setItem(WALL_KEY, sel); } catch (e) {}
            applyWall();
            sound('success');
        };
        wallModal.addEventListener('click', (e) => {
            const it = e.target.closest('.dlg-item');
            if (it) { sel = it.dataset.id; useTheme = false; show(false); return; }
            const b = e.target.closest('[data-act]');
            if (!b) return;
            const act = b.dataset.act;
            if (act === 'ok') { apply(); closeWallDialog(); sound('close'); }
            else if (act === 'apply') apply();
            else if (act === 'theme') { sel = themeWallId(); useTheme = true; show(true); }
            else if (act === 'cancel') { closeWallDialog(); sound('close'); }
        });
        wallModal.addEventListener('dblclick', (e) => {
            const it = e.target.closest('.dlg-item');
            if (it) { sel = it.dataset.id; useTheme = false; apply(); closeWallDialog(); sound('close'); }
        });
        list.addEventListener('keydown', (e) => {
            const ids = W.list.map(w => w.id), i = ids.indexOf(sel);
            if (/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) useTheme = false;
            if (e.key === 'ArrowDown') { e.preventDefault(); sel = ids[Math.min(ids.length - 1, i + 1)]; show(true); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sel = ids[Math.max(0, i - 1)]; show(true); }
            else if (e.key === 'Home') { e.preventDefault(); sel = ids[0]; show(true); }
            else if (e.key === 'End') { e.preventDefault(); sel = ids[ids.length - 1]; show(true); }
            else if (e.key === 'Enter') { e.preventDefault(); apply(); closeWallDialog(); sound('close'); }
        });
        // окно поверх всего: нажатие рядом с ним ничего не закрывает (как модальное окно Windows), закрывают «Отмена» и Esc
        wallModal.addEventListener('pointerdown', (e) => { if (e.target === wallModal) e.preventDefault(); });
        show(true);
        sound('open');
        setTimeout(() => { try { list.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }

    // ---------- вход в тему и выход из неё ----------
    function enter(boot) {
        if (started || !isDesk()) return;
        if (!build()) return;
        started = true;
        const cur = typeof currentTabId === 'string' ? currentTabId : '';
        // страницы без окон спрятаны; при запуске приложения рабочий стол пуст
        document.querySelectorAll('main > .tab').forEach(t => { t.style.display = 'none'; });
        D.emit('enter');
        if (!boot && cur && itemOf(cur)) open(cur, null, true); // тему выбрали из настроек: текущая страница остаётся в окне
        syncIconStates();
    }

    function leave() {
        if (!started) return;
        started = false;
        hideTip();
        closeWallDialog();
        closeMenus(true);
        D.emit('closepopups');
        const f = frontWin();
        const keep = (f && (f.page || f.id)) || (typeof currentTabId === 'string' ? currentTabId : 'transactions');
        wins.forEach(w => {
            D.emit('winclose', w);
            if (w.kind === 'block') restoreCard(w);
            else if (origMain) { w.tab.style.display = 'none'; origMain.appendChild(w.tab); }
            w.el.remove();
        });
        wins.clear();
        taskBtns.clear();
        order = [];
        cascade = 0;
        D.emit('leave');
        if (root95) root95.remove();
        root95 = stage = iconsBox = bar = startBtn = tasksBox = minBtn = menu = tip = null;
        // обычный вид: открыта та страница, что была в верхнем окне
        if (orig.showTab) orig.showTab(itemOf(keep) ? keep : 'transactions', null);
        if (typeof renderMenus === 'function') { try { renderMenus(); } catch (e) {} }
        window.dispatchEvent(new Event('resize'));
    }

    // ---------- подключение к приложению ----------
    // showTab вызывают меню, свайпы, настройки: в теме «Пуск» это «открыть окно»
    if (orig.showTab) {
        window.showTab = function (tabId, btn) {
            if (started && isDesk()) { open(tabId); return; }
            return orig.showTab.apply(this, arguments);
        };
    }
    // перерисовка меню (порядок / скрытые пункты) обновляет и значки, и «Пуск»
    if (orig.renderMenus) {
        window.renderMenus = function () {
            const r = orig.renderMenus.apply(this, arguments);
            if (started) { D.emit('icons'); renderStart(); closeFlyout(); }
            return r;
        };
    }
    // свайпы влево / вправо в окнах не листают разделы
    if (orig.swipeBlocked) {
        window.swipeBlocked = function () { return (started && isDesk()) || orig.swipeBlocked.apply(this, arguments); };
    }
    // правка записи: форма «Новая запись» должна быть на виду — в окне страницы, в окне блока или в новом окне блока
    if (orig.editTx) {
        window.editTx = function () {
            const r = orig.editTx.apply(this, arguments);
            if (started) {
                const f = document.getElementById('edit-id');
                const card = f && f.closest('.card');
                const hostWin = card && card.closest('.desk-win');
                const w = hostWin && wins.get(hostWin.dataset.key);
                if (w) {
                    if (w.min) present(w);
                    else if (frontWin() !== w) focusWin(w);
                    const body = w.body;
                    if (body) body.scrollTo(0, 0);
                } else if (card && card.id) {
                    openBlock(card.id); // страница с формой не открыта: форма — в отдельном окне
                }
            }
            return r;
        };
    }

    // «Котировки» перерисовывают свои карточки заново при каждом обновлении цен. Карточки, открытые в окнах блоков, при этом остались бы
    // старыми (а в странице появились бы копии): после перерисовки новая карточка занимает место старой в окне, заглушка встаёт на её место.
    if (typeof window.renderQuotesTab === 'function') {
        const origQuotes = window.renderQuotesTab;
        window.renderQuotesTab = function () {
            const r = origQuotes.apply(this, arguments);
            if (!started) return r;
            wins.forEach(w => {
                if (w.kind !== 'block' || !w.card || !w.card.id || w.page !== 'quotes') return;
                const tab = document.getElementById('quotes');
                const fresh = tab && [...tab.children].find(c => c.id === w.card.id && c !== w.card);
                if (!fresh) return; // группу больше не показывают: окно остаётся с прежним содержимым
                const old = w.card, host = old.parentElement;
                if (w.ph && w.ph.isConnected) fresh.replaceWith(w.ph); // заглушка занимает место новой карточки
                else fresh.remove();
                if (host) host.replaceChild(fresh, old); else w.main.appendChild(fresh);
                w.card = fresh;
                fresh.dataset.deskPage = w.page;
                D.emit('states');
            });
            return r;
        };
    }

    // «w95-theme» приходит при каждой смене темы (и при просмотре цветов в редакторе): внутри папки «Экстра» рабочий стол не пересоздаётся
    window.addEventListener('w95-theme', (e) => {
        const id = e && e.detail && e.detail.id;
        if (id === THEME) { enter(false); applyWall(); } else leave();
    });

    // окно при изменении размера экрана остаётся в пределах стола
    window.addEventListener('resize', () => {
        if (!started || !stage) return;
        const W = stage.clientWidth, H = stage.clientHeight;
        wins.forEach(w => {
            if (w.max || !isWide()) return;
            if (!w.el.style.width) { placeWin(w); return; } // окно открыто на узком экране, экран стал широким
            const r = rectIn(w.el);
            if (r.x > W - 60) w.el.style.left = Math.max(0, W - r.w - 6) + 'px';
            if (r.y > H - 34) w.el.style.top = Math.max(0, H - 60) + 'px';
        });
        if (flyout) placeFlyout(menu && menu.querySelector('.sm-item.is-open'));
        D.emit('resize');
    });

    // Запуск приложения с уже выбранной темой: пустой рабочий стол
    const boot = () => { if (isDesk()) enter(true); };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
    else boot();

    // для кнопок в Настройках (index.html), для остальных файлов темы и для проверки
    window.deskWallDialog = openWallDialog;
    window.deskWallReset = resetWall;
    window.deskOpen = open;
    window.deskOpenBlock = openBlock;
    window.deskStart = toggleStart;
    window.deskMinimizeAll = minimizeAll;
    window.deskCloseWindow = closeWin;
    window.deskWalls = { active: activeWall, apply: applyWall };

    Object.assign(D, {
        isStarted: () => started, root: () => root95, stage: () => stage, bar: () => bar, iconsBox: () => iconsBox,
        wins, order: () => order, frontWin, focusWin, minimize, toggleMax, minimizeAll,
        menuItems, itemOf, blockKey, metaOf, blocksOf, flashBlock, goToBlock,
        open, openBlock, closeWin, present, rectIn, closeMenus, closeFlyout, toggleStart, openWallDialog,
        syncIconStates, hideTip, taskBtns: () => taskBtns, isStartOpen: menuOpen, blockContextItems, toggleDeskBlock,
        pageOf: (card) => { const m = metaOf(card); return m ? m.page : ''; }
    });
})();
