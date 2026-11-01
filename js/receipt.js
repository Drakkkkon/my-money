// --- ЧЕК ПО ФОТО ---
// Блок с камерой над «Новой записью»: фото чека → распознавание текста прямо на устройстве (Tesseract.js,
// русский и английский; фото никуда не отправляется) → итоговая сумма, магазин и позиции.
// Перед сохранением всё показывается в окне и правится. Сохраняется одна запись-расход:
// категория «Магазин» (или своя), сумма = итог чека, в комментарии магазин и позиции: «молоко 1000, хлеб 1000…».
// Модуль распознавания (~3 МБ) и словарь (~2,5 МБ) скачиваются при первом использовании, дальше берутся из кэша.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const RECEIPT_COMMENT_MAX = 500;

// Строки чека, которые не являются товарами
// Части слов (встречаются только в служебных строках) и целые короткие слова (чтобы «картофель» и «бинт» не отсеялись)
const RECEIPT_SKIP_RE = new RegExp(
    '(итог|всего|сумма|оплат|наличн|безнал|сдача|получено|ндс|налог|кассир|фиск|рнм|знм|спасибо|скидк|бонус|баланс|терминал|транзакц|' +
    'www|http|subtotal|total|барлығы|жиыны|төлеу|қайтар|ofd|офд|продаж|возврат)' +
    '|(?:^|[^a-zа-яё])(карта|картой|касса|смена|чек|фп|фд|ккм|ккт|инн|бин|иин|рнн|тел|адрес|ул|qr|cash|change|card|vat|tax|дата|время|номер|приход|кгд|kgd)(?![a-zа-яё])',
    'i');
const RECEIPT_TOTAL_RE = /(итог[оа]?|всего|к\s*оплате|сумма\s*(к\s*оплате|покупки|чека)?|total|барлығы|жиыны|төлеуге)/i;
const RECEIPT_STORE_RE = /(тоо|ип\b|ао\b|ооо|магазин|маркет|market|supermarket|store|shop|апте|кафе|ресторан|минимаркет|гипермаркет|small|magnum|галмарт|anvar|metro|arbuz|клевер|interfood|sulpak|technodom|mechta)/i;

let tesseractWorker = null;
let tesseractLoading = null;

function loadTesseract() {
    if (!tesseractLoading) {
        tesseractLoading = loadScriptOnce(TESSERACT_URL)
            .then(() => { if (!window.Tesseract) throw new Error('Модуль распознавания не загрузился'); })
            .catch(e => { tesseractLoading = null; throw e; });
    }
    return tesseractLoading;
}

async function getReceiptWorker(onProgress) {
    await loadTesseract();
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker(['rus', 'eng'], 1, {
            logger: m => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); }
        });
    }
    return tesseractWorker;
}

// Подготовка фото: уменьшить до 1800 px по большей стороне, серый цвет, больше контраста
async function prepareReceiptImage(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Не удалось открыть фото'));
            i.src = url;
        });
        const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        // яркость каждой точки и растяжение контраста по 2% и 98% перцентилям
        const hist = new Uint32Array(256);
        for (let i = 0; i < px.length; i += 4) {
            const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
            px[i] = g;
            hist[g]++;
        }
        const total = w * h;
        let lo = 0, hi = 255, acc = 0;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.005) { lo = v; break; } }
        acc = 0;
        for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
        // текста на фото мало (почти белый чек) — контраст не трогаем, иначе картинка станет сплошной
        if (hi - lo < 64) { lo = 0; hi = 255; }
        const span = Math.max(1, hi - lo);
        for (let i = 0; i < px.length; i += 4) {
            const g = Math.max(0, Math.min(255, (px[i] - lo) * 255 / span));
            px[i] = px[i + 1] = px[i + 2] = g;
        }
        ctx.putImageData(data, 0, 0);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

// ---------- Разбор текста чека ----------
// Число в конце строки: «1 000,00», «1000.00», «1 000», «=1000,00»
const RECEIPT_NUM_RE = /(\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:₸|тг|т|tg|kzt|руб|р|₽)?\.?\s*[*=]?$/i;

function receiptNumber(s) {
    const n = parseFloat(String(s).replace(/[  ]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
}

function cleanItemName(s) {
    return s.replace(/^[\s\d.)*#№-]{1,6}(?=[a-zа-яё])/i, '')       // номер позиции «1.», «02)»
        .replace(/\s+\d+([.,]\d+)?\s*(шт|кг|г|л|мл|x|х|\*)\.?\s*[x×х*]?\s*[\d\s.,]*$/i, '') // «2 шт x 500»
        .replace(/[\s.:=*_-]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function parseReceiptText(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
    let total = 0;
    let store = '';
    let date = '';
    const items = [];

    // Итог: последняя строка со словом «итог/всего/к оплате» и числом (или число на следующей строке)
    for (let i = 0; i < lines.length; i++) {
        if (!RECEIPT_TOTAL_RE.test(lines[i]) || /(ндс|налог|скидк|бонус|сдача|vat|tax)/i.test(lines[i])) continue;
        let m = lines[i].match(RECEIPT_NUM_RE);
        if (!m && lines[i + 1] && /^[\d\s.,=₸тг]+$/i.test(lines[i + 1])) m = lines[i + 1].match(RECEIPT_NUM_RE);
        const n = m ? receiptNumber(m[1]) : NaN;
        if (n > 0 && n < 100000000) total = n; // последняя подходящая строка — обычно «ИТОГО» внизу
    }

    // Дата
    for (const l of lines) {
        const d = l.match(/\b(\d{2})[.\/-](\d{2})[.\/-](\d{2,4})\b/);
        if (d) {
            const y = d[3].length === 2 ? '20' + d[3] : d[3];
            const t = l.match(/\b([01]\d|2[0-3])[:.]([0-5]\d)\b(?![.,]\d)/);
            const iso = `${y}-${d[2]}-${d[1]}`;
            if (!isNaN(Date.parse(iso)) && Number(d[2]) <= 12 && Number(d[1]) <= 31) {
                date = iso + 'T' + (t ? `${t[1]}:${t[2]}` : '12:00');
                break;
            }
        }
    }

    // Магазин: строка с ТОО/ИП/магазин в первых 8 строках, иначе первая строка из букв
    const head = lines.slice(0, 8);
    store = head.find(l => RECEIPT_STORE_RE.test(l)) || head.find(l => /[a-zа-яё]{3,}/i.test(l) && !RECEIPT_NUM_RE.test(l) && !RECEIPT_SKIP_RE.test(l)) || '';
    store = store.replace(/["«»“”]/g, '').replace(/^(тоо|too|ип|ao|ао|ооо|ooo)\s+/i, '').replace(/\s+/g, ' ').trim().slice(0, 60);

    // Позиции: «Название ... 1000,00». Если цена на отдельной строке «2 x 500,00 = 1000,00» — склеиваем с названием выше.
    let pendingName = '';
    for (let li = 0; li < lines.length; li++) {
        const l = lines[li];
        if (RECEIPT_SKIP_RE.test(l)) { pendingName = ''; continue; }
        // «1,250 x 990,00» без суммы, а сумма «1 237,50» — следующей строкой
        if (/^[\d.,\s]+[x×х*]\s*[\d\s]+[.,]\d{2}$/i.test(l) && lines[li + 1] && /^[\d\s]+[.,]\d{2}$/.test(lines[li + 1])) continue;
        let m = l.match(RECEIPT_NUM_RE);
        const letters = (l.match(/[a-zа-яё]/gi) || []).length;
        // «Молоко 3,2% 1» — маленькое целое число в конце названия, а не цена
        if (m && !/[.,]\d{2}$/.test(m[1]) && receiptNumber(m[1]) < 10 && letters >= 3) m = null;
        if (!m) {
            if (letters >= 3) pendingName = l;
            continue;
        }
        const price = receiptNumber(m[1]);
        if (!(price > 0) || price >= 10000000) continue;
        let name = cleanItemName(l.slice(0, m.index));
        if ((name.match(/[a-zа-яё]/gi) || []).length < 3) {
            if (!pendingName) continue;
            name = cleanItemName(pendingName);
        }
        pendingName = '';
        if ((name.match(/[a-zа-яё]/gi) || []).length < 3) continue;
        if (total && price > total + 0.01) continue;
        items.push({ name: name.slice(0, 40), price });
    }

    const itemsSum = items.reduce((s, it) => s + it.price, 0);
    if (!total && itemsSum) total = itemsSum;
    return { total: Math.round(total * 100) / 100, store, date, items, text: lines.join('\n') };
}

function receiptItemsComment(store, items) {
    const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
    const body = items.map(it => `${it.name.toLowerCase()} ${fmt(it.price)}`).join(', ');
    return ((store ? store + ': ' : '') + body).slice(0, RECEIPT_COMMENT_MAX);
}

// ---------- Интерфейс ----------
function receiptFromInput(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) scanReceipt(file);
}

async function scanReceipt(file) {
    if (!/^image\//.test(file.type || 'image/')) { alert('Выберите фото чека (JPG, PNG, HEIC).'); return; }
    openReceiptDialog(file);
    const setProgress = (text, p) => {
        const st = document.getElementById('receipt-status');
        const bar = document.getElementById('receipt-progress-bar');
        if (st) st.textContent = text;
        if (bar) bar.style.width = Math.round((p || 0) * 100) + '%';
    };
    try {
        setProgress('Подготавливаем фото…', 0.05);
        const canvas = await prepareReceiptImage(file);
        setProgress('Загружаем модуль распознавания (только в первый раз, ~5 МБ)…', 0.1);
        const worker = await getReceiptWorker((status, p) => {
            if (status === 'recognizing text') setProgress(`Читаем чек… ${Math.round(p * 100)}%`, 0.2 + p * 0.8);
            else if (/load/i.test(status)) setProgress('Загружаем словарь русского языка…', 0.1 + p * 0.1);
        });
        setProgress('Читаем чек…', 0.2);
        const { data } = await worker.recognize(canvas);
        if (!document.getElementById('receipt-dialog')) return; // окно закрыли
        renderReceiptResult(parseReceiptText(data.text));
    } catch (e) {
        console.warn('Чек не распознан', e);
        if (!document.getElementById('receipt-dialog')) return;
        setProgress('Не удалось распознать чек: ' + (navigator.onLine ? (e.message || e) : 'для первого запуска нужен интернет, чтобы скачать модуль распознавания') + '. Можно заполнить вручную.', 0);
        renderReceiptResult({ total: 0, store: '', date: '', items: [], text: '' });
    }
}

function openReceiptDialog(file) {
    closeReceiptDialog(false);
    const overlay = document.createElement('div');
    overlay.id = 'receipt-dialog';
    overlay.className = 'export-sheet-overlay';
    const imgUrl = URL.createObjectURL(file);
    overlay.innerHTML = `
        <div class="export-sheet receipt-dialog" role="dialog" aria-modal="true" aria-label="Чек по фото">
            <div class="export-sheet-head">
                <h3>Чек по фото</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="receipt-layout">
                <div class="receipt-photo"><img src="${imgUrl}" alt="Фото чека"></div>
                <div class="receipt-fields" id="receipt-fields">
                    <p class="hint" id="receipt-status">Подготавливаем фото…</p>
                    <div class="receipt-progress"><div id="receipt-progress-bar"></div></div>
                </div>
            </div>
        </div>`;
    overlay._imgUrl = imgUrl;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { closeReceiptDialog(true); return; }
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'save') saveReceiptTx();
        if (act && act.dataset.act === 'rebuild') rebuildReceiptComment();
        if (act && act.dataset.act === 'raw') { const pre = document.getElementById('receipt-raw'); if (pre) pre.hidden = !pre.hidden; }
    });
    document.body.appendChild(overlay);
    playSound('open');
}

function closeReceiptDialog(withSound) {
    const el = document.getElementById('receipt-dialog');
    if (!el) return;
    if (el._imgUrl) URL.revokeObjectURL(el._imgUrl);
    el.remove();
    if (withSound) playSound('close');
}

let receiptResult = null;

function renderReceiptResult(r) {
    receiptResult = r;
    const box = document.getElementById('receipt-fields');
    if (!box) return;
    const found = r.total > 0;
    box.innerHTML = `
        <p class="hint">${found
            ? `Найдено: итог <b>${escapeHtml(String(r.total).replace('.', ','))} ₸</b>, позиций — ${r.items.length}. Проверьте и при необходимости исправьте.`
            : (r.text ? 'Итоговую сумму найти не удалось — впишите её сами.' : 'Впишите данные чека вручную.')}</p>
        <label class="field-inline"><span>Категория</span><input type="text" id="receipt-category" value="Магазин" maxlength="40"></label>
        <label class="field-inline"><span>Магазин</span><input type="text" id="receipt-store" value="${escapeHtml(r.store)}" maxlength="60" placeholder="Название магазина" oninput="rebuildReceiptComment()"></label>
        <label class="field-inline"><span>Сумма, ₸</span><input type="number" id="receipt-total" value="${found ? r.total : ''}" min="0" step="0.01"></label>
        <label class="field-inline"><span>Дата и время</span><input type="datetime-local" id="receipt-date" value="${r.date || almatyIsoNow()}"></label>
        <div class="receipt-items" id="receipt-items">
            ${r.items.map((it, i) => `<label class="receipt-item"><input type="checkbox" data-i="${i}" checked onchange="rebuildReceiptComment()"> <span>${escapeHtml(it.name)}</span> <b>${escapeHtml(String(it.price).replace('.', ','))}</b></label>`).join('')}
        </div>
        <label class="receipt-comment-label" for="receipt-comment">Комментарий (позиции из чека)</label>
        <textarea id="receipt-comment" maxlength="${RECEIPT_COMMENT_MAX}" rows="4">${escapeHtml(receiptItemsComment(r.store, r.items))}</textarea>
        <div class="btn-group">
            <button type="button" class="btn-expense" data-act="save"><span class="material-icons">receipt_long</span> Сохранить расход</button>
            <button type="button" class="btn-secondary" data-act="close">Отмена</button>
        </div>
        ${r.text ? `<button type="button" class="btn-secondary btn-block receipt-raw-btn" data-act="raw"><span class="material-icons">notes</span> Показать распознанный текст</button><pre class="receipt-raw" id="receipt-raw" hidden>${escapeHtml(r.text)}</pre>` : ''}`;
}

function rebuildReceiptComment() {
    if (!receiptResult) return;
    const store = (document.getElementById('receipt-store') || {}).value || '';
    const chosen = [...document.querySelectorAll('#receipt-items input[type="checkbox"]')]
        .filter(c => c.checked).map(c => receiptResult.items[Number(c.dataset.i)]).filter(Boolean);
    const ta = document.getElementById('receipt-comment');
    if (ta) ta.value = receiptItemsComment(store.trim(), chosen);
}

function saveReceiptTx() {
    const amount = Math.round((parseFloat((document.getElementById('receipt-total') || {}).value) || 0) * 100) / 100;
    const category = ((document.getElementById('receipt-category') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Магазин';
    const date = (document.getElementById('receipt-date') || {}).value || almatyIsoNow();
    const comment = ((document.getElementById('receipt-comment') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, RECEIPT_COMMENT_MAX);
    if (!(amount > 0)) { alert('Впишите сумму чека.'); return; }
    const tx = { id: Date.now().toString(), type: 'expense', amount, category, date, fromReceipt: true };
    if (comment) tx.comment = comment;
    transactions.push(tx);
    closeReceiptDialog(false);
    updateUI(true);
    playSound('success');
    showToast(`Записано: ${category} ${amount.toLocaleString('ru-RU')} ₸`);
}
