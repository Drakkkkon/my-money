// --- ЗАГРУЗКА СВОЕЙ ТАБЛИЦЫ (Excel .xlsx / CSV) В «ЗАПИСИ» ---
// Приложение само находит строку заголовков и столбцы (дата, время, тип, сумма, отдельные столбцы дохода
// и расхода, категория, комментарий), понимает разные форматы дат и сумм, пропускает строки «ИТОГО»
// и повторы. Перед добавлением показывает, что получилось; столбцы можно поправить вручную.

const IMPORT_FIELDS = [
    { key: 'date', label: 'Дата' },
    { key: 'time', label: 'Время' },
    { key: 'type', label: 'Тип (доход / расход)' },
    { key: 'amount', label: 'Сумма' },
    { key: 'income', label: 'Сумма дохода (свой столбец)' },
    { key: 'expense', label: 'Сумма расхода (свой столбец)' },
    { key: 'category', label: 'Категория' },
    { key: 'comment', label: 'Комментарий' }
];

// Слова в заголовках столбцов. Точное совпадение весит больше, чем вхождение.
const IMPORT_HINTS = {
    date: ['дата', 'date', 'день', 'число', 'когда', 'дата операции', 'дата и время'],
    time: ['время', 'time', 'час'],
    type: ['тип', 'type', 'вид', 'операция', 'направление', 'доход/расход', 'приход/расход', 'вид операции'],
    amount: ['сумма', 'amount', 'sum', 'стоимость', 'цена', 'деньги', 'тенге', '₸', 'kzt', 'value', 'сумма операции'],
    income: ['доход', 'доходы', 'приход', 'поступление', 'поступления', 'зачисление', 'income', 'credit', 'кредит'],
    expense: ['расход', 'расходы', 'списание', 'траты', 'потрачено', 'expense', 'debit', 'дебет'],
    category: ['категория', 'category', 'статья', 'назначение', 'на что', 'наименование', 'товар', 'описание', 'описание операции'],
    comment: ['комментарий', 'comment', 'примечание', 'описан', 'note', 'заметка', 'детали']
};
// Первое слово каждого списка — «главное»: при равенстве оно важнее (столбец «Категория» важнее «Описания»)

const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let importState = null;

// ---------- Чтение файла ----------
function importTableFromInput(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) importTableFile(file);
}

async function importTableFile(file) {
    const name = file.name || 'таблица';
    const ext = (name.split('.').pop() || '').toLowerCase();
    try {
        let sheets;
        if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') {
            sheets = [{ name: 'CSV', rows: parseCsv(await readTextSmart(file)) }];
        } else if (ext === 'xlsx' || ext === 'xlsm') {
            const ok = typeof loadExcelLibrary === 'function' ? await loadExcelLibrary() : typeof ExcelJS !== 'undefined';
            if (!ok) { alert('Не удалось загрузить модуль Excel. Проверьте интернет и попробуйте ещё раз.'); return; }
            sheets = await readXlsxSheets(await file.arrayBuffer());
        } else if (ext === 'xls') {
            alert('Старый формат .xls не поддерживается. Откройте таблицу в Excel и сохраните её как .xlsx (или CSV), затем загрузите снова.');
            return;
        } else {
            alert('Выберите файл таблицы .xlsx или .csv');
            return;
        }
        sheets = sheets.filter(s => s.rows.some(r => r.some(c => c !== '' && c !== null && c !== undefined)));
        if (!sheets.length) { alert('В файле не нашлось данных.'); return; }
        // Лист, где больше всего найденных столбцов, затем — где больше строк
        sheets.forEach(s => { s.guess = guessImportMapping(s.rows); });
        sheets.sort((a, b) => (b.guess.score - a.guess.score) || (b.rows.length - a.rows.length));
        importState = { fileName: name, sheets, sheetIndex: 0, defaultType: 'expense', skipDup: true };
        applySheetGuess();
        openImportDialog();
    } catch (err) {
        console.warn('Импорт таблицы', err);
        alert('Не получилось прочитать файл. Убедитесь, что это таблица .xlsx или .csv.');
    }
}

async function readTextSmart(file) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    // Excel часто сохраняет CSV в кодировке Windows-1251
    if (text.includes('�')) {
        try { text = new TextDecoder('windows-1251').decode(buf); } catch (e) {}
    }
    return text.replace(/^﻿/, '');
}

function parseCsv(text) {
    const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
    const counts = [';', ',', '\t'].map(d => [d, firstLine.split(d).length]);
    const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
            } else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delim) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
        if (rows.length > 5000) break;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim()));
}

function excelCellValue(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
        if ('result' in v) return excelCellValue(v.result);
        if (Array.isArray(v.richText)) return v.richText.map(r => r.text || '').join('');
        if ('text' in v) return String(v.text);
        return '';
    }
    return v;
}

async function readXlsxSheets(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheets = [];
    wb.eachSheet(ws => {
        const rows = [];
        ws.eachRow({ includeEmpty: true }, (row) => {
            if (rows.length > 5000) return;
            const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
            rows.push(vals.map(excelCellValue));
        });
        sheets.push({ name: ws.name, rows });
    });
    return sheets;
}

// ---------- Распознавание значений ----------
function importNorm(v) {
    return String(v === null || v === undefined ? '' : v).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function pad2(n) { return String(n).padStart(2, '0'); }

function validYmd(y, m, d) {
    if (y < 100) y += 2000;
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

function validTime(h, mi) {
    h = Number(h); mi = Number(mi);
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? `${pad2(h)}:${pad2(mi)}` : null;
}

// Дата: объект Date из Excel, число дней Excel, строка «01.11.2026», «2026-11-01 14:30», «1 ноября 2026»
function parseImportDate(v) {
    if (v instanceof Date) {
        if (isNaN(v)) return null;
        const date = validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
        const time = (v.getUTCHours() || v.getUTCMinutes()) ? validTime(v.getUTCHours(), v.getUTCMinutes()) : null;
        return date ? { date, time } : null;
    }
    if (typeof v === 'number') {
        if (v > 20000 && v < 80000) return parseImportDate(new Date(Math.round((v - 25569) * 86400000)));
        return null;
    }
    const s = importNorm(v);
    if (!s) return null;
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ t,]+(\d{1,2})[:.](\d{2}))?/);
    if (m) {
        const date = validYmd(+m[1], +m[2], +m[3]);
        return date ? { date, time: m[4] ? validTime(m[4], m[5]) : null } : null;
    }
    m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ t,г.]+(\d{1,2})[:.](\d{2}))?/);
    if (m) {
        let d = +m[1], mo = +m[2];
        if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // формат месяц/день
        const date = validYmd(+m[3], mo, d);
        return date ? { date, time: m[4] ? validTime(m[4], m[5]) : null } : null;
    }
    m = s.match(/^(\d{1,2})\s+([а-я]+)\.?\s+(\d{4})(?:[^\d]+(\d{1,2})[:.](\d{2}))?/);
    if (m) {
        const mi = RU_MONTHS.findIndex(p => m[2].startsWith(p));
        const date = mi >= 0 ? validYmd(+m[3], mi + 1, +m[1]) : null;
        return date ? { date, time: m[4] ? validTime(m[4], m[5]) : null } : null;
    }
    return null;
}

function parseImportTime(v) {
    if (v instanceof Date) return isNaN(v) ? null : validTime(v.getUTCHours(), v.getUTCMinutes());
    if (typeof v === 'number' && v >= 0 && v < 1) {
        const mins = Math.round(v * 1440);
        return validTime(Math.floor(mins / 60) % 24, mins % 60);
    }
    const m = importNorm(v).match(/(\d{1,2})[:.](\d{2})/);
    return m ? validTime(m[1], m[2]) : null;
}

// Сумма: число или строка «1 234,50 ₸», «-500», «(300)», «1,234.50»
function parseImportAmount(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v instanceof Date || v === null || v === undefined) return NaN;
    let s = String(v).trim();
    if (!s) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[\s  ]/g, '').replace(/[₸$€₽]|тг|kzt|руб|тенге|usd|eur/gi, '');
    if (/^[−–-]/.test(s)) { neg = true; s = s.slice(1); }
    if (s.startsWith('+')) s = s.slice(1);
    if (s.includes(',') && s.includes('.')) {
        s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',')) {
        s = /,\d{3}$/.test(s) && (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = parseFloat(s);
    return neg ? -n : n;
}

function parseImportType(v) {
    const s = importNorm(v);
    if (!s) return null;
    if (/доход|приход|поступ|зачисл|income|credit|кредит|^\+$|^плюс/.test(s)) return 'income';
    if (/расход|трат|списан|покуп|оплат|expense|debit|дебет|^[-−]$|^минус/.test(s)) return 'expense';
    return null;
}

// ---------- Поиск заголовков и столбцов ----------
function headerScore(text, key) {
    const s = importNorm(text);
    if (!s || s.length > 60) return 0;
    let best = 0;
    IMPORT_HINTS[key].forEach((h, i) => {
        if (s === h) best = Math.max(best, i === 0 ? 4 : 3);
        else if (s.startsWith(h) || s.includes(h)) best = Math.max(best, 2);
    });
    // «ИТОГО ЗА ДЕНЬ / ЗА ВСЁ ВРЕМЯ» — это не сумма записи
    if (/итого|всего|баланс|остаток/.test(s)) best = Math.min(best, 1);
    return best;
}

function columnCount(rows) {
    return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

function guessImportMapping(rows) {
    const cols = columnCount(rows);
    let best = { headerRow: -1, map: {}, score: 0 };
    rows.slice(0, 15).forEach((row, ri) => {
        const cand = [];
        row.forEach((cell, ci) => {
            if (typeof cell !== 'string' && typeof cell !== 'number') return;
            IMPORT_FIELDS.forEach(f => {
                const sc = headerScore(cell, f.key);
                if (sc >= 2) cand.push({ key: f.key, ci, sc });
            });
        });
        cand.sort((a, b) => b.sc - a.sc);
        const map = {}, used = new Set();
        cand.forEach(c => { if (map[c.key] === undefined && !used.has(c.ci)) { map[c.key] = c.ci; used.add(c.ci); } });
        const score = Object.keys(map).length;
        if (score > best.score) best = { headerRow: ri, map, score };
    });
    if (best.score < 2) best = { headerRow: -1, map: {}, score: 0 };

    // Чего не нашли по заголовкам — ищем по содержимому столбцов
    const data = rows.slice(best.headerRow + 1).filter(r => r.some(c => c !== '' && c !== null)).slice(0, 60);
    const used = new Set(Object.values(best.map));
    const share = (ci, test) => {
        const vals = data.map(r => r[ci]).filter(v => v !== '' && v !== null && v !== undefined);
        return vals.length ? vals.filter(test).length / vals.length : 0;
    };
    const free = [...Array(cols).keys()].filter(ci => !used.has(ci));
    if (best.map.date === undefined) {
        const ci = free.find(c => share(c, v => !!parseImportDate(v)) >= 0.6);
        if (ci !== undefined) { best.map.date = ci; used.add(ci); }
    }
    if (best.map.amount === undefined && best.map.income === undefined && best.map.expense === undefined) {
        const ci = free.find(c => !used.has(c) && share(c, v => !(v instanceof Date) && !isNaN(parseImportAmount(v))) >= 0.6);
        if (ci !== undefined) { best.map.amount = ci; used.add(ci); }
    }
    if (best.map.type === undefined) {
        const ci = free.find(c => !used.has(c) && share(c, v => !!parseImportType(v)) >= 0.6);
        if (ci !== undefined) { best.map.type = ci; used.add(ci); }
    }
    if (best.map.category === undefined) {
        const ci = free.find(c => !used.has(c) && share(c, v => typeof v === 'string' && v.trim() && isNaN(parseImportAmount(v)) && !parseImportDate(v)) >= 0.6);
        if (ci !== undefined) { best.map.category = ci; used.add(ci); }
    }
    best.score += Object.keys(best.map).length * 0.1;
    return best;
}

function applySheetGuess() {
    const s = importState.sheets[importState.sheetIndex];
    importState.headerRow = s.guess.headerRow;
    importState.map = { ...s.guess.map };
}

function columnLabel(ci) {
    let n = ci + 1, s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

function cellText(v) {
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 16).replace('T', ' ');
    return String(v === null || v === undefined ? '' : v).trim();
}

// ---------- Разбор строк по выбранным столбцам ----------
function buildImportRows() {
    const st = importState;
    const rows = st.sheets[st.sheetIndex].rows;
    const map = st.map;
    const get = (r, key) => map[key] === undefined || map[key] === '' ? '' : r[map[key]];
    const data = rows.slice(st.headerRow + 1);
    // Есть ли в столбце суммы отрицательные числа: тогда «+» — доход, «−» — расход
    const signed = map.amount !== undefined && data.some(r => parseImportAmount(get(r, 'amount')) < 0);

    const existing = new Set(transactions.map(t => importKey(t.date, t.type, t.amount, t.category)));
    const seenInFile = new Map();
    const out = [];
    data.forEach(r => {
        if (!r.some(c => cellText(c) !== '')) return;
        const first = importNorm(r.find(c => cellText(c) !== ''));
        if (/^(итого|всего|total|баланс|остаток)/.test(first)) return;

        const item = { status: 'ok' };
        const d = parseImportDate(get(r, 'date'));
        const t = parseImportTime(get(r, 'time'));
        item.date = d ? d.date : '';
        item.time = t || (d && d.time) || '00:00';

        let amount = NaN, type = parseImportType(get(r, 'type'));
        if (map.income !== undefined || map.expense !== undefined) {
            const inc = parseImportAmount(get(r, 'income'));
            const exp = parseImportAmount(get(r, 'expense'));
            if (inc && !isNaN(inc)) { amount = Math.abs(inc); type = type || 'income'; }
            else if (exp && !isNaN(exp)) { amount = Math.abs(exp); type = type || 'expense'; }
        }
        if (isNaN(amount) && map.amount !== undefined) {
            const n = parseImportAmount(get(r, 'amount'));
            if (!isNaN(n)) {
                amount = Math.abs(n);
                if (!type) type = n < 0 ? 'expense' : (signed ? 'income' : st.defaultType);
            }
        }
        item.type = type || st.defaultType;
        item.amount = Math.round(amount * 100) / 100;
        item.category = cellText(get(r, 'category')).replace(/\s+/g, ' ').slice(0, 60) || 'Без категории';
        item.comment = cellText(get(r, 'comment')).replace(/\s+/g, ' ').slice(0, typeof COMMENT_MAX === 'number' ? COMMENT_MAX : 100);

        if (!item.date) { item.status = 'skip'; item.reason = 'нет даты'; }
        else if (!item.amount) { item.status = 'skip'; item.reason = 'нет суммы'; }
        else if (st.skipDup) {
            const key = importKey(`${item.date}T${item.time}`, item.type, item.amount, item.category);
            // Повтор = такая запись уже есть в приложении (одинаковые строки внутри файла не считаются повтором)
            const n = (seenInFile.get(key) || 0) + 1;
            seenInFile.set(key, n);
            if (existing.has(key) && n === 1) { item.status = 'skip'; item.reason = 'уже есть'; }
        }
        out.push(item);
    });
    return out;
}

function importKey(date, type, amount, category) {
    const dt = String(date || '');
    const full = dt.includes('T') ? dt.slice(0, 16) : dt + 'T00:00';
    return [full, type, Math.round((Number(amount) || 0) * 100), importNorm(category)].join('|');
}

// ---------- Окно предпросмотра ----------
function openImportDialog() {
    closeImportDialog();
    const overlay = document.createElement('div');
    overlay.id = 'import-dialog';
    overlay.className = 'export-sheet-overlay import-overlay';
    overlay.innerHTML = `
        <div class="export-sheet import-dialog" role="dialog" aria-modal="true" aria-label="Загрузка таблицы">
            <div class="export-sheet-head">
                <h3>Загрузка таблицы</h3>
                <button type="button" class="export-sheet-close" data-act="cancel" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="import-body" id="import-body"></div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="ok" id="import-ok"><span class="material-icons">playlist_add</span> Добавить</button>
                <button type="button" class="btn-secondary" data-act="cancel">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeImportDialog(true); return; }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'ok') confirmImport();
        else closeImportDialog(true);
    });
    overlay.addEventListener('change', (e) => {
        const el = e.target;
        if (el.dataset.field) {
            const v = el.value;
            // один столбец — одно поле
            if (v !== '') Object.keys(importState.map).forEach(k => { if (String(importState.map[k]) === v && k !== el.dataset.field) delete importState.map[k]; });
            if (v === '') delete importState.map[el.dataset.field]; else importState.map[el.dataset.field] = Number(v);
        } else if (el.id === 'import-sheet') {
            importState.sheetIndex = Number(el.value);
            applySheetGuess();
        } else if (el.id === 'import-header') {
            importState.headerRow = Number(el.value);
        } else if (el.id === 'import-default-type') {
            importState.defaultType = el.value;
        } else if (el.id === 'import-skip-dup') {
            importState.skipDup = el.checked;
        }
        renderImportDialog();
    });
    if (typeof playSound === 'function') playSound('open');
    renderImportDialog();
}

function renderImportDialog() {
    const body = document.getElementById('import-body');
    if (!body || !importState) return;
    const st = importState;
    const sheet = st.sheets[st.sheetIndex];
    const cols = columnCount(sheet.rows);
    const header = st.headerRow >= 0 ? sheet.rows[st.headerRow] || [] : [];
    const colOptions = sel => '<option value="">— нет —</option>' + [...Array(cols).keys()].map(ci => {
        const title = cellText(header[ci]) || cellText((sheet.rows[st.headerRow + 1] || [])[ci]);
        return `<option value="${ci}"${sel === ci ? ' selected' : ''}>${columnLabel(ci)}${title ? ': ' + escapeHtml(title.slice(0, 28)) : ''}</option>`;
    }).join('');

    const items = buildImportRows();
    st.items = items;
    const ok = items.filter(i => i.status === 'ok');
    const inc = ok.filter(i => i.type === 'income');
    const exp = ok.filter(i => i.type !== 'income');
    const sum = list => list.reduce((s, i) => s + i.amount, 0);
    const skipped = items.length - ok.length;
    const reasons = {};
    items.filter(i => i.status !== 'ok').forEach(i => { reasons[i.reason] = (reasons[i.reason] || 0) + 1; });
    const fmt = v => (typeof fmtMoney === 'function' ? fmtMoney(v) : v);
    const missing = st.map.date === undefined || (st.map.amount === undefined && st.map.income === undefined && st.map.expense === undefined);

    body.innerHTML = `
        <p class="hint">Файл: <b>${escapeHtml(st.fileName)}</b>. Проверьте, какие столбцы найдены, и при необходимости поправьте.</p>
        <div class="import-options">
            ${st.sheets.length > 1 ? `<label>Лист <select id="import-sheet">${st.sheets.map((s, i) => `<option value="${i}"${i === st.sheetIndex ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></label>` : ''}
            <label>Заголовки в строке <select id="import-header"><option value="-1"${st.headerRow < 0 ? ' selected' : ''}>нет заголовков</option>${sheet.rows.slice(0, 15).map((r, i) => `<option value="${i}"${i === st.headerRow ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
            <label>Если тип не указан, считать <select id="import-default-type"><option value="expense"${st.defaultType === 'expense' ? ' selected' : ''}>расходом</option><option value="income"${st.defaultType === 'income' ? ' selected' : ''}>доходом</option></select></label>
            <label><input type="checkbox" id="import-skip-dup"${st.skipDup ? ' checked' : ''}> пропускать записи, которые уже есть</label>
        </div>
        <div class="import-map">
            ${IMPORT_FIELDS.map(f => `<label><span>${f.label}</span><select data-field="${f.key}">${colOptions(st.map[f.key])}</select></label>`).join('')}
        </div>
        ${missing ? '<p class="hint" style="color:var(--expense)">Укажите хотя бы столбцы «Дата» и «Сумма» (или «Сумма дохода» / «Сумма расхода»).</p>' : ''}
        <p class="import-summary">Будет добавлено: ${ok.length} — доходов ${inc.length} на <span class="amount-income">${fmt(sum(inc))} ₸</span>, расходов ${exp.length} на <span class="amount-expense">${fmt(sum(exp))} ₸</span>.
            ${skipped ? `Пропущено: ${skipped} (${Object.entries(reasons).map(([r, n]) => `${r} — ${n}`).join(', ')}).` : ''}</p>
        <div class="import-preview">
            <table>
                <thead><tr><th>Дата</th><th>Время</th><th>Тип</th><th>Категория</th><th>Комментарий</th><th>Сумма</th><th></th></tr></thead>
                <tbody>${items.slice(0, 100).map(i => `<tr class="${i.status === 'ok' ? '' : 'is-skip'}">
                    <td>${i.date ? i.date.split('-').reverse().join('.') : '—'}</td><td>${i.time}</td>
                    <td class="${i.type === 'income' ? 'amount-income' : 'amount-expense'}">${i.type === 'income' ? 'Доход' : 'Расход'}</td>
                    <td>${escapeHtml(i.category)}</td><td>${escapeHtml(i.comment)}</td>
                    <td class="num">${i.amount ? fmt(i.amount) : '—'}</td><td>${i.status === 'ok' ? '' : escapeHtml(i.reason)}</td>
                </tr>`).join('') || '<tr><td colspan="7">Строк с данными не найдено</td></tr>'}</tbody>
            </table>
        </div>
        ${items.length > 100 ? `<p class="hint">Показаны первые 100 строк из ${items.length}.</p>` : ''}`;
    const okBtn = document.getElementById('import-ok');
    if (okBtn) {
        okBtn.disabled = !ok.length;
        okBtn.innerHTML = `<span class="material-icons">playlist_add</span> Добавить ${ok.length} ${ok.length % 10 === 1 && ok.length % 100 !== 11 ? 'запись' : (ok.length % 10 >= 2 && ok.length % 10 <= 4 && (ok.length % 100 < 12 || ok.length % 100 > 14) ? 'записи' : 'записей')}`;
    }
}

function confirmImport() {
    if (!importState || !importState.items) return;
    const ok = importState.items.filter(i => i.status === 'ok');
    if (!ok.length) return;
    const stamp = Date.now().toString(36);
    ok.forEach((i, n) => {
        const tx = { id: `im${stamp}${n.toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: i.type, amount: i.amount, category: i.category, date: `${i.date}T${i.time}` };
        if (i.comment) tx.comment = i.comment;
        transactions.push(tx);
    });
    closeImportDialog(false);
    updateUI(true);
    if (typeof playSound === 'function') playSound('success');
    if (typeof showToast === 'function') showToast(`Добавлено записей: ${ok.length}`);
}

function closeImportDialog(withSound) {
    const el = document.getElementById('import-dialog');
    if (el) el.remove();
    if (withSound && typeof playSound === 'function') playSound('close');
}

// Перетаскивание файла на блок загрузки (ПК)
window.addEventListener('DOMContentLoaded', () => {
    const drop = document.getElementById('import-drop');
    if (!drop) return;
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) importTableFile(file);
    });
});
