// --- 4.15.0: ПОМОЩЬ, ПОДСКАЗКИ И «ЧТО НОВОГО» ---
// 1) «Что нового»: после обновления, при первой загрузке новой версии — небольшое окно с коротким списком изменений
//    (WHATS_NEW ниже; при каждом обновлении сюда добавляется запись для новой версии). Новому пользователю вместо списка —
//    приветствие со ссылкой на «Помощь». Показанная версия хранится на устройстве (finance_seen_version).
// 2) Подсказки при первом нажатии: у главных кнопок (HELP_TIPS) при первом нажатии рядом появляется короткое пояснение.
//    Кнопка при этом срабатывает как обычно. Каждая подсказка — один раз (finance_tips_seen); выключаются и сбрасываются в «Помощи».
// 3) Настройки → «Помощь» (#help-card, самый верхний пункт): подробные инструкции по шагам с картинками из программы
//    (images/help/*.webp — снимки экрана с цифрами-метками; цифры на картинке = номера шагов).

const HELP_SEEN_VERSION_KEY = 'finance_seen_version';
const HELP_TIPS_SEEN_KEY = 'finance_tips_seen';
const HELP_TIPS_OFF_KEY = 'finance_tips_off';

// ---------- «Что нового» (новые версии — сверху) ----------
const WHATS_NEW = [
    { v: '4.15.0', items: [
        'Новый пункт «Помощь» в самом верху Настроек: пошаговые инструкции с картинками — как сделать запись, скачать Excel, загрузить таблицу и др.',
        'Подсказки при первом нажатии на главные кнопки. Их можно выключить или показать заново в «Помощи».',
        'После каждого обновления — вот такое окошко с коротким списком изменений.'
    ] },
    { v: '4.14.0', items: [
        'Настройки → «Категории»: разделы и подкатегории (например «Семья: Отец») в одном меню.',
        'Эмодзи категорий — системные, как на клавиатуре телефона.',
        'Новый пункт «Экран приветствия»: как было, своё приветствие с картинкой или анимацией, или без экрана.'
    ] },
    { v: '4.13.0', items: [
        'Регистрация по почте и паролю — «Аккаунт My Money» в Настройках. Данные синхронизируются между устройствами.'
    ] },
    { v: '4.12.3', items: ['Тема «Doom 1993» удалена.'] }
];

function helpCmpVer(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
    return 0;
}
function helpGet(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
function helpSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
function helpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Приложение на экране: заставка и экран ПИН-кода уже убраны
function helpAppVisible() {
    const splash = document.getElementById('splash-screen');
    const pin = document.getElementById('pin-screen');
    const hidden = el => !el || el.classList.contains('is-gone') || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden';
    return hidden(splash) && hidden(pin);
}

function closeWhatsNew() {
    const o = document.getElementById('whats-new');
    if (o) o.remove();
}

// mode: 'update' — изменения с прошлой версии; 'all' — последние версии (из «Помощи»); 'welcome' — первый запуск
function showWhatsNew(mode = 'update', since = '') {
    closeWhatsNew();
    const cur = window.APP_VERSION || '';
    let list = mode === 'update'
        ? WHATS_NEW.filter(w => helpCmpVer(w.v, since) > 0 && helpCmpVer(w.v, cur) <= 0).slice(0, 3)
        : WHATS_NEW.filter(w => helpCmpVer(w.v, cur) <= 0).slice(0, 3);
    if (mode !== 'welcome' && !list.length) list = WHATS_NEW.slice(0, 1);
    const body = mode === 'welcome'
        ? `<p>Это приложение для учёта доходов и расходов. Чтобы начать, откройте «Записи», введите сумму и нажмите «Расход» или «Доход».</p>
           <p>Подробные инструкции с картинками — в Настройки → Помощь. А при первом нажатии на главные кнопки появятся короткие подсказки.</p>`
        : list.map(w => `<div class="wn-ver"><h4>Версия ${helpEsc(w.v)}</h4><ul>${w.items.map(i => `<li>${helpEsc(i)}</li>`).join('')}</ul></div>`).join('');
    const title = mode === 'welcome' ? 'Добро пожаловать в My Money!' : (mode === 'update' ? 'Что нового' : 'Последние изменения');
    const overlay = document.createElement('div');
    overlay.id = 'whats-new';
    overlay.className = 'export-sheet-overlay whats-new-overlay';
    overlay.innerHTML = `
        <div class="export-sheet whats-new" role="dialog" aria-modal="true" aria-labelledby="wn-title">
            <div class="export-sheet-head">
                <h3 id="wn-title"><span class="material-icons">${mode === 'welcome' ? 'waving_hand' : 'new_releases'}</span> ${helpEsc(title)}</h3>
                <button type="button" class="export-sheet-close" data-act="close" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <div class="wn-body">${body}</div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="close"><span class="material-icons">check</span> Понятно</button>
                <button type="button" class="btn-secondary" data-act="help"><span class="material-icons">help</span> Открыть «Помощь»</button>
            </div>
        </div>`;
    overlay.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        const act = e.target === overlay ? 'close' : (btn ? btn.dataset.act : '');
        if (act === 'close') { closeWhatsNew(); return; }
        if (act === 'help') { closeWhatsNew(); openHelp(); }
    });
    document.body.appendChild(overlay);
    const ok = overlay.querySelector('.btn-primary');
    if (ok) ok.focus();
}

function initWhatsNew() {
    const cur = window.APP_VERSION || '';
    if (!cur) return;
    const seen = helpGet(HELP_SEEN_VERSION_KEY);
    if (seen === cur) return;
    // Новый пользователь: нет ни отметки о версии, ни записей — приветствие вместо списка изменений
    let fresh = false;
    if (!seen) {
        try { fresh = !(typeof transactions !== 'undefined' && transactions.length) && !(JSON.parse(localStorage.getItem('finance_tx') || '[]') || []).length; } catch (e) {}
    }
    // Откат на старую версию — окно не нужно
    if (seen && helpCmpVer(cur, seen) < 0) { helpSet(HELP_SEEN_VERSION_KEY, cur); return; }
    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        if (tries > 900) { clearInterval(timer); return; } // ~15 минут на заставке — не ждём дальше
        if (!helpAppVisible() || document.querySelector('.export-sheet-overlay')) return;
        clearInterval(timer);
        helpSet(HELP_SEEN_VERSION_KEY, cur);
        setTimeout(() => showWhatsNew(fresh ? 'welcome' : 'update', seen || '0'), 600);
    }, 1000);
}

// ---------- Подсказки при первом нажатии ----------
// sel — кнопка (или то, что внутри неё); text — пояснение. Подсказка показывается после нажатия, кнопка срабатывает как обычно.
const HELP_TIPS = [
    { id: 'income', sel: '.btn-income', text: 'Доход: сумма из поля «Сумма» записывается как приход денег. Сначала введите сумму и выберите категорию.' },
    { id: 'expense', sel: '.btn-expense', text: 'Расход: сумма записывается как трата. Запись сразу появится в «Истории операций» ниже.' },
    { id: 'voice', sel: '#voice-btn', text: 'Голосовой ввод: скажите, например, «кофе 1500» — сумма, категория и комментарий заполнятся сами.' },
    { id: 'comment', sel: '#tx-comment-btn', text: 'Комментарий к записи — до 100 символов. Его видно в истории операций.' },
    { id: 'receipt', sel: '.receipt-cam-btn', text: 'Сфотографируйте чек или выберите фото — сумма и покупки распознаются сами. Способ распознавания — в Настройки → «Распознавание фото».' },
    { id: 'tx-edit', sel: '.tx-item .tx-actions button[onclick^="editTx"]', text: 'Изменить запись: данные попадут в форму «Новая запись», поправьте и нажмите «Сохранить изменения».' },
    { id: 'tx-del', sel: '.tx-item .tx-actions button[onclick^="deleteTx"]', text: 'Удалить запись. Приложение спросит подтверждение.' },
    { id: 'excel', sel: '.export-btn[onclick^="exportExcel"]', text: 'Excel: на ПК файл попадает в папку «Загрузки», на телефоне — в «Загрузки»/«Файлы» или открывается окно «Поделиться».' },
    { id: 'pdf', sel: '.export-btn[onclick^="exportPdf"]', text: 'PDF формата A4: все записи с итогами — удобно распечатать или отправить.' },
    { id: 'import', sel: '#import-drop', text: 'Загрузка своей таблицы Excel или CSV: приложение само найдёт столбцы с датой, суммой и категорией и покажет, что добавит.' },
    { id: 'backup', sel: '.export-btn[onclick^="exportBackup"]', text: 'Резервная копия всех данных одним файлом (.json). Восстановить — кнопкой «Загрузить файл» ниже.' },
    { id: 'sync', sel: '.fab-sync', text: 'Синхронизация: сохраняет данные в облаке (аккаунт My Money или Google Диск). Без входа в аккаунт откроет Настройки.' },
    { id: 'pin-wall', sel: '.foot-pin', text: '«На стену»: блок появится на «Стене» — своём экране из любимых блоков.' },
    { id: 'size', sel: '.foot-size', text: '«Масштаб»: маленький, средний или большой блок. В большом видно больше кнопок.' },
    { id: 'sub-add', sel: 'button[onclick^="addSub"]', text: 'Подписка будет списываться сама каждый месяц в указанный день.' },
    { id: 'nav-transactions', sel: 'nav button[data-tab="transactions"]', text: '«Записи»: новая запись, чек по фото и история операций.' },
    { id: 'nav-wall', sel: 'nav button[data-tab="wall"]', text: '«Стена»: ваш экран из блоков. Добавляются кнопкой «На стену» внизу любого блока.' },
    { id: 'nav-subscriptions', sel: 'nav button[data-tab="subscriptions"]', text: '«Подписки»: регулярные платежи, которые записываются сами.' },
    { id: 'nav-salary', sel: 'nav button[data-tab="salary"]', text: '«Зарплата»: внесите выплату — она запишется как доход.' },
    { id: 'nav-statistics', sel: 'nav button[data-tab="statistics"]', text: '«Статистика»: траты за сегодня, сводка за период и диаграммы.' },
    { id: 'nav-reports', sel: 'nav button[data-tab="reports"]', text: '«Отчёты»: таблица по периодам, скачать Excel и PDF, загрузить свою таблицу.' },
    { id: 'nav-wishlist', sel: 'nav button[data-tab="wishlist"]', text: '«Цели»: на что копите, и список покупок.' },
    { id: 'nav-quotes', sel: 'nav button[data-tab="quotes"]', text: '«Котировки»: курсы акций и валют.' },
    { id: 'nav-prices', sel: 'nav button[data-tab="prices"]', text: '«Цены»: как менялась цена товара по магазинам.' },
    { id: 'nav-settings', sel: 'nav button[data-tab="settings"]', text: '«Настройки». Самый верхний пункт — «Помощь» с инструкциями.' }
];

function tipsOff() { return helpGet(HELP_TIPS_OFF_KEY) === '1'; }
function tipsSeen() { try { return JSON.parse(helpGet(HELP_TIPS_SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }
function markTipSeen(id) { const s = tipsSeen(); s[id] = 1; helpSet(HELP_TIPS_SEEN_KEY, JSON.stringify(s)); }

function closeTip() {
    const t = document.getElementById('help-tip');
    if (t) t.remove();
}

function showTip(el, tip) {
    closeTip();
    const box = document.createElement('div');
    box.id = 'help-tip';
    box.className = 'help-tip';
    box.setAttribute('role', 'status');
    box.innerHTML = `<span class="material-icons help-tip-ic" aria-hidden="true">lightbulb</span>
        <div class="help-tip-text">${helpEsc(tip.text)}</div>
        <div class="help-tip-btns">
            <button type="button" data-act="ok">Понятно</button>
            <button type="button" data-act="off">Больше не показывать подсказки</button>
        </div><i class="help-tip-arrow" aria-hidden="true"></i>`;
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        e.stopPropagation();
        if (b.dataset.act === 'off') { helpSet(HELP_TIPS_OFF_KEY, '1'); renderHelpTipsState(); }
        closeTip();
    });
    document.body.appendChild(box);
    // Положение: под кнопкой (или над ней, если внизу экрана нет места), в пределах экрана
    const r = el.getBoundingClientRect();
    const bw = box.offsetWidth, bh = box.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const below = r.bottom + bh + 14 < vh || r.top < bh + 14;
    const left = Math.max(8, Math.min(vw - bw - 8, r.left + r.width / 2 - bw / 2));
    const top = below ? Math.min(vh - bh - 8, r.bottom + 10) : Math.max(8, r.top - bh - 10);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.classList.add(below ? 'is-below' : 'is-above');
    const arrow = box.querySelector('.help-tip-arrow');
    if (arrow) arrow.style.left = Math.max(12, Math.min(bw - 24, r.left + r.width / 2 - left - 6)) + 'px';
    clearTimeout(showTip._t);
    showTip._t = setTimeout(closeTip, 12000);
}

function initTips() {
    document.addEventListener('click', e => {
        if (e.target.closest('#help-tip')) return;
        if (tipsOff() || !helpAppVisible()) return;
        const seen = tipsSeen();
        for (const tip of HELP_TIPS) {
            if (seen[tip.id]) continue;
            const el = e.target.closest(tip.sel);
            if (!el) continue;
            markTipSeen(tip.id);
            // после того как кнопка сработала (могло открыться окно или смениться раздел)
            // если кнопка открыла окно (комментарий, выгрузка…), подсказка ждёт, пока его закроют — чтобы не закрывать собой окно
            let waited = 0;
            const tryShow = () => {
                if (document.querySelector('.export-sheet-overlay, .modal-overlay')) {
                    if ((waited += 400) < 120000) setTimeout(tryShow, 400);
                    return;
                }
                if (document.body.contains(el) && el.offsetParent !== null) showTip(el, tip);
            };
            setTimeout(tryShow, 350);
            return;
        }
        closeTip(); // нажатие в другом месте убирает подсказку
    }, true);
    window.addEventListener('resize', closeTip);
    document.addEventListener('scroll', closeTip, { passive: true, capture: true });
}

// ---------- Помощь ----------
// img — картинка в images/help (цифры-метки на ней = номера шагов); go — куда перейти кнопкой «Открыть»
const HELP_TOPICS = [
    { id: 'nav', icon: 'menu', title: 'Как перемещаться по приложению', img: 'nav',
      steps: ['На телефоне разделы — в нижнем меню, на ПК — в меню слева.',
          '«Записи» (1) — новая запись и история операций.',
          '«Стена» (2) — ваш экран из любимых блоков.',
          '«Настройки» (3) — все настройки, а в самом верху — эта «Помощь».',
          'Набор и порядок пунктов меню меняются в Настройки → «Пункты меню».'] },
    { id: 'record', icon: 'edit_note', title: 'Как сделать новую запись (доход или расход)', img: 'record', go: ['transactions', 'Открыть «Записи»'],
      steps: ['Откройте раздел «Записи».',
          'Введите сумму в поле «Сумма» (1). Рядом можно выбрать валюту — по умолчанию тенге.',
          'Выберите категорию картинкой (2). Если категорий нет — добавьте их в Настройки → «Категории».',
          'По желанию: нажмите «Комментарий» (3), чтобы добавить пояснение, или «Микрофон» (4), чтобы сказать запись голосом.',
          'Нажмите «Доход» (5) — если деньги пришли, или «Расход» (6) — если потратили.',
          'Запись появится в «Истории операций» ниже, баланс пересчитается сам.'],
      note: 'В большом размере блока («Масштаб» внизу блока) видны ещё поле даты и времени и цифровая клавиатура.' },
    { id: 'edit', icon: 'edit', title: 'Как изменить или удалить запись', img: 'history', go: ['transactions', 'Открыть «Записи»'],
      steps: ['Откройте «Записи» и найдите запись в «Истории операций».',
          'Карандаш (1) — изменить: данные попадут в форму «Новая запись». Поправьте и нажмите «Сохранить изменения».',
          'Корзина (2) — удалить. Приложение спросит подтверждение.'] },
    { id: 'receipt', icon: 'photo_camera', title: 'Как записать чек по фото', img: 'receipt', go: ['transactions', 'Открыть «Записи»'],
      steps: ['В «Записях» нажмите кнопку с фотоаппаратом (1) в блоке «Чек по фото».',
          'Сфотографируйте чек или выберите готовое фото из галереи.',
          'Проверьте найденную сумму и покупки и подтвердите запись.',
          'Способ распознавания (быстрый на устройстве или точный через ИИ) выбирается в Настройки → «Распознавание фото».'] },
    { id: 'voice', icon: 'mic', title: 'Как записать голосом',
      steps: ['В «Новой записи» нажмите кнопку с микрофоном.',
          'Скажите сумму и на что: например «такси 2500» или «зарплата 300 тысяч».',
          'Приложение заполнит сумму, категорию и комментарий — проверьте и нажмите «Доход» или «Расход».',
          'Голосовой помощник выбирается в Настройки → «Голосовой ввод». Браузер спросит разрешение на микрофон — нажмите «Разрешить».'] },
    { id: 'categories', icon: 'category', title: 'Как добавить категории и подкатегории', img: 'categories', go: ['settings:categories-card', 'Открыть «Категории»'],
      steps: ['Откройте Настройки → «Категории».',
          'Впишите название (1), в поле «Куда» (2) выберите: новый раздел или внутрь существующего — и нажмите «Добавить» (3).',
          '«+» у раздела — добавить подкатегорию, «Изменить» — поменять название или картинку, «Удалить» — убрать.',
          'Можно сразу набрать в поле «Категория» вида «Семья: Отец» — раздел и подкатегория создадутся сами.'] },
    { id: 'excel', icon: 'table_view', title: 'Как скачать Excel или PDF и где искать файл', img: 'export', go: ['reports', 'Открыть «Отчёты»'],
      steps: ['Откройте раздел «Отчёты» и найдите блок «Выгрузка».',
          'Нажмите «Скачать Excel (.xlsx)» (1) или «Скачать PDF (A4)» (2). В файле — все записи с итогами по дням и за всё время.',
          'Где файл: на компьютере — в папке «Загрузки» (Downloads); в браузере Chrome его видно и в меню ⋮ → «Скачанные файлы».',
          'На Android — в приложении «Файлы» → «Загрузки» или в уведомлении о скачивании.',
          'На iPhone откроется окно «Поделиться»: выберите «Сохранить в Файлы» и папку, либо сразу отправьте файл в мессенджер или почту.',
          'Если файл не сохраняется (например, в некоторых сборках APK), приложение покажет таблицу прямо на экране — нажмите «Скопировать таблицу» и вставьте её в Excel или Google Таблицы.'] },
    { id: 'import', icon: 'upload_file', title: 'Как загрузить свою таблицу Excel', img: 'import', go: ['reports', 'Открыть «Отчёты»'],
      steps: ['Откройте «Отчёты» → блок «Загрузить свою таблицу».',
          'Нажмите «Выбрать файл» (1) и выберите файл .xlsx или .csv — с телефона из «Файлов»/«Загрузок», с ПК можно просто перетащить файл в рамку.',
          'Приложение само найдёт столбцы с датой, суммой, категорией и типом и покажет, что будет добавлено.',
          'Подтвердите — записи появятся в истории. Повторы одной и той же записи не дублируются.'],
      note: 'Файл, скачанный кнопкой «Скачать Excel», тоже можно загрузить обратно.' },
    { id: 'backup', icon: 'save', title: 'Резервная копия и перенос на другое устройство', img: 'backup', go: ['settings:local-data-card', 'Открыть «Локальные данные»'],
      steps: ['Настройки → «Локальные данные» → «Локальная копия (JSON)» (1): все данные сохранятся одним файлом в «Загрузки».',
          'Чтобы восстановить, нажмите «Загрузить файл» (2) и выберите этот файл .json.',
          '«Сбросить всё» (3) удаляет все данные на этом устройстве — сначала сделайте копию!',
          'Проще всего переносить данные через аккаунт: войдите на обоих устройствах — всё синхронизируется само.'] },
    { id: 'account', icon: 'account_circle', title: 'Аккаунт и синхронизация между устройствами', img: 'account', go: ['settings:account-section', 'Открыть «Аккаунт»'],
      steps: ['Настройки → «Аккаунт My Money»: «Регистрация» (1) — впишите имя, почту и пароль; дальше — «Вход» с той же почтой.',
          'Или войдите через Google в блоке «Аккаунт Google»: данные будут храниться на вашем Google Диске.',
          'Данные синхронизируются сами: после каждой записи, раз в минуту и при открытии приложения.',
          'Круглая кнопка со стрелками внизу экрана — синхронизировать прямо сейчас.',
          'Забыли пароль — «Забыли пароль?» под формой входа: придёт письмо для смены пароля.'] },
    { id: 'wall', icon: 'dashboard', title: 'Стена и размер блоков', img: 'foot',
      steps: ['Внизу каждого блока есть кнопки «Масштаб» (1) и «На стену» (2).',
          '«Масштаб» — маленький, средний или большой блок: в большом видно больше кнопок и полей.',
          '«На стену» — блок появится в разделе «Стена». Так собирается свой главный экран.',
          'На «Стене» блоки двигаются и меняют размер; булавка в шапке блока убирает его со стены.'] },
    { id: 'subs', icon: 'autorenew', title: 'Подписки и зарплата', go: ['subscriptions', 'Открыть «Подписки»'],
      steps: ['«Подписки»: впишите название, сумму и день месяца и нажмите «Добавить» — платёж будет записываться сам каждый месяц.',
          '«Зарплата»: внесите сумму выплаты — она запишется как доход, а внизу видна история выплат.'] },
    { id: 'stats', icon: 'insights', title: 'Статистика, отчёты и лимит', go: ['statistics', 'Открыть «Статистику»'],
      steps: ['«Статистика»: сколько потрачено сегодня, сводка за период и диаграммы по категориям, дням и месяцам.',
          '«Отчёты»: таблица по дням, неделям или часам — переключатель над таблицей.',
          'Дневной лимит — Настройки → «Дневной лимит»: приложение покажет, сколько ещё можно потратить сегодня.'] },
    { id: 'goals', icon: 'star', title: 'Цели и список покупок', go: ['wishlist', 'Открыть «Цели»'],
      steps: ['«Цели» → «Новая приоритетная цель»: вставьте ссылку на товар или впишите название и сумму.',
          'Откладывайте деньги на цель сразу или регулярно — прогресс видно на карточке цели.',
          '«Список покупок»: впишите товар и нажмите «Добавить», купленное отмечайте галочкой.'] },
    { id: 'look', icon: 'palette', title: 'Темы, шрифты, экран приветствия', go: ['settings:theme-card', 'Открыть «Темы»'],
      steps: ['Настройки → «Темы оформления»: выберите папку и тему — вид меняется сразу. Там же «Шрифты» и «Иконка приложения».',
          'Можно сделать свою тему: изменить цвета любой готовой.',
          'Настройки → «Экран приветствия»: как было, своё приветствие с картинкой, или без экрана.',
          'Безопасность: Настройки → «Безопасность» — ПИН-код и вход по отпечатку.'] },
    { id: 'install', icon: 'install_mobile', title: 'Как установить приложение на телефон',
      steps: ['Android (Chrome): откройте сайт, нажмите ⋮ справа вверху → «Добавить на главный экран» или «Установить приложение».',
          'iPhone (Safari): нажмите «Поделиться» (квадрат со стрелкой) → «На экран „Домой“» → «Добавить».',
          'Компьютер (Chrome / Edge): значок установки справа в адресной строке → «Установить».',
          'Приложение откроется со своим значком и работает даже без интернета — изменения отправятся в облако позже.'] }
];

function helpGo(target) {
    if (!target) return;
    if (target.indexOf('settings:') === 0) {
        const id = target.slice(9);
        if (typeof openSettingsCard === 'function') openSettingsCard(id);
        return;
    }
    if (typeof showTab === 'function') showTab(target);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
}

function openHelp(topicId) {
    if (typeof openSettingsCard === 'function') openSettingsCard('help-card');
    else if (typeof showTab === 'function') showTab('settings');
    if (topicId) {
        const d = document.getElementById('help-t-' + topicId);
        if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
    }
}

function renderHelpTipsState() {
    const cb = document.getElementById('help-tips-on');
    if (cb) cb.checked = !tipsOff();
}

function renderHelp() {
    const box = document.getElementById('help-topics');
    if (!box) return;
    box.innerHTML = HELP_TOPICS.map(t => {
        const img = t.img ? `<img class="help-shot" src="images/help/${t.img}.webp" alt="Картинка из программы: ${helpEsc(t.title)}" loading="lazy" onclick="this.classList.toggle('is-zoom')">` : '';
        const go = t.go ? `<button type="button" class="btn-secondary help-go" onclick="helpGo('${t.go[0]}')"><span class="material-icons">open_in_new</span> ${helpEsc(t.go[1])}</button>` : '';
        return `<details class="help-topic" id="help-t-${t.id}">
            <summary><span class="material-icons">${t.icon}</span><span>${helpEsc(t.title)}</span></summary>
            <div class="help-topic-body">${img}
                <ol>${t.steps.map(s => `<li>${helpEsc(s)}</li>`).join('')}</ol>
                ${t.note ? `<p class="hint">${helpEsc(t.note)}</p>` : ''}${go}
            </div></details>`;
    }).join('');
    // открыт один раздел за раз — так проще читать на телефоне
    box.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
        if (d.open) box.querySelectorAll('details[open]').forEach(o => { if (o !== d) o.open = false; });
    }));
    renderHelpTipsState();
}

function helpSetTips(on) {
    helpSet(HELP_TIPS_OFF_KEY, on ? '' : '1');
    renderHelpTipsState();
}

function helpResetTips() {
    helpSet(HELP_TIPS_SEEN_KEY, '{}');
    helpSet(HELP_TIPS_OFF_KEY, '');
    renderHelpTipsState();
    if (typeof showToast === 'function') showToast('Подсказки снова появятся при первом нажатии на кнопки');
}

function initHelp() {
    renderHelp();
    initTips();
    initWhatsNew();
}
