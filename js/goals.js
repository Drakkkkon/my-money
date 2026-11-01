// --- ЦЕЛИ: ПРИОРИТЕТНЫЕ ВЕЩИ ---
// Цель — товар по ссылке (картинка, название и цена подгружаются со страницы магазина) или вручную.
// Кнопка «$»: отложить сумму сейчас или включить автосписание (каждый день / неделю / месяц).
// Каждое откладывание — обычный расход в «Записях» с категорией «Приоритетная вещь: <название>» и полем goalId,
// поэтому оно учитывается в балансе, статистике и выгрузках. Накоплено по цели = сумма этих записей.
// У записей автосписания предсказуемый id (цель + дата), поэтому два устройства не спишут один день дважды.

const GOAL_TX_PREFIX = 'Приоритетная вещь: ';
const GOAL_PERIODS = { day: 'каждый день', week: 'каждую неделю', month: 'каждый месяц' };
const GOAL_PAGE_PROXY = 'https://r.jina.ai/';

let goalsList = [];
try { goalsList = JSON.parse(localStorage.getItem('finance_goals') || '[]') || []; } catch (e) { goalsList = []; }
if (!Array.isArray(goalsList)) goalsList = [];

function saveGoalsLocal() {
    try { localStorage.setItem('finance_goals', JSON.stringify(goalsList)); } catch (e) {}
}

function goalById(id) {
    return goalsList.find(g => g && g.id === id) || null;
}

function goalSaved(goal) {
    return transactions.filter(t => t.goalId === goal.id).reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

function fmtGoalMoney(n) {
    return Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
}

// Старая цель (до 3.8: одна цель с иконкой) становится приоритетной вещью
function migrateLegacyGoal() {
    if (!priorityGoal || !priorityGoal.name || !(priorityGoal.amount > 0)) return;
    if (goalsList.some(g => g.id === 'glegacy')) return;
    goalsList.push({ id: 'glegacy', title: priorityGoal.name, price: Number(priorityGoal.amount), emoji: priorityGoal.icon || '🎯', url: '', image: '', createdAt: Date.now(), priority: 1 });
    priorityGoal = { name: '', amount: 0, icon: '🎯' };
}

// ---------- Загрузка товара по ссылке ----------
function decodeHtmlEntities(s) {
    const t = document.createElement('textarea');
    t.innerHTML = String(s || '');
    return t.value.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function metaContent(html, names) {
    for (const n of names) {
        const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i');
        const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${n}["']`, 'i');
        const m = html.match(re1) || html.match(re2);
        if (m) return decodeHtmlEntities(m[1]).trim();
    }
    return '';
}

function parsePriceNumber(s) {
    const clean = String(s || '').replace(/[\s  ]/g, '').replace(/[^\d.,]/g, '');
    if (!clean) return 0;
    const norm = /,\d{1,2}$/.test(clean) ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : 0;
}

function cleanProductTitle(t) {
    return decodeHtmlEntities(t)
        .replace(/^(купить|buy)\s+/i, '')
        .replace(/\s*[–—|]\s*(магазин|интернет-магазин|купить|kaspi|wildberries|ozon|amazon|aliexpress)[^–—|]*$/i, '')
        .replace(/\s+(в|по)\s+(алматы|астане|шымкенте|казахстане|москве|россии)(?![а-яё]).*$/i, '')
        .replace(/\s+/g, ' ').trim().slice(0, 120);
}

function parseProductPage(html, url) {
    let title = metaContent(html, ['og:title', 'twitter:title']);
    if (!title) { const m = html.match(/<title[^>]*>([^<]+)<\/title>/i); if (m) title = m[1]; }
    let image = metaContent(html, ['og:image', 'og:image:url', 'twitter:image', 'image']);
    let price = parsePriceNumber(metaContent(html, ['product:price:amount', 'og:price:amount', 'price']));
    let currency = metaContent(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);
    // JSON-LD: Product → offers.price
    if (!price || !image) {
        const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const b of blocks) {
            try {
                const raw = JSON.parse(b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim());
                const items = [].concat(raw['@graph'] || raw);
                const prod = items.find(x => x && /Product/i.test(String(x['@type'])));
                if (!prod) continue;
                const offer = [].concat(prod.offers || [])[0] || {};
                if (!price) price = parsePriceNumber(offer.price || offer.lowPrice);
                if (!currency) currency = offer.priceCurrency || '';
                if (!image) image = [].concat(prod.image || [])[0] || '';
                if (!title) title = prod.name || '';
            } catch (e) {}
        }
    }
    // Цена текстом рядом со знаком валюты
    if (!price) {
        const m = html.replace(/<[^>]+>/g, ' ').match(/(\d[\d\s  ]{2,12}(?:[.,]\d{1,2})?)\s*(₸|тг|руб|₽)/i);
        if (m) { price = parsePriceNumber(m[1]); currency = currency || (/руб|₽/i.test(m[2]) ? 'RUB' : 'KZT'); }
    }
    if (image && typeof image === 'object') image = image.url || '';
    try { if (image) image = new URL(image, url).href; } catch (e) { image = ''; }
    return { title: cleanProductTitle(title), image: /^https:\/\//.test(image) ? image : '', price: Math.round(price), currency: String(currency || '').toUpperCase() };
}

async function fetchProductInfo(url) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;
    try {
        const r = await fetch(GOAL_PAGE_PROXY + url, { headers: { 'X-Return-Format': 'html' }, ...(controller ? { signal: controller.signal } : {}) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return parseProductPage(await r.text(), url);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// Товар, который сейчас в форме (до нажатия «Добавить цель»)
let goalDraft = null;

function normalizeProductUrl(raw) {
    let s = String(raw || '').trim();
    const m = s.match(/https?:\/\/\S+/i); // ссылка внутри текста «Посмотрите … https://…»
    if (m) s = m[0];
    if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch (e) { return ''; }
}

async function loadGoalFromLink() {
    const input = document.getElementById('goal-url');
    const status = document.getElementById('goal-load-status');
    const url = normalizeProductUrl(input ? input.value : '');
    if (!url) { alert('Вставьте ссылку на товар, например https://kaspi.kz/shop/p/…'); return; }
    if (input) input.value = url;
    if (status) status.textContent = 'Загружаем товар…';
    goalDraft = { url, title: '', image: '', price: 0 };
    renderGoalDraft(true);
    try {
        const info = await fetchProductInfo(url);
        goalDraft = { url, ...info };
        if (status) status.textContent = info.title
            ? (info.price ? 'Готово. Проверьте название и цену и нажмите «Добавить цель».' : 'Цена на странице не найдена — впишите её сами.')
            : 'Магазин не отдал данные о товаре. Впишите название и цену вручную.';
    } catch (e) {
        console.warn('Товар не загрузился', e);
        if (status) status.textContent = 'Не удалось открыть страницу товара (нет интернета или магазин не пускает). Впишите название и цену вручную.';
    }
    renderGoalDraft(false);
}

function startManualGoal() {
    goalDraft = { url: normalizeProductUrl((document.getElementById('goal-url') || {}).value || ''), title: '', image: '', price: 0 };
    const status = document.getElementById('goal-load-status');
    if (status) status.textContent = 'Впишите название и цену.';
    renderGoalDraft(false);
}

function renderGoalDraft(loading) {
    const box = document.getElementById('goal-draft');
    if (!box) return;
    if (!goalDraft) { box.innerHTML = ''; return; }
    const d = goalDraft;
    const cur = d.currency && d.currency !== 'KZT' ? ` (на сайте в ${escapeHtml(d.currency)})` : '';
    box.innerHTML = `
        <div class="goal-draft${loading ? ' is-loading' : ''}">
            <div class="goal-draft-img">${d.image ? `<img src="${escapeHtml(d.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="goal-emoji">${loading ? '⏳' : '🎁'}</span>`}</div>
            <div class="goal-draft-fields">
                <input type="text" id="goal-title" placeholder="Название товара" maxlength="120" value="${escapeHtml(d.title || '')}" ${loading ? 'disabled' : ''}>
                <input type="number" id="goal-price" placeholder="Цена, ₸${cur}" min="1" value="${d.price || ''}" ${loading ? 'disabled' : ''}>
            </div>
        </div>
        <div class="btn-group">
            <button type="button" class="btn-primary" onclick="addGoalFromDraft()" ${loading ? 'disabled' : ''}><span class="material-icons">add_task</span> Добавить цель</button>
            <button type="button" class="btn-secondary" onclick="cancelGoalDraft()">Отмена</button>
        </div>`;
}

function cancelGoalDraft() {
    goalDraft = null;
    renderGoalDraft(false);
    const status = document.getElementById('goal-load-status');
    if (status) status.textContent = '';
}

function addGoalFromDraft() {
    if (!goalDraft) return;
    const title = ((document.getElementById('goal-title') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const price = Math.round(parseFloat((document.getElementById('goal-price') || {}).value) || 0);
    if (!title || price <= 0) { alert('Заполните название и цену товара.'); return; }
    const maxPrio = goalsList.reduce((m, g) => Math.max(m, Number(g.priority) || 0), 0);
    goalsList.push({
        id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title, price, url: goalDraft.url || '', image: goalDraft.image || '', createdAt: Date.now(), priority: maxPrio + 1
    });
    goalDraft = null;
    const url = document.getElementById('goal-url');
    if (url) url.value = '';
    cancelGoalDraft();
    updateUI(true);
    playSound('success');
    showToast(`Цель «${title}» добавлена`);
}

function deleteGoal(id) {
    const g = goalById(id);
    if (!g) return;
    if (!confirm(`Удалить цель «${g.title}»?\n\nУже отложенные деньги останутся в «Записях» как расходы — при желании удалите их там.`)) return;
    goalsList = goalsList.filter(x => x.id !== id);
    updateUI(true);
}

function moveGoal(id, dir) {
    const sorted = sortedGoals();
    const i = sorted.findIndex(g => g.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((g, k) => { g.priority = k + 1; });
    updateUI(true);
}

function sortedGoals() {
    return [...goalsList].filter(Boolean).sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
}

// ---------- Отложить деньги ----------
function addGoalTx(goal, amount, date, id, auto) {
    const tx = {
        id: id || ('gs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
        type: 'expense', amount: Math.round(amount),
        category: GOAL_TX_PREFIX + goal.title,
        date, goalId: goal.id
    };
    if (auto) tx.comment = 'Автосписание ' + (GOAL_PERIODS[goal.plan && goal.plan.period] || '');
    transactions.push(tx);
    return tx;
}

function saveToGoal(id, amount) {
    const g = goalById(id);
    amount = Math.round(Number(amount) || 0);
    if (!g || amount <= 0) { alert('Введите сумму больше нуля.'); return false; }
    addGoalTx(g, amount, almatyIsoNow());
    closeGoalMoney(false);
    updateUI(true);
    playSound('success');
    const left = g.price - goalSaved(g);
    showToast(left > 0 ? `Отложено ${fmtGoalMoney(amount)}. Осталось ${fmtGoalMoney(left)}` : `Цель «${g.title}» накоплена! 🎉`);
    return true;
}

function setGoalPlan(id, amount, period, start) {
    const g = goalById(id);
    amount = Math.round(Number(amount) || 0);
    if (!g || amount <= 0 || !GOAL_PERIODS[period]) { alert('Укажите сумму и как часто списывать.'); return; }
    const today = almatyIsoNow().split('T')[0];
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today;
    // lastRun — день перед стартом: первое списание будет в день старта
    g.plan = { amount, period, start: startDate, lastRun: shiftIsoDate(startDate, -1), active: true };
    closeGoalMoney(false);
    runGoalAutoSave(false);
    updateUI(true);
    showToast(`Автосписание: ${fmtGoalMoney(amount)} ${GOAL_PERIODS[period]}`);
}

function stopGoalPlan(id) {
    const g = goalById(id);
    if (!g || !g.plan) return;
    g.plan.active = false;
    closeGoalMoney(false);
    updateUI(true);
    showToast('Автосписание выключено');
}

function shiftIsoDate(iso, days) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// Дни списаний после lastRun по today включительно
function goalDueDates(plan, today) {
    const out = [];
    const start = plan.start;
    let d = start;
    let k = 0;
    while (d <= today && out.length < 400) {
        if (d > plan.lastRun) out.push(d);
        k++;
        if (plan.period === 'day') d = shiftIsoDate(start, k);
        else if (plan.period === 'week') d = shiftIsoDate(start, k * 7);
        else {
            const [y, m, day] = start.split('-').map(Number);
            const t = new Date(Date.UTC(y, m - 1 + k, 1));
            const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
            t.setUTCDate(Math.min(day, last));
            d = t.toISOString().slice(0, 10);
        }
    }
    return out;
}

// Создаёт пропущенные списания по всем целям с автосписанием. Вызывается при запуске и раз в час.
function runGoalAutoSave(save = true) {
    const today = almatyIsoNow().split('T')[0];
    let changed = false;
    goalsList.forEach(g => {
        const p = g && g.plan;
        if (!p || !p.active || !(p.amount > 0)) return;
        const dates = goalDueDates(p, today);
        if (!dates.length) return;
        let saved = goalSaved(g);
        for (const d of dates) {
            const left = g.price - saved;
            if (left <= 0) { p.active = false; break; }
            const id = 'ga' + g.id + d.replace(/-/g, '');
            if (!transactions.some(t => t.id === id)) {
                const amount = Math.min(p.amount, left);
                addGoalTx(g, amount, d + 'T09:00', id, true);
                saved += amount;
            }
            p.lastRun = d;
            changed = true;
        }
        if (g.price - saved <= 0) p.active = false;
    });
    if (changed && save) updateUI(true);
    return changed;
}

// ---------- Окно «$» ----------
function openGoalMoney(id) {
    const g = goalById(id);
    if (!g) return;
    closeGoalMoney(false);
    const saved = goalSaved(g);
    const left = Math.max(0, g.price - saved);
    const p = g.plan && g.plan.active ? g.plan : null;
    const today = almatyIsoNow().split('T')[0];
    const overlay = document.createElement('div');
    overlay.id = 'goal-money';
    overlay.className = 'export-sheet-overlay';
    overlay.innerHTML = `
        <div class="export-sheet goal-money" role="dialog" aria-modal="true" aria-label="Отложить на цель">
            <div class="export-sheet-head">
                <h3>${escapeHtml(g.title)}</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <p class="hint">Накоплено ${fmtGoalMoney(saved)} из ${fmtGoalMoney(g.price)}. Осталось ${fmtGoalMoney(left)}. Отложенные деньги попадают в «Записи» как расход «${escapeHtml(GOAL_TX_PREFIX + g.title)}».</p>
            <div class="seg-buttons" role="tablist">
                <button type="button" class="seg-btn is-on" data-tab="once" role="tab">Отложить сейчас</button>
                <button type="button" class="seg-btn" data-tab="plan" role="tab">Списывать регулярно</button>
            </div>
            <div class="gm-pane" data-pane="once">
                <input type="number" id="gm-amount" min="1" placeholder="Сумма, ₸" inputmode="numeric">
                <div class="gm-chips">
                    ${[1000, 5000, 10000, 20000].map(v => `<button type="button" class="btn-secondary" data-chip="${v}">${v.toLocaleString('ru-RU')}</button>`).join('')}
                    ${left ? `<button type="button" class="btn-secondary" data-chip="${left}">Всё: ${left.toLocaleString('ru-RU')}</button>` : ''}
                </div>
                <button type="button" class="btn-primary btn-block" data-act="save"><span class="material-icons">savings</span> Отложить</button>
            </div>
            <div class="gm-pane" data-pane="plan" hidden>
                ${p ? `<p class="goal-plan-now"><span class="material-icons">event_repeat</span> Сейчас: ${fmtGoalMoney(p.amount)} ${GOAL_PERIODS[p.period]}</p>` : ''}
                <input type="number" id="gm-plan-amount" min="1" placeholder="Сколько списывать, ₸" value="${p ? p.amount : ''}" inputmode="numeric">
                <select id="gm-plan-period">
                    ${Object.entries(GOAL_PERIODS).map(([k, v]) => `<option value="${k}" ${p && p.period === k ? 'selected' : (!p && k === 'week' ? 'selected' : '')}>${capitalizeRu(v)}</option>`).join('')}
                </select>
                <label class="field-inline" for="gm-plan-start"><span>Первое списание</span><input type="date" id="gm-plan-start" value="${p ? p.start : today}"></label>
                <button type="button" class="btn-primary btn-block" data-act="plan"><span class="material-icons">event_repeat</span> ${p ? 'Сохранить' : 'Включить автосписание'}</button>
                ${p ? '<button type="button" class="btn-secondary btn-block" data-act="stop"><span class="material-icons">event_busy</span> Выключить автосписание</button>' : ''}
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="close"]')) { closeGoalMoney(true); return; }
        const tab = e.target.closest('[data-tab]');
        if (tab) {
            overlay.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-on', b === tab));
            overlay.querySelectorAll('.gm-pane').forEach(pn => { pn.hidden = pn.dataset.pane !== tab.dataset.tab; });
            return;
        }
        const chip = e.target.closest('[data-chip]');
        if (chip) { document.getElementById('gm-amount').value = chip.dataset.chip; return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'save') saveToGoal(id, document.getElementById('gm-amount').value);
        if (act.dataset.act === 'plan') setGoalPlan(id, document.getElementById('gm-plan-amount').value, document.getElementById('gm-plan-period').value, document.getElementById('gm-plan-start').value);
        if (act.dataset.act === 'stop') stopGoalPlan(id);
    });
    document.body.appendChild(overlay);
    if (p) overlay.querySelector('[data-tab="plan"]').click();
    playSound('open');
}

function closeGoalMoney(withSound) {
    const el = document.getElementById('goal-money');
    if (!el) return;
    el.remove();
    if (withSound) playSound('close');
}

// ---------- Список целей ----------
function renderGoals() {
    const box = document.getElementById('goals-list');
    if (!box) return;
    const list = sortedGoals();
    const totalEl = document.getElementById('goals-total');
    if (!list.length) {
        box.innerHTML = '<p class="hint goals-empty">Целей пока нет. Вставьте ссылку на товар выше — картинка, название и цена подтянутся сами.</p>';
        if (totalEl) totalEl.textContent = '';
        return;
    }
    let sumSaved = 0, sumPrice = 0;
    box.innerHTML = list.map((g, i) => {
        const saved = goalSaved(g);
        sumSaved += Math.min(saved, g.price);
        sumPrice += g.price;
        const pct = g.price > 0 ? Math.min(100, saved / g.price * 100) : 0;
        const done = saved >= g.price;
        const p = g.plan && g.plan.active ? g.plan : null;
        let host = '';
        try { host = g.url ? new URL(g.url).hostname.replace(/^www\./, '') : ''; } catch (e) {}
        return `<div class="goal-item${done ? ' is-done' : ''}${i === 0 ? ' is-top' : ''}">
            <div class="goal-img">${g.image ? `<img src="${escapeHtml(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'goal-emoji',textContent:'🎁'}))">` : `<span class="goal-emoji">${escapeHtml(g.emoji || '🎁')}</span>`}</div>
            <div class="goal-body">
                <div class="goal-title-row">
                    ${i === 0 ? '<span class="goal-rank" title="Самая приоритетная">★ 1</span>' : `<span class="goal-rank">${i + 1}</span>`}
                    <b class="goal-title">${escapeHtml(g.title)}</b>
                </div>
                ${host ? `<a class="goal-link" href="${escapeHtml(g.url)}" target="_blank" rel="noopener noreferrer"><span class="material-icons">open_in_new</span> ${escapeHtml(host)}</a>` : ''}
                <div class="goal-nums"><span>${fmtGoalMoney(saved)}</span> из <b>${fmtGoalMoney(g.price)}</b> <span class="goal-pct">${pct.toFixed(0)}%</span></div>
                <div class="goal-progress"><div class="goal-bar" style="width:${pct}%"></div></div>
                <div class="goal-plan">${done ? '🎉 Накоплено! Можно покупать.' : p ? `<span class="material-icons">event_repeat</span> ${fmtGoalMoney(p.amount)} ${GOAL_PERIODS[p.period]}` : ''}</div>
            </div>
            <div class="goal-actions">
                <button type="button" class="goal-dollar" onclick="openGoalMoney('${g.id}')" title="Отложить деньги" aria-label="Отложить деньги на «${escapeHtml(g.title)}»">$</button>
                <button type="button" class="btn-secondary" onclick="moveGoal('${g.id}', -1)" ${i === 0 ? 'disabled' : ''} aria-label="Выше по приоритету"><span class="material-icons">arrow_upward</span></button>
                <button type="button" class="btn-secondary" onclick="moveGoal('${g.id}', 1)" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Ниже по приоритету"><span class="material-icons">arrow_downward</span></button>
                <button type="button" class="btn-secondary" onclick="deleteGoal('${g.id}')" aria-label="Удалить цель"><span class="material-icons">delete</span></button>
            </div>
        </div>`;
    }).join('');
    if (totalEl) totalEl.textContent = `Всего накоплено ${fmtGoalMoney(sumSaved)} из ${fmtGoalMoney(sumPrice)}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('goal-url');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') loadGoalFromLink(); });
});
setInterval(() => { if (document.visibilityState === 'visible') runGoalAutoSave(); }, 60 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runGoalAutoSave(); });
