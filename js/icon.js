// --- СВОЯ ИКОНКА ПРИЛОЖЕНИЯ ---
// Значок установленного приложения на телефоне берётся из файлов сайта (images/*.png, manifest.webmanifest)
// в момент установки, поэтому из самого приложения его не подменить. Этот блок:
//  1) делает из любой картинки все нужные файлы (192, 512, «маскируемый» 512 для Android, 180 для iPhone, логотип 64)
//     и отдаёт их одним ZIP — его загружают в папку images на GitHub, и иконка меняется для всех тем и устройств;
//  2) сразу ставит картинку значком вкладки и логотипом внутри приложения на этом устройстве.

const ICON_KEY = 'finance_custom_icon';
const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
let iconSource = null; // загруженная картинка (Image)
let iconOpts = { bg: '#008080', pad: 10, round: false };

function iconCanvas(size, { maskable = false } = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = iconOpts.bg;
    if (iconOpts.round && !maskable) {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
    } else {
        ctx.fillRect(0, 0, size, size);
    }
    if (!iconSource) return c;
    // для Android «маскируемая» иконка: рисунок в безопасной зоне (80% в центре)
    const pad = (maskable ? Math.max(iconOpts.pad, 12) + 8 : iconOpts.pad) / 100 * size;
    const box = size - pad * 2;
    const s = Math.min(iconSource.naturalWidth, iconSource.naturalHeight);
    const sx = (iconSource.naturalWidth - s) / 2;
    const sy = (iconSource.naturalHeight - s) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(iconSource, sx, sy, s, s, pad, pad, box, box);
    return c;
}

function iconFromInput(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('Выберите картинку (PNG, JPG, SVG, WEBP).'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { iconSource = img; renderIconSettings(); };
    img.onerror = () => alert('Не удалось открыть картинку.');
    img.src = url;
}

function setIconOpt(key, value) {
    iconOpts[key] = key === 'pad' ? Number(value) : key === 'round' ? !!value : value;
    drawIconPreviews();
}

function drawIconPreviews() {
    const box = document.getElementById('icon-previews');
    if (!box) return;
    box.innerHTML = '';
    [['Значок', 96, false], ['Android', 96, true], ['iPhone', 72, false], ['Вкладка', 32, false]].forEach(([label, px, mask]) => {
        const c = iconCanvas(px * 2, { maskable: mask });
        c.className = 'icon-preview' + (mask ? ' is-mask' : '');
        c.style.width = c.style.height = px + 'px';
        const fig = document.createElement('figure');
        fig.appendChild(c);
        const cap = document.createElement('figcaption');
        cap.textContent = label;
        fig.appendChild(cap);
        box.appendChild(fig);
    });
}

const canvasBlob = c => new Promise(r => c.toBlob(r, 'image/png'));

async function downloadIconZip() {
    if (!iconSource) { alert('Сначала выберите картинку.'); return; }
    try { await loadScriptOnce(JSZIP_URL); } catch (e) { alert('Нет интернета для упаковки ZIP.'); return; }
    const zip = new JSZip();
    const files = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false], ['logo.png', 64, false]];
    for (const [name, size, mask] of files) zip.file('images/' + name, await canvasBlob(iconCanvas(size, { maskable: mask })));
    zip.file('КАК_ПОСТАВИТЬ_ИКОНКУ.txt',
        'Загрузите папку images из этого архива на GitHub в репозиторий сайта поверх старых файлов (Add file -> Upload files).\n' +
        'Android: значок обновится сам в течение суток, быстрее - удалить приложение с главного экрана и установить заново.\n' +
        'iPhone: удалите значок с экрана «Домой» и снова добавьте сайт через «Поделиться» -> «На экран Домой».\n');
    const blob = await zip.generateAsync({ type: 'blob' });
    const res = typeof deliverFile === 'function' ? await deliverFile(blob, 'MyMoney_icon.zip') : null;
    if (res === 'unsupported') alert('Эта сборка (APK) не умеет сохранять файлы. Откройте сайт в Chrome.');
}

// Значок вкладки и логотип в приложении — сразу, только на этом устройстве
function applyIconHere() {
    if (!iconSource) { alert('Сначала выберите картинку.'); return; }
    const data = iconCanvas(192).toDataURL('image/png');
    try { localStorage.setItem(ICON_KEY, data); } catch (e) { alert('Картинка слишком большая для хранения на устройстве.'); return; }
    useLocalIcon(data);
    showToast('Иконка поставлена во вкладке и в приложении на этом устройстве');
}

function resetIconHere() {
    try { localStorage.removeItem(ICON_KEY); } catch (e) {}
    location.reload();
}

function useLocalIcon(data) {
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(l => { l.href = data; });
    document.querySelectorAll('.app-logo').forEach(img => { img.src = data; img.style.display = ''; });
}

function renderIconSettings() {
    const box = document.getElementById('icon-settings');
    if (!box) return;
    const has = !!iconSource;
    box.innerHTML = `
        <label class="btn-primary btn-block icon-pick-btn"><span class="material-icons">add_photo_alternate</span> Выбрать картинку для иконки
            <input type="file" accept="image/*" onchange="iconFromInput(event)">
        </label>
        ${has ? `
            <div class="icon-previews" id="icon-previews"></div>
            <div class="icon-opts">
                <label class="font-pick"><span>Фон</span><input type="color" value="${iconOpts.bg}" oninput="setIconOpt('bg', this.value)"></label>
                <label class="hdr-slider"><span>Отступ</span><input type="range" min="0" max="30" value="${iconOpts.pad}" oninput="setIconOpt('pad', this.value)"></label>
                <label class="hdr-part"><input type="checkbox" ${iconOpts.round ? 'checked' : ''} onchange="setIconOpt('round', this.checked)"> Круглая</label>
            </div>
            <div class="btn-group">
                <button type="button" class="btn-primary" onclick="downloadIconZip()"><span class="material-icons">folder_zip</span> Скачать файлы для GitHub</button>
                <button type="button" class="btn-secondary" onclick="applyIconHere()"><span class="material-icons">check</span> Поставить здесь</button>
            </div>` : ''}
        ${localStorage.getItem(ICON_KEY) ? '<button type="button" class="btn-secondary btn-block" onclick="resetIconHere()"><span class="material-icons">restart_alt</span> Вернуть стандартную иконку на этом устройстве</button>' : ''}
        <p class="hint">Значок на главном экране телефона один для всех тем: он берётся из файлов сайта при установке. Поэтому новая иконка ставится так: скачайте ZIP, загрузите папку <b>images</b> на GitHub поверх старой — и на Android значок обновится сам (обычно в течение суток), на iPhone — после повторного «На экран Домой». Кнопка «Поставить здесь» сразу меняет значок вкладки и логотип в приложении на этом устройстве.</p>`;
    if (has) drawIconPreviews();
}

(function () {
    let saved = null;
    try { saved = localStorage.getItem(ICON_KEY); } catch (e) {}
    window.addEventListener('DOMContentLoaded', () => {
        if (saved) useLocalIcon(saved);
        renderIconSettings();
    });
})();
