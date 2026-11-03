// --- ОБЩИЕ ДИАЛОГИ: комментарий к записи и разворачивание блока на весь экран ---
// (раньше жили в js/oldbook.js; сам Oldbook вынесен в отдельное приложение Oldbook95)

const COMMENT_MAX = 100;

// ---------- Комментарий (до 100 символов) ----------
// prefix: 'tx' — форма «Записи». Текст хранится в скрытом поле `${prefix}-comment`.
function getFormComment(prefix) {
    const el = document.getElementById(prefix + '-comment');
    return el ? el.value.trim().slice(0, COMMENT_MAX) : '';
}

function setFormComment(prefix, text) {
    const el = document.getElementById(prefix + '-comment');
    if (el) el.value = String(text || '').slice(0, COMMENT_MAX);
    const btn = document.getElementById(prefix + '-comment-btn');
    if (!btn) return;
    const label = btn.querySelector('.comment-btn-text');
    const value = el ? el.value : '';
    btn.classList.toggle('has-comment', !!value);
    if (prefix === 'tx') btn.title = value ? 'Комментарий: ' + value : 'Комментарий';
    if (label) label.textContent = value ? '«' + value + '»' : 'Комментарий';
}

function openCommentDialog(prefix) {
    closeCommentDialog(false);
    const current = getFormComment(prefix);
    const overlay = document.createElement('div');
    overlay.id = 'comment-dialog';
    overlay.className = 'export-sheet-overlay comment-dialog-overlay';
    overlay.innerHTML = `
        <div class="export-sheet comment-dialog" role="dialog" aria-modal="true" aria-label="Комментарий">
            <div class="export-sheet-head">
                <h3>Комментарий к записи</h3>
                <button type="button" class="export-sheet-close" data-act="cancel" aria-label="Закрыть"><span class="material-icons">close</span></button>
            </div>
            <textarea id="comment-text" class="comment-text" maxlength="${COMMENT_MAX}" rows="3" placeholder="Например: подарок маме на день рождения">${escapeHtml(current)}</textarea>
            <div class="comment-counter"><span id="comment-count">${current.length}</span> / ${COMMENT_MAX}</div>
            <div class="export-sheet-actions">
                <button type="button" class="btn-primary" data-act="ok"><span class="material-icons">check</span> ОК</button>
                <button type="button" class="btn-secondary" data-act="clear"><span class="material-icons">backspace</span> Очистить</button>
                <button type="button" class="btn-secondary" data-act="cancel">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const area = overlay.querySelector('#comment-text');
    const count = overlay.querySelector('#comment-count');
    area.addEventListener('input', () => {
        if (area.value.length > COMMENT_MAX) area.value = area.value.slice(0, COMMENT_MAX);
        count.textContent = area.value.length;
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeCommentDialog(true); return; }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'ok') {
            setFormComment(prefix, area.value.replace(/\s+/g, ' ').trim());
            closeCommentDialog(true);
        } else if (btn.dataset.act === 'clear') {
            area.value = '';
            count.textContent = '0';
            area.focus();
        } else {
            closeCommentDialog(true);
        }
    });
    if (typeof playSound === 'function') playSound('open');
    setTimeout(() => area.focus(), 50);
}

function closeCommentDialog(withSound) {
    const el = document.getElementById('comment-dialog');
    if (!el) return;
    el.remove();
    if (withSound && typeof playSound === 'function') playSound('close');
}

// ---------- Разворачивание окна на весь экран (кнопка □ в заголовке) ----------
function toggleMaximize(btn) {
    const card = btn.closest('.card');
    if (!card) return;
    const maximized = !card.classList.contains('is-maximized');
    card.classList.toggle('is-maximized', maximized);
    document.body.classList.toggle('has-maximized', maximized);
    btn.setAttribute('aria-label', maximized ? 'Восстановить размер' : 'Развернуть на весь экран');
    btn.title = maximized ? 'Восстановить' : 'Развернуть';
    if (typeof playSound === 'function') playSound(maximized ? 'open' : 'close');
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const max = document.querySelector('.card.is-maximized .w95-ctl-max');
    if (max) { toggleMaximize(max); return; }
    if (document.getElementById('comment-dialog')) closeCommentDialog(true);
});
