// --- УВЕДОМЛЕНИЯ ---
// • Подписки: напоминание заранее — за неделю, 3 дня, день, 3 часа, час или в момент списания.
//   Выбирается у каждой подписки (Подписки → 🔔) и по умолчанию для новых (Настройки → «Уведомления»).
// • Каждое утро в 9:00: «Доброе утро! Ваши цели: накопить на …».
// • В 23:00: Excel и PDF с записями за день сохраняются в выбранную папку (ПК: Chrome/Edge) или в «Загрузки».
// Важно: сайт без своего сервера не может разбудить телефон. Уведомления приходят, пока приложение открыто
// или свёрнуто и система его ещё не закрыла; пропущенные напоминания показываются при следующем открытии.
// Время — Алматы (UTC+5), как и во всём приложении.

const NOTIFY_FIRED_KEY = 'finance_notify_fired';
const NOTIFY_LOG_KEY = 'finance_notify_log';
const NOTIFY_OFFSETS = [
    { id: '1w', ms: 7 * 86400000, label: 'За неделю' },
    { id: '3d', ms: 3 * 86400000, label: 'За 3 дня' },
    { id: '1d', ms: 86400000, label: 'За 1 день' },
    { id: '3h', ms: 3 * 3600000, label: 'За 3 часа' },
    { id: '1h', ms: 3600000, label: 'За 1 час' },
    { id: '0', ms: 0, label: 'В момент списания' }
];
const MORNING_HOUR = 9;
const DAILY_EXPORT_HOUR = 23;

// ---------- Время Алматы ----------
function almatyMs(iso) { // 'YYYY-MM-DDTHH:MM' по Алматы → миллисекунды
    return Date.parse(iso + ':00Z') - ALMATY_UTC_OFFSET_HOURS * 3600000;
}

function almatyHour() {
    return Number(almatyIsoNow().slice(11, 13));
}

// ---------- Показ уведомления ----------
function notifySupported() {
    return 'Notification' in window;
}

function notifyPermission() {
    return notifySupported() ? Notification.permission : 'unsupported';
}

async function requestNotifyPermission() {
    if (!notifySupported()) { alert('Этот браузер не умеет показывать уведомления. На iPhone добавьте сайт на экран «Домой» (iOS 16.4+) и откройте оттуда.'); return; }
    try {
        const p = await Notification.requestPermission();
        if (p === 'granted') { showNotice('Уведомления включены', 'Так будут выглядеть напоминания My Money.', 'test'); }
        else if (p === 'denied') alert('Уведомления запрещены в настройках браузера. Разрешите их для этого сайта: значок замка в адресной строке → «Уведомления».');
    } catch (e) {}
    renderNotifySettings();
}

async function showNotice(title, body, tag) {
    const log = readNotifyLog();
    log.unshift({ t: Date.now(), title, body });
    try { localStorage.setItem(NOTIFY_LOG_KEY, JSON.stringify(log.slice(0, 30))); } catch (e) {}
    renderNotifyLog();
    let shown = false;
    if (notifyPermission() === 'granted') {
        const opts = { body, tag: 'mymoney-' + (tag || Date.now()), icon: 'images/icon-192.png', badge: 'images/icon-192.png', lang: 'ru', renotify: true };
        try {
            const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
            if (reg) { await reg.showNotification(title, opts); shown = true; }
        } catch (e) {}
        if (!shown) { try { new Notification(title, opts); shown = true; } catch (e) {} }
    }
    // В открытом приложении — ещё и всплывающая строка снизу
    if (document.visibilityState === 'visible') showToast(`${title} ${body}`);
    if (typeof playSound === 'function') playSound('open');
}

function readNotifyLog() {
    try { return JSON.parse(localStorage.getItem(NOTIFY_LOG_KEY) || '[]') || []; } catch (e) { return []; }
}

function readFired() {
    try { return JSON.parse(localStorage.getItem(NOTIFY_FIRED_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function markFired(key) {
    const f = readFired();
    f[key] = Date.now();
    const cutoff = Date.now() - 60 * 86400000;
    Object.keys(f).forEach(k => { if (f[k] < cutoff) delete f[k]; });
    try { localStorage.setItem(NOTIFY_FIRED_KEY, JSON.stringify(f)); } catch (e) {}
}

// ---------- Подписки ----------
function subTime(sub) {
    return /^\d{2}:\d{2}$/.test(sub.time || '') ? sub.time : '10:00';
}

function subReminders(sub) {
    return Array.isArray(sub.remind) ? sub.remind : uiPrefs.notify.subDefault;
}

// Ближайшее списание подписки (сегодня/позже), 'YYYY-MM-DDTHH:MM' по Алматы
function nextSubCharge(sub, fromMs = Date.now()) {
    const now = almatyIsoNow();
    let y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7)) - 1;
    for (let i = 0; i < 3; i++) {
        const last = new Date(Date.UTC(y, m + i + 1, 0)).getUTCDate();
        const d = new Date(Date.UTC(y, m + i, Math.min(Number(sub.day) || 1, last)));
        const iso = d.toISOString().slice(0, 10) + 'T' + subTime(sub);
        // списание считается «текущим» ещё 6 часов после времени списания
        if (almatyMs(iso) + 6 * 3600000 > fromMs) return iso;
    }
    return null;
}

function subPaidRecently(sub, chargeIso) {
    const from = almatyMs(chargeIso) - 10 * 86400000;
    return transactions.some(t => t.category === `Подписка: ${sub.name}` && almatyMs((t.date || '').length > 10 ? t.date : t.date + 'T00:00') >= from);
}

function checkSubReminders() {
    const now = Date.now();
    subscriptions.forEach(sub => {
        if (!sub || !sub.id) return;
        const charge = nextSubCharge(sub);
        if (!charge || subPaidRecently(sub, charge)) return;
        const chargeMs = almatyMs(charge);
        // из всех наступивших напоминаний показываем одно — самое позднее
        const due = NOTIFY_OFFSETS.filter(o => subReminders(sub).includes(o.id) && now >= chargeMs - o.ms && now < chargeMs + 6 * 3600000);
        if (!due.length) return;
        const o = due[due.length - 1];
        const key = `sub:${sub.id}:${charge}:${o.id}`;
        if (readFired()[key]) return;
        due.forEach(x => markFired(`sub:${sub.id}:${charge}:${x.id}`));
        const left = chargeMs - now;
        const day = charge.slice(0, 10);
        const days = Math.round((Date.parse(day) - Date.parse(almatyIsoNow().slice(0, 10))) / 86400000);
        const at = ' в ' + subTime(sub);
        const whenText = left <= 0 ? 'сегодня' : left < 2 * 3600000 ? 'через ' + Math.max(1, Math.round(left / 60000)) + ' мин' + at
            : days === 0 ? 'сегодня' + at : days === 1 ? 'завтра' + at : `через ${days} ${days < 5 ? 'дня' : 'дней'}`;
        showNotice(`Подписка «${sub.name}»`, `Списание ${whenText} (${charge.slice(8, 10)}.${charge.slice(5, 7)}): ${fmtTenge(sub.amount)}. Не забудьте пополнить счёт.`, 'sub-' + sub.id);
    });
}

// ---------- Утро 9:00 ----------
function morningText() {
    const goals = typeof sortedGoals === 'function' ? sortedGoals().filter(g => goalSaved(g) < g.price) : [];
    if (goals.length) {
        const g = goals[0];
        const left = g.price - goalSaved(g);
        return `Ваши цели: накопить на «${g.title}» — осталось ${fmtTenge(left)}` + (goals.length > 1 ? ` (и ещё ${goals.length - 1})` : '') + '.';
    }
    return manualLimit > 0 ? `Дневной лимит на сегодня: ${fmtTenge(manualLimit)}. Хорошего дня!` : 'Хорошего дня! Добавьте цель в разделе «Цели», и я буду напоминать о ней по утрам.';
}

function checkMorning() {
    if (!uiPrefs.notify.morning) return;
    const today = almatyIsoNow().slice(0, 10);
    const h = almatyHour();
    if (h < MORNING_HOUR || h >= 13) return; // после обеда утреннее сообщение уже неуместно
    const key = 'morning:' + today;
    if (readFired()[key]) return;
    markFired(key);
    showNotice('Доброе утро' + (profileName ? ', ' + profileName : '') + '!', morningText(), 'morning');
}

// ---------- Выгрузка за день в 23:00 ----------
let exportDirHandle = null;

function filesDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
        const req = indexedDB.open('mymoney-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbHandle(op, value) {
    const db = await filesDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', op === 'get' ? 'readonly' : 'readwrite');
        const s = tx.objectStore('handles');
        const req = op === 'get' ? s.get('exportDir') : op === 'put' ? s.put(value, 'exportDir') : s.delete('exportDir');
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
    });
}

function folderPickerSupported() {
    return typeof window.showDirectoryPicker === 'function';
}

async function chooseExportFolder() {
    if (!folderPickerSupported()) { alert('Выбор папки работает в Chrome и Edge на компьютере. На телефоне файлы сохраняются в «Загрузки».'); return; }
    try {
        exportDirHandle = await window.showDirectoryPicker({ id: 'mymoney-export', mode: 'readwrite', startIn: 'documents' });
        await idbHandle('put', exportDirHandle);
        showToast(`Выгрузки за день будут сохраняться в папку «${exportDirHandle.name}»`);
    } catch (e) {
        if (e && e.name !== 'AbortError') alert('Не удалось выбрать папку: ' + (e.message || e));
    }
    renderNotifySettings();
}

async function forgetExportFolder() {
    exportDirHandle = null;
    try { await idbHandle('delete'); } catch (e) {}
    renderNotifySettings();
}

// Разрешение на запись в папку браузер спрашивает заново после перезапуска — только по нажатию кнопки
async function regrantExportFolder() {
    if (!exportDirHandle) return chooseExportFolder();
    try { await exportDirHandle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    renderNotifySettings();
}

async function folderWritable() {
    if (!exportDirHandle || !exportDirHandle.queryPermission) return false;
    try { return (await exportDirHandle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
}

async function writeToFolder(name, blob) {
    const fh = await exportDirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
}

// Excel и PDF с записями за день day ('YYYY-MM-DD'). Возвращает текст для уведомления.
async function exportDay(day, { manual = false } = {}) {
    const list = transactions.filter(t => getTxDateStr(t.date) === day);
    const pretty = `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
    if (!list.length) return `За ${pretty} записей нет — файлы не созданы.`;
    const rows = buildExportRows(list);
    const who = String(profileName || 'MyMoney').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_') || 'MyMoney';
    const base = `${day}_${who}_за_день`;
    const files = [];
    if (await loadExcelLibrary()) files.push([base + '.xlsx', await buildExcelBlob(rows)]);
    if (await loadPdfLibrary()) {
        const blob = await new Promise((resolve, reject) => {
            try { window.pdfMake.createPdf(buildPdfDefinition(rows, list, `My Money — записи за ${pretty}`)).getBlob(resolve); } catch (e) { reject(e); }
        });
        files.push([base + '.pdf', blob]);
    }
    if (!files.length) throw new Error('нет интернета для модулей Excel и PDF');
    let where;
    if (await folderWritable()) {
        for (const [n, b] of files) await writeToFolder(n, b);
        where = `в папку «${exportDirHandle.name}»`;
    } else {
        const bridge = typeof nativeFileBridge === 'function' ? nativeFileBridge() : null;
        for (const [n, b] of files) {
            if (bridge) bridge.saveFile(await blobToBase64(b), n, b.type);
            else downloadBlob(b, n);
        }
        where = 'в «Загрузки»' + (exportDirHandle && !manual ? ' (нет доступа к выбранной папке — нажмите «Разрешить доступ к папке» в настройках)' : '');
    }
    return `Excel и PDF за ${pretty} (${list.length} зап.) сохранены ${where}.`;
}

let dailyExportRunning = false;
async function checkDailyExport() {
    if (!uiPrefs.notify.daily || dailyExportRunning) return;
    const today = almatyIsoNow().slice(0, 10);
    const yesterday = almatyIsoNow(-1).slice(0, 10);
    // в 23:00 и позже — сегодняшний день; если приложение в 23:00 было закрыто — вчерашний при следующем открытии (до полудня)
    let day = null;
    if (almatyHour() >= DAILY_EXPORT_HOUR) day = today;
    else if (almatyHour() < 12 && transactions.some(t => getTxDateStr(t.date) === yesterday)) day = yesterday;
    if (!day || readFired()['export:' + day]) return;
    if (!transactions.some(t => getTxDateStr(t.date) === day)) { markFired('export:' + day); return; }
    dailyExportRunning = true;
    markFired('export:' + day);
    try {
        showNotice('Выгрузка за день готова', await exportDay(day), 'export');
    } catch (e) {
        showNotice('Выгрузка за день не удалась', 'Не получилось создать файлы: ' + (e.message || e) + '. Выгрузите их вручную в «Отчётах».', 'export');
    } finally {
        dailyExportRunning = false;
    }
}

async function exportTodayNow() {
    try { showToast(await exportDay(almatyIsoNow().slice(0, 10), { manual: true })); }
    catch (e) { alert('Не удалось выгрузить: ' + (e.message || e)); }
}

// ---------- Проверка по расписанию ----------
function runNotifyChecks() {
    try { checkSubReminders(); } catch (e) { console.warn('Напоминания подписок', e); }
    try { checkMorning(); } catch (e) { console.warn('Утреннее уведомление', e); }
    checkDailyExport().catch(e => console.warn('Выгрузка за день', e));
    if (typeof checkBankAlerts === 'function') { try { checkBankAlerts(); } catch (e) {} }
}

// ---------- Настройки подписки: время и напоминания ----------
function remindersLabel(list) {
    const tr = typeof window.t === 'function' ? window.t : (s => s); // каждый пункт переводится отдельно (js/i18n.js)
    if (!list.length) return tr('без напоминаний');
    return NOTIFY_OFFSETS.filter(o => list.includes(o.id)).map((o, i) => {
        const s = tr(o.label);
        return i === 0 || appLang === 'de' ? s : s[0].toLowerCase() + s.slice(1);
    }).join(', ');
}

function openSubReminders(id) {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    const cur = subReminders(sub);
    const overlay = document.createElement('div');
    overlay.id = 'sub-remind';
    overlay.className = 'export-sheet-overlay';
    overlay.innerHTML = `
        <div class="export-sheet sub-remind" role="dialog" aria-modal="true" aria-label="Напоминания о списании">
            <div class="export-sheet-head">
                <h3>Списание «${escapeHtml(sub.name)}»</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <label class="field-inline"><span>День месяца</span><input type="number" id="sr-day" min="1" max="31" value="${Number(sub.day) || 1}"></label>
            <label class="field-inline"><span>Время списания</span><input type="time" id="sr-time" value="${subTime(sub)}"></label>
            <p class="hint">Когда напомнить:</p>
            <div class="remind-opts">${NOTIFY_OFFSETS.map(o => `<label class="remind-opt"><input type="checkbox" value="${o.id}" ${cur.includes(o.id) ? 'checked' : ''}> ${o.label}</label>`).join('')}</div>
            ${notifyPermission() !== 'granted' ? '<p class="hint notify-warn">Уведомления ещё не разрешены — включите их в Настройках → «Уведомления».</p>' : ''}
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="save"><span class="material-icons">notifications_active</span> Сохранить</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { overlay.remove(); playSound('close'); return; }
        if (!e.target.closest('[data-act="save"]')) return;
        const day = parseInt(document.getElementById('sr-day').value, 10);
        if (!(day >= 1 && day <= 31)) { alert('День месяца — от 1 до 31.'); return; }
        sub.day = day;
        sub.time = document.getElementById('sr-time').value || '10:00';
        sub.remind = [...overlay.querySelectorAll('.remind-opts input:checked')].map(i => i.value);
        overlay.remove();
        updateUI(true);
        runNotifyChecks();
        showToast(`«${sub.name}»: ${remindersLabel(sub.remind)}`);
    });
    document.body.appendChild(overlay);
    playSound('open');
}

// Чекбоксы напоминаний в форме «Новая подписка»
function renderNewSubReminders() {
    const box = document.getElementById('sub-remind-new');
    if (!box) return;
    if (box.dataset.ready) return;
    box.dataset.ready = '1';
    box.innerHTML = NOTIFY_OFFSETS.map(o => `<label class="remind-opt"><input type="checkbox" value="${o.id}" ${uiPrefs.notify.subDefault.includes(o.id) ? 'checked' : ''}> ${o.label}</label>`).join('');
}

function newSubReminderValues() {
    const box = document.getElementById('sub-remind-new');
    return box ? [...box.querySelectorAll('input:checked')].map(i => i.value) : uiPrefs.notify.subDefault.slice();
}

// ---------- Настройки → «Уведомления» ----------
async function renderNotifySettings() {
    const box = document.getElementById('notify-settings');
    if (!box) return;
    const perm = notifyPermission();
    const permText = { granted: 'разрешены', denied: 'запрещены в браузере', default: 'ещё не разрешены', unsupported: 'не поддерживаются этим браузером' }[perm];
    const n = uiPrefs.notify;
    if (!exportDirHandle) { try { exportDirHandle = (await idbHandle('get')) || null; } catch (e) {} }
    const folderOk = await folderWritable();
    box.innerHTML = `
        <p class="notify-perm is-${perm}"><span class="material-icons">${perm === 'granted' ? 'notifications_active' : 'notifications_off'}</span> Уведомления ${permText}</p>
        ${perm !== 'granted' && perm !== 'unsupported' ? '<button type="button" class="btn-primary btn-block" onclick="requestNotifyPermission()"><span class="material-icons">notifications</span> Разрешить уведомления</button>' : ''}
        <label class="hdr-part"><input type="checkbox" ${n.morning ? 'checked' : ''} onchange="setNotifyPref('morning', this.checked)"> Каждое утро в 9:00: «Доброе утро» и ваши цели</label>
        <label class="hdr-part"><input type="checkbox" ${n.daily ? 'checked' : ''} onchange="setNotifyPref('daily', this.checked)"> В 23:00 сохранять Excel и PDF с записями за день</label>
        <label class="hdr-part"><input type="checkbox" ${n.bank ? 'checked' : ''} onchange="setNotifyPref('bank', this.checked)"> Предупреждения по банковскому счёту</label>
        <p class="hint">Напоминания для новых подписок (у каждой подписки меняются кнопкой <span class="material-icons inline-icon">notifications</span> в «Подписках»):</p>
        <div class="remind-opts">${NOTIFY_OFFSETS.map(o => `<label class="remind-opt"><input type="checkbox" value="${o.id}" ${n.subDefault.includes(o.id) ? 'checked' : ''} onchange="setDefaultReminder('${o.id}', this.checked)"> ${o.label}</label>`).join('')}</div>
        <h4 class="notify-sub">Папка для выгрузок за день</h4>
        ${folderPickerSupported()
            ? (exportDirHandle
                ? `<p class="hint">Папка: <b>${escapeHtml(exportDirHandle.name)}</b>${folderOk ? '' : ' — браузер просит снова разрешить доступ.'}</p>
                   ${folderOk ? '' : '<button type="button" class="btn-primary btn-block" onclick="regrantExportFolder()"><span class="material-icons">lock_open</span> Разрешить доступ к папке</button>'}
                   <div class="btn-group"><button type="button" class="btn-secondary" onclick="chooseExportFolder()"><span class="material-icons">folder</span> Другая папка</button>
                   <button type="button" class="btn-secondary" onclick="forgetExportFolder()"><span class="material-icons">folder_off</span> В «Загрузки»</button></div>`
                : '<p class="hint">Сейчас файлы сохраняются в «Загрузки». Можно выбрать отдельную папку:</p><button type="button" class="btn-secondary btn-block" onclick="chooseExportFolder()"><span class="material-icons">create_new_folder</span> Выбрать папку</button>')
            : '<p class="hint">На этом устройстве файлы сохраняются в «Загрузки» (выбор отдельной папки есть в Chrome и Edge на компьютере).</p>'}
        <div class="btn-group">
            <button type="button" class="btn-secondary" onclick="exportTodayNow()"><span class="material-icons">download</span> Выгрузить за сегодня</button>
            <button type="button" class="btn-secondary" onclick="showNotice('Проверка', 'Уведомления My Money работают.', 'test')"><span class="material-icons">notification_add</span> Проверить</button>
        </div>
        <p class="hint">Сайт не может «разбудить» телефон без своего сервера: уведомления приходят, пока приложение открыто или свёрнуто и телефон его не закрыл. Пропущенные напоминания покажутся при следующем открытии. Чтобы срабатывало надёжнее, установите приложение на главный экран и не закрывайте его смахиванием.</p>
        <h4 class="notify-sub">Последние уведомления</h4>
        <div class="notify-log" id="notify-log"></div>`;
    renderNotifyLog();
}

function renderNotifyLog() {
    const box = document.getElementById('notify-log');
    if (!box) return;
    const log = readNotifyLog();
    box.innerHTML = log.length ? log.slice(0, 15).map(l => `<div class="notify-log-row"><small>${formatAlmaty({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(l.t))}</small><b>${escapeHtml(l.title)}</b><span>${escapeHtml(l.body)}</span></div>`).join('') : '<p class="hint">Пока уведомлений не было.</p>';
}

function setNotifyPref(key, value) {
    uiPrefs.notify[key] = !!value;
    commitUiPrefs();
    runNotifyChecks();
}

function setDefaultReminder(id, on) {
    const list = uiPrefs.notify.subDefault.filter(x => x !== id);
    if (on) list.push(id);
    uiPrefs.notify.subDefault = list;
    commitUiPrefs();
}

window.addEventListener('DOMContentLoaded', () => {
    // первый запуск этой версии: не выгружать задним числом вчерашний день
    if (!localStorage.getItem('finance_notify_since')) {
        try { localStorage.setItem('finance_notify_since', String(Date.now())); } catch (e) {}
        markFired('export:' + almatyIsoNow(-1).slice(0, 10));
    }
    renderNewSubReminders();
    renderNotifySettings();
    setTimeout(runNotifyChecks, 3000);
});
setInterval(runNotifyChecks, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(runNotifyChecks, 1500); });
