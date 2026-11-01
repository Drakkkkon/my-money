// Облако (вход через Google, данные на Google Диске, перенос из старого Firebase-аккаунта) — js/cloud.js.

// Заглушки на случай, если какой-то из файлов js/*.js не загрузился (нет сети, старая копия страницы):
// приложение должно запуститься в любом случае, просто без этой части.
['playSound', 'playStartupChime', 'renderOldbook', 'onOldbookTabShown', 'renderSoundSettings', 'applySavedTheme',
    'openSoundPicker', 'initW95Scrollbars']
    .forEach(name => { if (typeof window[name] !== 'function') window[name] = function () {}; });
if (typeof window.getFormComment !== 'function') window.getFormComment = function () { return ''; };
if (typeof window.setFormComment !== 'function') window.setFormComment = function () {};

// Выполняет шаг запуска; ошибка в одном шаге не останавливает остальные (слайдер, вход, меню)
function safeStep(name, fn) {
    try {
        fn();
    } catch (e) {
        console.error('Ошибка при запуске (' + name + '):', e);
    }
}

let transactions = [];
let subscriptions = [];
let priorityGoal = { name: '', amount: 0, icon: '🎯' };
let manualLimit = 0;
let savings = 0;
let profileName = '';
let oldbookEntries = [];   // свои записи Oldbook
let oldbookLinks = [];     // книги Oldbook других пользователей, которыми с вами поделились
let customCategories = []; // свои категории пользователя: [{ id, name }]
let myChart = null;

window.onload = function() {
    // Слайдер разблокировки — первым: заставка не должна «зависнуть», даже если что-то ниже сломается
    safeStep('слайдер', initSlider);
    safeStep('данные', loadData);
    safeStep('перенос лимита', checkDailyRollover);

    let dtInput = document.getElementById('tx-datetime');
    if (dtInput) dtInput.value = almatyIsoNow();

    safeStep('диаграммы', () => {
        if (typeof Chart === 'undefined') return;
        // Диаграммы в стиле Windows 95: без скруглений; цвета текста и сетки задаёт тема (js/themes.js)
        Chart.defaults.font.family = "Tahoma, 'MS Sans Serif', 'Segoe UI', sans-serif";
        Chart.defaults.animation.duration = 400; // все анимации приложения не дольше 0.5 с
    });
    safeStep('тема', applySavedTheme);
    safeStep('интерфейс', () => updateUI(false));
    safeStep('полосы прокрутки', initW95Scrollbars);
    safeStep('облако', initCloud);
    safeStep('офлайн-режим', registerServiceWorker);
};

// --- ПРОФИЛЬ ---
function fillProfileInput() {
    const input = document.getElementById('profile-name');
    if (input && document.activeElement !== input) input.value = profileName;
    const greet = document.getElementById('splash-greeting');
    if (greet) updateSplashClock();
}

function saveProfileName() {
    const input = document.getElementById('profile-name');
    const value = input ? input.value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    profileName = value;
    updateUI(true);
    fillProfileInput();
    alert(value
        ? `Имя «${value}» сохранено.` + (isCloudConnected() ? ' Оно сохранится и в вашем аккаунте Google.' : ' Войдите через Google, чтобы оно сохранилось в аккаунте.')
        : 'Имя удалено.');
}

// Имя файла выгрузки: дата_время_имя (время Алматы), например 2026-11-01_14-30_Айдар.xlsx
function exportFileName(ext, suffix = '') {
    const [date, time] = almatyIsoNow().split('T');
    const name = String(profileName || 'MyMoney').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_').replace(/[._]+$/, '') || 'MyMoney';
    return `${date}_${time.replace(':', '-')}_${name}${suffix}.${ext}`;
}

// --- ОФЛАЙН-РЕЖИМ И АВТООБНОВЛЕНИЕ САЙТА ---
// sw.js отдаёт свежие файлы сайта из сети, а без интернета — из кэша. Новая версия подхватывается при открытии.
function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;
    // Когда новая версия сайта взяла управление — один раз перезагружаем страницу, чтобы не смешивать версии
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then(reg => {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });
        })
        .catch(e => console.warn('Service worker не зарегистрирован', e));
}


// --- ОСТАЛЬНАЯ ЛОГИКА ---
function loadData() {
    try {
        if (localStorage.getItem('finance_tx')) transactions = JSON.parse(localStorage.getItem('finance_tx'));
        if (localStorage.getItem('finance_subs')) subscriptions = JSON.parse(localStorage.getItem('finance_subs'));
        if (localStorage.getItem('finance_goal')) priorityGoal = JSON.parse(localStorage.getItem('finance_goal'));
        if (localStorage.getItem('finance_limit')) manualLimit = parseFloat(localStorage.getItem('finance_limit')) || 0;
        if (localStorage.getItem('finance_savings')) savings = parseFloat(localStorage.getItem('finance_savings')) || 0;
        profileName = localStorage.getItem('finance_profile_name') || '';
        if (localStorage.getItem('finance_oldbook')) oldbookEntries = JSON.parse(localStorage.getItem('finance_oldbook')) || [];
        if (localStorage.getItem('finance_ob_links')) oldbookLinks = JSON.parse(localStorage.getItem('finance_ob_links')) || [];
        if (localStorage.getItem('finance_categories')) customCategories = JSON.parse(localStorage.getItem('finance_categories')) || [];
    } catch(e) {
        console.error("Error loading local storage:", e);
    }
    initSyncBaseline();
    fillProfileInput();

    // Оформление одно (Windows 95, css/win95.css): прежние темы, фон шапки, шрифт и цвет текста больше не применяются
    ['finance_theme', 'finance_bg', 'finance_full_theme', 'finance_font', 'finance_text_color'].forEach(k => localStorage.removeItem(k));

    let mLimit = document.getElementById('manual-limit');
    if (mLimit) mLimit.value = manualLimit > 0 ? manualLimit : '';
}

function getTxDateStr(datetimeStr) {
    if (!datetimeStr) return '';
    return datetimeStr.includes('T') ? datetimeStr.split('T')[0] : datetimeStr;
}

function checkDailyRollover() {
    const today = almatyIsoNow().split('T')[0];
    let lastDate = localStorage.getItem('finance_lastDate');
    
    if (!lastDate) {
        localStorage.setItem('finance_lastDate', today);
        return;
    }
    
    if (lastDate !== today && manualLimit > 0) {
        let dayExpenses = transactions
            .filter(t => getTxDateStr(t.date) === lastDate && t.type === 'expense' && !t.isSystem)
            .reduce((sum, t) => sum + t.amount, 0);
            
        let saved = manualLimit - dayExpenses;
        
        if (saved > 0 && priorityGoal.amount > 0) {
            savings += saved;
            transactions.push({
                id: Date.now().toString(),
                type: 'expense',
                amount: saved,
                category: 'Автоперенос в копилку (остаток лимита)',
                date: lastDate + 'T23:59',
                isSystem: true
            });
            updateUI(true);
        }
        localStorage.setItem('finance_lastDate', today);
    }
}

function updateUI(pushToCloud = false) {
    saveDataLocally();

    let balance = transactions.reduce((acc, tx) => tx.type === 'income' ? acc + tx.amount : acc - tx.amount, 0);
    
    let elBalance = document.getElementById('balance');
    let elSavings = document.getElementById('savings');
    let elLimitDisp = document.getElementById('daily-limit-display');

    if (elBalance) elBalance.innerText = `${balance.toFixed(0)} ₸`;
    if (elSavings) elSavings.innerText = `${savings.toFixed(0)} ₸`;
    if (elLimitDisp) elLimitDisp.innerText = manualLimit > 0 ? `${manualLimit} ₸` : 'Не установлен';

    renderTransactions();
    renderSubscriptions();
    if(typeof renderSalaryList === "function") renderSalaryList();
    renderGoal();
    generateReport();
    renderStatistics();
    renderOldbook();
    renderCategorySettings();

    // Если флаг pushToCloud true, изменения отправляются на Google Диск (с небольшой задержкой, пачкой)
    if (pushToCloud) scheduleCloudSync();
}

function renderStatistics() {
    let todayStr = almatyIsoNow().split('T')[0];
    
    let spentToday = transactions
        .filter(t => getTxDateStr(t.date) === todayStr && t.type === 'expense' && !t.isSystem)
        .reduce((sum, t) => sum + t.amount, 0);
        
    let elTodaySpent = document.getElementById('today-spent');
    if (elTodaySpent) elTodaySpent.innerText = `${spentToday} ₸`;
    
    renderStatsKpi(todayStr);
    if (typeof Chart === 'undefined') return;

    let dates = [];
    for(let i=6; i>=0; i--) {
        dates.push(almatyIsoNow(-i).split('T')[0]);
    }

    let incomeData = dates.map(d => {
        return transactions.filter(t => getTxDateStr(t.date) === d && t.type === 'income' && !t.isSystem)
                           .reduce((sum, t) => sum + t.amount, 0);
    });
    let expenseData = dates.map(d => {
        return transactions.filter(t => getTxDateStr(t.date) === d && t.type === 'expense' && !t.isSystem)
                           .reduce((sum, t) => sum + t.amount, 0);
    });

    let displayDates = dates.map(shortDate);

    const ctx = document.getElementById('mainChart');
    if (ctx) {
        if (myChart) {
            myChart.data.labels = displayDates;
            myChart.data.datasets[0].data = incomeData;
            myChart.data.datasets[1].data = expenseData;
            myChart.update();
        } else {
            myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: displayDates,
                    datasets: [
                        { label: 'Доход', data: incomeData, backgroundColor: STAT_COLORS.income, borderRadius: 0 },
                        { label: 'Расход', data: expenseData, backgroundColor: STAT_COLORS.expense, borderRadius: 0 }
                    ]
                },
                options: barOptions()
            });
        }
    }

    renderExtraCharts(todayStr);
}

// --- РАСШИРЕННАЯ СТАТИСТИКА ---
// Палитра в духе 16-цветной VGA: доход зелёный, расход красный
const STAT_COLORS = { income: '#008000', expense: '#d00000', balance: '#000080' };
const CATEGORY_PALETTE = ['#d00000', '#000080', '#008080', '#808000', '#800080', '#008000', '#ff8000', '#0000ff', '#ff00ff', '#800000', '#808080'];
const statCharts = {};

function shortDate(d) {
    const parts = d.split('-');
    return `${parts[2]}.${parts[1]}`;
}

function barOptions(extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
        ...extra
    };
}

function upsertChart(key, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (statCharts[key]) {
        statCharts[key].data = config.data;
        statCharts[key].options = config.options;
        statCharts[key].update();
    } else {
        statCharts[key] = new Chart(canvas, config);
    }
}

// Начало выбранного периода в формате YYYY-MM-DD ('' = всё время)
function statsPeriodStart(todayStr) {
    const sel = document.getElementById('stats-period');
    const period = sel ? sel.value : 'month';
    if (period === '7') return almatyIsoNow(-6).slice(0, 10);
    if (period === '30') return almatyIsoNow(-29).slice(0, 10);
    if (period === 'month') return todayStr.slice(0, 8) + '01';
    if (period === 'year') return todayStr.slice(0, 5) + '01-01';
    return '';
}

function periodTx(todayStr) {
    const start = statsPeriodStart(todayStr);
    return transactions.filter(t => !t.isSystem && getTxDateStr(t.date) >= start && getTxDateStr(t.date) <= todayStr);
}

function categoryName(tx) {
    return String(tx.category || 'Без категории').split(':')[0].trim() || 'Без категории';
}

function groupByCategory(list) {
    const map = {};
    list.forEach(t => { const c = categoryName(t); map[c] = (map[c] || 0) + (parseFloat(t.amount) || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderStatsKpi(todayStr) {
    const box = document.getElementById('stats-kpi');
    if (!box) return;
    const list = periodTx(todayStr);
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const start = statsPeriodStart(todayStr);
    const firstDate = start || list.reduce((m, t) => { const d = getTxDateStr(t.date); return !m || d < m ? d : m; }, '') || todayStr;
    const days = Math.max(1, Math.round((Date.parse(todayStr + 'T00:00:00Z') - Date.parse(firstDate + 'T00:00:00Z')) / 86400000) + 1);
    const savedPct = income > 0 ? Math.round((income - expense) / income * 100) : null;
    const maxExpense = list.filter(t => t.type === 'expense').reduce((m, t) => Math.max(m, parseFloat(t.amount) || 0), 0);
    const kpis = [
        ['Доходы', fmtMoney(income) + ' ₸', 'amount-income'],
        ['Расходы', fmtMoney(expense) + ' ₸', 'amount-expense'],
        ['Итог', (income - expense >= 0 ? '+' : '') + fmtMoney(income - expense) + ' ₸', income - expense >= 0 ? 'amount-income' : 'amount-expense'],
        ['Средний расход в день', fmtMoney(Math.round(expense / days)) + ' ₸', ''],
        ['Сохранено от дохода', savedPct === null ? '—' : savedPct + '%', savedPct !== null && savedPct < 0 ? 'amount-expense' : ''],
        ['Самая крупная трата', fmtMoney(maxExpense) + ' ₸', ''],
        ['Операций', String(list.length), ''],
        ['Дней в периоде', String(days), '']
    ];
    box.innerHTML = kpis.map(([label, value, cls]) => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span></div>`).join('');
}

function renderCategoryList(elId, entries, total) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) {
        el.innerHTML = '<p class="hint" style="text-align:center;">Нет данных за период</p>';
        return;
    }
    el.innerHTML = entries.slice(0, 8).map(([name, sum], i) => {
        const pct = total > 0 ? Math.round(sum / total * 100) : 0;
        return `<div class="cat-row"><span class="cat-dot" style="background:${CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}"></span>` +
            `<span class="cat-name">${escapeHtml(name)}</span><span class="cat-sum">${fmtMoney(sum)} ₸</span><span class="cat-pct">${pct}%</span></div>`;
    }).join('');
}

function doughnutConfig(entries) {
    const top = entries.slice(0, 8);
    const rest = entries.slice(8).reduce((s, e) => s + e[1], 0);
    const labels = top.map(e => e[0]).concat(rest > 0 ? ['Прочее'] : []);
    const data = top.map(e => e[1]).concat(rest > 0 ? [rest] : []);
    return {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['Нет данных'],
            datasets: [{
                data: data.length ? data : [1],
                backgroundColor: data.length ? labels.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]) : ['#c0c0c0'],
                borderWidth: 1,
                borderColor: '#000'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { display: false }, tooltip: { enabled: data.length > 0 } }
        }
    };
}

function renderExtraCharts(todayStr) {
    const list = periodTx(todayStr);

    // Категории расходов и источники доходов за выбранный период
    const expenseCats = groupByCategory(list.filter(t => t.type === 'expense'));
    const incomeCats = groupByCategory(list.filter(t => t.type === 'income'));
    upsertChart('expenseCat', 'expenseCatChart', doughnutConfig(expenseCats));
    upsertChart('incomeCat', 'incomeCatChart', doughnutConfig(incomeCats));
    renderCategoryList('expense-cat-list', expenseCats, expenseCats.reduce((s, e) => s + e[1], 0));
    renderCategoryList('income-cat-list', incomeCats, incomeCats.reduce((s, e) => s + e[1], 0));

    // Баланс на конец каждого из последних 30 дней (с учётом всех операций, включая копилку)
    const days30 = [];
    for (let i = 29; i >= 0; i--) days30.push(almatyIsoNow(-i).slice(0, 10));
    const sorted = [...transactions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let idx = 0, running = 0;
    const balanceData = days30.map(day => {
        while (idx < sorted.length && getTxDateStr(sorted[idx].date) <= day) {
            const t = sorted[idx++];
            running += (t.type === 'income' ? 1 : -1) * (parseFloat(t.amount) || 0);
        }
        return running;
    });
    upsertChart('balance', 'balanceChart', {
        type: 'line',
        data: {
            labels: days30.map(shortDate),
            datasets: [{ label: 'Баланс', data: balanceData, borderColor: STAT_COLORS.balance, backgroundColor: 'rgba(0,0,128,0.12)', fill: true, tension: 0, stepped: false, borderWidth: 2, pointRadius: 0, pointHitRadius: 8 }]
        },
        options: barOptions({ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } } })
    });

    // Доходы и расходы по месяцам (последние 6 месяцев)
    const [y, m] = todayStr.split('-').map(Number);
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        months.push(d.toISOString().slice(0, 7));
    }
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const real = transactions.filter(t => !t.isSystem);
    const sumMonth = (key, type) => real.filter(t => t.type === type && String(t.date).slice(0, 7) === key).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    upsertChart('months', 'monthsChart', {
        type: 'bar',
        data: {
            labels: months.map(k => monthNames[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4)),
            datasets: [
                { label: 'Доход', data: months.map(k => sumMonth(k, 'income')), backgroundColor: STAT_COLORS.income, borderRadius: 0 },
                { label: 'Расход', data: months.map(k => sumMonth(k, 'expense')), backgroundColor: STAT_COLORS.expense, borderRadius: 0 }
            ]
        },
        options: barOptions()
    });

    // Расходы по дням недели и по времени суток за выбранный период
    const expenses = list.filter(t => t.type === 'expense');
    const weekday = [0, 0, 0, 0, 0, 0, 0]; // Пн..Вс
    const dayparts = [0, 0, 0, 0];         // ночь, утро, день, вечер
    expenses.forEach(t => {
        const d = getTxDateStr(t.date);
        const wd = new Date(d + 'T00:00:00Z').getUTCDay();
        if (!Number.isNaN(wd)) weekday[(wd + 6) % 7] += parseFloat(t.amount) || 0;
        const hour = Number(String(t.date).split('T')[1]?.slice(0, 2));
        const part = Number.isFinite(hour) ? (hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3) : 2;
        dayparts[part] += parseFloat(t.amount) || 0;
    });
    upsertChart('weekday', 'weekdayChart', {
        type: 'bar',
        data: {
            labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
            datasets: [{ label: 'Расход', data: weekday, backgroundColor: STAT_COLORS.expense, borderRadius: 0 }]
        },
        options: barOptions({ plugins: { legend: { display: false } } })
    });
    const hasDayparts = dayparts.some(v => v > 0);
    upsertChart('daypart', 'daypartChart', {
        type: 'doughnut',
        data: {
            labels: ['Ночь (0–6)', 'Утро (6–12)', 'День (12–18)', 'Вечер (18–24)'],
            datasets: [{ data: hasDayparts ? dayparts : [1, 1, 1, 1], backgroundColor: hasDayparts ? ['#000080', '#808000', '#ff8000', '#800080'] : ['#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0'], borderWidth: 1, borderColor: '#000' }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom' }, tooltip: { enabled: hasDayparts } } }
    });
}

function renderTransactions() {
    const txList = document.getElementById('tx-list');
    if (!txList) return;
    txList.innerHTML = '';
    
    if (transactions.length === 0) {
        txList.innerHTML = '<p class="hint" style="text-align:center; padding: 25px;">Записей пока нет</p>';
        return;
    }

    let sortedAsc = [...transactions].sort((a,b) => new Date((a.date||'').replace('T', ' ')) - new Date((b.date||'').replace('T', ' ')));
    let groups = {};
    let runBalance = 0;
    
    sortedAsc.forEach(tx => {
        runBalance += (tx.type === 'income' ? tx.amount : -tx.amount);
        let dDate = getTxDateStr(tx.date);
        if (!dDate) return;
        
        if(!groups[dDate]) groups[dDate] = { income: 0, expense: 0, endBalance: 0, items: [] };
        
        if(!tx.isSystem) {
            if(tx.type === 'income') groups[dDate].income += tx.amount;
            else groups[dDate].expense += tx.amount;
        }
        groups[dDate].endBalance = runBalance;
        groups[dDate].items.push(tx);
    });

    Object.keys(groups).sort((a,b) => new Date(b) - new Date(a)).forEach(date => {
        let g = groups[date];
        let parts = date.split('-');
        let fDate = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
        
        let header = document.createElement('div');
        header.className = 'date-group-header';
        header.innerHTML = `
            <h4>${fDate}</h4>
            <p>
                <span style="color:var(--income)">+${g.income}</span> 
                <span style="color:var(--expense)">-${g.expense}</span> 
                <span>Итог: <strong>${g.endBalance} ₸</strong></span>
            </p>
        `;
        txList.appendChild(header);
        
        g.items.reverse().forEach(tx => {
            let sign = tx.type === 'income' ? '+' : '-';
            let timeStr = (tx.date && tx.date.includes('T')) ? ` <span style="font-size:12px;color:var(--text-muted);">${tx.date.split('T')[1]}</span>` : '';
            let commentStr = tx.comment ? `<span class="tx-comment">${escapeHtml(tx.comment)}</span>` : '';
            let div = document.createElement('div');
            div.className = `tx-item ${tx.type}`;
            div.innerHTML = `
                <div class="tx-info">
                    <strong>${escapeHtml(tx.category || 'Без категории')}</strong><br>${timeStr}${commentStr}
                </div>
                <strong class="tx-amount ${tx.type === 'income' ? 'amount-income' : 'amount-expense'}" style="font-size: 15px;">${sign}${tx.amount} ₸</strong>
                ${tx.isSystem ? '' : `
                <div class="tx-actions">
                    <button type="button" onclick="editTx('${tx.id}')"><span class="material-icons" style="font-size:18px;">edit</span></button>
                    <button type="button" onclick="deleteTx('${tx.id}')"><span class="material-icons" style="font-size:18px; color:#d32f2f;">delete</span></button>
                </div>
                `}
            `;
            txList.appendChild(div);
        });
    });
}

function addSub() {
    let nameEl = document.getElementById('sub-name');
    let amountEl = document.getElementById('sub-amount');
    let dayEl = document.getElementById('sub-day');

    if (!nameEl || !amountEl || !dayEl) return;

    const name = nameEl.value.trim();
    const amount = parseFloat(amountEl.value);
    const day = parseInt(dayEl.value);

    if(!name || !amount || isNaN(day) || day < 1 || day > 31) {
        alert("Заполните название, сумму и день месяца (1-31)!");
        return;
    }

    subscriptions.push({ id: Date.now().toString(), name, amount, day });

    nameEl.value = '';
    amountEl.value = '';
    dayEl.value = '1';

    updateUI(true);
}

function deleteSub(id) {
    if(confirm("Удалить подписку?")) {
        subscriptions = subscriptions.filter(s => s.id !== id);
        updateUI(true);
    }
}

function paySub(id) {
    let sub = subscriptions.find(s => s.id === id);
    if(!sub) return;

    let datetimeNow = almatyIsoNow();

    transactions.push({
        id: Date.now().toString(),
        type: 'expense',
        amount: sub.amount,
        category: `Подписка: ${sub.name}`,
        date: datetimeNow
    });

    updateUI(true);
    alert(`Подписка «${sub.name}» успешно списана (${sub.amount} ₸)!`);
}

function renderSubscriptions() {
    const subsList = document.getElementById('subs-list');
    if (!subsList) return;
    subsList.innerHTML = '';

    if(subscriptions.length === 0) {
        subsList.innerHTML = '<p class="hint" style="text-align:center; padding: 20px;">Нет активных подписок</p>';
        return;
    }

    subscriptions.forEach(sub => {
        let div = document.createElement('div');
        div.className = 'sub-item';
        div.innerHTML = `
            <div class="sub-info">
                <strong>${sub.name}</strong><br>
                <span style="font-size: 12px; color: var(--text-muted);">Списание: ${sub.day}-го числа каждого месяца</span>
            </div>
            <strong style="font-size: 16px; color: var(--expense);">-${sub.amount} ₸</strong>
            <div class="sub-actions">
                <button type="button" class="pay-btn" onclick="paySub('${sub.id}')"><span class="material-icons" style="font-size:16px;">check</span> Списать</button>
                <button type="button" onclick="deleteSub('${sub.id}')"><span class="material-icons" style="font-size:18px; color:#d32f2f;">delete</span></button>
            </div>
        `;
        subsList.appendChild(div);
    });
}

function saveTx(type) {
    let amountEl = document.getElementById('amount');
    let categoryEl = document.getElementById('category');
    let datetimeEl = document.getElementById('tx-datetime');

    if (!amountEl || !categoryEl || !datetimeEl) return;

    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value.trim();
    const datetime = datetimeEl.value; 
    
    if (!amount || !category || !datetime) {
        alert('Заполните все поля!');
        return;
    }
    
    const comment = getFormComment('tx');
    const tx = { id: Date.now().toString(), type, amount, category, date: datetime };
    if (comment) tx.comment = comment;
    transactions.push(tx);
    clearForm();
    updateUI(true);
}

function deleteTx(id) {
    if(confirm("Удалить запись?")) {
        transactions = transactions.filter(t => t.id !== id);
        updateUI(true);
    }
}

function editTx(id) {
    let tx = transactions.find(t => t.id === id);
    if(tx) {
        let editIdEl = document.getElementById('edit-id');
        let dtEl = document.getElementById('tx-datetime');
        let amountEl = document.getElementById('amount');
        let catEl = document.getElementById('category');
        let addBtns = document.getElementById('add-btns');
        let saveEditBtn = document.getElementById('save-edit-btn');

        if (editIdEl) editIdEl.value = tx.id;
        if (dtEl) dtEl.value = (tx.date && tx.date.includes('T')) ? tx.date : (tx.date + 'T00:00');
        if (amountEl) amountEl.value = tx.amount;
        if (catEl) catEl.value = tx.category;
        setFormComment('tx', tx.comment || '');

        if (addBtns) addBtns.style.display = 'none';
        if (saveEditBtn) saveEditBtn.style.display = 'flex';
        
        let mainWrap = document.querySelector('.main-wrapper');
        if (mainWrap) mainWrap.scrollTo(0, 0);
    }
}

function saveEdit() {
    let editIdEl = document.getElementById('edit-id');
    let amountEl = document.getElementById('amount');
    let categoryEl = document.getElementById('category');
    let datetimeEl = document.getElementById('tx-datetime');

    if (!editIdEl || !amountEl || !categoryEl || !datetimeEl) return;

    const id = editIdEl.value;
    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value.trim();
    const datetime = datetimeEl.value;
    
    if (!amount || !category || !datetime) return;
    
    let tx = transactions.find(t => t.id === id);
    if(tx) {
        tx.amount = amount;
        tx.category = category;
        tx.date = datetime;
        const comment = getFormComment('tx');
        if (comment) tx.comment = comment; else delete tx.comment;
    }
    
    clearForm();
    updateUI(true);
}

function clearForm() {
    let amountEl = document.getElementById('amount');
    let categoryEl = document.getElementById('category');
    let editIdEl = document.getElementById('edit-id');
    let addBtns = document.getElementById('add-btns');
    let saveEditBtn = document.getElementById('save-edit-btn');
    let dtEl = document.getElementById('tx-datetime');

    if (amountEl) amountEl.value = '';
    if (categoryEl) categoryEl.value = '';
    if (editIdEl) editIdEl.value = '';
    setFormComment('tx', '');
    if (addBtns) addBtns.style.display = 'flex';
    if (saveEditBtn) saveEditBtn.style.display = 'none';
    
    if (dtEl) {
        dtEl.value = almatyIsoNow();
    }
}

function generateReport() {
    let reportSelect = document.getElementById('report-type');
    const tbody = document.getElementById('report-tbody');
    if (!reportSelect || !tbody) return;

    let type = reportSelect.value;
    tbody.innerHTML = '';
    
    let groups = {};
    
    transactions.forEach(tx => {
        if(tx.isSystem) return; 
        let dt = (tx.date && tx.date.includes('T')) ? tx.date : ((tx.date || '') + 'T00:00');
        let key = '';
        
        if (type === 'days') {
            key = dt.split('T')[0];
        } else if (type === 'hours') {
            let parts = dt.split('T');
            let hour = (parts[1] || '00:00').split(':')[0];
            key = `${parts[0]} ${hour}:00`;
        } else if (type === 'weeks') {
            let dateObj = new Date(dt);
            if (isNaN(dateObj)) return;
            let d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
            let dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
            key = `Нед. ${weekNo} (${d.getUTCFullYear()})`;
        }
        
        if(!groups[key]) groups[key] = { inc: 0, exp: 0 };
        if(tx.type === 'income') groups[key].inc += tx.amount;
        else groups[key].exp += tx.amount;
    });
    
    let sortedKeys = Object.keys(groups).sort((a,b) => b.localeCompare(a));
    
    if (sortedKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Нет данных</td></tr>';
        return;
    }
    
    sortedKeys.forEach(k => {
        let g = groups[k];
        let total = g.inc - g.exp;
        let sign = total > 0 ? '+' : '';
        
        tbody.innerHTML += `<tr>
            <td>${k}</td>
            <td style="color:var(--income)">${g.inc}</td>
            <td style="color:var(--expense)">${g.exp}</td>
            <td style="font-weight:bold;">${sign}${total}</td>
        </tr>`;
    });
}

// --- ВЫГРУЗКА ФАЙЛОВ (Excel / JSON) ---
const EXPORT_COLUMNS = ['Дата', 'Время', 'Тип', 'Категория', 'Комментарий', 'Сумма', 'ИТОГО ЗА ВСЁ ВРЕМЯ'];
const EXPORT_AMOUNT_COLS = [5, 6]; // номера числовых колонок (Сумма, Итого)

function isMobileDevice() {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Строки таблицы выгрузки: kind = income | expense | day | total. Используются и для .xlsx, и для просмотра/копирования.
function buildExportRows() {
    const rows = [];
    const sortedTx = [...transactions].sort((a,b) => new Date((a.date||'').replace('T', ' ')) - new Date((b.date||'').replace('T', ' ')));
    let currentDate = null;
    let dailyTotal = 0;
    let allTimeTotal = 0;

    sortedTx.forEach(t => {
        const dt = (t.date && t.date.includes('T')) ? t.date : ((t.date || '') + 'T00:00');
        const parts = dt.split('T');
        const txDate = parts[0];

        if (currentDate !== null && txDate !== currentDate) {
            rows.push({ kind: 'day', cells: ['ИТОГО ЗА ДЕНЬ', '', '', '', '', dailyTotal, ''] });
            dailyTotal = 0;
        }
        currentDate = txDate;

        const amount = parseFloat(t.amount) || 0;
        const isIncome = t.type === 'income';
        dailyTotal += isIncome ? amount : -amount;
        allTimeTotal += isIncome ? amount : -amount;

        rows.push({
            kind: isIncome ? 'income' : 'expense',
            cells: [txDate, parts[1] || '', isIncome ? 'Доход' : 'Расход', t.category || '', t.comment || '', amount, '']
        });
    });

    if (currentDate !== null) {
        rows.push({ kind: 'day', cells: ['ИТОГО ЗА ДЕНЬ', '', '', '', '', dailyTotal, ''] });
        // Общий чистый итог за всё время находится в отдельном последнем столбце.
        rows.push({ kind: 'total', cells: ['ИТОГО ЗА ВСЁ ВРЕМЯ', '', '', '', '', '', allTimeTotal] });
    }
    return rows;
}

async function buildExcelBlob(rows) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Записи');
    const widths = [15, 10, 12, 25, 34, 15, 23];
    worksheet.columns = EXPORT_COLUMNS.map((header, i) => ({ header, width: widths[i] }));

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF424242' } };

    const fills = { income: 'FF2E7D32', expense: 'FFD32F2F', day: 'FFFFFF00', total: 'FFDDEBF7' };
    rows.forEach(r => {
        const row = worksheet.addRow(r.cells);
        const isSummary = r.kind === 'day' || r.kind === 'total';
        row.eachCell({ includeEmpty: isSummary }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[r.kind] } };
            cell.font = isSummary ? { color: { argb: 'FF000000' }, bold: true } : { color: { argb: 'FFFFFFFF' } };
        });
    });

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: 'A1', to: 'G1' };
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function loadExcelLibrary() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve(true);
    return new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
        s.onload = () => resolve(typeof ExcelJS !== 'undefined');
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

// Приложение внутри APK (Android WebView от WebIntoApp и подобных обёрток).
// Такие обёртки не обрабатывают скачивание: у WebView нет DownloadListener, а «Поделиться» (navigator.share)
// в WebView не существует, поэтому файл из JavaScript там не сохранить без нативного моста.
function isAndroidWebView() {
    const ua = navigator.userAgent || '';
    if (!/Android/i.test(ua) || /Firefox\//.test(ua)) return false;
    return /; wv\)/.test(ua) || /Dalvik\//.test(ua) || !/Chrome\//.test(ua)
        || (window.isSecureContext && typeof navigator.share !== 'function');
}

// Нативный мост из APK (см. ANDROID_EXPORT_BRIDGE_RU.txt): window.MoneyNative.saveFile(base64, имя, mime)
function nativeFileBridge() {
    const bridge = window.MoneyNative;
    return bridge && typeof bridge.saveFile === 'function' ? bridge : null;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// Отдаёт файл пользователю. Порядок: нативный мост APK → меню «Поделиться» на телефоне → обычное скачивание.
// Возвращает 'native' | 'shared' | 'downloaded' | 'unsupported' (APK без моста: сохранить файл нельзя).
async function deliverFile(blob, fileName) {
    const bridge = nativeFileBridge();
    if (bridge) {
        try {
            const ok = bridge.saveFile(await blobToBase64(blob), fileName, blob.type || 'application/octet-stream');
            if (ok !== false && ok !== 'false') return 'native';
        } catch (e) {
            console.warn('Нативный мост не сохранил файл', e);
        }
    }
    if (isAndroidWebView()) return 'unsupported';

    if (isMobileDevice() && navigator.canShare && typeof File !== 'undefined') {
        try {
            const file = new File([blob], fileName, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: fileName });
                return 'shared';
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return 'shared';
            console.warn('Share не удался, пробуем скачивание', e);
        }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
    }, 60000);
    return 'downloaded';
}

function copyTextToClipboard(text) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        return ok;
    };
    // В APK (WebView) сначала синхронное копирование: оно срабатывает сразу в момент нажатия
    if (isAndroidWebView() && fallback()) return Promise.resolve(true);
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true).catch(fallback);
    }
    return Promise.resolve(fallback());
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Окно с таблицей прямо в приложении: работает даже там, где обёртка (WebIntoApp/Android WebView)
// не умеет сохранять сгенерированные файлы. Таблицу можно скопировать и вставить в Excel / Google Таблицы.
// actions: дополнительные кнопки [{ label, icon, onClick }]
function showExportSheet({ title, note, tableHtml, copyText, retry, actions = [] }) {
    closeExportSheet();
    const overlay = document.createElement('div');
    overlay.id = 'export-sheet';
    overlay.className = 'export-sheet-overlay';
    overlay.innerHTML = `
        <div class="export-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
            <div class="export-sheet-head">
                <h3>${escapeHtml(title)}</h3>
                <button type="button" class="export-sheet-close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">${note}</p>
            <div class="export-sheet-table">${tableHtml}</div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="copy"><span class="material-icons">content_copy</span> Скопировать таблицу</button>
                ${retry ? '<button type="button" class="btn-secondary" data-act="retry"><span class="material-icons">download</span> Скачать ещё раз</button>' : ''}
                ${actions.map((a, i) => `<button type="button" class="btn-secondary" data-act="extra-${i}"><span class="material-icons">${a.icon}</span> ${escapeHtml(a.label)}</button>`).join('')}
            </div>
        </div>`;
    overlay.addEventListener('click', async (e) => {
        if (e.target === overlay || e.target.closest('.export-sheet-close')) { closeExportSheet(); playSound('close'); return; }
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'copy') {
            const ok = await copyTextToClipboard(copyText);
            alert(ok ? 'Таблица скопирована. Вставьте её в Excel или Google Таблицы.' : 'Не удалось скопировать. Выделите таблицу вручную.');
        } else if (btn.dataset.act === 'retry' && retry) {
            retry();
        } else if (btn.dataset.act.startsWith('extra-')) {
            const action = actions[Number(btn.dataset.act.slice(6))];
            if (action) action.onClick();
        }
    });
    document.body.appendChild(overlay);
    playSound('open');
}

function closeExportSheet() {
    const old = document.getElementById('export-sheet');
    if (old) old.remove();
}

async function exportExcel(options = {}) {
    const silent = !!options.silent;
    const rows = buildExportRows();
    if (rows.length === 0) {
        if (!silent) alert('Нет записей для выгрузки.');
        return;
    }

    const fileName = exportFileName('xlsx');
    let result = null;
    try {
        if (!(await loadExcelLibrary())) throw new Error('ExcelJS не загружен');
        const blob = await buildExcelBlob(rows);
        result = await deliverFile(blob, fileName);
    } catch (e) {
        console.error(e);
    }
    if (result === 'native' && !silent) alert(`Файл ${fileName} сохранён.`);
    if (silent || result === 'shared' || result === 'native') return;

    // Для настольного браузера скачивания достаточно. На телефоне, в APK и при ошибке показываем таблицу в приложении.
    if (result === 'downloaded' && !isMobileDevice()) return;

    const preview = buildExportPreview(rows);
    showExportSheet({
        title: 'Таблица Excel',
        note: result === 'downloaded'
            ? `Файл <b>${escapeHtml(fileName)}</b> отправлен на скачивание. Если он не появился в «Загрузках», скопируйте таблицу и вставьте её в Excel или Google Таблицы, либо скачайте PDF.`
            : result === 'unsupported'
                ? APK_NO_FILES_NOTE
                : 'Не удалось сформировать файл .xlsx (нет интернета для библиотеки выгрузки). Скопируйте таблицу и вставьте её в Excel или Google Таблицы.',
        tableHtml: preview.tableHtml,
        copyText: preview.tsv,
        retry: result === 'downloaded' ? () => exportExcel({ silent: true }) : null,
        actions: result === 'unsupported' ? [] : [{ label: 'Скачать PDF (A4)', icon: 'picture_as_pdf', onClick: () => exportPdf() }]
    });
}

const APK_NO_FILES_NOTE = 'Эта сборка приложения (APK) не умеет сохранять файлы, поэтому таблица показана здесь. ' +
    'Нажмите «Скопировать таблицу» и вставьте её в Excel, Google Таблицы или WPS Office: получится та же таблица с итогами. ' +
    'Файлы .xlsx и .pdf сохраняются, если открыть приложение в Chrome или собрать APK с нативным мостом (инструкция в архиве).';

function buildExportPreview(rows) {
    const head = `<tr>${EXPORT_COLUMNS.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
    const body = rows.map(r => `<tr class="exp-${r.kind}">${r.cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
    const tsv = [EXPORT_COLUMNS, ...rows.map(r => r.cells)]
        .map(cells => cells.map(c => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    return { tableHtml: `<table class="analytics-table export-table"><thead>${head}</thead><tbody>${body}</tbody></table>`, tsv };
}

// --- PDF (A4) ---
// pdfmake со встроенным шрифтом Roboto (кириллица). PDF — стандартный формат A4, открывается на любом устройстве.
const PDFMAKE_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js'
];
const scriptPromises = {};

function loadScriptOnce(src) {
    if (!scriptPromises[src]) {
        scriptPromises[src] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => { delete scriptPromises[src]; reject(new Error('Не загрузился ' + src)); };
            document.head.appendChild(s);
        });
    }
    return scriptPromises[src];
}

async function loadPdfLibrary() {
    if (window.pdfMake && window.pdfMake.vfs) return true;
    try {
        for (const src of PDFMAKE_URLS) await loadScriptOnce(src);
    } catch (e) {
        console.error(e);
        return false;
    }
    return !!(window.pdfMake && window.pdfMake.vfs);
}

const fmtMoney = v => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

function buildPdfDefinition(rows) {
    const real = transactions.filter(t => !t.isSystem);
    const income = real.filter(t => t.type === 'income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const expense = real.filter(t => t.type === 'expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const balance = transactions.reduce((s, t) => s + (t.type === 'income' ? 1 : -1) * (parseFloat(t.amount) || 0), 0);

    // Печатные цвета: светлая заливка, тёмный текст; доход зелёный, расход красный.
    const styles = {
        income: { fillColor: '#e8f5e9', color: '#1b5e20' },
        expense: { fillColor: '#ffebee', color: '#b71c1c' },
        day: { fillColor: '#fff59d', color: '#000000', bold: true },
        total: { fillColor: '#ddebf7', color: '#000000', bold: true }
    };
    const body = [EXPORT_COLUMNS.map(c => ({ text: c, style: 'th' }))];
    rows.forEach(r => {
        const st = styles[r.kind];
        const cells = r.cells.map((c, i) => ({
            text: EXPORT_AMOUNT_COLS.includes(i) && c !== '' ? fmtMoney(c) : String(c),
            alignment: EXPORT_AMOUNT_COLS.includes(i) ? 'right' : 'left',
            italics: i === 4,
            ...st
        }));
        // Итоговые строки: подпись на 4 колонки, чтобы «ИТОГО ЗА ДЕНЬ» не переносилось
        if (r.kind === 'day' || r.kind === 'total') {
            cells[0].colSpan = 5;
            cells[1] = {}; cells[2] = {}; cells[3] = {}; cells[4] = {};
        }
        body.push(cells);
    });

    const generated = formatAlmaty({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        pageMargins: [32, 40, 32, 44],
        info: { title: 'My Money — выписка', author: 'Money Pro' },
        defaultStyle: { font: 'Roboto', fontSize: 9 },
        content: [
            { text: 'My Money — выписка операций', style: 'title' },
            { text: (profileName ? `Владелец: ${profileName}. ` : '') + `Сформировано: ${generated} (Алматы). Суммы в тенге (тг).`, style: 'muted', margin: [0, 2, 0, 10] },
            {
                // В шрифте Roboto нет знака ₸, поэтому в PDF валюта пишется «тг»
                columns: [
                    { stack: [{ text: 'Доходы', style: 'muted' }, { text: fmtMoney(income) + ' тг', style: 'kpi', color: '#1b5e20' }] },
                    { stack: [{ text: 'Расходы', style: 'muted' }, { text: fmtMoney(expense) + ' тг', style: 'kpi', color: '#b71c1c' }] },
                    { stack: [{ text: 'Баланс', style: 'muted' }, { text: fmtMoney(balance) + ' тг', style: 'kpi' }] },
                    { stack: [{ text: 'Копилка', style: 'muted' }, { text: fmtMoney(savings) + ' тг', style: 'kpi' }] }
                ],
                margin: [0, 0, 0, 12]
            },
            {
                table: { headerRows: 1, widths: [52, 30, 38, '*', '*', 58, 66], body },
                layout: {
                    hLineWidth: () => 0.5, vLineWidth: () => 0.5,
                    hLineColor: () => '#bdbdbd', vLineColor: () => '#bdbdbd',
                    paddingTop: () => 3, paddingBottom: () => 3
                }
            }
        ],
        footer: (page, pages) => ({ text: `Стр. ${page} из ${pages}`, alignment: 'center', fontSize: 8, color: '#757575', margin: [0, 14, 0, 0] }),
        styles: {
            title: { fontSize: 16, bold: true },
            muted: { fontSize: 8.5, color: '#616161' },
            kpi: { fontSize: 12, bold: true },
            th: { bold: true, color: '#ffffff', fillColor: '#424242' }
        }
    };
}

async function exportPdf() {
    const rows = buildExportRows();
    if (rows.length === 0) {
        alert('Нет записей для выгрузки.');
        return;
    }
    // В APK без нативного моста PDF сохранить некуда: сразу показываем таблицу, не заставляя ждать загрузку модуля.
    if (!nativeFileBridge() && isAndroidWebView()) {
        const preview = buildExportPreview(rows);
        showExportSheet({ title: 'PDF (A4)', note: APK_NO_FILES_NOTE, tableHtml: preview.tableHtml, copyText: preview.tsv, retry: null });
        return;
    }
    if (!(await loadPdfLibrary())) {
        alert('Не удалось загрузить модуль PDF. Проверьте подключение к интернету и попробуйте снова.');
        return;
    }
    const fileName = exportFileName('pdf');
    let blob;
    try {
        blob = await new Promise((resolve, reject) => {
            try { window.pdfMake.createPdf(buildPdfDefinition(rows)).getBlob(resolve); } catch (e) { reject(e); }
        });
    } catch (e) {
        console.error(e);
        alert('Ошибка при создании PDF: ' + (e && e.message ? e.message : e));
        return;
    }
    const result = await deliverFile(blob, fileName);
    if (result === 'native') {
        alert(`Файл ${fileName} сохранён.`);
    } else if (result === 'downloaded' && isMobileDevice()) {
        const preview = buildExportPreview(rows);
        showExportSheet({
            title: 'PDF (A4)',
            note: `Файл <b>${escapeHtml(fileName)}</b> отправлен на скачивание. Если он не появился в «Загрузках», скопируйте таблицу ниже.`,
            tableHtml: preview.tableHtml,
            copyText: preview.tsv,
            retry: () => deliverFile(blob, fileName)
        });
    }
}



function selectGoalIcon(btn) {
    document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function setPriorityGoal() {
    let nameEl = document.getElementById('goal-name');
    let amountEl = document.getElementById('goal-amount');
    let selBtn = document.querySelector('.icon-btn.selected');

    if (!nameEl || !amountEl) return;

    const name = nameEl.value.trim();
    const amount = parseFloat(amountEl.value);
    const icon = selBtn ? selBtn.getAttribute('data-icon') : '🎯';
    
    if (!name || !amount) {
        alert('Заполните название и сумму цели!');
        return;
    }
    priorityGoal = { name, amount, icon };
    updateUI(true);
    alert('Цель установлена!');
}

function renderGoal() {
    const gd = document.getElementById('current-goal-display');
    if (!gd) return;
    if (priorityGoal.name && priorityGoal.amount > 0) {
        let percent = Math.min(100, (savings / priorityGoal.amount) * 100);
        gd.innerHTML = `
            <h4>${priorityGoal.icon} ${priorityGoal.name}</h4>
            <p>Собрано: ${savings.toFixed(0)} ₸ из ${priorityGoal.amount} ₸ (${percent.toFixed(1)}%)</p>
            <div class="goal-progress">
                <div class="goal-bar" style="width: ${percent}%"></div>
            </div>
        `;
    } else {
        gd.innerHTML = '<p class="hint">Цель пока не установлена.</p>';
    }
}

function saveSettings() {
    let mLimitEl = document.getElementById('manual-limit');
    manualLimit = mLimitEl ? (parseFloat(mLimitEl.value) || 0) : 0;
    updateUI(true);
    alert('Настройки сохранены!');
}

function saveDataLocally() {
    stampLocalChanges(); // отметки изменений для слияния с Google Диском (cloud.js)
    try {
        localStorage.setItem('finance_profile_name', profileName);
        localStorage.setItem('finance_oldbook', JSON.stringify(oldbookEntries));
        localStorage.setItem('finance_ob_links', JSON.stringify(oldbookLinks));
        localStorage.setItem('finance_categories', JSON.stringify(customCategories));
        if (typeof saveCustomThemesLocal === 'function') saveCustomThemesLocal(); // свои темы (updatedAt ставит stampLocalChanges)
        localStorage.setItem('finance_custom_sounds', JSON.stringify(customSoundMeta));
        localStorage.setItem('finance_tx', JSON.stringify(transactions));
        localStorage.setItem('finance_subs', JSON.stringify(subscriptions));
        localStorage.setItem('finance_savings', savings.toString());
        localStorage.setItem('finance_limit', manualLimit.toString());
        localStorage.setItem('finance_goal', JSON.stringify(priorityGoal));
    } catch(e) {}
}

async function exportBackup() {
    const data = { tx: transactions, subs: subscriptions, savings, limit: manualLimit, goal: priorityGoal, profile: { name: profileName } };
    const json = JSON.stringify(data);
    const fileName = exportFileName('json', '_backup');
    const result = await deliverFile(new Blob([json], { type: 'application/json' }), fileName);
    if (result === 'native') {
        alert(`Файл ${fileName} сохранён.`);
    } else if ((result === 'downloaded' && isMobileDevice()) || result === 'unsupported') {
        showExportSheet({
            title: 'Локальная копия',
            note: result === 'unsupported'
                ? 'Эта сборка приложения (APK) не умеет сохранять файлы. Скопируйте данные и сохраните их в заметке или в облаке (раздел «Аккаунт»).'
                : `Файл <b>${escapeHtml(fileName)}</b> отправлен на скачивание. Если он не появился, скопируйте данные и сохраните их в заметке или файле с расширением .json.`,
            tableHtml: `<pre class="export-json">${escapeHtml(json.length > 4000 ? json.slice(0, 4000) + '…' : json)}</pre>`,
            copyText: json,
            retry: null
        });
    }
}

function importBackup(e) {
    const file = e.target.files ? e.target.files[0] : null;
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if(data.tx) transactions = data.tx;
            if(data.subs) subscriptions = data.subs;
            if(data.savings !== undefined) savings = data.savings;
            if(data.limit !== undefined) manualLimit = data.limit;
            if(data.goal) priorityGoal = data.goal;
            if(data.profile && typeof data.profile.name === 'string') profileName = data.profile.name;
            updateUI(true); // Автоматически отправится на Google Диск, если пользователь вошёл
            fillProfileInput();
            alert("Данные успешно загружены!");
        } catch (err) {
            alert("Ошибка чтения файла!");
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    const warning = 'ВНИМАНИЕ!\n\nБудут удалены ВСЕ данные: записи, подписки, зарплаты, копилка, цель, лимит, ПИН-код и настройки оформления'
        + (isCloudConnected() ? ', а также данные на вашем Google Диске и на других устройствах с этим аккаунтом' : '')
        + '.\nВосстановить их будет невозможно.\n\nВы точно хотите всё удалить?';
    if(confirm(warning)) {
        // Вход в Google и служебные данные синхронизации сохраняем, чтобы удаление дошло до Диска и других устройств
        const keep = {};
        Object.values(CLOUD_KEYS).forEach(k => { const v = localStorage.getItem(k); if (v !== null) keep[k] = v; });
        localStorage.clear();
        Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
        profileName = '';
        fillProfileInput();
        savedPin = null;
        bioEnabled = false;
        refreshBiometricUi();
        const removePinBtn = document.getElementById('remove-pin-btn');
        if (removePinBtn) removePinBtn.style.display = 'none';
        transactions = [];
        subscriptions = [];
        savings = 0;
        manualLimit = 0;
        priorityGoal = { name: '', amount: 0, icon: '🎯' };
        oldbookEntries = [];
        oldbookLinks = [];
        customCategories = [];
        if (typeof onCustomThemesChanged === 'function') { customThemes = []; onCustomThemesChanged(); }
        if (typeof clearCustomSoundsLocal === 'function') clearCustomSoundsLocal();
        renderMenus();
        updateUI(true);
    }
}

function showTab(tabId, btn) {
    document.querySelectorAll('.tab').forEach(t => {
        t.style.display = 'none';
        t.classList.remove('tab-enter');
    });
    document.querySelectorAll('.sidebar-nav button, .mobile-nav button').forEach(b => {
        if(b.classList.contains('active')) b.classList.remove('active');
    });

    let tabEl = document.getElementById(tabId);
    if (tabEl) {
        // Пустое значение отдаёт раскладку CSS (сетка карточек); класс запускает анимацию появления (0.3 с).
        tabEl.style.display = '';
        void tabEl.offsetWidth;
        tabEl.classList.add('tab-enter');
        // Страховка: снимаем класс после анимации, чтобы карточки не остались прозрачными, если анимации отключены системой.
        clearTimeout(tabEl._enterTimer);
        tabEl._enterTimer = setTimeout(() => tabEl.classList.remove('tab-enter'), 600);
        const mainWrapper = document.querySelector('.main-wrapper');
        if (mainWrapper) mainWrapper.scrollTop = 0;
    }
    
    if (tabId === 'oldbook' && typeof onOldbookTabShown === 'function') onOldbookTabShown();

    // Подсвечиваем пункт в обоих меню (боковом и нижнем)
    currentTabId = tabId;
    document.querySelectorAll('.sidebar-nav button, .mobile-nav button').forEach(b => {
        if (b.dataset.tab === tabId) b.classList.add('active');
    });
}

// --- НАСТРАИВАЕМОЕ МЕНЮ ---
// Порядок и скрытые пункты хранятся в localStorage ('finance_menu'). «Настройки» скрыть нельзя,
// иначе не останется способа вернуть пункты обратно.
const MENU_ITEMS = [
    { id: 'transactions', icon: 'list', label: 'Записи' },
    { id: 'subscriptions', icon: 'autorenew', label: 'Подписки' },
    { id: 'salary', icon: 'payments', label: 'Зарплата' },
    { id: 'statistics', icon: 'pie_chart', label: 'Статистика' },
    { id: 'reports', icon: 'bar_chart', label: 'Отчёты' },
    { id: 'wishlist', icon: 'star', label: 'Цели' },
    { id: 'oldbook', icon: 'menu_book', label: 'Oldbook' },
    { id: 'settings', icon: 'settings', label: 'Настройки', locked: true }
];
const MENU_KEY = 'finance_menu';
let currentTabId = 'transactions';

function getMenuState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(MENU_KEY) || 'null'); } catch (e) {}
    const known = MENU_ITEMS.map(i => i.id);
    let order = Array.isArray(state && state.order) ? state.order.filter(id => known.includes(id)) : [];
    known.forEach(id => { if (!order.includes(id)) order.push(id); }); // новые пункты из будущих версий
    let hidden = Array.isArray(state && state.hidden) ? state.hidden.filter(id => known.includes(id) && id !== 'settings') : [];
    return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

function saveMenuState(state) {
    try { localStorage.setItem(MENU_KEY, JSON.stringify(state)); } catch (e) {}
    renderMenus();
}

function menuItem(id) {
    return MENU_ITEMS.find(i => i.id === id);
}

function renderMenus() {
    const state = getMenuState();
    const visible = state.order.filter(id => !state.hidden.includes(id));
    const navHtml = visible.map(id => {
        const it = menuItem(id);
        return `<button type="button" data-tab="${id}" class="${id === currentTabId ? 'active' : ''}" onclick="showTab('${id}', this)">` +
            `<span class="material-icons">${it.icon}</span><span class="nav-label">${it.label}</span></button>`;
    }).join('');
    const sidebar = document.getElementById('sidebar-nav');
    const mobile = document.getElementById('mobile-nav');
    if (sidebar) sidebar.innerHTML = navHtml;
    if (mobile) mobile.innerHTML = navHtml;
    updateMobileNavHeight();
    renderMenuEditor(state);
}

function renderMenuEditor(state = getMenuState()) {
    const list = document.getElementById('menu-editor');
    const hiddenList = document.getElementById('menu-hidden');
    const hiddenWrap = document.getElementById('menu-hidden-wrap');
    if (!list) return;
    list.innerHTML = state.order.filter(id => !state.hidden.includes(id)).map(id => {
        const it = menuItem(id);
        return `<li class="menu-row" data-id="${id}">
            <span class="material-icons drag-handle" title="Перетащить" aria-label="Перетащить">drag_indicator</span>
            <span class="material-icons menu-row-icon">${it.icon}</span>
            <span class="menu-row-label">${it.label}</span>
            ${it.locked
                ? '<span class="material-icons menu-row-lock" title="Этот пункт убрать нельзя">lock</span>'
                : `<button type="button" class="menu-row-btn is-remove" onclick="hideMenuItem('${id}')" aria-label="Убрать из меню"><span class="material-icons">remove_circle_outline</span></button>`}
        </li>`;
    }).join('');
    if (hiddenList && hiddenWrap) {
        hiddenWrap.style.display = state.hidden.length ? '' : 'none';
        hiddenList.innerHTML = state.hidden.map(id => {
            const it = menuItem(id);
            return `<li class="menu-row is-hidden" data-id="${id}">
                <span class="material-icons menu-row-icon">${it.icon}</span>
                <span class="menu-row-label">${it.label}</span>
                <button type="button" class="menu-row-btn is-add" onclick="showMenuItem('${id}')" aria-label="Вернуть в меню"><span class="material-icons">add_circle_outline</span></button>
            </li>`;
        }).join('');
    }
}

function hideMenuItem(id) {
    const state = getMenuState();
    if (id === 'settings' || state.hidden.includes(id)) return;
    state.hidden.push(id);
    saveMenuState(state);
}

function showMenuItem(id) {
    const state = getMenuState();
    state.hidden = state.hidden.filter(h => h !== id);
    // Возвращённый пункт ставим в конец видимого списка
    state.order = state.order.filter(o => o !== id).concat(id);
    saveMenuState(state);
}

function resetMenu() {
    try { localStorage.removeItem(MENU_KEY); } catch (e) {}
    renderMenus();
}

// Высота нижнего меню нужна для отступа контента и положения кнопки синхронизации
function updateMobileNavHeight() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    requestAnimationFrame(() => {
        const h = nav.offsetHeight;
        if (h > 0) document.documentElement.style.setProperty('--mobile-nav-h', h + 'px');
    });
}
window.addEventListener('resize', updateMobileNavHeight);

// Перетаскивание пунктов в настройках: Pointer Events (палец, мышь, стилус), только за ручку.
function initMenuDrag() {
    const list = document.getElementById('menu-editor');
    if (!list || list._dragReady) return;
    list._dragReady = true;

    list.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('.drag-handle');
        if (!handle || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const row = handle.closest('.menu-row');
        const rows = [...list.querySelectorAll('.menu-row')];
        if (rows.length < 2) return;
        e.preventDefault();

        const startIndex = rows.indexOf(row);
        const step = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
        const startY = e.clientY;
        let targetIndex = startIndex;

        row.classList.add('is-dragging');
        list.classList.add('is-sorting');
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}

        const onMove = (ev) => {
            const dy = ev.clientY - startY;
            const minDy = -startIndex * step;
            const maxDy = (rows.length - 1 - startIndex) * step;
            const clamped = Math.max(minDy, Math.min(maxDy, dy));
            row.style.transform = `translateY(${clamped}px)`;
            targetIndex = Math.max(0, Math.min(rows.length - 1, startIndex + Math.round(clamped / step)));
            rows.forEach((r, i) => {
                if (r === row) return;
                let shift = 0;
                if (startIndex < targetIndex && i > startIndex && i <= targetIndex) shift = -step;
                if (startIndex > targetIndex && i < startIndex && i >= targetIndex) shift = step;
                r.style.transform = shift ? `translateY(${shift}px)` : '';
            });
        };

        const onEnd = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onEnd);
            handle.removeEventListener('pointercancel', onEnd);
            list.classList.remove('is-sorting');
            rows.forEach(r => { r.style.transform = ''; r.classList.remove('is-dragging'); });
            if (targetIndex === startIndex) return;

            const state = getMenuState();
            const visible = rows.map(r => r.dataset.id);
            const [moved] = visible.splice(startIndex, 1);
            visible.splice(targetIndex, 0, moved);
            // Скрытые пункты сохраняют свои места в конце порядка
            state.order = visible.concat(state.order.filter(id => !visible.includes(id)));
            saveMenuState(state);
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onEnd);
        handle.addEventListener('pointercancel', onEnd);
    });
}

// Полное отключение pull-to-refresh (свайп сверху вниз) в браузере и в обёртке WebIntoApp.
// Нативный SwipeRefreshLayout обёртки срабатывает только при scrollY == 0 у WebView.
// Интерфейс зафиксирован (position: fixed), а корневой документ всегда держится на смещении
// --ptr-guard от верха, поэтому WebView «может прокрутиться вверх» и жест обновления не запускается
// независимо от настроек обёртки.
(function disablePullToRefresh() {
    const guardPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ptr-guard')) || 200;
    const rootEl = () => document.scrollingElement || document.documentElement;

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    function keepGuard() {
        const el = rootEl();
        const target = guardPx();
        if (Math.abs(el.scrollTop - target) > 0.5) el.scrollTop = target;
    }

    keepGuard();
    window.addEventListener('scroll', keepGuard, { passive: true });
    ['load', 'pageshow', 'resize', 'orientationchange', 'focus'].forEach(ev => window.addEventListener(ev, keepGuard));
    document.addEventListener('visibilitychange', keepGuard);
    document.addEventListener('touchstart', keepGuard, { passive: true, capture: true });
    document.addEventListener('focusin', () => setTimeout(keepGuard, 0));
    setInterval(keepGuard, 1000);
})();

// ЗАРПЛАТА
function addSalary() {
    let amountEl = document.getElementById('salary-amount');
    let commentEl = document.getElementById('salary-comment');
    if (!amountEl) return;
    
    let amount = parseFloat(amountEl.value);
    let comment = commentEl ? commentEl.value.trim() : '';
    
    if (!amount || amount <= 0) {
        alert('Введите корректную сумму!');
        return;
    }
    
    let datetimeNow = almatyIsoNow();

    let categoryName = comment ? `Зарплата: ${comment}` : 'Зарплата';
    
    transactions.push({
        id: Date.now().toString(),
        type: 'income',
        amount: amount,
        category: categoryName,
        date: datetimeNow,
        isSalary: true // Флаг для сортировки в меню зарплаты
    });
    
    if(amountEl) amountEl.value = '';
    if(commentEl) commentEl.value = '';
    
    updateUI(true);
    alert('Зарплата успешно зачислена!');
}

function renderSalaryList() {
    const sList = document.getElementById('salary-list');
    if (!sList) return;
    sList.innerHTML = '';
    
    let salaryTxs = transactions.filter(t => t.isSalary || t.category.toLowerCase().includes('зарплата'));
    
    if (salaryTxs.length === 0) {
        sList.innerHTML = '<p class="hint" style="text-align:center; padding: 20px;">Зачислений пока нет</p>';
        return;
    }
    
    let sortedTxs = [...salaryTxs].sort((a,b) => new Date((b.date||'').replace('T', ' ')) - new Date((a.date||'').replace('T', ' ')));
    
    let totalSalary = 0;
    
    sortedTxs.forEach(tx => {
        totalSalary += tx.amount;
        let dStr = (tx.date && tx.date.includes('T')) ? tx.date.split('T') : [tx.date, ''];
        
        let div = document.createElement('div');
        div.className = 'sub-item'; // Используем стиль как у подписок для красоты
        div.innerHTML = `
            <div class="sub-info">
                <strong>${tx.category}</strong><br>
                <span style="font-size: 12px; color: var(--text-muted);">${dStr[0]} ${dStr[1]}</span>
            </div>
            <strong style="font-size: 16px; color: var(--income);">+${tx.amount} ₸</strong>
            <div class="sub-actions">
                <button type="button" onclick="deleteTx('${tx.id}')"><span class="material-icons" style="font-size:18px; color:#d32f2f;">delete</span></button>
            </div>
        `;
        sList.appendChild(div);
    });
    
    // Добавляем итог
    let totalDiv = document.createElement('div');
    totalDiv.style.marginTop = '15px';
    totalDiv.style.paddingTop = '10px';
    totalDiv.style.borderTop = '1px dashed #ccc';
    totalDiv.style.textAlign = 'right';
    totalDiv.innerHTML = `<strong>Всего получено: <span style="color:var(--income)">${totalSalary} ₸</span></strong>`;
    sList.appendChild(totalDiv);
}

// Авто-выгрузка статистики каждый день в 23:00
setInterval(() => {
    let [today, hhmm] = almatyIsoNow().split('T');
    if (hhmm.startsWith('23:00')) {
        let lastAuto = localStorage.getItem('finance_lastAutoExport');
        
        if (lastAuto !== today) {
            localStorage.setItem('finance_lastAutoExport', today);
            if (transactions.length > 0) {
                exportExcel({ silent: true }); // Триггерим выгрузку Excel
                scheduleCloudSync(); // Заодно синхронизация с Google Диском
            }
        }
    }
}, 30000); // Проверяем каждые 30 секунд

// --- СИСТЕМА ЗАСТАВКИ И ПОГОДЫ ---
// Казахстан с 1 марта 2024 года живёт в едином поясе UTC+5. На многих телефонах и в Android WebView
// встроенная база часовых поясов устарела и для Asia/Almaty даёт UTC+6 (на час вперёд),
// поэтому время Алматы считаем от UTC с фиксированным смещением, не завися от настроек устройства.
const ALMATY_UTC_OFFSET_HOURS = 5;

function formatAlmaty(options, date = new Date()) {
    const shifted = new Date(date.getTime() + ALMATY_UTC_OFFSET_HOURS * 3600000);
    return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...options }).format(shifted);
}

// Текущие дата и время Алматы в формате 'YYYY-MM-DDTHH:MM' (для полей ввода и записей).
function almatyIsoNow(dayShift = 0) {
    return new Date(Date.now() + ALMATY_UTC_OFFSET_HOURS * 3600000 + dayShift * 86400000).toISOString().slice(0, 16);
}

function capitalizeRu(str) {
    return str ? str.charAt(0).toLocaleUpperCase('ru-RU') + str.slice(1) : str;
}

function updateSplashClock() {
    const now = new Date();
    const time = formatAlmaty({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, now);
    const longDate = capitalizeRu(formatAlmaty({ weekday: 'long', month: 'long', day: 'numeric' }, now));

    const timeEl = document.getElementById('splash-time');
    const dateEl = document.getElementById('splash-date');
    const greetEl = document.getElementById('splash-greeting');
    if (timeEl) timeEl.textContent = time;
    if (dateEl) dateEl.textContent = longDate;
    if (greetEl) {
        const hour = Number(formatAlmaty({ hour: '2-digit', hourCycle: 'h23' }, now));
        let greeting = 'Доброй ночи!';
        if (hour >= 5 && hour < 12) greeting = 'Доброе утро!';
        else if (hour >= 12 && hour < 18) greeting = 'Добрый день!';
        else if (hour >= 18 && hour < 23) greeting = 'Добрый вечер!';
        greetEl.textContent = profileName ? greeting.replace('!', `, ${profileName}!`) : greeting;
    }

    // Правая колонка в блоке «Текущий баланс»
    const hdrTime = document.getElementById('hdr-time');
    const hdrDate = document.getElementById('hdr-date');
    if (hdrTime) hdrTime.textContent = time;
    if (hdrDate) hdrDate.textContent = capitalizeRu(formatAlmaty({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }, now));
}

const WEATHER_ICONS = [
    [[0], 'wb_sunny'], [[1, 2], 'wb_cloudy'], [[3], 'cloud'], [[45, 48], 'foggy'],
    [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'umbrella'],
    [[71, 73, 75, 77, 85, 86], 'ac_unit'], [[95, 96, 99], 'thunderstorm']
];
function weatherIcon(code) {
    const hit = WEATHER_ICONS.find(([codes]) => codes.includes(code));
    return hit ? hit[1] : 'thermostat';
}

function setHeaderWeather(html) {
    const el = document.getElementById('hdr-weather');
    if (el) el.innerHTML = html;
}

let weatherRequestInFlight = false;
let lastWeatherSuccess = 0;

async function fetchWeather() {
    const weatherEl = document.getElementById('splash-weather');
    if (weatherRequestInFlight) return;

    weatherRequestInFlight = true;
    const previousMarkup = weatherEl ? weatherEl.innerHTML : '';
    if (!lastWeatherSuccess) {
        if (weatherEl) weatherEl.innerHTML = '<span class="material-icons" aria-hidden="true" style="vertical-align:middle;font-size:18px;">thermostat</span> Алматы: загружаем погоду…';
        setHeaderWeather('<span class="material-icons" aria-hidden="true">thermostat</span> загрузка…');
    }

    // timezone=GMT: время наблюдения приходит в UTC и переводится в UTC+5 здесь (см. ALMATY_UTC_OFFSET_HOURS).
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=43.2389&longitude=76.8897&current=temperature_2m,apparent_temperature,weather_code&timezone=GMT&temperature_unit=celsius';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;

    try {
        if (controller) timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
            ...(controller ? { signal: controller.signal } : {})
        });
        if (!response.ok) throw new Error('Weather API HTTP ' + response.status);

        const data = await response.json();
        const current = data && data.current;
        const temperature = Number(current && current.temperature_2m);
        if (!current || !Number.isFinite(temperature)) throw new Error('No current weather data');

        const code = Number(current.weather_code);
        const descriptions = {
            0: 'ясно', 1: 'преимущественно ясно', 2: 'переменная облачность', 3: 'пасмурно',
            45: 'туман', 48: 'изморозь и туман', 51: 'слабая морось', 53: 'морось',
            55: 'сильная морось', 56: 'слабая ледяная морось', 57: 'ледяная морось',
            61: 'небольшой дождь', 63: 'дождь', 65: 'сильный дождь',
            66: 'слабый ледяной дождь', 67: 'сильный ледяной дождь',
            71: 'небольшой снег', 73: 'снег', 75: 'сильный снег', 77: 'снежные зёрна',
            80: 'кратковременный дождь', 81: 'ливень', 82: 'сильный ливень',
            85: 'снегопад', 86: 'сильный снегопад', 95: 'гроза',
            96: 'гроза с небольшим градом', 99: 'гроза с сильным градом'
        };
        const feelsLike = Number(current.apparent_temperature);
        const feelsText = Number.isFinite(feelsLike)
            ? `, ощущается как ${Math.round(feelsLike)}°C` : '';
        const observedMs = current.time ? Date.parse(String(current.time) + 'Z') : NaN;
        const observedAt = Number.isFinite(observedMs)
            ? formatAlmaty({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(observedMs))
            : '';
        const updatedText = observedAt ? ` · обновлено ${observedAt}` : '';
        const description = descriptions[code] || 'текущая погода';
        const tempText = `${temperature > 0 ? '+' : ''}${Math.round(temperature)}°C`;

        if (weatherEl) {
            weatherEl.innerHTML =
                `<span class="material-icons" aria-hidden="true" style="vertical-align:middle;font-size:18px;">thermostat</span> ` +
                `Алматы: ${Math.round(temperature)}°C, ${description}${feelsText}` +
                `<span class="weather-updated" style="font-size:12px;opacity:.72;">${updatedText}</span>`;
        }
        setHeaderWeather(`<span class="material-icons" aria-hidden="true">${weatherIcon(code)}</span> Алматы ${tempText}, ${description}`);

        lastWeatherSuccess = Date.now();
    } catch (error) {
        console.warn('Не удалось загрузить погоду Алматы:', error);
        if (!lastWeatherSuccess) {
            if (weatherEl) weatherEl.innerHTML = '<span class="material-icons" aria-hidden="true" style="vertical-align:middle;font-size:18px;">cloud_off</span> Алматы: нет соединения с погодным сервисом';
            setHeaderWeather('<span class="material-icons" aria-hidden="true">cloud_off</span> погода недоступна');
        } else if (weatherEl && previousMarkup && previousMarkup.includes('Алматы:') && !previousMarkup.includes('не удалось обновить')) {
            weatherEl.innerHTML = previousMarkup + '<span style="font-size:12px;opacity:.7;"> · не удалось обновить</span>';
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        weatherRequestInFlight = false;
    }
}

// --- КУРСЫ ВАЛЮТ (тенге за 1 USD / EUR / RUB) ---
// Несколько бесплатных источников без ключа, с поддержкой CORS: если один недоступен, берём следующий.
const RATE_SOURCES = [
    { url: 'https://latest.currency-api.pages.dev/v1/currencies/kzt.json', parse: d => ({ usd: 1 / d.kzt.usd, eur: 1 / d.kzt.eur, rub: 1 / d.kzt.rub, date: d.date }) },
    { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kzt.json', parse: d => ({ usd: 1 / d.kzt.usd, eur: 1 / d.kzt.eur, rub: 1 / d.kzt.rub, date: d.date }) },
    { url: 'https://open.er-api.com/v6/latest/KZT', parse: d => ({ usd: 1 / d.rates.USD, eur: 1 / d.rates.EUR, rub: 1 / d.rates.RUB, date: new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10) }) }
];
let ratesRequestInFlight = false;

function renderRates(rates, stale) {
    const el = document.getElementById('hdr-rates');
    if (!el) return;
    if (!rates) {
        el.innerHTML = '<span class="rate-note">курсы валют недоступны</span>';
        return;
    }
    const fmt = (v, digits) => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const dateParts = String(rates.date || '').split('-');
    const dateText = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}` : '';
    el.innerHTML =
        `<span class="rate-item"><b>$</b> ${fmt(rates.usd, 2)} ₸</span>` +
        `<span class="rate-item"><b>€</b> ${fmt(rates.eur, 2)} ₸</span>` +
        `<span class="rate-item"><b>₽</b> ${fmt(rates.rub, 2)} ₸</span>` +
        (dateText ? `<span class="rate-note">курс на ${dateText}${stale ? ' (нет сети)' : ''}</span>` : '');
}

async function fetchRates() {
    if (ratesRequestInFlight) return;
    ratesRequestInFlight = true;
    try {
        for (const source of RATE_SOURCES) {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
                const response = await fetch(source.url, { cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
                if (timer) clearTimeout(timer);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const rates = source.parse(await response.json());
                if (![rates.usd, rates.eur, rates.rub].every(v => Number.isFinite(v) && v > 0)) throw new Error('Пустые курсы');
                localStorage.setItem('finance_rates', JSON.stringify(rates));
                renderRates(rates, false);
                return;
            } catch (e) {
                console.warn('Источник курсов недоступен:', source.url, e);
            }
        }
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem('finance_rates') || 'null'); } catch (e) {}
        renderRates(cached, true);
    } finally {
        ratesRequestInFlight = false;
    }
}

// Clock updates every second; weather and rates refresh periodically and retry on return online.
setInterval(updateSplashClock, 1000);
updateSplashClock();
setTimeout(fetchWeather, 250);
setTimeout(fetchRates, 400);
setInterval(fetchWeather, 10 * 60 * 1000); // Актуальная погода: обновление каждые 10 минут
setInterval(fetchRates, 30 * 60 * 1000);   // Курсы валют: обновление каждые 30 минут

// Моментальное обновление при разворачивании приложения (возврат из фона)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateSplashClock();
        fetchWeather();
        fetchRates();
    }
});
window.addEventListener('online', fetchWeather);
window.addEventListener('online', fetchRates);

// --- СИСТЕМА ПИН-КОДА И БИОМЕТРИИ ---
let currentPinInput = "";
let savedPin = localStorage.getItem('finance_pin');
let bioEnabled = localStorage.getItem('finance_bio') === 'true';

function proceedFromSplash() {
    safeStep('мелодия', () => playStartupChime()); // собственная мелодия запуска (звучит после жеста разблокировки)
    document.getElementById('splash-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('splash-screen').style.display = 'none';
        
        // Если установлен ПИН, показываем экран блокировки
        if (savedPin) {
            document.getElementById('pin-screen').style.display = 'flex';
            if (bioEnabled) {
                document.getElementById('bio-login-btn').style.visibility = 'visible';
                loginWithBiometrics();
            }
        }
    }, 500);
}

function addPinDigit(d) {
    if(currentPinInput.length < 4) {
        currentPinInput += d;
        updatePinDots();
        if(currentPinInput.length === 4) setTimeout(checkPin, 100);
    }
}

function deletePinDigit() {
    currentPinInput = currentPinInput.slice(0, -1);
    updatePinDots();
}

function updatePinDots() {
    let dots = document.querySelectorAll('#pin-dots .dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < currentPinInput.length);
    });
}

function checkPin() {
    if (currentPinInput === savedPin) {
        playSound('success');
        document.getElementById('pin-screen').style.opacity = '0';
        setTimeout(() => { document.getElementById('pin-screen').style.display = 'none'; }, 400);
    } else {
        playSound('error');
        alert('Неверный ПИН-код!');
        currentPinInput = "";
        updatePinDots();
    }
}

function savePin() {
    let p = document.getElementById('new-pin').value;
    if(p.length === 4 && /^\d+$/.test(p)) {
        localStorage.setItem('finance_pin', p);
        savedPin = p;
        alert('ПИН-код успешно установлен!');
        document.getElementById('remove-pin-btn').style.display = 'inline-flex';
        document.getElementById('new-pin').value = '';
    } else {
        alert('ПИН-код должен состоять ровно из 4 цифр!');
    }
}

function removePin() {
    if(confirm('Вы уверены, что хотите удалить ПИН-код и защиту входа?')) {
        localStorage.removeItem('finance_pin');
        localStorage.removeItem('finance_bio');
        localStorage.removeItem(BIO_CRED_KEY);
        savedPin = null;
        bioEnabled = false;
        refreshBiometricUi();
        alert('Защита удалена!');
        document.getElementById('remove-pin-btn').style.display = 'none';
    }
}

// Биометрия (отпечаток пальца / Face ID) через WebAuthn.
// Работает там, где страница открыта в защищённом контексте (https или localhost) и браузер/обёртка
// поддерживает WebAuthn: Chrome и Samsung Internet на Android, Safari на iPhone, Chrome/Edge на ПК
// с Windows Hello. Обычный Android WebView (WebIntoApp и др.) отдаёт WebAuthn странице только если
// это включено в самом приложении-обёртке; иначе показываем понятное объяснение, а вход по ПИН работает всегда.
const BIO_CRED_KEY = 'finance_bio_cred';

function bytesToB64url(bytes) {
    let bin = '';
    new Uint8Array(bytes).forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function randomBytes(n) {
    const arr = new Uint8Array(n);
    window.crypto.getRandomValues(arr);
    return arr;
}

// Возвращает { ok: true } или { ok: false, reason: '...' } с человеческим объяснением.
async function checkBiometricSupport() {
    if (!window.isSecureContext) {
        return { ok: false, reason: 'Приложение открыто не через защищённое соединение (https), а в таком режиме система не даёт доступ к отпечатку. Так бывает, когда приложение собрано из ZIP-архива во встроенном окне Android.' };
    }
    if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.create) {
        return { ok: false, reason: 'Встроенное окно приложения (Android WebView) не передаёт странице доступ к сканеру отпечатка. Его должна разрешить сама обёртка приложения (WebIntoApp).' };
    }
    try {
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
            && !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
            return { ok: false, reason: 'На устройстве не настроен отпечаток пальца / Face ID / Windows Hello, либо экран блокировки не защищён. Добавьте отпечаток в настройках телефона и попробуйте снова.' };
        }
    } catch (e) {}
    return { ok: true };
}

async function refreshBiometricUi() {
    const btn = document.getElementById('bio-setup-btn');
    const hint = document.getElementById('bio-hint');
    if (!btn) return;
    const support = await checkBiometricSupport();
    btn.classList.toggle('is-unavailable', !support.ok);
    btn.innerHTML = bioEnabled && support.ok
        ? '<span class="material-icons">fingerprint</span> Отпечаток подключён — привязать заново'
        : '<span class="material-icons">fingerprint</span> Включить вход по отпечатку';
    if (hint) {
        hint.textContent = support.ok ? '' : 'Вход по отпечатку недоступен: ' + support.reason + ' Вход по ПИН-коду работает всегда.';
        hint.style.display = support.ok ? 'none' : 'block';
    }
}

async function registerBiometrics() {
    if (!savedPin) {
        alert('Сначала установите цифровой ПИН-код!');
        return;
    }
    const support = await checkBiometricSupport();
    if (!support.ok) {
        alert('Вход по отпечатку недоступен.\n\n' + support.reason + '\n\nВход по ПИН-коду продолжит работать.');
        return;
    }
    try {
        const publicKey = {
            challenge: randomBytes(32),
            rp: { name: 'Money Pro' },
            user: { id: randomBytes(16), name: 'moneypro-user', displayName: 'Money Pro' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
            attestation: 'none',
            timeout: 60000
        };
        const credential = await navigator.credentials.create({ publicKey });
        if (credential) {
            // Сохраняем id ключа: без него вход (credentials.get) не находит отпечаток на большинстве Android.
            localStorage.setItem(BIO_CRED_KEY, bytesToB64url(credential.rawId));
            localStorage.setItem('finance_bio', 'true');
            bioEnabled = true;
            refreshBiometricUi();
            alert('Отпечаток успешно привязан! Теперь на экране ПИН-кода можно входить по отпечатку.');
        }
    } catch (e) {
        console.error(e);
        const name = e && e.name;
        if (name === 'NotAllowedError' || name === 'AbortError') {
            alert('Привязка отпечатка отменена.');
        } else if (name === 'SecurityError') {
            alert('Система запретила доступ к отпечатку для этого адреса приложения. Вход по ПИН-коду продолжит работать.');
        } else {
            alert('Не удалось привязать отпечаток: ' + (e && e.message ? e.message : name || 'неизвестная ошибка'));
        }
    }
}

let bioLoginInFlight = false;

async function loginWithBiometrics() {
    if (bioLoginInFlight) return;
    const support = await checkBiometricSupport();
    if (!support.ok) {
        const bioBtn = document.getElementById('bio-login-btn');
        if (bioBtn) bioBtn.style.visibility = 'hidden';
        return;
    }
    bioLoginInFlight = true;
    try {
        const credId = localStorage.getItem(BIO_CRED_KEY);
        const publicKey = {
            challenge: randomBytes(32),
            timeout: 60000,
            userVerification: 'required',
            ...(credId ? { allowCredentials: [{ type: 'public-key', id: b64urlToBytes(credId), transports: ['internal', 'hybrid'] }] } : {})
        };
        const credential = await navigator.credentials.get({ publicKey });
        if (credential) {
            const pinScreen = document.getElementById('pin-screen');
            pinScreen.style.opacity = '0';
            setTimeout(() => { pinScreen.style.display = 'none'; }, 300);
        }
    } catch(e) {
        console.log('Биометрия отменена или не удалась', e);
    } finally {
        bioLoginInFlight = false;
    }
}

// Подгрузка ПИНа и меню при запуске
window.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('finance_pin')) {
        let btn = document.getElementById('remove-pin-btn');
        if(btn) btn.style.display = 'inline-flex';
    }
    refreshBiometricUi();
    renderMenus();
    initMenuDrag();

    // Авто-пропуск заставки на ПК
    if (window.innerWidth >= 769) {
        let splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'none';
        
        if (savedPin) {
            let pinScreen = document.getElementById('pin-screen');
            if (pinScreen) pinScreen.style.display = 'flex';
            if (bioEnabled) {
                let bioBtn = document.getElementById('bio-login-btn');
                if (bioBtn) bioBtn.style.visibility = 'visible';
                if (typeof loginWithBiometrics === 'function') loginWithBiometrics();
            }
        }
    }
});

// SLIDE TO UNLOCK LOGIC — Pointer Events work with touch, mouse and stylus.
let splashSliderInitialized = false;

function initSlider() {
    const thumb = document.getElementById('slider-thumb');
    const container = document.getElementById('slider-container');
    if (!thumb || !container || splashSliderInitialized) return;
    splashSliderInitialized = true;

    let dragging = false;
    let activePointerId = null;
    let startX = 0;
    let currentX = 0;
    let maxDrag = 0;
    let unlocked = false;

    function measure() {
        const thumbWidth = thumb.getBoundingClientRect().width || thumb.offsetWidth;
        maxDrag = Math.max(0, container.clientWidth - thumbWidth - 8);
        if (!dragging && !unlocked) thumb.style.transform = 'translate3d(0,0,0)';
    }

    function onStart(event) {
        if (unlocked || dragging) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        measure();
        if (maxDrag < 20) return;

        dragging = true;
        activePointerId = event.pointerId;
        startX = event.clientX;
        currentX = 0;
        thumb.style.transition = 'none';
        thumb.classList.add('is-dragging');

        // Capture pointer so the gesture continues even if the finger leaves the knob.
        try { thumb.setPointerCapture(event.pointerId); } catch (_) {}
        if (event.cancelable) event.preventDefault();
    }

    function onMove(event) {
        if (!dragging || (activePointerId !== null && event.pointerId !== activePointerId)) return;
        currentX = Math.max(0, Math.min(event.clientX - startX, maxDrag));
        thumb.style.transform = `translate3d(${currentX}px,0,0)`;
        if (event.cancelable) event.preventDefault();
    }

    function reset() {
        thumb.style.transition = 'transform .22s ease';
        thumb.style.transform = 'translate3d(0,0,0)';
        thumb.classList.remove('is-dragging');
        currentX = 0;
    }

    function onEnd(event) {
        if (!dragging || (event && activePointerId !== null && event.pointerId !== activePointerId)) return;
        dragging = false;
        activePointerId = null;
        thumb.classList.remove('is-dragging');

        if (currentX >= maxDrag * 0.78) {
            unlocked = true;
            thumb.style.transition = 'transform .12s ease';
            thumb.style.transform = `translate3d(${maxDrag}px,0,0)`;
            container.setAttribute('aria-valuenow', '100');
            container.setAttribute('aria-label', 'Разблокировано');
            setTimeout(() => {
                if (typeof proceedFromSplash === 'function') proceedFromSplash();
            }, 140);
        } else {
            reset();
        }
    }

    thumb.addEventListener('pointerdown', onStart, { passive: false });
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    thumb.addEventListener('lostpointercapture', () => {
        if (dragging) onEnd({ pointerId: activePointerId });
    });

    // Keyboard accessibility: focus the slider and press Enter/Space to unlock.
    container.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!unlocked) {
                unlocked = true;
                container.setAttribute('aria-valuenow', '100');
                proceedFromSplash();
            }
        }
    });

    window.addEventListener('resize', measure);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', measure);
    requestAnimationFrame(measure);
}

// --- СИСТЕМА АВТОЗАПОЛНЕНИЯ КАТЕГОРИЙ ---
const categoryOptions = [
    "Паковка Вб",
    "Паковка Озон",
    "Паковка Каспи",
    "Доставка",
    "Смена",
    "Инвентаризация",
    "Еда",
    "Магазин",
    "Тэму",
    "Подписка",
    "Другое"
];

function showCategories() {
    filterCategories(); 
    let drop = document.getElementById('category-dropdown');
    if(drop) drop.style.display = 'block';
}

function hideCategories() {
    setTimeout(() => {
        let drop = document.getElementById('category-dropdown');
        if (drop) drop.style.display = 'none';
    }, 200); 
}

// Категории Oldbook по умолчанию (подсказки в поле «На что»)
const OB_DEFAULT_CATEGORIES = ['Продукты', 'Еда вне дома', 'Проезд', 'Одежда', 'Учёба', 'Кружки и секции',
    'Развлечения', 'Подарки', 'Здоровье', 'Карманные деньги', 'Зарплата', 'Другое'];

function customCategoryNames() {
    return customCategories.map(c => c && c.name).filter(Boolean);
}

// Все категории: свои — первыми, затем стандартные; без повторов (без учёта регистра)
function allCategories(defaults = categoryOptions) {
    const seen = new Set();
    return customCategoryNames().concat(defaults).filter(name => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function addCustomCategory(rawName, { silent = false } = {}) {
    const name = String(rawName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) {
        if (!silent) alert('Введите название категории.');
        return false;
    }
    const exists = allCategories(categoryOptions.concat(OB_DEFAULT_CATEGORIES)).some(c => c.toLowerCase() === name.toLowerCase());
    if (exists) {
        if (!silent) showToast(`Категория «${name}» уже есть`);
        return false;
    }
    customCategories.push({ id: 'cat' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name });
    updateUI(true);
    if (!silent) showToast(`Категория «${name}» добавлена`);
    return true;
}

function addCategoryFromSettings() {
    const input = document.getElementById('new-category');
    if (addCustomCategory(input ? input.value : '') && input) input.value = '';
}

function deleteCustomCategory(id) {
    const cat = customCategories.find(c => c.id === id);
    if (!cat || !confirm(`Удалить категорию «${cat.name}» из списка? Уже сделанные записи с ней не изменятся.`)) return;
    customCategories = customCategories.filter(c => c.id !== id);
    updateUI(true);
}

function renderCategorySettings() {
    const list = document.getElementById('custom-categories');
    if (list) {
        list.innerHTML = customCategories.length
            ? customCategories.map(c => `<div class="cat-chip"><span class="cat-chip-name">${escapeHtml(c.name)}</span>` +
                `<button type="button" class="cat-chip-del" onclick="deleteCustomCategory('${escapeHtml(c.id)}')" aria-label="Удалить категорию ${escapeHtml(c.name)}"><span class="material-icons">close</span></button></div>`).join('')
            : '<p class="hint">Своих категорий пока нет.</p>';
    }
    // Подсказки в Oldbook: свои + стандартные
    const dl = document.getElementById('ob-category-list');
    if (dl) dl.innerHTML = allCategories(OB_DEFAULT_CATEGORIES).map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

function filterCategories() {
    let catInput = document.getElementById('category');
    let drop = document.getElementById('category-dropdown');
    if (!catInput || !drop) return;

    const typed = catInput.value.trim();
    let input = typed.toLowerCase();
    drop.innerHTML = '';

    const all = allCategories();
    let filtered = all.filter(c => c.toLowerCase().includes(input));
    const customSet = new Set(customCategoryNames().map(c => c.toLowerCase()));

    filtered.forEach(c => {
        let div = document.createElement('div');
        div.className = 'dropdown-item' + (customSet.has(c.toLowerCase()) ? ' is-custom' : '');
        div.textContent = c;
        div.onclick = function() {
            catInput.value = c;
            drop.style.display = 'none';
        };
        drop.appendChild(div);
    });

    // Своя категория прямо из списка: «+ Добавить "…" в мои категории»
    if (typed && !all.some(c => c.toLowerCase() === input)) {
        let add = document.createElement('div');
        add.className = 'dropdown-item dropdown-add';
        add.innerHTML = `<span class="material-icons">add</span> Добавить «${escapeHtml(typed.slice(0, 40))}» в мои категории`;
        // mousedown срабатывает раньше, чем поле теряет фокус и список скрывается
        add.onmousedown = function(e) { e.preventDefault(); };
        add.onclick = function() {
            addCustomCategory(typed);
            catInput.value = typed.slice(0, 40);
            drop.style.display = 'none';
        };
        drop.appendChild(add);
    }

    drop.style.display = drop.children.length ? 'block' : 'none';
}
