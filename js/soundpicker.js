// --- СВОИ ЗВУКИ ПОЛЬЗОВАТЕЛЯ ---
// Настройки → «Звуки» → «Выбрать звуки»: для каждого события можно выбрать свой файл, взять звук из «Моих звуков»,
// выключить звук или вернуть звук темы. Выбор делается для текущей темы или для всех тем сразу.
// Все добавленные файлы лежат в библиотеке «Мои звуки» (soundLibrary): на устройстве (IndexedDB) и на Google Диске
// (папка «My Money»). Библиотека и выбор (customSoundMeta, themeSoundMeta) синхронизируются с другими устройствами.
// Проигрывание — js/sound.js (playCustomSound).

const SOUND_DB_NAME = 'mymoney-sounds';
const SOUND_TRASH_KEY = 'finance_sound_trash'; // файлы на Диске, которые нужно удалить
const SOUND_MAX_BYTES = 1024 * 1024;
const SOUND_LONG_SLOTS = ['startup', 'appclose'];
const SOUND_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|webm|opus|flac)$/i;
const SOUND_ALL_THEMES = '*';

// ---------- Хранилище на устройстве (IndexedDB) ----------
let soundDbPromise = null;
function soundDb() {
    if (!soundDbPromise) {
        soundDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
            const req = indexedDB.open(SOUND_DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore('files');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return soundDbPromise;
}

async function soundDbRequest(mode, fn) {
    const db = await soundDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', mode);
        const req = fn(tx.objectStore('files'));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
    });
}

const soundFileGet = key => soundDbRequest('readonly', s => s.get(key)).catch(() => null);
const soundFilePut = (key, rec) => soundDbRequest('readwrite', s => s.put(rec, key));
const soundFileDelete = key => soundDbRequest('readwrite', s => s.delete(key)).catch(() => {});
const soundFilesClear = () => soundDbRequest('readwrite', s => s.clear()).catch(() => {});
const soundFileKeys = () => soundDbRequest('readonly', s => s.getAllKeys()).catch(() => []);

// ---------- Переход со старого формата (до 3.8: один файл на событие) ----------
// Старый выбор { name, mime, size, updatedAt, driveId } превращается в звук библиотеки с предсказуемым id,
// поэтому на разных устройствах получится один и тот же звук, а не копии.
function migrateLegacySounds() {
    let changed = false;
    Object.entries(customSoundMeta).forEach(([slot, meta]) => {
        if (!meta || meta.muted || meta.soundId || !meta.updatedAt) return;
        const id = 'sl' + slot + Number(meta.updatedAt).toString(36);
        if (!soundLibrary.some(s => s.id === id)) {
            const item = { id, name: String(meta.name || 'Звук').slice(0, 80), mime: meta.mime || 'audio/mpeg', size: Number(meta.size) || 0, addedAt: Number(meta.updatedAt) };
            if (meta.driveId) item.driveId = meta.driveId;
            soundLibrary.push(item);
        }
        // файл на устройстве переезжает с ключа события на id звука
        soundFileGet(slot).then(rec => {
            if (rec && rec.blob) return soundFilePut(id, { blob: rec.blob, name: rec.name, mime: rec.mime }).then(() => soundFileDelete(slot));
        }).catch(() => {});
        customSoundMeta[slot] = { soundId: id, updatedAt: meta.updatedAt };
        changed = true;
    });
    if (changed) persistSoundState();
}
migrateLegacySounds();

// ---------- Подготовка к проигрыванию ----------
const preparing = {};
async function prepareCustomSound(soundId) {
    if (!soundId || preparing[soundId] || customSoundBuffers[soundId]) return;
    preparing[soundId] = true;
    try {
        const rec = await soundFileGet(soundId);
        const ctx = getAudio();
        if (!rec || !rec.blob || !ctx) return;
        customSoundBuffers[soundId] = await ctx.decodeAudioData(await rec.blob.arrayBuffer());
    } catch (e) {
        console.warn('Свой звук не подготовлен:', soundId, e);
    } finally {
        preparing[soundId] = false;
    }
}

let allPrepared = false;
function prepareAllCustomSounds() {
    if (allPrepared) return;
    allPrepared = true;
    SOUND_SLOTS.forEach(s => {
        const meta = effectiveSoundMeta(s.id);
        if (meta && meta.soundId) prepareCustomSound(meta.soundId);
    });
}

// Вызывается, когда выбор звуков изменился (в том числе пришёл с другого устройства или сменилась тема)
function onCustomSoundsChanged() {
    migrateLegacySounds(); // выбор мог прийти со старой версии приложения на другом устройстве
    const ids = new Set(soundLibrary.map(s => s.id));
    Object.keys(customSoundBuffers).forEach(id => { if (!ids.has(id)) delete customSoundBuffers[id]; });
    allPrepared = false;
    persistSoundState();
    renderSoundPicker();
    renderSoundLibrary();
}

function persistSoundState() {
    try {
        localStorage.setItem('finance_custom_sounds', JSON.stringify(customSoundMeta));
        localStorage.setItem('finance_theme_sounds', JSON.stringify(themeSoundMeta));
        localStorage.setItem('finance_sound_lib', JSON.stringify(soundLibrary));
    } catch (e) {}
}
// старое имя функции (вызывается из других файлов)
const persistCustomSoundMeta = persistSoundState;

function queueDriveSoundDelete(driveId) {
    if (!driveId) return;
    try {
        const trash = JSON.parse(localStorage.getItem(SOUND_TRASH_KEY) || '[]');
        trash.push(driveId);
        localStorage.setItem(SOUND_TRASH_KEY, JSON.stringify(trash));
    } catch (e) {}
}

function soundById(id) {
    return soundLibrary.find(s => s.id === id) || null;
}

function soundSlotMaxSec(slot) {
    return SOUND_LONG_SLOTS.includes(slot) ? 10 : 3;
}

// ---------- Область выбора: текущая тема или все темы ----------
let soundScope = null; // null — текущая тема

function soundScopeId() {
    return soundScope || (typeof currentThemeId !== 'undefined' ? currentThemeId : SOUND_ALL_THEMES);
}

function soundScopeMap(scope = soundScopeId(), create = false) {
    if (scope === SOUND_ALL_THEMES) return customSoundMeta;
    if (!themeSoundMeta[scope] && create) themeSoundMeta[scope] = {};
    return themeSoundMeta[scope] || {};
}

function soundThemeName(themeId) {
    if (themeId === SOUND_ALL_THEMES) return 'все темы';
    try { const t = resolveTheme(themeId); if (t && t.id === themeId) return t.name; } catch (e) {}
    return 'удалённая тема';
}

function setSoundScope(value) {
    soundScope = value === 'theme' ? null : SOUND_ALL_THEMES;
    renderSoundPicker();
}

function commitSoundChange(slot) {
    // пустые наборы тем не храним
    Object.keys(themeSoundMeta).forEach(k => { if (!Object.keys(themeSoundMeta[k] || {}).length) delete themeSoundMeta[k]; });
    allPrepared = false;
    persistSoundState();
    updateUI(true); // выбор уходит на Google Диск, файлы загрузятся при синхронизации
    renderSoundPicker();
    renderSoundLibrary();
    if (slot) previewSoundSlot(slot);
}

// ---------- Библиотека «Мои звуки» ----------
async function decodeSoundFile(file) {
    if (!(String(file.type).startsWith('audio/') || SOUND_EXT_RE.test(file.name))) {
        alert('Этот файл не похож на звук. Подходят MP3, WAV, OGG, M4A, AAC, WEBM, OPUS, FLAC.');
        return null;
    }
    if (file.size > SOUND_MAX_BYTES) {
        alert(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Можно до 1 МБ — обрежьте звук или выберите короче.`);
        return null;
    }
    const ctx = getAudio();
    if (!ctx) { alert('Этот браузер не умеет проигрывать звуки.'); return null; }
    try {
        return await ctx.decodeAudioData(await file.arrayBuffer());
    } catch (e) {
        alert('Не удалось прочитать звук из файла. Попробуйте MP3 или WAV.');
        return null;
    }
}

// Добавляет файл в «Мои звуки». Возвращает звук библиотеки или null.
async function addSoundToLibrary(file, maxSec = 10) {
    if (!file) return null;
    const buffer = await decodeSoundFile(file);
    if (!buffer) return null;
    if (buffer.duration > maxSec + 0.05) {
        alert(`Звук длится ${buffer.duration.toFixed(1)} с. Здесь можно до ${maxSec} с.`);
        return null;
    }
    const id = 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const mime = file.type || 'audio/mpeg';
    try {
        await soundFilePut(id, { blob: file, name: file.name, mime });
    } catch (e) {
        alert('Не удалось сохранить звук на устройстве: ' + (e.message || e));
        return null;
    }
    const item = { id, name: file.name.slice(0, 80), mime, size: file.size, duration: Math.round(buffer.duration * 10) / 10, addedAt: Date.now() };
    soundLibrary.push(item);
    customSoundBuffers[id] = buffer;
    return item;
}

async function addSoundFromLibraryInput(file) {
    const item = await addSoundToLibrary(file, 10);
    if (!item) return;
    commitSoundChange();
    playSoundById(item.id);
    showToast(`«${item.name}» добавлен в «Мои звуки»`);
}

// Свой файл для события: попадает в «Мои звуки» и сразу выбирается
async function saveCustomSoundFile(slot, file) {
    const item = await addSoundToLibrary(file, soundSlotMaxSec(slot));
    if (!item) return;
    soundScopeMap(soundScopeId(), true)[slot] = { soundId: item.id, updatedAt: Date.now() };
    commitSoundChange(slot);
}

function assignSoundToSlot(slot, soundId) {
    const item = soundById(soundId);
    if (!item) return;
    if (item.duration && item.duration > soundSlotMaxSec(slot) + 0.05) {
        alert(`«${item.name}» длится ${item.duration} с, а для этого события можно до ${soundSlotMaxSec(slot)} с.`);
        return;
    }
    soundScopeMap(soundScopeId(), true)[slot] = { soundId, updatedAt: Date.now() };
    closeSoundLibrary(false);
    commitSoundChange(slot);
}

function muteSoundSlot(slot) {
    soundScopeMap(soundScopeId(), true)[slot] = { muted: true, updatedAt: Date.now() };
    commitSoundChange();
}

function resetSoundSlot(slot) {
    delete soundScopeMap(soundScopeId())[slot];
    commitSoundChange(slot);
}

function previewSoundSlot(slot) {
    if (slot === 'startup') { playStartupChime(true); return; }
    playSound(slot);
}

async function playSoundById(id) {
    const ctx = getAudio();
    if (!ctx) return;
    if (!customSoundBuffers[id]) await prepareCustomSound(id);
    const buffer = customSoundBuffers[id];
    if (!buffer) { showToast('Звук ещё не скачан с Google Диска — он появится после синхронизации'); return; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 1.4;
    src.connect(g);
    g.connect(masterGain);
    src.start();
}

// Где используется звук: «Аэро: Нажатие кнопок», «Все темы: Прокрутка»
function soundUsage(id) {
    const out = [];
    const scan = (map, themeId) => SOUND_SLOTS.forEach(s => {
        if (map[s.id] && map[s.id].soundId === id) out.push(`${capitalizeRu(soundThemeName(themeId))}: ${s.name}`);
    });
    scan(customSoundMeta, SOUND_ALL_THEMES);
    Object.entries(themeSoundMeta).forEach(([themeId, map]) => scan(map || {}, themeId));
    return out;
}

function deleteLibrarySound(id) {
    const item = soundById(id);
    if (!item) return;
    const used = soundUsage(id);
    if (!confirm(`Удалить «${item.name}» из «Моих звуков»?` + (used.length ? `\n\nОн выбран здесь: ${used.join('; ')}. Там снова зазвучит звук темы.` : '') +
        '\n\nФайл удалится и с Google Диска.')) return;
    soundLibrary = soundLibrary.filter(s => s.id !== id);
    const drop = map => Object.keys(map).forEach(slot => { if (map[slot] && map[slot].soundId === id) delete map[slot]; });
    drop(customSoundMeta);
    Object.values(themeSoundMeta).forEach(m => drop(m || {}));
    queueDriveSoundDelete(item.driveId);
    delete customSoundBuffers[id];
    soundFileDelete(id);
    commitSoundChange();
}

function renameLibrarySound(id) {
    const item = soundById(id);
    if (!item) return;
    const name = prompt('Название звука', item.name);
    if (name === null) return;
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return;
    item.name = clean;
    commitSoundChange();
}

function clearCustomSoundsLocal() {
    soundLibrary.forEach(s => queueDriveSoundDelete(s.driveId));
    Object.values(customSoundMeta).forEach(m => m && queueDriveSoundDelete(m.driveId)); // старый формат
    customSoundMeta = {};
    themeSoundMeta = {};
    soundLibrary = [];
    Object.keys(customSoundBuffers).forEach(k => delete customSoundBuffers[k]);
    soundFilesClear();
    persistSoundState();
}

// ---------- Окно «Выбрать звуки» ----------
function soundSlotStatus(slot) {
    const map = soundScopeMap();
    const own = map[slot];
    const scope = soundScopeId();
    if (!own) {
        // в теме ничего не выбрано — может действовать общий выбор
        if (scope !== SOUND_ALL_THEMES && customSoundMeta[slot]) {
            const g = customSoundMeta[slot];
            if (g.muted) return { text: 'Как для всех тем: без звука', cls: 'is-muted' };
            const it = soundById(g.soundId);
            return { text: 'Как для всех тем: ' + (it ? it.name : 'свой звук'), cls: 'is-custom is-inherited' };
        }
        return { text: 'Звук темы', cls: '' };
    }
    if (own.muted) return { text: 'Без звука', cls: 'is-muted' };
    const it = soundById(own.soundId);
    if (!it) return { text: 'Свой звук (ещё не скачан)', cls: 'is-custom' };
    const cloud = it.driveId ? ' · на Google Диске' : (isCloudConnected() ? ' · загрузится на Диск' : ' · только на этом устройстве');
    return { text: 'Свой: ' + it.name + cloud, cls: 'is-custom' };
}

function openSoundPicker() {
    closeSoundPicker(false);
    soundScope = null;
    const overlay = document.createElement('div');
    overlay.id = 'sound-picker';
    overlay.className = 'export-sheet-overlay sound-picker-overlay';
    overlay.innerHTML = `
        <div class="export-sheet sound-picker" role="dialog" aria-modal="true" aria-label="Выбрать звуки">
            <div class="export-sheet-head">
                <h3>Выбрать звуки</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">Форматы: MP3, WAV, OGG, M4A и другие, до 1 МБ. Длина: до 10 с для открытия и закрытия приложения, до 3 с для остальных. <span class="material-icons inline-icon">folder_open</span> — новый файл, <span class="material-icons inline-icon">library_music</span> — звук из «Моих звуков». Всё сохраняется на Google Диске.</p>
            <div class="sound-scope" id="sound-scope"></div>
            <div class="sound-slots" id="sound-slots"></div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-secondary" onclick="openSoundLibrary()"><span class="material-icons">library_music</span> Мои звуки</button>
                <button type="button" class="btn-primary" data-act="close"><span class="material-icons">check</span> Готово</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) closeSoundPicker(true);
    });
    document.body.appendChild(overlay);
    renderSoundPicker();
    playSound('open');
}

function closeSoundPicker(withSound) {
    const el = document.getElementById('sound-picker');
    if (!el) return;
    el.remove();
    if (withSound) playSound('close');
}

function renderSoundPicker() {
    const box = document.getElementById('sound-slots');
    if (!box) return;
    const scopeBox = document.getElementById('sound-scope');
    const scope = soundScopeId();
    if (scopeBox) {
        const themeName = soundThemeName(typeof currentThemeId !== 'undefined' ? currentThemeId : '');
        scopeBox.innerHTML = `
            <label class="sound-scope-opt"><input type="radio" name="sound-scope" value="theme" ${scope !== SOUND_ALL_THEMES ? 'checked' : ''} onchange="setSoundScope(this.value)"> Для темы «${escapeHtml(themeName)}»</label>
            <label class="sound-scope-opt"><input type="radio" name="sound-scope" value="all" ${scope === SOUND_ALL_THEMES ? 'checked' : ''} onchange="setSoundScope(this.value)"> Для всех тем</label>`;
    }
    box.innerHTML = SOUND_SLOTS.map(s => {
        const st = soundSlotStatus(s.id);
        return `<div class="sound-slot">
            <div class="sound-slot-info">
                <b>${s.name}</b>
                <span class="sound-slot-status ${st.cls}">${escapeHtml(st.text)}</span>
            </div>
            <div class="sound-slot-actions">
                <label class="btn-secondary sound-file-btn" title="Новый файл"><span class="material-icons">folder_open</span> Файл
                    <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.opus,.flac" onchange="saveCustomSoundFile('${s.id}', this.files[0]); this.value='';">
                </label>
                <button type="button" class="btn-secondary sound-lib-btn" onclick="openSoundLibrary('${s.id}')" title="Мои звуки" aria-label="Выбрать из моих звуков"><span class="material-icons">library_music</span> Мои</button>
                <button type="button" class="btn-secondary" onclick="previewSoundSlot('${s.id}')" aria-label="Прослушать"><span class="material-icons">play_arrow</span></button>
                <button type="button" class="btn-secondary" onclick="muteSoundSlot('${s.id}')" aria-label="Без звука"><span class="material-icons">volume_off</span></button>
                <button type="button" class="btn-secondary" onclick="resetSoundSlot('${s.id}')" aria-label="Звук темы"><span class="material-icons">restart_alt</span></button>
            </div>
        </div>`;
    }).join('');
}

// ---------- Окно «Мои звуки» ----------
// pickSlot — событие, для которого выбирают звук (из «Выбрать звуки»); без него окно просто показывает библиотеку.
let soundLibraryPickSlot = '';

function openSoundLibrary(pickSlot = '') {
    closeSoundLibrary(false);
    soundLibraryPickSlot = pickSlot;
    const slotInfo = SOUND_SLOTS.find(s => s.id === pickSlot);
    const overlay = document.createElement('div');
    overlay.id = 'sound-library';
    overlay.className = 'export-sheet-overlay sound-library-overlay';
    overlay.innerHTML = `
        <div class="export-sheet sound-library" role="dialog" aria-modal="true" aria-label="Мои звуки">
            <div class="export-sheet-head">
                <h3>${slotInfo ? 'Мои звуки → ' + escapeHtml(slotInfo.name) : 'Мои звуки'}</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">${slotInfo
                ? `Нажмите «Выбрать», чтобы поставить звук на «${escapeHtml(slotInfo.name)}» (${soundScopeId() === SOUND_ALL_THEMES ? 'для всех тем' : 'для темы «' + escapeHtml(soundThemeName(soundScopeId())) + '»'}).`
                : 'Все звуки, которые вы добавили. Они хранятся на Google Диске и доступны на всех ваших устройствах.'}</p>
            <div class="sound-lib-list" id="sound-lib-list"></div>
            <div class="export-sheet-actions">
                <label class="btn-secondary sound-file-btn"><span class="material-icons">add</span> Добавить звук
                    <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.opus,.flac" onchange="addSoundFromLibraryInput(this.files[0]); this.value='';">
                </label>
                <button type="button" class="btn-primary" data-act="close"><span class="material-icons">check</span> Готово</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) closeSoundLibrary(true);
    });
    document.body.appendChild(overlay);
    renderSoundLibrary();
    playSound('open');
}

function closeSoundLibrary(withSound) {
    const el = document.getElementById('sound-library');
    if (!el) return;
    el.remove();
    soundLibraryPickSlot = '';
    if (withSound) playSound('close');
}

function renderSoundLibrary() {
    const box = document.getElementById('sound-lib-list');
    const count = document.getElementById('sound-lib-count');
    if (count) count.textContent = soundLibrary.length ? `(${soundLibrary.length})` : '';
    if (!box) return;
    if (!soundLibrary.length) {
        box.innerHTML = '<p class="hint sound-lib-empty">Пока нет своих звуков. Нажмите «Добавить звук» или выберите файл для события в «Выбрать звуки».</p>';
        return;
    }
    const pick = soundLibraryPickSlot;
    box.innerHTML = [...soundLibrary].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map(s => {
        const used = soundUsage(s.id);
        const tooLong = pick && s.duration && s.duration > soundSlotMaxSec(pick) + 0.05;
        const info = [s.duration ? s.duration.toString().replace('.', ',') + ' с' : '', s.size ? Math.max(1, Math.round(s.size / 1024)) + ' КБ' : '',
            s.driveId ? 'на Google Диске' : (isCloudConnected() ? 'загрузится на Диск' : 'на этом устройстве')].filter(Boolean).join(' · ');
        return `<div class="sound-lib-item">
            <span class="material-icons sound-lib-icon">audiotrack</span>
            <div class="sound-lib-info">
                <b>${escapeHtml(s.name)}</b>
                <span class="sound-slot-status">${escapeHtml(info)}</span>
                <span class="sound-slot-status ${used.length ? 'is-custom' : ''}">${used.length ? 'Выбран: ' + escapeHtml(used.join('; ')) : 'Нигде не выбран'}</span>
            </div>
            <div class="sound-slot-actions">
                <button type="button" class="btn-secondary" onclick="playSoundById('${s.id}')" aria-label="Прослушать"><span class="material-icons">play_arrow</span></button>
                ${pick ? `<button type="button" class="btn-primary" ${tooLong ? 'disabled title="Слишком длинный для этого события"' : ''} onclick="assignSoundToSlot('${pick}', '${s.id}')"><span class="material-icons">check</span> Выбрать</button>` : `
                <button type="button" class="btn-secondary" onclick="renameLibrarySound('${s.id}')" aria-label="Переименовать"><span class="material-icons">edit</span></button>
                <button type="button" class="btn-secondary" onclick="deleteLibrarySound('${s.id}')" aria-label="Удалить"><span class="material-icons">delete</span></button>`}
            </div>
        </div>`;
    }).join('');
}

// ---------- Синхронизация файлов с Google Диском (вызывается из runCloudSync) ----------
async function uploadSoundFile(item, rec) {
    const folderId = await ensureDriveFolder();
    const boundary = 'mymoney' + Date.now();
    const meta = {
        name: `sound_${item.name}`.slice(0, 120),
        mimeType: rec.mime || item.mime || 'audio/mpeg',
        parents: [folderId],
        description: 'Свой звук приложения My Money'
    };
    const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
        rec.blob,
        `\r\n--${boundary}--`
    ]);
    const r = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body
    });
    return r.json();
}

async function syncCustomSoundFiles() {
    let changed = false;
    for (const item of soundLibrary) {
        const rec = await soundFileGet(item.id);
        if (!item.driveId) {
            // добавлен на этом устройстве — загрузить на Диск
            if (rec && rec.blob) {
                const f = await uploadSoundFile(item, rec);
                item.driveId = f.id;
                changed = true;
            }
        } else if (!rec || !rec.blob) {
            // добавлен на другом устройстве — скачать
            try {
                const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(item.driveId)}?alt=media`);
                const blob = await r.blob();
                await soundFilePut(item.id, { blob, name: item.name, mime: item.mime });
                delete customSoundBuffers[item.id];
                allPrepared = false;
            } catch (e) {
                if (e.code === 'auth') throw e;
                console.warn('Свой звук не скачан с Диска:', item.name, e);
            }
        }
    }
    // Файлы на устройстве, которых больше нет в библиотеке (удалены на другом устройстве)
    const ids = new Set(soundLibrary.map(s => s.id));
    const slotKeys = new Set(SOUND_SLOTS.map(s => s.id));
    (await soundFileKeys()).forEach(k => { if (!ids.has(k) && !slotKeys.has(k)) soundFileDelete(k); });
    // Файлы на Диске, которые удалили
    let trash = [];
    try { trash = JSON.parse(localStorage.getItem(SOUND_TRASH_KEY) || '[]'); } catch (e) {}
    const left = [];
    for (const id of trash) {
        try {
            await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch (e) {
            if (e.code === 'auth') { left.push(id); continue; }
            // 404 и т. п. — файла уже нет, забываем
        }
    }
    localStorage.setItem(SOUND_TRASH_KEY, JSON.stringify(left));
    if (changed) {
        persistSoundState();
        updateUI(true); // отправить новые id файлов на Диск следующей синхронизацией
        renderSoundPicker();
        renderSoundLibrary();
    }
}
