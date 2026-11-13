// --- АККАУНТ MY MONEY: регистрация по почте и паролю для любого пользователя (4.13.0) ---
// Вход не через Google: любой человек заводит аккаунт своей почтой и паролем, данные хранятся в облаке Firebase
// (проект money99774 — тот же, что раньше был у входа по email; js/cloud.js → LEGACY_FIREBASE_CONFIG).
// Где лежат данные: Realtime Database, ветка users/<uid>/mm — весь снимок данных (как файл на Google Диске) строкой JSON.
// Правила базы пускают каждого только в свою ветку users/<uid>: чужие данные не прочитать.
// Синхронизация та же, что с Google Диском (mergeSnapshots из js/cloud.js): записи сливаются поштучно, удаления — «надгробиями».
// Можно пользоваться и аккаунтом, и Google Диском одновременно — данные сольются в обоих местах.
// Старые данные: если в аккаунте лежат записи прежней версии (users/<uid>/tx, subs…), при первом входе они переносятся сами.
// Фото чеков и свои звуки остаются только на Google Диске (в аккаунт не загружаются — слишком большие).

const ACCOUNT_APP_NAME = 'mm-account'; // отдельный экземпляр Firebase: не мешает переносу из старого аккаунта (js/cloud.js)
const ACCOUNT_KEYS = { lastRemote: 'finance_acct_remote_at', lastLocal: 'finance_acct_local_hash', lastSync: 'finance_acct_last_sync', user: 'finance_acct_user' };

let acctApp = null;
let acctUser = null;            // { uid, email, name, verified }
let acctReady = false;          // Firebase загружен и сообщил, кто вошёл
let acctSyncRunning = false;
let acctSyncAgain = false;
let acctSyncTimer = null;
let acctStatus = { state: 'off', message: '' };
let acctMode = 'login';         // 'login' | 'register' | 'reset'

function acctConfig() {
    return (window.MONEY_CONFIG && window.MONEY_CONFIG.firebase) || (typeof LEGACY_FIREBASE_CONFIG !== 'undefined' ? LEGACY_FIREBASE_CONFIG : null);
}

// Короткий хэш строки — чтобы не хранить весь снимок ради сравнения «изменилось ли что-то»
function acctHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + str.length;
}

async function loadAccountSdk() {
    if (acctApp) return acctApp;
    for (const src of LEGACY_FIREBASE_SCRIPTS) await loadScriptOnce(src);
    const existing = firebase.apps.find(a => a.name === ACCOUNT_APP_NAME);
    acctApp = existing || firebase.initializeApp(acctConfig(), ACCOUNT_APP_NAME);
    try { acctApp.auth().languageCode = (typeof appLang !== 'undefined' && appLang !== 'ru-old') ? appLang : 'ru'; } catch (e) {}
    return acctApp;
}

function acctUserFrom(u) {
    return u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', verified: !!u.emailVerified } : null;
}

// ---------- Понятные сообщения об ошибках ----------
function acctErrorText(e) {
    const code = String((e && e.code) || '');
    const map = {
        'auth/email-already-in-use': 'Аккаунт с этой почтой уже есть. Нажмите «Вход» или «Забыли пароль?».',
        'auth/invalid-email': 'Почта записана неправильно.',
        'auth/weak-password': 'Слишком простой пароль: нужно не меньше 6 символов.',
        'auth/missing-password': 'Введите пароль.',
        'auth/wrong-password': 'Неверная почта или пароль.',
        'auth/user-not-found': 'Неверная почта или пароль.',
        'auth/invalid-credential': 'Неверная почта или пароль.',
        'auth/invalid-login-credentials': 'Неверная почта или пароль.',
        'auth/user-disabled': 'Этот аккаунт отключён.',
        'auth/too-many-requests': 'Слишком много попыток. Подождите несколько минут и попробуйте снова.',
        'auth/network-request-failed': 'Нет связи с сервером. Проверьте интернет.',
        'auth/requires-recent-login': 'Для этого действия войдите заново: выйдите и войдите в аккаунт, затем повторите.',
        'PERMISSION_DENIED': 'Нет доступа к данным аккаунта. Выйдите и войдите снова.'
    };
    if (map[code]) return map[code];
    if (/permission/i.test(String(e && e.message))) return map.PERMISSION_DENIED;
    return 'Ошибка: ' + ((e && e.message) || e);
}

function acctSetMsg(text, ok = false) {
    const el = document.getElementById('acct-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-ok', !!ok);
    el.style.display = text ? '' : 'none';
}

function acctVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function acctBusy(on) {
    document.querySelectorAll('#account-section button').forEach(b => { b.disabled = !!on; });
}

// ---------- Вход, регистрация, пароль ----------
function acctSwitch(mode) {
    acctMode = mode;
    acctSetMsg('');
    renderAccountUi();
    const first = document.getElementById(mode === 'register' ? 'acct-name' : 'acct-email');
    if (first) first.focus();
}

async function acctSubmit() {
    const email = acctVal('acct-email').trim();
    const pass = acctVal('acct-pass');
    if (!email) { acctSetMsg('Введите почту.'); return; }
    if (acctMode !== 'reset' && !pass) { acctSetMsg('Введите пароль.'); return; }
    if (acctMode === 'register') {
        if (pass.length < 6) { acctSetMsg('Пароль — не меньше 6 символов.'); return; }
        if (pass !== acctVal('acct-pass2')) { acctSetMsg('Пароли не совпадают.'); return; }
    }
    if (!navigator.onLine) { acctSetMsg('Нет интернета.'); return; }
    acctBusy(true);
    acctSetMsg(acctMode === 'register' ? 'Создаём аккаунт…' : acctMode === 'reset' ? 'Отправляем письмо…' : 'Входим…', true);
    try {
        const auth = (await loadAccountSdk()).auth();
        if (acctMode === 'reset') {
            await auth.sendPasswordResetEmail(email);
            acctSetMsg('Письмо для смены пароля отправлено на ' + email + '. Если его нет — проверьте «Спам».', true);
            acctMode = 'login';
            renderAccountUi();
            return;
        }
        if (acctMode === 'register') {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            const name = acctVal('acct-name').trim();
            if (name) { try { await cred.user.updateProfile({ displayName: name }); } catch (e) {} }
            try { await cred.user.sendEmailVerification(); } catch (e) {}
            if (name && typeof profileName !== 'undefined' && !profileName) {
                profileName = name;
                if (typeof updateUI === 'function') { try { updateUI(true); } catch (e) {} }
                if (typeof fillProfileInput === 'function') fillProfileInput();
            }
            onAccountChanged(cred.user);
            showToast('Аккаунт создан. Мы отправили письмо для подтверждения почты.');
        } else {
            const cred = await auth.signInWithEmailAndPassword(email, pass);
            onAccountChanged(cred.user);
            showToast('Вы вошли в аккаунт');
        }
        acctSetMsg('');
        ['acct-pass', 'acct-pass2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    } catch (e) {
        console.warn('Аккаунт:', e);
        acctSetMsg(acctErrorText(e));
    } finally {
        acctBusy(false);
    }
}

async function acctSignOut() {
    try { await (await loadAccountSdk()).auth().signOut(); } catch (e) {}
    onAccountChanged(null);
    showToast('Вы вышли из аккаунта. Данные остались на этом устройстве.');
}

async function acctResendVerification() {
    try {
        const u = (await loadAccountSdk()).auth().currentUser;
        if (!u) return;
        await u.sendEmailVerification();
        showToast('Письмо отправлено на ' + u.email);
    } catch (e) { showToast(acctErrorText(e)); }
}

// Проверить, подтвердил ли пользователь почту (после перехода по ссылке в письме)
async function acctRefreshUser() {
    try {
        const u = (await loadAccountSdk()).auth().currentUser;
        if (!u) return;
        await u.reload();
        onAccountChanged(u);
    } catch (e) {}
}

async function acctDelete() {
    const u = acctApp && acctApp.auth().currentUser;
    if (!u) return;
    const ok = window.confirm('Удалить аккаунт ' + u.email + ' и все его данные в облаке? На этом устройстве данные останутся. Отменить это нельзя.');
    if (!ok) return;
    acctBusy(true);
    try {
        await acctApp.database().ref('users/' + u.uid).remove();
        await u.delete();
        onAccountChanged(null);
        showToast('Аккаунт удалён');
    } catch (e) {
        showToast(acctErrorText(e));
    } finally {
        acctBusy(false);
    }
}

function acctTogglePass() {
    ['acct-pass', 'acct-pass2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.type = el.type === 'password' ? 'text' : 'password';
    });
    const ic = document.querySelector('#acct-eye .material-icons');
    const p = document.getElementById('acct-pass');
    if (ic && p) ic.textContent = p.type === 'password' ? 'visibility' : 'visibility_off';
}

function onAccountChanged(u) {
    if (u) acctReady = true; // пользователь пришёл от Firebase — вход восстановлен, можно синхронизировать
    const prev = acctUser && acctUser.uid;
    acctUser = acctUserFrom(u);
    if (!acctUser || acctUser.uid !== prev) {
        // другой аккаунт — сравнивать с прежним облаком нельзя
        [ACCOUNT_KEYS.lastRemote, ACCOUNT_KEYS.lastLocal].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    }
    // запомнить вход: при следующем открытии блок сразу показывает аккаунт, а Firebase подгружается сам
    try {
        if (acctUser) localStorage.setItem(ACCOUNT_KEYS.user, JSON.stringify(acctUser));
        else localStorage.removeItem(ACCOUNT_KEYS.user);
    } catch (e) {}
    acctStatus = { state: acctUser ? acctStatus.state : 'off', message: '' };
    renderAccountUi();
    if (acctUser && acctUser.uid !== prev) runAccountSync({ manual: true });
}

// ---------- Синхронизация ----------
function scheduleAccountSync(delay = 1500) {
    if (!acctUser) return;
    clearTimeout(acctSyncTimer);
    acctSyncTimer = setTimeout(() => runAccountSync(), delay);
}

// Старые данные (вход по email в прежних версиях лежал прямо в users/<uid>): считаются «самыми ранними»
function acctLegacySnapshot(data) {
    if (!data || (!data.tx && !data.subs)) return null;
    return {
        tx: asList(data.tx).map(t => ({ ...t, updatedAt: 1 })),
        subs: asList(data.subs).map(s => ({ ...s, updatedAt: 1 })),
        savings: data.savings, limit: data.limit, goal: data.goal,
        profile: { name: (typeof profileName !== 'undefined' && profileName) || '' }, scalarsAt: 0, deleted: {}
    };
}

async function runAccountSync({ manual = false } = {}) {
    if (!acctUser || !acctReady) return false; // вход ещё восстанавливается — синхронизация начнётся сама
    if (acctSyncRunning) { acctSyncAgain = true; return false; }
    if (!navigator.onLine) { setAccountStatus('offline'); return false; }
    acctSyncRunning = true;
    setAccountStatus('syncing');
    try {
        const db = (await loadAccountSdk()).database();
        const base = 'users/' + acctUser.uid;
        const remoteAt = (await db.ref(base + '/mm/updatedAt').once('value')).val() || 0;
        const localHash = acctHash(snapshotKey(localSnapshot()));
        const knownRemote = Number(localStorage.getItem(ACCOUNT_KEYS.lastRemote)) || 0;
        const knownLocal = localStorage.getItem(ACCOUNT_KEYS.lastLocal) || '';

        if (manual || !remoteAt || remoteAt !== knownRemote || localHash !== knownLocal) {
            let remote = null;
            if (remoteAt) {
                const v = (await db.ref(base + '/mm/json').once('value')).val();
                try { remote = v ? JSON.parse(v) : null; } catch (e) { remote = null; }
            } else {
                // первый вход в этот аккаунт с новой версией: подхватить данные старого входа по email, если есть
                const legacy = (await db.ref(base).once('value')).val();
                remote = acctLegacySnapshot(legacy);
            }
            const merged = remote ? mergeSnapshots(localSnapshot(), remote) : localSnapshot();
            if (snapshotKey(merged) !== snapshotKey(localSnapshot())) applySnapshot(merged);
            let newRemoteAt = remoteAt;
            if (!remoteAt || !remote || snapshotKey(merged) !== snapshotKey(remote)) {
                newRemoteAt = Date.now();
                await db.ref(base + '/mm').set({ json: JSON.stringify(merged), updatedAt: newRemoteAt, v: window.APP_VERSION || '' });
            }
            localStorage.setItem(ACCOUNT_KEYS.lastRemote, String(newRemoteAt));
            localStorage.setItem(ACCOUNT_KEYS.lastLocal, acctHash(snapshotKey(localSnapshot())));
            // изменения пришли из аккаунта — передать их и на Google Диск, если он подключён
            if (typeof cloudUser !== 'undefined' && cloudUser && snapshotKey(merged) !== snapshotKey(remote || {})) {
                try { localStorage.setItem(CLOUD_KEYS.dirty, '1'); } catch (e) {}
            }
        }
        localStorage.setItem(ACCOUNT_KEYS.lastSync, String(Date.now()));
        setAccountStatus('ok');
        return true;
    } catch (e) {
        console.warn('Синхронизация с аккаунтом не удалась', e);
        setAccountStatus('error', acctErrorText(e));
        return false;
    } finally {
        acctSyncRunning = false;
        if (acctSyncAgain) { acctSyncAgain = false; scheduleAccountSync(400); }
    }
}

// ---------- Интерфейс ----------
function setAccountStatus(state, message = '') {
    acctStatus = { state, message };
    renderAccountUi();
}

function renderAccountUi() {
    const out = document.getElementById('acct-logged-out');
    const inn = document.getElementById('acct-logged-in');
    if (!out || !inn) return;
    out.style.display = acctUser ? 'none' : '';
    inn.style.display = acctUser ? '' : 'none';

    if (!acctUser) {
        document.querySelectorAll('#account-section .acct-tab').forEach(b => b.classList.toggle('is-on', b.dataset.mode === (acctMode === 'reset' ? 'login' : acctMode)));
        const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
        show('acct-name-row', acctMode === 'register');
        show('acct-pass-row', acctMode !== 'reset');
        show('acct-pass2-row', acctMode === 'register');
        show('acct-forgot', acctMode === 'login');
        show('acct-back', acctMode === 'reset');
        const pass = document.getElementById('acct-pass');
        if (pass) pass.setAttribute('autocomplete', acctMode === 'register' ? 'new-password' : 'current-password');
        const btn = document.getElementById('acct-submit');
        if (btn) btn.innerHTML = acctMode === 'register'
            ? '<span class="material-icons">person_add</span> ' + acctT('Зарегистрироваться')
            : acctMode === 'reset'
                ? '<span class="material-icons">mail</span> ' + acctT('Прислать письмо для смены пароля')
                : '<span class="material-icons">login</span> ' + acctT('Войти');
        return;
    }

    const who = document.getElementById('acct-who');
    if (who) who.textContent = acctUser.email + (acctUser.name ? ` (${acctUser.name})` : '');
    const ver = document.getElementById('acct-verify');
    if (ver) ver.style.display = acctUser.verified ? 'none' : '';

    const last = Number(localStorage.getItem(ACCOUNT_KEYS.lastSync)) || 0;
    const lastText = last ? formatAlmaty({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(last)) : acctT('ещё не было');
    const texts = {
        ok: acctT('Синхронизировано. Последний раз:') + ' ' + lastText,
        syncing: acctT('Синхронизация…'),
        offline: acctT('Нет интернета. Изменения сохранены на устройстве и отправятся позже.'),
        error: acctStatus.message,
        off: acctT('Последняя синхронизация:') + ' ' + lastText
    };
    const st = document.getElementById('acct-status');
    if (st) {
        st.textContent = texts[acctStatus.state] || texts.off;
        st.className = 'hint cloud-status is-' + acctStatus.state;
    }
    const fab = document.querySelector('.fab-sync');
    if (fab && acctStatus.state === 'syncing') fab.classList.add('is-syncing');
}

// Перевод на язык приложения (js/i18n.js); на русском — как есть
function acctT(s) {
    try { if (typeof translateText === 'function') return translateText(s); } catch (e) {}
    return s;
}

function initAccount() {
    if (!acctConfig()) { renderAccountUi(); return; }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && acctUser && acctReady) runAccountSync(); });
    window.addEventListener('online', () => { if (acctUser && acctReady) runAccountSync(); });
    setInterval(() => { if (acctUser && acctReady && document.visibilityState === 'visible') runAccountSync(); }, 60000);

    // Firebase загружаем сразу, только если на этом устройстве уже входили; иначе — при первом нажатии «Войти»
    const cached = readJsonKey(ACCOUNT_KEYS.user, null);
    if (!cached || !cached.uid) { renderAccountUi(); return; }
    acctUser = cached;
    renderAccountUi();
    loadAccountSdk().then(app => {
        app.auth().onAuthStateChanged(u => {
            const first = !acctReady;
            acctReady = true;
            if ((u && u.uid) !== (acctUser && acctUser.uid)) onAccountChanged(u);
            else if (u) {
                acctUser = acctUserFrom(u);
                renderAccountUi();
                if (first) runAccountSync();
            }
        });
    }).catch(e => { console.warn('Аккаунт: Firebase не загрузился', e); setAccountStatus('error', acctErrorText(e)); });
}
