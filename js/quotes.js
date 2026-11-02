// --- КОТИРОВКИ АКЦИЙ ---
// Раздел «Котировки»: блоки с акциями популярных компаний, свои котировки (кнопка «+», поиск любой компании),
// одна котировка в блоке баланса и пара котировок на заставке.
// Данные — Yahoo Finance. Сайт Yahoo не отдаёт данные другим сайтам напрямую, поэтому запрос идёт через
// бесплатный публичный посредник r.jina.ai (без ключа, до ~20 запросов в минуту): все котировки — одним запросом.
// Последние цены хранятся на устройстве, поэтому без интернета видны прежние значения.

const QUOTE_PROXY = 'https://r.jina.ai/';
const QUOTE_CACHE_KEY = 'finance_quotes_cache';
const QUOTE_REFRESH_MS = 10 * 60 * 1000;

const QUOTE_GROUPS = [
    { id: 'us', name: 'Технологии США', icon: 'memory', symbols: [
        ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet (Google)'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['TSLA', 'Tesla'], ['NFLX', 'Netflix']] },
    { id: 'kz', name: 'Казахстан', icon: 'flag', symbols: [
        ['KSPI', 'Kaspi.kz'], ['FRHC', 'Freedom Holding'], ['HSBK.IL', 'Halyk Bank'], ['KAP.IL', 'Казатомпром'], ['AIRA.IL', 'Air Astana']] },
    { id: 'world', name: 'Мировые компании', icon: 'public', symbols: [
        ['KO', 'Coca-Cola'], ['MCD', "McDonald's"], ['NKE', 'Nike'], ['V', 'Visa'], ['JPM', 'JPMorgan Chase'], ['DIS', 'Disney'], ['TM', 'Toyota'], ['BABA', 'Alibaba']] }
];

// Свои котировки пользователя: [{ id, symbol, name, exchange }] — синхронизируются через Google Диск (cloud.js)
let userQuotes = [];
try { userQuotes = JSON.parse(localStorage.getItem('finance_quotes') || '[]') || []; } catch (e) { userQuotes = []; }
if (!Array.isArray(userQuotes)) userQuotes = [];

let quoteCache = {};
try { quoteCache = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || '{}') || {}; } catch (e) { quoteCache = {}; }
let quotesLoading = false;
let quotesError = '';

function saveUserQuotesLocal() {
    try { localStorage.setItem('finance_quotes', JSON.stringify(userQuotes)); } catch (e) {}
}

function quoteSymbolOk(s) {
    return /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/.test(String(s || ''));
}

function knownQuoteName(symbol) {
    for (const g of QUOTE_GROUPS) { const hit = g.symbols.find(([s]) => s === symbol); if (hit) return hit[1]; }
    const u = userQuotes.find(q => q.symbol === symbol);
    if (u) return u.name;
    return (quoteCache[symbol] && quoteCache[symbol].name) || symbol;
}

function allQuoteSymbols() {
    const set = new Set();
    QUOTE_GROUPS.forEach(g => g.symbols.forEach(([s]) => { if (!uiPrefs.quotes.hidden.includes(s)) set.add(s); }));
    userQuotes.forEach(q => q && quoteSymbolOk(q.symbol) && set.add(q.symbol));
    if (uiPrefs.quotes.header) set.add(uiPrefs.quotes.header);
    uiPrefs.quotes.splash.forEach(s => set.add(s));
    return [...set].filter(quoteSymbolOk);
}

async function proxyFetchText(url, timeoutMs = 20000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const r = await fetch(QUOTE_PROXY + url, {
            headers: { 'X-Return-Format': 'text' },
            cache: 'no-store',
            ...(controller ? { signal: controller.signal } : {})
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.text();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function parseSpark(text) {
    const start = text.indexOf('{');
    const data = JSON.parse(start > 0 ? text.slice(start) : text);
    const out = {};
    ((data.spark && data.spark.result) || []).forEach(res => {
        const r = res.response && res.response[0];
        if (!r || !r.meta) return;
        const m = r.meta;
        const closes = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter(v => Number.isFinite(v));
        const price = Number(m.regularMarketPrice);
        if (!Number.isFinite(price)) return;
        const prev = closes.length > 1 ? closes[closes.length - 2] : Number(m.chartPreviousClose);
        out[res.symbol] = {
            price,
            prev: Number.isFinite(prev) ? prev : null,
            currency: m.currency || '',
            name: m.shortName || m.longName || '',
            exchange: m.fullExchangeName || m.exchangeName || '',
            time: (Number(m.regularMarketTime) || 0) * 1000,
            closes: closes.slice(-10)
        };
    });
    return out;
}

async function fetchQuotes(symbols = allQuoteSymbols(), { force = false } = {}) {
    if (quotesLoading || !symbols.length) return;
    const fresh = symbols.every(s => quoteCache[s] && Date.now() - (quoteCache[s].fetchedAt || 0) < QUOTE_REFRESH_MS);
    if (fresh && !force) { renderAllQuotes(); return; }
    if (!navigator.onLine) { quotesError = 'Нет интернета — показаны последние известные цены'; renderAllQuotes(); return; }
    quotesLoading = true;
    renderQuotesStatus();
    try {
        let got = 0;
        for (let i = 0; i < symbols.length; i += 20) {
            const chunk = symbols.slice(i, i + 20);
            const url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=' + chunk.map(encodeURIComponent).join(',') + '&range=5d&interval=1d';
            const res = parseSpark(await proxyFetchText(url));
            Object.entries(res).forEach(([s, q]) => { quoteCache[s] = { ...q, fetchedAt: Date.now() }; got++; });
        }
        quotesError = got ? '' : 'Сервис котировок не ответил — попробуйте позже';
        try { localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(quoteCache)); } catch (e) {}
    } catch (e) {
        console.warn('Котировки не загрузились', e);
        quotesError = 'Не удалось обновить котировки' + (Object.keys(quoteCache).length ? ' — показаны последние известные цены' : '');
    } finally {
        quotesLoading = false;
        renderAllQuotes();
    }
}

// ---------- Форматирование ----------
const CURRENCY_SIGNS = { USD: '$', EUR: '€', RUB: '₽', KZT: '₸', GBP: '£', GBp: 'p', JPY: '¥', CNY: '¥', HKD: 'HK$', KRW: '₩', INR: '₹', TRY: '₺' };

function fmtQuotePrice(q) {
    const digits = q.price >= 1000 ? 0 : 2;
    const num = q.price.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${num} ${CURRENCY_SIGNS[q.currency] || q.currency || ''}`.trim();
}

function quoteChange(q) {
    if (!q || !Number.isFinite(q.prev) || !q.prev) return null;
    return (q.price - q.prev) / q.prev * 100;
}

function fmtChange(ch) {
    if (ch === null) return '';
    const s = Math.abs(ch).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '') + s + '%';
}

// Примерная цена в тенге по курсу из шапки (только для $, € и ₽)
function quoteInTenge(q) {
    let rates = null;
    try { rates = JSON.parse(localStorage.getItem('finance_rates') || 'null'); } catch (e) {}
    const k = { USD: 'usd', EUR: 'eur', RUB: 'rub' }[q.currency];
    if (!rates || !k || !rates[k]) return '';
    return '≈ ' + Math.round(q.price * rates[k]).toLocaleString('ru-RU') + ' ₸';
}

function sparkSvg(closes, up) {
    if (!closes || closes.length < 2) return '';
    const min = Math.min(...closes), max = Math.max(...closes);
    const span = max - min || 1;
    const pts = closes.map((v, i) => `${(i / (closes.length - 1) * 60).toFixed(1)},${(18 - (v - min) / span * 16).toFixed(1)}`).join(' ');
    return `<svg class="q-spark ${up ? 'is-up' : 'is-down'}" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function quoteBadge(symbol) {
    // цветной кружок с буквой вместо логотипа
    let h = 0;
    for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="q-badge" style="--q-hue:${h}" aria-hidden="true">${escapeHtml(symbol.replace(/[^A-Z0-9]/g, '').slice(0, 2) || '?')}</span>`;
}

// ---------- Раздел «Котировки» ----------
function quoteRowHtml(symbol, { own = false, groupId = '' } = {}) {
    const q = quoteCache[symbol];
    const name = knownQuoteName(symbol);
    const ch = quoteChange(q);
    const dir = ch === null ? '' : ch >= 0 ? 'is-up' : 'is-down';
    const inHeader = uiPrefs.quotes.header === symbol;
    const onSplash = uiPrefs.quotes.splash.includes(symbol);
    return `<div class="q-row" data-symbol="${escapeHtml(symbol)}">
        ${quoteBadge(symbol)}
        <div class="q-name"><b>${escapeHtml(symbol)}</b><span>${escapeHtml(name)}</span></div>
        ${q ? sparkSvg(q.closes, ch === null || ch >= 0) : '<span class="q-spark"></span>'}
        <div class="q-price">
            <b>${q ? escapeHtml(fmtQuotePrice(q)) : '—'}</b>
            <span class="q-change ${dir}">${q ? fmtChange(ch) : (quotesLoading ? 'загрузка…' : 'нет данных')}</span>
            ${q ? `<span class="q-kzt">${quoteInTenge(q)}</span>` : ''}
        </div>
        <div class="q-actions">
            <button type="button" class="q-act${inHeader ? ' is-on' : ''}" onclick="setHeaderQuote('${escapeHtml(symbol)}')" title="Показывать в блоке баланса" aria-label="Показывать ${escapeHtml(symbol)} в блоке баланса" aria-pressed="${inHeader}"><span class="material-icons">push_pin</span></button>
            <button type="button" class="q-act${onSplash ? ' is-on' : ''}" onclick="toggleSplashQuote('${escapeHtml(symbol)}')" title="Показывать на заставке" aria-label="Показывать ${escapeHtml(symbol)} на заставке" aria-pressed="${onSplash}"><span class="material-icons">wb_twilight</span></button>
            ${own
                ? `<button type="button" class="q-act" onclick="removeUserQuote('${escapeHtml(symbol)}')" title="Убрать" aria-label="Убрать ${escapeHtml(symbol)}"><span class="material-icons">delete</span></button>`
                : `<button type="button" class="q-act" onclick="hideStdQuote('${escapeHtml(symbol)}')" title="Скрыть" aria-label="Скрыть ${escapeHtml(symbol)}"><span class="material-icons">visibility_off</span></button>`}
        </div>
    </div>`;
}

// Окна котировок — прямо в разделе (main > .tab > .card), чтобы темы оформляли их как остальные окна
function renderQuotesTab() {
    const box = document.getElementById('quotes');
    if (!box) return;
    const groups = QUOTE_GROUPS.map(g => {
        const syms = g.symbols.map(([s]) => s).filter(s => !uiPrefs.quotes.hidden.includes(s));
        if (!syms.length) return '';
        return `<div class="card quotes-card" id="quotes-${g.id}">
            <h3><span class="material-icons">${g.icon}</span> ${g.name}</h3>
            <div class="q-list">${syms.map(s => quoteRowHtml(s, { groupId: g.id })).join('')}</div>
        </div>`;
    }).join('');
    const own = userQuotes.filter(q => q && quoteSymbolOk(q.symbol));
    const ownCard = `<div class="card quotes-card quotes-own" id="quotes-own">
        <h3><span class="material-icons">bookmark</span> Мои котировки</h3>
        <div class="q-list">${own.length ? own.map(q => quoteRowHtml(q.symbol, { own: true })).join('') : '<p class="hint">Нажмите «+», найдите любую компанию по названию или тикеру и добавьте её сюда.</p>'}</div>
        <button type="button" class="btn-primary btn-block q-add-btn" onclick="openQuoteSearch()"><span class="material-icons">add</span> Добавить компанию</button>
    </div>`;
    // развёрнутое на весь экран окно остаётся развёрнутым после обновления цен
    const maxId = (box.querySelector(':scope > .quotes-card.is-maximized') || {}).id;
    box.querySelectorAll(':scope > .quotes-card').forEach(el => el.remove());
    box.insertAdjacentHTML('beforeend', ownCard + groups);
    if (maxId && document.getElementById(maxId)) document.getElementById(maxId).classList.add('is-maximized');
    else if (maxId) document.body.classList.remove('has-maximized');
    const hiddenBtn = document.getElementById('quotes-show-hidden');
    if (hiddenBtn) hiddenBtn.style.display = uiPrefs.quotes.hidden.length ? '' : 'none';
    if (typeof enhanceCards === 'function') enhanceCards(box);
    if (typeof applyWall === 'function') applyWall(); // окна котировок, вынесенные на «Стену», перерисованы заново
}

function renderQuotesStatus() {
    const el = document.getElementById('quotes-status');
    if (!el) return;
    const times = Object.values(quoteCache).map(q => q.fetchedAt || 0);
    const last = times.length ? Math.max(...times) : 0;
    const lastText = last ? formatAlmaty({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(last)) : 'ещё не было';
    el.textContent = quotesLoading ? 'Обновляем котировки…' : (quotesError || `Обновлено: ${lastText}. Цены — по последним торгам биржи (задержка до 15–20 минут).`);
    el.classList.toggle('is-error', !!quotesError && !quotesLoading);
}

function renderHeaderQuote() {
    const el = document.getElementById('hdr-quote');
    if (!el) return;
    const s = uiPrefs.quotes.header;
    const q = s && quoteCache[s];
    if (!s) { el.innerHTML = ''; return; }
    if (!q) { el.innerHTML = `<span class="material-icons" aria-hidden="true">show_chart</span> ${escapeHtml(s)} <span class="rate-note">загрузка…</span>`; return; }
    const ch = quoteChange(q);
    el.innerHTML = `<span class="material-icons" aria-hidden="true">show_chart</span> <b>${escapeHtml(s)}</b> ${escapeHtml(fmtQuotePrice(q))} ` +
        `<span class="q-change ${ch === null ? '' : ch >= 0 ? 'is-up' : 'is-down'}">${fmtChange(ch)}</span>`;
    el.title = knownQuoteName(s);
}

function renderSplashQuotes() {
    const el = document.getElementById('splash-quotes');
    if (!el) return;
    el.innerHTML = uiPrefs.quotes.splash.map(s => {
        const q = quoteCache[s];
        const ch = quoteChange(q);
        return `<div class="splash-quote"><b>${escapeHtml(s)}</b> <span>${q ? escapeHtml(fmtQuotePrice(q)) : '—'}</span> ` +
            `<span class="q-change ${ch === null ? '' : ch >= 0 ? 'is-up' : 'is-down'}">${q ? fmtChange(ch) : ''}</span></div>`;
    }).join('');
}

function renderAllQuotes() {
    renderQuotesTab();
    renderQuotesStatus();
    renderHeaderQuote();
    renderSplashQuotes();
}

// ---------- Действия ----------
function setHeaderQuote(symbol) {
    uiPrefs.quotes.header = uiPrefs.quotes.header === symbol ? '' : symbol;
    commitUiPrefs();
    renderAllQuotes();
    showToast(uiPrefs.quotes.header ? `${symbol} теперь в блоке баланса` : 'Котировка убрана из блока баланса');
}

function toggleSplashQuote(symbol) {
    const list = uiPrefs.quotes.splash.filter(s => s !== symbol);
    if (list.length === uiPrefs.quotes.splash.length) {
        if (list.length >= 3) { showToast('На заставке помещается до 3 котировок — сначала уберите одну'); return; }
        list.push(symbol);
    }
    uiPrefs.quotes.splash = list;
    commitUiPrefs();
    renderAllQuotes();
}

function hideStdQuote(symbol) {
    if (!uiPrefs.quotes.hidden.includes(symbol)) uiPrefs.quotes.hidden.push(symbol);
    commitUiPrefs();
    renderAllQuotes();
}

function showHiddenQuotes() {
    uiPrefs.quotes.hidden = [];
    commitUiPrefs();
    fetchQuotes();
}

function removeUserQuote(symbol) {
    if (!confirm(`Убрать ${symbol} из «Моих котировок»?`)) return;
    userQuotes = userQuotes.filter(q => q.symbol !== symbol);
    if (uiPrefs.quotes.header === symbol) uiPrefs.quotes.header = '';
    uiPrefs.quotes.splash = uiPrefs.quotes.splash.filter(s => s !== symbol);
    commitUiPrefs();
    renderAllQuotes();
}

async function addUserQuote(symbol, name, exchange) {
    symbol = String(symbol || '').trim().toUpperCase();
    if (!quoteSymbolOk(symbol)) { alert('Тикер выглядит неправильно. Пример: AAPL, KSPI, HSBK.IL'); return; }
    if (userQuotes.some(q => q.symbol === symbol)) { showToast(`${symbol} уже в «Моих котировках»`); return; }
    userQuotes.push({ id: 'q' + symbol.replace(/[^A-Z0-9]/g, '_'), symbol, name: String(name || symbol).slice(0, 80), exchange: String(exchange || '').slice(0, 60) });
    uiPrefs.quotes.hidden = uiPrefs.quotes.hidden.filter(s => s !== symbol);
    closeQuoteSearch(true);
    commitUiPrefs();
    renderAllQuotes();
    showToast(`${symbol} добавлен`);
    await fetchQuotes([symbol], { force: true });
    if (!quoteCache[symbol]) showToast(`Для ${symbol} пока нет цены — проверьте тикер`);
}

// ---------- Окно поиска компании («+») ----------
let quoteSearchTimer = null;

function openQuoteSearch() {
    closeQuoteSearch(false);
    const overlay = document.createElement('div');
    overlay.id = 'quote-search';
    overlay.className = 'export-sheet-overlay';
    overlay.innerHTML = `
        <div class="export-sheet quote-search" role="dialog" aria-modal="true" aria-label="Добавить компанию">
            <div class="export-sheet-head">
                <h3>Добавить компанию</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">Введите название компании или тикер (например: Coca-Cola, Samsung, KSPI). Поиск идёт по всем биржам мира через Yahoo Finance.</p>
            <div class="quote-search-row">
                <input type="text" id="quote-search-input" placeholder="Название или тикер" autocomplete="off" maxlength="40">
                <button type="button" class="btn-primary" data-act="search"><span class="material-icons">search</span></button>
            </div>
            <div class="quote-results" id="quote-results"></div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-secondary" data-act="manual"><span class="material-icons">edit</span> Добавить тикер как есть</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { closeQuoteSearch(true); return; }
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'search') runQuoteSearch();
        if (act && act.dataset.act === 'manual') {
            const v = document.getElementById('quote-search-input').value.trim();
            if (!v) { alert('Введите тикер, например AAPL'); return; }
            addUserQuote(v, v, '');
        }
        const add = e.target.closest('[data-add]');
        if (add) addUserQuote(add.dataset.add, add.dataset.name, add.dataset.ex);
    });
    document.body.appendChild(overlay);
    const input = document.getElementById('quote-search-input');
    input.addEventListener('input', () => { clearTimeout(quoteSearchTimer); quoteSearchTimer = setTimeout(runQuoteSearch, 700); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(quoteSearchTimer); runQuoteSearch(); } });
    setTimeout(() => input.focus(), 50);
    playSound('open');
}

function closeQuoteSearch(withSound) {
    const el = document.getElementById('quote-search');
    if (!el) return;
    el.remove();
    clearTimeout(quoteSearchTimer);
    if (withSound) playSound('close');
}

let quoteSearchSeq = 0;
async function runQuoteSearch() {
    const input = document.getElementById('quote-search-input');
    const box = document.getElementById('quote-results');
    if (!input || !box) return;
    const q = input.value.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const seq = ++quoteSearchSeq;
    box.innerHTML = '<p class="hint">Ищем…</p>';
    try {
        const text = await proxyFetchText('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=10&newsCount=0&listsCount=0');
        if (seq !== quoteSearchSeq) return;
        const data = JSON.parse(text.slice(text.indexOf('{')));
        const list = (data.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'MUTUALFUND', 'CURRENCY', 'FUTURE'].includes(x.quoteType));
        box.innerHTML = list.length ? list.map(x => {
            const name = x.longname || x.shortname || x.symbol;
            return `<div class="quote-result">
                ${quoteBadge(String(x.symbol).toUpperCase())}
                <div class="q-name"><b>${escapeHtml(x.symbol)}</b><span>${escapeHtml(name)}</span><span class="q-ex">${escapeHtml([x.exchDisp, x.typeDisp].filter(Boolean).join(' · '))}</span></div>
                <button type="button" class="btn-secondary" data-add="${escapeHtml(x.symbol)}" data-name="${escapeHtml(name)}" data-ex="${escapeHtml(x.exchDisp || '')}"><span class="material-icons">add</span></button>
            </div>`;
        }).join('') : '<p class="hint">Ничего не найдено. Попробуйте другое название или английское написание.</p>';
    } catch (e) {
        if (seq !== quoteSearchSeq) return;
        box.innerHTML = '<p class="hint">Поиск сейчас недоступен (нет интернета или сервис занят). Можно добавить тикер вручную кнопкой ниже.</p>';
    }
}

// ---------- Обновление ----------
function onQuotesTabShown() {
    renderAllQuotes();
    fetchQuotes();
}

window.addEventListener('DOMContentLoaded', () => {
    renderAllQuotes();
    setTimeout(() => fetchQuotes(), 900);
});
setInterval(() => { if (document.visibilityState === 'visible') fetchQuotes(); }, QUOTE_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fetchQuotes(); });
window.addEventListener('online', () => fetchQuotes());
