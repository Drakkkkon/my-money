// --- АДМИНИСТРАТОР И ЖУРНАЛ ДЕЙСТВИЙ ---
// 1) Администратор — аккаунт Google из ADMIN_EMAILS. Только ему видны каталог OldBook.kz на «Стене» (блок с атрибутом
//    data-admin-only, css/v4.css) и блок «Администратор: пользователи» в Настройках. Это скрывает интерфейс на устройстве; настоящая защита списка
//    пользователей — на сервере журнала: он принимает только проверенный токен Google и отдаёт данные только администратору.
// 2) Журнал действий. У сайта нет своего сервера, поэтому журнал ведёт Google Apps Script с Таблицей администратора
//    (admin_server/Code.gs, инструкция ADMIN_SETUP_RU.txt; адрес — adminLogUrl в js/config.js). Отправка начинается ТОЛЬКО после
//    согласия пользователя (окно после входа через Google) и отключается в Настройках → «Журнал действий» с удалением его данных.
//    Передаётся: почта и имя из Google, открытые разделы, то, что вписано в строки поиска и ввода (каталог книг, цены, котировки,
//    ссылка на товар, название цели, список покупок), способ и итог распознавания фото, тип и категория новой записи.
//    НЕ передаётся: суммы, комментарии, баланс, названия подписок, пароли, ключи распознавания.

window.APP_VERSION = window.APP_VERSION || '4.12.3';
window.APP_VERSION_NAME = window.APP_VERSION_NAME || 'Экстра'; // название версии (подпись внизу Настроек)
window.APP_YEAR = window.APP_YEAR || 2026;                  // год обновления
const ADMIN_EMAILS = ['lego2009as@gmail.com'];
const ADMIN_CONSENT_KEY = 'finance_activity_consent'; // 'yes' | 'no'
const ADMIN_QUEUE_KEY = 'finance_activity_queue';
const ADMIN_QUEUE_MAX = 300;
const ADMIN_BATCH = 50;

const ADMIN_EVENT_LABELS = { open: 'Открыл приложение', login: 'Вошёл через Google', tab: 'Открыл раздел', search: 'Ввёл в поиск',
    scan: 'Распознал фото', scan_fail: 'Сбой распознавания', voice: 'Голосовой ввод', voice_fail: 'Сбой голосового ввода', entry: 'Новая запись' };
const ADMIN_FIELD_LABELS = { 'obc-number': 'Каталог OldBook.kz: номер книги', 'obc-text': 'Каталог OldBook.kz: название/автор', 'quote-search-input': 'Котировки',
    'pr-search': 'Цены', 'goal-url': 'Цели: ссылка на товар', 'goal-title': 'Цели: название', 'shop-input': 'Список покупок' };
const ADMIN_TAB_NAMES = { transactions: 'Записи', wall: 'Стена', subscriptions: 'Подписки', salary: 'Зарплата', statistics: 'Статистика',
    reports: 'Отчёты', wishlist: 'Цели', quotes: 'Котировки', prices: 'Цены', settings: 'Настройки' };

function isAdminUser() {
    try {
        const email = (typeof cloudUser !== 'undefined' && cloudUser && cloudUser.email) ? String(cloudUser.email).trim().toLowerCase() : '';
        return !!email && ADMIN_EMAILS.includes(email);
    } catch (e) { return false; }
}

function applyAdminAccess() {
    const admin = isAdminUser();
    document.documentElement.setAttribute('data-admin', admin ? '1' : '0');
    renderActivitySettings();
    renderAdminPanel();
    adminAskConsent();
}

// ---------- Адрес сервера и согласие ----------
function adminLogUrl() {
    const u = window.MONEY_CONFIG && window.MONEY_CONFIG.adminLogUrl;
    return typeof u === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim()) ? u.trim() : '';
}
function adminConsent() { try { return localStorage.getItem(ADMIN_CONSENT_KEY) || ''; } catch (e) { return ''; } }
function adminSetConsent(v) { try { localStorage.setItem(ADMIN_CONSENT_KEY, v); } catch (e) {} }
function adminLoggingOn() { return !!adminLogUrl() && adminConsent() === 'yes' && typeof cloudUser !== 'undefined' && !!cloudUser; }

// ---------- Очередь событий ----------
function adminQueue() { try { const q = JSON.parse(localStorage.getItem(ADMIN_QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
function adminSaveQueue(q) { try { localStorage.setItem(ADMIN_QUEUE_KEY, JSON.stringify(q.slice(-ADMIN_QUEUE_MAX))); } catch (e) {} }
// Белый список полей: только они уходят в журнал. Сумм, комментариев, баланса и т. п. здесь нет и быть не может
const ADMIN_ALLOWED_KEYS = ['field', 'text', 'id', 'kind', 'engine', 'ms', 'ok', 'items', 'code', 'type', 'category', 'via'];
function adminClean(data) {
    const out = {};
    ADMIN_ALLOWED_KEYS.forEach(k => {
        const v = (data || {})[k];
        if (typeof v === 'string') out[k] = v.replace(/\s+/g, ' ').trim().slice(0, 200);
        else if (typeof v === 'number' && Number.isFinite(v) || typeof v === 'boolean') out[k] = v;
    });
    return out;
}

let adminFlushTimer = null, adminFlushing = false;
function adminLog(type, data) {
    if (!adminLoggingOn() || !ADMIN_EVENT_LABELS[type]) return;
    const q = adminQueue();
    q.push({ t: Date.now(), type, data: adminClean(data) });
    adminSaveQueue(q);
    clearTimeout(adminFlushTimer);
    adminFlushTimer = setTimeout(adminFlush, 4000);
}
async function adminFlush() {
    if (adminFlushing || !adminLoggingOn() || typeof hasValidToken !== 'function' || !hasValidToken()) return; // без свежего входа сервер не узнает, чьи события
    let q = adminQueue();
    if (!q.length) return;
    adminFlushing = true;
    try {
        while (q.length) {
            const batch = q.slice(0, ADMIN_BATCH);
            const r = await adminCall('log', { name: (cloudUser && cloudUser.name) || '', events: batch, v: window.APP_VERSION });
            if (!r || !r.ok) break;
            q = adminQueue().slice(batch.length);
            adminSaveQueue(q);
        }
    } catch (e) { console.warn('Журнал действий: не отправлен', e); } finally { adminFlushing = false; }
}
// text/plain — чтобы браузер не делал предварительный запрос (Apps Script его не обрабатывает)
async function adminCall(action, extra) {
    const url = adminLogUrl();
    if (!url) throw new Error('Адрес сервера журнала не указан в js/config.js');
    if (typeof hasValidToken !== 'function' || !hasValidToken()) throw new Error('Нужен свежий вход Google: Настройки → «Продолжить синхронизацию»');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: googleAccessToken, ...(extra || {}) }) });
    if (!res.ok) throw new Error('Сервер журнала ответил HTTP ' + res.status);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'ошибка сервера журнала');
    return j;
}

// ---------- Что вписывают в строки поиска (после паузы в 1,6 с) ----------
const adminTyped = {};
function adminWatchInputs() {
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el || !el.id || !ADMIN_FIELD_LABELS[el.id]) return;
        clearTimeout(adminTyped[el.id]);
        adminTyped[el.id] = setTimeout(() => {
            const v = String(el.value || '').replace(/\s+/g, ' ').trim();
            if (v.length < 2 || adminTyped[el.id + ':last'] === v) return;
            adminTyped[el.id + ':last'] = v;
            adminLog('search', { field: el.id, text: v });
        }, 1600);
    }, true);
}

// ---------- Новые записи: только тип и категория (без сумм и комментариев) ----------
const adminSeen = new Set();
let adminSeenReady = false;
function adminScanEntries() {
    try {
        if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return;
        const now = Date.now();
        transactions.forEach(tx => {
            const id = String(tx && tx.id);
            if (adminSeen.has(id)) return;
            adminSeen.add(id);
            if (!adminSeenReady || tx.isSystem) return;
            const n = Number(id);
            if (Number.isFinite(n) && now - n < 120000) adminLog('entry', { type: tx.type, category: tx.category, via: tx.fromReceipt ? 'receipt' : (tx.goalId ? 'goal' : 'form') }); // записи с других устройств — старые
        });
        adminSeenReady = true;
    } catch (e) {}
}
function adminHookUpdateUi() {
    if (typeof window.updateUI !== 'function' || window.updateUI._adminHooked) return;
    const orig = window.updateUI;
    const wrapped = function (...args) { const r = orig.apply(this, args); adminScanEntries(); return r; };
    wrapped._adminHooked = true;
    window.updateUI = wrapped;
}

// ---------- Окно согласия ----------
function adminAskConsent() {
    if (!adminLogUrl() || adminConsent() || typeof cloudUser === 'undefined' || !cloudUser || document.getElementById('activity-consent')) return;
    const overlay = document.createElement('div');
    overlay.id = 'activity-consent';
    overlay.className = 'export-sheet-overlay';
    overlay.innerHTML = `
        <div class="export-sheet activity-consent" role="dialog" aria-modal="true" aria-label="Журнал действий">
            <div class="export-sheet-head"><h3>Журнал действий</h3></div>
            <p>Владелец приложения (администратор) может видеть, кто и как им пользуется.</p>
            <p><b>Передаётся:</b> почта и имя из Google; какие разделы открываете; что вписываете в строки поиска и ввода (каталог книг, цены, котировки, ссылка на товар, название цели, список покупок); каким способом распознано фото и получилось ли; тип и категория новой записи.</p>
            <p><b>Не передаётся:</b> суммы, комментарии, баланс, названия подписок, пароли и ключи.</p>
            <p>Отключить журнал и удалить свои данные на сервере можно в любой момент: Настройки → «Журнал действий». При «Не согласен» приложение работает так же, но ничего не отправляется.</p>
            <div class="btn-group">
                <button type="button" class="btn-primary" data-act="yes"><span class="material-icons">check</span> Согласен</button>
                <button type="button" class="btn-secondary" data-act="no">Не согласен</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        adminSetConsent(act.dataset.act === 'yes' ? 'yes' : 'no');
        overlay.remove();
        if (act.dataset.act === 'yes') { adminLog('login', {}); adminLog('open', {}); adminFlush(); }
        renderActivitySettings();
    });
    document.body.appendChild(overlay);
}

// ---------- Настройки → «Журнал действий» (у всех пользователей) ----------
function renderActivitySettings() {
    const card = document.getElementById('activity-card'), box = document.getElementById('activity-settings');
    if (!card || !box) return;
    card.hidden = !adminLogUrl() || typeof cloudUser === 'undefined' || !cloudUser;
    if (card.hidden) return;
    const on = adminConsent() === 'yes';
    box.innerHTML = `
        <p class="hint">Журнал передаётся администратору приложения только с вашего согласия. Сейчас: <b>${on ? 'включён' : 'выключен'}</b>.</p>
        <p class="hint">Передаётся: почта и имя из Google, открытые разделы, то, что вписано в строки поиска и ввода, способ и итог распознавания фото, тип и категория новых записей. Суммы, комментарии, баланс, пароли и ключи — нет.</p>
        ${on ? '<button type="button" class="btn-secondary btn-block" onclick="adminRevoke()"><span class="material-icons">block</span> Отключить и удалить мои данные на сервере</button>'
             : '<button type="button" class="btn-primary btn-block" onclick="adminEnable()"><span class="material-icons">check</span> Включить журнал</button>'}
        <p class="hint" id="activity-status" aria-live="polite"></p>`;
}
function adminEnable() { adminSetConsent('yes'); adminLog('open', {}); adminFlush(); renderActivitySettings(); }
async function adminRevoke() {
    if (!confirm('Отключить журнал и удалить свои данные в журнале администратора?')) return;
    adminSetConsent('no');
    adminSaveQueue([]);
    let msg = 'Журнал отключён, ваши данные на сервере удалены.';
    try { await adminCall('forget_me', {}); } catch (e) { msg = 'Журнал отключён. Удалить данные на сервере не удалось: ' + (e.message || e) + '. Нажмите «Продолжить синхронизацию» и повторите.'; }
    renderActivitySettings();
    const st = document.getElementById('activity-status');
    if (st) st.textContent = msg;
}

// ---------- Настройки → «Администратор: пользователи» ----------
let adminUsers = [], adminSelected = '', adminEventsCache = [];
function adminTime(ms) {
    try { return formatAlmaty({ day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(Number(ms))); } catch (e) { return ''; }
}
function adminSetStatus(t) { const el = document.getElementById('admin-status'); if (el) el.textContent = t || ''; }

function renderAdminPanel() {
    const card = document.getElementById('admin-card'), box = document.getElementById('admin-panel');
    if (!card || !box) return;
    card.hidden = !isAdminUser();
    if (card.hidden) return;
    if (!adminLogUrl()) {
        box.innerHTML = '<p class="hint">Журнал не подключён. Создайте сервер по инструкции <b>ADMIN_SETUP_RU.txt</b> и впишите его адрес в js/config.js (поле adminLogUrl). Пока адреса нет, каталог OldBook.kz работает, а список пользователей пуст.</p>';
        return;
    }
    box.innerHTML = `
        <div class="btn-group">
            <button type="button" class="btn-primary" onclick="adminLoad()"><span class="material-icons">refresh</span> Обновить</button>
            <button type="button" class="btn-secondary" onclick="adminExportCsv()"><span class="material-icons">download</span> Скачать CSV</button>
        </div>
        <p class="hint" id="admin-status" aria-live="polite"></p>
        <div class="admin-users" id="admin-users"></div>
        <div class="admin-events" id="admin-events"></div>`;
    renderAdminUsers();
    renderAdminEvents();
}
async function adminLoad() {
    adminSetStatus('Загружаем…');
    try {
        const r = await adminCall('users', {});
        adminUsers = Array.isArray(r.users) ? r.users : [];
        adminSetStatus(`Пользователей: ${adminUsers.length}`);
        renderAdminUsers();
        if (adminSelected) await adminLoadEvents(adminSelected);
    } catch (e) { adminSetStatus('Не удалось загрузить: ' + (e.message || e)); }
}
async function adminLoadEvents(email) {
    adminSelected = email || '';
    try { adminEventsCache = (await adminCall('events', { email: adminSelected, limit: 300 })).events || []; }
    catch (e) { adminEventsCache = []; adminSetStatus('Не удалось загрузить события: ' + (e.message || e)); }
    renderAdminUsers();
    renderAdminEvents();
}
function renderAdminUsers() {
    const el = document.getElementById('admin-users');
    if (!el) return;
    if (!adminUsers.length) { el.innerHTML = '<p class="hint">Нажмите «Обновить», чтобы загрузить список пользователей.</p>'; return; }
    el.innerHTML = `<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Почта</th><th>Имя</th><th>Последний раз</th><th>Входов</th><th>Событий</th></tr></thead><tbody>` +
        adminUsers.map((u, i) => `<tr class="${u.email === adminSelected ? 'is-on' : ''}" onclick="adminLoadEvents(adminUsers[${i}].email)">
            <td data-i18n-skip>${escapeHtml(u.email)}</td><td data-i18n-skip>${escapeHtml(u.name || '')}</td><td>${escapeHtml(adminTime(u.last))}</td><td>${Number(u.logins) || 0}</td><td>${Number(u.events) || 0}</td></tr>`).join('') +
        `</tbody></table></div><p class="hint">Нажмите на строку — увидите действия пользователя. <a href="#" onclick="adminLoadEvents('');return false;">Показать всех сразу</a></p>`;
}
function adminDescribe(ev) {
    const d = ev.data || {}, what = d.kind === 'cover' ? 'обложка' : 'чек';
    switch (ev.type) {
        case 'tab': return ADMIN_TAB_NAMES[d.id] || d.id || '';
        case 'search': return `${ADMIN_FIELD_LABELS[d.field] || d.field}: «${d.text || ''}»`;
        case 'scan': return `${what} · ${d.engine || ''}${d.ms ? ' · ' + (d.ms / 1000).toFixed(1) + ' с' : ''} · ${d.ok ? 'распознано' : 'не распознано'}${d.text ? ' · «' + d.text + '»' : ''}`;
        case 'scan_fail': return `${what} · ${d.engine || ''} · ${d.code || ''}`;
        case 'voice': return `${d.engine || ''}${d.ms ? ' · ' + (d.ms / 1000).toFixed(1) + ' с' : ''} · ${d.ok ? 'сумма найдена' : 'сумма не найдена'}`;
        case 'voice_fail': return `${d.engine || ''} · ${d.code || ''}`;
        case 'entry': return `${d.type === 'income' ? 'доход' : 'расход'} · категория «${d.category || ''}»${d.via && d.via !== 'form' ? ' · ' + d.via : ''}`;
        default: return '';
    }
}
function renderAdminEvents() {
    const el = document.getElementById('admin-events');
    if (!el) return;
    if (!adminEventsCache.length) { el.innerHTML = adminUsers.length ? '<p class="hint">Выберите пользователя в списке выше.</p>' : ''; return; }
    el.innerHTML = `<h4 class="font-sub">${adminSelected ? 'Действия: ' + escapeHtml(adminSelected) : 'Последние действия всех'}</h4><div class="admin-scroll admin-scroll-events"><table class="admin-table"><thead><tr><th>Когда</th>${adminSelected ? '' : '<th>Кто</th>'}<th>Что</th><th>Подробности</th></tr></thead><tbody>` +
        adminEventsCache.map(ev => `<tr><td>${escapeHtml(adminTime(ev.t))}</td>${adminSelected ? '' : `<td data-i18n-skip>${escapeHtml(ev.email || '')}</td>`}<td>${escapeHtml(ADMIN_EVENT_LABELS[ev.type] || ev.type)}</td><td data-i18n-skip>${escapeHtml(adminDescribe(ev))}</td></tr>`).join('') + '</tbody></table></div>';
}
function adminExportCsv() {
    const rows = [['Когда', 'Почта', 'Событие', 'Подробности']];
    adminEventsCache.forEach(ev => rows.push([adminTime(ev.t), ev.email || adminSelected, ADMIN_EVENT_LABELS[ev.type] || ev.type, adminDescribe(ev)]));
    if (rows.length === 1) { alert('Сначала загрузите события: «Обновить» и выберите пользователя или «Показать всех сразу».'); return; }
    const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'my_money_journal.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

window.addEventListener('DOMContentLoaded', () => { adminWatchInputs(); adminHookUpdateUi(); applyAdminAccess(); });
window.addEventListener('load', () => {
    adminScanEntries();
    applyAdminAccess();
    if (adminLoggingOn()) adminLog('open', {});
    setInterval(() => { if (adminQueue().length) adminFlush(); }, 60000);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') adminFlush(); });
