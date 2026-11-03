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

function rawClientId() {
    return String((window.MONEY_CONFIG && window.MONEY_CONFIG.googleClientId) || '').replace(/\s+/g, '');
}

function googleClientId() {
    const id = rawClientId();
    return /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id) ? id : '';
}

// Точная причина, почему Client ID не принят (для подсказки в настройках)
function clientIdProblem() {
    if (!window.MONEY_CONFIG) {
        return 'Файл js/config.js не найден или в нём ошибка (пропущена запятая или кавычка). ' +
            'Откройте его на GitHub и сверьте с образцом js/config.example.js.';
    }
    const id = rawClientId();
    if (!id || /ВСТАВЬТЕ/i.test(id)) {
        return 'В файле js/config.js не вписан Client ID — там заглушка «ВСТАВЬТЕ_СЮДА…». ' +
            'Скорее всего, файл заменился при обновлении. Впишите Client ID заново (он есть в Google Cloud → Clients).';
    }
    if (!googleClientId()) {
        return `Client ID в js/config.js записан неправильно: «${id.slice(0, 40)}${id.length > 40 ? '…' : ''}». ` +
            'Нужно вида 123456789012-abc123.apps.googleusercontent.com — без https://, без пробелов, в одинарных кавычках.';
    }
    return '';
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
    const configProblem = clientIdProblem();
    if (configProblem) return 'Вход через Google не настроен. ' + configProblem;
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
            if (typeof adminLog === 'function') adminLog('login', {});
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
        localStorage.removeItem('finance_ob_mirror_id');
        localStorage.removeItem('finance_ob_mirror_key');
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
    [CLOUD_KEYS.user, CLOUD_KEYS.fileId, CLOUD_KEYS.remoteModified, CLOUD_KEYS.lastSync,
        'finance_ob_mirror_id', 'finance_ob_mirror_key'].forEach(k => localStorage.removeItem(k));
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
    // Только свой файл: чужие книги Oldbook, открытые через доступ, сюда не попадают
    const files = await driveQuery(`name='${DRIVE_FILE_NAME}' and 'me' in owners and trashed=false`, 'id,modifiedTime');
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
    const f = await createDriveJsonFile(DRIVE_FILE_NAME, data, 'Данные приложения My Money');
    localStorage.setItem(CLOUD_KEYS.fileId, f.id);
    return f;
}

async function createDriveJsonFile(name, data, description) {
    const folderId = await ensureDriveFolder();
    const boundary = 'mymoney' + Date.now();
    const meta = { name, mimeType: 'application/json', parents: [folderId], description };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
    const r = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body
    });
    return r.json();
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
// Списки, которые сливаются поштучно: записи, подписки, записи Oldbook и подключённые книги других пользователей.
const SYNC_LISTS = [
    { key: 'tx', get: () => transactions, set: v => { transactions = v; } },
    { key: 'subs', get: () => subscriptions, set: v => { subscriptions = v; } },
    { key: 'ob', get: () => oldbookEntries, set: v => { oldbookEntries = v; } },
    { key: 'links', get: () => oldbookLinks, set: v => { oldbookLinks = v; } },
    { key: 'cats', get: () => customCategories, set: v => { customCategories = v; } },
    // свои темы оформления (js/themes.js)
    { key: 'themes', get: () => customThemes, set: v => { customThemes = v; if (typeof onCustomThemesChanged === 'function') onCustomThemesChanged(); } },
    // «Мои звуки»: библиотека своих звуков (файлы — отдельно на Диске, js/soundpicker.js)
    { key: 'soundlib', get: () => soundLibrary, set: v => { soundLibrary = v; } },
    // приоритетные цели (js/goals.js) и свои котировки (js/quotes.js)
    { key: 'goals', get: () => goalsList, set: v => { goalsList = v; } },
    { key: 'quotes', get: () => userQuotes, set: v => { userQuotes = v; } },
    // список покупок и цены товаров (js/shopping.js)
    { key: 'shop', get: () => shopList, set: v => { shopList = v; } },
    { key: 'prices', get: () => priceRecords, set: v => { priceRecords = v; } }
];

function getSyncMeta() {
    const m = readJsonKey(CLOUD_KEYS.meta, {});
    const deleted = {};
    SYNC_LISTS.forEach(l => { deleted[l.key] = { ...(m.deleted && m.deleted[l.key]) }; });
    return { scalarsAt: Number(m.scalarsAt) || 0, deleted };
}

function saveSyncMeta(meta) {
    try { localStorage.setItem(CLOUD_KEYS.meta, JSON.stringify(meta)); } catch (e) {}
}

function scalarsJson() {
    return JSON.stringify({ savings, limit: manualLimit, goal: priorityGoal, name: profileName, sounds: customSoundMeta, themeSounds: themeSoundMeta, ui: uiPrefs });
}

function itemJson(item) {
    const { updatedAt, ...rest } = item;
    return JSON.stringify(rest);
}

// Запоминает текущее состояние как «синхронизированное»: следующие отличия будут считаться новыми правками.
function initSyncBaseline() {
    const map = list => new Map(list.filter(i => i && i.id).map(i => [String(i.id), itemJson(i)]));
    syncBaseline = { scalars: scalarsJson() };
    SYNC_LISTS.forEach(l => { syncBaseline[l.key] = map(l.get()); });
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
    SYNC_LISTS.forEach(l => stamp(l.get(), l.key));

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
        ob: oldbookEntries, links: oldbookLinks, cats: customCategories, themes: customThemes,
        soundlib: soundLibrary, goals: goalsList, quotes: userQuotes, shop: shopList, prices: priceRecords,
        savings, limit: manualLimit, goal: priorityGoal,
        sounds: customSoundMeta, themeSounds: themeSoundMeta, ui: uiPrefs,
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
    const merged = {};
    const deleted = {};
    SYNC_LISTS.forEach(l => {
        const m = mergeLists(local[l.key], r[l.key], local.deleted && local.deleted[l.key], r.deleted && r.deleted[l.key]);
        merged[l.key] = m.list;
        deleted[l.key] = m.deleted;
    });
    const remoteNewer = (Number(r.scalarsAt) || 0) > (Number(local.scalarsAt) || 0);
    const src = remoteNewer ? r : local;
    return {
        app: 'my-money', format: 2, savedAt: Date.now(),
        profile: { name: (src.profile && src.profile.name) || '' },
        ...merged,
        savings: Number(src.savings) || 0,
        limit: Number(src.limit) || 0,
        goal: src.goal || { name: '', amount: 0, icon: '🎯' },
        sounds: (src.sounds && typeof src.sounds === 'object') ? src.sounds : {},
        themeSounds: (src.themeSounds && typeof src.themeSounds === 'object') ? src.themeSounds : ((remoteNewer ? local.themeSounds : r.themeSounds) || {}),
        // настройки вида (шапка, котировки, картинки категорий): если их ещё нет в более новом снимке — берём из другого
        ui: (src.ui && typeof src.ui === 'object') ? src.ui : ((remoteNewer ? local.ui : r.ui) || {}),
        scalarsAt: Math.max(Number(local.scalarsAt) || 0, Number(r.scalarsAt) || 0),
        deleted
    };
}

// Сравнение без учёта времени сохранения и порядка записей
function snapshotKey(s) {
    const byId = list => asList(list).map(i => JSON.stringify(i)).sort();
    return JSON.stringify([...SYNC_LISTS.map(l => byId(s[l.key])), s.savings, s.limit, s.goal, s.profile && s.profile.name,
        JSON.stringify(s.sounds || {}), JSON.stringify(s.themeSounds || {}), JSON.stringify(s.ui || {}), s.scalarsAt, s.deleted]);
}

function applySnapshot(s) {
    SYNC_LISTS.forEach(l => l.set(asList(s[l.key])));
    savings = Number(s.savings) || 0;
    manualLimit = Number(s.limit) || 0;
    priorityGoal = s.goal || { name: '', amount: 0, icon: '🎯' };
    profileName = (s.profile && s.profile.name) || '';
    customSoundMeta = (s.sounds && typeof s.sounds === 'object') ? s.sounds : {};
    themeSoundMeta = (s.themeSounds && typeof s.themeSounds === 'object') ? s.themeSounds : {};
    if (s.ui && typeof s.ui === 'object') setUiPrefs(s.ui);
    if (typeof onCustomSoundsChanged === 'function') onCustomSoundsChanged();
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
        // Oldbook: своя книга для других пользователей и книги, которыми поделились с вами
        try {
            if (typeof isAdminUser !== 'function' || isAdminUser()) await syncOldbookShared(); // Oldbook — только у администратора
        } catch (e) {
            if (e.code === 'auth') throw e;
            console.warn('Oldbook: обмен с другими аккаунтами не удался', e);
        }
        // Свои звуки: загрузить новые файлы на Диск и скачать те, что выбраны на других устройствах
        try {
            if (typeof syncCustomSoundFiles === 'function') await syncCustomSoundFiles();
        } catch (e) {
            if (e.code === 'auth') throw e;
            console.warn('Свои звуки: синхронизация файлов не удалась', e);
        }
        // Фото чеков: «My Money/Чеки/год/месяц/день» (js/receipt.js)
        try {
            if (typeof syncReceiptPhotos === 'function') await syncReceiptPhotos();
        } catch (e) {
            if (e.code === 'auth') throw e;
            console.warn('Фото чеков: загрузка на Диск не удалась', e);
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
    if (typeof applyAdminAccess === 'function') applyAdminAccess(); // Oldbook и журнал — только администратору / по согласию
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

// --- OLDBOOK: общая книга с другими аккаунтами Google ---
// Записи Oldbook копируются в отдельный файл my_money_oldbook.json (только Oldbook, без остальных финансов).
// Обмен двусторонний и добровольный:
//  1) владелец открывает доступ к своей книге по email (Google присылает письмо) — это его согласие на передачу;
//  2) получатель подтверждает, выбрав эту книгу в окне Google Диска (Google Picker) — после этого его приложение
//     может читать файл (доступ drive.file выдаётся только на выбранный файл).
// Чужие книги только читаются и обновляются при каждой синхронизации.
const OLDBOOK_FILE_NAME = 'my_money_oldbook.json';
const OB_KEYS = { mirrorId: 'finance_ob_mirror_id', mirrorKey: 'finance_ob_mirror_key', remote: 'finance_ob_remote' };

function oldbookRemoteCache() {
    return readJsonKey(OB_KEYS.remote, {});
}

function saveOldbookRemoteCache(cache) {
    try { localStorage.setItem(OB_KEYS.remote, JSON.stringify(cache)); } catch (e) {}
}

function oldbookOwnerName() {
    return profileName || (cloudUser && (cloudUser.name || cloudUser.email)) || '';
}

function oldbookMirrorData() {
    return {
        app: 'my-money-oldbook', format: 1, savedAt: Date.now(),
        owner: { email: cloudUser ? cloudUser.email : '', name: oldbookOwnerName() },
        entries: oldbookEntries
    };
}

function oldbookMirrorKey() {
    return JSON.stringify([oldbookEntries, oldbookOwnerName()]);
}

async function findOwnOldbookMirror() {
    const known = localStorage.getItem(OB_KEYS.mirrorId);
    if (known) {
        try {
            const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(known)}?fields=id,trashed`);
            const f = await r.json();
            if (!f.trashed) return f.id;
        } catch (e) {
            if (e.code === 'auth') throw e;
        }
        localStorage.removeItem(OB_KEYS.mirrorId);
    }
    const files = await driveQuery(`name='${OLDBOOK_FILE_NAME}' and 'me' in owners and trashed=false`, 'id');
    if (files[0]) {
        localStorage.setItem(OB_KEYS.mirrorId, files[0].id);
        return files[0].id;
    }
    return null;
}

async function ensureOldbookMirror() {
    let id = await findOwnOldbookMirror();
    if (!id) {
        const f = await createDriveJsonFile(OLDBOOK_FILE_NAME, oldbookMirrorData(), 'Книга Oldbook приложения My Money (для совместного доступа)');
        id = f.id;
        localStorage.setItem(OB_KEYS.mirrorId, id);
        localStorage.setItem(OB_KEYS.mirrorKey, oldbookMirrorKey());
    }
    return id;
}

async function syncOldbookShared() {
    // 1) Своя книга: файл появляется, когда есть записи Oldbook или им уже поделились
    const hasMirror = !!localStorage.getItem(OB_KEYS.mirrorId);
    if (oldbookEntries.length || hasMirror) {
        const key = oldbookMirrorKey();
        if (!hasMirror || key !== localStorage.getItem(OB_KEYS.mirrorKey)) {
            const id = await ensureOldbookMirror();
            await writeDriveFile(id, oldbookMirrorData());
            localStorage.setItem(OB_KEYS.mirrorKey, key);
        }
    }
    // 2) Книги, которыми поделились с вами
    await refreshLinkedOldbooks(false);
}

async function refreshLinkedOldbooks(force) {
    const cache = oldbookRemoteCache();
    const active = new Set();
    for (const link of oldbookLinks) {
        if (!link || !link.id) continue;
        active.add(link.id);
        const entry = cache[link.id] || { entries: [] };
        try {
            const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(link.id)}?fields=id,modifiedTime,trashed,owners(emailAddress,displayName)`);
            const meta = await r.json();
            const owner = (meta.owners && meta.owners[0]) || {};
            if (meta.trashed) {
                entry.error = 'Владелец удалил эту книгу';
                entry.entries = [];
                entry.modifiedTime = '';
            } else if (force || meta.modifiedTime !== entry.modifiedTime) {
                const data = await readDriveFile(link.id);
                entry.entries = asList(data.entries);
                entry.owner = (data.owner && data.owner.email) || owner.emailAddress || '';
                entry.ownerName = (data.owner && data.owner.name) || owner.displayName || entry.owner;
                entry.modifiedTime = meta.modifiedTime;
                entry.error = '';
            } else {
                entry.error = '';
            }
        } catch (e) {
            if (e.code === 'auth') throw e;
            if (/HTTP (403|404)/.test(e.message || '')) {
                // Доступ закрыт — записи владельца больше не показываем
                entry.error = 'Нет доступа: владелец закрыл доступ или удалил книгу';
                entry.entries = [];
                entry.modifiedTime = '';
            } else {
                // Временная ошибка сети — показываем последние полученные записи
                entry.error = 'Не удалось обновить: ' + (e.message || e);
            }
        }
        cache[link.id] = entry;
    }
    Object.keys(cache).forEach(id => { if (!active.has(id)) delete cache[id]; });
    saveOldbookRemoteCache(cache);
    if (typeof renderOldbook === 'function') renderOldbook();
}

function setObShareStatus(text) {
    const el = document.getElementById('ob-share-status');
    if (el) el.textContent = text;
}

function oldbookCloudReady() {
    if (!cloudUser) {
        alert('Сначала войдите через Google: Настройки → «Аккаунт Google».');
        return false;
    }
    if (!hasValidToken()) {
        reconnectGoogle();
        return false;
    }
    return true;
}

// Шаг 1 (владелец): открыть доступ к своей книге по email
async function shareOldbookWith() {
    const input = document.getElementById('ob-share-email');
    const email = input ? input.value.trim().toLowerCase() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        alert('Введите email аккаунта Google, например katya@gmail.com');
        return;
    }
    if (!oldbookCloudReady()) return;
    if (email === String(cloudUser.email || '').toLowerCase()) {
        alert('Это ваш собственный адрес.');
        return;
    }
    setObShareStatus('Открываем доступ…');
    try {
        const id = await ensureOldbookMirror();
        await writeDriveFile(id, oldbookMirrorData());
        localStorage.setItem(OB_KEYS.mirrorKey, oldbookMirrorKey());
        const message = `С вами поделились книгой Oldbook в приложении My Money (владелец: ${oldbookOwnerName()}). ` +
            'Чтобы получать эти записи, откройте My Money → Oldbook → «Принять книгу другого пользователя» и выберите этот файл.';
        await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(message)}&fields=id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email })
        });
        if (input) input.value = '';
        setObShareStatus(`Доступ открыт для ${email}. Google отправит письмо; человек должен подтвердить: Oldbook → «Принять книгу другого пользователя».`);
        if (typeof playSound === 'function') playSound('open');
        renderOldbookShares();
    } catch (e) {
        console.warn(e);
        setObShareStatus(e.code === 'auth' ? 'Вход устарел: нажмите круглую кнопку синхронизации и повторите.' : 'Не удалось открыть доступ: ' + (e.message || e));
    }
}

// Список тех, кому открыт доступ к вашей книге
async function renderOldbookShares() {
    const box = document.getElementById('ob-shares');
    if (!box) return;
    const mirrorId = localStorage.getItem(OB_KEYS.mirrorId);
    if (!cloudUser || !mirrorId || !hasValidToken()) {
        box.innerHTML = '<p class="hint">Пока вы ни с кем не поделились своей книгой.</p>';
        return;
    }
    try {
        const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(mirrorId)}/permissions?fields=permissions(id,emailAddress,role,displayName)`);
        const perms = ((await r.json()).permissions || []).filter(p => p.role !== 'owner');
        box.innerHTML = perms.length
            ? perms.map(p => `<div class="ob-share-row"><span class="material-icons">person</span><span class="ob-share-email">${escapeHtml(p.emailAddress || p.displayName || '')}</span>` +
                `<button type="button" class="btn-secondary" onclick="unshareOldbook('${escapeHtml(p.id)}')">Закрыть доступ</button></div>`).join('')
            : '<p class="hint">Пока вы ни с кем не поделились своей книгой.</p>';
    } catch (e) {
        box.innerHTML = '<p class="hint">Список доступа сейчас недоступен.</p>';
    }
}

async function unshareOldbook(permissionId) {
    if (!confirm('Закрыть этому человеку доступ к вашей книге Oldbook? Он перестанет получать ваши записи.')) return;
    if (!oldbookCloudReady()) return;
    const mirrorId = localStorage.getItem(OB_KEYS.mirrorId);
    try {
        await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(mirrorId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' });
        if (typeof playSound === 'function') playSound('close');
        renderOldbookShares();
    } catch (e) {
        alert('Не удалось закрыть доступ: ' + (e.message || e));
    }
}

// Шаг 2 (получатель): подтвердить и подключить книгу, выбрав её в окне Google Диска
function pickerConfig() {
    const c = window.MONEY_CONFIG || {};
    return { apiKey: String(c.googleApiKey || '').trim(), appId: String(c.googleAppId || '').trim() };
}

async function acceptOldbook() {
    if (!oldbookCloudReady()) return;
    const { apiKey, appId } = pickerConfig();
    if (!/^AIza[\w-]{20,}$/.test(apiKey) || !/^\d{6,}$/.test(appId)) {
        alert('Чтобы принимать книги других пользователей, впишите googleApiKey и googleAppId в файл js/config.js (инструкция: шаги про Google Picker).');
        return;
    }
    try {
        await loadScriptOnce('https://apis.google.com/js/api.js');
        await new Promise((resolve, reject) => gapi.load('picker', { callback: resolve, onerror: reject }));
    } catch (e) {
        alert('Не удалось загрузить окно выбора Google Диска. Проверьте интернет.');
        return;
    }
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setOwnedByMe(false)
        .setQuery(OLDBOOK_FILE_NAME)
        .setMode(google.picker.DocsViewMode.LIST);
    const picker = new google.picker.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(googleAccessToken)
        .setDeveloperKey(apiKey)
        .setLocale('ru')
        .setTitle('Выберите книгу Oldbook, которой с вами поделились')
        .addView(view)
        .setCallback(data => { onOldbookPicked(data); })
        .build();
    if (typeof playSound === 'function') playSound('open');
    picker.setVisible(true);
}

async function onOldbookPicked(data) {
    if (!data || data.action !== google.picker.Action.PICKED) return;
    const doc = data.docs && data.docs[0];
    if (!doc || !doc.id) return;
    if (doc.name && doc.name !== OLDBOOK_FILE_NAME) {
        alert(`Это не книга Oldbook. Выберите файл ${OLDBOOK_FILE_NAME}.`);
        return;
    }
    if (doc.id === localStorage.getItem(OB_KEYS.mirrorId)) {
        alert('Это ваша собственная книга.');
        return;
    }
    if (oldbookLinks.some(l => l.id === doc.id)) {
        showToast('Эта книга уже подключена');
        return;
    }
    oldbookLinks.push({ id: doc.id, addedAt: Date.now() });
    updateUI(true);
    try {
        await refreshLinkedOldbooks(true);
        showToast('Книга подключена: записи будут обновляться при синхронизации');
    } catch (e) {
        showToast('Книга подключена, данные загрузятся при следующей синхронизации');
    }
}

function removeOldbookLink(id) {
    if (!confirm('Отключить эту книгу? Её записи перестанут показываться у вас (у владельца ничего не удалится).')) return;
    oldbookLinks = oldbookLinks.filter(l => l.id !== id);
    const cache = oldbookRemoteCache();
    delete cache[id];
    saveOldbookRemoteCache(cache);
    updateUI(true);
    if (typeof playSound === 'function') playSound('close');
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
