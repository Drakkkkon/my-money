// --- ВАЛЮТА НОВОЙ ЗАПИСИ ---
// Рядом с суммой — кнопка валюты: тенге (по умолчанию), доллар США, евро, российский рубль.
// Баланс и статистика ведутся в тенге, поэтому запись в другой валюте пересчитывается по курсу из шапки
// (те же курсы, что показаны в блоке баланса), а исходная сумма, валюта и курс сохраняются в записи:
// { amount: сумма в тенге, currency: 'USD', origAmount: 10, rate: 453.67 }.

const TX_CURRENCIES = {
    KZT: { sign: '₸', name: 'тенге', full: 'Казахстанский тенге', rateKey: '' },
    USD: { sign: '$', name: 'доллар США', full: 'Доллар США', rateKey: 'usd' },
    EUR: { sign: '€', name: 'евро', full: 'Евро', rateKey: 'eur' },
    RUB: { sign: '₽', name: 'российский рубль', full: 'Российский рубль', rateKey: 'rub' }
};

function cachedRates() {
    try { return JSON.parse(localStorage.getItem('finance_rates') || 'null'); } catch (e) { return null; }
}

// Курс: сколько тенге за 1 единицу валюты (null — курса нет)
function currencyRate(code) {
    if (code === 'KZT') return 1;
    const info = TX_CURRENCIES[code];
    const rates = cachedRates();
    const v = rates && info ? Number(rates[info.rateKey]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
}

function toTenge(amount, code) {
    const r = currencyRate(code);
    return r ? Math.round(amount * r) : null; // в тенге — до целых, как остальные записи
}

function fmtCur(n, code) {
    const digits = code === 'KZT' ? 0 : 2;
    return Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits }) + ' ' + (TX_CURRENCIES[code] || TX_CURRENCIES.KZT).sign;
}

function txCurrency() {
    const el = document.getElementById('tx-currency');
    return el && TX_CURRENCIES[el.value] ? el.value : 'KZT';
}

function setTxCurrency(code) {
    const el = document.getElementById('tx-currency');
    if (el) el.value = TX_CURRENCIES[code] ? code : 'KZT';
    updateCurrencyHint();
}

function updateCurrencyHint() {
    const code = txCurrency();
    const hint = document.getElementById('tx-currency-hint');
    const amountEl = document.getElementById('amount');
    const btn = document.getElementById('tx-currency');
    if (btn) btn.classList.toggle('is-foreign', code !== 'KZT');
    if (amountEl) amountEl.placeholder = `Сумма (${TX_CURRENCIES[code].sign})`;
    if (!hint) return;
    if (code === 'KZT') { hint.hidden = true; hint.innerHTML = ''; return; }
    const rate = currencyRate(code);
    const amount = parseFloat(amountEl ? amountEl.value : '') || 0;
    hint.hidden = false;
    hint.innerHTML = `<span class="material-icons">currency_exchange</span><span>Выбрана другая валюта: <b>${TX_CURRENCIES[code].name}</b>. ` +
        (rate
            ? `Запись сохранится в тенге по курсу 1 ${TX_CURRENCIES[code].sign} = ${rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₸` +
              (amount ? ` — <b>${fmtCur(amount * rate, 'KZT')}</b>.` : '.')
            : 'Курс пока не загружен — подключитесь к интернету, чтобы пересчитать сумму в тенге.') + '</span>';
}

// Сумма записи из формы в тенге + данные о валюте. null — если пересчитать нельзя.
function formAmountInTenge(rawAmount) {
    const code = txCurrency();
    if (code === 'KZT') return { amount: rawAmount, extra: {} };
    const kzt = toTenge(rawAmount, code);
    if (kzt === null) {
        alert('Нет курса валюты (нет интернета). Выберите тенге или подождите, пока загрузятся курсы.');
        return null;
    }
    return { amount: kzt, extra: { currency: code, origAmount: rawAmount, rate: currencyRate(code) } };
}

// Подпись исходной суммы в истории: «(10 $)»
function txOrigAmountHtml(tx) {
    if (!tx.currency || tx.currency === 'KZT' || !TX_CURRENCIES[tx.currency]) return '';
    return `<span class="tx-orig-amount" title="По курсу ${Number(tx.rate || 0).toLocaleString('ru-RU')} ₸">${escapeHtml(fmtCur(tx.origAmount, tx.currency))}</span>`;
}

window.addEventListener('DOMContentLoaded', () => {
    const amountEl = document.getElementById('amount');
    if (amountEl) amountEl.addEventListener('input', updateCurrencyHint);
    updateCurrencyHint();
});
