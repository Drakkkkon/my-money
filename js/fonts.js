// --- ШРИФТЫ ---
// 10 шрифтов с Google Fonts (все с кириллицей): 3 общих для всех тем и по 1–2 своих у каждой группы тем
// (Windows 95, Windows Vista, Mac OS, Windows 8 Метро, Android). Шрифт выбирается отдельно для заголовков/кнопок
// и для текста/цифр и запоминается для группы тем: при смене темы на другую группу действует её выбор.
// Свои шрифты (TTF, OTF, WOFF, WOFF2) хранятся на устройстве; перед установкой приложение проверяет, какие
// буквы в шрифте есть (русские, казахские, дореформенные, латиница, цифры, ₸) и насколько он шире/выше обычного.
// Выбор шрифтов — uiPrefs.fonts (js/layout.js), синхронизируется через Google Диск.

const FONT_GROUPS = [
    { id: 'win95', name: 'Windows 95' }, { id: 'vista', name: 'Windows Vista' },
    { id: 'mac', name: 'Mac OS' }, { id: 'metro', name: 'Windows 8 Метро' }, { id: 'android', name: 'Android' }
];
const FONT_LIB = [
    // общие — для всех тем
    { id: 'pt-sans', name: 'PT Sans', family: "'PT Sans'", group: 'common', css: 'PT+Sans:wght@400;700' },
    { id: 'noto-sans', name: 'Noto Sans', family: "'Noto Sans'", group: 'common', css: 'Noto+Sans:wght@400;600;700' },
    { id: 'open-sans', name: 'Open Sans', family: "'Open Sans'", group: 'common', css: 'Open+Sans:wght@300;400;600' },
    // Windows 95
    { id: 'pixelify', name: 'Pixelify Sans', family: "'Pixelify Sans'", group: 'win95', css: 'Pixelify+Sans:wght@400;600' },
    { id: 'plex-mono', name: 'IBM Plex Mono', family: "'IBM Plex Mono'", group: 'win95', css: 'IBM+Plex+Mono:wght@400;600' },
    // Windows Vista
    { id: 'roboto', name: 'Roboto', family: "'Roboto'", group: 'vista', css: 'Roboto:wght@400;500;700' },
    { id: 'exo2', name: 'Exo 2', family: "'Exo 2'", group: 'vista', css: 'Exo+2:wght@400;600' },
    // Mac OS
    { id: 'nunito', name: 'Nunito', family: "'Nunito'", group: 'mac', css: 'Nunito:wght@400;600;700' },
    { id: 'comfortaa', name: 'Comfortaa', family: "'Comfortaa'", group: 'mac', css: 'Comfortaa:wght@400;600;700' },
    // Windows 8 Метро
    { id: 'montserrat', name: 'Montserrat', family: "'Montserrat'", group: 'metro', css: 'Montserrat:wght@300;400;600' },
    // Android: шрифт Pixel / Android 16 (Google Sans Flex подключён в index.html) и Roboto Flex
    { id: 'google-sans-flex', name: 'Google Sans Flex', family: "'Google Sans Flex'", group: 'android', css: 'Google+Sans+Flex:wght@400;500;700' },
    { id: 'roboto-flex', name: 'Roboto Flex', family: "'Roboto Flex'", group: 'android', css: 'Roboto+Flex:wght@400;500;700' }
];
const FONT_FALLBACK = "'Segoe UI', Tahoma, Roboto, Arial, sans-serif";
const CUSTOM_FONTS_KEY = 'finance_custom_fonts';
const FONT_MAX_BYTES = 4 * 1024 * 1024;

// Наборы символов для проверки совместимости
const FONT_CHECKS = [
    { id: 'ru', name: 'Русские буквы', weight: 40, chars: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' },
    { id: 'digits', name: 'Цифры и знаки', weight: 15, chars: '0123456789.,:;%+-()/«»—' },
    { id: 'kk', name: 'Казахские буквы', weight: 10, chars: 'ӘәҒғҚқҢңӨөҰұҮүҺһІі' },
    { id: 'latin', name: 'Латиница (English)', weight: 10, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
    { id: 'eu', name: 'Французские и немецкие буквы', weight: 10, chars: 'éèêàâçùûôîëïüöäßœÉÀÇÜÖÄ' },
    { id: 'money', name: 'Знаки валют', weight: 5, chars: '₸$€₽' },
    { id: 'old', name: 'Дореформенные буквы', weight: 5, chars: 'ѢѣІіѲѳѴѵ' }
];

let customFonts = [];
try { customFonts = JSON.parse(localStorage.getItem(CUSTOM_FONTS_KEY) || '[]') || []; } catch (e) { customFonts = []; }

// ---------- Загрузка шрифтов ----------
const loadedFontCss = new Set(['pixelify', 'open-sans', 'google-sans-flex']); // уже подключены в index.html
function loadFontCss(ids) {
    const need = FONT_LIB.filter(f => ids.includes(f.id) && !loadedFontCss.has(f.id));
    if (!need.length) return;
    need.forEach(f => loadedFontCss.add(f.id));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + need.map(f => 'family=' + f.css).join('&') + '&display=swap';
    document.head.appendChild(link);
}

// Файлы своих шрифтов — в IndexedDB
function fontDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
        const req = indexedDB.open('mymoney-fonts', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function fontFile(op, key, value) {
    const db = await fontDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', op === 'get' ? 'readonly' : 'readwrite');
        const s = tx.objectStore('files');
        const req = op === 'get' ? s.get(key) : op === 'put' ? s.put(value, key) : s.delete(key);
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
    });
}

const registeredCustom = new Set();
async function registerCustomFont(meta, buffer) {
    if (registeredCustom.has(meta.id)) return true;
    try {
        const data = buffer || await fontFile('get', meta.id);
        if (!data) return false;
        const face = new FontFace(meta.family, data);
        await face.load();
        document.fonts.add(face);
        registeredCustom.add(meta.id);
        return true;
    } catch (e) {
        console.warn('Свой шрифт не загрузился', meta.name, e);
        return false;
    }
}

// ---------- Какой шрифт где ----------
function fontById(id) {
    if (!id) return null;
    const lib = FONT_LIB.find(f => f.id === id);
    if (lib) return lib;
    const c = customFonts.find(f => f.id === id);
    return c ? { ...c, group: 'custom', family: `'${c.family}'` } : null;
}

// Группа текущей темы (своя тема — группа её основы)
function currentFontGroup() {
    try {
        const t = resolveTheme(currentThemeId);
        if (t.custom) {
            const c = customThemes.find(x => x.id === t.id);
            const base = c ? themeById(c.base) : null;
            return (base && base.folder) || 'win95';
        }
        return t.folder || 'win95';
    } catch (e) { return 'win95'; }
}

function fontsForGroup(group) {
    return FONT_LIB.filter(f => f.group === 'common' || f.group === group);
}

function groupFontPrefs(group = currentFontGroup()) {
    const all = uiPrefs.fonts || {};
    const g = all[group] || {};
    return { ui: g.ui || '', text: g.text || '' };
}

// Вызывается из js/themes.js после применения темы: шрифты темы заменяются выбранными
function applyFontPrefs() {
    const p = groupFontPrefs();
    const target = document.body || document.documentElement;
    const set = (varName, id) => {
        const f = fontById(id);
        if (!f) return;
        if (f.group === 'custom') registerCustomFont(customFonts.find(c => c.id === id));
        else loadFontCss([f.id]);
        target.style.setProperty(varName, `${f.family}, ${FONT_FALLBACK}`);
    };
    set('--w95-font-ui', p.ui);
    set('--w95-font-text', p.text);
    document.documentElement.toggleAttribute('data-font-custom', !!(p.ui || p.text));
    if (typeof Chart !== 'undefined' && p.text) {
        const f = fontById(p.text);
        if (f) Chart.defaults.font.family = `${f.family}, ${FONT_FALLBACK}`;
    }
}

function setGroupFont(kind, id) {
    const group = currentFontGroup();
    const all = { ...(uiPrefs.fonts || {}) };
    all[group] = { ...groupFontPrefs(group), [kind]: id };
    uiPrefs.fonts = all;
    // вернуть шрифты темы и наложить выбранные
    if (typeof applyTheme === 'function') applyTheme(currentThemeId, { save: false, render: false });
    commitUiPrefs();
    renderFontSettings();
}

// ---------- Проверка совместимости ----------
const fontCanvas = document.createElement('canvas');
function glyphPresent(ctx, family, ch) {
    // если символ есть в шрифте, ширина не зависит от запасного шрифта
    ctx.font = `40px ${family}, monospace`;
    const a = ctx.measureText(ch).width;
    ctx.font = `40px ${family}, serif`;
    const b = ctx.measureText(ch).width;
    ctx.font = '40px monospace';
    const ma = ctx.measureText(ch).width;
    ctx.font = '40px serif';
    const mb = ctx.measureText(ch).width;
    if (a !== b) return false;
    // ширины совпали: либо шрифт рисует сам, либо оба запасных одинаковы (тогда сравниваем с ними)
    return !(Math.abs(a - ma) < 0.01 && Math.abs(b - mb) < 0.01);
}

function checkFontCompat(family) {
    const ctx = fontCanvas.getContext('2d');
    const groups = FONT_CHECKS.map(g => {
        const chars = Array.from(g.chars);
        const missing = chars.filter(ch => !glyphPresent(ctx, family, ch));
        return { ...g, total: chars.length, missing };
    });
    // Размеры относительно обычного шрифта приложения
    const sample = 'Текущий баланс 12 345 ₸ Записи Настройки';
    ctx.font = `20px ${family}, sans-serif`;
    const w = ctx.measureText(sample).width;
    const m = ctx.measureText('ЙДрў');
    ctx.font = '20px Tahoma, Arial, sans-serif';
    const ref = ctx.measureText(sample).width;
    const mr = ctx.measureText('ЙДрў');
    const widthRatio = ref ? w / ref : 1;
    const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    const hr = (mr.actualBoundingBoxAscent || 0) + (mr.actualBoundingBoxDescent || 0);
    const heightRatio = hr ? h / hr : 1;
    let score = groups.reduce((s, g) => s + g.weight * (g.total - g.missing.length) / g.total, 0);
    // за слишком широкий/узкий/высокий шрифт — минус: надписи могут не поместиться или съехать
    const widthPenalty = Math.max(0, Math.abs(widthRatio - 1) - 0.12) * 40;
    const heightPenalty = Math.max(0, Math.abs(heightRatio - 1) - 0.15) * 30;
    score = Math.max(0, Math.min(100, Math.round(score + 5 - widthPenalty - heightPenalty)));
    const warnings = [];
    if (widthRatio > 1.15) warnings.push(`Шрифт шире обычного на ${Math.round((widthRatio - 1) * 100)}% — длинные надписи на кнопках и в меню могут не помещаться.`);
    if (widthRatio < 0.85) warnings.push(`Шрифт уже обычного на ${Math.round((1 - widthRatio) * 100)}% — текст будет мельче.`);
    if (heightRatio > 1.2) warnings.push('Буквы выше обычного — строки могут налезать друг на друга.');
    if (heightRatio < 0.8) warnings.push('Буквы ниже обычного — текст будет мелким.');
    const ru = groups.find(g => g.id === 'ru');
    if (ru.missing.length) warnings.push('В шрифте нет части русских букв — они будут показаны другим шрифтом.');
    return { score, groups, widthRatio, heightRatio, warnings };
}

function compatVerdict(score) {
    if (score >= 90) return 'отлично подходит';
    if (score >= 75) return 'подходит';
    if (score >= 55) return 'подходит частично';
    return 'плохо подходит';
}

function compatReportHtml(rep) {
    return `<div class="font-report">
        <p class="font-score ${rep.score >= 75 ? 'is-good' : rep.score >= 55 ? 'is-mid' : 'is-bad'}"><b>Совместимость: ${rep.score}%</b> — ${compatVerdict(rep.score)}</p>
        <ul>${rep.groups.map(g => `<li class="${g.missing.length ? 'is-miss' : 'is-ok'}"><span class="material-icons">${g.missing.length ? (g.missing.length === g.total ? 'close' : 'remove') : 'check'}</span>
            ${g.name}: ${g.missing.length ? `нет ${g.missing.length} из ${g.total}` : 'все'}${g.missing.length && g.missing.length < g.total ? ` <small data-i18n-skip>(${escapeHtml(g.missing.slice(0, 12).join(' '))})</small>` : ''}</li>`).join('')}</ul>
        <p class="hint">Ширина: ${Math.round(rep.widthRatio * 100)}% от обычной, высота букв: ${Math.round(rep.heightRatio * 100)}%.</p>
        ${rep.warnings.map(w => `<p class="hint font-warn"><span class="material-icons inline-icon">warning</span> ${escapeHtml(w)}</p>`).join('')}
    </div>`;
}

// ---------- Свой шрифт ----------
async function addCustomFontFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = document.getElementById('font-upload-status');
    const say = html => { if (status) status.innerHTML = html; };
    if (!/\.(ttf|otf|woff2?|ttc)$/i.test(file.name)) { say('<span class="font-warn">Нужен файл шрифта: TTF, OTF, WOFF или WOFF2.</span>'); return; }
    if (file.size > FONT_MAX_BYTES) { say('<span class="font-warn">Файл больше 4 МБ — выберите шрифт поменьше.</span>'); return; }
    say('Проверяем шрифт…');
    const id = 'cf' + Date.now().toString(36);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40);
    const family = 'MMFont-' + id;
    let buffer;
    try {
        buffer = await file.arrayBuffer();
        const face = new FontFace(family, buffer);
        await face.load();
        document.fonts.add(face);
        registeredCustom.add(id);
    } catch (err) {
        say('<span class="font-warn">Браузер не смог прочитать этот файл — он повреждён или это не шрифт.</span>');
        return;
    }
    const rep = checkFontCompat(`'${family}'`);
    const meta = { id, name, family, size: file.size, score: rep.score, added: Date.now() };
    pendingFont = { meta, buffer, rep };
    say(`<p><b data-i18n-skip>${escapeHtml(name)}</b></p>
        <p class="font-sample" style="font-family:'${family}', sans-serif" data-i18n-skip>Аа Әә Ққ Ңң Ѣѣ Ff Éé Üü ß 0123456789 ₸ € $</p>
        ${compatReportHtml(rep)}
        <div class="btn-group">
            <button type="button" class="btn-primary" onclick="confirmCustomFont()"><span class="material-icons">check</span> Установить шрифт</button>
            <button type="button" class="btn-secondary" onclick="cancelCustomFont()">Отмена</button>
        </div>`);
}

let pendingFont = null;
async function confirmCustomFont() {
    if (!pendingFont) return;
    const { meta, buffer } = pendingFont;
    try { await fontFile('put', meta.id, buffer); } catch (e) { alert('Не удалось сохранить шрифт на устройстве: ' + (e.message || e)); return; }
    customFonts.push(meta);
    try { localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(customFonts)); } catch (e) {}
    pendingFont = null;
    const status = document.getElementById('font-upload-status');
    if (status) status.textContent = '';
    renderFontSettings();
    showToast(`Шрифт «${meta.name}» установлен — выберите его в списке выше`);
}

function cancelCustomFont() {
    pendingFont = null;
    const status = document.getElementById('font-upload-status');
    if (status) status.textContent = '';
}

async function deleteCustomFont(id) {
    const f = customFonts.find(c => c.id === id);
    if (!f || !confirm(`Удалить шрифт «${f.name}»?`)) return;
    customFonts = customFonts.filter(c => c.id !== id);
    try { localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(customFonts)); } catch (e) {}
    try { await fontFile('delete', id); } catch (e) {}
    // выбор этого шрифта в любых группах — сброс
    const all = { ...(uiPrefs.fonts || {}) };
    Object.keys(all).forEach(g => { ['ui', 'text'].forEach(k => { if (all[g] && all[g][k] === id) all[g] = { ...all[g], [k]: '' }; }); });
    uiPrefs.fonts = all;
    applyTheme(currentThemeId, { save: false, render: false });
    commitUiPrefs();
    renderFontSettings();
}

async function recheckCustomFont(id) {
    const f = customFonts.find(c => c.id === id);
    if (!f) return;
    await registerCustomFont(f);
    const box = document.getElementById('font-upload-status');
    if (box) box.innerHTML = `<p><b data-i18n-skip>${escapeHtml(f.name)}</b></p>` + compatReportHtml(checkFontCompat(`'${f.family}'`));
}

// ---------- Настройки → «Шрифты» ----------
function renderFontSettings() {
    const box = document.getElementById('font-settings');
    if (!box) return;
    const group = currentFontGroup();
    const groupName = (FONT_GROUPS.find(g => g.id === group) || FONT_GROUPS[0]).name;
    const list = fontsForGroup(group);
    loadFontCss(list.map(f => f.id));
    customFonts.forEach(c => registerCustomFont(c));
    const p = groupFontPrefs(group);
    const tr = typeof window.t === 'function' ? window.t : (s => s);
    const opt = (f, cur) => `<option value="${f.id}" ${f.id === cur ? 'selected' : ''} data-i18n-skip>${escapeHtml(f.name)}${f.group === 'common' ? ' · ' + escapeHtml(tr('общий')) : ''}</option>`;
    const select = (kind, cur, label) => `
        <label class="font-pick">
            <span>${label}</span>
            <select onchange="setGroupFont('${kind}', this.value)">
                <option value="">Как в теме</option>
                <optgroup label="Шрифты группы «${escapeHtml(groupName)}»">${list.filter(f => f.group === group).map(f => opt(f, cur)).join('')}</optgroup>
                <optgroup label="Общие шрифты">${list.filter(f => f.group === 'common').map(f => opt(f, cur)).join('')}</optgroup>
                ${customFonts.length ? `<optgroup label="Мои шрифты">${customFonts.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''} data-i18n-skip>${escapeHtml(c.name)} (${c.score}%)</option>`).join('')}</optgroup>` : ''}
            </select>
        </label>`;
    box.innerHTML = `
        <p class="hint">Сейчас группа тем: <b>${escapeHtml(groupName)}</b>. Выбор запоминается для каждой группы отдельно.</p>
        ${select('ui', p.ui, 'Заголовки, кнопки и меню')}
        ${select('text', p.text, 'Текст, суммы и даты')}
        <div class="font-gallery">
            ${list.map(f => `<button type="button" class="font-card${f.id === p.ui || f.id === p.text ? ' is-on' : ''}" onclick="setGroupFont('ui', '${f.id}'); setGroupFont('text', '${f.id}')" title="Поставить везде">
                <span class="font-card-sample" style="font-family:${f.family}, ${FONT_FALLBACK}" data-i18n-skip>Аа Әә 123 ₸</span>
                <span class="font-card-name" data-i18n-skip>${escapeHtml(f.name)}</span>
                <span class="font-card-group">${f.group === 'common' ? 'общий' : escapeHtml(groupName)}</span>
            </button>`).join('')}
        </div>
        <h4 class="font-sub">Мои шрифты</h4>
        ${customFonts.length ? `<div class="font-custom-list">${customFonts.map(c => `<div class="font-custom-row">
            <span class="font-card-sample" style="font-family:'${c.family}', sans-serif" data-i18n-skip>Аа 123</span>
            <span class="font-custom-name" data-i18n-skip>${escapeHtml(c.name)}</span>
            <span class="font-custom-score ${c.score >= 75 ? 'is-good' : c.score >= 55 ? 'is-mid' : 'is-bad'}">${c.score}%</span>
            <button type="button" class="btn-secondary" onclick="recheckCustomFont('${c.id}')" aria-label="Проверить"><span class="material-icons">fact_check</span></button>
            <button type="button" class="btn-secondary" onclick="deleteCustomFont('${c.id}')" aria-label="Удалить"><span class="material-icons">delete</span></button>
        </div>`).join('')}</div>` : '<p class="hint">Своих шрифтов пока нет.</p>'}
        <label class="btn-secondary btn-block font-upload-btn"><span class="material-icons">upload_file</span> Загрузить свой шрифт (TTF, OTF, WOFF)
            <input type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onchange="addCustomFontFile(event)">
        </label>
        <div id="font-upload-status" class="font-upload-status" aria-live="polite"></div>
        <p class="hint">Свои шрифты хранятся только на этом устройстве. Шрифты Google загружаются из интернета при первом выборе.</p>`;
}

window.addEventListener('DOMContentLoaded', () => {
    customFonts.forEach(c => registerCustomFont(c).then(ok => { if (ok) applyFontPrefs(); }));
    renderFontSettings();
});
