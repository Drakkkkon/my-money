// --- ПОЛОСЫ ПРОКРУТКИ В СТИЛЕ WINDOWS 95 ---
// Во всех блоках, которые прокручиваются внутри себя, рисуется небольшая полоса: стрелки вверх/вниз,
// «рябая» дорожка и выпуклый ползунок. Ползунок можно тянуть пальцем или мышью, по дорожке и стрелкам — нажимать.
// Нужна своя полоса, потому что Chrome на Android не показывает оформленные полосы прокрутки.
// Полоса — отдельный элемент рядом с блоком (в его родителе), поэтому сама не прокручивается вместе с содержимым.

// Блоки с прокруткой внутри (полоса появляется, только когда содержимое не помещается)
const W95_SCROLL_SELECTORS = [
    '#tx-list', '#ob-list', '.changelog', '.export-sheet-table', '.custom-dropdown',
    '.sound-slots', '.custom-categories',
    // 3.8: длинные списки прокручиваются внутри своих блоков
    '#subs-list', '#salary-list', '.calc-tape', '.goals-list', '.q-list', '.sound-lib-list', '.icon-cat-list', '.cat-tiles',
    '.shop-list', '.pr-list', '.notify-log',
    // 3.10: вся страница приложения — ползунок справа во весь рост экрана
    '.main-wrapper'
].join(', ');
const SB_INSET = 2;    // отступ от рамки блока
const SB_MIN_THUMB = 34; // не меньше подушечки пальца
const sbRegistry = new Map(); // блок → { bar, thumb, ro }

function attachW95Scrollbar(el) {
    if (sbRegistry.has(el) || !el.parentElement) return;
    const parent = el.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const bar = document.createElement('div');
    const isPage = el.classList.contains('main-wrapper');
    bar.className = 'w95-sb' + (isPage ? ' w95-sb-page' : '');
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="w95-sb-btn w95-sb-up"></div><div class="w95-sb-track"><div class="w95-sb-thumb"></div></div><div class="w95-sb-btn w95-sb-down"></div>';
    el.insertAdjacentElement('afterend', bar);
    const thumb = bar.querySelector('.w95-sb-thumb');
    const track = bar.querySelector('.w95-sb-track');

    const state = { bar, thumb, track, raf: 0, isPage, up: bar.querySelector('.w95-sb-up') };
    const update = () => {
        state.raf = 0;
        updateW95Scrollbar(el, state);
    };
    state.schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(update); };

    el.addEventListener('scroll', state.schedule, { passive: true });
    if (window.ResizeObserver) {
        state.ro = new ResizeObserver(state.schedule);
        state.ro.observe(el);
    }
    state.mo = new MutationObserver(state.schedule);
    state.mo.observe(el, { childList: true, subtree: true, characterData: true });

    // Стрелки: шаг 40 px; дорожка: на страницу вверх/вниз
    bar.querySelector('.w95-sb-up').addEventListener('pointerdown', e => { e.preventDefault(); el.scrollTop -= 40; });
    bar.querySelector('.w95-sb-down').addEventListener('pointerdown', e => { e.preventDefault(); el.scrollTop += 40; });
    track.addEventListener('pointerdown', e => {
        if (e.target === thumb) return;
        e.preventDefault();
        const rect = thumb.getBoundingClientRect();
        el.scrollTop += (e.clientY < rect.top ? -1 : 1) * el.clientHeight * 0.9;
    });

    // Перетаскивание ползунка
    thumb.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startScroll = el.scrollTop;
        const trackSpace = track.clientHeight - thumb.offsetHeight;
        const scrollSpace = el.scrollHeight - el.clientHeight;
        thumb.classList.add('is-dragging');
        try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
        const move = ev => {
            if (trackSpace > 0) el.scrollTop = startScroll + (ev.clientY - startY) * scrollSpace / trackSpace;
        };
        const end = () => {
            thumb.classList.remove('is-dragging');
            thumb.removeEventListener('pointermove', move);
            thumb.removeEventListener('pointerup', end);
            thumb.removeEventListener('pointercancel', end);
        };
        thumb.addEventListener('pointermove', move);
        thumb.addEventListener('pointerup', end);
        thumb.addEventListener('pointercancel', end);
    });

    sbRegistry.set(el, state);
    el.classList.add('w95-has-sb');
    state.schedule();
}

function updateW95Scrollbar(el, st) {
    const style = getComputedStyle(el);
    const scrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && style.display !== 'none';
    const need = scrollable && el.offsetParent !== null && el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle('w95-sb-active', need);
    st.bar.style.display = need ? '' : 'none';
    if (!need) return;

    let height;
    if (st.isPage) {
        // Страница целиком: полоса закреплена у правого края экрана и не заходит под нижнее меню / панель задач
        const r = el.getBoundingClientRect();
        let bottom = Math.min(r.bottom, window.innerHeight);
        document.querySelectorAll('.mobile-nav, .sidebar').forEach(b => {
            const br = b.getBoundingClientRect();
            if (getComputedStyle(b).display !== 'none' && br.height > 0 && br.top > window.innerHeight / 2 && br.width > window.innerWidth / 2) bottom = Math.min(bottom, br.top);
        });
        height = Math.max(60, bottom - r.top - SB_INSET * 2);
        // приложение по центру экрана (css/layout.css, transform): «закреплённая» полоса отсчитывается от него
        const wrap = el.closest('.app-wrapper');
        const shift = wrap && getComputedStyle(wrap).transform !== 'none' ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
        st.bar.style.top = (r.top - shift.top + SB_INSET) + 'px';
        st.bar.style.left = (r.right - shift.left - SB_INSET - st.bar.offsetWidth) + 'px';
    } else {
        // Положение полосы — у правого края блока, внутри его рамки
        height = el.offsetHeight - SB_INSET * 2;
        st.bar.style.top = (el.offsetTop + SB_INSET) + 'px';
        st.bar.style.left = (el.offsetLeft + el.offsetWidth - SB_INSET - st.bar.offsetWidth) + 'px';
    }
    st.bar.style.height = height + 'px';

    // высота стрелок берётся из темы (в «Метро» их нет)
    const arrow = st.up.offsetHeight || 0;
    const trackH = Math.max(0, height - arrow * 2);
    const ratio = el.clientHeight / el.scrollHeight;
    const thumbH = Math.max(SB_MIN_THUMB, Math.round(trackH * ratio));
    const maxScroll = el.scrollHeight - el.clientHeight;
    const pos = maxScroll > 0 ? (trackH - thumbH) * (el.scrollTop / maxScroll) : 0;
    st.thumb.style.height = thumbH + 'px';
    st.thumb.style.transform = `translateY(${Math.round(pos)}px)`;
}

function scanW95Scrollbars(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches(W95_SCROLL_SELECTORS)) attachW95Scrollbar(scope);
    scope.querySelectorAll(W95_SCROLL_SELECTORS).forEach(attachW95Scrollbar);
}

function cleanupW95Scrollbars() {
    sbRegistry.forEach((st, el) => {
        if (el.isConnected) return;
        if (st.ro) st.ro.disconnect();
        if (st.mo) st.mo.disconnect();
        st.bar.remove();
        sbRegistry.delete(el);
    });
}

function initW95Scrollbars() {
    scanW95Scrollbars(document);
    // Новые блоки (окно выгрузки, выбор звуков, выпадающие списки) получают полосу автоматически
    new MutationObserver(muts => {
        let removed = false;
        muts.forEach(m => {
            m.addedNodes.forEach(n => { if (n.nodeType === 1) scanW95Scrollbars(n); });
            if (m.removedNodes.length) removed = true;
        });
        if (removed) cleanupW95Scrollbars();
    }).observe(document.body, { childList: true, subtree: true });
    // При смене размера окна и вкладок пересчитать все полосы
    const all = () => sbRegistry.forEach(st => st.schedule());
    window.addEventListener('resize', all);
    window.addEventListener('app-layout', () => setTimeout(all, 60)); // смена разметки в настройках (js/layout.js)
    document.addEventListener('click', () => setTimeout(all, 50), true);
}
