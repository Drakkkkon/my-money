// --- ТЕМА «WINDOWS 95_ПУСК»: ЗНАЧКИ НА РАБОЧЕМ СТОЛЕ — СТРАНИЦЫ И БЛОКИ, СВОБОДНОЕ ПЕРЕТАСКИВАНИЕ (4.7.0) ---
// • Значки страниц (как раньше: порядок и состав — Настройки → «Пункты меню») и значки отдельных БЛОКОВ — «ярлыки» с маленькой стрелкой.
//   Блок на рабочий стол добавляют: «Пуск» → страница → кнопка «+ На стол», меню окна «Файл» / «Блоки» и правая кнопка по строке блока.
//   Нажатие на значок блока открывает окно только с этим блоком.
// • Любой значок можно перетащить мышью или пальцем в любое место рабочего стола; положение запоминается на этом устройстве
//   (localStorage finance_desk95_pos). Если значок бросили на другой, он встаёт на ближайшее свободное место.
//   Значки без своего места идут столбцами сверху вниз и слева направо, как в Windows 95.
// • Правая кнопка / долгое нажатие: по значку — «Открыть», «Убрать с рабочего стола»; по столу — «Упорядочить значки», «Обои…».
// • Список значков блоков — localStorage finance_desk95_blocks: [{ id блока, page, title, icon }].
// Оформление — css/desk95.css (раздел «Рабочий стол 4.7.0»). Файл подключается после js/desk95.js.

(function () {
    'use strict';
    const D = window.DESK95;
    if (!D) return;
    const esc = D.esc;
    const KEY_BLOCKS = 'finance_desk95_blocks';
    const KEY_POS = 'finance_desk95_pos';
    const GAP_X = 2, GAP_Y = 4;

    const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

    let blocks = [];      // значки блоков: [{ id, page, title, icon }]
    let pos = {};         // положения: { 'p:<страница>' | 'b:<блок>': { x, y } }
    let box = null;       // контейнер значков (.desk-icons)
    let stageEl = null;
    let ro = null;
    let selected = null;
    let drag = null;
    let suppressUntil = 0;
    let lastCtx = 0;

    function readStore() {
        const b = load(KEY_BLOCKS, []);
        blocks = Array.isArray(b) ? b.filter(x => x && typeof x.id === 'string' && x.id && typeof x.page === 'string') : [];
        const p = load(KEY_POS, {});
        pos = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    }
    const saveBlocks = () => save(KEY_BLOCKS, blocks);
    const savePos = () => save(KEY_POS, pos);

    // ---------- значки ----------
    function pageIcon(it) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'desk-icon';
        b.dataset.id = it.id;
        b.dataset.k = 'p:' + it.id;
        b.setAttribute('aria-label', it.label);
        b.innerHTML = `<span class="di-img">${D.iconSvg(it.id)}</span><span class="di-label">${esc(it.label)}</span>`;
        return b;
    }

    function blockIcon(m) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'desk-icon is-block';
        b.dataset.block = m.id;
        b.dataset.k = 'b:' + m.id;
        b.title = m.title;
        b.setAttribute('aria-label', 'Блок «' + m.title + '» — ярлык');
        b.innerHTML = `<span class="di-img">${D.glyphHtml(m.icon)}<i class="di-arrow" aria-hidden="true"></i></span><span class="di-label">${esc(m.title)}</span>`;
        return b;
    }

    function render() {
        if (!box) return;
        box.innerHTML = '';
        selected = null;
        D.menuItems().forEach(it => box.appendChild(pageIcon(it)));
        blocks.forEach(m => box.appendChild(blockIcon(m)));
        layout();
        states();
    }

    function states() {
        if (!box) return;
        box.querySelectorAll('.desk-icon').forEach(b => {
            const w = D.wins.get(b.dataset.block ? D.blockKey(b.dataset.block) : b.dataset.id);
            b.classList.toggle('is-open', !!w);
            b.classList.toggle('is-min', !!(w && w.min));
        });
    }

    function select(el) {
        if (!box) return;
        box.querySelectorAll('.desk-icon.is-sel').forEach(b => b.classList.remove('is-sel'));
        selected = el || null;
        if (el) el.classList.add('is-sel');
    }

    // ---------- раскладка ----------
    function geom() {
        const first = box.querySelector('.desk-icon');
        if (!first) return null;
        const cs = getComputedStyle(box);
        const padL = parseFloat(cs.paddingLeft) || 6, padT = parseFloat(cs.paddingTop) || 8, padB = parseFloat(cs.paddingBottom) || 8;
        const cw = first.offsetWidth, ch = first.offsetHeight;
        const W = box.clientWidth, H = box.clientHeight;
        if (!cw || !ch || !W || !H) return null;
        const rows = Math.max(1, Math.floor((H - padT - padB + GAP_Y) / (ch + GAP_Y)));
        return { padL, padT, padB, cw, ch, W, H, rows };
    }
    const slotAt = (g, n) => ({ x: g.padL + Math.floor(n / g.rows) * (g.cw + GAP_X), y: g.padT + (n % g.rows) * (g.ch + GAP_Y) });
    const clampPos = (g, p) => ({
        x: Math.round(Math.max(0, Math.min(p.x, Math.max(0, g.W - g.cw)))),
        y: Math.round(Math.max(0, Math.min(p.y, Math.max(0, g.H - g.ch))))
    });
    const put = (el, p) => { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; };

    function overlaps(g, p, others) {
        const m = 8; // небольшое касание краями не считается
        return others.some(o => p.x < o.x + g.cw - m && p.x + g.cw - m > o.x && p.y < o.y + g.ch - m && p.y + g.ch - m > o.y);
    }
    // ближайшее к want свободное место на сетке (want — желаемая точка)
    function freeSpot(g, want, others) {
        if (!overlaps(g, want, others)) return want;
        let best = null, bd = Infinity;
        const total = Math.max(60, Math.ceil(g.W / (g.cw + GAP_X)) * g.rows + 4);
        for (let n = 0; n < total; n++) {
            const s = slotAt(g, n);
            if (s.x + g.cw > g.W + 1 || s.y + g.ch > g.H + 1) continue;
            if (overlaps(g, s, others)) continue;
            const d = Math.hypot(s.x - want.x, s.y - want.y);
            if (d < bd) { bd = d; best = s; }
        }
        return best || want;
    }

    // Расставить значки: у кого есть своё место — туда (в пределах экрана), остальные — на свои места сетки
    function layout() {
        if (!box) return;
        const g = geom();
        if (!g) return;
        box.querySelectorAll('.desk-icon').forEach((el, i) => {
            const p = pos[el.dataset.k];
            put(el, p && isFinite(p.x) && isFinite(p.y) ? clampPos(g, p) : slotAt(g, i));
        });
    }

    // Упорядочить: все значки — на сетку по порядку
    function arrange() {
        pos = {};
        savePos();
        layout();
        D.sound('click');
    }

    function rectsExcept(g, skip) {
        return [...box.querySelectorAll('.desk-icon')].filter(e => e !== skip).map(e => ({ x: e.offsetLeft, y: e.offsetTop }));
    }

    // Ширина столбцов со значками страниц: окна открываются правее
    D.iconStrip = function () {
        if (!box) return 0;
        const g = geom();
        if (!g) return 190;
        const n = D.menuItems().length;
        const cols = Math.max(1, Math.ceil(n / g.rows));
        return Math.round(g.padL + cols * (g.cw + GAP_X) + 12);
    };

    D.iconEl = function (key) {
        if (!box) return null;
        return key.indexOf('b:') === 0 ? box.querySelector(`.desk-icon[data-block="${CSS.escape(key.slice(2))}"]`) : box.querySelector(`.desk-icon[data-id="${CSS.escape(key)}"]`);
    };

    // ---------- блоки на рабочем столе ----------
    D.desktop = {
        hasBlock: (id) => blocks.some(b => b.id === id),
        blocks: () => blocks.slice(),
        addBlock(m) {
            if (!m || !m.id || this.hasBlock(m.id)) return;
            blocks.push({ id: m.id, page: m.page || '', title: m.title || m.id, icon: m.icon || 'view_agenda' });
            saveBlocks();
            let el = null;
            if (box) {
                el = blockIcon(blocks[blocks.length - 1]);
                box.appendChild(el);
                const g = geom();
                if (g) {
                    // первое свободное место сетки после значков страниц
                    const others = rectsExcept(g, el);
                    let n = D.menuItems().length, s = slotAt(g, n), guard = 0;
                    while (overlaps(g, s, others) && guard++ < 300) s = slotAt(g, ++n);
                    s = clampPos(g, s);
                    put(el, s);
                    pos[el.dataset.k] = s;
                    savePos();
                }
                states();
                el.classList.add('is-new');
                setTimeout(() => el.classList.remove('is-new'), 2400);
            }
            D.sound('success');
            D.toast('Блок «' + m.title + '» добавлен на рабочий стол');
            D.emit('desk-blocks');
        },
        removeBlock(id) {
            const m = blocks.find(b => b.id === id);
            if (!m) return;
            blocks = blocks.filter(b => b.id !== id);
            delete pos['b:' + id];
            saveBlocks();
            savePos();
            if (box) {
                const el = D.iconEl(D.blockKey(id));
                if (el) { if (selected === el) selected = null; el.remove(); }
            }
            D.sound('close');
            D.toast('Значок блока «' + m.title + '» убран с рабочего стола');
            D.emit('desk-blocks');
        }
    };

    // ---------- открыть значок ----------
    function openIcon(el) {
        if (el.dataset.block) D.openBlock(el.dataset.block, el);
        else D.open(el.dataset.id, el);
    }

    // ---------- перетаскивание ----------
    function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const el = e.target.closest('.desk-icon');
        if (!el) { select(null); startBgPress(e); return; }
        select(el);
        const touch = e.pointerType !== 'mouse';
        drag = { el, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: el.offsetLeft, oy: el.offsetTop, moved: false, touch, lp: 0, long: false };
        if (touch) {
            drag.lp = setTimeout(() => {
                if (!drag || drag.moved) return;
                drag.long = true;
                suppressUntil = performance.now() + 1500;
                iconMenu(el, drag.sx, drag.sy);
            }, 520);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    }

    function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved) {
            if (Math.hypot(dx, dy) < (drag.touch ? 9 : 4)) return;
            drag.moved = true;
            clearTimeout(drag.lp);
            drag.el.classList.add('is-drag');
            if (D.menu) D.menu.close();
            D.hideTip();
        }
        const g = geom();
        if (g) put(drag.el, clampPos(g, { x: drag.ox + dx, y: drag.oy + dy }));
    }

    function onUp(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        clearTimeout(drag.lp);
        const d = drag;
        drag = null;
        d.el.classList.remove('is-drag');
        if (!d.moved) return;
        suppressUntil = performance.now() + 250; // после перетаскивания «click» не должен открывать окно
        const g = geom();
        if (!g) return;
        let p = clampPos(g, { x: d.el.offsetLeft, y: d.el.offsetTop });
        p = clampPos(g, freeSpot(g, p, rectsExcept(g, d.el)));
        put(d.el, p);
        pos[d.el.dataset.k] = p;
        savePos();
        D.sound('click');
    }

    // ---------- контекстные меню ----------
    function iconMenu(el, x, y) {
        if (!D.menu) return;
        lastCtx = performance.now();
        const isBlock = !!el.dataset.block;
        const items = [{ label: 'Открыть', action: () => openIcon(el) }];
        if (isBlock) {
            const m = blocks.find(b => b.id === el.dataset.block);
            items.push({ label: 'Открыть всю страницу', action: () => m && D.open(m.page, el) });
            items.push({ sep: true });
            items.push({ label: 'Убрать с рабочего стола', action: () => D.desktop.removeBlock(el.dataset.block) });
        } else {
            items.push({ sep: true });
            items.push({ label: 'Упорядочить значки', action: arrange });
        }
        D.menu.popup(items, { x, y });
    }

    function deskMenu(x, y) {
        if (!D.menu) return;
        lastCtx = performance.now();
        D.menu.popup([
            { label: 'Упорядочить значки', action: arrange },
            { label: 'Обои рабочего стола…', action: () => D.openWallDialog() },
            { sep: true },
            { label: 'Свернуть все окна', disabled: !D.frontWin(), action: () => D.minimizeAll() }
        ], { x, y });
    }

    // Долгое нажатие пальцем по свободному месту стола — меню стола (на телефонах без правой кнопки)
    let bgPress = 0;
    function startBgPress(e) {
        clearTimeout(bgPress);
        if (e.pointerType === 'mouse' || e.target.closest('.desk-win')) return;
        if (e.target !== box && e.target !== stageEl) return;
        const x = e.clientX, y = e.clientY, st = stageEl;
        const stop = () => {
            clearTimeout(bgPress);
            st.removeEventListener('pointerup', stop);
            st.removeEventListener('pointercancel', stop);
            st.removeEventListener('pointermove', move);
        };
        const move = (ev) => { if (Math.hypot(ev.clientX - x, ev.clientY - y) > 12) stop(); };
        bgPress = setTimeout(() => { stop(); deskMenu(x, y); }, 560);
        st.addEventListener('pointerup', stop);
        st.addEventListener('pointercancel', stop);
        st.addEventListener('pointermove', move);
    }

    function onContext(e) {
        if (!D.isStarted()) return;
        const el = e.target.closest('.desk-icon');
        const onWin = e.target.closest('.desk-win, .desk-dd');
        if (onWin) return;
        if (!el && e.target !== box && e.target !== stageEl) return;
        e.preventDefault();
        if (performance.now() - lastCtx < 800) return; // долгое нажатие уже открыло меню
        if (el) { select(el); iconMenu(el, e.clientX, e.clientY); } else deskMenu(e.clientX, e.clientY);
    }

    function onKey(e) {
        if (!selected || !selected.isConnected) return;
        if (e.key === 'Delete' && selected.dataset.block) { e.preventDefault(); D.desktop.removeBlock(selected.dataset.block); }
        else if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); const r = selected.getBoundingClientRect(); iconMenu(selected, r.left + 12, r.bottom - 8); }
    }

    // ---------- подключение к теме ----------
    D.on('build', (ctx) => {
        box = ctx.iconsBox;
        stageEl = ctx.stage;
        readStore();
        box.addEventListener('pointerdown', onDown);
        stageEl.addEventListener('pointerdown', (e) => { if (e.target === stageEl) { select(null); startBgPress(e); } });
        box.addEventListener('click', (e) => {
            const el = e.target.closest('.desk-icon');
            if (!el) return;
            if (performance.now() < suppressUntil) return;
            select(el);
            openIcon(el);
        });
        box.addEventListener('keydown', onKey);
        stageEl.addEventListener('contextmenu', onContext);
        if (window.ResizeObserver) { ro = new ResizeObserver(() => requestAnimationFrame(layout)); ro.observe(box); }
    });
    D.on('enter', render);
    D.on('icons', render);
    D.on('states', states);
    D.on('resize', layout);
    D.on('leave', () => {
        if (ro) { ro.disconnect(); ro = null; }
        clearTimeout(bgPress);
        drag = null;
        box = stageEl = selected = null;
    });
})();
