// --- OLDBOOK: КАТАЛОГ OLDBOOK.KZ ---
// Первый блок раздела Oldbook. Книгу можно найти:
//  • по номеру из каталога (SKU на сайте, например 14898);
//  • по фото обложки: текст с обложки распознаётся на устройстве (тот же модуль, что у чеков, js/receipt.js),
//    по нему ищется такая же книга; если точной нет — с тем же названием и автором; иначе «Книга не найдена»;
//  • по названию или автору, вписанным вручную.
// Данные берутся из каталога сайта oldbook.kz (магазин на платформе Slash): поиск /shop/catalog?q=…,
// страница книги /shop/products/<id>. Сайт не отдаёт данные другим сайтам напрямую, поэтому запросы идут через
// посредник r.jina.ai (как котировки и товары по ссылке). Найденная книга: обложка и корешок (если среди фото есть
// узкое высокое — это корешок; если нет — только первое фото обложки), автор, жанр, кратко о книге, цена и наличие,
// ссылки на поиск этой книги на Ozon и Wildberries и кнопка «Найти в Telegram» (заработает позже).

const OB_SITE = 'https://oldbook.kz';
const OB_PROXY = 'https://r.jina.ai/';

async function obFetchHtml(path) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 30000) : null;
    try {
        const r = await fetch(OB_PROXY + OB_SITE + path, { headers: { 'X-Return-Format': 'html' }, ...(controller ? { signal: controller.signal } : {}) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return new DOMParser().parseFromString(await r.text(), 'text/html');
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function obNum(s) {
    const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

// Поиск по каталогу: карточки «Автор. Название», номер, цена, обложка
async function obSearch(query) {
    const doc = await obFetchHtml('/shop/catalog?q=' + encodeURIComponent(query));
    const seen = new Set();
    const out = [];
    doc.querySelectorAll('a[href*="/shop/products/"]').forEach(a => {
        const m = (a.getAttribute('href') || '').match(/\/shop\/products\/([0-9a-f-]{36})/);
        if (!m || seen.has(m[1])) return;
        const img = a.querySelector('img');
        if (!img) return;
        seen.add(m[1]);
        const text = a.textContent.replace(/\s+/g, ' ');
        const priceM = text.match(/(\d[\d\s  ]*)\s*₸/);
        const skuEl = a.querySelector('.tabular-nums');
        out.push({
            id: m[1],
            title: (img.getAttribute('alt') || '').trim(),
            image: img.getAttribute('src') || '',
            sku: skuEl ? skuEl.textContent.trim() : '',
            price: priceM ? obNum(priceM[1]) : null
        });
    });
    return out;
}

// Страница книги: фото, характеристики, описание, цена, наличие
async function obProduct(id) {
    const doc = await obFetchHtml('/shop/products/' + id);
    const lines = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
        if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
        const v = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (v) lines.push(v);
    }
    const after = (label, from = 0) => { const i = lines.indexOf(label, from); return i >= 0 ? lines[i + 1] : ''; };
    const stop = lines.indexOf('С этим товаром покупают');
    const end = stop > 0 ? stop : lines.length;
    const charStart = lines.indexOf('Характеристики');
    const chars = {};
    if (charStart >= 0) {
        ['Автор', 'Издательство', 'Год издания', 'Количество страниц', 'Переплет', 'Состояние', 'Жанр', 'Серия', 'ISBN'].forEach(k => {
            const i = lines.indexOf(k, charStart);
            if (i > 0 && i < end) chars[k] = lines[i + 1];
        });
    }
    // описание без служебного «ЭТО БУКИНИСТИЧЕСКАЯ КНИГА…» и строки состояния
    const dStart = lines.indexOf('Описание');
    let desc = '';
    if (dStart >= 0) {
        desc = lines.slice(dStart + 1, charStart > dStart ? charStart : dStart + 6).join(' ')
            .replace(/ЭТО БУКИНИСТИЧЕСКАЯ КНИГА[\s\S]*?ФОТО!?/i, ' ')
            .replace(/Состояние:[^.!?]*[.!?]?/i, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    const title = (doc.title || '').replace(/\s*—\s*купить книгу.*$/i, '').trim();
    const priceLine = lines.find(l => /В корзину/.test(l)) || '';
    // цена — только из кнопки «В корзину · N ₸» (у книги не в наличии её нет; другие ₸ на странице — соседние книги)
    const price = obNum((priceLine.match(/([\d\s ]+)\s*₸/) || [])[1]);
    const stock = lines.find(l => /^В наличии|^Нет в наличии/.test(l)) || '';
    // фото товара — до блока «С этим товаром покупают»
    const marker = [...doc.querySelectorAll('body *')].find(e => e.children.length === 0 && /С этим товаром покупают/.test(e.textContent));
    const images = [...new Set([...doc.querySelectorAll('img')]
        .filter(i => !marker || (i.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING))
        .map(i => i.getAttribute('src')).filter(s => s && s.includes('slash-shop')))];
    return {
        id, title, sku: after('SKU:'), price, stock, inStock: /^В наличии/.test(stock),
        author: chars['Автор'] || (title.includes('.') ? title.split('.')[0] : ''),
        genre: chars['Жанр'] || '', publisher: chars['Издательство'] || '', year: chars['Год издания'] || '',
        pages: chars['Количество страниц'] || '', binding: chars['Переплет'] || '', condition: chars['Состояние'] || '',
        description: desc.slice(0, 420) + (desc.length > 420 ? '…' : ''),
        images, url: OB_SITE + '/shop/products/' + id
    };
}

// Корешок — узкое высокое фото (высота больше ширины в 2,2 раза и более)
function obFindSpine(urls) {
    return Promise.all(urls.slice(0, 14).map(u => new Promise(res => {
        const i = new Image();
        i.onload = () => res({ u, r: i.naturalHeight / Math.max(1, i.naturalWidth) });
        i.onerror = () => res({ u, r: 0 });
        i.src = u;
    }))).then(list => (list.find(x => x.r >= 2.2) || {}).u || '');
}

// ---------- Сравнение названий ----------
function obTokens(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i).filter(w => w.length >= 3);
}

// Доля слов карточки, найденных в тексте обложки
function obMatchScore(cardTitle, text) {
    const t = obTokens(cardTitle);
    if (!t.length) return 0;
    const set = new Set(obTokens(text));
    return t.filter(w => set.has(w) || [...set].some(x => x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length / t.length;
}

// ---------- Интерфейс ----------
function obCatStatus(html) {
    const el = document.getElementById('obc-status');
    if (el) el.innerHTML = html;
}

function obCatResult(html) {
    const el = document.getElementById('obc-result');
    if (el) el.innerHTML = html;
}

async function obSearchByNumber() {
    const input = document.getElementById('obc-number');
    const num = (input ? input.value : '').replace(/[^\d]/g, '');
    if (!num) { alert('Введите номер книги из каталога OldBook.kz (например 14898).'); return; }
    obCatStatus('Ищем книгу №' + num + '…');
    obCatResult('');
    try {
        const list = await obSearch(num);
        const hit = list.find(b => b.sku === num);
        if (!hit) { obCatStatus(''); obCatResult('<p class="obc-notfound">Книга не найдена</p>'); return; }
        await obShowBook(hit.id);
    } catch (e) {
        obCatStatus('Каталог OldBook.kz сейчас недоступен (нет интернета или сайт не ответил). Попробуйте позже.');
    }
}

async function obSearchByText(text, { fromPhoto = false } = {}) {
    const q = String(text || '').replace(/\s+/g, ' ').trim();
    if (q.length < 3) { alert('Впишите название книги или автора.'); return; }
    obCatStatus('Ищем «' + escapeHtml(q.slice(0, 60)) + '» в каталоге…');
    obCatResult('');
    try {
        // сначала весь текст, затем по строкам обложки (каталог ищет по всем словам сразу)
        const lines = String(text || '').split(/\s*\n\s*/).map(l => l.trim()).filter(l => obTokens(l).length);
        const queries = [...new Set([q, ...lines.slice(0, 3).map(l => l), lines.slice(0, 2).join(' ')].filter(x => x && x.length >= 3))].slice(0, 5);
        let found = [];
        for (const qq of queries) {
            const list = await obSearch(qq);
            list.forEach(b => { if (!found.some(f => f.id === b.id)) found.push(b); });
            if (found.some(b => obMatchScore(b.title, q) >= 0.8)) break;
        }
        found = found.map(b => ({ ...b, score: obMatchScore(b.title, q) })).sort((a, b) => b.score - a.score);
        const exact = found.filter(b => b.score >= 0.8);
        const same = found.filter(b => b.score >= 0.5 && b.score < 0.8);
        if (exact.length === 1 || (exact.length && fromPhoto)) {
            obCatStatus(exact.length > 1 ? `Найдено точных совпадений: ${exact.length}. Показана первая, остальные ниже.` : '');
            await obShowBook(exact[0].id, exact.slice(1));
            return;
        }
        const list = exact.length ? exact : same;
        if (!list.length) { obCatStatus(''); obCatResult('<p class="obc-notfound">Книга не найдена</p>'); return; }
        obCatStatus(exact.length ? 'Найдено несколько подходящих книг:' : 'Точно такой книги нет. Книги с тем же названием и автором:');
        obCatResult(obListHtml(list));
    } catch (e) {
        obCatStatus('Каталог OldBook.kz сейчас недоступен (нет интернета или сайт не ответил). Попробуйте позже.');
    }
}

function obListHtml(list) {
    return `<div class="obc-list">${list.slice(0, 8).map(b => `
        <button type="button" class="obc-item" onclick="obShowBook('${b.id}')">
            <img src="${escapeHtml(b.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
            <span class="obc-item-title" data-i18n-skip>${escapeHtml(b.title)}</span>
            <span class="obc-item-meta">№ ${escapeHtml(b.sku || '—')}${b.price ? ' · ' + b.price.toLocaleString('ru-RU') + ' ₸' : ''}</span>
        </button>`).join('')}</div>`;
}

async function obShowBook(id, others = []) {
    obCatStatus('Загружаем книгу…');
    let b;
    try {
        b = await obProduct(id);
    } catch (e) {
        obCatStatus('Не удалось открыть страницу книги. Попробуйте позже.');
        return;
    }
    obCatStatus('');
    const cover = b.images[0] || '';
    const q = encodeURIComponent(b.title.replace(/\.\s*/g, ' ').trim());
    obCatResult(`
        <div class="obc-book">
            <div class="obc-photos">
                ${cover ? `<a href="${escapeHtml(b.url)}" target="_blank" rel="noopener"><img class="obc-cover" src="${escapeHtml(cover)}" alt="Обложка" referrerpolicy="no-referrer"></a>` : ''}
                <img class="obc-spine" id="obc-spine" alt="Корешок" hidden referrerpolicy="no-referrer">
            </div>
            <div class="obc-info">
                <b class="obc-title" data-i18n-skip>${escapeHtml(b.title)}</b>
                ${b.author ? `<span class="obc-line"><span>Автор:</span> <b data-i18n-skip>${escapeHtml(b.author)}</b></span>` : ''}
                ${b.genre ? `<span class="obc-line"><span>Жанр:</span> <b data-i18n-skip>${escapeHtml(b.genre)}</b></span>` : ''}
                <span class="obc-line obc-meta" data-i18n-skip>${escapeHtml([b.publisher, b.year, b.pages ? b.pages + ' с.' : '', b.binding, b.condition].filter(Boolean).join(' · '))}</span>
                ${b.description ? `<p class="obc-desc" data-i18n-skip>${escapeHtml(b.description)}</p>` : ''}
                <div class="obc-buy">
                    ${b.price ? `<b class="obc-price">${b.price.toLocaleString('ru-RU')} ₸</b>` : ''}
                    <span class="obc-stock ${b.inStock ? 'is-in' : 'is-out'}">${escapeHtml(b.stock || (b.inStock ? 'В наличии' : 'Нет в наличии'))}</span>
                    <span class="obc-sku">№ ${escapeHtml(b.sku)}</span>
                </div>
                <a class="btn-primary obc-open" href="${escapeHtml(b.url)}" target="_blank" rel="noopener"><span class="material-icons">open_in_new</span> Открыть на OldBook.kz</a>
            </div>
        </div>
        <div class="obc-shops">
            <p class="hint">Такие же и похожие книги в других магазинах:</p>
            <a class="btn-secondary" href="https://www.ozon.ru/search/?text=${q}&from_global=true" target="_blank" rel="noopener"><span class="material-icons">search</span> Ozon</a>
            <a class="btn-secondary" href="https://www.wildberries.ru/catalog/0/search.aspx?search=${q}" target="_blank" rel="noopener"><span class="material-icons">search</span> Wildberries</a>
            <button type="button" class="btn-secondary" disabled title="Скоро"><span class="material-icons">send</span> Найти в Telegram · скоро</button>
        </div>
        ${others.length ? `<p class="hint">Ещё точные совпадения:</p>${obListHtml(others)}` : ''}`);
    // корешок — если среди фото есть узкое высокое
    const spine = await obFindSpine(b.images.slice(1));
    const el = document.getElementById('obc-spine');
    if (el && spine) { el.src = spine; el.hidden = false; }
}

// ---------- Фото обложки ----------
function obCoverFromInput(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) obScanCover(file);
}

async function obScanCover(file) {
    if (typeof getReceiptWorker !== 'function') { alert('Модуль распознавания не загружен.'); return; }
    obCatResult('');
    obCatStatus('Подготавливаем фото обложки…');
    try {
        const canvas = await prepareReceiptImage(file);
        const worker = await getReceiptWorker((status, p) => {
            if (status === 'recognizing text') obCatStatus(`Читаем обложку… ${Math.round(p * 100)}%`);
            else if (/load/i.test(status)) obCatStatus('Загружаем модуль распознавания (только в первый раз)…');
        });
        const { data } = await worker.recognize(canvas);
        // строки обложки: только с буквами, без мусора
        const lines = String(data.text || '').split('\n').map(l => l.replace(/[^A-Za-zА-Яа-яЁё0-9 .,:«»"'-]/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(l => (l.match(/[A-Za-zА-Яа-яЁё]/g) || []).length >= 3);
        const text = lines.slice(0, 6).join('\n');
        const input = document.getElementById('obc-text');
        if (input) input.value = lines.slice(0, 4).join(' ');
        if (!text) { obCatStatus(''); obCatResult('<p class="obc-notfound">Книга не найдена</p><p class="hint">На фото не удалось прочитать текст. Сфотографируйте обложку ровнее и ближе или впишите название вручную.</p>'); return; }
        obCatStatus('С обложки прочитано: «' + escapeHtml(lines.slice(0, 3).join(' / ')) + '». Ищем в каталоге…');
        await obSearchByText(text, { fromPhoto: true });
    } catch (e) {
        obCatStatus('Не удалось распознать обложку: ' + escapeHtml(e.message || String(e)));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const num = document.getElementById('obc-number');
    if (num) num.addEventListener('keydown', e => { if (e.key === 'Enter') obSearchByNumber(); });
    const txt = document.getElementById('obc-text');
    if (txt) txt.addEventListener('keydown', e => { if (e.key === 'Enter') obSearchByText(txt.value); });
});
