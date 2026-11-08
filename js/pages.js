// --- 4.9.0: МЕНЮ НАСТРОЕК, «СТРАНИЦЫ ВМЕСТО БЛОКОВ», БЛОК ЧАСОВ И КУРСОВ — ТОЛЬКО НА СТЕНЕ ---
// Одно общее устройство «страниц» для всех тем, кроме «Windows 95_Пуск» и папки «Windows 95_Экстра»
// (у них свой рабочий стол с окнами и меню — js/desk95*.js, они остаются как были):
//
// 1) «Настройки» — обычное меню. Вместо сетки блоков — список пунктов (значок, название, пояснение, стрелка), сгруппированный
//    по смыслу. Нажатие открывает страницу ОДНОЙ настройки на весь экран с кнопкой «Назад»; на телефоне кнопка «Назад» самого
//    телефона (и в браузере) тоже возвращает в список. Вид меню и страницы у каждой темы свой — css/pages.css.
// 2) «Страницы вместо блоков» (Настройки → «Разметка и меню», uiPrefs.layout.noBlocks). Каждый блок раздела — отдельная
//    страница на всю ширину, один блок на экране, без кнопок размера, булавки «На стену», «свернуть» и «развернуть».
//    Если блоков до 5 — над страницей полоса-переключатель (вкладки), если больше — тот же список-меню, что в Настройках.
//    Размеры блоков и свёрнутость на это время игнорируются (сами значения не стираются — выключили режим, всё вернулось).
//    «Стена» остаётся стеной: на ней блоки и должны лежать вместе.
// 3) Блок «Текущий баланс» с датой, временем, погодой и курсами показывается только на «Стене» (data-tab="wall" на <html>).
//
// Как это устроено: страницы и карточки — те же самые элементы с теми же id и обработчиками, ничего не переносится:
// на <div class="tab"> ставится data-pg (вид: list — список, page — страница), у показанной карточки — класс pg-active,
// остальные скрывает css/pages.css. Выключили режим — атрибуты и вставленные панели убираются, раздел как прежде.

(function () {
    'use strict';

    const root = document.documentElement;
    const isDesk = () => root.getAttribute('data-w95') === 'desk95';
    const tt = (s) => (typeof tr === 'function' ? tr(s) : s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sound = (n) => { try { if (typeof playSound === 'function') playSound(n); } catch (e) {} };

    // Режимы. smActive — меню Настроек, pagesActive — «страницы вместо блоков» (обе — только вне «Windows 95_Пуск»)
    const prefNoBlocks = () => { try { return !!(typeof uiPrefs !== 'undefined' && uiPrefs.layout && uiPrefs.layout.noBlocks); } catch (e) { return false; } };
    const smActive = () => !isDesk();
    window.pagesActive = () => prefNoBlocks() && !isDesk();
    const MAX_CHIPS = 5; // до этого числа блоков — вкладки, больше — список-меню

    // Группы пунктов меню Настроек. Карточка попадает в группу по своему id или по названию значка в заголовке (он не переводится)
    const SM_GROUPS = [
        { name: 'Аккаунт и данные', keys: ['auth-section', 'profile-section', 'lock', 'speed', 'save'] },
        { name: 'Оформление и вид', keys: ['palette', 'desk-wall-card', 'font-settings-card', 'layout-settings-card', 'menu_open', 'icon-app-card',
            'header-settings-card', 'icon-settings-form-card', 'icon-settings-history-card'] },
        { name: 'Ввод, звук и уведомления', keys: ['label', 'ocr-card', 'voice-card', 'volume_up', 'notify-card'] },
        { name: 'Приложение', keys: ['lang-card', 'history'] },
        { name: 'Администратор', keys: ['admin-card', 'activity-card'] }
    ];

    const sel = {};      // раздел → id выбранной вкладки (для вкладок) — запоминается, пока открыта программа
    let pushedKey = null; // «раздел:карточка» — для кнопки «Назад» телефона

    // ---------- вспомогательное ----------
    function tabById(id) { return document.getElementById(id); }
    function contentTabs() { return [...document.querySelectorAll('main > .tab')].filter(t => t.id !== 'wall'); }

    function cardInfo(card) {
        const h = card.querySelector(':scope > h3');
        let icon = '', title = '';
        if (h) {
            const c = h.cloneNode(true);
            c.querySelectorAll('.w95-ctls, .wall-tools').forEach(n => n.remove());
            const ic = c.querySelector('.material-icons');
            if (ic) { icon = ic.textContent.trim(); ic.remove(); }
            title = c.textContent.replace(/\s+/g, ' ').trim();
        }
        return { id: card.id, icon: icon || 'chevron_right', title: title || card.id };
    }

    // Карточки раздела, которые сейчас вообще показываются (скрытые админские, обои вне рабочего стола и т. п. — нет).
    // Меряем при снятом data-pg: иначе наши же правила скрыли бы все карточки.
    function availableCards(tab) {
        const had = tab.getAttribute('data-pg');
        if (had !== null) tab.removeAttribute('data-pg');
        const list = [...tab.querySelectorAll('.card')].filter(c =>
            !c.parentElement.closest('.card') && !c.classList.contains('on-wall') && !c.classList.contains('wall-info') &&
            getComputedStyle(c).display !== 'none');
        if (had !== null) tab.setAttribute('data-pg', had);
        return list;
    }

    function kindOf(tab, count) {
        if (tab.id === 'settings') return smActive() ? 'menu' : null;
        if (!window.pagesActive() || count < 2) return null;
        return count > MAX_CHIPS ? 'menu' : 'chips';
    }

    function groupIndex(card, info) {
        const i = SM_GROUPS.findIndex(g => g.keys.includes(card.id) || g.keys.includes(info.icon));
        return i < 0 ? SM_GROUPS.length : i;
    }

    // Пояснение под названием пункта (текущее значение) — только там, где оно есть и коротко
    function subtitleFor(tab, card, info) {
        if (tab.id !== 'settings') return '';
        const val = (id) => { const el = document.getElementById(id); return el ? (el.value || el.textContent || '').trim() : ''; };
        try {
            if (card.id === 'auth-section') {
                const out = document.getElementById('auth-logged-in');
                const logged = out && out.style.display !== 'none';
                return logged ? val('user-email-display') : tt('Вход не выполнен');
            }
            if (card.id === 'profile-section') return val('profile-name');
            if (info.icon === 'palette' && typeof resolveTheme === 'function') return resolveTheme(currentThemeId).name || '';
            if (info.icon === 'speed') { const v = Number(val('manual-limit')); return v > 0 ? Math.round(v).toLocaleString('ru-RU') + ' ₸' : tt('Не установлен'); }
            if (card.id === 'lang-card') { const on = card.querySelector('.lang-opt.is-on'); return on ? on.textContent.replace(/\s+/g, ' ').trim() : ''; }
        } catch (e) {}
        return '';
    }

    // ---------- построение ----------
    function buildMenu(tab, cards) {
        const infos = cards.map(c => ({ card: c, info: cardInfo(c) }));
        let groups;
        if (tab.id === 'settings') {
            groups = SM_GROUPS.map(g => ({ name: g.name, items: [] })).concat([{ name: 'Другое', items: [] }]);
            infos.forEach(x => groups[groupIndex(x.card, x.info)].items.push(x));
            groups = groups.filter(g => g.items.length);
            if (groups.length === 1) groups[0].name = '';
        } else {
            groups = [{ name: '', items: infos }];
        }
        const rows = groups.map(g => `<section class="pg-group">${g.name ? `<h4 class="pg-group-title">${esc(tt(g.name))}</h4>` : ''}<ul class="pg-rows">` +
            g.items.map(({ card, info }) => {
                const sub = subtitleFor(tab, card, info);
                return `<li><div role="button" tabindex="0" class="pg-row" data-card="${esc(card.id)}">` +
                    `<span class="pg-ico"><span class="material-icons">${esc(info.icon)}</span></span>` +
                    `<span class="pg-txt"><b>${esc(info.title)}</b>${sub ? `<small data-i18n-skip>${esc(sub)}</small>` : ''}</span>` +
                    `<span class="pg-chev material-icons" aria-hidden="true">chevron_right</span></div></li>`;
            }).join('') + '</ul></section>').join('');
        const label = (typeof MENU_ITEMS !== 'undefined' && (MENU_ITEMS.find(i => i.id === tab.id) || {}).label) || '';
        return `<div class="pg-list">${rows}</div>` +
            `<div class="pg-bar"><div role="button" tabindex="0" class="pg-back" aria-label="${esc(tt('Назад'))}"><span class="material-icons" aria-hidden="true">arrow_back</span><span class="pg-back-text">${esc(label)}</span></div>` +
            `<span class="pg-bar-title"><span class="pg-bar-ico material-icons" aria-hidden="true"></span><b></b></span></div>`;
    }

    function buildChips(cards, current) {
        return '<div class="pg-bar pg-chips" role="tablist" data-no-swipe>' + cards.map(c => {
            const i = cardInfo(c);
            return `<div role="tab" tabindex="0" class="pg-chip" data-card="${esc(c.id)}" aria-selected="${c.id === current}">` +
                `<span class="material-icons" aria-hidden="true">${esc(i.icon)}</span><span class="pg-chip-text">${esc(i.title)}</span></div>`;
        }).join('') + '</div>';
    }

    function teardown(tab) {
        tab.removeAttribute('data-pg');
        tab.removeAttribute('data-pg-view');
        tab.classList.remove('pg-on');
        tab._pgSig = null;
        const r = tab.querySelector(':scope > .pg-root');
        if (r) r.remove();
        tab.querySelectorAll('.card.pg-active').forEach(c => c.classList.remove('pg-active'));
    }

    // Показать нужное: список / страница; у нужной карточки — pg-active, в панели — её название
    function syncView(tab) {
        const kind = tab.getAttribute('data-pg');
        if (!kind) return;
        const open = tab._pgOpen && tabById(tab._pgOpen) ? tab._pgOpen : null;
        const showId = kind === 'chips' ? (sel[tab.id] || null) : open;
        tab.querySelectorAll('.card').forEach(c => c.classList.toggle('pg-active', !!showId && c.id === showId));
        tab.setAttribute('data-pg-view', kind === 'menu' && !showId ? 'list' : 'page');
        const r = tab.querySelector(':scope > .pg-root');
        if (!r) return;
        if (kind === 'chips') {
            r.querySelectorAll('.pg-chip').forEach(b => b.setAttribute('aria-selected', String(b.dataset.card === showId)));
        } else if (showId) {
            const i = cardInfo(tabById(showId));
            const t = r.querySelector('.pg-bar-title');
            if (t) { t.querySelector('b').textContent = i.title; t.querySelector('.pg-bar-ico').textContent = i.icon; }
        }
    }

    function render(tab, { resetView = false } = {}) {
        if (!tab) return;
        const cards = (smActive() || window.pagesActive()) ? availableCards(tab) : [];
        const kind = kindOf(tab, cards.length);
        if (!kind) { if (tab.hasAttribute('data-pg') || tab.querySelector(':scope > .pg-root')) teardown(tab); return; }
        const sig = kind + '|' + cards.map(c => { const i = cardInfo(c); return c.id + ':' + i.title + ':' + (kind === 'menu' ? subtitleFor(tab, c, i) : ''); }).join(',');
        if (tab._pgSig !== sig || !tab.querySelector(':scope > .pg-root')) {
            const old = tab.querySelector(':scope > .pg-root');
            if (old) old.remove();
            if (kind === 'chips' && !cards.some(c => c.id === sel[tab.id])) {
                const forms = cards.find(c => c.classList.contains('forms'));
                sel[tab.id] = (forms || cards[0]).id;
            }
            const box = document.createElement('div');
            box.className = 'pg-root';
            box.dataset.kind = kind;
            box.innerHTML = kind === 'menu' ? buildMenu(tab, cards) : buildChips(cards, sel[tab.id]);
            tab.insertBefore(box, tab.firstChild);
            tab._pgSig = sig;
        }
        tab.setAttribute('data-pg', kind);
        tab.classList.add('pg-on');
        if (resetView && kind === 'menu') closePage(tab, { silent: true });
        if (kind === 'menu' && tab._pgOpen && !cards.some(c => c.id === tab._pgOpen)) tab._pgOpen = null;
        syncView(tab);
    }

    function renderAll(opts) {
        const tabs = [...document.querySelectorAll('main > .tab')];
        tabs.forEach(t => { if (t.id !== 'wall') render(t, opts); });
    }

    // ---------- переходы ----------
    function openPage(tab, cardId, { fromHistory = false } = {}) {
        const kind = tab.getAttribute('data-pg');
        if (!kind) return;
        if (kind === 'chips') {
            if (sel[tab.id] === cardId) return;
            sel[tab.id] = cardId;
            sound('click');
        } else {
            tab._pgOpen = cardId;
            sound('open');
            if (!fromHistory) {
                try { history.pushState({ pg: tab.id + ':' + cardId }, ''); pushedKey = tab.id + ':' + cardId; } catch (e) { pushedKey = null; }
            }
        }
        syncView(tab);
        const mw = document.querySelector('.main-wrapper');
        if (mw) mw.scrollTop = 0;
        // диаграммам и спискам нужен видимый холст
        setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 30);
        if (tab.id === 'prices' && typeof renderPrices === 'function') { try { renderPrices(); } catch (e) {} }
        if (tab.id === 'quotes' && typeof onQuotesTabShown === 'function') { try { onQuotesTabShown(); } catch (e) {} }
    }

    function closePage(tab, { silent = false, viaHistory = false } = {}) {
        if (!tab || !tab._pgOpen) return;
        tab._pgOpen = null;
        if (!silent) sound('close');
        if (pushedKey && pushedKey.indexOf(tab.id + ':') === 0) {
            const k = pushedKey;
            pushedKey = null;
            if (!viaHistory) { try { history.back(); } catch (e) {} }
            void k;
        }
        syncView(tab);
        if (!viaHistory) render(tab); // обновить пояснения в списке (например, выбранный язык)
        const mw = document.querySelector('.main-wrapper');
        if (mw) mw.scrollTop = 0;
    }

    // нажатия в списке, на вкладках и «Назад»
    document.addEventListener('click', (e) => {
        const root0 = e.target.closest && e.target.closest('.pg-root');
        if (!root0) return;
        const tab = root0.closest('.tab');
        if (!tab) return;
        const back = e.target.closest('.pg-back');
        if (back) { closePage(tab); return; }
        const b = e.target.closest('.pg-row, .pg-chip');
        if (b && b.dataset.card) openPage(tab, b.dataset.card);
    });

    // с клавиатуры: Enter и пробел нажимают строку, вкладку и «Назад»; стрелки ←/→ переключают вкладки
    document.addEventListener('keydown', (e) => {
        const el = e.target && e.target.closest && e.target.closest('.pg-row, .pg-chip, .pg-back');
        if (!el) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); return; }
        if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && el.classList.contains('pg-chip')) {
            const all = [...el.parentElement.querySelectorAll('.pg-chip')];
            const n = all[all.indexOf(el) + (e.key === 'ArrowRight' ? 1 : -1)];
            if (n) { e.preventDefault(); n.click(); n.focus(); }
        }
    });

    // кнопка «Назад» телефона и браузера
    window.addEventListener('popstate', () => {
        pushedKey = null;
        document.querySelectorAll('main > .tab[data-pg="menu"]').forEach(t => { if (t._pgOpen) closePage(t, { silent: false, viaHistory: true }); });
    });

    // ---------- режимы и атрибуты ----------
    function syncModes() {
        root.setAttribute('data-sm', smActive() ? 'on' : 'off');
        root.setAttribute('data-pages', window.pagesActive() ? 'on' : 'off');
    }

    // Режим «страницы» включили или выключили: возвращаем размеры и свёрнутость блоков и перерисовываем страницы
    let lastPages = null;
    function onModesChanged() {
        syncModes();
        const now = window.pagesActive();
        if (lastPages !== null && lastPages !== now) {
            try { if (typeof enhanceCards === 'function') enhanceCards(); } catch (e) {}
            try { if (typeof applyCardSizes === 'function') applyCardSizes(); } catch (e) {}
        }
        lastPages = now;
        renderAll();
    }

    // Из showTab (js/script.js): показывается раздел — отметка на <html> и свежий список страниц
    window.pagesOnTabShown = function (tabId) {
        root.setAttribute('data-tab', tabId);
        // из раздела ушли, не закрыв страницу: закрываем сразу (и убираем лишнюю запись истории для кнопки «Назад»)
        document.querySelectorAll('main > .tab[data-pg="menu"]').forEach(t => { if (t.id !== tabId && t._pgOpen) closePage(t, { silent: true }); });
        const tab = tabById(tabId);
        if (tab && tabId !== 'wall') render(tab, { resetView: true });
    };

    // Следим за разделами: карточки добавляются и убираются (котировки, админские блоки в Настройках)
    let watchTimer = null;
    const watcher = new MutationObserver(() => {
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => renderAll(), 90);
    });
    function watch() {
        document.querySelectorAll('main > .tab').forEach(t => {
            if (t.id === 'wall' || t._pgWatched) return;
            t._pgWatched = true;
            watcher.observe(t, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        });
    }

    window.addEventListener('w95-theme', () => setTimeout(onModesChanged, 0));
    window.addEventListener('app-layout', () => setTimeout(onModesChanged, 0));
    window.addEventListener('app-lang', () => setTimeout(() => renderAll(), 60));
    window.addEventListener('DOMContentLoaded', () => {
        root.setAttribute('data-tab', (typeof currentTabId !== 'undefined' && currentTabId) || 'transactions');
        watch();
        setTimeout(onModesChanged, 0);
    });
    window.addEventListener('load', () => { watch(); onModesChanged(); });
})();
