// --- ТЕМА «ANDROID» (4.8.0): ВОЛНА-ОТКЛИК ПРИ НАЖАТИИ ---
// Как у кнопок Android: от точки касания по элементу расходится светлая волна. Работает только когда включена тема «Android»
// (html[data-w95="android"]) и не мешает остальным темам. Разметку страницы файл не меняет: он лишь ставит элементу
// переменные --rx / --ry (точка нажатия) и на полсекунды класс md-rip; сама волна рисуется в css/android.css (раздел «Волна»).
// Выключается, если в системе включено «Уменьшить анимацию» (prefers-reduced-motion).
(function () {
    'use strict';
    const TARGETS = [
        'button:not(.w95-sb-btn):not(.slider-thumb)', 'label.btn-secondary', '.menu-row', '.theme-swatch', '.theme-folder', '.tx-item', '.sub-item',
        '.dropdown-item', '.size-opt', '.cat-tile', '.pin-btn', '.goal-item', '.obc-item', 'summary'
    ].join(',');
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    document.addEventListener('pointerdown', function (e) {
        if (document.documentElement.getAttribute('data-w95') !== 'android' || reduce.matches) return;
        if (e.button && e.button !== 0) return;
        const el = e.target.closest && e.target.closest(TARGETS);
        if (!el || el.disabled) return;
        const r = el.getBoundingClientRect();
        // радиус волны — до самого дальнего угла
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const far = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
        el.style.setProperty('--rx', Math.round(x) + 'px');
        el.style.setProperty('--ry', Math.round(y) + 'px');
        el.style.setProperty('--rmax', Math.ceil(far) + 'px');
        el.classList.remove('md-rip');
        void el.offsetWidth; // перезапуск анимации при быстрых повторных нажатиях
        el.classList.add('md-rip');
        clearTimeout(el._mdRipTimer);
        el._mdRipTimer = setTimeout(function () { el.classList.remove('md-rip'); }, 620);
    }, true);
})();
