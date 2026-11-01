// --- ТЕМЫ ОФОРМЛЕНИЯ В СТИЛЕ WINDOWS 95 ---
// Цветовые схемы по мотивам стандартных схем Windows 95 («Свойства экрана → Оформление») плюс «Леопард» и «Неон».
// Цвета подобраны вручную и смягчены: без резкого «чисто белое на чисто чёрном».
// У каждой темы свой набор звуков (sounds) — см. js/sound.js.
// Тема хранится на устройстве (localStorage), применяется сразу при загрузке, чтобы не мигала стандартная.

const THEME_KEY = 'finance_w95_theme';

// Общие значения, которые темы могут переопределить
const THEME_DEFAULTS = {
    light: '#ffffff', hilite: '#dfdfdf', shadow: '#808080', dark: '#0a0a0a',
    field: '#fdfdfb', text: '#161616', muted: '#3c3c3c', titleText: '#ffffff',
    hover: '#e6e6f4', grid: '#d0d0d0', income: '#1b7a2b', expense: '#b3261e',
    pattern: 'none', patternSize: 'auto',
    fontUi: "'Pixelify Sans', 'Tahoma', 'MS Sans Serif', 'Segoe UI', sans-serif",
    fontText: "'Tahoma', 'MS Sans Serif', 'Segoe UI', 'Roboto', Arial, sans-serif"
};

// Шрифт темы «Аква» (по мотивам Mac OS X 2000 года): системные шрифты, без файлов Apple
const AQUA_FONT = "'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif";

const LEOPARD_SPOT = (x, y, w, h) =>
    `radial-gradient(ellipse ${w}px ${h}px at ${x}px ${y}px, #9a6424 40%, #2b1a0b 42% 70%, transparent 72%)`;
const LEOPARD_DOT = (x, y, r) => `radial-gradient(circle ${r}px at ${x}px ${y}px, #2b1a0b 85%, transparent 100%)`;

const W95_THEMES = [
    { id: 'standard', name: 'Windows (стандартная)', sounds: 'classic',
        face: '#c0c0c0', title: '#000080', title2: '#1084d0', desktop: '#008080', select: '#000080' },
    { id: 'brick', name: 'Кирпич', sounds: 'wood',
        face: '#c2bfa5', light: '#fbfaf1', hilite: '#dcd9c4', shadow: '#8a8670', dark: '#2a2820',
        title: '#800000', title2: '#b5523b', desktop: '#6e3b2e', select: '#800000' },
    { id: 'desert', name: 'Пустыня', sounds: 'chime',
        face: '#d5ccbb', light: '#fbf8f1', hilite: '#e8e1d3', shadow: '#9a8f78', dark: '#2e2a22',
        title: '#00706e', title2: '#4fa3a0', desktop: '#a28d68', select: '#00706e' },
    { id: 'eggplant', name: 'Баклажан', sounds: 'pad',
        face: '#90b0a8', light: '#e8f0ee', hilite: '#b4cbc5', shadow: '#5e7a73', dark: '#1d2a27', field: '#f6faf9',
        title: '#4e2a5e', title2: '#8a5a9c', desktop: '#4b2c4f', select: '#4e2a5e' },
    { id: 'lilac', name: 'Сирень', sounds: 'chime',
        face: '#b6b0d9', light: '#f3f1fb', hilite: '#cfcae8', shadow: '#7a73a6', dark: '#24203a',
        title: '#4b3f8c', title2: '#8a7fc7', desktop: '#6d6699', select: '#4b3f8c' },
    { id: 'maple', name: 'Клён', sounds: 'wood',
        face: '#e3d6aa', light: '#fdf9ea', hilite: '#efe6c8', shadow: '#a39566', dark: '#33291a',
        title: '#7a3e12', title2: '#b8712a', desktop: '#8c5a2b', select: '#7a3e12' },
    { id: 'marine', name: 'Море', sounds: 'water',
        face: '#9fc6c0', light: '#eef7f5', hilite: '#bfdad6', shadow: '#628c86', dark: '#173230',
        title: '#0b4f6c', title2: '#2f8fae', desktop: '#1c5f73', select: '#0b4f6c' },
    { id: 'plum', name: 'Слива', sounds: 'pad',
        face: '#b3a59c', light: '#f5f0ec', hilite: '#cdc2bb', shadow: '#7a6b62', dark: '#2a201c',
        title: '#4a1f45', title2: '#80467a', desktop: '#4f3047', select: '#4a1f45' },
    { id: 'pumpkin', name: 'Тыква', sounds: 'wood',
        face: '#e8c98a', light: '#fff7e6', hilite: '#f1dcae', shadow: '#a8884a', dark: '#33240e',
        title: '#6b2f05', title2: '#c2620e', desktop: '#4a2e12', select: '#6b2f05' },
    { id: 'rainy', name: 'Дождливый день', sounds: 'rain',
        face: '#9eb0c2', light: '#eef3f8', hilite: '#bfccd9', shadow: '#677a8d', dark: '#1d2733',
        title: '#3d5470', title2: '#7393b5', desktop: '#4a6178', select: '#3d5470' },
    { id: 'rwb', name: 'Красный, белый, синий', sounds: 'fanfare',
        face: '#c6c6cc', light: '#ffffff', hilite: '#e0e0e6', shadow: '#84848c', dark: '#14141c',
        title: '#1f3a78', title2: '#a8323a', desktop: '#2b3f6e', select: '#1f3a78' },
    { id: 'rose', name: 'Роза', sounds: 'chime',
        face: '#d6b3b3', light: '#fbf2f2', hilite: '#e6cccc', shadow: '#9c7474', dark: '#331f22',
        title: '#7a3048', title2: '#b8687f', desktop: '#8f5662', select: '#7a3048' },
    { id: 'slate', name: 'Сланец', sounds: 'classic',
        face: '#a9b3ba', light: '#f0f3f5', hilite: '#c6cdd2', shadow: '#6f7a82', dark: '#1e2429',
        title: '#34444f', title2: '#6b8392', desktop: '#3e4c56', select: '#34444f' },
    { id: 'spruce', name: 'Ель', sounds: 'wood',
        face: '#a9c4a5', light: '#f0f6ee', hilite: '#c6d8c3', shadow: '#6c8a68', dark: '#1c2a1b',
        title: '#2c5a33', title2: '#5a9160', desktop: '#355f3c', select: '#2c5a33' },
    { id: 'storm', name: 'Гроза', sounds: 'storm',
        face: '#a3a3bd', light: '#f0f0f7', hilite: '#c3c3d6', shadow: '#6c6c88', dark: '#1d1d2b',
        title: '#2e2e6b', title2: '#5d5da8', desktop: '#2f2f50', select: '#2e2e6b' },
    { id: 'teal', name: 'Бирюза', sounds: 'water',
        face: '#c0c0c0', title: '#006666', title2: '#2aa1a1', desktop: '#0c4f4f', select: '#006666' },
    { id: 'wheat', name: 'Пшеница', sounds: 'wood',
        face: '#e2d8b8', light: '#fcf9ee', hilite: '#eee7cf', shadow: '#a39a74', dark: '#302b1a',
        title: '#6e5c1f', title2: '#a8913f', desktop: '#8a7a45', select: '#6e5c1f' },
    { id: 'leopard', name: 'Леопард', sounds: 'leopard',
        face: '#dcc08f', light: '#fff4dc', hilite: '#ecd7b0', shadow: '#9c7a45', dark: '#2b1a0b',
        field: '#fffaf0', text: '#22160a', muted: '#5a4630', hover: '#f3e3c3', grid: '#e0cba3',
        income: '#2f7a2a', expense: '#b03a1e',
        title: '#3d2410', title2: '#a8661e', desktop: '#c8913f', select: '#6b3f12',
        pattern: [
            LEOPARD_SPOT(18, 22, 14, 11), LEOPARD_SPOT(70, 15, 11, 13), LEOPARD_SPOT(46, 58, 13, 10),
            LEOPARD_SPOT(98, 50, 10, 12), LEOPARD_SPOT(20, 92, 12, 11), LEOPARD_SPOT(78, 96, 14, 10),
            LEOPARD_DOT(52, 28, 4), LEOPARD_DOT(108, 82, 3), LEOPARD_DOT(36, 76, 3), LEOPARD_DOT(8, 60, 3)
        ].join(', '),
        patternSize: '120px 120px' },
    { id: 'neon', name: 'Неон', sounds: 'neon', dark: true,
        face: '#2b2640', light: '#5b5285', hilite: '#3d365c', shadow: '#17142a', darkEdge: '#06050d',
        field: '#1c1830', text: '#e7e2ff', muted: '#b0a8d6', titleText: '#fdfcff',
        hover: '#2a2448', grid: '#3a3358', income: '#4fd18b', expense: '#ff7a95',
        title: '#7a2fb8', title2: '#1d9aa6', desktop: '#141126', select: '#7a2fb8',
        pattern: 'linear-gradient(rgba(122,47,184,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(29,154,166,.14) 1px, transparent 1px)',
        patternSize: '28px 28px' },
    // «Аква» — отдельный стиль по мотивам первой Mac OS X (2000): форма окон, кнопок и меню задаётся в css/aqua.css,
    // который действует только при этой теме (html[data-w95="aqua"])
    { id: 'aqua', name: 'Аква', sounds: 'glass',
        face: '#ececec', light: '#ffffff', hilite: '#f6f6f6', shadow: '#a9a9a9', dark: '#6e6e6e',
        field: '#ffffff', text: '#1a1a1a', muted: '#555555', titleText: '#1a1a1a',
        hover: '#e3edfb', grid: '#d8d8d8', income: '#1e7b34', expense: '#c0392b',
        title: '#ececec', title2: '#cfcfcf', desktop: '#1f5fc8', select: '#3875d7',
        pattern: 'radial-gradient(ellipse 55% 45% at 16% 10%, rgba(255,255,255,.32), rgba(255,255,255,0) 70%), ' +
            'linear-gradient(160deg, #1f5fc8 0%, #4d9cf2 48%, #1846a8 100%)',
        patternSize: 'cover',
        fontUi: AQUA_FONT, fontText: AQUA_FONT }
];

let currentThemeId = 'standard';

function themeById(id) {
    return W95_THEMES.find(t => t.id === id) || W95_THEMES[0];
}

// Чуть затемнить цвет (для «нажатой» кнопки)
function shadeColor(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function applyTheme(id, { save = true, preview = false } = {}) {
    const t = { ...THEME_DEFAULTS, ...themeById(id) };
    currentThemeId = t.id;
    const vars = {
        '--w95-face': t.face, '--w95-light': t.light, '--w95-hilite': t.hilite, '--w95-shadow': t.shadow,
        '--w95-dark': t.darkEdge || (typeof t.dark === 'string' ? t.dark : THEME_DEFAULTS.dark),
        '--w95-title': t.title, '--w95-title-2': t.title2, '--w95-desktop': t.desktop, '--w95-select': t.select,
        '--w95-field': t.field, '--w95-text': t.text, '--w95-muted': t.muted, '--w95-title-text': t.titleText,
        '--w95-face-pressed': shadeColor(t.face, t.dark === true ? 0.85 : 0.93),
        '--w95-hover': t.hover, '--w95-grid': t.grid, '--w95-income': t.income, '--w95-expense': t.expense,
        '--w95-pattern': t.pattern, '--w95-pattern-size': t.patternSize,
        '--w95-font-ui': t.fontUi, '--w95-font-text': t.fontText
    };
    const target = document.body || document.documentElement;
    Object.entries(vars).forEach(([k, v]) => target.style.setProperty(k, v));
    document.documentElement.setAttribute('data-w95', t.id);
    document.documentElement.setAttribute('data-w95-mode', t.dark === true ? 'dark' : 'light');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.desktop);

    if (typeof window.setSoundPack === 'function') window.setSoundPack(t.sounds);
    updateChartTheme(t);
    if (save) {
        try { localStorage.setItem(THEME_KEY, t.id); } catch (e) {}
    }
    renderThemePicker();
    if (preview && typeof playSound === 'function') playSound('open');
}

function applySavedTheme() {
    let id = 'standard';
    try { id = localStorage.getItem(THEME_KEY) || 'standard'; } catch (e) {}
    applyTheme(id, { save: false });
}

// Подписи и сетка диаграмм под цвет темы
function updateChartTheme(t) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = t.text;
    Chart.defaults.font.family = t.fontText || THEME_DEFAULTS.fontText;
    Chart.defaults.borderColor = t.dark === true ? 'rgba(231, 226, 255, 0.16)' : 'rgba(0, 0, 0, 0.16)';
    const charts = [];
    if (typeof myChart !== 'undefined' && myChart) charts.push(myChart);
    if (typeof statCharts !== 'undefined') charts.push(...Object.values(statCharts));
    charts.forEach(c => {
        try {
            ['x', 'y'].forEach(ax => {
                const s = c.options.scales && c.options.scales[ax];
                if (s) {
                    s.ticks = { ...(s.ticks || {}), color: Chart.defaults.color };
                    s.grid = { ...(s.grid || {}), color: Chart.defaults.borderColor };
                }
            });
            if (c.options.plugins && c.options.plugins.legend) {
                c.options.plugins.legend.labels = { ...(c.options.plugins.legend.labels || {}), color: Chart.defaults.color };
            }
            c.update('none');
        } catch (e) {}
    });
}

// Выбор темы в настройках: мини-окошки с цветами каждой темы
function renderThemePicker() {
    const box = document.getElementById('theme-picker');
    if (!box) return;
    box.innerHTML = W95_THEMES.map(raw => {
        const t = { ...THEME_DEFAULTS, ...raw };
        const desk = t.pattern !== 'none'
            ? `background-color:${t.desktop};background-image:${t.pattern};background-size:${['auto', 'cover'].includes(t.patternSize) ? t.patternSize : '60px 60px'};`
            : `background:${t.desktop};`;
        return `<button type="button" class="theme-swatch theme-swatch-${t.id}${t.id === currentThemeId ? ' is-active' : ''}" onclick="applyTheme('${t.id}', { preview: true })" aria-pressed="${t.id === currentThemeId}">
            <span class="theme-swatch-desk" style="${desk}">
                <span class="theme-swatch-win" style="background:${t.face};">
                    <span class="theme-swatch-title" style="background:linear-gradient(90deg, ${t.title}, ${t.title2});"></span>
                    <span class="theme-swatch-field" style="background:${t.field};"></span>
                </span>
            </span>
            <span class="theme-swatch-name">${t.name}</span>
        </button>`;
    }).join('');
}

// Тема применяется сразу (до загрузки картинок и шрифтов), чтобы не мигала стандартная
try { applySavedTheme(); } catch (e) { console.warn('Тема не применилась', e); }
window.addEventListener('DOMContentLoaded', renderThemePicker);
