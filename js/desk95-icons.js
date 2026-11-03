// --- ТЕМА «WINDOWS 95_ПУСК»: ЗНАЧКИ РАБОЧЕГО СТОЛА ---
// Значки 32×32 нарисованы «пикселями» в 16 цветах Windows 95 (чёрные контуры, серые тени, чистые цвета) — без картинок и без
// файлов Microsoft. Каждый значок — отдельный SVG; ключ — id раздела меню (script.js → MENU_ITEMS).
// Используются js/desk95.js: на рабочем столе, в заголовках окон и на кнопке «Свернуть все».

(function () {
    const svg = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + body + '</svg>';

    window.DESK95_ICONS = {
        // Записи — блокнот на кольцах с карандашом
        transactions: svg(
            '<rect x="4" y="4" width="22" height="25" fill="#000"/><rect x="5" y="5" width="20" height="23" fill="#fff"/>' +
            '<rect x="26" y="6" width="2" height="24" fill="#808080"/><rect x="6" y="29" width="22" height="2" fill="#808080"/>' +
            '<rect x="5" y="5" width="20" height="5" fill="#000080"/><rect x="5" y="5" width="20" height="1" fill="#1084d0"/>' +
            '<rect x="8" y="2" width="3" height="6" fill="#000"/><rect x="9" y="2" width="1" height="5" fill="#c0c0c0"/>' +
            '<rect x="13" y="2" width="3" height="6" fill="#000"/><rect x="14" y="2" width="1" height="5" fill="#c0c0c0"/>' +
            '<rect x="18" y="2" width="3" height="6" fill="#000"/><rect x="19" y="2" width="1" height="5" fill="#c0c0c0"/>' +
            '<rect x="7" y="12" width="1" height="15" fill="#ff0000"/>' +
            '<rect x="9" y="13" width="13" height="1" fill="#0000c0"/><rect x="9" y="16" width="13" height="1" fill="#0000c0"/>' +
            '<rect x="9" y="19" width="13" height="1" fill="#0000c0"/><rect x="9" y="22" width="9" height="1" fill="#0000c0"/>' +
            '<rect x="9" y="25" width="6" height="1" fill="#0000c0"/>' +
            '<polygon points="26.5,13.5 31.5,18.5 21.5,28.5 16.5,23.5" fill="#000"/><polygon points="27,15 30,18 21,27 18,24" fill="#ffff00"/>' +
            '<polygon points="27,15 28.6,13.4 31.6,16.4 30,18" fill="#ff8080"/><polygon points="18,24 21,27 15.5,29.5" fill="#f0c890"/>' +
            '<polygon points="16.6,28.4 15.5,29.5 17.6,29.1" fill="#000"/>'
        ),

        // Стена — пробковая доска с цветными записками и кнопками
        wall: svg(
            '<rect x="2" y="4" width="28" height="24" fill="#000"/><rect x="3" y="5" width="26" height="22" fill="#a05a1a"/>' +
            '<rect x="3" y="5" width="26" height="1" fill="#d89040"/><rect x="3" y="5" width="1" height="22" fill="#d89040"/>' +
            '<rect x="28" y="6" width="1" height="21" fill="#70400f"/><rect x="4" y="26" width="25" height="1" fill="#70400f"/>' +
            '<rect x="5" y="7" width="22" height="18" fill="#d6a15e"/><rect x="5" y="7" width="22" height="1" fill="#8a5a22"/><rect x="5" y="7" width="1" height="18" fill="#8a5a22"/>' +
            '<rect x="9" y="22" width="1" height="1" fill="#a87438"/><rect x="21" y="9" width="1" height="1" fill="#a87438"/><rect x="25" y="21" width="1" height="1" fill="#a87438"/>' +
            '<rect x="14" y="23" width="1" height="1" fill="#a87438"/><rect x="7" y="18" width="1" height="1" fill="#a87438"/><rect x="24" y="14" width="1" height="1" fill="#a87438"/>' +
            '<rect x="7" y="9" width="9" height="9" fill="#000"/><rect x="8" y="10" width="7" height="7" fill="#ffff66"/>' +
            '<rect x="9" y="13" width="5" height="1" fill="#808000"/><rect x="9" y="15" width="3" height="1" fill="#808000"/>' +
            '<rect x="16" y="10" width="9" height="8" fill="#000"/><rect x="17" y="11" width="7" height="6" fill="#66ffff"/>' +
            '<rect x="18" y="14" width="5" height="1" fill="#008080"/><rect x="18" y="16" width="3" height="1" fill="#008080"/>' +
            '<rect x="11" y="18" width="10" height="7" fill="#000"/><rect x="12" y="19" width="8" height="5" fill="#ffb0c8"/>' +
            '<rect x="13" y="21" width="6" height="1" fill="#a04060"/><rect x="13" y="23" width="3" height="1" fill="#a04060"/>' +
            '<rect x="10" y="8" width="3" height="3" fill="#000"/><rect x="10" y="8" width="2" height="2" fill="#ff0000"/>' +
            '<rect x="19" y="9" width="3" height="3" fill="#000"/><rect x="19" y="9" width="2" height="2" fill="#ff0000"/>' +
            '<rect x="15" y="17" width="3" height="3" fill="#000"/><rect x="15" y="17" width="2" height="2" fill="#ff0000"/>'
        ),

        // Подписки — календарь и зелёная круговая стрелка (повторяющиеся платежи)
        subscriptions: svg(
            '<rect x="3" y="5" width="24" height="24" fill="#000"/><rect x="4" y="6" width="22" height="22" fill="#fff"/>' +
            '<rect x="27" y="7" width="2" height="24" fill="#808080"/><rect x="5" y="29" width="24" height="2" fill="#808080"/>' +
            '<rect x="4" y="6" width="22" height="6" fill="#e00000"/><rect x="4" y="6" width="22" height="1" fill="#ff6060"/>' +
            '<rect x="8" y="3" width="3" height="6" fill="#000"/><rect x="9" y="3" width="1" height="5" fill="#c0c0c0"/>' +
            '<rect x="18" y="3" width="3" height="6" fill="#000"/><rect x="19" y="3" width="1" height="5" fill="#c0c0c0"/>' +
            '<rect x="7" y="15" width="3" height="2" fill="#808080"/><rect x="12" y="15" width="3" height="2" fill="#808080"/><rect x="17" y="15" width="3" height="2" fill="#808080"/>' +
            '<rect x="7" y="19" width="3" height="2" fill="#808080"/><rect x="12" y="19" width="3" height="2" fill="#808080"/>' +
            '<rect x="7" y="23" width="3" height="2" fill="#808080"/>' +
            '<circle cx="23" cy="23" r="5.5" fill="none" stroke="#000" stroke-width="5" stroke-dasharray="28 6.56"/>' +
            '<circle cx="23" cy="23" r="5.5" fill="none" stroke="#00b000" stroke-width="3" stroke-dasharray="28 6.56"/>' +
            '<polygon points="30,19.4 26.1,14.3 22.6,21.4" fill="#000"/><polygon points="28.3,19.3 25.9,16.2 24.2,20.3" fill="#00b000"/>'
        ),

        // Зарплата — две купюры и золотая монета
        salary: svg(
            '<rect x="5" y="5" width="24" height="14" fill="#000"/><rect x="6" y="6" width="22" height="12" fill="#007000"/>' +
            '<rect x="2" y="10" width="24" height="14" fill="#000"/><rect x="3" y="11" width="22" height="12" fill="#00a800"/>' +
            '<rect x="4" y="12" width="20" height="10" fill="none" stroke="#80e880" stroke-width="1"/>' +
            '<rect x="5" y="13" width="3" height="2" fill="#c0ffc0"/><rect x="19" y="19" width="3" height="2" fill="#c0ffc0"/>' +
            '<circle cx="13.5" cy="17" r="4" fill="#c0ffc0"/><circle cx="13.5" cy="17" r="2.5" fill="#00a800"/><rect x="12" y="16" width="3" height="2" fill="#c0ffc0"/>' +
            '<circle cx="24" cy="24" r="7" fill="#000"/><circle cx="24" cy="24" r="6" fill="#ffd800"/>' +
            '<circle cx="24" cy="24" r="4" fill="none" stroke="#b08800" stroke-width="1"/>' +
            '<rect x="21" y="21" width="6" height="1" fill="#806000"/><rect x="22" y="23" width="4" height="1" fill="#806000"/><rect x="23" y="21" width="2" height="6" fill="#806000"/>' +
            '<rect x="20" y="20" width="2" height="1" fill="#fff8b0"/>'
        ),

        // Статистика — круговая диаграмма с выдвинутым сектором
        statistics: svg(
            '<path d="M14.5 20L26 19A11.5 11.5 0 0 1 4.5 25.8Z" fill="#000060"/><path d="M14.5 20L4.5 25.8A11.5 11.5 0 0 1 13.5 8.5Z" fill="#806000"/>' +
            '<path d="M14.5 18L26 17A11.5 11.5 0 0 1 4.5 23.8Z" fill="#2020e8"/>' +
            '<path d="M14.5 18L4.5 23.8A11.5 11.5 0 0 1 13.5 6.5Z" fill="#ffff00"/>' +
            '<path d="M16.7 15.8L15.7 4.3A11.5 11.5 0 0 1 28.2 14.8Z" fill="#ff0000"/>' +
            '<path d="M16.7 15.8L15.7 4.3A11.5 11.5 0 0 1 28.2 14.8Z" fill="none" stroke="#000" stroke-width="1"/>' +
            '<path d="M14.5 18L26 17A11.5 11.5 0 0 1 4.5 23.8A11.5 11.5 0 0 1 13.5 6.5Z" fill="none" stroke="#000" stroke-width="1"/>' +
            '<path d="M14.5 18L4.5 23.8M14.5 18L13.5 6.5" stroke="#000" stroke-width="1" fill="none"/>' +
            '<rect x="9" y="9" width="2" height="1" fill="#ffffb0"/><rect x="19" y="20" width="3" height="1" fill="#8080ff"/>'
        ),

        // Отчёты — лист с загнутым уголком и столбиками диаграммы
        reports: svg(
            '<polygon points="5,1 23,1 29,7 29,31 5,31" fill="#000"/><polygon points="6,2 22,2 28,8 28,30 6,30" fill="#fff"/>' +
            '<polygon points="22,2 28,8 22,8" fill="#c0c0c0"/><polygon points="22,2 22,8 28,8" fill="none" stroke="#000" stroke-width="1"/>' +
            '<rect x="9" y="6" width="10" height="1" fill="#000080"/><rect x="9" y="9" width="7" height="1" fill="#808080"/>' +
            '<rect x="9" y="12" width="16" height="1" fill="#808080"/>' +
            '<rect x="9" y="26" width="16" height="1" fill="#000"/><rect x="9" y="15" width="1" height="11" fill="#000"/>' +
            '<rect x="11" y="21" width="4" height="5" fill="#0000ff"/><rect x="16" y="16" width="4" height="10" fill="#ff0000"/><rect x="21" y="19" width="4" height="7" fill="#00a000"/>' +
            '<rect x="11" y="21" width="1" height="5" fill="#8080ff"/><rect x="16" y="16" width="1" height="10" fill="#ff8080"/><rect x="21" y="19" width="1" height="7" fill="#80ff80"/>'
        ),

        // Цели — жёлтая звезда
        wishlist: svg(
            '<polygon points="17.5,4.2 21,13.6 31,14 23.1,20.2 25.8,29.9 17.5,24.3 9.2,29.9 11.9,20.2 4,14 14,13.6" fill="#808080"/>' +
            '<polygon points="16,3 19.5,12.4 29.5,12.8 21.6,19 24.3,28.7 16,23.1 7.7,28.7 10.4,19 2.5,12.8 12.5,12.4" fill="#ffff00" stroke="#000" stroke-width="1.6" stroke-linejoin="miter"/>' +
            '<polygon points="16,7 18,12.6 12.9,12.9" fill="#ffffc0"/><polygon points="16,23.1 21.6,19 24.3,28.7" fill="#d8b800"/>' +
            '<polygon points="16,23.1 7.7,28.7 10.4,19" fill="#e0c800"/>'
        ),

        // Котировки — экран со свечным графиком
        quotes: svg(
            '<rect x="2" y="3" width="28" height="26" fill="#000"/><rect x="3" y="4" width="26" height="24" fill="#c0c0c0"/>' +
            '<rect x="3" y="4" width="26" height="1" fill="#fff"/><rect x="3" y="4" width="1" height="24" fill="#fff"/><rect x="28" y="5" width="1" height="23" fill="#808080"/><rect x="4" y="27" width="25" height="1" fill="#808080"/>' +
            '<rect x="6" y="7" width="20" height="18" fill="#000"/>' +
            '<rect x="6" y="11" width="20" height="1" fill="#003838"/><rect x="6" y="16" width="20" height="1" fill="#003838"/><rect x="6" y="21" width="20" height="1" fill="#003838"/>' +
            '<rect x="9" y="10" width="1" height="13" fill="#00ff00"/><rect x="8" y="13" width="3" height="7" fill="#00ff00"/>' +
            '<rect x="14" y="8" width="1" height="14" fill="#ff4040"/><rect x="13" y="10" width="3" height="8" fill="#ff4040"/>' +
            '<rect x="19" y="12" width="1" height="12" fill="#00ff00"/><rect x="18" y="15" width="3" height="6" fill="#00ff00"/>' +
            '<rect x="23" y="9" width="1" height="11" fill="#ff4040"/><rect x="22" y="11" width="3" height="5" fill="#ff4040"/>' +
            '<polyline points="7,22 11,18 15,19 20,13 25,9" fill="none" stroke="#ffff00" stroke-width="1"/>'
        ),

        // Цены — ценник с символом тенге
        prices: svg(
            '<polygon points="8,2 24,2 24,25 16,30 8,25" fill="#000"/><polygon points="9,3 23,3 23,24 16,28.5 9,24" fill="#ffff00"/>' +
            '<polygon points="9,3 10,3 10,24 9,24" fill="#ffffb0"/><polygon points="23,3 23,24 16,28.5 16,26 22,22.5 22,3" fill="#c8a800"/>' +
            '<rect x="14" y="5" width="4" height="4" fill="#000"/><rect x="15" y="6" width="2" height="2" fill="#008080"/>' +
            '<rect x="11" y="12" width="10" height="2" fill="#000"/><rect x="12" y="15" width="8" height="1" fill="#000"/><rect x="15" y="12" width="2" height="12" fill="#000"/>' +
            '<polyline points="16,7 20,2 26,1 28,5" fill="none" stroke="#808080" stroke-width="1.4"/>'
        ),

        // Настройки — серая шестерёнка
        settings: svg(
            '<polygon points="13.3,5.8 13.8,2.2 18.2,2.2 18.7,5.8 20.1,6.2 21.3,6.8 24.2,4.7 27.3,7.8 25.2,10.7 25.8,11.9 26.2,13.3 29.8,13.8 29.8,18.2 26.2,18.7 25.8,20.1 25.2,21.3 27.3,24.2 24.2,27.3 21.3,25.2 20.1,25.8 18.7,26.2 18.2,29.8 13.8,29.8 13.3,26.2 11.9,25.8 10.7,25.2 7.8,27.3 4.7,24.2 6.8,21.3 6.2,20.1 5.8,18.7 2.2,18.2 2.2,13.8 5.8,13.3 6.2,11.9 6.8,10.7 4.7,7.8 7.8,4.7 10.7,6.8 11.9,6.2" fill="#000"/>' +
            '<polygon points="13.9,7.5 14.3,4.1 17.7,4.1 18.1,7.5 19.4,7.9 20.5,8.5 23.2,6.4 25.6,8.8 23.5,11.5 24.1,12.6 24.5,13.9 27.9,14.3 27.9,17.7 24.5,18.1 24.1,19.4 23.5,20.5 25.6,23.2 23.2,25.6 20.5,23.5 19.4,24.1 18.1,24.5 17.7,27.9 14.3,27.9 13.9,24.5 12.6,24.1 11.5,23.5 8.8,25.6 6.4,23.2 8.5,20.5 7.9,19.4 7.5,18.1 4.1,17.7 4.1,14.3 7.5,13.9 7.9,12.6 8.5,11.5 6.4,8.8 8.8,6.4 11.5,8.5 12.6,7.9" fill="#c0c0c0"/>' +
            '<polygon points="14.3,4.1 17.7,4.1 17.7,5 14.3,5" fill="#fff"/><polygon points="4.1,14.3 4.1,17.7 5,17.7 5,14.3" fill="#fff"/><polygon points="8.8,6.4 11.5,8.5 10.6,9.2 8.2,7.4" fill="#fff"/>' +
            '<polygon points="27.9,14.3 27.9,17.7 27,17.7 27,14.3" fill="#808080"/><polygon points="14.3,27 17.7,27 17.7,27.9 14.3,27.9" fill="#808080"/><polygon points="23.5,20.5 25.6,23.2 24.8,23.9 22.7,21.2" fill="#808080"/>' +
            '<circle cx="16" cy="16" r="5.4" fill="#000"/><circle cx="16" cy="16" r="4.2" fill="#008080"/><circle cx="16" cy="16" r="4.2" fill="none" stroke="#fff" stroke-width="0.8" stroke-dasharray="6 20" stroke-dashoffset="-8"/>'
        ),

        // Кнопка «Свернуть все» — окно с заголовком и стрелкой вниз
        minall: svg(
            '<rect x="2" y="4" width="28" height="24" fill="#000"/><rect x="3" y="5" width="26" height="22" fill="#c0c0c0"/>' +
            '<rect x="3" y="5" width="26" height="1" fill="#fff"/><rect x="3" y="5" width="1" height="22" fill="#fff"/>' +
            '<rect x="5" y="7" width="22" height="5" fill="#000080"/><rect x="7" y="9" width="7" height="1" fill="#fff"/>' +
            '<rect x="21" y="8" width="5" height="3" fill="#c0c0c0"/><rect x="22" y="10" width="3" height="1" fill="#000"/>' +
            '<rect x="5" y="14" width="22" height="11" fill="#008080"/>' +
            '<rect x="14" y="15" width="4" height="4" fill="#000"/><polygon points="10,19 22,19 16,25" fill="#000"/>' +
            '<rect x="15" y="15" width="1" height="4" fill="#fff"/>'
        ),

        // Кнопка «Пуск» (4.6.0) — золотая монета с тенге: свой значок вместо флага Windows
        start: svg(
            '<circle cx="16" cy="16" r="15" fill="#000"/><circle cx="16" cy="16" r="13.5" fill="#ffd800"/>' +
            '<circle cx="16" cy="16" r="10.5" fill="none" stroke="#b08800" stroke-width="1.5"/>' +
            '<rect x="9" y="9" width="14" height="3" fill="#806000"/><rect x="10" y="14" width="12" height="2" fill="#806000"/><rect x="14.5" y="9" width="3" height="15" fill="#806000"/>' +
            '<rect x="7" y="7" width="4" height="1.5" fill="#fff8b0"/><rect x="7" y="7" width="1.5" height="4" fill="#fff8b0"/>'
        ),

        // Значок-запасной для неизвестного раздела
        generic: svg(
            '<rect x="4" y="3" width="22" height="26" fill="#000"/><rect x="5" y="4" width="20" height="24" fill="#fff"/>' +
            '<rect x="26" y="5" width="2" height="25" fill="#808080"/><rect x="6" y="29" width="22" height="2" fill="#808080"/>' +
            '<rect x="5" y="4" width="20" height="5" fill="#000080"/><rect x="8" y="13" width="14" height="1" fill="#808080"/><rect x="8" y="17" width="14" height="1" fill="#808080"/><rect x="8" y="21" width="9" height="1" fill="#808080"/>'
        )
    };
})();
