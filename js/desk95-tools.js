// --- ТЕМА «WINDOWS 95_ПУСК»: ЧАСЫ И ДАТА НА ПАНЕЛИ ЗАДАЧ, КНОПКА МАСШТАБА В УГЛУ КАЖДОГО ОКНА (4.7.0) ---
// Часы: справа на панели задач, рядом с «Свернуть все». Время — по Алматы, 24 часа (как на заставке и во всём приложении), под ним дата.
//   Подсказка при наведении / долгом нажатии показывает день недели, полную дату и секунды.
// Масштаб: у каждого окна (страницы и блока) в правом нижнем углу кнопка с лупой. Нажатие открывает панель:
//   ползунок 50–200 % с шагом 5 (любой масштаб), кнопки «−» и «+», «100 %» и «Под экран».
//   «Под экран» подбирает масштаб по ширине экрана устройства (на телефоне около 100 %, на широком мониторе крупнее) и
//   пересчитывает его при повороте экрана и изменении размера окна браузера. Масштаб у каждого окна свой, хранится на устройстве
//   (localStorage finance_desk95_zoom). Тот же выбор есть в меню окна: Вид → Масштаб.
// Оформление — css/desk95.css (разделы «Часы 4.7.0» и «Масштаб 4.7.0»). Файл подключается после js/desk95.js.

(function () {
    'use strict';
    const D = window.DESK95;
    if (!D) return;

    // ---------- часы ----------
    const TZ = 'Asia/Almaty';
    let tray = null, tTime = null, tDate = null, timer = 0;
    let fmt = null, lastLang = '';

    function locale() {
        try {
            const l = typeof appLang !== 'undefined' ? appLang : 'ru';
            return ({ ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' })[l] || 'ru-RU';
        } catch (e) { return 'ru-RU'; }
    }

    function formatters() {
        const loc = locale();
        if (fmt && lastLang === loc) return fmt;
        lastLang = loc;
        const mk = (o) => { try { return new Intl.DateTimeFormat(loc, Object.assign({ timeZone: TZ }, o)); } catch (e) { return new Intl.DateTimeFormat('ru-RU', o); } };
        fmt = {
            time: mk({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
            sec: mk({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
            date: mk({ day: '2-digit', month: '2-digit', year: 'numeric' }),
            full: mk({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        };
        return fmt;
    }

    function tick() {
        if (!tray || !tray.isConnected) return;
        const f = formatters(), now = new Date();
        const t = f.time.format(now), d = f.date.format(now);
        if (tTime.textContent !== t) tTime.textContent = t;
        if (tDate.textContent !== d) tDate.textContent = d;
        tray.dataset.tip = f.full.format(now) + ', ' + f.sec.format(now);
        tray.setAttribute('aria-label', 'Время ' + t + ', дата ' + d);
    }

    D.on('build', (ctx) => {
        tray = ctx.bar.querySelector('.tb-tray');
        if (!tray) return;
        tray.innerHTML = '<span class="tb-time"></span><span class="tb-date"></span>';
        tTime = tray.querySelector('.tb-time');
        tDate = tray.querySelector('.tb-date');
        tick();
        clearInterval(timer);
        timer = setInterval(tick, 1000);
    });
    D.on('leave', () => { clearInterval(timer); timer = 0; tray = tTime = tDate = null; });

    // ---------- масштаб ----------
    const KEY = 'finance_desk95_zoom';
    const MIN = 0.5, MAX = 2;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const round5 = (v) => Math.round(v * 20) / 20;
    let store = null;
    let openFor = null; // окно, у которого открыта панель масштаба

    function readStore() {
        if (store) return store;
        try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
        if (typeof store !== 'object' || Array.isArray(store)) store = {};
        return store;
    }
    function writeStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

    // «Под экран»: масштаб по ширине экрана устройства — телефон около 100 %, планшет и ПК крупнее по мере роста экрана
    function fitScale() {
        const st = D.stage();
        const sw = st ? st.clientWidth : window.innerWidth;
        const s = sw < 700 ? sw / 400 : sw / 1180;
        return round5(clamp(s, sw < 700 ? 0.85 : 0.9, sw < 700 ? 1.15 : 1.5));
    }

    function get(w) {
        const z = readStore()[w.key];
        if (z && z.m === 'f') return { mode: 'f', v: fitScale() };
        const v = z && isFinite(z.v) ? clamp(z.v, MIN, MAX) : 1;
        return { mode: 'm', v: round5(v) };
    }

    function apply(w) {
        const z = get(w);
        if (z.v === 1) w.main.style.removeProperty('zoom'); else w.main.style.zoom = String(z.v);
        const ui = w.zoomUi;
        if (ui) {
            const pct = Math.round(z.v * 100);
            ui.pct.textContent = pct + '%';
            ui.fab.classList.toggle('is-changed', z.mode === 'f' || pct !== 100);
            ui.fab.title = 'Масштаб: ' + (z.mode === 'f' ? 'под экран, ' : '') + pct + '%';
            ui.val.textContent = pct + '%' + (z.mode === 'f' ? ' · под экран' : '');
            ui.range.value = String(pct);
            ui.fit.classList.toggle('is-on', z.mode === 'f');
            ui.fit.setAttribute('aria-pressed', String(z.mode === 'f'));
            ui.one.classList.toggle('is-on', z.mode !== 'f' && pct === 100);
            ui.range.setAttribute('aria-valuetext', pct + '%');
        }
    }

    function set(w, z) {
        readStore();
        if (z.mode === 'f') store[w.key] = { m: 'f' };
        else store[w.key] = { m: 'm', v: round5(clamp(z.v, MIN, MAX)) };
        writeStore();
        apply(w);
        // диаграммы и полосы прокрутки подстраиваются под новый размер
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    }

    function closePop() {
        if (!openFor) return;
        const w = openFor;
        openFor = null;
        if (w.zoomUi) { w.zoomUi.pop.hidden = true; w.zoomUi.fab.setAttribute('aria-expanded', 'false'); }
    }

    function pop(w) {
        if (!w.zoomUi) return;
        if (D.menu) D.menu.close();
        if (openFor === w) { closePop(); return; }
        closePop();
        openFor = w;
        w.zoomUi.pop.hidden = false;
        w.zoomUi.fab.setAttribute('aria-expanded', 'true');
        apply(w);
        D.sound('open');
    }

    function attach(w) {
        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'desk-zoom';
        fab.setAttribute('aria-haspopup', 'true');
        fab.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-label', 'Масштаб окна');
        fab.innerHTML =
            '<svg class="dz-lens" viewBox="0 0 20 20" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
            '<circle cx="8" cy="8" r="5.5" fill="#fff" stroke="#000" stroke-width="1.6"/>' +
            '<path d="M12 12l6 6" stroke="#000" stroke-width="3"/><path d="M12.4 11.6l5.6 5.6" stroke="#c0c0c0" stroke-width="1"/>' +
            '<path d="M5.5 8h5M8 5.5v5" stroke="#000080" stroke-width="1.4"/></svg><span class="dz-pct">100%</span>';
        const panel = document.createElement('div');
        panel.className = 'desk-zoompop';
        panel.hidden = true;
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Масштаб');
        panel.innerHTML =
            '<div class="dz-head"><span>Масштаб</span><b class="dz-val">100%</b></div>' +
            '<div class="dz-row"><button type="button" class="dz-b dz-minus" aria-label="Уменьшить">−</button>' +
            '<input type="range" class="dz-range" min="50" max="200" step="5" value="100" aria-label="Масштаб, проценты">' +
            '<button type="button" class="dz-b dz-plus" aria-label="Увеличить">+</button></div>' +
            '<div class="dz-row dz-presets"><button type="button" class="dz-b dz-fit" aria-pressed="false">Под экран</button>' +
            '<button type="button" class="dz-b dz-one">100%</button></div>';
        w.el.appendChild(fab);
        w.el.appendChild(panel);
        w.zoomUi = {
            fab, pop: panel, pct: fab.querySelector('.dz-pct'), val: panel.querySelector('.dz-val'),
            range: panel.querySelector('.dz-range'), fit: panel.querySelector('.dz-fit'), one: panel.querySelector('.dz-one')
        };
        fab.addEventListener('click', () => pop(w));
        const cur = () => get(w).v;
        panel.querySelector('.dz-minus').addEventListener('click', () => set(w, { mode: 'm', v: cur() - 0.05 }));
        panel.querySelector('.dz-plus').addEventListener('click', () => set(w, { mode: 'm', v: cur() + 0.05 }));
        w.zoomUi.range.addEventListener('input', () => set(w, { mode: 'm', v: Number(w.zoomUi.range.value) / 100 }));
        w.zoomUi.fit.addEventListener('click', () => { set(w, { mode: 'f' }); D.sound('click'); });
        w.zoomUi.one.addEventListener('click', () => { set(w, { mode: 'm', v: 1 }); D.sound('click'); });
        panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); fab.focus(); } });
        apply(w);
    }

    D.on('win', attach);
    D.on('closepopups', closePop);
    D.on('closepopups-other', closePop);
    D.on('winclose', (w) => { if (openFor === w) closePop(); });
    D.on('leave', () => { openFor = null; store = null; });
    // «Под экран» следует за размером экрана: поворот телефона, изменение окна браузера
    D.on('resize', () => D.wins.forEach(w => { const z = readStore()[w.key]; if (z && z.m === 'f') apply(w); }));
    D.on('shown', (w) => { const z = readStore()[w.key]; if (z && z.m === 'f') apply(w); });

    document.addEventListener('pointerdown', (e) => {
        if (!openFor) return;
        if (e.target.closest('.desk-zoompop, .desk-zoom')) return;
        closePop();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && openFor) { const f = openFor.zoomUi && openFor.zoomUi.fab; closePop(); if (f) f.focus(); e.stopImmediatePropagation(); }
    }, true);

    D.zoom = { get, set, pop, fitScale };
})();
