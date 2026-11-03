// --- ТЕМЫ «WINDOWS 95_ПУСК» И «WINDOWS 95_ЭКСТРА»: ОБОИ РАБОЧЕГО СТОЛА ---
// Классические обои Windows 95, нарисованные заново: плитки и картинки из SVG (без файлов Microsoft и без загрузки из сети).
// Названия — как в Windows 95 («Свойства: Экран» → «Фон»). Цвета чуть смягчены, чтобы обои не слепили и не резали глаз.
// Подключается раньше js/themes.js: темы папки «Windows 95_Экстра» берут отсюда свои обои по умолчанию.
// Выбор обоев — Настройки → «Обои рабочего стола» (js/desk95.js); сохраняется на устройстве (finance_desk95_wall).
//
// window.DESK95_WALLS = { list: [...], byId: {...} }; у каждого: id, name (русское), en (как в Windows 95),
//   image — значение CSS background-image, size — background-size, repeat — background-repeat, color — основной цвет обоев.

(function () {
    'use strict';

    // SVG → CSS url('data:…'): кавычки внутри — только одинарные снаружи, чтобы значение можно было вставлять и в style="…"
    const url = (svg) => "url('data:image/svg+xml," + encodeURIComponent(svg).replace(/'/g, '%27') + "')";
    const svg = (w, h, body, extra) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' + (extra || ' shape-rendering="crispEdges"') + '>' + body + '</svg>';
    const R = (x, y, w, h, f) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"/>';
    const C = (x, y, r, f, s, sw) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (f || 'none') + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (sw || 1) + '"' : '') + '/>';
    const SMOOTH = ' shape-rendering="geometricPrecision"';

    // Кирпич/блок с фаской: основа, светлая кромка сверху и слева, тёмная снизу и справа
    const bevel = (x, y, w, h, face, hi, lo) =>
        R(x, y, w, h, face) + R(x, y, w, 1, hi) + R(x, y, 1, h, hi) + R(x, y + h - 1, w, 1, lo) + R(x + w - 1, y, 1, h, lo);

    const tile = (id, name, en, w, h, color, body, extra) => ({
        id, name, en, color, size: w + 'px ' + h + 'px', repeat: 'repeat', image: url(svg(w, h, R(0, 0, w, h, color) + body, extra))
    });

    // ----- Облака (картинка на весь стол) -----
    const cloud = (x, y, s) =>
        '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
        '<g fill="#bcd3ee" transform="translate(0 7)"><ellipse cx="0" cy="18" rx="70" ry="18"/><circle cx="-34" cy="4" r="22"/><circle cx="-6" cy="-10" r="30"/><circle cx="30" cy="2" r="24"/><circle cx="52" cy="12" r="16"/></g>' +
        '<g fill="#ffffff" opacity=".94"><ellipse cx="0" cy="18" rx="70" ry="18"/><circle cx="-34" cy="4" r="22"/><circle cx="-6" cy="-10" r="30"/><circle cx="30" cy="2" r="24"/><circle cx="52" cy="12" r="16"/></g></g>';
    const cloudsSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">' +
        '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f86d0"/><stop offset=".6" stop-color="#8dbcee"/><stop offset="1" stop-color="#d3e6f8"/></linearGradient></defs>' +
        '<rect width="800" height="500" fill="url(#s)"/>' +
        cloud(150, 110, 1.5) + cloud(540, 70, 1.05) + cloud(680, 230, 1.55) + cloud(300, 300, 1.25) + cloud(90, 400, 0.95) + cloud(480, 410, 1.2) +
        '</svg>';

    // ----- 256 цветов: сетка 16×16 оттенков, растянута на весь стол -----
    let c256 = '';
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) c256 += '<rect x="' + c + '" y="' + r + '" width="1" height="1" fill="hsl(' + Math.round(c * 22.5) + ',48%,' + Math.round(80 - r * 2.6) + '%)"/>';
    const c256Svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" preserveAspectRatio="none" shape-rendering="crispEdges">' + c256 + '</svg>';

    // ----- Гусиная лапка: «саржа» 2/2, 4 тёмные и 4 светлые нити по каждой оси -----
    let hound = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const warpUp = ((x + y) % 4) < 2;
        const dark = warpUp ? (x % 8) < 4 : (y % 8) < 4;
        if (dark) hound += R(x * 2, y * 2, 2, 2, '#6b6b78');
    }

    // ----- Соломенная циновка: корзиночное плетение, квадранты с горизонтальными и вертикальными полосами -----
    const weave = (cx, cy, vertical, color) => {
        let s = '';
        for (let i = 0; i < 3; i++) s += vertical ? R(cx + i * 3, cy, 2, 8, color) : R(cx, cy + i * 3, 8, 2, color);
        return s;
    };
    const straw = weave(0, 0, false, '#d3bb7d') + weave(8, 8, false, '#d3bb7d') + weave(8, 0, true, '#c2a867') + weave(0, 8, true, '#c2a867');

    // ----- Красные блоки: 2×2 блока с фаской -----
    const redblocks = bevel(1, 1, 14, 14, '#b9473b', '#df7a6a', '#85281f') + bevel(17, 1, 14, 14, '#c25044', '#e38474', '#8b2c23') +
        bevel(1, 17, 14, 14, '#c25044', '#e38474', '#8b2c23') + bevel(17, 17, 14, 14, '#b9473b', '#df7a6a', '#85281f');

    // ----- Резной камень: кладка со сдвигом и крапинки -----
    const stoneDots = [[4, 5], [11, 9], [22, 4], [27, 11], [6, 21], [14, 27], [24, 24], [29, 29], [18, 13]];
    const stone = bevel(1, 1, 14, 14, '#a3a5a3', '#c6c8c6', '#7b7d7b') + bevel(17, 1, 14, 14, '#9b9d9b', '#bec0be', '#757775') +
        bevel(-7, 17, 14, 14, '#9b9d9b', '#bec0be', '#757775') + bevel(9, 17, 14, 14, '#a3a5a3', '#c6c8c6', '#7b7d7b') + bevel(25, 17, 14, 14, '#9b9d9b', '#bec0be', '#757775') +
        stoneDots.map(([x, y], i) => R(x, y, 1, 1, i % 2 ? '#b4b6b4' : '#868886')).join('');

    // ----- Аркада: ковёр с разноцветным конфетти на тёмно-фиолетовом -----
    const arcade =
        C(10, 12, 4, '#e8788f') + '<polygon points="30,6 38,20 22,20" fill="#6fc3c9"/><polygon points="52,12 58,19 52,26 46,19" fill="#f0c860"/>' +
        '<path d="M5 42q6 -8 12 0t12 0" fill="none" stroke="#8f7de0" stroke-width="3"/>' + R(44, 40, 11, 11, '#e89a5a') +
        C(28, 56, 3, '#6fc3c9') + C(60, 58, 2, '#e8788f') + C(40, 32, 2, '#f0c860') + R(8, 54, 6, 3, '#f0c860') + '<path d="M44 60l4 -4l4 4" fill="none" stroke="#e8788f" stroke-width="2"/>';

    const list = [
        { id: 'none', name: '(Нет)', en: '(None)', color: null, size: 'auto', repeat: 'repeat', image: 'none' },
        { id: 'clouds', name: 'Облака', en: 'Clouds', color: '#8dbcee', size: 'cover', repeat: 'no-repeat', image: url(cloudsSvg) },
        tile('argyle', 'Ромбы', 'Argyle', 40, 40, '#4b7080',
            '<polygon points="20,0 40,20 20,40 0,20" fill="#35566a"/><polygon points="20,11 29,20 20,29 11,20" fill="#b9a86a"/>' +
            '<path d="M0 0L40 40M40 0L0 40" stroke="#8fb3c2" stroke-width="1" opacity=".7"/>'),
        tile('blackthatch', 'Чёрная ткань', 'Black Thatch', 16, 16, '#17171b',
            '<path d="M0 16L16 0M-8 8L8 -8M8 24L24 8" stroke="#34343c" stroke-width="3"/><path d="M0 0L16 16M-8 8L8 24M8 -8L24 8" stroke="#222228" stroke-width="2"/>'),
        tile('bluerivets', 'Синие заклёпки', 'Blue Rivets', 32, 32, '#46709e',
            R(0, 0, 32, 1, '#7fa6d1') + R(0, 0, 1, 32, '#7fa6d1') + R(31, 0, 1, 32, '#2c4d75') + R(0, 31, 32, 1, '#2c4d75') +
            [[6, 6], [26, 6], [6, 26], [26, 26]].map(([x, y]) => C(x + 1, y + 1, 3, '#2c4d75') + C(x, y, 3, '#9cc0e6') + C(x - 1, y - 1, 1, '#e4f0fb')).join('')),
        tile('bubbles', 'Пузыри', 'Bubbles', 64, 64, '#7db4dc',
            '<g fill="rgba(255,255,255,.22)" stroke="#3f7fae" stroke-width="2"><circle cx="16" cy="18" r="11"/><circle cx="46" cy="40" r="15"/><circle cx="52" cy="10" r="6"/><circle cx="12" cy="50" r="7"/></g>' +
            '<g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"><path d="M10 15a7 7 0 0 1 7 -5"/><path d="M37 36a10 10 0 0 1 9 -8"/><path d="M49 8a3 3 0 0 1 3 -2"/></g>', SMOOTH),
        tile('carvedstone', 'Резной камень', 'Carved Stone', 32, 32, '#8f9190', stone),
        tile('circles', 'Круги', 'Circles', 48, 48, '#8a85b8',
            C(24, 24, 20, null, '#a7a2d1', 2) + C(24, 24, 13, null, '#6f6aa0', 2) + C(24, 24, 6, '#a7a2d1') +
            [[0, 0], [48, 0], [0, 48], [48, 48]].map(([x, y]) => C(x, y, 11, null, '#6f6aa0', 2) + C(x, y, 5, '#a7a2d1')).join(''), SMOOTH),
        { id: 'houndstooth', name: 'Гусиная лапка', en: 'Houndstooth', color: '#cfcfd6', size: '16px 16px', repeat: 'repeat', image: url(svg(16, 16, R(0, 0, 16, 16, '#cfcfd6') + hound)) },
        tile('pinstripe', 'Тонкая полоска', 'Pinstripe', 6, 6, '#8499ad', R(1, 0, 1, 6, '#60758a')),
        tile('redblocks', 'Красные блоки', 'Red Blocks', 32, 32, '#5e211d', redblocks),
        tile('strawmat', 'Соломенная циновка', 'Straw Mat', 16, 16, '#8f7545', straw),
        tile('tiles', 'Плитка', 'Tiles', 24, 24, '#8fa8a0', bevel(1, 1, 22, 22, '#c4d8d0', '#e6f1ed', '#9bb3ab')),
        tile('triangles', 'Треугольники', 'Triangles', 32, 16, '#4d7391',
            '<polygon points="0,16 16,0 32,16" fill="#7fa3c0"/><polygon points="-16,0 16,0 0,16" fill="#5f86a5"/><polygon points="16,0 48,0 32,16" fill="#5f86a5"/>'),
        tile('waves', 'Волны', 'Waves', 32, 16, '#3d78a6',
            '<path d="M0 11Q8 5 16 11T32 11" fill="none" stroke="#2d6491" stroke-width="2"/><path d="M0 8Q8 2 16 8T32 8" fill="none" stroke="#86bbe0" stroke-width="2"/>', SMOOTH),
        tile('zigzag', 'Зигзаг', 'Zigzag', 16, 16, '#8a9aa8',
            '<polyline points="0,14 4,6 8,14 12,6 16,14" fill="none" stroke="#5f7081" stroke-width="2"/><polyline points="0,11 4,3 8,11 12,3 16,11" fill="none" stroke="#c4cdd6" stroke-width="2"/>'),
        tile('arcade', 'Аркада', 'Arcade', 64, 64, '#3d3466', arcade, SMOOTH),
        tile('metal', 'Металлические звенья', 'Metal Links', 24, 24, '#7b8189',
            '<path d="M12 1L25 13L12 25L-1 13Z" fill="none" stroke="#4f545b" stroke-width="2"/><path d="M12 0L24 12L12 24L0 12Z" fill="none" stroke="#cdd2d8" stroke-width="2"/>', SMOOTH),
        { id: 'c256', name: '256 цветов', en: '256 Colors', color: '#9ab0c4', size: '100% 100%', repeat: 'no-repeat', image: url(c256Svg) }
    ];

    const byId = {};
    list.forEach(w => { byId[w.id] = w; });

    window.DESK95_WALLS = { list, byId };
})();
