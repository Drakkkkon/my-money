// --- СПИСОК ПОКУПОК И ЦЕНЫ ---
// «Цели» → «Список покупок»: покупки вписываются по одной или вставляется текст сообщения — приложение само
// разбивает его на пункты (по строкам, запятым, «;»), находит количество («2 шт», «1,5 кг») и цену («450 тг»).
// Слева квадратик «куплено». Цена у пункта сохраняется и попадает в раздел «Цены».
// Раздел «Цены»: все цены (из списка покупок, из чеков по фото и вписанные вручную) — динамика цены товара
// за период, сравнение магазинов, разные валюты (пересчёт в тенге по курсу из шапки).
// shopList и priceRecords синхронизируются через Google Диск (cloud.js: 'shop', 'prices').

let shopList = [];
let priceRecords = [];
try { shopList = JSON.parse(localStorage.getItem('finance_shop') || '[]') || []; } catch (e) { shopList = []; }
try { priceRecords = JSON.parse(localStorage.getItem('finance_prices') || '[]') || []; } catch (e) { priceRecords = []; }
if (!Array.isArray(shopList)) shopList = [];
if (!Array.isArray(priceRecords)) priceRecords = [];

const PRICE_UNITS = ['шт', 'кг', 'г', 'л', 'мл', 'уп'];
const PRICE_SOURCES = { shop: 'список покупок', receipt: 'чек', manual: 'вручную' };

function saveShoppingLocal() {
    try {
        localStorage.setItem('finance_shop', JSON.stringify(shopList));
        localStorage.setItem('finance_prices', JSON.stringify(priceRecords));
    } catch (e) {}
}

function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Ключ товара для группировки: «Молоко 3,2% 1л» и «молоко 3,2%» — один товар
function productKey(name) {
    return String(name || '').toLowerCase().replace(/ё/g, 'е')
        .replace(/\d+(?:[.,]\d+)?\s*(кг|г|гр|л|мл|шт|уп)\.?(?![а-яa-z])/gi, '')
        .replace(/[^a-zа-я0-9%]+/gi, ' ').trim();
}

function capitalizeFirst(s) {
    s = String(s || '').trim();
    return s ? s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1) : s;
}

// Количество и единица из названия: «Рис 1кг» → { qty: 1, unit: 'кг' }
function parseQtyUnit(text) {
    const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(кг|гр|г|л|мл|шт|уп)\.?(?![а-яa-z])/i);
    if (!m) return { qty: null, unit: '' };
    let unit = m[2].toLowerCase();
    if (unit === 'гр') unit = 'г';
    return { qty: parseFloat(m[1].replace(',', '.')), unit };
}

// Цена за 1 кг / 1 л / 1 шт для сравнения
function unitPrice(rec) {
    const kzt = priceInTenge(rec);
    if (kzt === null || !rec.qty || !rec.unit) return null;
    if (rec.unit === 'г') return { value: kzt / rec.qty * 1000, unit: 'кг' };
    if (rec.unit === 'мл') return { value: kzt / rec.qty * 1000, unit: 'л' };
    return { value: kzt / rec.qty, unit: rec.unit };
}

function priceInTenge(rec) {
    const code = rec.currency || 'KZT';
    if (code === 'KZT') return rec.price;
    // курс на момент записи, если сохранён, иначе текущий
    if (rec.rate) return rec.price * rec.rate;
    const r = typeof currencyRate === 'function' ? currencyRate(code) : null;
    return r ? rec.price * r : null;
}

function fmtTenge(n) {
    return Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
}

function todayIso() {
    return almatyIsoNow().slice(0, 10);
}

// ---------- Разбор текста со списком ----------
// «1. Молоко 2 шт — 450 тг», «- хлеб», «яйца 10», «сыр, колбаса; помидоры 1,5 кг»
function parseShoppingText(text) {
    // запятая внутри числа («1,5 кг», «2,50 $») — не разделитель
    const parts = String(text || '')
        .replace(/\r/g, '')
        .replace(/(\d),(\d)/g, '$1\u0001$2')
        .split(/[\n;,]/)
        .map(s => s.replace(/\u0001/g, ',').trim()).filter(Boolean);
    const items = [];
    parts.forEach(raw => {
        if (/:\s*$/.test(raw)) return; // заголовок сообщения: «Купи, пожалуйста:»
        let s = raw
            .replace(/^[\s\-–—•*·>]+/, '')                      // маркеры списка
            .replace(/^[☐-☒✅❌✔✖️\s]+/u, '') // ☐ ✅ ✔
            .replace(/^\d{1,2}\s*[.)]\s+/, '')                  // «1.», «2)»
            .replace(/^\[\s*[xх ]?\s*\]\s*/i, '')               // «[ ]», «[x]»
            .trim();
        if (!s || !/[a-zа-яё]/i.test(s)) return;
        let price = null, currency = 'KZT', qty = '';
        // цена с валютой: «450 тг», «450₸», «5$», «300 руб»
        const pm = s.match(/[-–—:=]?\s*(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(₸|тг|тенге|т\.|\$|usd|долл\w*|€|eur|евро|₽|руб\w*|р\.)(?=\s|$)/i);
        if (pm) {
            price = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
            const c = pm[2].toLowerCase();
            currency = /\$|usd|долл/.test(c) ? 'USD' : /€|eur|евро/.test(c) ? 'EUR' : /₽|руб|р\./.test(c) ? 'RUB' : 'KZT';
            s = (s.slice(0, pm.index) + s.slice(pm.index + pm[0].length)).trim();
        }
        // количество: «2 шт», «1,5 кг», «x2», «2 пачки», «3 бутылки»
        const qm = s.match(/(?:^|\s)(?:[xх×]\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(шт|кг|гр|г|л|мл|уп|пач\w*|бут\w*|бан\w*|пак\w*|десят\w*|штук\w*))\.?(?=\s|$)/i);
        if (qm) {
            qty = qm[1] ? qm[1] + ' шт' : `${qm[2]} ${qm[3].toLowerCase()}`;
            s = (s.slice(0, qm.index) + ' ' + s.slice(qm.index + qm[0].length)).trim();
        }
        // голое число в конце: до 30 — количество, больше — цена
        const tail = s.match(/[\s\-–—:=]+(\d+(?:[.,]\d+)?)\s*$/);
        if (tail) {
            const n = parseFloat(tail[1].replace(',', '.'));
            if (price === null && n > 30) price = n;
            else if (!qty) qty = tail[1] + ' шт';
            s = s.slice(0, tail.index).trim();
        }
        s = s.replace(/[\s\-–—:=,.]+$/, '').replace(/\s{2,}/g, ' ').trim();
        if (!/[a-zа-яё]/i.test(s)) return;
        items.push({ name: capitalizeFirst(s).slice(0, 60), qty: qty.slice(0, 20), price, currency });
    });
    return items;
}

// ---------- Список покупок ----------
function addShoppingFromInput() {
    const ta = document.getElementById('shop-input');
    const items = parseShoppingText(ta ? ta.value : '');
    if (!items.length) { alert('Впишите покупки: по одной в строке или через запятую. Можно вставить текст сообщения целиком.'); return; }
    const store = ((document.getElementById('shop-store') || {}).value || '').trim().slice(0, 40);
    items.forEach(it => {
        const item = { id: newId('sh'), name: it.name, qty: it.qty, price: it.price, currency: it.currency, bought: false, store, addedAt: Date.now() };
        shopList.push(item);
        if (it.price) syncShopPrice(item);
    });
    if (ta) ta.value = '';
    updateUI(true);
    showToast(`Добавлено в список: ${items.length}`);
}

async function pasteShoppingText() {
    try {
        const text = await navigator.clipboard.readText();
        const ta = document.getElementById('shop-input');
        if (ta) ta.value = (ta.value ? ta.value + '\n' : '') + text;
        renderShopPreview();
    } catch (e) {
        alert('Не удалось прочитать буфер обмена. Нажмите в поле и вставьте текст вручную (долгое нажатие → «Вставить»).');
    }
}

function renderShopPreview() {
    const box = document.getElementById('shop-preview');
    const ta = document.getElementById('shop-input');
    if (!box || !ta) return;
    const items = parseShoppingText(ta.value);
    box.innerHTML = items.length > 1 || (items.length === 1 && /[\n,;]/.test(ta.value))
        ? `<span class="hint">Получится ${items.length}: ${items.map(i => escapeHtml(i.name) + (i.qty ? ` (${escapeHtml(i.qty)})` : '') + (i.price ? ` — ${escapeHtml(fmtCur(i.price, i.currency))}` : '')).join(', ')}</span>`
        : '';
}

function toggleShopItem(id, bought) {
    const it = shopList.find(i => i.id === id);
    if (!it) return;
    it.bought = !!bought;
    if (it.bought) it.boughtAt = Date.now(); else delete it.boughtAt;
    updateUI(true);
}

function setShopPrice(id, value) {
    const it = shopList.find(i => i.id === id);
    if (!it) return;
    const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
    it.price = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    syncShopPrice(it);
    updateUI(true);
    if (it.price) showToast(`Цена «${it.name}» сохранена в «Ценах»`);
}

function setShopCurrency(id, code) {
    const it = shopList.find(i => i.id === id);
    if (!it || !TX_CURRENCIES[code]) return;
    it.currency = code;
    syncShopPrice(it);
    updateUI(true);
}

// Цена из списка покупок — одна запись в «Ценах» на пункт (правка цены обновляет её)
function syncShopPrice(it) {
    const id = 'prs' + it.id;
    priceRecords = priceRecords.filter(r => r.id !== id);
    if (!it.price) return;
    const qu = parseQtyUnit(it.qty);
    priceRecords.push({
        id, product: it.name, price: it.price, currency: it.currency || 'KZT', store: it.store || '',
        qty: qu.qty, unit: qu.unit, date: todayIso(), source: 'shop',
        ...(it.currency && it.currency !== 'KZT' && currencyRate(it.currency) ? { rate: currencyRate(it.currency) } : {})
    });
}

function deleteShopItem(id) {
    shopList = shopList.filter(i => i.id !== id);
    updateUI(true);
}

function clearBoughtItems() {
    const n = shopList.filter(i => i.bought).length;
    if (!n) { showToast('Купленных пунктов нет'); return; }
    if (!confirm(`Убрать из списка купленное (${n})? Цены останутся в разделе «Цены».`)) return;
    shopList = shopList.filter(i => !i.bought);
    updateUI(true);
}

function copyShoppingList() {
    const text = shopList.filter(i => !i.bought).map(i => '• ' + i.name + (i.qty ? ' — ' + i.qty : '')).join('\n');
    if (!text) { showToast('В списке нечего копировать'); return; }
    copyTextToClipboard(text).then(ok => showToast(ok ? 'Список скопирован — можно отправить в мессенджер' : 'Не удалось скопировать'));
}

function renderShoppingList() {
    const box = document.getElementById('shop-list');
    if (!box) return;
    const sum = document.getElementById('shop-summary');
    if (!shopList.length) {
        box.innerHTML = '<p class="hint shop-empty">Список пуст. Впишите покупки выше или вставьте сообщение со списком.</p>';
        if (sum) sum.textContent = '';
        return;
    }
    const sorted = [...shopList].sort((a, b) => (a.bought - b.bought) || (a.addedAt - b.addedAt));
    box.innerHTML = sorted.map(it => {
        const last = lastPriceFor(it.name, it.id);
        return `<div class="shop-item${it.bought ? ' is-bought' : ''}">
            <label class="shop-check" title="Куплено">
                <input type="checkbox" ${it.bought ? 'checked' : ''} onchange="toggleShopItem('${it.id}', this.checked)" aria-label="Куплено: ${escapeHtml(it.name)}">
            </label>
            <div class="shop-name">
                <span>${escapeHtml(it.name)}</span>
                ${it.qty ? `<small>${escapeHtml(it.qty)}</small>` : ''}
                ${last && !it.price ? `<small class="shop-last">в прошлый раз ${escapeHtml(fmtCur(last.price, last.currency || 'KZT'))}${last.store ? ', ' + escapeHtml(last.store) : ''}</small>` : ''}
            </div>
            <input type="number" class="shop-price" min="0" step="any" inputmode="decimal" placeholder="Цена" value="${it.price || ''}" onchange="setShopPrice('${it.id}', this.value)" aria-label="Цена: ${escapeHtml(it.name)}">
            <select class="shop-cur" onchange="setShopCurrency('${it.id}', this.value)" aria-label="Валюта цены">
                ${Object.entries(TX_CURRENCIES).map(([k, v]) => `<option value="${k}" ${(it.currency || 'KZT') === k ? 'selected' : ''}>${v.sign}</option>`).join('')}
            </select>
            <button type="button" class="shop-del" onclick="deleteShopItem('${it.id}')" aria-label="Убрать «${escapeHtml(it.name)}»"><span class="material-icons">close</span></button>
        </div>`;
    }).join('');
    if (sum) {
        const total = shopList.reduce((s, i) => s + (i.price ? (priceInTenge(i) || 0) : 0), 0);
        const left = shopList.filter(i => !i.bought).length;
        sum.textContent = `Осталось купить: ${left} из ${shopList.length}` + (total ? ` · по ценам ≈ ${fmtTenge(total)}` : '');
    }
}

function lastPriceFor(name, exceptShopId) {
    const key = productKey(name);
    return priceRecords
        .filter(r => productKey(r.product) === key && r.id !== 'prs' + exceptShopId)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

// ---------- Цены из чека (js/receipt.js) ----------
function addReceiptPrices(items, store, dateIso) {
    const date = String(dateIso || todayIso()).slice(0, 10);
    let n = 0;
    items.forEach(it => {
        if (!it || !it.name || !(it.price > 0)) return;
        const qu = parseQtyUnit(it.raw || it.name);
        priceRecords.push({ id: newId('prr'), product: capitalizeFirst(it.name), price: it.price, currency: 'KZT', store: store || '', qty: qu.qty, unit: qu.unit, date, source: 'receipt' });
        n++;
    });
    return n;
}

// ---------- Раздел «Цены» ----------
function addManualPrice() {
    const g = id => (document.getElementById(id) || {}).value || '';
    const product = g('pr-product').replace(/\s+/g, ' ').trim().slice(0, 60);
    const price = parseFloat(g('pr-price').replace(',', '.'));
    if (!product || !(price > 0)) { alert('Впишите товар и цену.'); return; }
    const currency = TX_CURRENCIES[g('pr-currency')] ? g('pr-currency') : 'KZT';
    const qty = parseFloat(g('pr-qty').replace(',', '.'));
    const rec = {
        id: newId('prm'), product: capitalizeFirst(product), price, currency, store: g('pr-store').trim().slice(0, 40),
        qty: Number.isFinite(qty) && qty > 0 ? qty : null, unit: PRICE_UNITS.includes(g('pr-unit')) ? g('pr-unit') : '',
        date: /^\d{4}-\d{2}-\d{2}$/.test(g('pr-date')) ? g('pr-date') : todayIso(), source: 'manual'
    };
    if (currency !== 'KZT' && currencyRate(currency)) rec.rate = currencyRate(currency);
    priceRecords.push(rec);
    ['pr-product', 'pr-price', 'pr-qty'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const chartSel = document.getElementById('pr-chart-product');
    if (chartSel) chartSel.dataset.want = productKey(rec.product);
    updateUI(true);
    showToast(`Цена «${rec.product}» сохранена`);
}

function deletePriceRecord(id) {
    if (!confirm('Удалить эту цену?')) return;
    priceRecords = priceRecords.filter(r => r.id !== id);
    shopList.forEach(i => { if ('prs' + i.id === id) i.price = null; });
    updateUI(true);
}

function priceProducts() {
    const map = new Map();
    priceRecords.forEach(r => {
        const k = productKey(r.product);
        if (!k) return;
        const cur = map.get(k);
        if (!cur) map.set(k, { key: k, name: r.product, count: 1, last: r.date });
        else { cur.count++; if (r.date > cur.last) { cur.last = r.date; cur.name = r.product; } }
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

function pricePeriodStart() {
    const v = (document.getElementById('pr-period') || {}).value || '90';
    if (v === 'all') return '';
    return almatyIsoNow(-(Number(v) - 1)).slice(0, 10);
}

function renderPrices() {
    renderPriceChart();
    renderPriceStores();
    renderPriceList();
    const dl = document.getElementById('pr-products');
    if (dl) dl.innerHTML = priceProducts().map(p => `<option value="${escapeHtml(p.name)}"></option>`).join('');
    const sl = document.getElementById('pr-stores');
    if (sl) sl.innerHTML = [...new Set(priceRecords.map(r => r.store).filter(Boolean))].map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
    const dateEl = document.getElementById('pr-date');
    if (dateEl && !dateEl.value) dateEl.value = todayIso();
}

const PRICE_LINE_COLORS = ['#000080', '#d00000', '#008000', '#ff8000', '#800080', '#008080', '#808000', '#ff00ff'];

function renderPriceChart() {
    const sel = document.getElementById('pr-chart-product');
    const stats = document.getElementById('pr-chart-stats');
    if (!sel) return;
    const products = priceProducts();
    const want = sel.dataset.want || sel.value;
    delete sel.dataset.want;
    sel.innerHTML = products.length
        ? products.map(p => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.name)} (${p.count})</option>`).join('')
        : '<option value="">Цен пока нет</option>';
    if (products.some(p => p.key === want)) sel.value = want;
    const key = sel.value;
    const from = pricePeriodStart();
    const showOrig = ((document.getElementById('pr-cur-mode') || {}).value || 'kzt') === 'orig';
    const recs = priceRecords.filter(r => productKey(r.product) === key && (!from || r.date >= from))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const dates = [...new Set(recs.map(r => r.date))];
    const stores = [...new Set(recs.map(r => r.store || 'Без магазина'))];
    const value = r => showOrig ? r.price : priceInTenge(r);
    const datasets = stores.map((s, i) => ({
        label: s,
        data: dates.map(d => {
            const hit = recs.filter(r => (r.store || 'Без магазина') === s && r.date === d).pop();
            return hit ? value(hit) : null;
        }),
        borderColor: PRICE_LINE_COLORS[i % PRICE_LINE_COLORS.length],
        backgroundColor: PRICE_LINE_COLORS[i % PRICE_LINE_COLORS.length],
        spanGaps: true, tension: 0, pointRadius: 4, borderWidth: 2
    }));
    if (typeof upsertChart === 'function') upsertChart('priceLine', 'priceChart', {
        type: 'line',
        data: { labels: dates.map(d => shortDate(d)), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: false } } }
    });
    if (!stats) return;
    if (!recs.length) { stats.innerHTML = '<p class="hint">Нет цен за выбранный период. Цены попадают сюда из списка покупок, из чеков по фото и из формы выше.</p>'; return; }
    const vals = recs.map(r => priceInTenge(r)).filter(v => v !== null);
    const first = vals[0], last = vals[vals.length - 1];
    const ch = first ? (last - first) / first * 100 : 0;
    const min = Math.min(...vals), max = Math.max(...vals);
    const minRec = recs.find(r => priceInTenge(r) === min);
    const curs = [...new Set(recs.map(r => r.currency || 'KZT'))];
    const kpi = (label, value, cls = '') => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span></div>`;
    stats.innerHTML = `<div class="kpi-grid price-kpi">
        ${kpi('Последняя цена', fmtTenge(last))}
        ${kpi('Изменение за период', `${ch > 0 ? '+' : ''}${ch.toFixed(1).replace('.', ',')}%`, ch > 0 ? 'amount-expense' : ch < 0 ? 'amount-income' : '')}
        ${kpi('Дешевле всего', `${fmtTenge(min)} <small>${escapeHtml(minRec.store || '')} ${escapeHtml(shortDate(minRec.date))}</small>`)}
        ${kpi('Дороже всего', fmtTenge(max))}
    </div>${curs.some(c => c !== 'KZT') ? `<p class="hint">Есть цены в ${curs.filter(c => c !== 'KZT').join(', ')} — ${showOrig ? 'на графике в исходной валюте' : 'пересчитаны в тенге по курсу на день записи'}.</p>` : ''}`;
}

// Последняя цена каждого товара в каждом магазине
function renderPriceStores() {
    const box = document.getElementById('pr-stores-table');
    if (!box) return;
    const from = pricePeriodStart();
    const recs = priceRecords.filter(r => !from || r.date >= from);
    const stores = [...new Set(recs.map(r => r.store || 'Без магазина'))];
    const products = priceProducts().filter(p => recs.some(r => productKey(r.product) === p.key)).slice(0, 60);
    if (!recs.length || !products.length) { box.innerHTML = '<p class="hint">Пока нечего сравнивать.</p>'; return; }
    const cell = (key, store) => {
        const r = recs.filter(x => productKey(x.product) === key && (x.store || 'Без магазина') === store)
            .sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
        if (!r) return '<td class="pr-none">—</td>';
        const up = unitPrice(r);
        return `<td><b>${escapeHtml(fmtCur(r.price, r.currency || 'KZT'))}</b>${up ? `<small>${fmtTenge(up.value)}/${up.unit}</small>` : ''}<small>${escapeHtml(shortDate(r.date))}</small></td>`;
    };
    box.innerHTML = `<div class="table-scroll"><table class="analytics-table price-table">
        <thead><tr><th>Товар</th>${stores.map(s => `<th>${escapeHtml(s)}</th>`).join('')}</tr></thead>
        <tbody>${products.map(p => `<tr><td>${escapeHtml(p.name)}</td>${stores.map(s => cell(p.key, s)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function renderPriceList() {
    const box = document.getElementById('pr-list');
    if (!box) return;
    const q = productKey((document.getElementById('pr-search') || {}).value || '');
    const list = [...priceRecords]
        .filter(r => !q || productKey(r.product).includes(q) || String(r.store || '').toLowerCase().includes(q))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    box.innerHTML = list.length ? list.slice(0, 300).map(r => {
        const up = unitPrice(r);
        return `<div class="pr-row">
            <div class="pr-row-main"><b>${escapeHtml(r.product)}</b>
                <small>${escapeHtml([shortDate(r.date) + '.' + String(r.date).slice(2, 4), r.store, r.qty ? `${String(r.qty).replace('.', ',')} ${r.unit}` : '', PRICE_SOURCES[r.source] || ''].filter(Boolean).join(' · '))}</small></div>
            <div class="pr-row-price"><b>${escapeHtml(fmtCur(r.price, r.currency || 'KZT'))}</b>${r.currency && r.currency !== 'KZT' ? `<small>≈ ${fmtTenge(priceInTenge(r))}</small>` : ''}${up ? `<small>${fmtTenge(up.value)} за 1 ${up.unit}</small>` : ''}</div>
            <button type="button" class="shop-del" onclick="deletePriceRecord('${r.id}')" aria-label="Удалить цену"><span class="material-icons">delete</span></button>
        </div>`;
    }).join('') : '<p class="hint">Цен пока нет.</p>';
}

function renderShoppingAndPrices() {
    renderShoppingList();
    renderPrices();
}

window.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('shop-input');
    if (ta) ta.addEventListener('input', renderShopPreview);
});
