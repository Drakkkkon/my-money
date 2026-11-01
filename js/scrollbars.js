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
    '#subs-list', '#salary-list', '.calc-tape', '.goals-list', '.q-list', '.sound-lib-list', '.icon-cat-list', '.cat-tiles'
].join(', ');
const SB_ARROW = 14;   // высота кнопки-стрелки
const SB_INSET = 2;    // отступ от рамки блока
const SB_MIN_THUMB = 20;
const sbRegistry = new Map(); // блок → { bar, thumb, ro }

function attachW95Scrollbar(el) {
    if (sbRegistry.has(el) || !el.parentElement) return;
    const parent = el.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const bar = document.createElement('div');
    bar.className = 'w95-sb';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="w95-sb-btn w95-sb-up"></div><div class="w95-sb-track"><div class="w95-sb-thumb"></div></div><div class="w95-sb-btn w95-sb-down"></div>';
    el.insertAdjacentElement('afterend', bar);
    const thumb = bar.querySelector('.w95-sb-thumb');
    const track = bar.querySelector('.w95-sb-track');

    const state = { bar, thumb, track, raf: 0 };
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

    // Положение полосы — у правого края блока, внутри его рамки
    const top = el.offsetTop + SB_INSET;
    const height = el.offsetHeight - SB_INSET * 2;
    st.bar.style.top = top + 'px';
    st.bar.style.left = (el.offsetLeft + el.offsetWidth - SB_INSET - st.bar.offsetWidth) + 'px';
    st.bar.style.height = height + 'px';

    const trackH = Math.max(0, height - SB_ARROW * 2);
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
    document.addEventListener('click', () => setTimeout(all, 50), true);
}
