// --- 4.16.0: ПЕРЕКЛЮЧАТЕЛИ В СТИЛЕ iOS ---
// Везде, где выбор «да / нет», вместо галочки — переключатель-тумблер (зелёный — включено).
// Галочки, которые приложение рисует само (настройки шапки, уведомлений, распознавания, голоса, темы, импорта, подсказок),
// превращаются в тумблеры автоматически: функция upgradeSwitches следит за страницей (MutationObserver) и добавляет
// полю класс ios-switch, а подписи — sw-row (текст слева, тумблер справа). Вид — css/pages.css, раздел 19.
// Галочками остаются только списки, где отмечают пункты: покупки в «Списке покупок» и товары из чека.

const SWITCH_SEL = [
    'label.hdr-part > input[type="checkbox"]',
    'label.te-check > input[type="checkbox"]',
    'label.remind-opt > input[type="checkbox"]',
    'label.help-tips-toggle > input[type="checkbox"]',
    'input[type="checkbox"]#import-skip-dup',
    'input[type="checkbox"].ios-switch'
].join(', ');

function upgradeSwitches(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = scope.matches && scope.matches(SWITCH_SEL) ? [scope] : [];
    scope.querySelectorAll(SWITCH_SEL).forEach(el => list.push(el));
    list.forEach(input => {
        if (input.dataset.sw === '1') return;
        input.dataset.sw = '1';
        input.classList.add('ios-switch');
        input.setAttribute('role', 'switch');
        const label = input.closest('label');
        if (label) label.classList.add('sw-row');
    });
}

(function initSwitches() {
    const start = () => {
        upgradeSwitches(document);
        let queued = false;
        new MutationObserver(muts => {
            if (queued) return;
            if (!muts.some(m => m.addedNodes && m.addedNodes.length)) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; upgradeSwitches(document); });
        }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
