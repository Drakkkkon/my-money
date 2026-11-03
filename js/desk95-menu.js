// --- ТЕМА «WINDOWS 95_ПУСК»: МЕНЮ В СТИЛЕ WINDOWS 95 (4.7.0) ---
// 1) Движок выпадающих и контекстных меню (window.DESK95.menu): пункты с галочками и «точками», подменю (на ПК — справа от пункта,
//    на узком экране — раскрываются внутри списка), клавиатура (стрелки, Enter, Esc), закрытие нажатием в другом месте.
// 2) Строка меню в каждом окне вместо прежних кнопок «закрыть / развернуть / на стену» на блоках:
//      Файл   — добавить новое значение, синхронизация, значок блока на рабочий стол, закрыть окно;
//      Правка — изменить размер блока (маленький / средний / большой / как было) — у каждого блока или у всех сразу;
//      Вид    — масштаб (в том числе «Под экран»), развернуть / свернуть окно;
//      Блоки  — список блоков страницы: открыть в отдельном окне, перейти, размер, свернуть, на стену, на рабочий стол.
//    Alt + первая буква (Alt+Ф, Alt+П, Alt+В, Alt+Б) открывает меню окна, которое сейчас сверху.
// Оформление — css/desk95.css (раздел «Меню 4.7.0»). Файл подключается после js/desk95.js.

(function () {
    'use strict';
    const D = window.DESK95;
    if (!D) return;
    const esc = D.esc;

    let stack = [];        // открытые списки: [{ el, level }]
    let ownerBtn = null;   // кнопка строки меню, из которой открыт список
    let ownerWin = null;
    let hoverT = 0;

    const narrow = () => { const r = D.root(); return !!(r && r.clientWidth < 560); };

    // ---------- движок меню ----------
    function build(items, inline) {
        const dd = document.createElement('div');
        dd.className = 'desk-dd' + (inline ? ' is-inline' : '');
        dd.setAttribute('role', 'menu');
        items.forEach(it => {
            if (!it || it.hidden) return;
            if (it.sep) { const s = document.createElement('div'); s.className = 'dd-sep'; s.setAttribute('role', 'separator'); dd.appendChild(s); return; }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'dd-item' + (it.disabled ? ' is-dis' : '');
            const hasCheck = it.check !== undefined;
            b.setAttribute('role', it.radio ? 'menuitemradio' : (hasCheck ? 'menuitemcheckbox' : 'menuitem'));
            if (hasCheck) b.setAttribute('aria-checked', String(!!it.check));
            if (it.disabled) b.setAttribute('aria-disabled', 'true');
            if (it.submenu) b.setAttribute('aria-haspopup', 'true');
            if (it.title) b.title = it.title;
            b.innerHTML = `<span class="dd-ck${it.radio ? ' is-radio' : ''}" aria-hidden="true"></span><span class="dd-label">${esc(it.label)}</span>` +
                (it.hint ? `<span class="dd-hint">${esc(it.hint)}</span>` : '') +
                (it.submenu ? '<span class="dd-arrow" aria-hidden="true"></span>' : '');
            b._it = it;
            dd.appendChild(b);
            if (it.submenu && inline) {
                const sub = document.createElement('div');
                sub.className = 'dd-sub';
                sub.hidden = true;
                dd.appendChild(sub);
                b._sub = sub;
            }
        });
        return dd;
    }

    function place(dd, mode, ref) {
        const R = D.root().getBoundingClientRect();
        const tb = D.bar() ? D.bar().offsetHeight : 40;
        dd.style.visibility = 'hidden';
        dd.style.left = dd.style.top = '0px';
        dd.style.maxHeight = '';
        const w = dd.offsetWidth;
        let h = dd.offsetHeight;
        let left, top;
        if (mode === 'below') { left = ref.left - R.left; top = ref.bottom - R.top; }
        else if (mode === 'side') {
            left = ref.right - R.left - 3; top = ref.top - R.top - 3;
            if (left + w > R.width - 2) left = ref.left - R.left - w + 3;
        } else { left = ref.x - R.left; top = ref.y - R.top; }
        left = Math.max(2, Math.min(left, R.width - w - 2));
        const avail = R.height - tb - 6;
        if (top + h > avail) top = Math.max(2, avail - h);
        if (top + h > avail) { dd.style.maxHeight = Math.max(110, avail - top) + 'px'; }
        dd.style.left = Math.round(left) + 'px';
        dd.style.top = Math.round(top) + 'px';
        dd.style.visibility = '';
    }

    function closeFrom(level) {
        while (stack.length > level) {
            const s = stack.pop();
            s.el.remove();
        }
    }

    function closeAll() {
        closeFrom(0);
        clearTimeout(hoverT);
        if (ownerBtn) { ownerBtn.classList.remove('is-open'); ownerBtn.setAttribute('aria-expanded', 'false'); }
        ownerBtn = null;
        ownerWin = null;
        D.root() && D.root().querySelectorAll('.desk-dd').forEach(n => n.remove());
    }

    function show(items, level, mode, ref) {
        const inline = narrow();
        const dd = build(items, inline);
        dd._level = level;
        D.root().appendChild(dd);
        if (inline) dd.classList.add('is-narrow');
        place(dd, mode, ref);
        stack.push({ el: dd, level });
        dd.addEventListener('click', onItemClick);
        dd.addEventListener('pointerover', onItemOver);
        return dd;
    }

    const itemsOf = (it) => (typeof it.submenu === 'function' ? it.submenu() : it.submenu) || [];

    // Подменю: на ПК — справа от пункта, на узком экране — раскрывается внутри списка
    function toggleSub(dd, b, focusFirst) {
        const it = b._it;
        if (b._sub) { // внутри списка
            const open = b._sub.hidden;
            dd.querySelectorAll('.dd-sub').forEach(s => { if (!s.contains(b)) { s.hidden = true; if (s._for) s._for.classList.remove('is-open'); } });
            if (open) {
                b._sub.innerHTML = '';
                const inner = build(itemsOf(it), true);
                inner.classList.add('is-nested');
                b._sub.appendChild(inner);
                inner.addEventListener('click', onItemClick);
                b._sub._for = b;
                b._sub.hidden = false;
                b.classList.add('is-open');
                if (focusFirst) { const f = inner.querySelector('.dd-item:not(.is-dis)'); if (f) f.focus(); }
            } else { b._sub.hidden = true; b.classList.remove('is-open'); }
            return;
        }
        const level = dd._level + 1;
        const same = stack[level] && stack[level].owner === b;
        closeFrom(level);
        dd.querySelectorAll('.dd-item.is-open').forEach(x => x.classList.remove('is-open'));
        if (same) return;
        const sub = show(itemsOf(it), level, 'side', b.getBoundingClientRect());
        stack[level].owner = b;
        b.classList.add('is-open');
        if (focusFirst) { const f = sub.querySelector('.dd-item:not(.is-dis)'); if (f) f.focus(); }
    }

    function onItemClick(e) {
        const b = e.target.closest('.dd-item');
        if (!b || b.classList.contains('is-dis')) return;
        e.stopPropagation();
        const it = b._it;
        if (it.submenu) { toggleSub(b.closest('.desk-dd:not(.is-nested)') || b.parentNode, b, e.detail === 0); return; }
        closeAll();
        D.sound('click');
        if (it.action) { try { it.action(); } catch (err) { console.error(err); } }
    }

    function onItemOver(e) {
        if (e.pointerType !== 'mouse') return;
        const b = e.target.closest('.dd-item');
        if (!b || b.classList.contains('is-dis') || b.closest('.is-nested')) return;
        const dd = b.closest('.desk-dd');
        clearTimeout(hoverT);
        hoverT = setTimeout(() => {
            if (!b.isConnected || b._sub) return;
            if (b._it.submenu) { if (!(stack[dd._level + 1] && stack[dd._level + 1].owner === b)) toggleSub(dd, b, false); }
            else if (stack.length > dd._level + 1) { closeFrom(dd._level + 1); dd.querySelectorAll('.dd-item.is-open').forEach(x => x.classList.remove('is-open')); }
        }, 130);
    }

    // Контекстное меню в точке (правая кнопка мыши / долгое нажатие)
    function popup(items, pos) {
        closeAll();
        D.emit('closepopups-other');
        if (!D.isStarted()) return;
        show(items, 0, 'point', { x: pos.x, y: pos.y });
        D.hideTip();
    }

    D.menu = { popup, close: closeAll, isOpen: () => stack.length > 0 };
    D.on('closepopups', closeAll);
    D.on('leave', closeAll);
    D.on('resize', closeAll);
    D.on('winclose', (w) => { if (ownerWin === w) closeAll(); });

    // нажатие вне списка закрывает его (кнопки строки меню сами решают: переключить или закрыть)
    document.addEventListener('pointerdown', (e) => {
        if (!stack.length) return;
        if (e.target.closest('.desk-dd, .mb-item')) return;
        closeAll();
    }, true);

    // клавиатура внутри открытого меню
    document.addEventListener('keydown', (e) => {
        if (!stack.length) return;
        const top = stack[stack.length - 1].el;
        const rootDd = stack[0].el;
        const all = () => [...rootDd.querySelectorAll('.dd-item:not(.is-dis)')].filter(x => x.offsetParent !== null);
        const act = document.activeElement;
        const items = stack.length > 1 ? [...top.querySelectorAll('.dd-item:not(.is-dis)')] : all();
        const inDd = act && act.classList && act.classList.contains('dd-item');
        const i = items.indexOf(act);
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopImmediatePropagation();
            if (stack.length > 1) {
                const owner = stack[stack.length - 1].owner;
                closeFrom(stack.length - 1);
                if (owner) { owner.classList.remove('is-open'); owner.focus(); }
            } else { const b = ownerBtn; closeAll(); if (b && b.isConnected) b.focus(); }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            const n = e.key === 'ArrowDown' ? (i < 0 ? 0 : (i + 1) % items.length) : (i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length);
            items[n].focus();
        } else if (e.key === 'Home' || e.key === 'End') {
            if (!items.length) return;
            e.preventDefault();
            items[e.key === 'Home' ? 0 : items.length - 1].focus();
        } else if (e.key === 'ArrowRight') {
            if (inDd && act._it && act._it.submenu) { e.preventDefault(); toggleSub(act.closest('.desk-dd:not(.is-nested)') || act.parentNode, act, true); }
            else if (ownerBtn) { e.preventDefault(); stepBar(1); }
        } else if (e.key === 'ArrowLeft') {
            if (stack.length > 1) {
                e.preventDefault();
                const owner = stack[stack.length - 1].owner;
                closeFrom(stack.length - 1);
                if (owner) { owner.classList.remove('is-open'); owner.focus(); }
            } else if (act && act.closest && act.closest('.dd-sub')) {
                e.preventDefault();
                const sub = act.closest('.dd-sub'); sub.hidden = true;
                if (sub._for) { sub._for.classList.remove('is-open'); sub._for.focus(); }
            } else if (ownerBtn) { e.preventDefault(); stepBar(-1); }
        } else if (e.key === 'Tab') { closeAll(); }
    }, true);

    // ---------- что делают пункты ----------
    const SIZE_LIST = [['s', 'Маленький'], ['m', 'Средний'], ['l', 'Большой'], ['', 'Как было']];
    const dimOf = (k) => { try { return k ? CARD_SIZES[k].dim.replace(/ /g, '') : 'авто'; } catch (e) { return ''; } };
    const curSize = (id) => { try { return typeof cardSizeOf === 'function' ? cardSizeOf(id) : ''; } catch (e) { return ''; } };
    const hasSizes = () => typeof setCardSize === 'function' && typeof CARD_SIZES !== 'undefined';

    function sizeItems(cardId) {
        const cur = curSize(cardId);
        return SIZE_LIST.map(([k, name]) => ({ label: name, hint: dimOf(k), radio: true, check: cur === k, action: () => setCardSize(cardId, k) }));
    }

    function allSizeItems(blocks) {
        const ids = blocks.filter(b => b.id).map(b => b.id);
        const kinds = new Set(ids.map(curSize));
        const same = kinds.size === 1 ? [...kinds][0] : null;
        return SIZE_LIST.map(([k, name]) => ({
            label: name, hint: dimOf(k), radio: true, check: same === k,
            action: () => ids.forEach(id => setCardSize(id, k))
        }));
    }

    // «Добавить новое значение»: для каждой страницы — свой блок с полем ввода
    const ADD = {
        transactions: { label: 'Новая запись', focus: '#amount' },
        subscriptions: { label: 'Новая подписка', focus: '#sub-name' },
        salary: { label: 'Внести зарплату', focus: '#salary-amount' },
        wishlist: { label: 'Новая цель', focus: '#goal-url' },
        prices: { label: 'Добавить цену', focus: '#pr-product' },
        quotes: { label: 'Добавить компанию', call: 'openQuoteSearch' },
        settings: { label: 'Новая категория', focus: '#new-category' }
    };

    function addNew(w) {
        const cfg = ADD[w.page];
        if (!cfg) return;
        if (cfg.call) { if (typeof window[cfg.call] === 'function') window[cfg.call](); return; }
        const input = document.querySelector(cfg.focus);
        const card = input && input.closest('.card');
        if (!card) return;
        const focusIt = () => { try { input.focus({ preventScroll: true }); if (input.select && input.type !== 'number') input.select(); } catch (e) {} };
        const hostEl = card.closest('.desk-win');
        const hostWin = hostEl && D.wins.get(hostEl.dataset.key);
        if (hostWin === w) {
            if (w.kind === 'page') { D.flashBlock(w, card); setTimeout(focusIt, 260); } else focusIt();
        } else if (hostWin) { // блок с полем уже в другом окне
            D.present(hostWin);
            setTimeout(focusIt, 120);
        } else if (card.id) { // блока нигде нет на экране: открываем его в окне
            D.openBlock(card.id, null, false, () => setTimeout(focusIt, 80));
        }
    }

    function toggleCollapse(card) {
        const b = card.querySelector(':scope > h3 .w95-ctl-min');
        if (b && typeof toggleCardCollapse === 'function') toggleCardCollapse(b);
    }
    function toggleWall(card) {
        const b = card.querySelector(':scope > h3 .w95-ctl-pin');
        if (b && typeof toggleWallCard === 'function') toggleWallCard(b);
    }

    const onDesk = (id) => !!(D.desktop && id && D.desktop.hasBlock(id));
    function toggleDesk(m) {
        if (!D.desktop || !m || !m.id) return;
        if (D.desktop.hasBlock(m.id)) D.desktop.removeBlock(m.id);
        else D.desktop.addBlock({ id: m.id, page: m.page, title: m.title, icon: m.icon });
    }

    const pageLabel = (w) => { const it = D.itemOf(w.page); return it ? it.label : ''; };

    // ---------- пункты строки меню ----------
    function fileMenu(w) {
        const cfg = ADD[w.page];
        const items = [];
        if (cfg) items.push({ label: 'Добавить новое значение…', hint: cfg.label, action: () => addNew(w) });
        if (typeof syncNowButton === 'function') items.push({ label: 'Синхронизировать с Google Диском', action: () => syncNowButton() });
        if (items.length) items.push({ sep: true });
        if (w.kind === 'block') {
            const m = D.metaOf(w.card);
            if (m) { m.id = w.card.id; items.push({ label: 'Значок блока на рабочем столе', check: onDesk(m.id), action: () => toggleDesk(m) }); }
        } else {
            const blocks = D.blocksOf(w.page).filter(b => b.id);
            items.push({
                label: 'Добавить блок на рабочий стол', disabled: !blocks.length,
                submenu: () => blocks.map(b => ({ label: b.title, check: onDesk(b.id), action: () => toggleDesk(b) }))
            });
        }
        items.push({ sep: true });
        items.push({ label: 'Закрыть окно', hint: 'Alt+F4', action: () => D.closeWin(w.key) });
        return items;
    }

    function editMenu(w) {
        if (!hasSizes()) return [{ label: 'Нет действий', disabled: true }];
        if (w.kind === 'block') {
            return [{ label: 'Изменить размер блока', submenu: () => sizeItems(w.card.id) }];
        }
        const blocks = D.blocksOf(w.page).filter(b => b.id);
        const items = [{
            label: 'Изменить размер', disabled: !blocks.length,
            submenu: () => [{ label: 'Все блоки страницы', submenu: () => allSizeItems(blocks) }, { sep: true }]
                .concat(blocks.map(b => ({ label: b.title, submenu: () => sizeItems(b.id) })))
        }];
        const collapsed = D.blocksOf(w.page).filter(b => b.el.classList.contains('is-collapsed'));
        if (collapsed.length) { items.push({ sep: true }); items.push({ label: 'Развернуть свёрнутые блоки', hint: String(collapsed.length), action: () => collapsed.forEach(b => toggleCollapse(b.el)) }); }
        return items;
    }

    const ZOOMS = [50, 75, 90, 100, 125, 150, 200];
    function viewMenu(w) {
        const z = D.zoom ? D.zoom.get(w) : { mode: 'm', v: 1 };
        const cur = Math.round(z.v * 100);
        const items = [];
        if (D.zoom) {
            items.push({
                label: 'Масштаб', hint: z.mode === 'f' ? 'авто' : cur + '%',
                submenu: () => ZOOMS.map(p => ({ label: p + '%', radio: true, check: z.mode !== 'f' && cur === p, action: () => D.zoom.set(w, { mode: 'm', v: p / 100 }) }))
                    .concat([{ sep: true }, { label: 'Под экран', radio: true, check: z.mode === 'f', action: () => D.zoom.set(w, { mode: 'f' }) },
                        { label: 'Точнее…', action: () => D.zoom.pop(w) }])
            });
            items.push({ sep: true });
        }
        if (D.isWide()) items.push({ label: w.max ? 'Восстановить окно' : 'Развернуть окно', action: () => D.toggleMax(w) });
        items.push({ label: 'Свернуть окно', action: () => { D.minimize(w); const f = D.frontWin(); if (f) D.focusWin(f); else D.syncIconStates(); } });
        if (w.kind === 'block') {
            items.push({ sep: true });
            items.push({ label: `Вся страница «${pageLabel(w)}»`, action: () => D.open(w.page) });
        }
        return items;
    }

    function blocksMenu(w) {
        const blocks = D.blocksOf(w.page);
        if (!blocks.length) return [{ label: 'На странице нет блоков', disabled: true }];
        if (w.kind === 'block') {
            const items = blocks.map(b => ({ label: b.title, check: b.id === w.card.id, disabled: !b.id, action: () => { if (b.id !== w.card.id) D.openBlock(b.id); } }));
            items.push({ sep: true });
            items.push({ label: `Вся страница «${pageLabel(w)}»`, action: () => D.open(w.page) });
            return items;
        }
        return blocks.map(b => ({
            label: b.title,
            submenu: () => {
                const sub = [];
                const own = b.id && D.wins.get(D.blockKey(b.id));
                if (b.id) sub.push({ label: own ? 'Показать окно блока' : 'Открыть в отдельном окне', action: () => D.openBlock(b.id) });
                sub.push({ label: 'Перейти к блоку', disabled: !!own, action: () => D.flashBlock(w, b.el) });
                if (b.id && hasSizes()) {
                    sub.push({ sep: true });
                    sizeItems(b.id).forEach(x => sub.push(x));
                    sub.push({ sep: true });
                    if (!own) sub.push({ label: b.el.classList.contains('is-collapsed') ? 'Развернуть блок' : 'Свернуть блок', action: () => toggleCollapse(b.el) });
                    if (!own && !b.el.hasAttribute('data-wall-fixed') && b.el.querySelector(':scope > h3 .w95-ctl-pin')) {
                        sub.push({ label: b.el.classList.contains('on-wall') ? 'Убрать со стены' : 'Повесить на стену', action: () => toggleWall(b.el) });
                    }
                    sub.push({ label: 'Значок на рабочем столе', check: onDesk(b.id), action: () => toggleDesk(b) });
                }
                return sub;
            }
        }));
    }

    function menusFor(w) {
        return [
            { id: 'file', label: 'Файл', items: () => fileMenu(w) },
            { id: 'edit', label: 'Правка', items: () => editMenu(w) },
            { id: 'view', label: 'Вид', items: () => viewMenu(w) },
            { id: 'blocks', label: 'Блоки', items: () => blocksMenu(w) }
        ];
    }

    // ---------- строка меню окна ----------
    function openBar(w, btn, byKey) {
        const def = menusFor(w).find(d => d.id === btn.dataset.m);
        if (!def) return;
        closeAll();
        D.emit('closepopups-other');
        ownerBtn = btn;
        ownerWin = w;
        btn.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        const dd = show(def.items(), 0, 'below', btn.getBoundingClientRect());
        if (byKey) { const f = dd.querySelector('.dd-item:not(.is-dis)'); if (f) f.focus(); }
    }

    function stepBar(dir) {
        if (!ownerBtn) return;
        const btns = [...ownerBtn.parentNode.querySelectorAll('.mb-item')];
        const n = btns[(btns.indexOf(ownerBtn) + dir + btns.length) % btns.length];
        openBar(ownerWin, n, true);
    }

    function attach(w) {
        const bar = document.createElement('div');
        bar.className = 'desk-menubar';
        bar.setAttribute('role', 'menubar');
        bar.setAttribute('aria-label', 'Меню окна «' + w.title + '»');
        bar.innerHTML = menusFor(w).map(d =>
            `<button type="button" class="mb-item" role="menuitem" aria-haspopup="true" aria-expanded="false" data-m="${d.id}"><u>${esc(d.label.charAt(0))}</u>${esc(d.label.slice(1))}</button>`).join('');
        w.el.insertBefore(bar, w.body);
        w.menubar = bar;
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('.mb-item');
            if (!b) return;
            if (ownerBtn === b) { closeAll(); return; }
            openBar(w, b, e.detail === 0);
        });
        // как в Windows: пока меню открыто, наведение на соседний пункт переключает меню
        bar.addEventListener('pointerover', (e) => {
            if (e.pointerType !== 'mouse') return;
            const b = e.target.closest('.mb-item');
            if (b && ownerBtn && ownerWin === w && ownerBtn !== b) openBar(w, b, false);
        });
        bar.addEventListener('keydown', (e) => {
            const b = e.target.closest('.mb-item');
            if (!b) return;
            const btns = [...bar.querySelectorAll('.mb-item')];
            const i = btns.indexOf(b);
            if (e.key === 'ArrowRight') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); openBar(w, b, true); }
        });
    }
    D.on('win', attach);

    // Alt + первая буква меню — меню верхнего окна
    document.addEventListener('keydown', (e) => {
        if (!D.isStarted() || !e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
        const w = D.frontWin();
        if (!w || !w.menubar) return;
        const k = e.key.toLowerCase();
        const b = [...w.menubar.querySelectorAll('.mb-item')].find(x => x.textContent.charAt(0).toLowerCase() === k);
        if (!b) return;
        e.preventDefault();
        openBar(w, b, true);
    });

    D.menus = { addConfig: ADD, addNew };
})();
