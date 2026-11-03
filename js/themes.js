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
// Шрифт темы «Аэро»: системный шрифт Windows, на других устройствах — похожие
const AERO_FONT = "'Segoe UI', 'Noto Sans', 'Open Sans', Tahoma, Arial, sans-serif";

const LEOPARD_SPOT = (x, y, w, h) =>
    `radial-gradient(ellipse ${w}px ${h}px at ${x}px ${y}px, #9a6424 40%, #2b1a0b 42% 70%, transparent 72%)`;
const LEOPARD_DOT = (x, y, r) => `radial-gradient(circle ${r}px at ${x}px ${y}px, #2b1a0b 85%, transparent 100%)`;

// Шрифт темы «Метро»: тонкий гротеск с Google Fonts (без шрифтов Microsoft)
const METRO_FONT = "'Open Sans', 'Noto Sans', 'Segoe UI', Roboto, Arial, sans-serif";
const METRO_DARK = {
    face: '#171717', light: '#3a3a3a', hilite: '#2a2a2a', shadow: '#000000', darkEdge: '#000000',
    field: '#262626', text: '#ffffff', muted: '#a6a6a6', titleText: '#ffffff',
    hover: '#2e2e2e', grid: '#3a3a3a', income: '#7ad151', expense: '#ff5a4a', desktop: '#000000'
};
// accent — цвет плиток; variant — особые правила в css/metro.css (light, neon, leopard)
const METRO_VARIANTS = [
    { id: 'metro', name: 'Метро: кобальт', accent: '#0050ef' },
    { id: 'metro-lime', name: 'Метро: лайм', accent: '#8cb000' },
    { id: 'metro-magenta', name: 'Метро: пурпур', accent: '#d80073' },
    { id: 'metro-crimson', name: 'Метро: малиновый', accent: '#c1002b' },
    { id: 'metro-emerald', name: 'Метро: изумруд', accent: '#008a00' },
    { id: 'metro-mango', name: 'Метро: манго', accent: '#e08a00' },
    { id: 'metro-teal', name: 'Метро: бирюза', accent: '#00a3a1' },
    { id: 'metro-light', name: 'Метро: светлая', accent: '#1ba1e2', variant: 'light', dark: false,
        face: '#f2f2f2', light: '#ffffff', hilite: '#e6e6e6', shadow: '#bdbdbd', darkEdge: '#9e9e9e',
        field: '#ffffff', text: '#000000', muted: '#5c5c5c', hover: '#e6e6e6', grid: '#d6d6d6',
        income: '#1b7a2b', expense: '#c4231a', desktop: '#ffffff' },
    { id: 'metro-neon', name: 'Метро: неон', accent: '#b13cff', accent2: '#00e5ff', variant: 'neon', sounds: 'neon',
        face: '#0e0820', field: '#160d2e', text: '#f2ecff', muted: '#b8a9e0', hover: '#1f1440', grid: '#2e2152',
        income: '#4fe39b', expense: '#ff5c8a', desktop: '#05010d',
        pattern: 'linear-gradient(rgba(177,60,255,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.08) 1px, transparent 1px)',
        patternSize: '32px 32px' },
    { id: 'metro-leopard', name: 'Метро: леопард', accent: '#c47a1c', accent2: '#e0a040', variant: 'leopard', sounds: 'leopard',
        face: '#1e1309', field: '#2a1b0d', text: '#fff6e6', muted: '#d8bf98', hover: '#352211', grid: '#4a3218',
        income: '#8fd16a', expense: '#ff7a5c', desktop: '#2b1a0b',
        pattern: [
            LEOPARD_SPOT(18, 22, 14, 11), LEOPARD_SPOT(70, 15, 11, 13), LEOPARD_SPOT(46, 58, 13, 10),
            LEOPARD_SPOT(98, 50, 10, 12), LEOPARD_SPOT(20, 92, 12, 11), LEOPARD_SPOT(78, 96, 14, 10),
            LEOPARD_DOT(52, 28, 4), LEOPARD_DOT(108, 82, 3), LEOPARD_DOT(36, 76, 3), LEOPARD_DOT(8, 60, 3)
        ].join(', '),
        patternSize: '120px 120px' }
];

function metroTheme(v) {
    const { accent, accent2, ...rest } = v;
    return {
        sounds: 'metro', folder: 'metro', cssId: 'metro', dark: true, ...METRO_DARK,
        title: accent, title2: accent2 || accent, select: accent,
        fontUi: METRO_FONT, fontText: METRO_FONT,
        ...rest
    };
}

// Шрифт темы «iOS 6»: Helvetica Neue есть на устройствах Apple, на остальных — похожие системные (файлов Apple в приложении нет)
const IOS_FONT = "'Helvetica Neue', Helvetica, Arial, 'Arimo', 'Liberation Sans', 'Noto Sans', sans-serif";
// Полосатый фон «Настроек» iOS 6 (светлая тема) и тёмный «лён» центра уведомлений (вторая тема); рисуются градиентами
const IOS_PINSTRIPE = 'repeating-linear-gradient(90deg, #c5ccd4 0, #c5ccd4 4px, #d3d9df 4px, #d3d9df 7px)';
const IOS_LINEN = 'repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0, rgba(255,255,255,.045) 1px, rgba(0,0,0,.10) 1px, rgba(0,0,0,.10) 2px), ' +
    'repeating-linear-gradient(90deg, rgba(255,255,255,.04) 0, rgba(255,255,255,.04) 1px, rgba(0,0,0,.09) 1px, rgba(0,0,0,.09) 3px), ' +
    'repeating-linear-gradient(45deg, rgba(255,255,255,.012) 0 2px, rgba(0,0,0,.02) 2px 4px)';
const IOS_VARIANTS = [
    { id: 'ios6', name: 'iOS 6',
      face: '#ffffff', light: '#ffffff', hilite: '#f2f4f7', shadow: '#a1a8b1', dark: '#6b727b',
      field: '#ffffff', text: '#000000', muted: '#4c566c', titleText: '#ffffff', hover: '#e8edf5', grid: '#d9d9d9',
      income: '#25802f', expense: '#c0261e', title: '#7f98b8', title2: '#6a83a5', desktop: '#c5ccd4', select: '#1b6fe0',
      pattern: IOS_PINSTRIPE, patternSize: 'auto' },
    { id: 'ios6-linen', name: 'iOS 6: тёмный лён', variant: 'linen', dark: true,
      face: '#2a2b2e', light: '#4a4c51', hilite: '#35373b', shadow: '#0c0c0d', darkEdge: '#000000',
      field: '#1d1e20', text: '#f4f5f7', muted: '#a7b0c0', titleText: '#ffffff', hover: '#34363b', grid: '#17181a',
      income: '#6fd27a', expense: '#ff6b60', title: '#4d4f54', title2: '#1c1d20', desktop: '#2b2b2c', select: '#2f7fe8',
      pattern: IOS_LINEN, patternSize: 'auto' }
];
function iosTheme(v) {
    return { sounds: 'tock', folder: 'ios', cssId: 'ios6', fontUi: IOS_FONT, fontText: IOS_FONT, ...v };
}

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
    { id: 'aqua', name: 'Аква', sounds: 'glass', folder: 'mac',
        face: '#ececec', light: '#ffffff', hilite: '#f6f6f6', shadow: '#a9a9a9', dark: '#6e6e6e',
        field: '#ffffff', text: '#1a1a1a', muted: '#555555', titleText: '#1a1a1a',
        hover: '#e3edfb', grid: '#d8d8d8', income: '#1e7b34', expense: '#c0392b',
        title: '#ececec', title2: '#cfcfcf', desktop: '#1f5fc8', select: '#3875d7',
        pattern: 'radial-gradient(ellipse 55% 45% at 16% 10%, rgba(255,255,255,.32), rgba(255,255,255,0) 70%), ' +
            'linear-gradient(160deg, #1f5fc8 0%, #4d9cf2 48%, #1846a8 100%)',
        patternSize: 'cover',
        fontUi: AQUA_FONT, fontText: AQUA_FONT },
    // «Классика 1-бит» — по мотивам самых первых чёрно-белых систем Макинтоша (1984): полосатые заголовки,
    // жёсткие тени, рабочий стол из шахматных точек. Форма — в css/mono.css (только при html[data-w95="mono"]).
    // Цветные остаются лишь суммы дохода/расхода и диаграммы, чтобы их можно было различать.
    { id: 'mono', name: 'Классика 1-бит', sounds: 'beep', folder: 'mac',
        face: '#ffffff', light: '#ffffff', hilite: '#ffffff', shadow: '#000000', dark: '#000000',
        field: '#ffffff', text: '#000000', muted: '#333333', titleText: '#ffffff',
        hover: '#ffffff', grid: '#000000', income: '#006b24', expense: '#a8000e',
        title: '#000000', title2: '#000000', desktop: '#808080', select: '#000000',
        pattern: 'repeating-conic-gradient(#000000 0 25%, #ffffff 0 50%)',
        patternSize: '2px 2px',
        fontUi: "'Pixelify Sans', 'Courier New', monospace",
        fontText: "Verdana, Tahoma, 'Segoe UI', Arial, sans-serif" },
    // «Аэро» — по мотивам Windows Vista: полупрозрачные «стеклянные» рамки окон с размытием и бликами,
    // светлая рабочая область, глянцевые кнопки, чёрная стеклянная панель задач. Форма — в css/vista.css
    // (только при html[data-w95="aero"]). Цвет стекла берётся из title/title2 — его можно поменять в своей теме.
    { id: 'aero', name: 'Аэро', sounds: 'aero', folder: 'vista',
        face: '#ffffff', light: '#ffffff', hilite: '#f4f7fb', shadow: '#a0a0a0', dark: '#3c3c3c',
        field: '#ffffff', text: '#1e1e1e', muted: '#5a5a5a', titleText: '#000000',
        hover: '#e5f3fb', grid: '#dadada', income: '#1e7b34', expense: '#c0392b',
        title: '#8fb8e0', title2: '#4f86c2', desktop: '#0b3d4f', select: '#3399ff',
        pattern: 'radial-gradient(ellipse 70% 38% at 28% 62%, rgba(120,220,170,.55), rgba(120,220,170,0) 70%), ' +
            'radial-gradient(ellipse 60% 32% at 76% 34%, rgba(90,170,235,.55), rgba(90,170,235,0) 70%), ' +
            'radial-gradient(ellipse 42% 22% at 55% 82%, rgba(200,255,225,.35), rgba(200,255,225,0) 70%), ' +
            'linear-gradient(160deg, #06303f 0%, #0b5a63 45%, #0a2f52 100%)',
        patternSize: 'cover',
        fontUi: AERO_FONT, fontText: AERO_FONT },
    // «Метро» — по мотивам плиточного интерфейса мобильной Windows 8: плоские цветные плитки вместо меню,
    // огромные строчные заголовки разделов на полэкрана, тонкий шрифт, никаких рамок и теней.
    // Форма — в css/metro.css (только при html[data-w95="metro"]); 10 вариантов отличаются цветом акцента и фона.
    ...METRO_VARIANTS.map(v => metroTheme(v)),
    // «iOS 6» — по мотивам iPhone и iPad 2012 года: глянцевые сине-серые панели, сгруппированные таблицы на полосатом фоне,
    // переключатели ВКЛ/ВЫКЛ, чёрная глянцевая панель вкладок. Форма — в css/ios6.css (только при html[data-w95="ios6"]).
    // Две темы: светлая и тёмный «лён»; остальные темы не затронуты.
    ...IOS_VARIANTS.map(v => iosTheme(v))
];

let currentThemeId = 'standard';

// Папки в настройках: встроенные стили плюс папки, которые пользователь создал для своих тем
const THEME_FOLDERS = [
    { id: 'win95', name: 'Windows 95' },
    { id: 'vista', name: 'Windows Vista' },
    { id: 'mac', name: 'Mac OS' },
    { id: 'metro', name: 'Windows 8 Метро' },
    { id: 'ios', name: 'iOS' }
];
const CUSTOM_FOLDER_DEFAULT = 'Мои темы';

// Цвета, которые можно поменять в своей теме
const THEME_COLOR_FIELDS = [
    ['desktop', 'Фон экрана'], ['face', 'Окна'], ['button', 'Кнопки'], ['buttonText', 'Текст на кнопках'],
    ['text', 'Текст'], ['field', 'Поля ввода и списки'], ['title', 'Заголовок окна (в «Аэро» — стекло)'],
    ['title2', 'Заголовок окна — переход'], ['titleText', 'Текст заголовка'], ['select', 'Выделение'],
    ['income', 'Доход'], ['expense', 'Расход']
];
const THEME_COLOR_RE = /^#[0-9a-f]{6}$/i;

// --- СВОИ ТЕМЫ ---
// [{ id, name, folder, base, colors: { только изменённые цвета }, patternOff }]
// Хранятся на устройстве и в аккаунте Google (js/cloud.js, ключ themes).
const CUSTOM_THEMES_KEY = 'finance_custom_themes';
let customThemes = [];
try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]');
    if (Array.isArray(v)) customThemes = v.filter(isValidCustomTheme);
} catch (e) {}

function isValidCustomTheme(c) {
    return !!(c && /^ct[a-z0-9]+$/.test(String(c.id)) && W95_THEMES.some(t => t.id === c.base));
}

function saveCustomThemesLocal() {
    try { localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes)); } catch (e) {}
}

// После синхронизации с Google Диском: темы могли прийти с другого устройства или быть удалены там
function onCustomThemesChanged() {
    customThemes = customThemes.filter(isValidCustomTheme);
    saveCustomThemesLocal();
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
    if (saved && saved !== currentThemeId && customThemes.some(c => c.id === saved)) applyTheme(saved, { save: false });
    else if (String(currentThemeId).startsWith('ct') && !customThemes.some(c => c.id === currentThemeId)) applyTheme('standard');
    else renderThemePicker();
}

function themeById(id) {
    return W95_THEMES.find(t => t.id === id) || W95_THEMES[0];
}

function cleanThemeColors(colors) {
    const out = {};
    THEME_COLOR_FIELDS.forEach(([k]) => { if (colors && THEME_COLOR_RE.test(colors[k] || '')) out[k] = colors[k]; });
    return out;
}

// Полное описание темы: встроенной или своей (своя = основа + изменённые цвета)
function resolveCustomTheme(c) {
    const base = themeById(c.base);
    const colors = cleanThemeColors(c.colors);
    const t = { ...THEME_DEFAULTS, ...base, ...colors, id: c.id, name: c.name || 'Своя тема', cssId: base.cssId || base.id,
        folder: c.folder || CUSTOM_FOLDER_DEFAULT, custom: true, overrides: colors };
    if (c.patternOff) t.pattern = 'none';
    return t;
}

function resolveTheme(id) {
    const c = customThemes.find(x => x.id === id);
    if (c) return resolveCustomTheme(c);
    const b = themeById(id);
    return { ...THEME_DEFAULTS, ...b, cssId: b.cssId || b.id, folder: b.folder || 'win95', overrides: {} };
}

// Чуть затемнить цвет (для «нажатой» кнопки)
function shadeColor(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function applyTheme(id, opts = {}) {
    applyResolvedTheme(resolveTheme(id), opts);
}

// Флаги своих цветов: в стилях с «зашитыми» цветами (Аква, 1-бит, Аэро) цвет берётся из темы только при флаге (css/custom.css)
const THEME_COLOR_FLAGS = {
    face: 'data-c-face', button: 'data-c-btn', buttonText: 'data-c-btn', field: 'data-c-field',
    title: 'data-c-title', title2: 'data-c-title', titleText: 'data-c-title', text: 'data-c-text', select: 'data-c-select'
};

function applyResolvedTheme(t, { save = true, preview = false, render = true } = {}) {
    currentThemeId = t.id;
    const vars = {
        '--w95-face': t.face, '--w95-light': t.light, '--w95-hilite': t.hilite, '--w95-shadow': t.shadow,
        '--w95-dark': t.darkEdge || (typeof t.dark === 'string' ? t.dark : THEME_DEFAULTS.dark),
        '--w95-title': t.title, '--w95-title-2': t.title2, '--w95-desktop': t.desktop, '--w95-select': t.select,
        '--w95-field': t.field, '--w95-text': t.text, '--w95-muted': t.muted, '--w95-title-text': t.titleText,
        '--w95-face-pressed': shadeColor(t.face, t.dark === true ? 0.85 : 0.93),
        '--w95-hover': t.hover, '--w95-grid': t.grid, '--w95-income': t.income, '--w95-expense': t.expense,
        '--w95-pattern': t.pattern, '--w95-pattern-size': t.patternSize,
        '--w95-font-ui': t.fontUi, '--w95-font-text': t.fontText,
        '--w95-button': t.button || t.face, '--w95-button-text': t.buttonText || t.text
    };
    const target = document.body || document.documentElement;
    Object.entries(vars).forEach(([k, v]) => target.style.setProperty(k, v));
    const root = document.documentElement;
    root.setAttribute('data-w95', t.cssId || t.id);
    root.setAttribute('data-w95-mode', t.dark === true ? 'dark' : 'light');
    // вариант оформления внутри стиля (у «Метро»: light, neon, leopard)
    if (t.variant) root.setAttribute('data-w95-variant', t.variant); else root.removeAttribute('data-w95-variant');
    const flags = new Set(Object.keys(t.overrides || {}).map(k => THEME_COLOR_FLAGS[k]).filter(Boolean));
    [...new Set(Object.values(THEME_COLOR_FLAGS))].forEach(f => {
        if (flags.has(f)) root.setAttribute(f, ''); else root.removeAttribute(f);
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.desktop);

    if (typeof window.setSoundPack === 'function') window.setSoundPack(t.sounds);
    updateChartTheme(t);
    // выбранные в настройках шрифты группы тем (js/fonts.js) поверх шрифтов темы
    if (typeof applyFontPrefs === 'function' && typeof uiPrefs !== 'undefined') applyFontPrefs();
    if (render && typeof renderFontSettings === 'function') renderFontSettings();
    if (save) {
        try { localStorage.setItem(THEME_KEY, t.id); } catch (e) {}
    }
    if (render) renderThemePicker();
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

// --- ВЫБОР ТЕМЫ: ПАПКИ ---
let openThemeFolder = null;

function themeEsc(v) {
    return String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function themeFolders() {
    const builtinIds = THEME_FOLDERS.map(f => f.id);
    const user = [];
    customThemes.forEach(c => {
        const f = c.folder || CUSTOM_FOLDER_DEFAULT;
        if (!builtinIds.includes(f) && !user.includes(f)) user.push(f);
    });
    return THEME_FOLDERS.concat(user.map(name => ({ id: name, name, user: true })));
}

function themesInFolder(fid) {
    const list = W95_THEMES.filter(t => (t.folder || 'win95') === fid).map(t => resolveTheme(t.id));
    customThemes.filter(c => (c.folder || CUSTOM_FOLDER_DEFAULT) === fid).forEach(c => list.push(resolveCustomTheme(c)));
    return list;
}

function themeCountLabel(n) {
    // другие языки (js/i18n.js): своё число у слова
    const lang = typeof appLang !== 'undefined' ? appLang : 'ru';
    const other = { en: ['theme', 'themes'], fr: ['thème', 'thèmes'], de: ['Design', 'Designs'], kk: ['тақырып', 'тақырып'] }[lang];
    if (other) return `${n} ${n === 1 ? other[0] : other[1]}`;
    const m10 = n % 10, m100 = n % 100;
    const word = m10 === 1 && m100 !== 11 ? 'тема' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'темы' : 'тем');
    return `${n} ${word}`;
}

// Значок папки: задняя стенка, лист внутри и передняя створка (открывается анимацией)
const THEME_FOLDER_ICON = '<span class="tf-icon" aria-hidden="true"><span class="tf-back"></span><span class="tf-paper"></span><span class="tf-front"></span></span>';

function themeSwatchHtml(t) {
    const desk = t.pattern !== 'none'
        ? `background-color:${t.desktop};background-image:${t.pattern};background-size:${['auto', 'cover'].includes(t.patternSize) ? t.patternSize : '60px 60px'};`
        : `background:${t.desktop};`;
    return `<button type="button" class="theme-swatch theme-swatch-${t.cssId}${t.custom ? ' is-custom' : ''}${t.id === currentThemeId ? ' is-active' : ''}" data-theme-id="${themeEsc(t.id)}" onclick="applyTheme(this.dataset.themeId, { preview: true })" aria-pressed="${t.id === currentThemeId}">
        <span class="theme-swatch-desk" style="${desk}">
            <span class="theme-swatch-win" style="background:${t.face};">
                <span class="theme-swatch-title" style="background:linear-gradient(90deg, ${t.title}, ${t.title2});"></span>
                <span class="theme-swatch-field" style="background:${t.field};"></span>
            </span>
        </span>
        <span class="theme-swatch-name">${themeEsc(t.name)}</span>
    </button>`;
}

// Выбор темы в настройках: папки по стилям, внутри — мини-окошки тем. Папки нарисованы в стиле текущей темы.
function renderThemePicker({ animate = false, origin = '' } = {}) {
    const box = document.getElementById('theme-picker');
    if (!box) return;
    const folders = themeFolders();
    if (openThemeFolder && !folders.some(f => f.id === openThemeFolder)) openThemeFolder = null;
    const cur = resolveTheme(currentThemeId);

    const folderHtml = folders.map(f => {
        const open = f.id === openThemeFolder;
        return `<button type="button" class="theme-folder${open ? ' is-open' : ''}${open && animate ? ' tf-anim' : ''}${f.id === cur.folder ? ' is-current' : ''}${f.user ? ' is-user' : ''}" data-folder="${themeEsc(f.id)}" onclick="toggleThemeFolder(this.dataset.folder, this)" aria-expanded="${open}">
            ${THEME_FOLDER_ICON}<span class="tf-name">${themeEsc(f.name)}</span><span class="tf-count">${themeCountLabel(themesInFolder(f.id).length)}</span>
        </button>`;
    }).join('');

    let panel = '';
    const openFolder = folders.find(f => f.id === openThemeFolder);
    if (openFolder) {
        const items = themesInFolder(openFolder.id);
        panel = `<div class="theme-folder-panel${animate ? ' is-opening' : ''}" id="theme-folder-panel" role="region" aria-label="Папка ${themeEsc(openFolder.name)}"${origin ? ` style="--tf-origin:${origin}"` : ''}>
            <div class="tf-panel-head">${THEME_FOLDER_ICON}<b class="tf-panel-title">${themeEsc(openFolder.name)}</b>
                <button type="button" class="tf-panel-close" onclick="toggleThemeFolder(null)" aria-label="Закрыть папку" title="Закрыть папку"><span class="material-icons">close</span></button>
            </div>
            <div class="theme-picker">${items.length ? items.map(themeSwatchHtml).join('') : '<p class="hint">Папка пуста</p>'}</div>
        </div>`;
    }

    const actions = `<div class="theme-actions">
        <button type="button" class="btn-primary" onclick="openThemeEditor()"><span class="material-icons">palette</span> Создать тему на основе текущей</button>
        ${cur.custom ? `<button type="button" class="btn-secondary" onclick="openThemeEditor(currentThemeId)"><span class="material-icons">edit</span> Изменить «${themeEsc(cur.name)}»</button>` : ''}
    </div>`;
    box.innerHTML = `<div class="theme-folders">${folderHtml}</div>${panel}${actions}`;
}

// Открыть / закрыть папку с анимацией (не дольше 0,35 с)
function toggleThemeFolder(fid, btn) {
    const panel = document.getElementById('theme-folder-panel');
    clearTimeout(toggleThemeFolder.timer);
    if (!fid || fid === openThemeFolder) {
        if (!openThemeFolder) return;
        if (typeof playSound === 'function') playSound('close');
        document.querySelectorAll('.theme-folder.is-open').forEach(b => {
            b.classList.remove('is-open', 'tf-anim');
            b.setAttribute('aria-expanded', 'false');
        });
        if (panel) {
            panel.classList.remove('is-opening');
            panel.classList.add('is-closing');
            toggleThemeFolder.timer = setTimeout(() => { openThemeFolder = null; renderThemePicker(); }, 260);
        } else {
            openThemeFolder = null;
            renderThemePicker();
        }
        return;
    }
    openThemeFolder = fid;
    let origin = '';
    const box = document.getElementById('theme-picker');
    if (btn && box) {
        const r = btn.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        origin = `${Math.round(r.left + r.width / 2 - b.left)}px 0px`;
    }
    if (typeof playSound === 'function') playSound('open');
    renderThemePicker({ animate: true, origin });
}

// --- РЕДАКТОР СВОЕЙ ТЕМЫ ---
let themeEditorState = null;

// Цвета темы для полей редактора (кнопки по умолчанию — цвета окна и текста)
function themeEditableColors(t) {
    const out = {};
    THEME_COLOR_FIELDS.forEach(([k]) => {
        let v = t[k];
        if (k === 'button') v = t.button || t.face;
        if (k === 'buttonText') v = t.buttonText || t.text;
        out[k] = THEME_COLOR_RE.test(v || '') ? v.toLowerCase() : '#808080';
    });
    return out;
}

function themeEditorEntry(id) {
    const s = themeEditorState;
    const baseColors = themeEditableColors(resolveTheme(s.base));
    const colors = {};
    Object.entries(s.colors).forEach(([k, v]) => { if (v !== baseColors[k]) colors[k] = v; });
    const entry = { id, name: s.name, folder: s.folder, base: s.base, colors };
    if (s.patternOff) entry.patternOff = true;
    return entry;
}

function themeEditorPreview() {
    applyResolvedTheme(resolveCustomTheme(themeEditorEntry('ctpreview')), { save: false, render: false });
}

function openThemeEditor(editId = '') {
    closeThemeEditor(false);
    const editing = editId ? customThemes.find(c => c.id === editId) : null;
    const cur = editing ? resolveCustomTheme(editing) : resolveTheme(currentThemeId);
    themeEditorState = {
        editId: editing ? editing.id : '',
        prevId: currentThemeId,
        name: editing ? editing.name : `${cur.name} — моя`.slice(0, 30),
        folder: cur.folder,
        base: cur.cssId,
        colors: themeEditableColors(cur),
        patternOff: cur.pattern === 'none' && themeById(cur.cssId).pattern !== undefined && themeById(cur.cssId).pattern !== 'none'
    };
    const s = themeEditorState;
    const folders = themeFolders();
    if (!folders.some(f => f.id === CUSTOM_FOLDER_DEFAULT)) folders.push({ id: CUSTOM_FOLDER_DEFAULT, name: CUSTOM_FOLDER_DEFAULT });
    const folderOptions = folders.map(f => `<option value="${themeEsc(f.id)}"${f.id === s.folder ? ' selected' : ''}>${themeEsc(f.name)}</option>`).join('') +
        '<option value="__new">Новая папка…</option>';
    const baseOptions = THEME_FOLDERS.map(f => `<optgroup label="${themeEsc(f.name)}">` +
        W95_THEMES.filter(t => (t.folder || 'win95') === f.id).map(t => `<option value="${t.id}"${t.id === s.base ? ' selected' : ''}>${themeEsc(t.name)}</option>`).join('') +
        '</optgroup>').join('');
    const colorInputs = THEME_COLOR_FIELDS.map(([k, label]) =>
        `<label class="te-color"><input type="color" data-key="${k}" value="${s.colors[k]}"><span>${themeEsc(label)}</span></label>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'theme-editor';
    overlay.className = 'export-sheet-overlay theme-editor-overlay';
    overlay.innerHTML = `
        <div class="export-sheet theme-editor" role="dialog" aria-modal="true" aria-label="Своя тема">
            <div class="export-sheet-head">
                <h3>${editing ? 'Изменить тему' : 'Новая тема'}</h3>
                <button type="button" class="export-sheet-close" data-act="cancel" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="te-body">
                <label class="te-field"><span>Название</span><input type="text" id="te-name" maxlength="30" value="${themeEsc(s.name)}"></label>
                <label class="te-field"><span>Сохранить в папку</span><select id="te-folder">${folderOptions}</select></label>
                <label class="te-field" id="te-newfolder-wrap" hidden><span>Название новой папки</span><input type="text" id="te-newfolder" maxlength="24" placeholder="Например: Летние"></label>
                <label class="te-field"><span>Основа: вид окон, кнопок и звуки</span><select id="te-base">${baseOptions}</select></label>
                <div class="te-colors">${colorInputs}</div>
                <label class="te-check"><input type="checkbox" id="te-pattern"${s.patternOff ? '' : ' checked'}> <span>Узор / картинка на фоне (как у основы)</span></label>
                <p class="hint">Изменения видны сразу. Тема сохраняется на этом устройстве и в аккаунте Google.</p>
            </div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="save"><span class="material-icons">save</span> Сохранить</button>
                ${editing ? '<button type="button" class="btn-secondary" data-act="saveas"><span class="material-icons">library_add</span> Сохранить как новую</button>' : ''}
                <button type="button" class="btn-secondary" data-act="reset"><span class="material-icons">restart_alt</span> Цвета основы</button>
                ${editing ? '<button type="button" class="btn-secondary" data-act="delete"><span class="material-icons">delete</span> Удалить тему</button>' : ''}
                <button type="button" class="btn-secondary" data-act="cancel">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const q = sel => overlay.querySelector(sel);
    const syncPatternBox = () => {
        const has = (themeById(s.base).pattern || 'none') !== 'none';
        q('#te-pattern').disabled = !has;
        if (!has) q('#te-pattern').checked = false;
    };
    syncPatternBox();
    overlay.addEventListener('input', (e) => {
        const el = e.target;
        if (el.matches('input[type="color"]')) {
            s.colors[el.dataset.key] = el.value.toLowerCase();
            // Свой цвет фона виден только без узора основы
            if (el.dataset.key === 'desktop' && q('#te-pattern').checked) { q('#te-pattern').checked = false; s.patternOff = true; }
            themeEditorPreview();
        } else if (el.id === 'te-name') {
            s.name = el.value;
        } else if (el.id === 'te-newfolder') {
            s.newFolder = el.value;
        }
    });
    overlay.addEventListener('change', (e) => {
        const el = e.target;
        if (el.id === 'te-pattern') { s.patternOff = !el.checked; themeEditorPreview(); }
        else if (el.id === 'te-folder') {
            q('#te-newfolder-wrap').hidden = el.value !== '__new';
            if (el.value !== '__new') s.folder = el.value; else q('#te-newfolder').focus();
        } else if (el.id === 'te-base') {
            s.base = el.value;
            s.colors = themeEditableColors(resolveTheme(s.base));
            s.patternOff = false;
            overlay.querySelectorAll('input[type="color"]').forEach(i => { i.value = s.colors[i.dataset.key]; });
            q('#te-pattern').checked = true;
            syncPatternBox();
            if (q('#te-pattern').disabled) s.patternOff = false;
            themeEditorPreview();
        }
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeThemeEditor(true); return; }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'cancel') closeThemeEditor(true);
        else if (act === 'reset') {
            s.colors = themeEditableColors(resolveTheme(s.base));
            s.patternOff = false;
            overlay.querySelectorAll('input[type="color"]').forEach(i => { i.value = s.colors[i.dataset.key]; });
            syncPatternBox();
            if (!q('#te-pattern').disabled) q('#te-pattern').checked = true;
            themeEditorPreview();
        } else if (act === 'save' || act === 'saveas') saveThemeFromEditor(act === 'saveas');
        else if (act === 'delete') deleteCustomTheme(s.editId);
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeThemeEditor(true); });
    if (typeof playSound === 'function') playSound('open');
    themeEditorPreview();
    setTimeout(() => { const n = q('#te-name'); if (n) n.focus(); }, 50);
}

// cancel=true — вернуть тему, которая была до открытия редактора
function closeThemeEditor(cancel) {
    const el = document.getElementById('theme-editor');
    if (el) el.remove();
    if (cancel && themeEditorState) {
        applyTheme(themeEditorState.prevId, { save: false });
        if (typeof playSound === 'function') playSound('close');
    }
    themeEditorState = null;
}

function saveThemeFromEditor(asNew) {
    const s = themeEditorState;
    if (!s) return;
    const folderSel = document.getElementById('te-folder');
    if (folderSel && folderSel.value === '__new') {
        const name = (s.newFolder || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        if (!name) { alert('Введите название новой папки.'); return; }
        s.folder = name;
    }
    s.name = (s.name || '').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Своя тема';
    const id = (!asNew && s.editId) ? s.editId : 'ct' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = themeEditorEntry(id);
    const idx = customThemes.findIndex(c => c.id === id);
    if (idx >= 0) customThemes[idx] = { ...customThemes[idx], ...entry, patternOff: !!entry.patternOff };
    else customThemes.push(entry);
    saveCustomThemesLocal();
    themeEditorState = null;
    const el = document.getElementById('theme-editor');
    if (el) el.remove();
    openThemeFolder = entry.folder;
    applyTheme(id);
    if (typeof playSound === 'function') playSound('success');
    if (typeof showToast === 'function') showToast(`Тема «${entry.name}» сохранена в папку «${entry.folder}»`);
    if (typeof updateUI === 'function') updateUI(true); // отправить в аккаунт Google
}

function deleteCustomTheme(id) {
    const c = customThemes.find(x => x.id === id);
    if (!c || !confirm(`Удалить тему «${c.name}»?`)) return;
    customThemes = customThemes.filter(x => x.id !== id);
    saveCustomThemesLocal();
    const prev = themeEditorState && themeEditorState.prevId;
    themeEditorState = null;
    const el = document.getElementById('theme-editor');
    if (el) el.remove();
    applyTheme(prev && prev !== id ? prev : c.base);
    if (typeof updateUI === 'function') updateUI(true);
}

// Тема применяется сразу (до загрузки картинок и шрифтов), чтобы не мигала стандартная
try { applySavedTheme(); } catch (e) { console.warn('Тема не применилась', e); }
window.addEventListener('DOMContentLoaded', () => renderThemePicker());
