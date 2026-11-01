// --- ОБЛАКО: вход через Google и хранение данных на Google Диске ---
// Данные лежат файлом my_money_data.json в папке «My Money» на Google Диске пользователя.
// Доступ drive.file: приложение видит только файлы, которые создало само, а не весь Диск.
// Синхронизация: при каждом изменении, при открытии приложения и раз в минуту, пока оно на экране.
// Записи и подписки объединяются поштучно (по id и времени изменения), удаления передаются «надгробиями»,
// поэтому правки с телефона и ПК не затирают друг друга.

const DRIVE_FOLDER_NAME = 'My Money';
const DRIVE_FILE_NAME = 'my_money_data.json';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const CLOUD_KEYS = {
    token: 'finance_google_token',
    user: 'finance_google_user',
    fileId: 'finance_drive_file_id',
    remoteModified: 'finance_drive_modified',
    meta: 'finance_sync_meta',
    dirty: 'finance_sync_dirty',
    lastSync: 'finance_last_sync'
};
const TOMBSTONE_TTL_MS = 180 * 86400000;

let googleAccessToken = null;
let googleTokenExpiry = 0;
let cloudUser = null;           // { email, name, picture }
let cloudSyncTimer = null;
let cloudSyncRunning = false;
let cloudSyncAgain = false;
let syncBaseline = null;        // снимок данных после последней загрузки/синхронизации
let cloudStatus = { state: 'off', message: '' };

function readJsonKey(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
}

function googleClientId() {
    const id = String((window.MONEY_CONFIG && window.MONEY_CONFIG.googleClientId) || '').trim();
    return /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(id) ? id : '';
}

function isCloudConnected() {
    return !!cloudUser;
}

function gisReady() {
    return !!(window.google && google.accounts && google.accounts.oauth2);
}

function loadGis() {
    return loadScriptOnce('https://accounts.google.com/gsi/client').then(gisReady).catch(() => false);
}

function hasValidToken() {
    return !!googleAccessToken && googleTokenExpiry > Date.now() + 60000;
}

function storeToken(token, expiresInSec) {
    googleAccessToken = token;
    googleTokenExpiry = Date.now() + (Number(expiresInSec) || 3600) * 1000;
    try { localStorage.setItem(CLOUD_KEYS.token, JSON.stringify({ token, expiry: googleTokenExpiry })); } catch (e) {}
}

function dropToken() {
    googleAccessToken = null;
    googleTokenExpiry = 0;
    try { localStorage.removeItem(CLOUD_KEYS.token); } catch (e) {}
}

function cloudError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
}

// Окно Google открывается только по нажатию пользователя: функцию вызывают прямо из обработчика кнопки.
function requestGoogleToken() {
    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId(),
            scope: GOOGLE_SCOPES,
            hint: cloudUser ? cloudUser.email : undefined,
            callback: (resp) => {
                if (!resp || resp.error) { reject(cloudError('denied', resp && resp.error)); return; }
                if (google.accounts.oauth2.hasGrantedAllScopes
                    && !google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive.file')) {
                    reject(cloudError('scope', 'Не выдан доступ к Google Диску'));
                    return;
                }
                storeToken(resp.access_token, resp.expires_in);
                resolve(resp.access_token);
            },
            error_callback: (err) => reject(cloudError('popup', err && err.type))
        });
        client.requestAccessToken({ prompt: '' });
    });
}

function googleAuthBlockedReason() {
    if (!googleClientId()) return 'Вход через Google ещё не настроен: впишите Client ID в файл js/config.js (инструкция DEPLOY_RU.txt, шаг 3).';
    if (typeof isAndroidWebView === 'function' && isAndroidWebView()) return 'Google не разрешает входить в аккаунт во встроенном окне приложения (APK). Откройте сайт в Chrome или установите его на главный экран из Chrome.';
    if (!window.isSecureContext) return 'Вход через Google работает только на сайте с https.';
    return '';
}

function describeAuthError(e) {
    if (e && e.code === 'popup') return 'Окно входа Google было закрыто или заблокировано. Разрешите всплывающие окна для сайта и попробуйте снова.';
    if (e && e.code === 'scope') return 'Для синхронизации нужно разрешить доступ к Google Диску (галочка в окне Google).';
    if (e && e.code === 'denied') return 'Вход через Google отменён.';
    return 'Не удалось войти через Google: ' + (e && e.message ? e.message : e);
}

function signInWithGoogle() {
    const blocked = googleAuthBlockedReason();
    if (blocked) { alert(blocked); return; }
    if (!gisReady()) {
        loadGis();
        alert('Модуль входа Google ещё загружается. Нажмите кнопку ещё раз через пару секунд.');
        return;
    }
    requestGoogleToken()
        .then(fetchGoogleProfile)
        .then(() => {
            renderCloudUi();
            return runCloudSync({ manual: true });
        })
        .catch(e => {
            console.warn(e);
            alert(describeAuthError(e));
        });
}

// Повторное подтверждение, когда токен истёк (Google выдаёт его на 1 час).
function reconnectGoogle() {
    const blocked = googleAuthBlockedReason();
    if (blocked) { alert(blocked); return; }
    if (!gisReady()) { loadGis(); alert('Модуль входа Google ещё загружается. Нажмите ещё раз через пару секунд.'); return; }
    requestGoogleToken()
        .then(() => runCloudSync({ manual: true }))
        .catch(e => { console.warn(e); alert(describeAuthError(e)); });
}

async function fetchGoogleProfile() {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + googleAccessToken } });
    if (!res.ok) throw cloudError('profile', 'Профиль Google недоступен (HTTP ' + res.status + ')');
    const p = await res.json();
    const previous = cloudUser;
    cloudUser = { email: p.email || '', name: p.name || '', picture: p.picture || '' };
    // Другой аккаунт Google — забываем файл прошлого аккаунта
    if (previous && previous.email && previous.email !== cloudUser.email) {
        localStorage.removeItem(CLOUD_KEYS.fileId);
        localStorage.removeItem(CLOUD_KEYS.remoteModified);
    }
    localStorage.setItem(CLOUD_KEYS.user, JSON.stringify(cloudUser));
    // Имя из Google подставляем только если пользователь ещё не задал своё
    if (!profileName && cloudUser.name) {
        profileName = cloudUser.name;
        updateUI(true);
        fillProfileInput();
    }
    return cloudUser;
}

function signOutGoogle() {
    if (!confirm('Выйти из аккаунта Google?\n\nДанные останутся на этом устройстве и на вашем Google Диске, но перестанут синхронизироваться.')) return;
    try { if (googleAccessToken && gisReady()) google.accounts.oauth2.revoke(googleAccessToken, () => {}); } catch (e) {}
    dropToken();
    cloudUser = null;
    [CLOUD_KEYS.user, CLOUD_KEYS.fileId, CLOUD_KEYS.remoteModified, CLOUD_KEYS.lastSync].forEach(k => localStorage.removeItem(k));
    setCloudStatus('off');
    renderCloudUi();
}

// --- Google Диск API ---
async function driveFetch(url, options = {}) {
    if (!hasValidToken()) throw cloudError('auth');
    const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + googleAccessToken } });
    if (res.status === 401) { dropToken(); throw cloudError('auth'); }
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 200); } catch (e) {}
        throw cloudError('http', 'Google Диск: HTTP ' + res.status + (detail ? ' — ' + detail : ''));
    }
    return res;
}

function driveQuery(q, fields) {
    return driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=10&fields=${encodeURIComponent('files(' + fields + ')')}`)
        .then(r => r.json())
        .then(j => j.files || []);
}

async function findDriveFile() {
    const knownId = localStorage.getItem(CLOUD_KEYS.fileId);
    if (knownId) {
        try {
            const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(knownId)}?fields=id,modifiedTime,trashed`);
            const f = await r.json();
            if (!f.trashed) return f;
        } catch (e) {
            if (e.code === 'auth') throw e;
        }
        localStorage.removeItem(CLOUD_KEYS.fileId);
    }
    const files = await driveQuery(`name='${DRIVE_FILE_NAME}' and trashed=false`, 'id,modifiedTime');
    if (files[0]) localStorage.setItem(CLOUD_KEYS.fileId, files[0].id);
    return files[0] || null;
}

async function ensureDriveFolder() {
    const folders = await driveQuery(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id');
    if (folders[0]) return folders[0].id;
    const r = await driveFetch(`${DRIVE_API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    return (await r.json()).id;
}

async function createDriveFile(data) {
    const folderId = await ensureDriveFolder();
    const boundary = 'mymoney' + Date.now();
    const meta = { name: DRIVE_FILE_NAME, mimeType: 'application/json', parents: [folderId], description: 'Данные приложения My Money' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
    const r = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body
    });
    const f = await r.json();
    localStorage.setItem(CLOUD_KEYS.fileId, f.id);
    return f;
}

async function readDriveFile(id) {
    const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { throw cloudError('format', 'Файл данных на Google Диске повреждён'); }
}

async function writeDriveFile(id, data) {
    const r = await driveFetch(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data)
    });
    return r.json();
}

// --- Снимки данных, отметки изменений и слияние ---
function getSyncMeta() {
    const m = readJsonKey(CLOUD_KEYS.meta, {});
    return { scalarsAt: Number(m.scalarsAt) || 0, deleted: { tx: { ...(m.deleted && m.deleted.tx) }, subs: { ...(m.deleted && m.deleted.subs) } } };
}

function saveSyncMeta(meta) {
    try { localStorage.setItem(CLOUD_KEYS.meta, JSON.stringify(meta)); } catch (e) {}
}

function scalarsJson() {
    return JSON.stringify({ savings, limit: manualLimit, goal: priorityGoal, name: profileName });
}

function itemJson(item) {
    const { updatedAt, ...rest } = item;
    return JSON.stringify(rest);
}

// Запоминает текущее состояние как «синхронизированное»: следующие отличия будут считаться новыми правками.
function initSyncBaseline() {
    const map = list => new Map(list.filter(i => i && i.id).map(i => [String(i.id), itemJson(i)]));
    syncBaseline = { tx: map(transactions), subs: map(subscriptions), scalars: scalarsJson() };
}

// Вызывается при каждом сохранении: ставит время изменения новым/изменённым записям и «надгробия» удалённым.
function stampLocalChanges() {
    if (!syncBaseline) return;
    const meta = getSyncMeta();
    const now = Date.now();
    let changed = false;

    const stamp = (list, key) => {
        const prev = syncBaseline[key];
        const next = new Map();
        list.forEach(item => {
            if (!item) return;
            if (!item.id) item.id = now.toString(36) + Math.random().toString(36).slice(2, 7);
            const id = String(item.id);
            const json = itemJson(item);
            if (prev.get(id) !== json) { item.updatedAt = now; changed = true; delete meta.deleted[key][id]; }
            next.set(id, json);
        });
        prev.forEach((_, id) => { if (!next.has(id)) { meta.deleted[key][id] = now; changed = true; } });
        syncBaseline[key] = next;
    };
    stamp(transactions, 'tx');
    stamp(subscriptions, 'subs');

    const scalars = scalarsJson();
    if (scalars !== syncBaseline.scalars) { meta.scalarsAt = now; syncBaseline.scalars = scalars; changed = true; }

    if (changed) {
        saveSyncMeta(meta);
        try { localStorage.setItem(CLOUD_KEYS.dirty, '1'); } catch (e) {}
    }
}

function localSnapshot() {
    const meta = getSyncMeta();
    return {
        app: 'my-money', format: 2, savedAt: Date.now(),
        profile: { name: profileName },
        tx: transactions, subs: subscriptions,
        savings, limit: manualLimit, goal: priorityGoal,
        scalarsAt: meta.scalarsAt, deleted: meta.deleted
    };
}

function asList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v && typeof v === 'object') return Object.values(v).filter(Boolean); // старые данные из Firebase могли прийти объектом
    return [];
}

function mergeLists(a, b, delA, delB) {
    const deleted = {};
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    [delA || {}, delB || {}].forEach(d => Object.entries(d).forEach(([id, ts]) => {
        if (ts > cutoff) deleted[id] = Math.max(deleted[id] || 0, Number(ts) || 0);
    }));
    const map = new Map();
    [...asList(a), ...asList(b)].forEach(item => {
        if (!item.id) return;
        const id = String(item.id);
        const cur = map.get(id);
        if (!cur || (Number(item.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) map.set(id, item);
    });
    const list = [...map.values()].filter(item => !(deleted[String(item.id)] && deleted[String(item.id)] >= (Number(item.updatedAt) || 0)));
    return { list, deleted };
}

function mergeSnapshots(local, remote) {
    const r = remote || {};
    const tx = mergeLists(local.tx, r.tx, local.deleted && local.deleted.tx, r.deleted && r.deleted.tx);
    const subs = mergeLists(local.subs, r.subs, local.deleted && local.deleted.subs, r.deleted && r.deleted.subs);
    const remoteNewer = (Number(r.scalarsAt) || 0) > (Number(local.scalarsAt) || 0);
    const src = remoteNewer ? r : local;
    return {
        app: 'my-money', format: 2, savedAt: Date.now(),
        profile: { name: (src.profile && src.profile.name) || '' },
        tx: tx.list, subs: subs.list,
        savings: Number(src.savings) || 0,
        limit: Number(src.limit) || 0,
        goal: src.goal || { name: '', amount: 0, icon: '🎯' },
        scalarsAt: Math.max(Number(local.scalarsAt) || 0, Number(r.scalarsAt) || 0),
        deleted: { tx: tx.deleted, subs: subs.deleted }
    };
}

// Сравнение без учёта времени сохранения и порядка записей
function snapshotKey(s) {
    const byId = list => asList(list).map(i => JSON.stringify(i)).sort();
    return JSON.stringify([byId(s.tx), byId(s.subs), s.savings, s.limit, s.goal, s.profile && s.profile.name, s.scalarsAt, s.deleted]);
}

function applySnapshot(s) {
    transactions = asList(s.tx);
    subscriptions = asList(s.subs);
    savings = Number(s.savings) || 0;
    manualLimit = Number(s.limit) || 0;
    priorityGoal = s.goal || { name: '', amount: 0, icon: '🎯' };
    profileName = (s.profile && s.profile.name) || '';
    saveSyncMeta({ scalarsAt: Number(s.scalarsAt) || 0, deleted: s.deleted || { tx: {}, subs: {} } });
    initSyncBaseline();
    updateUI(false);
    fillProfileInput();
    const mLimit = document.getElementById('manual-limit');
    if (mLimit) mLimit.value = manualLimit > 0 ? manualLimit : '';
}

// --- Синхронизация ---
function scheduleCloudSync(delay = 1500) {
    if (!cloudUser) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => runCloudSync(), delay);
}

async function runCloudSync({ manual = false } = {}) {
    if (!cloudUser) return false;
    if (cloudSyncRunning) { cloudSyncAgain = true; return false; }
    if (!hasValidToken()) { setCloudStatus('needs-auth'); return false; }
    if (!navigator.onLine) { setCloudStatus('offline'); return false; }

    cloudSyncRunning = true;
    setCloudStatus('syncing');
    try {
        const file = await findDriveFile();
        if (!file) {
            // Первый вход: создаём файл на Диске из данных этого устройства
            localStorage.removeItem(CLOUD_KEYS.dirty);
            const created = await createDriveFile(localSnapshot());
            localStorage.setItem(CLOUD_KEYS.remoteModified, created.modifiedTime || '');
        } else {
            const dirty = localStorage.getItem(CLOUD_KEYS.dirty) === '1';
            const remoteChanged = file.modifiedTime !== localStorage.getItem(CLOUD_KEYS.remoteModified);
            if (remoteChanged || dirty || manual) {
                const remote = await readDriveFile(file.id);
                // Слияние считаем сразу после чтения, чтобы не потерять правки, сделанные во время загрузки
                const merged = mergeSnapshots(localSnapshot(), remote);
                if (snapshotKey(merged) !== snapshotKey(localSnapshot())) applySnapshot(merged);
                localStorage.removeItem(CLOUD_KEYS.dirty);
                if (snapshotKey(merged) !== snapshotKey(remote)) {
                    const saved = await writeDriveFile(file.id, merged);
                    localStorage.setItem(CLOUD_KEYS.remoteModified, saved.modifiedTime || '');
                } else {
                    localStorage.setItem(CLOUD_KEYS.remoteModified, file.modifiedTime || '');
                }
            }
        }
        localStorage.setItem(CLOUD_KEYS.lastSync, String(Date.now()));
        setCloudStatus('ok');
        return true;
    } catch (e) {
        console.warn('Синхронизация с Google Диском не удалась', e);
        if (e.code === 'auth') setCloudStatus('needs-auth');
        else setCloudStatus('error', e.message);
        if (localStorage.getItem(CLOUD_KEYS.dirty) !== '1') {
            try { localStorage.setItem(CLOUD_KEYS.dirty, '1'); } catch (err) {}
        }
        return false;
    } finally {
        cloudSyncRunning = false;
        if (cloudSyncAgain) { cloudSyncAgain = false; scheduleCloudSync(400); }
    }
}

// Кнопка синхронизации (круглая внизу справа и в настройках)
async function syncNowButton() {
    if (!cloudUser) {
        showTab('settings');
        const card = document.getElementById('auth-section');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Войдите через Google, чтобы данные сохранялись на Google Диске');
        return;
    }
    if (!hasValidToken()) { reconnectGoogle(); return; }
    const ok = await runCloudSync({ manual: true });
    showToast(ok ? 'Синхронизировано с Google Диском' : (cloudStatus.state === 'offline' ? 'Нет интернета — синхронизация позже' : 'Синхронизация не удалась'));
}

// --- Интерфейс ---
function setCloudStatus(state, message = '') {
    cloudStatus = { state, message };
    renderCloudUi();
}

function renderCloudUi() {
    const out = document.getElementById('auth-logged-out');
    const inn = document.getElementById('auth-logged-in');
    if (!out || !inn) return;
    out.style.display = cloudUser ? 'none' : '';
    inn.style.display = cloudUser ? '' : 'none';

    const setupHint = document.getElementById('google-setup-hint');
    if (setupHint) {
        const blocked = googleAuthBlockedReason();
        setupHint.textContent = blocked;
        setupHint.style.display = blocked ? '' : 'none';
    }
    if (!cloudUser) return;

    const email = document.getElementById('user-email-display');
    const avatar = document.getElementById('google-avatar');
    if (email) email.textContent = cloudUser.email + (cloudUser.name ? ` (${cloudUser.name})` : '');
    if (avatar) {
        avatar.style.display = cloudUser.picture ? '' : 'none';
        if (cloudUser.picture) avatar.src = cloudUser.picture;
    }

    const statusEl = document.getElementById('cloud-status');
    const reconnectBtn = document.getElementById('cloud-reconnect-btn');
    const last = Number(localStorage.getItem(CLOUD_KEYS.lastSync)) || 0;
    const lastText = last ? formatAlmaty({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(last)) : 'ещё не было';
    const texts = {
        ok: `Синхронизировано. Последний раз: ${lastText}`,
        syncing: 'Синхронизация…',
        'needs-auth': 'Вход устарел: нажмите «Продолжить синхронизацию» (Google просит подтверждать вход раз в час).',
        offline: `Нет интернета. Изменения сохранены на устройстве и отправятся позже. Последняя синхронизация: ${lastText}`,
        error: `Ошибка синхронизации: ${cloudStatus.message}`,
        off: `Последняя синхронизация: ${lastText}`
    };
    if (statusEl) {
        statusEl.textContent = texts[cloudStatus.state] || texts.off;
        statusEl.className = 'hint cloud-status is-' + cloudStatus.state;
    }
    if (reconnectBtn) reconnectBtn.style.display = cloudStatus.state === 'needs-auth' ? '' : 'none';

    const fab = document.querySelector('.fab-sync');
    if (fab) fab.classList.toggle('is-syncing', cloudStatus.state === 'syncing');
}

function showToast(text) {
    let el = document.getElementById('app-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'app-toast';
        el.className = 'app-toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

function initCloud() {
    cloudUser = readJsonKey(CLOUD_KEYS.user, null);
    const t = readJsonKey(CLOUD_KEYS.token, null);
    if (t && t.token && t.expiry > Date.now() + 60000) { googleAccessToken = t.token; googleTokenExpiry = t.expiry; }

    if (googleClientId() && !googleAuthBlockedReason()) loadGis();
    if (cloudUser) {
        if (hasValidToken()) runCloudSync();
        else setCloudStatus('needs-auth');
    }
    renderCloudUi();

    // Автообновление данных с других устройств
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && cloudUser) {
            if (hasValidToken()) runCloudSync(); else setCloudStatus('needs-auth');
        }
    });
    window.addEventListener('online', () => { if (cloudUser) runCloudSync(); });
    setInterval(() => {
        if (cloudUser && document.visibilityState === 'visible' && hasValidToken()) runCloudSync();
    }, 60000);
}

// --- Разовый перенос данных из старого аккаунта (вход по email, Firebase) ---
const LEGACY_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyB27Rqisiz2OyavjImphW-M0PBg5hbIdiE',
    authDomain: 'money99774.firebaseapp.com',
    databaseURL: 'https://money99774-default-rtdb.firebaseio.com',
    projectId: 'money99774',
    storageBucket: 'money99774.firebasestorage.app',
    messagingSenderId: '711455509046',
    appId: '1:711455509046:web:dbedd1a788759ccaa22697'
};
const LEGACY_FIREBASE_SCRIPTS = [
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

async function migrateFromFirebase() {
    const emailEl = document.getElementById('legacy-email');
    const passEl = document.getElementById('legacy-password');
    const statusEl = document.getElementById('legacy-status');
    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value : '';
    const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
    if (!email || !pass) { setStatus('Введите email и пароль старого аккаунта.'); return; }

    setStatus('Подключаемся к старому аккаунту…');
    try {
        for (const src of LEGACY_FIREBASE_SCRIPTS) await loadScriptOnce(src);
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(LEGACY_FIREBASE_CONFIG);
        const auth = app.auth();
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        const snap = await app.database().ref('users/' + cred.user.uid).once('value');
        const data = snap.val();
        await auth.signOut();
        if (passEl) passEl.value = '';
        if (!data) { setStatus('В старом аккаунте нет сохранённых данных.'); return; }

        // Старые записи считаются «самыми ранними»: они не перезапишут то, что уже изменено здесь
        const legacy = {
            tx: asList(data.tx).map(t => ({ ...t, updatedAt: 1 })),
            subs: asList(data.subs).map(s => ({ ...s, updatedAt: 1 })),
            savings: data.savings, limit: data.limit, goal: data.goal,
            profile: { name: profileName }, scalarsAt: 1, deleted: { tx: {}, subs: {} }
        };
        const merged = mergeSnapshots(localSnapshot(), legacy);
        // Копилка, лимит и цель переносятся, если здесь они ещё не заданы
        if (!savings && Number(data.savings)) merged.savings = Number(data.savings);
        if (!manualLimit && Number(data.limit)) merged.limit = Number(data.limit);
        if (!(priorityGoal && priorityGoal.name) && data.goal && data.goal.name) merged.goal = data.goal;
        const before = transactions.length;
        transactions = merged.tx;
        subscriptions = merged.subs;
        savings = merged.savings;
        manualLimit = merged.limit;
        priorityGoal = merged.goal;
        updateUI(true);
        setStatus(`Готово: перенесено записей — ${transactions.length - before}, подписок — ${asList(data.subs).length}.` +
            (cloudUser ? ' Данные отправляются на Google Диск.' : ' Войдите через Google, чтобы сохранить их на Диске.'));
    } catch (e) {
        console.error(e);
        const code = e && e.code ? String(e.code) : '';
        setStatus(code.includes('wrong-password') || code.includes('invalid') || code.includes('user-not-found')
            ? 'Неверный email или пароль старого аккаунта.'
            : 'Не удалось перенести данные: ' + (e && e.message ? e.message : e));
    }
}
