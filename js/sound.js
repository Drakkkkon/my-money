// --- ЗВУКИ ИНТЕРФЕЙСА ---
// Все звуки синтезируются Web Audio API прямо в браузере: без звуковых файлов и без чужой музыки.
// У каждой темы свой набор (js/themes.js → sounds): классика, колокольчики, дерево, вода, дождь, гроза,
// мягкий синтезатор, фанфары, леопард (рычание и лязг когтей), неон (искажённое гудение и «зипы»).
// Браузеры разрешают звук только после первого касания или нажатия, поэтому мелодия звучит при разблокировке.

const SOUND_KEY = 'finance_sound';
const STARTUP_SOUND_KEY = 'finance_sound_startup';
let audioCtx = null;
let masterGain = null;
let startupPlayed = false;
let soundPack = 'classic';

// Свои звуки пользователя (js/soundpicker.js). Все загруженные файлы лежат в библиотеке soundLibrary
// ([{ id, name, mime, size, duration, addedAt, driveId }]), а выбор для событий хранится так:
//   customSoundMeta — для всех тем: { слот: { soundId } или { muted: true } };
//   themeSoundMeta — для отдельной темы: { idТемы: { слот: { soundId } или { muted: true } } } (важнее общего выбора).
// Всё это синхронизируется через Google Диск вместе с остальными данными.
const SOUND_SLOTS = [
    { id: 'startup', name: 'Открытие приложения' },
    { id: 'appclose', name: 'Закрытие приложения' },
    { id: 'click', name: 'Нажатие кнопок' },
    { id: 'open', name: 'Открытие окошек' },
    { id: 'close', name: 'Закрытие окошек' },
    { id: 'menu', name: 'Кнопки главного меню' },
    { id: 'scroll', name: 'Прокрутка' }
];
let customSoundMeta = {};
try { customSoundMeta = JSON.parse(localStorage.getItem('finance_custom_sounds') || '{}') || {}; } catch (e) { customSoundMeta = {}; }
let themeSoundMeta = {};
try { themeSoundMeta = JSON.parse(localStorage.getItem('finance_theme_sounds') || '{}') || {}; } catch (e) { themeSoundMeta = {}; }
let soundLibrary = [];
try { soundLibrary = JSON.parse(localStorage.getItem('finance_sound_lib') || '[]') || []; } catch (e) { soundLibrary = []; }
if (!Array.isArray(soundLibrary)) soundLibrary = [];
const customSoundBuffers = {}; // id звука из библиотеки → декодированный AudioBuffer

// Выбор для события с учётом текущей темы: сначала звук темы, затем общий для всех тем
function effectiveSoundMeta(slot) {
    const themeId = typeof currentThemeId !== 'undefined' ? currentThemeId : '';
    const own = themeSoundMeta[themeId];
    if (own && own[slot]) return own[slot];
    return customSoundMeta[slot] || null;
}

function soundEnabled() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
}

function startupSoundEnabled() {
    return localStorage.getItem(STARTUP_SOUND_KEY) !== 'off';
}

function setSoundPack(pack) {
    soundPack = SOUND_PACKS[pack] ? pack : 'classic';
}

function getAudio() {
    try {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            audioCtx = new AC();
            // Общая громкость и мягкий фильтр, чтобы звуки были приятными, а не резкими
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 7000;
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(filter);
            filter.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    } catch (e) {
        return null; // звук не критичен: приложение работает и без него
    }
}

// ---------- Строительные блоки ----------
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
    return osc;
}

let noiseBuffer = null;
function getNoise(ctx) {
    if (!noiseBuffer) {
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

// Шум через фильтр: щелчки, капли, гром, скрежет
function noise(ctx, { start = 0, dur = 0.05, type = 'bandpass', freq = 2000, endFreq = null, q = 1, gain = 0.2, attack = 0.002, dest = null }) {
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || masterGain);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
}

function distortionCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}

// Колокольчик: несколько негармоничных обертонов
function bell(ctx, freq, start = 0, dur = 0.6, gain = 0.1) {
    [1, 2.76, 5.4].forEach((ratio, i) => {
        tone(ctx, { freq: freq * ratio, start, dur: dur / (1 + i * 0.6), type: 'sine', gain: gain / (1 + i * 1.5), attack: 0.003 });
    });
}

// Рычание леопарда: низкая пила с «дрожью», искажение и фильтр, плюс хриплое дыхание
function growl(ctx, { start = 0, dur = 0.6, f0 = 85, f1 = 60, gain = 0.28 }) {
    const t0 = ctx.currentTime + start;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.07);
    env.gain.setValueAtTime(gain, t0 + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const flutter = ctx.createGain();
    flutter.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth);
    lfoDepth.connect(flutter.gain);

    const dist = ctx.createWaveShaper();
    dist.curve = distortionCurve(40);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    lp.Q.value = 3;

    [[f0, f1, 'sawtooth'], [f0 * 1.5, f1 * 1.48, 'square']].forEach(([a, b, type]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(a, t0);
        o.frequency.linearRampToValueAtTime(b, t0 + dur);
        o.connect(dist);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    });
    dist.connect(lp);
    lp.connect(flutter);
    flutter.connect(env);
    env.connect(masterGain);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    noise(ctx, { start, dur, type: 'bandpass', freq: 420, q: 1.5, gain: gain * 0.45, attack: 0.05 }); // дыхание
}

// Лязг когтей: короткие металлические царапины
function claws(ctx, { start = 0, strikes = 3, gain = 0.16 }) {
    for (let i = 0; i < strikes; i++) {
        const s = start + i * 0.045;
        noise(ctx, { start: s, dur: 0.035, type: 'highpass', freq: 3800, gain, attack: 0.001 });
        noise(ctx, { start: s, dur: 0.05, type: 'bandpass', freq: 6200, endFreq: 4200, q: 12, gain: gain * 0.7 });
        tone(ctx, { freq: 4700 + i * 330, start: s, dur: 0.06, type: 'square', gain: gain * 0.12 });
    }
}

// Неоновый «зип»: пила с резкой сменой высоты через искажение, с мерцанием
function neonZap(ctx, { start = 0, dur = 0.12, from = 1800, to = 500, gain = 0.12 }) {
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const dist = ctx.createWaveShaper();
    dist.curve = distortionCurve(80);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    // мерцание, как у неоновой лампы
    for (let i = 1; i < 5; i++) g.gain.setValueAtTime(gain * (i % 2 ? 0.35 : 1), t0 + (dur * i) / 6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(dist);
    dist.connect(hp);
    hp.connect(g);
    g.connect(masterGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
}

// Неоновое гудение трансформатора
function neonHum(ctx, { start = 0, dur = 0.35, gain = 0.09 }) {
    const t0 = ctx.currentTime + start;
    const dist = ctx.createWaveShaper();
    dist.curve = distortionCurve(60);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    g.gain.setValueAtTime(gain * 0.4, t0 + dur * 0.3);
    g.gain.setValueAtTime(gain, t0 + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    [100, 200, 301].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(dist);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
    });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    dist.connect(bp);
    bp.connect(g);
    g.connect(masterGain);
}

// Мягкий аккорд-«подушка»
function pad(ctx, freqs, { start = 0, dur = 0.5, gain = 0.06, type = 'triangle', attack = 0.08 } = {}) {
    freqs.forEach(f => tone(ctx, { freq: f, start, dur, type, gain, attack }));
}

// Восходящее арпеджио + аккорд (основа мелодий запуска)
function arpeggio(ctx, notes, { type = 'triangle', step = 0.13, gain = 0.11, chord = true, chordType = 'sine' } = {}) {
    notes.forEach((f, i) => tone(ctx, { freq: f, start: i * step, dur: 0.9, type, gain, attack: 0.02 }));
    if (chord) notes.forEach(f => tone(ctx, { freq: f / 2, start: notes.length * step, dur: 1.6, type: chordType, gain: gain * 0.55, attack: 0.2 }));
}

// «Воздушный» тон для «Аэро»: мягкая синусоида с тихим верхним обертоном и затухающими повторами (как эхо в зале)
function airy(ctx, freq, { start = 0, dur = 0.35, gain = 0.07, echoes = 2 } = {}) {
    for (let i = 0; i <= echoes; i++) {
        const g = gain * Math.pow(0.38, i);
        tone(ctx, { freq, start: start + i * 0.085, dur, gain: g, attack: 0.012 });
        tone(ctx, { freq: freq * 2.01, start: start + i * 0.085, dur: dur * 0.6, gain: g * 0.18, attack: 0.012 });
    }
}

const EB_MAJ = [311.13, 392.0, 466.16, 587.33, 698.46];
const C_MAJ = [261.63, 329.63, 392.0, 493.88, 587.33];
const A_MIN = [220.0, 261.63, 329.63, 392.0, 523.25];

// ---------- Наборы звуков ----------
const SOUND_PACKS = {
    classic: {
        click: c => { noise(c, { dur: 0.012, type: 'highpass', freq: 1800, gain: 0.3 }); tone(c, { freq: 2400, dur: 0.03, type: 'triangle', gain: 0.06 }); },
        open: c => { tone(c, { freq: 587, dur: 0.09, type: 'triangle', gain: 0.16 }); tone(c, { freq: 880, start: 0.07, dur: 0.14, type: 'triangle', gain: 0.14 }); },
        close: c => { tone(c, { freq: 880, dur: 0.08, type: 'triangle', gain: 0.14 }); tone(c, { freq: 587, start: 0.06, dur: 0.14, type: 'triangle', gain: 0.13 }); },
        startup: c => { arpeggio(c, EB_MAJ); tone(c, { freq: 1567.98, start: 0.78, dur: 1.2, gain: 0.025, attack: 0.3 }); }
    },
    chime: {
        click: c => { tone(c, { freq: 3100, dur: 0.05, gain: 0.05 }); noise(c, { dur: 0.01, type: 'highpass', freq: 3000, gain: 0.12 }); },
        open: c => { bell(c, 880, 0, 0.5, 0.11); bell(c, 1318.5, 0.08, 0.5, 0.08); },
        close: c => { bell(c, 1318.5, 0, 0.45, 0.08); bell(c, 880, 0.08, 0.5, 0.1); },
        startup: c => { C_MAJ.concat([783.99]).forEach((f, i) => bell(c, f * 2, i * 0.14, 1.0, 0.07)); }
    },
    wood: {
        click: c => { noise(c, { dur: 0.03, type: 'bandpass', freq: 1300, q: 9, gain: 0.35 }); tone(c, { freq: 420, dur: 0.035, type: 'triangle', gain: 0.07 }); },
        open: c => { [523.25, 783.99].forEach((f, i) => { tone(c, { freq: f, start: i * 0.08, dur: 0.18, type: 'sine', gain: 0.16 }); tone(c, { freq: f * 4, start: i * 0.08, dur: 0.04, gain: 0.04 }); }); },
        close: c => { [783.99, 523.25].forEach((f, i) => { tone(c, { freq: f, start: i * 0.08, dur: 0.18, type: 'sine', gain: 0.15 }); tone(c, { freq: f * 4, start: i * 0.08, dur: 0.04, gain: 0.04 }); }); },
        startup: c => { C_MAJ.concat([659.25, 783.99]).forEach((f, i) => { tone(c, { freq: f, start: i * 0.11, dur: 0.35, type: 'sine', gain: 0.13 }); tone(c, { freq: f * 4, start: i * 0.11, dur: 0.05, gain: 0.03 }); }); }
    },
    water: {
        click: c => tone(c, { freq: 900, endFreq: 1600, dur: 0.05, gain: 0.12 }),
        open: c => { tone(c, { freq: 380, endFreq: 1200, dur: 0.12, gain: 0.14 }); tone(c, { freq: 600, endFreq: 1700, start: 0.08, dur: 0.12, gain: 0.1 }); },
        close: c => { tone(c, { freq: 1200, endFreq: 380, dur: 0.14, gain: 0.13 }); },
        startup: c => { for (let i = 0; i < 7; i++) tone(c, { freq: 300 + i * 120, endFreq: 900 + i * 160, start: i * 0.12, dur: 0.12, gain: 0.09 }); pad(c, [220, 277.18, 329.63], { start: 0.8, dur: 1.4, gain: 0.05, type: 'sine', attack: 0.3 }); }
    },
    rain: {
        click: c => tone(c, { freq: 2100, endFreq: 900, dur: 0.04, gain: 0.08 }),
        open: c => { tone(c, { freq: 1800, endFreq: 800, dur: 0.06, gain: 0.1 }); tone(c, { freq: 2400, endFreq: 1000, start: 0.09, dur: 0.06, gain: 0.08 }); },
        close: c => tone(c, { freq: 1200, endFreq: 500, dur: 0.08, gain: 0.1 }),
        startup: c => { noise(c, { dur: 1.8, type: 'highpass', freq: 2500, gain: 0.04, attack: 0.4 }); for (let i = 0; i < 9; i++) tone(c, { freq: 1500 + Math.random() * 1500, endFreq: 700, start: 0.1 + Math.random() * 1.4, dur: 0.05, gain: 0.07 }); pad(c, A_MIN.slice(0, 3), { start: 0.3, dur: 1.6, gain: 0.05, type: 'sine', attack: 0.4 }); }
    },
    storm: {
        click: c => noise(c, { dur: 0.04, type: 'lowpass', freq: 900, gain: 0.25 }),
        open: c => { noise(c, { dur: 0.45, type: 'lowpass', freq: 260, endFreq: 120, gain: 0.35, attack: 0.02 }); tone(c, { freq: 62, dur: 0.4, gain: 0.12 }); },
        close: c => noise(c, { dur: 0.25, type: 'lowpass', freq: 220, endFreq: 90, gain: 0.3 }),
        startup: c => { noise(c, { dur: 0.05, type: 'highpass', freq: 3000, gain: 0.3 }); noise(c, { start: 0.04, dur: 1.6, type: 'lowpass', freq: 300, endFreq: 80, gain: 0.45, attack: 0.03 }); pad(c, A_MIN.slice(0, 3).map(f => f / 2), { start: 0.6, dur: 1.6, gain: 0.05, type: 'sine', attack: 0.4 }); }
    },
    pad: {
        click: c => tone(c, { freq: 1250, dur: 0.035, gain: 0.07 }),
        open: c => pad(c, [440, 554.37, 659.25], { dur: 0.32, gain: 0.06, attack: 0.04 }),
        close: c => pad(c, [329.63, 415.3, 493.88], { dur: 0.3, gain: 0.06, attack: 0.04 }),
        startup: c => arpeggio(c, A_MIN, { type: 'sine', step: 0.16, gain: 0.09, chordType: 'triangle' })
    },
    fanfare: {
        click: c => tone(c, { freq: 1500, dur: 0.03, type: 'square', gain: 0.03 }),
        open: c => { [392, 523.25].forEach((f, i) => tone(c, { freq: f, start: i * 0.08, dur: 0.16, type: 'sawtooth', gain: 0.06, attack: 0.02 })); },
        close: c => { [523.25, 392].forEach((f, i) => tone(c, { freq: f, start: i * 0.08, dur: 0.16, type: 'sawtooth', gain: 0.06, attack: 0.02 })); },
        startup: c => { [392, 523.25, 659.25, 783.99, 659.25, 783.99].forEach((f, i) => tone(c, { freq: f, start: i * 0.12, dur: i === 5 ? 0.9 : 0.14, type: 'sawtooth', gain: 0.055, attack: 0.02 })); }
    },
    leopard: {
        click: c => claws(c, { strikes: 1, gain: 0.14 }),
        open: c => { growl(c, { dur: 0.5, f0: 95, f1: 70, gain: 0.26 }); claws(c, { start: 0.32, strikes: 2, gain: 0.1 }); },
        close: c => growl(c, { dur: 0.32, f0: 80, f1: 55, gain: 0.22 }),
        startup: c => { growl(c, { dur: 1.3, f0: 70, f1: 105, gain: 0.3 }); claws(c, { start: 1.1, strikes: 4, gain: 0.13 }); }
    },
    // «Аква»: короткие «стеклянные» синусоиды с тихим верхним обертоном (своя мелодия, не звук включения Mac)
    glass: {
        click: c => { tone(c, { freq: 2637, dur: 0.045, gain: 0.07, attack: 0.002 }); tone(c, { freq: 5274, dur: 0.03, gain: 0.02, attack: 0.002 }); },
        open: c => { tone(c, { freq: 1318.5, dur: 0.16, gain: 0.08 }); tone(c, { freq: 1975.5, start: 0.06, dur: 0.2, gain: 0.07 }); tone(c, { freq: 3951, start: 0.06, dur: 0.12, gain: 0.015 }); },
        close: c => { tone(c, { freq: 1975.5, dur: 0.14, gain: 0.07 }); tone(c, { freq: 1318.5, start: 0.06, dur: 0.18, gain: 0.07 }); },
        menu: c => { tone(c, { freq: 1760, dur: 0.06, gain: 0.07 }); tone(c, { freq: 3520, dur: 0.04, gain: 0.015 }); },
        scroll: c => tone(c, { freq: 3135, dur: 0.015, gain: 0.02 }),
        startup: c => {
            [659.25, 987.77, 1318.5, 1567.98, 1975.53].forEach((f, i) => {
                tone(c, { freq: f, start: i * 0.09, dur: 1.1, gain: 0.07, attack: 0.01 });
                tone(c, { freq: f * 2, start: i * 0.09, dur: 0.5, gain: 0.012, attack: 0.01 });
            });
            pad(c, [329.63, 493.88, 659.25], { start: 0.45, dur: 1.5, gain: 0.04, type: 'sine', attack: 0.3 });
        }
    },
    // «Аэро»: мягкие воздушные звуки с эхом (своя мелодия, не звук запуска Windows)
    aero: {
        click: c => { tone(c, { freq: 1567.98, dur: 0.035, gain: 0.05, attack: 0.002 }); noise(c, { dur: 0.012, type: 'highpass', freq: 4000, gain: 0.05 }); },
        open: c => { airy(c, 880, { dur: 0.3, gain: 0.06 }); airy(c, 1318.5, { start: 0.07, dur: 0.32, gain: 0.05 }); },
        close: c => { airy(c, 1318.5, { dur: 0.25, gain: 0.05, echoes: 1 }); airy(c, 987.77, { start: 0.06, dur: 0.3, gain: 0.05, echoes: 1 }); },
        menu: c => { tone(c, { freq: 1174.66, dur: 0.06, gain: 0.05, attack: 0.004 }); tone(c, { freq: 1760, start: 0.03, dur: 0.07, gain: 0.03, attack: 0.004 }); },
        scroll: c => tone(c, { freq: 2349.3, dur: 0.012, gain: 0.015 }),
        startup: c => {
            pad(c, [196, 293.66, 392, 493.88], { dur: 2.4, gain: 0.035, type: 'sine', attack: 0.7 });
            [587.33, 783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => airy(c, f, { start: 0.35 + i * 0.16, dur: 0.7, gain: 0.05 }));
            noise(c, { start: 0.1, dur: 1.6, type: 'bandpass', freq: 3200, q: 0.7, gain: 0.015, attack: 0.6 });
        }
    },
    // «Метро»: короткие чистые «тапы» и мягкие свайпы, как у плиточного интерфейса (своя мелодия, не звуки телефона)
    metro: {
        click: c => { tone(c, { freq: 1318.5, dur: 0.028, type: 'triangle', gain: 0.06, attack: 0.001 }); noise(c, { dur: 0.01, type: 'highpass', freq: 5000, gain: 0.035 }); },
        open: c => { noise(c, { dur: 0.16, type: 'bandpass', freq: 900, endFreq: 3600, q: 1.2, gain: 0.05, attack: 0.02 }); tone(c, { freq: 880, start: 0.06, dur: 0.09, gain: 0.05 }); },
        close: c => { noise(c, { dur: 0.14, type: 'bandpass', freq: 3200, endFreq: 800, q: 1.2, gain: 0.045, attack: 0.02 }); tone(c, { freq: 659.25, start: 0.04, dur: 0.08, gain: 0.045 }); },
        menu: c => { tone(c, { freq: 987.77, dur: 0.04, type: 'triangle', gain: 0.06, attack: 0.001 }); tone(c, { freq: 1975.5, start: 0.02, dur: 0.03, gain: 0.02 }); },
        scroll: c => tone(c, { freq: 2637, dur: 0.01, type: 'triangle', gain: 0.018 }),
        startup: c => {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { freq: f, start: i * 0.11, dur: 0.5, type: 'triangle', gain: 0.06, attack: 0.004 }));
            pad(c, [261.63, 392, 523.25], { start: 0.42, dur: 1.2, gain: 0.035, type: 'sine', attack: 0.15 });
            noise(c, { start: 0.38, dur: 0.4, type: 'bandpass', freq: 1200, endFreq: 5200, q: 0.9, gain: 0.025, attack: 0.05 });
        }
    },
    // «iOS 6»: сухой деревянный «тык» клавиатуры, мягкие «пузырьковые» открытие и закрытие и спокойная трезвучная мелодия
    // с колокольчиком (всё синтезируется здесь, своя мелодия, не звуки iPhone)
    tock: {
        click: c => { noise(c, { dur: 0.022, type: 'bandpass', freq: 1900, q: 6, gain: 0.3, attack: 0.001 }); tone(c, { freq: 760, endFreq: 520, dur: 0.03, type: 'triangle', gain: 0.07, attack: 0.001 }); },
        open: c => { tone(c, { freq: 523.25, endFreq: 784, dur: 0.11, gain: 0.09, attack: 0.004 }); tone(c, { freq: 1046.5, start: 0.05, dur: 0.14, gain: 0.04, attack: 0.004 }); },
        close: c => { tone(c, { freq: 784, endFreq: 523.25, dur: 0.11, gain: 0.09, attack: 0.004 }); tone(c, { freq: 392, start: 0.04, dur: 0.14, gain: 0.04, attack: 0.004 }); },
        menu: c => { noise(c, { dur: 0.018, type: 'bandpass', freq: 2300, q: 5, gain: 0.22, attack: 0.001 }); tone(c, { freq: 988, endFreq: 700, dur: 0.035, type: 'triangle', gain: 0.06, attack: 0.001 }); },
        scroll: c => tone(c, { freq: 2200, dur: 0.01, type: 'triangle', gain: 0.015 }),
        startup: c => {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { bell(c, f, i * 0.12, 1.1, 0.07); tone(c, { freq: f / 2, start: i * 0.12, dur: 0.5, gain: 0.03, attack: 0.01 }); });
            pad(c, [261.63, 329.63, 392], { start: 0.4, dur: 1.4, gain: 0.03, type: 'sine', attack: 0.25 });
        }
    },
    // «Android»: мягкие «капли» касания, короткие восходящие и нисходящие нотки и светлая мелодия запуска в духе системных
    // звуков телефона на Android (всё синтезируется здесь, своя мелодия, не файлы Google)
    material: {
        click: c => { tone(c, { freq: 1568, endFreq: 1318.5, dur: 0.035, type: 'sine', gain: 0.07, attack: 0.002 }); tone(c, { freq: 3136, dur: 0.02, gain: 0.015, attack: 0.001 }); },
        open: c => { tone(c, { freq: 587.33, endFreq: 880, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 }); tone(c, { freq: 1174.66, start: 0.06, dur: 0.14, type: 'sine', gain: 0.035, attack: 0.006 }); },
        close: c => { tone(c, { freq: 880, endFreq: 587.33, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 }); tone(c, { freq: 440, start: 0.05, dur: 0.14, type: 'sine', gain: 0.035, attack: 0.006 }); },
        menu: c => { tone(c, { freq: 1396.9, endFreq: 1174.66, dur: 0.04, type: 'sine', gain: 0.065, attack: 0.002 }); tone(c, { freq: 2093, start: 0.015, dur: 0.03, gain: 0.02, attack: 0.001 }); },
        scroll: c => tone(c, { freq: 2349.3, dur: 0.01, type: 'sine', gain: 0.016, attack: 0.001 }),
        startup: c => {
            [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(c, { freq: f, start: i * 0.1, dur: 0.55, type: 'sine', gain: 0.06, attack: 0.008 }); tone(c, { freq: f * 2, start: i * 0.1, dur: 0.3, type: 'sine', gain: 0.012, attack: 0.008 }); });
            pad(c, [261.63, 392, 523.25], { start: 0.4, dur: 1.5, gain: 0.03, type: 'sine', attack: 0.2 });
        }
    },
    // «Классика 1-бит»: простые прямоугольные «пики», как у компьютеров с однобитным звуком (своя мелодия)
    beep: {
        click: c => tone(c, { freq: 1046.5, dur: 0.018, type: 'square', gain: 0.04, attack: 0.001 }),
        open: c => { tone(c, { freq: 659.25, dur: 0.05, type: 'square', gain: 0.045, attack: 0.001 }); tone(c, { freq: 987.77, start: 0.05, dur: 0.07, type: 'square', gain: 0.045, attack: 0.001 }); },
        close: c => { tone(c, { freq: 987.77, dur: 0.05, type: 'square', gain: 0.045, attack: 0.001 }); tone(c, { freq: 659.25, start: 0.05, dur: 0.07, type: 'square', gain: 0.04, attack: 0.001 }); },
        menu: c => tone(c, { freq: 1318.5, dur: 0.025, type: 'square', gain: 0.035, attack: 0.001 }),
        scroll: c => tone(c, { freq: 2093, dur: 0.008, type: 'square', gain: 0.015, attack: 0.001 }),
        startup: c => {
            [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { freq: f, start: i * 0.08, dur: 0.075, type: 'square', gain: 0.045, attack: 0.001 }));
            tone(c, { freq: 783.99, start: 0.5, dur: 0.1, type: 'square', gain: 0.04, attack: 0.001 });
            tone(c, { freq: 1046.5, start: 0.62, dur: 0.35, type: 'square', gain: 0.045, attack: 0.001 });
        }
    },
    neon: {
        click: c => neonZap(c, { dur: 0.05, from: 2400, to: 900, gain: 0.08 }),
        open: c => { neonHum(c, { dur: 0.3 }); neonZap(c, { start: 0.05, dur: 0.14, from: 500, to: 2200, gain: 0.08 }); },
        close: c => { neonZap(c, { dur: 0.16, from: 2200, to: 300, gain: 0.08 }); neonHum(c, { dur: 0.2, gain: 0.06 }); },
        startup: c => { neonHum(c, { dur: 1.4, gain: 0.08 }); [261.63, 392, 523.25, 783.99].forEach((f, i) => neonZap(c, { start: 0.25 + i * 0.16, dur: 0.22, from: f * 2, to: f, gain: 0.07 })); }
    }
};

// Звуки по умолчанию для новых событий (если в наборе темы их нет)
const DEFAULT_EXTRA = {
    // главное меню: щелчок темы + короткий «тик» повыше
    menu: (c, pack) => { pack.click(c); tone(c, { freq: 1760, start: 0.02, dur: 0.05, type: 'triangle', gain: 0.05 }); },
    // прокрутка: очень тихий мягкий тик
    scroll: c => tone(c, { freq: 1900, dur: 0.018, type: 'sine', gain: 0.025 }),
    // закрытие приложения: звук закрытия окна темы, тише
    appclose: (c, pack) => pack.close(c)
};

// Проиграть свой звук пользователя, если он выбран и уже готов. true — если звук обработан (сыгран или выключен).
function playCustomSound(slot, ctx) {
    const meta = effectiveSoundMeta(slot);
    if (!meta) return false;
    if (meta.muted) return true;
    if (!meta.soundId) return false;
    const buffer = customSoundBuffers[meta.soundId];
    if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.value = 1.4; // свои файлы обычно тише синтезированных — немного громче
        src.connect(g);
        g.connect(masterGain);
        src.start();
        return true;
    }
    if (typeof prepareCustomSound === 'function') prepareCustomSound(meta.soundId); // загрузится к следующему разу
    return false;
}

// Звуки «успех» и «ошибка» одинаковы во всех темах, но в тон набору
function playSound(name) {
    if (!soundEnabled()) return;
    const ctx = getAudio();
    if (!ctx) return;
    try {
        if (playCustomSound(name, ctx)) return;
        const pack = SOUND_PACKS[soundPack] || SOUND_PACKS.classic;
        if (pack[name]) pack[name](ctx);
        else if (DEFAULT_EXTRA[name]) DEFAULT_EXTRA[name](ctx, pack);
        else if (name === 'success') { tone(ctx, { freq: 784, dur: 0.09, type: 'triangle', gain: 0.14 }); tone(ctx, { freq: 1047, start: 0.08, dur: 0.16, type: 'triangle', gain: 0.14 }); }
        else if (name === 'error') { tone(ctx, { freq: 220, dur: 0.18, type: 'square', gain: 0.06 }); }
    } catch (e) {
        // звук не критичен для работы приложения
    }
}

// Мелодия заставки своей темы (около 1,5–2,5 секунды) или свой звук открытия приложения
function playStartupChime(force = false) {
    if (!force && (!soundEnabled() || !startupSoundEnabled() || startupPlayed)) return;
    const ctx = getAudio();
    if (!ctx) return;
    startupPlayed = true;
    try {
        if (playCustomSound('startup', ctx)) return;
        (SOUND_PACKS[soundPack] || SOUND_PACKS.classic).startup(ctx);
    } catch (e) {
        // звук не критичен
    }
}

// Щелчок на любую кнопку; у пунктов главного меню — свой звук
document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('button, label.btn-secondary, .dropdown-item, .slider-thumb, .bg-option, select, summary, .w95-sb-thumb');
    if (!target || target.disabled) return;
    playSound(target.closest('.sidebar-nav, .mobile-nav') ? 'menu' : 'click');
    if (typeof prepareAllCustomSounds === 'function') prepareAllCustomSounds();
}, { capture: true, passive: true });

// Звук прокрутки: не чаще раза в 140 мс, только при заметном сдвиге
const scrollSoundState = new WeakMap();
let lastScrollSoundAt = 0;
document.addEventListener('scroll', (e) => {
    const el = e.target === document ? document.scrollingElement : e.target;
    if (!el || !el.nodeType || el === document.scrollingElement) return; // страницу целиком держит защита от свайпа
    const prev = scrollSoundState.get(el) || 0;
    const now = Date.now();
    scrollSoundState.set(el, el.scrollTop);
    if (Math.abs(el.scrollTop - prev) < 24 || now - lastScrollSoundAt < 140) return;
    lastScrollSoundAt = now;
    if (audioCtx) playSound('scroll'); // до первого касания звук всё равно запрещён браузером
}, { capture: true, passive: true });

// Звук закрытия приложения (сворачивание или закрытие вкладки). На части телефонов система
// обрывает звук при сворачивании — тогда он может не прозвучать.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && audioCtx) playSound('appclose');
});

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
    playSound('open');
}

function toggleStartupSound() {
    localStorage.setItem(STARTUP_SOUND_KEY, startupSoundEnabled() ? 'off' : 'on');
    renderSoundSettings();
}

function previewStartupChime() {
    playStartupChime(true);
}

window.addEventListener('DOMContentLoaded', renderSoundSettings);
