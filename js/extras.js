// --- ЦИФРОВАЯ КЛАВИАТУРА НА ГЛАВНОЙ, ПЕРЕЛИСТЫВАНИЕ СВАЙПОМ, КАЛЬКУЛЯТОР С ЛЕНТОЙ ---

// ---------- Клавиатура под кнопками «Доход» / «Расход»: набирает сумму в поле «Сумма» ----------
function txKey(key) {
    const el = document.getElementById('amount');
    if (!el) return;
    let v = String(el.value || '');
    if (key === 'back') v = v.slice(0, -1);
    else if (key === 'clear') v = '';
    else if (/^\d+$/.test(key)) {
        if ((v === '' || v === '0') && /^0+$/.test(key)) v = '0'; // без ведущих нулей
        else v = (v === '0' ? '' : v) + key;
        v = v.slice(0, 12);
    }
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------- Перелистывание разделов свайпом влево / вправо ----------
function visibleMenuIds() {
    if (typeof getMenuState !== 'function') return [];
    // 4.10.0: тот же список, что в меню (в режиме «страницы» — Записи, Стена, блоки-страницы, Настройки)
    if (typeof menuNavItems === 'function') return menuNavItems().map(i => i.id);
    const state = getMenuState();
    return state.order.filter(id => !state.hidden.includes(id));
}

function swipeToTab(dir) {
    const ids = visibleMenuIds();
    const idx = ids.indexOf(typeof currentNavId === 'string' ? currentNavId : (typeof currentTabId === 'string' ? currentTabId : ''));
    const next = ids[idx + dir];
    if (idx < 0 || !next) return false;
    if (typeof openMenuItem === 'function') openMenuItem(next, null); else showTab(next, null);
    const tab = document.getElementById(next);
    if (tab) {
        tab.classList.remove('tab-enter', 'tab-swipe-next', 'tab-swipe-prev');
        void tab.offsetWidth;
        tab.classList.add(dir > 0 ? 'tab-swipe-next' : 'tab-swipe-prev');
        clearTimeout(tab._swipeTimer);
        tab._swipeTimer = setTimeout(() => tab.classList.remove('tab-swipe-next', 'tab-swipe-prev'), 400);
    }
    // Активный пункт нижнего меню — в поле зрения
    const btn = document.querySelector(`.mobile-nav button[data-tab="${next}"]`);
    if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (typeof playSound === 'function') playSound('menu');
    return true;
}

// Свайп не срабатывает в полях ввода, в окнах поверх страницы и там, где что-то само листается вбок
function swipeBlocked(target) {
    if (document.querySelector('.export-sheet-overlay, .card.is-maximized')) return true;
    const splash = document.getElementById('splash-screen');
    if (splash && splash.style.display !== 'none' && splash.offsetParent !== null) return true;
    const pin = document.querySelector('.pin-screen');
    if (pin && pin.offsetParent !== null && getComputedStyle(pin).display !== 'none') return true;
    if (!target || !target.closest) return false;
    if (target.closest('input, textarea, select, .w95-sb, .slider-container, .custom-dropdown, .sidebar, .mobile-nav, [data-no-swipe]')) return true;
    for (let el = target; el && el !== document.body && !el.classList.contains('main-wrapper'); el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 4) {
            const ox = getComputedStyle(el).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
        }
    }
    return false;
}

(function initSwipeTabs() {
    let start = null;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || swipeBlocked(e.target)) { start = null; return; }
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, at: Date.now() };
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (start && e.touches.length !== 1) start = null;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const dt = Date.now() - start.at;
        start = null;
        // Уверенный горизонтальный жест: не меньше 60 px, заметно больше вертикального сдвига, быстрее 0,7 с
        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) swipeToTab(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
})();

// ---------- Калькулятор ----------
// Выражение хранится как список: числа (строки) и знаки + − × ÷. Порядок действий — как в математике.
const CALC_TAPE_KEY = 'finance_calc_tape';
const CALC_OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
let calcTokens = [];
let calcCur = '0';
let calcDone = false;   // только что нажали «=»
let calcError = false;

function calcRound(x) {
    return Math.round(x * 1e10) / 1e10;
}

function calcEvaluate(tokens) {
    const list = tokens.slice();
    if (list.length && CALC_OPS[list[list.length - 1]]) list.pop();
    if (!list.length) return 0;
    // сначала × и ÷
    const stack = [parseFloat(list[0])];
    for (let i = 1; i < list.length; i += 2) {
        const op = list[i];
        const n = parseFloat(list[i + 1]);
        if (op === '*') stack[stack.length - 1] *= n;
        else if (op === '/') stack[stack.length - 1] /= n;
        else stack.push(op === '-' ? -n : n);
    }
    return calcRound(stack.reduce((s, v) => s + v, 0));
}

function calcFormatNumber(str) {
    if (str === '' || str === undefined) return '';
    let s = String(str);
    if (/e/i.test(s)) return s.replace('.', ',');
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1);
    const [i, d] = s.split('.');
    const grouped = (i || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + grouped + (d !== undefined ? ',' + d : '');
}

function calcExprText(tokens) {
    return tokens.map(t => CALC_OPS[t] ? ` ${CALC_OPS[t]} ` : calcFormatNumber(t)).join('');
}

function renderCalc(exprOverride) {
    const ex = document.getElementById('calc-expr');
    const val = document.getElementById('calc-value');
    if (!ex || !val) return;
    ex.textContent = exprOverride !== undefined ? exprOverride : calcExprText(calcTokens);
    val.textContent = calcError ? 'Ошибка' : calcFormatNumber(calcCur === '' ? '0' : calcCur);
}

function calcReset() {
    calcTokens = [];
    calcCur = '0';
    calcDone = false;
    calcError = false;
}

function calcKey(k) {
    if (calcError && k !== 'C') calcReset();
    let exprOverride;
    if (/^\d$/.test(k)) {
        if (calcDone) { calcReset(); calcCur = ''; }
        if (calcCur === '0') calcCur = '';
        if (calcCur.replace(/[^\d]/g, '').length < 15) calcCur += k;
    } else if (k === '.') {
        if (calcDone) { calcReset(); calcCur = ''; }
        if (!calcCur.includes('.')) calcCur = (calcCur === '' || calcCur === '-' ? calcCur + '0' : calcCur) + '.';
    } else if (CALC_OPS[k]) {
        calcDone = false;
        if (calcCur === '' || calcCur === '-') {
            if (calcTokens.length && CALC_OPS[calcTokens[calcTokens.length - 1]]) calcTokens[calcTokens.length - 1] = k; // поменять знак
        } else {
            calcTokens.push(calcCur.replace(/\.$/, ''), k);
            calcCur = '';
        }
    } else if (k === '%') {
        if (calcCur !== '' && calcCur !== '-') {
            const n = parseFloat(calcCur);
            const last = calcTokens[calcTokens.length - 1];
            // a + b% = a + a·b/100; иначе просто b/100
            const base = (last === '+' || last === '-') ? calcEvaluate(calcTokens) : null;
            calcCur = String(calcRound(base !== null ? base * n / 100 : n / 100));
            calcDone = false;
        }
    } else if (k === 'neg') {
        if (calcCur === '' || calcCur === '0') calcCur = calcCur === '' ? '-' : '0';
        else calcCur = calcCur.startsWith('-') ? calcCur.slice(1) : '-' + calcCur;
        calcDone = false;
    } else if (k === 'back') {
        if (calcDone) { calcTokens = []; calcDone = false; }
        else {
            calcCur = calcCur.slice(0, -1);
            if (calcCur === '' && !calcTokens.length) calcCur = '0';
        }
    } else if (k === 'C') {
        calcReset();
    } else if (k === '=') {
        const full = calcTokens.slice();
        if (calcCur !== '' && calcCur !== '-') full.push(calcCur.replace(/\.$/, ''));
        while (full.length && CALC_OPS[full[full.length - 1]]) full.pop();
        if (full.length >= 3) {
            const result = calcEvaluate(full);
            const expr = calcExprText(full);
            if (!isFinite(result)) {
                calcReset();
                calcError = true;
                exprOverride = expr + ' =';
            } else {
                addCalcTape(expr, result);
                calcTokens = [];
                calcCur = String(result);
                calcDone = true;
                exprOverride = expr + ' =';
            }
        }
    }
    renderCalc(exprOverride);
}

// ---------- Лента: все вычисления, новые сверху ----------
function getCalcTape() {
    try {
        const v = JSON.parse(localStorage.getItem(CALC_TAPE_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

function saveCalcTape(list) {
    try { localStorage.setItem(CALC_TAPE_KEY, JSON.stringify(list.slice(0, 300))); } catch (e) {}
}

function addCalcTape(expr, result) {
    const list = getCalcTape();
    list.unshift({ expr, result, at: Date.now() });
    saveCalcTape(list);
    renderCalcTape();
}

function renderCalcTape() {
    const box = document.getElementById('calc-tape');
    if (!box) return;
    const list = getCalcTape();
    if (!list.length) {
        box.innerHTML = '<p class="hint calc-tape-empty">Здесь появятся все ваши вычисления.<br>Нажмите на строку, чтобы снова взять результат в калькулятор.</p>';
        return;
    }
    box.innerHTML = list.map((r, i) => {
        const d = new Date(r.at);
        const when = isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<button type="button" class="calc-tape-row" onclick="useCalcTape(${i})" title="Взять результат в калькулятор">
            <span class="calc-tape-main"><span class="calc-tape-expr">${escapeHtml(r.expr)} =</span><span class="calc-tape-time">${when}</span></span>
            <span class="calc-tape-res">${calcFormatNumber(String(r.result))}</span>
        </button>`;
    }).join('');
}

function useCalcTape(i) {
    const r = getCalcTape()[i];
    if (!r) return;
    calcReset();
    calcCur = String(r.result);
    calcDone = true;
    renderCalc(r.expr + ' =');
}

async function copyCalcTape() {
    const list = getCalcTape();
    if (!list.length) { alert('Лента пока пустая.'); return; }
    const text = list.map(r => `${r.expr} = ${calcFormatNumber(String(r.result))}`).join('\n');
    const ok = typeof copyTextToClipboard === 'function' ? await copyTextToClipboard(text) : false;
    if (typeof showToast === 'function') showToast(ok ? 'Лента скопирована' : 'Не удалось скопировать');
}

function clearCalcTape() {
    if (!getCalcTape().length || !confirm('Очистить ленту калькулятора?')) return;
    saveCalcTape([]);
    renderCalcTape();
}

// Счёт с клавиатуры на ПК, когда открыт раздел «Статистика»
document.addEventListener('keydown', (e) => {
    if (typeof currentTabId === 'undefined' || currentTabId !== 'statistics') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.export-sheet-overlay')) return;
    const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'C', ',': '.', '.': '.', '%': '%', '+': '+', '-': '-', '*': '*', '/': '/', x: '*', 'х': '*' };
    const k = /^\d$/.test(e.key) ? e.key : map[e.key];
    if (!k) return;
    e.preventDefault();
    calcKey(k);
});

window.addEventListener('DOMContentLoaded', () => {
    renderCalc();
    renderCalcTape();
});
