// --- КОММЕНТАРИИ К ЗАПИСЯМ, РАЗДЕЛ OLDBOOK, РАЗВОРАЧИВАНИЕ ОКОН ---
// Обмен книгами Oldbook между аккаунтами Google — js/cloud.js (раздел OLDBOOK).

const COMMENT_MAX = 100;
const OB_PERSONS = ['Катя', 'Папа', 'Саша'];
const OB_PERSON_COLORS = { 'Катя': '#800080', 'Папа': '#000080', 'Саша': '#008080' };

// ---------- Комментарий (до 100 символов) ----------
// prefix: 'tx' — форма «Записи», 'ob' — форма Oldbook. Текст хранится в скрытом поле `${prefix}-comment`.
function getFormComment(prefix) {
    const el = document.getElementById(prefix + '-comment');
    return el ? el.value.trim().slice(0, COMMENT_MAX) : '';
}

function setFormComment(prefix, text) {
    const el = document.getElementById(prefix + '-comment');
    if (el) el.value = String(text || '').slice(0, COMMENT_MAX);
    const btn = document.getElementById(prefix + '-comment-btn');
    if (!btn) return;
    const label = btn.querySelector('.comment-btn-text');
    const value = el ? el.value : '';
    btn.classList.toggle('has-comment', !!value);
    if (label) label.textContent = value ? '«' + value + '»' : 'Комментарий';
}

function openCommentDialog(prefix) {
    closeCommentDialog(false);
    const current = getFormComment(prefix);
    const overlay = document.createElement('div');
    overlay.id = 'comment-dialog';
    overlay.className = 'export-sheet-overlay comment-dialog-overlay';
    overlay.innerHTML = `
        <div class="export-sheet comment-dialog" role="dialog" aria-modal="true" aria-label="Комментарий">
            <div class="export-sheet-head">
                <h3>Комментарий к записи</h3>
                <button type="button" class="export-sheet-close" data-act="cancel" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <textarea id="comment-text" class="comment-text" maxlength="${COMMENT_MAX}" rows="3" placeholder="Например: подарок маме на день рождения">${escapeHtml(current)}</textarea>
            <div class="comment-counter"><span id="comment-count">${current.length}</span> / ${COMMENT_MAX}</div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="ok"><span class="material-icons">check</span> ОК</button>
                <button type="button" class="btn-secondary" data-act="clear"><span class="material-icons">backspace</span> Очистить</button>
                <button type="button" class="btn-secondary" data-act="cancel">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const area = overlay.querySelector('#comment-text');
    const count = overlay.querySelector('#comment-count');
    area.addEventListener('input', () => {
        if (area.value.length > COMMENT_MAX) area.value = area.value.slice(0, COMMENT_MAX);
        count.textContent = area.value.length;
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeCommentDialog(true); return; }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'ok') {
            setFormComment(prefix, area.value.replace(/\s+/g, ' ').trim());
            closeCommentDialog(true);
        } else if (btn.dataset.act === 'clear') {
            area.value = '';
            count.textContent = '0';
            area.focus();
        } else {
            closeCommentDialog(true);
        }
    });
    if (typeof playSound === 'function') playSound('open');
    setTimeout(() => area.focus(), 50);
}

function closeCommentDialog(withSound) {
    const el = document.getElementById('comment-dialog');
    if (!el) return;
    el.remove();
    if (withSound && typeof playSound === 'function') playSound('close');
}

// ---------- Разворачивание окна на весь экран (кнопка □ в заголовке) ----------
function toggleMaximize(btn) {
    const card = btn.closest('.card');
    if (!card) return;
    const maximized = !card.classList.contains('is-maximized');
    card.classList.toggle('is-maximized', maximized);
    document.body.classList.toggle('has-maximized', maximized);
    btn.setAttribute('aria-label', maximized ? 'Восстановить размер' : 'Развернуть на весь экран');
    btn.title = maximized ? 'Восстановить' : 'Развернуть';
    if (typeof playSound === 'function') playSound(maximized ? 'open' : 'close');
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const max = document.querySelector('.card.is-maximized .w95-ctl-max');
    if (max) { toggleMaximize(max); return; }
    if (document.getElementById('comment-dialog')) closeCommentDialog(true);
});

// ---------- Форма Oldbook ----------
let obSelectedPerson = '';
let obAmountDigits = '';
let obEditId = '';

function selectObPerson(btn) {
    obSelectedPerson = btn.dataset.person;
    document.querySelectorAll('#ob-persons .icon-btn').forEach(b => b.classList.toggle('selected', b === btn));
}

// Цифровая клавиатура: сумма вводится без системной клавиатуры телефона
function obKey(key) {
    if (key === 'back') obAmountDigits = obAmountDigits.slice(0, -1);
    else if (key === 'clear') obAmountDigits = '';
    else if (/^\d+$/.test(key)) {
        if (obAmountDigits === '' && /^0+$/.test(key)) return; // без ведущих нулей
        obAmountDigits = (obAmountDigits + key).slice(0, 10);
    }
    renderObAmount();
}

function renderObAmount() {
    const el = document.getElementById('ob-amount-display');
    if (!el) return;
    const value = Number(obAmountDigits || 0);
    el.textContent = value.toLocaleString('ru-RU') + ' ₸';
    el.classList.toggle('is-empty', !obAmountDigits);
}

function resetObForm() {
    obAmountDigits = '';
    obEditId = '';
    renderObAmount();
    const cat = document.getElementById('ob-category');
    if (cat) cat.value = '';
    const dt = document.getElementById('ob-datetime');
    if (dt) dt.value = almatyIsoNow();
    setFormComment('ob', '');
    const add = document.getElementById('ob-add-btns');
    const save = document.getElementById('ob-save-edit');
    if (add) add.style.display = '';
    if (save) save.style.display = 'none';
}

function readObForm() {
    const category = (document.getElementById('ob-category') || {}).value || '';
    const date = (document.getElementById('ob-datetime') || {}).value || '';
    const amount = Number(obAmountDigits || 0);
    if (!obSelectedPerson) { alert('Выберите, кто: Катя, Папа или Саша.'); return null; }
    if (!amount) { alert('Наберите сумму на цифровой клавиатуре.'); return null; }
    if (!category.trim()) { alert('Укажите категорию (на что).'); return null; }
    if (!date) { alert('Укажите дату и время.'); return null; }
    return { person: obSelectedPerson, amount, category: category.trim().slice(0, 60), date, comment: getFormComment('ob') };
}

function saveObEntry(type) {
    const data = readObForm();
    if (!data) return;
    const entry = { id: 'ob' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, ...data };
    if (!entry.comment) delete entry.comment;
    oldbookEntries.push(entry);
    resetObForm();
    updateUI(true);
    showToast(`${type === 'income' ? 'Доход' : 'Расход'} записан: ${entry.person}, ${fmtMoney(entry.amount)} ₸`);
}

function editObEntry(id) {
    const e = oldbookEntries.find(x => x.id === id);
    if (!e) return;
    obEditId = id;
    obAmountDigits = String(Math.round(Number(e.amount) || 0));
    renderObAmount();
    const btn = document.querySelector(`#ob-persons .icon-btn[data-person="${e.person}"]`);
    if (btn) selectObPerson(btn);
    document.getElementById('ob-category').value = e.category || '';
    document.getElementById('ob-datetime').value = e.date || almatyIsoNow();
    setFormComment('ob', e.comment || '');
    document.getElementById('ob-add-btns').style.display = 'none';
    document.getElementById('ob-save-edit').style.display = '';
    const card = document.querySelector('.ob-history-card.is-maximized .w95-ctl-max');
    if (card) toggleMaximize(card);
    document.getElementById('ob-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveObEdit() {
    const e = oldbookEntries.find(x => x.id === obEditId);
    const data = readObForm();
    if (!e || !data) return;
    Object.assign(e, data);
    if (!e.comment) delete e.comment;
    resetObForm();
    updateUI(true);
}

function deleteObEntry(id) {
    if (!confirm('Удалить запись из Oldbook?')) return;
    oldbookEntries = oldbookEntries.filter(x => x.id !== id);
    updateUI(true);
}

// ---------- Все записи Oldbook: свои + книги других пользователей ----------
function allOldbookEntries() {
    const list = oldbookEntries.map(e => ({ ...e, own: true, ownerName: 'Вы' }));
    const cache = typeof oldbookRemoteCache === 'function' ? oldbookRemoteCache() : {};
    oldbookLinks.forEach(link => {
        const c = cache[link.id];
        if (!c || !Array.isArray(c.entries)) return;
        c.entries.forEach(e => {
            if (e && e.id) list.push({ ...e, own: false, ownerName: c.ownerName || c.owner || 'Другой пользователь' });
        });
    });
    return list;
}

function obPeriodStart(todayStr) {
    const sel = document.getElementById('ob-stats-period');
    const period = sel ? sel.value : 'month';
    if (period === '7') return almatyIsoNow(-6).slice(0, 10);
    if (period === '30') return almatyIsoNow(-29).slice(0, 10);
    if (period === 'month') return todayStr.slice(0, 8) + '01';
    if (period === 'year') return todayStr.slice(0, 5) + '01-01';
    return '';
}

function renderOldbook() {
    renderObAmount();
    renderObList();
    renderObStats();
    renderObLinks();
}

function renderObList() {
    const box = document.getElementById('ob-list');
    if (!box) return;
    const filter = (document.getElementById('ob-filter-person') || {}).value || '';
    const items = allOldbookEntries()
        .filter(e => !filter || e.person === filter)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const inc = items.filter(e => e.type === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const exp = items.filter(e => e.type !== 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totals = document.getElementById('ob-totals');
    if (totals) {
        totals.innerHTML = `<span class="amount-income">+${fmtMoney(inc)} ₸</span>` +
            `<span class="amount-expense">−${fmtMoney(exp)} ₸</span>` +
            `<span>Итог: <b>${fmtMoney(inc - exp)} ₸</b></span>`;
    }

    if (!items.length) {
        box.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">Записей пока нет</p>';
        return;
    }
    let lastDate = '';
    box.innerHTML = items.map(e => {
        const [d, t] = String(e.date || '').split('T');
        let head = '';
        if (d !== lastDate) {
            lastDate = d;
            const p = d.split('-');
            head = `<div class="date-group-header ob-date"><h4>${p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : escapeHtml(d)}</h4></div>`;
        }
        const isInc = e.type === 'income';
        const color = OB_PERSON_COLORS[e.person] || '#404040';
        return head + `
            <div class="tx-item ob-item ${isInc ? 'income' : 'expense'}">
                <div class="tx-info">
                    <span class="ob-person" style="background:${color}">${escapeHtml(e.person || '—')}</span>
                    <strong>${escapeHtml(e.category || 'Без категории')}</strong><br>
                    <span class="ob-meta">${escapeHtml(t || '')} · книга: ${escapeHtml(e.ownerName)}</span>
                    ${e.comment ? `<span class="tx-comment">${escapeHtml(e.comment)}</span>` : ''}
                </div>
                <strong class="tx-amount ${isInc ? 'amount-income' : 'amount-expense'}">${isInc ? '+' : '−'}${fmtMoney(e.amount)} ₸</strong>
                ${e.own ? `<div class="tx-actions">
                    <button type="button" onclick="editObEntry('${escapeHtml(e.id)}')" aria-label="Изменить"><span class="material-icons">edit</span></button>
                    <button type="button" onclick="deleteObEntry('${escapeHtml(e.id)}')" aria-label="Удалить"><span class="material-icons" style="color:#d32f2f;">delete</span></button>
                </div>` : ''}
            </div>`;
    }).join('');
}

// Три диаграммы: кто сколько потратил, на что тратил каждый, доходы и расходы по людям; плюс «зачем» — крупные траты с комментариями
function renderObStats() {
    if (!document.getElementById('ob-person-chart')) return;
    const todayStr = almatyIsoNow().slice(0, 10);
    const start = obPeriodStart(todayStr);
    const list = allOldbookEntries().filter(e => {
        const d = String(e.date || '').slice(0, 10);
        return d >= start && d <= todayStr;
    });
    const expenses = list.filter(e => e.type !== 'income');
    const sumBy = (arr, fn) => arr.reduce((acc, e) => { const k = fn(e); acc[k] = (acc[k] || 0) + (Number(e.amount) || 0); return acc; }, {});

    // 1) Кто сколько потратил
    const byPerson = sumBy(expenses, e => e.person || '—');
    const persons = OB_PERSONS.concat(Object.keys(byPerson).filter(p => !OB_PERSONS.includes(p)));
    const hasExp = expenses.length > 0;
    if (typeof upsertChart === 'function') {
        upsertChart('obPerson', 'ob-person-chart', {
            type: 'doughnut',
            data: {
                labels: hasExp ? persons : ['Нет данных'],
                datasets: [{
                    data: hasExp ? persons.map(p => byPerson[p] || 0) : [1],
                    backgroundColor: hasExp ? persons.map(p => OB_PERSON_COLORS[p] || '#808080') : ['#c0c0c0'],
                    borderWidth: 1, borderColor: '#000'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom' }, tooltip: { enabled: hasExp } } }
        });

        // 2) На что тратил каждый (категории, сложенные по людям)
        const byCat = sumBy(expenses, e => e.category || 'Без категории');
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 7).map(c => c[0]);
        upsertChart('obCategory', 'ob-category-chart', {
            type: 'bar',
            data: {
                labels: cats.length ? cats : ['Нет данных'],
                datasets: persons.map(p => ({
                    label: p,
                    data: cats.map(c => expenses.filter(e => e.person === p && (e.category || 'Без категории') === c).reduce((s, e) => s + (Number(e.amount) || 0), 0)),
                    backgroundColor: OB_PERSON_COLORS[p] || '#808080',
                    borderWidth: 1, borderColor: '#000', borderRadius: 0
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { position: 'bottom' } },
                scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true, grid: { display: false } } }
            }
        });

        // 3) Доходы и расходы по людям
        const incomes = list.filter(e => e.type === 'income');
        const incBy = sumBy(incomes, e => e.person || '—');
        upsertChart('obBalance', 'ob-balance-chart', {
            type: 'bar',
            data: {
                labels: persons,
                datasets: [
                    { label: 'Доход', data: persons.map(p => incBy[p] || 0), backgroundColor: STAT_COLORS.income, borderWidth: 1, borderColor: '#000', borderRadius: 0 },
                    { label: 'Расход', data: persons.map(p => byPerson[p] || 0), backgroundColor: STAT_COLORS.expense, borderWidth: 1, borderColor: '#000', borderRadius: 0 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
        });
    }

    // «Зачем»: самые крупные траты периода с комментариями
    const why = document.getElementById('ob-why-list');
    if (why) {
        const top = [...expenses].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 6);
        why.innerHTML = top.length ? top.map(e => `
            <div class="ob-why-row">
                <span class="ob-person" style="background:${OB_PERSON_COLORS[e.person] || '#404040'}">${escapeHtml(e.person || '—')}</span>
                <span class="ob-why-text"><b>${escapeHtml(e.category || '')}</b>${e.comment ? ` — <i>${escapeHtml(e.comment)}</i>` : ''}</span>
                <span class="amount-expense ob-why-sum">${fmtMoney(e.amount)} ₸</span>
            </div>`).join('') : '<p class="hint" style="text-align:center;">Нет расходов за период</p>';
    }
}

// Подключённые книги других пользователей
function renderObLinks() {
    const box = document.getElementById('ob-links');
    if (!box) return;
    const cache = typeof oldbookRemoteCache === 'function' ? oldbookRemoteCache() : {};
    if (!oldbookLinks.length) {
        box.innerHTML = '<p class="hint">Вы пока не подключили книги других пользователей.</p>';
        return;
    }
    box.innerHTML = oldbookLinks.map(link => {
        const c = cache[link.id] || {};
        const name = c.ownerName || c.owner || 'Загружается…';
        const info = c.error ? `<span class="ob-link-error">${escapeHtml(c.error)}</span>`
            : `<span class="hint">${(c.entries || []).length} записей${c.owner ? ' · ' + escapeHtml(c.owner) : ''}</span>`;
        return `<div class="ob-share-row"><span class="material-icons">menu_book</span>
            <span class="ob-share-email"><b>${escapeHtml(name)}</b><br>${info}</span>
            <button type="button" class="btn-secondary" onclick="removeOldbookLink('${escapeHtml(link.id)}')">Отключить</button></div>`;
    }).join('');
}

function onOldbookTabShown() {
    const dt = document.getElementById('ob-datetime');
    if (dt && !dt.value) dt.value = almatyIsoNow();
    renderOldbook();
    if (typeof renderOldbookShares === 'function') renderOldbookShares();
}
