// --- 4.17.0: ОКНО ВЫГРУЗКИ — ПЕРИОД И КАТЕГОРИИ ПЕРЕД СОХРАНЕНИЕМ EXCEL / PDF ---
// Кнопки «Скачать Excel» и «Скачать PDF» (Отчёты → «Выгрузка») сначала открывают это окно:
//   1) период: сегодня, 3 дня, неделя, 2 недели, месяц, 3 месяца, год, всё время или свои даты «с … по …»;
//   2) категории и подкатегории — кнопками, по умолчанию выбраны все; можно выбрать любое количество.
//      У раздела с подкатегориями: кнопка-заголовок включает/выключает весь раздел, отдельные кнопки — подкатегории
//      и «без подкатегории» (записи прямо в разделе).
// Внизу — сколько записей попадёт в файл, и две кнопки: Excel и PDF. Период запоминается на устройстве
// (finance_export_period), категории каждый раз выбраны все. Авто-выгрузка в 23:00 работает как раньше — без окна.

const XD_PERIOD_KEY = 'finance_export_period';
const XD_PERIODS = [
    ['1', 'Сегодня'], ['3', '3 дня'], ['7', 'Неделя'], ['14', '2 недели'], ['30', 'Месяц'],
    ['90', '3 месяца'], ['365', 'Год'], ['all', 'Всё время'], ['custom', 'Свой период']
];
const XD_NO_CAT = 'Без категории';

let xdState = null;

function xdEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function xdToday() { return almatyIsoNow().split('T')[0]; }
function xdDayShift(n) { return almatyIsoNow(n).split('T')[0]; }
function xdPretty(d) { return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''; }

// Раздел и подкатегория записи: «Семья: Отец» → ['Семья', 'Отец']
function xdSplit(cat) {
    const full = String(cat || '').trim() || XD_NO_CAT;
    const at = full.indexOf(':');
    return at >= 0 ? [full.slice(0, at).trim() || XD_NO_CAT, full.slice(at + 1).trim()] : [full, ''];
}
function xdKey(cat) { const [s, sub] = xdSplit(cat); return sub ? s + '\u241F' + sub : s + '\u241F'; }

// Границы периода [from, to] в виде 'YYYY-MM-DD' (from = '' — с самого начала)
function xdRange() {
    const p = xdState.period, today = xdToday();
    if (p === 'all') return ['', today];
    if (p === 'custom') {
        let a = xdState.from || '', b = xdState.to || today;
        if (a && b && a > b) [a, b] = [b, a];
        return [a, b];
    }
    return [xdDayShift(-(Number(p) - 1)), today];
}

function xdPeriodList() {
    const [from, to] = xdRange();
    return transactions.filter(t => { const d = getTxDateStr(t.date); return (!from || d >= from) && d <= to; });
}

function xdSelectedList() {
    return xdPeriodList().filter(t => !xdState.off.has(xdKey(t.category)));
}

// Разделы → подкатегории с числом записей за период (и категории из Настроек, даже если записей нет)
function xdGroups(list) {
    const groups = new Map();
    const add = (sec, sub, n) => {
        if (!groups.has(sec)) groups.set(sec, { name: sec, direct: 0, subs: new Map() });
        const g = groups.get(sec);
        if (sub) g.subs.set(sub, (g.subs.get(sub) || 0) + n);
        else g.direct += n;
    };
    list.forEach(t => { const [s, sub] = xdSplit(t.category); add(s, sub, 1); });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function xdLabel() {
    const p = xdState.period;
    const [from, to] = xdRange();
    const name = (XD_PERIODS.find(x => x[0] === p) || [])[1] || '';
    if (p === 'all') return 'всё время';
    if (p === '1') return `${xdPretty(to)}`;
    return from ? `${xdPretty(from)} — ${xdPretty(to)}` : name;
}

function xdFileSuffix() {
    const p = xdState.period;
    const [from, to] = xdRange();
    if (p === 'all') return '';
    return '_' + (p === '1' ? to : `${from || 'начало'}_${to}`);
}

function renderExportDialog() {
    const box = document.getElementById('xd-body');
    if (!box) return;
    const periodList = xdPeriodList();
    const groups = xdGroups(periodList);
    const isOn = key => !xdState.off.has(key);
    const chip = (key, label, n) => `<button type="button" class="xd-chip${isOn(key) ? ' is-on' : ''}" data-key="${xdEsc(key)}" aria-pressed="${isOn(key)}">
        <span class="material-icons" aria-hidden="true">${isOn(key) ? 'check' : 'add'}</span>${xdEsc(label)}<small>${n}</small></button>`;
    const cats = groups.map(g => {
        const keys = [...(g.direct ? [g.name + '\u241F'] : []), ...[...g.subs.keys()].map(s => g.name + '\u241F' + s)];
        const total = g.direct + [...g.subs.values()].reduce((a, b) => a + b, 0);
        if (!g.subs.size) return chip(g.name + '\u241F', g.name, total);
        const onCount = keys.filter(isOn).length;
        const state = onCount === keys.length ? 'all' : (onCount ? 'some' : 'none');
        return `<div class="xd-group">
            <button type="button" class="xd-chip xd-head is-${state}${state !== 'none' ? ' is-on' : ''}" data-group="${xdEsc(g.name)}" aria-pressed="${state === 'all'}">
                <span class="material-icons" aria-hidden="true">${state === 'all' ? 'check' : (state === 'some' ? 'remove' : 'add')}</span>${xdEsc(g.name)}<small>${total}</small></button>
            <div class="xd-subs">${g.direct ? chip(g.name + '\u241F', 'без подкатегории', g.direct) : ''}${[...g.subs.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([s, n]) => chip(g.name + '\u241F' + s, s, n)).join('')}</div>
        </div>`;
    }).join('');
    const sel = xdSelectedList().length;
    const [from, to] = xdRange();
    box.innerHTML = `
        <h4 class="xd-title">Период</h4>
        <div class="xd-periods" role="radiogroup">${XD_PERIODS.map(([v, l]) =>
            `<button type="button" role="radio" class="xd-chip xd-period${xdState.period === v ? ' is-on' : ''}" aria-checked="${xdState.period === v}" data-period="${v}">${l}</button>`).join('')}</div>
        ${xdState.period === 'custom' ? `<div class="xd-dates">
            <label><span>С</span><input type="date" id="xd-from" value="${xdEsc(xdState.from || '')}" max="${xdToday()}"></label>
            <label><span>По</span><input type="date" id="xd-to" value="${xdEsc(xdState.to || xdToday())}" max="${xdToday()}"></label></div>` : ''}
        <p class="hint xd-range">${from ? `${xdPretty(from)} — ${xdPretty(to)}` : `Все записи по ${xdPretty(to)}`} · записей за период: ${periodList.length}</p>
        <div class="xd-cats-head">
            <h4 class="xd-title">Категории и подкатегории</h4>
            <div class="xd-all">
                <button type="button" class="btn-secondary" data-all="1"><span class="material-icons">done_all</span> Все</button>
                <button type="button" class="btn-secondary" data-all="0"><span class="material-icons">remove_done</span> Ни одной</button>
            </div>
        </div>
        <div class="xd-cats">${cats || '<p class="hint">За этот период записей нет.</p>'}</div>`;
    const count = document.getElementById('xd-count');
    if (count) count.textContent = `В файл попадёт записей: ${sel}`;
    document.querySelectorAll('#export-dialog [data-act="xlsx"], #export-dialog [data-act="pdf"]').forEach(b => { b.disabled = !sel; });
}

function closeExportDialog() {
    const o = document.getElementById('export-dialog');
    if (o) o.remove();
    xdState = null;
}

// kind: 'xlsx' | 'pdf' — какая кнопка была нажата (её кнопка в окне — главная)
function openExportDialog(kind = 'xlsx') {
    if (!transactions.length) { alert('Нет записей для выгрузки.'); return; }
    closeExportDialog();
    let period = 'all';
    try { period = localStorage.getItem(XD_PERIOD_KEY) || 'all'; } catch (e) {}
    if (!XD_PERIODS.some(p => p[0] === period)) period = 'all';
    xdState = { kind, period, from: '', to: '', off: new Set() };

    const overlay = document.createElement('div');
    overlay.id = 'export-dialog';
    overlay.className = 'export-sheet-overlay';
    const main = kind === 'pdf'
        ? ['pdf', 'picture_as_pdf', 'Скачать PDF (A4)'] : ['xlsx', 'table_view', 'Скачать Excel (.xlsx)'];
    const other = kind === 'pdf'
        ? ['xlsx', 'table_view', 'Excel'] : ['pdf', 'picture_as_pdf', 'PDF'];
    overlay.innerHTML = `
        <div class="export-sheet export-dialog" role="dialog" aria-modal="true" aria-labelledby="xd-h">
            <div class="export-sheet-head">
                <h3 id="xd-h"><span class="material-icons">file_download</span> Выгрузка: период и категории</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="xd-body" id="xd-body"></div>
            <p class="xd-count" id="xd-count" aria-live="polite"></p>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="${main[0]}"><span class="material-icons">${main[1]}</span> ${main[2]}</button>
                <button type="button" class="btn-secondary" data-act="${other[0]}"><span class="material-icons">${other[1]}</span> ${other[2]}</button>
            </div>
        </div>`;

    overlay.addEventListener('click', e => {
        if (e.target === overlay) { closeExportDialog(); return; }
        const t = e.target.closest('button');
        if (!t || !xdState) return;
        if (t.dataset.act === 'close') { closeExportDialog(); if (typeof playSound === 'function') playSound('close'); return; }
        if (t.dataset.act === 'xlsx' || t.dataset.act === 'pdf') {
            const list = xdSelectedList();
            if (!list.length) return;
            const filtered = xdState.off.size > 0;
            const opts = { list, suffix: xdFileSuffix(), totalLabel: (xdState.period === 'all' && !filtered) ? 'ИТОГО ЗА ВСЁ ВРЕМЯ' : 'ИТОГО ЗА ПЕРИОД', title: 'My Money — выписка за ' + xdLabel() + (filtered ? ' (выбранные категории)' : '') };
            const act = t.dataset.act;
            closeExportDialog();
            if (act === 'xlsx') exportExcel(opts); else exportPdf(opts);
            return;
        }
        if (t.dataset.period) {
            xdState.period = t.dataset.period;
            try { localStorage.setItem(XD_PERIOD_KEY, xdState.period); } catch (e2) {}
        } else if (t.dataset.all) {
            if (t.dataset.all === '1') xdState.off.clear();
            else xdPeriodList().forEach(tx => xdState.off.add(xdKey(tx.category)));
        } else if (t.dataset.group) {
            const name = t.dataset.group;
            const keys = [...new Set(xdPeriodList().map(tx => xdKey(tx.category)).filter(k => k.split('\u241F')[0] === name))];
            const allOn = keys.every(k => !xdState.off.has(k));
            keys.forEach(k => allOn ? xdState.off.add(k) : xdState.off.delete(k));
        } else if (t.dataset.key) {
            const k = t.dataset.key;
            if (xdState.off.has(k)) xdState.off.delete(k); else xdState.off.add(k);
        } else return;
        renderExportDialog();
    });
    overlay.addEventListener('change', e => {
        if (!xdState) return;
        if (e.target.id === 'xd-from') xdState.from = e.target.value;
        if (e.target.id === 'xd-to') xdState.to = e.target.value;
        renderExportDialog();
    });
    document.body.appendChild(overlay);
    renderExportDialog();
    if (typeof playSound === 'function') playSound('open');
}
