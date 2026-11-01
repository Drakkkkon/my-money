// --- СВОИ ЗВУКИ ПОЛЬЗОВАТЕЛЯ ---
// Настройки → «Звуки» → «Выбрать звуки»: для каждого события можно выбрать свой файл, выключить звук
// или вернуть звук темы. Файлы хранятся на устройстве (IndexedDB) и на Google Диске (папка «My Money»),
// а выбор (customSoundMeta) синхронизируется с другими устройствами вместе с остальными данными.
// Проигрывание — js/sound.js (playCustomSound).

const SOUND_DB_NAME = 'mymoney-sounds';
const SOUND_TRASH_KEY = 'finance_sound_trash'; // файлы на Диске, которые нужно удалить после замены
const SOUND_MAX_BYTES = 1024 * 1024;
const SOUND_LONG_SLOTS = ['startup', 'appclose'];
const SOUND_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|webm|opus|flac)$/i;

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

const soundFileGet = slot => soundDbRequest('readonly', s => s.get(slot)).catch(() => null);
const soundFilePut = (slot, rec) => soundDbRequest('readwrite', s => s.put(rec, slot));
const soundFileDelete = slot => soundDbRequest('readwrite', s => s.delete(slot)).catch(() => {});
const soundFilesClear = () => soundDbRequest('readwrite', s => s.clear()).catch(() => {});

// ---------- Подготовка к проигрыванию ----------
const preparing = {};
async function prepareCustomSound(slot) {
    const meta = customSoundMeta[slot];
    if (!meta || meta.muted || preparing[slot]) return;
    const cached = customSoundBuffers[slot];
    if (cached && cached.updatedAt === meta.updatedAt) return;
    preparing[slot] = true;
    try {
        const rec = await soundFileGet(slot);
        const ctx = getAudio();
        if (!rec || rec.updatedAt !== meta.updatedAt || !ctx) return;
        const buffer = await ctx.decodeAudioData(await rec.blob.arrayBuffer());
        customSoundBuffers[slot] = { updatedAt: meta.updatedAt, buffer };
    } catch (e) {
        console.warn('Свой звук не подготовлен:', slot, e);
    } finally {
        preparing[slot] = false;
    }
}

let allPrepared = false;
function prepareAllCustomSounds() {
    if (allPrepared) return;
    allPrepared = true;
    SOUND_SLOTS.forEach(s => prepareCustomSound(s.id));
}

// Вызывается, когда выбор звуков изменился (в том числе пришёл с другого устройства)
function onCustomSoundsChanged() {
    Object.keys(customSoundBuffers).forEach(slot => {
        const meta = customSoundMeta[slot];
        if (!meta || meta.muted || customSoundBuffers[slot].updatedAt !== meta.updatedAt) delete customSoundBuffers[slot];
    });
    allPrepared = false;
    renderSoundPicker();
}

function persistCustomSoundMeta() {
    try { localStorage.setItem('finance_custom_sounds', JSON.stringify(customSoundMeta)); } catch (e) {}
}

function queueDriveSoundDelete(meta) {
    if (!meta || !meta.driveId) return;
    try {
        const trash = JSON.parse(localStorage.getItem(SOUND_TRASH_KEY) || '[]');
        trash.push(meta.driveId);
        localStorage.setItem(SOUND_TRASH_KEY, JSON.stringify(trash));
    } catch (e) {}
}

// ---------- Действия пользователя ----------
async function saveCustomSoundFile(slot, file) {
    if (!file) return;
    const slotInfo = SOUND_SLOTS.find(s => s.id === slot);
    if (!(String(file.type).startsWith('audio/') || SOUND_EXT_RE.test(file.name))) {
        alert('Этот файл не похож на звук. Подходят MP3, WAV, OGG, M4A, AAC, WEBM, OPUS, FLAC.');
        return;
    }
    if (file.size > SOUND_MAX_BYTES) {
        alert(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Можно до 1 МБ — обрежьте звук или выберите короче.`);
        return;
    }
    const ctx = getAudio();
    if (!ctx) {
        alert('Этот браузер не умеет проигрывать звуки.');
        return;
    }
    let buffer;
    try {
        buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch (e) {
        alert('Не удалось прочитать звук из файла. Попробуйте MP3 или WAV.');
        return;
    }
    const maxSec = SOUND_LONG_SLOTS.includes(slot) ? 10 : 3;
    if (buffer.duration > maxSec + 0.05) {
        alert(`Звук длится ${buffer.duration.toFixed(1)} с. Для «${slotInfo.name}» можно до ${maxSec} с.`);
        return;
    }

    const updatedAt = Date.now();
    const mime = file.type || 'audio/mpeg';
    try {
        await soundFilePut(slot, { blob: file, updatedAt, name: file.name, mime });
    } catch (e) {
        alert('Не удалось сохранить звук на устройстве: ' + (e.message || e));
        return;
    }
    queueDriveSoundDelete(customSoundMeta[slot]);
    customSoundMeta[slot] = { name: file.name.slice(0, 80), mime, size: file.size, updatedAt };
    customSoundBuffers[slot] = { updatedAt, buffer };
    persistCustomSoundMeta();
    updateUI(true); // выбор уходит на Google Диск, файл загрузится при синхронизации
    renderSoundPicker();
    previewSoundSlot(slot);
}

function muteSoundSlot(slot) {
    queueDriveSoundDelete(customSoundMeta[slot]);
    customSoundMeta[slot] = { muted: true, updatedAt: Date.now() };
    delete customSoundBuffers[slot];
    soundFileDelete(slot);
    persistCustomSoundMeta();
    updateUI(true);
    renderSoundPicker();
}

function resetSoundSlot(slot) {
    queueDriveSoundDelete(customSoundMeta[slot]);
    delete customSoundMeta[slot];
    delete customSoundBuffers[slot];
    soundFileDelete(slot);
    persistCustomSoundMeta();
    updateUI(true);
    renderSoundPicker();
    previewSoundSlot(slot);
}

function previewSoundSlot(slot) {
    if (slot === 'startup') { playStartupChime(true); return; }
    playSound(slot);
}

function clearCustomSoundsLocal() {
    Object.values(customSoundMeta).forEach(queueDriveSoundDelete);
    customSoundMeta = {};
    Object.keys(customSoundBuffers).forEach(k => delete customSoundBuffers[k]);
    soundFilesClear();
    persistCustomSoundMeta();
}

// ---------- Окно «Выбрать звуки» ----------
function soundSlotStatus(slot) {
    const meta = customSoundMeta[slot];
    if (!meta) return { text: 'Звук темы', cls: '' };
    if (meta.muted) return { text: 'Без звука', cls: 'is-muted' };
    const cloud = meta.driveId ? ' · на Google Диске' : (isCloudConnected() ? ' · загрузится на Диск' : ' · только на этом устройстве');
    return { text: 'Свой: ' + meta.name + cloud, cls: 'is-custom' };
}

function openSoundPicker() {
    closeSoundPicker(false);
    const overlay = document.createElement('div');
    overlay.id = 'sound-picker';
    overlay.className = 'export-sheet-overlay sound-picker-overlay';
    overlay.innerHTML = `
        <div class="export-sheet sound-picker" role="dialog" aria-modal="true" aria-label="Выбрать звуки">
            <div class="export-sheet-head">
                <h3>Выбрать звуки</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">Форматы: MP3, WAV, OGG, M4A и другие, до 1 МБ. Длина: до 10 с для открытия и закрытия приложения, до 3 с для остальных. Свои звуки сохраняются на Google Диске и появятся на ваших устройствах после синхронизации.</p>
            <div class="sound-slots" id="sound-slots"></div>
            <div class="export-sheet-actions">
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
    box.innerHTML = SOUND_SLOTS.map(s => {
        const st = soundSlotStatus(s.id);
        return `<div class="sound-slot">
            <div class="sound-slot-info">
                <b>${s.name}</b>
                <span class="sound-slot-status ${st.cls}">${escapeHtml(st.text)}</span>
            </div>
            <div class="sound-slot-actions">
                <label class="btn-secondary sound-file-btn"><span class="material-icons">folder_open</span> Файл
                    <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.opus,.flac" onchange="saveCustomSoundFile('${s.id}', this.files[0]); this.value='';">
                </label>
                <button type="button" class="btn-secondary" onclick="previewSoundSlot('${s.id}')" aria-label="Прослушать"><span class="material-icons">play_arrow</span></button>
                <button type="button" class="btn-secondary" onclick="muteSoundSlot('${s.id}')" aria-label="Без звука"><span class="material-icons">volume_off</span></button>
                <button type="button" class="btn-secondary" onclick="resetSoundSlot('${s.id}')" aria-label="Звук темы"><span class="material-icons">restart_alt</span></button>
            </div>
        </div>`;
    }).join('');
}

// ---------- Синхронизация файлов с Google Диском (вызывается из runCloudSync) ----------
async function uploadSoundFile(slot, rec) {
    const folderId = await ensureDriveFolder();
    const boundary = 'mymoney' + Date.now();
    const meta = {
        name: `sound_${slot}_${rec.name}`.slice(0, 120),
        mimeType: rec.mime || 'audio/mpeg',
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
    for (const s of SOUND_SLOTS) {
        const meta = customSoundMeta[s.id];
        if (!meta || meta.muted) continue;
        const rec = await soundFileGet(s.id);
        if (!meta.driveId) {
            // выбран на этом устройстве — загрузить на Диск
            if (rec && rec.updatedAt === meta.updatedAt) {
                const f = await uploadSoundFile(s.id, rec);
                meta.driveId = f.id;
                changed = true;
            }
        } else if (!rec || rec.updatedAt !== meta.updatedAt) {
            // выбран на другом устройстве — скачать
            const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(meta.driveId)}?alt=media`);
            const blob = await r.blob();
            await soundFilePut(s.id, { blob, updatedAt: meta.updatedAt, name: meta.name, mime: meta.mime });
            delete customSoundBuffers[s.id];
            prepareCustomSound(s.id);
        }
    }
    // Старые файлы, которые заменили или убрали
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
        persistCustomSoundMeta();
        updateUI(true); // отправить новые id файлов на Диск следующей синхронизацией
        renderSoundPicker();
    }
}
