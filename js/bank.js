// --- БАНК (Статистика → «Мой банк») ---
// Банки Казахстана (Kaspi, Halyk и др.) не дают сторонним приложениям доступ к счёту: открытого API для частных лиц нет.
// Вводить логин и пароль банка в чужое приложение опасно, поэтому приложение их никогда не спрашивает.
// Безопасный путь: пользователь сам выгружает выписку (PDF из приложения банка) или копирует текст уведомления банка.
// Всё разбирается прямо на устройстве: остаток на счёте, доходы и расходы за период выписки, крупные траты.
// Предупреждения: остаток ниже порога, трата больше порога, расхождение остатка банка с балансом в приложении.
// Данные — uiPrefs.bank (js/layout.js), синхронизируются через Google Диск.

const BANKS = [
    { id: 'kaspi', name: 'Kaspi.kz', hint: 'Kaspi.kz → Kaspi Gold → «Выписка» → выберите период → «Отправить» / «Сохранить PDF».' },
    { id: 'halyk', name: 'Halyk Bank', hint: 'Homebank → счёт или карта → «Выписка» → PDF.' },
    { id: 'freedom', name: 'Freedom Bank', hint: 'Freedom → карта → «Выписка» → PDF.' },
    { id: 'jusan', name: 'Jusan Bank', hint: 'Jusan → карта → «Выписка по счёту» → PDF.' },
    { id: 'forte', name: 'ForteBank', hint: 'ForteBank → карта → «Выписка» → PDF.' },
    { id: 'bcc', name: 'Банк ЦентрКредит', hint: 'BCC.kz → карта → «Выписка» → PDF.' },
    { id: 'other', name: 'Другой банк', hint: 'В приложении банка найдите «Выписка» и сохраните её в PDF.' }
];
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let bankOps = []; // операции из последней загруженной выписки (до переноса в «Записи»)

function bankInfo() {
    return BANKS.find(b => b.id === uiPrefs.bank.name) || BANKS[0];
}

function bankNum(s) {
    const n = parseFloat(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
}

function bankDate(s) { // '01.11.25' / '01.11.2025' → '2025-11-01'
    const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (!m) return '';
    return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`;
}

// ---------- Чтение PDF: строки текста по координатам ----------
async function pdfLines(file) {
    await loadScriptOnce(PDFJS_URL);
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('модуль чтения PDF не загрузился');
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const lines = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
        const content = await (await pdf.getPage(p)).getTextContent();
        const rows = new Map();
        content.items.forEach(it => {
            if (!it.str || !it.str.trim()) return;
            const y = Math.round(it.transform[5] / 3) * 3; // один «ряд» — с точностью до 3 точек
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y).push({ x: it.transform[4], s: it.str });
        });
        [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
            // символы, которых нет в шрифте PDF (часто ₸), приходят как \u0000 — убираем
            lines.push(items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/[\u0000-\u001f�]/g, ' ').replace(/\s+/g, ' ').trim());
        });
    }
    return lines;
}

// ---------- Разбор выписки ----------
// Строка операции: «01.11.25 - 2 000,00 ₸ Покупки Magnum» или «01.11.2025 +50 000,00 KZT Пополнение …»
const BANK_OP_RE = /(\d{2}\.\d{2}\.\d{2,4})\s+([+\-−–])\s*([\d\s ]+[.,]\d{2})\s*(?:₸|т|kzt|тг)?\s*(.*)$/i;
const BANK_BALANCE_RE = /(доступно|остаток|баланс|исходящий остаток|на конец периода)[^\d+\-]{0,40}(?:(\d{2}\.\d{2}\.\d{2,4})[^\d+\-]{0,10})?([+\-]?\s*[\d\s ]+[.,]\d{2})/i;

function parseBankStatement(lines) {
    const ops = [];
    let balance = null, balanceDate = '';
    lines.forEach(l => {
        const m = l.match(BANK_OP_RE);
        if (m) {
            const amount = bankNum(m[3]);
            if (amount > 0) {
                const rest = m[4].replace(/^[^a-zа-яё0-9]+/i, '').trim();
                const typeWord = (rest.match(/^(Покупк[а-яё]*|Пополнени[а-яё]*|Перевод[а-яё]*|Сняти[а-яё]*|Разное|Платеж[а-яё]*|Платёж[а-яё]*|Оплат[а-яё]*)/i) || [])[1] || '';
                ops.push({
                    date: bankDate(m[1]), type: /[+]/.test(m[2]) ? 'income' : 'expense', amount,
                    kind: typeWord, details: rest.slice(typeWord.length).trim().slice(0, 80)
                });
            }
            return;
        }
        const b = l.match(BANK_BALANCE_RE);
        if (b && !/пополнени|покупк|перевод/i.test(l.slice(0, 15))) {
            const v = bankNum(b[3].replace(/\s/g, ''));
            if (Number.isFinite(v)) { balance = v; balanceDate = b[2] ? bankDate(b[2]) : balanceDate; }
        }
    });
    return { ops, balance, balanceDate };
}

// Текст уведомления банка: «Покупка 2 500,00 ₸ MAGNUM. Доступно 15 300,00 ₸»
function parseBankMessage(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const ops = [];
    const re = /(покупка|оплата|списание|перевод|пополнение|зачисление|поступление|снятие)[^\d]{0,30}?([+\-]?[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₸|тг|kzt|т\b)/gi;
    let m;
    while ((m = re.exec(t))) {
        const amount = bankNum(m[2].replace(/[+\-]/, ''));
        if (!(amount > 0)) continue;
        const after = t.slice(re.lastIndex, re.lastIndex + 60).replace(/доступно.*$/i, '').replace(/^[\s.,:;-]+/, '').split(/[.\n]/)[0].trim();
        ops.push({ date: almatyIsoNow().slice(0, 10), type: /пополнение|зачисление|поступление/i.test(m[1]) ? 'income' : 'expense', amount, kind: capitalizeRu(m[1].toLowerCase()), details: after.slice(0, 60) });
    }
    const b = t.match(/(доступно|остаток|баланс)[^\d]{0,20}([\d\s]+(?:[.,]\d{1,2})?)\s*(?:₸|тг|kzt)?/i);
    return { ops, balance: b ? bankNum(b[2]) : null, balanceDate: almatyIsoNow().slice(0, 10) };
}

// ---------- Применение данных ----------
function applyBankData(res, source) {
    if (res.balance === null && !res.ops.length) {
        alert('Не удалось найти в тексте ни остаток, ни операции. Проверьте, что это выписка или уведомление банка.');
        return;
    }
    const bp = uiPrefs.bank;
    if (res.balance !== null) {
        bp.balance = res.balance;
        bp.balanceAt = (res.balanceDate || almatyIsoNow().slice(0, 10)) + (source === 'message' ? almatyIsoNow().slice(10) : '');
        bp.source = source;
    }
    if (res.ops.length) {
        const dates = res.ops.map(o => o.date).filter(Boolean).sort();
        const sum = t => res.ops.filter(o => o.type === t).reduce((s, o) => s + o.amount, 0);
        const byPlace = {};
        res.ops.filter(o => o.type === 'expense').forEach(o => { const k = o.details || o.kind || 'Другое'; byPlace[k] = (byPlace[k] || 0) + o.amount; });
        bp.summary = {
            from: dates[0] || '', to: dates[dates.length - 1] || '', count: res.ops.length,
            income: sum('income'), expense: sum('expense'),
            top: Object.entries(byPlace).sort((a, b) => b[1] - a[1]).slice(0, 5),
            biggest: res.ops.filter(o => o.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 3)
        };
        bankOps = res.ops;
    }
    commitUiPrefs();
    renderBank();
    const warn = bankWarnings();
    if (warn.length && uiPrefs.notify.bank) showNotice(`${bankInfo().name}: проверьте счёт`, warn[0], 'bank');
    else showToast(res.balance !== null ? `Остаток в банке: ${fmtTenge(res.balance)}` : `Найдено операций: ${res.ops.length}`);
}

async function bankFromPdf(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = document.getElementById('bank-status');
    if (status) status.textContent = 'Читаем выписку…';
    try {
        const lines = await pdfLines(file);
        const res = parseBankStatement(lines);
        if (status) status.textContent = res.ops.length ? `В выписке найдено операций: ${res.ops.length}.` : 'Операции в выписке не распознаны — возможно, это скан. Можно вставить текст уведомления банка.';
        applyBankData(res, 'pdf');
    } catch (err) {
        console.warn('Выписка не прочитана', err);
        if (status) status.textContent = 'Не удалось прочитать PDF: ' + (err.message || err) + '.';
    }
}

function bankFromText() {
    const ta = document.getElementById('bank-text');
    const text = ta ? ta.value : '';
    if (!text.trim()) { alert('Вставьте текст SMS или push-уведомления банка.'); return; }
    applyBankData(parseBankMessage(text), 'message');
    if (ta) ta.value = '';
}

function setBankManualBalance() {
    const v = prompt('Сколько сейчас денег на счёте (₸)?', uiPrefs.bank.balance !== null ? String(uiPrefs.bank.balance) : '');
    if (v === null) return;
    const n = bankNum(v);
    if (!Number.isFinite(n)) { alert('Введите число, например 150000'); return; }
    applyBankData({ ops: [], balance: n, balanceDate: almatyIsoNow().slice(0, 10) }, 'manual');
}

function setBankPref(key, value) {
    if (key === 'name') uiPrefs.bank.name = BANKS.some(b => b.id === value) ? value : 'other';
    else uiPrefs.bank[key] = Math.max(0, bankNum(value) || 0);
    commitUiPrefs();
    renderBank();
}

// Операции из выписки — в «Записи» (повторы пропускаются: та же дата, сумма и тип)
function importBankOps() {
    if (!bankOps.length) { alert('Сначала загрузите выписку.'); return; }
    const exists = new Set(transactions.map(t => `${getTxDateStr(t.date)}|${t.type}|${Math.round(t.amount * 100)}`));
    const fresh = [];
    let skipped = 0;
    bankOps.forEach((o, i) => {
        const key = `${o.date}|${o.type}|${Math.round(o.amount * 100)}`;
        if (!o.date || exists.has(key)) { skipped++; return; }
        exists.add(key);
        const tx = { id: 'bk' + Date.now().toString(36) + i, type: o.type, amount: o.amount, category: o.kind || (o.type === 'income' ? 'Пополнение' : 'Покупки'), date: o.date + 'T12:00', fromBank: bankInfo().name };
        if (o.details) tx.comment = o.details;
        fresh.push(tx);
    });
    if (!fresh.length) { alert('Все операции выписки уже есть в «Записях».'); return; }
    if (!confirm(`Добавить в «Записи» ${fresh.length} операций из выписки?` + (skipped ? `\nПропущено ${skipped} — такие записи уже есть.` : ''))) return;
    transactions.push(...fresh);
    bankOps = [];
    updateUI(true);
    showToast(`Добавлено записей: ${fresh.length}`);
}

// ---------- Предупреждения ----------
function appBalance() {
    return transactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
}

function bankWarnings() {
    const bp = uiPrefs.bank;
    const out = [];
    if (bp.balance !== null && bp.low > 0 && bp.balance < bp.low) out.push(`На счёте ${fmtTenge(bp.balance)} — меньше вашего порога ${fmtTenge(bp.low)}.`);
    if (bp.balance !== null && bp.balance < 0) out.push(`На счёте минус: ${fmtTenge(bp.balance)}.`);
    if (bp.big > 0 && bp.summary && bp.summary.biggest) {
        bp.summary.biggest.filter(o => o.amount >= bp.big).forEach(o => out.push(`Крупная трата ${fmtTenge(o.amount)}${o.details ? ' — ' + o.details : ''} (${o.date ? shortDate(o.date) : ''}).`));
    }
    if (bp.summary && bp.summary.expense > bp.summary.income * 1.2 && bp.summary.income > 0) out.push(`По выписке расходы (${fmtTenge(bp.summary.expense)}) больше доходов (${fmtTenge(bp.summary.income)}).`);
    if (bp.balanceAt) {
        const days = Math.round((Date.now() - almatyMs(bp.balanceAt.slice(0, 10) + 'T12:00')) / 86400000);
        if (days > 14) out.push(`Остаток не обновлялся ${days} дн. — загрузите свежую выписку.`);
    }
    return out;
}

// Раз в день напоминает о проблемах со счётом (вызывается из js/notify.js)
function checkBankAlerts() {
    if (!uiPrefs.notify.bank || uiPrefs.bank.balance === null) return;
    const w = bankWarnings();
    if (!w.length) return;
    const key = 'bank:' + almatyIsoNow().slice(0, 10);
    if (readFired()[key] || almatyHour() < 10) return;
    markFired(key);
    showNotice(`${bankInfo().name}: проверьте счёт`, w[0], 'bank');
}

// ---------- Блок в «Статистике» ----------
function renderBank() {
    const box = document.getElementById('bank-box');
    if (!box) return;
    const bp = uiPrefs.bank;
    const info = bankInfo();
    const s = bp.summary;
    const diff = bp.balance !== null ? bp.balance - appBalance() : null;
    const warn = bankWarnings();
    const typed = (document.getElementById('bank-text') || {}).value || ''; // не терять вставленный текст при обновлении
    const statusText = (document.getElementById('bank-status') || {}).textContent || '';
    const srcText = { pdf: 'из выписки', message: 'из уведомления банка', manual: 'введено вручную' }[bp.source] || '';
    box.innerHTML = `
        <label class="field-inline"><span>Банк</span>
            <select onchange="setBankPref('name', this.value)">${BANKS.map(b => `<option value="${b.id}" ${b.id === info.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select>
        </label>
        <div class="bank-balance">
            <span class="kpi-label">На счёте в ${escapeHtml(info.name)}</span>
            <b class="${bp.balance !== null && bp.balance < (bp.low || 0) ? 'amount-expense' : ''}">${bp.balance !== null ? fmtTenge(bp.balance) : '—'}</b>
            <small>${bp.balanceAt ? `на ${shortDate(bp.balanceAt.slice(0, 10))}.${bp.balanceAt.slice(2, 4)}${bp.balanceAt.length > 10 ? ' ' + bp.balanceAt.slice(11, 16) : ''} · ${srcText}` : 'загрузите выписку или вставьте уведомление банка'}</small>
            ${diff !== null && Math.abs(diff) >= 1 ? `<small>Баланс в приложении: ${fmtTenge(appBalance())} (${diff > 0 ? 'в банке больше на ' : 'в банке меньше на '}${fmtTenge(Math.abs(diff))})</small>` : ''}
        </div>
        ${warn.length ? `<div class="bank-warn">${warn.map(w => `<p><span class="material-icons">warning</span> ${escapeHtml(w)}</p>`).join('')}</div>` : (bp.balance !== null ? '<p class="bank-ok"><span class="material-icons">verified</span> Всё в порядке</p>' : '')}
        ${s ? `<div class="kpi-grid bank-kpi">
            <div class="kpi"><span class="kpi-label">Период выписки</span><span class="kpi-value">${s.from ? shortDate(s.from) : '—'} – ${s.to ? shortDate(s.to) : '—'}</span></div>
            <div class="kpi"><span class="kpi-label">Пополнения</span><span class="kpi-value amount-income">${fmtTenge(s.income)}</span></div>
            <div class="kpi"><span class="kpi-label">Траты</span><span class="kpi-value amount-expense">${fmtTenge(s.expense)}</span></div>
            <div class="kpi"><span class="kpi-label">Операций</span><span class="kpi-value">${s.count}</span></div>
        </div>
        ${s.top && s.top.length ? `<p class="hint">Больше всего потрачено: ${s.top.map(([k, v]) => `${escapeHtml(k)} — ${fmtTenge(v)}`).join('; ')}</p>` : ''}` : ''}
        ${bankOps.length ? `<button type="button" class="btn-primary btn-block" onclick="importBankOps()"><span class="material-icons">playlist_add</span> Добавить операции выписки в «Записи» (${bankOps.length})</button>` : ''}
        <p class="hint bank-how"><b>Как получить выписку:</b> ${escapeHtml(info.hint)}</p>
        <div class="btn-group">
            <label class="btn-primary bank-file-btn"><span class="material-icons">picture_as_pdf</span> Загрузить выписку (PDF)
                <input type="file" accept="application/pdf,.pdf" onchange="bankFromPdf(event)">
            </label>
            <button type="button" class="btn-secondary" onclick="setBankManualBalance()"><span class="material-icons">edit</span> Ввести остаток</button>
        </div>
        <p class="hint" id="bank-status" aria-live="polite"></p>
        <textarea id="bank-text" rows="2" placeholder="Или вставьте текст уведомления банка: «Покупка 2 500 ₸ MAGNUM. Доступно 15 300 ₸»"></textarea>
        <button type="button" class="btn-secondary btn-block" onclick="bankFromText()"><span class="material-icons">sms</span> Разобрать уведомление</button>
        <div class="bank-limits">
            <label class="field-inline"><span>Предупредить, если на счёте меньше, ₸</span><input type="number" min="0" value="${bp.low || ''}" placeholder="например 20000" onchange="setBankPref('low', this.value)"></label>
            <label class="field-inline"><span>…или если трата больше, ₸</span><input type="number" min="0" value="${bp.big || ''}" placeholder="например 50000" onchange="setBankPref('big', this.value)"></label>
        </div>
        <p class="hint bank-safe"><span class="material-icons inline-icon">lock</span> Банки Казахстана не дают сторонним приложениям прямой доступ к счёту, а вводить логин и пароль банка в чужие приложения опасно — поэтому My Money их никогда не спрашивает. Выписка и уведомления разбираются прямо на этом устройстве.</p>`;
    document.getElementById('bank-text').value = typed;
    document.getElementById('bank-status').textContent = statusText;
}
