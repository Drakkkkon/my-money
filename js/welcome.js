// --- 4.14.0: ЭКРАН ПРИВЕТСТВИЯ ---
// Настройки → «Экран приветствия» (uiPrefs.welcome, js/layout.js → normalizeWelcomePrefs; синхронизируется вместе с видом):
//   standard — как было: приветствие, погода, часы, дата, котировки, баланс и ползунок «разблокируйте»;
//   simple   — только приветствие (своё или по времени суток) на своей картинке или на анимации, и ползунок;
//   off      — экрана нет: приложение открывается сразу (ПИН-код, если он задан, всё равно спрашивается).
// Своё приветствие работает в обоих видах. Картинка хранится только на этом устройстве (finance_welcome_img, уменьшенная до 1600 px),
// в облако не уходит — она тяжёлая. Пункт «на ПК» (uiPrefs.layout.pcSplash) перенесён сюда из «Разметки и меню».

const WELCOME_IMG_KEY = 'finance_welcome_img';
const WELCOME_ANIMS = [['aurora', 'Сияние'], ['stars', 'Звёзды'], ['bubbles', 'Пузыри'], ['waves', 'Волны']];

function welcomePrefs() {
    return (typeof uiPrefs !== 'undefined' && uiPrefs.welcome) || { mode: 'standard', bg: 'anim', anim: 'aurora', text: '' };
}
function welcomeImage() { try { return localStorage.getItem(WELCOME_IMG_KEY) || ''; } catch (e) { return ''; } }

// Слой фона (картинка или анимация) и вид экрана
function applyWelcome() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    const w = welcomePrefs();
    splash.setAttribute('data-wel', w.mode);
    let bg = splash.querySelector(':scope > .wel-bg');
    if (w.mode !== 'simple') { if (bg) bg.remove(); }
    else {
        if (!bg) { bg = document.createElement('div'); bg.className = 'wel-bg'; bg.setAttribute('aria-hidden', 'true'); splash.prepend(bg); }
        const img = w.bg === 'image' ? welcomeImage() : '';
        bg.setAttribute('data-anim', img ? '' : w.anim);
        bg.style.backgroundImage = img ? `url("${img}")` : '';
        // для звёзд и пузырей — точки, расставленные один раз
        if (!img && (w.anim === 'stars' || w.anim === 'bubbles')) {
            if (bg.dataset.dots !== w.anim) {
                const n = w.anim === 'stars' ? 70 : 18;
                let h = '';
                for (let i = 0; i < n; i++) {
                    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 100).toFixed(1);
                    const s = w.anim === 'stars' ? (1 + Math.random() * 2.5).toFixed(1) : (14 + Math.random() * 46).toFixed(0);
                    const d = (Math.random() * (w.anim === 'stars' ? 4 : 9)).toFixed(2);
                    const t = w.anim === 'stars' ? (2 + Math.random() * 3).toFixed(2) : (8 + Math.random() * 8).toFixed(2);
                    h += `<i style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:-${d}s;animation-duration:${t}s"></i>`;
                }
                bg.innerHTML = h;
                bg.dataset.dots = w.anim;
            }
        } else { bg.innerHTML = ''; delete bg.dataset.dots; }
    }
    if (typeof updateSplashClock === 'function') { try { updateSplashClock(); } catch (e) {} }
}

// «Без экрана»: заставка сразу скрыта, дальше — как после ползунка (ПИН, если задан)
function skipWelcomeOnStart() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.style.display = 'none';
    splash.classList.add('is-gone');
    // На ПК ПИН уже показал js/script.js (там он идёт раньше заставки)
    if (window.innerWidth >= 769) return;
    try {
        if (savedPin && !pinUnlocked) {
            const pin = document.getElementById('pin-screen');
            if (pin) { pin.style.opacity = ''; pin.style.pointerEvents = ''; pin.style.display = 'flex'; }
            if (bioEnabled) {
                const b = document.getElementById('bio-login-btn');
                if (b) b.style.visibility = 'visible';
                if (typeof loginWithBiometrics === 'function') loginWithBiometrics();
            }
        }
    } catch (e) {}
}

// Просмотр экрана из Настроек: показывается поверх, закрывается нажатием
function previewWelcome() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    applyWelcome();
    if (welcomePrefs().mode === 'off') { showToast('Экран приветствия выключен'); return; }
    splash.classList.add('wel-preview');
    splash.classList.remove('is-gone');
    splash.style.opacity = '1';
    splash.style.display = 'flex';
    const close = (e) => {
        if (e) e.preventDefault();
        splash.removeEventListener('click', close);
        splash.style.opacity = '0';
        setTimeout(() => { splash.style.display = 'none'; splash.classList.add('is-gone'); splash.classList.remove('wel-preview'); }, 350);
    };
    setTimeout(() => splash.addEventListener('click', close), 50);
}

function setWelcomePref(key, value) {
    if (typeof uiPrefs === 'undefined') return;
    const w = { ...welcomePrefs(), [key]: value };
    if (key === 'bg' && value === 'image' && !welcomeImage()) { pickWelcomeImage(); return; }
    uiPrefs.welcome = normalizeWelcomePrefs(w);
    commitUiPrefs();
    applyWelcome();
    renderWelcomeSettings();
}

function setWelcomeText(value) {
    if (typeof uiPrefs === 'undefined') return;
    uiPrefs.welcome = normalizeWelcomePrefs({ ...welcomePrefs(), text: String(value || '').replace(/\s+/g, ' ').trim() });
    commitUiPrefs();
    applyWelcome();
    showToast(uiPrefs.welcome.text ? 'Приветствие сохранено' : 'Приветствие — по времени суток');
}

function pickWelcomeImage() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) loadWelcomeImage(f); };
    inp.click();
}

// Картинка уменьшается до 1600 px по большей стороне и сохраняется как JPEG (чтобы поместилась в память браузера)
function loadWelcomeImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, 1600 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * k));
            c.height = Math.max(1, Math.round(img.height * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            let data = c.toDataURL('image/jpeg', 0.85);
            try { localStorage.setItem(WELCOME_IMG_KEY, data); }
            catch (e) {
                try { data = c.toDataURL('image/jpeg', 0.6); localStorage.setItem(WELCOME_IMG_KEY, data); }
                catch (e2) { alert('Картинка слишком большая для памяти браузера. Попробуйте другую.'); return; }
            }
            uiPrefs.welcome = normalizeWelcomePrefs({ ...welcomePrefs(), mode: 'simple', bg: 'image' });
            commitUiPrefs();
            applyWelcome();
            renderWelcomeSettings();
            showToast('Картинка экрана приветствия сохранена');
        };
        img.onerror = () => alert('Не удалось открыть картинку.');
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function removeWelcomeImage() {
    try { localStorage.removeItem(WELCOME_IMG_KEY); } catch (e) {}
    uiPrefs.welcome = normalizeWelcomePrefs({ ...welcomePrefs(), bg: 'anim' });
    commitUiPrefs();
    applyWelcome();
    renderWelcomeSettings();
}

function renderWelcomeSettings() {
    const box = document.getElementById('welcome-settings');
    if (!box || typeof uiPrefs === 'undefined') return;
    const w = welcomePrefs();
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
    const seg = (key, cur, opts) => `<div class="seg-buttons" role="radiogroup">${opts.map(([v, l]) =>
        `<button type="button" role="radio" aria-checked="${cur === v}" class="seg-btn${cur === v ? ' is-on' : ''}" onclick="setWelcomePref('${key}', '${v}')">${l}</button>`).join('')}</div>`;
    const img = welcomeImage();
    box.innerHTML = `
        <h4 class="font-sub">Вид экрана</h4>
        ${seg('mode', w.mode, [['standard', 'Как было'], ['simple', 'Приветствие и картинка'], ['off', 'Без экрана']])}
        <p class="hint">${w.mode === 'standard' ? 'Приветствие, погода, часы, дата, котировки и баланс, внизу — ползунок «разблокируйте».'
            : w.mode === 'simple' ? 'Только приветствие на вашей картинке или на анимации и ползунок «разблокируйте».'
            : 'Экрана нет — приложение открывается сразу. ПИН-код, если он задан, всё равно спрашивается.'}</p>
        ${w.mode !== 'off' ? `
        <h4 class="font-sub">Приветствие</h4>
        <div class="cat-add-form">
            <input type="text" id="welcome-text" maxlength="60" value="${esc(w.text)}" placeholder="По времени суток: «Доброе утро, …!»" onkeydown="if(event.key==='Enter'){setWelcomeText(this.value);}">
            <button type="button" class="btn-primary" onclick="setWelcomeText(document.getElementById('welcome-text').value)"><span class="material-icons">save</span> Сохранить</button>
        </div>
        <p class="hint">Пусто — приветствие меняется само: «Доброе утро», «Добрый день»… с вашим именем из «Профиля».</p>` : ''}
        ${w.mode === 'simple' ? `
        <h4 class="font-sub">Фон</h4>
        ${seg('bg', w.bg, [['anim', 'Анимация'], ['image', 'Своя картинка']])}
        ${w.bg === 'anim' ? seg('anim', w.anim, WELCOME_ANIMS) : `
            <div class="wel-thumb"${img ? ` style="background-image:url('${img}')"` : ''}>${img ? '' : '<span class="hint">Картинка не выбрана</span>'}</div>
            <div class="btn-group">
                <button type="button" class="btn-primary" onclick="pickWelcomeImage()"><span class="material-icons">image</span> ${img ? 'Другая картинка' : 'Выбрать картинку'}</button>
                ${img ? '<button type="button" class="btn-secondary" onclick="removeWelcomeImage()"><span class="material-icons">delete</span> Убрать</button>' : ''}
            </div>
            <p class="hint">Любая картинка с телефона или ПК. Хранится только на этом устройстве.</p>`}` : ''}
        ${w.mode !== 'off' ? `
        <div class="layout-pc-only">
            <label class="hdr-part"><input type="checkbox" ${uiPrefs.layout.pcSplash ? 'checked' : ''} onchange="setLayoutPref('pcSplash', this.checked)"> Показывать и на ПК</label>
        </div>
        <button type="button" class="btn-secondary btn-block" onclick="previewWelcome()"><span class="material-icons">visibility</span> Посмотреть</button>` : ''}`;
}

window.addEventListener('DOMContentLoaded', () => {
    applyWelcome();
    if (welcomePrefs().mode === 'off') skipWelcomeOnStart();
    renderWelcomeSettings();
});
