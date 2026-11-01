// --- ЗВУКИ ИНТЕРФЕЙСА ---
// Все звуки синтезируются Web Audio API прямо в браузере: без звуковых файлов и без чужой музыки.
// Мелодия при запуске — собственная короткая мелодия в духе 90-х (не копия чьей-либо заставки).
// Браузеры разрешают звук только после первого касания или нажатия, поэтому мелодия звучит при разблокировке.

const SOUND_KEY = 'finance_sound';
const STARTUP_SOUND_KEY = 'finance_sound_startup';
let audioCtx = null;
let masterGain = null;
let startupPlayed = false;

function soundEnabled() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
}

function startupSoundEnabled() {
    return localStorage.getItem(STARTUP_SOUND_KEY) !== 'off';
}

function getAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
        // Общая громкость и мягкий фильтр, чтобы звуки были приятными, а не резкими
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 5200;
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(filter);
        filter.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

// Один тон с плавной атакой и затуханием
function tone(ctx, { freq, start = 0, dur = 0.1, type = 'sine', gain = 0.2, attack = 0.005, endFreq = null, dest = null }) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

// Короткий «щелчок» механической кнопки: шумовой импульс + высокий тик
function clickNoise(ctx) {
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(hp);
    hp.connect(g);
    g.connect(masterGain);
    src.start();
}

function playSound(name) {
    if (!soundEnabled()) return;
    const ctx = getAudio();
    if (!ctx) return;
    try {
        if (name === 'click') {
            clickNoise(ctx);
            tone(ctx, { freq: 2400, dur: 0.03, type: 'triangle', gain: 0.06 });
        } else if (name === 'open') {
            tone(ctx, { freq: 587, dur: 0.09, type: 'triangle', gain: 0.16 });
            tone(ctx, { freq: 880, start: 0.07, dur: 0.14, type: 'triangle', gain: 0.14 });
        } else if (name === 'close') {
            tone(ctx, { freq: 880, dur: 0.08, type: 'triangle', gain: 0.14 });
            tone(ctx, { freq: 587, start: 0.06, dur: 0.14, type: 'triangle', gain: 0.13 });
        } else if (name === 'success') {
            tone(ctx, { freq: 784, dur: 0.09, type: 'triangle', gain: 0.14 });
            tone(ctx, { freq: 1047, start: 0.08, dur: 0.16, type: 'triangle', gain: 0.14 });
        } else if (name === 'error') {
            tone(ctx, { freq: 220, dur: 0.18, type: 'square', gain: 0.07 });
        }
    } catch (e) {
        // звук не критичен для работы приложения
    }
}

// Собственная мелодия заставки: мягкое восходящее арпеджио и аккорд (около 2,5 секунды)
function playStartupChime(force = false) {
    if (!force && (!soundEnabled() || !startupSoundEnabled() || startupPlayed)) return;
    const ctx = getAudio();
    if (!ctx) return;
    startupPlayed = true;
    try {
        // Простое «эхо» для объёма
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.18;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.28;
        const wet = ctx.createGain();
        wet.gain.value = 0.35;
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(masterGain);
        const bus = ctx.createGain();
        bus.gain.value = 1;
        bus.connect(masterGain);
        bus.connect(delay);

        // Ми-бемоль мажор с добавленными нотами: Eb4, G4, Bb4, D5, F5
        const arpeggio = [311.13, 392.0, 466.16, 587.33, 698.46];
        arpeggio.forEach((f, i) => {
            tone(ctx, { freq: f, start: i * 0.13, dur: 0.9, type: 'triangle', gain: 0.11, attack: 0.02, dest: bus });
        });
        // Финальный аккорд
        [155.56, 311.13, 466.16, 587.33, 783.99].forEach(f => {
            tone(ctx, { freq: f, start: 0.72, dur: 1.8, type: 'sine', gain: 0.07, attack: 0.25, dest: bus });
        });
        tone(ctx, { freq: 1567.98, start: 0.78, dur: 1.2, type: 'sine', gain: 0.025, attack: 0.3, dest: bus });
    } catch (e) {
        // звук не критичен
    }
}

// Щелчок на любую кнопку, пункт меню и т. п.
document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('button, label.btn-secondary, .dropdown-item, .slider-thumb, .bg-option, select, summary');
    if (target && !target.disabled) playSound('click');
}, { capture: true, passive: true });

// На ПК заставки нет: мелодия звучит при первом нажатии в приложении
document.addEventListener('pointerdown', () => {
    if (window.innerWidth >= 769 && !startupPlayed) {
        setTimeout(() => playStartupChime(), 60);
    }
}, { capture: true, passive: true, once: true });

// --- Настройки звука ---
function renderSoundSettings() {
    const ui = document.getElementById('sound-ui-btn');
    const st = document.getElementById('sound-startup-btn');
    if (ui) ui.innerHTML = `<span class="material-icons">${soundEnabled() ? 'volume_up' : 'volume_off'}</span> Звуки интерфейса: ${soundEnabled() ? 'включены' : 'выключены'}`;
    if (st) st.innerHTML = `<span class="material-icons">${startupSoundEnabled() ? 'music_note' : 'music_off'}</span> Мелодия при запуске: ${startupSoundEnabled() ? 'включена' : 'выключена'}`;
}

function toggleUiSound() {
    localStorage.setItem(SOUND_KEY, soundEnabled() ? 'off' : 'on');
    renderSoundSettings();
    playSound('success');
}

function toggleStartupSound() {
    localStorage.setItem(STARTUP_SOUND_KEY, startupSoundEnabled() ? 'off' : 'on');
    renderSoundSettings();
}

function previewStartupChime() {
    playStartupChime(true);
}

window.addEventListener('DOMContentLoaded', renderSoundSettings);
