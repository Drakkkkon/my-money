// ОБРАЗЕЦ файла настроек. Сам файл настроек — js/config.js — в архивах обновлений больше НЕ приходит,
// чтобы обновления не затирали ваши ключи. Если js/config.js на GitHub пропал или испорчен:
// создайте его (Add file → Create new file → имя js/config.js), вставьте этот текст и впишите свои значения.
//
// googleClientId — «OAuth Client ID» (тип «Веб-приложение») из Google Cloud → Google Auth Platform → Clients.
//   Пример: '123456789012-abcdefg1234567.apps.googleusercontent.com'
//
// adminLogUrl — необязательно: адрес сервера журнала и администратора (ADMIN_SETUP_RU.txt): 'https://script.google.com/macros/s/.../exec'
// ocrKeys — необязательно: ключи распознавания фото { gemini: '...', claude: '...', openai: '...', gvision: '...', ocrspace: '...' }.
//   Проще вписать их на устройстве: Настройки → «Распознавание фото» (там они хранятся только на этом устройстве).
//
// Правила: каждое значение в одинарных кавычках '...', после каждой строки, кроме последней, — запятая.
window.MONEY_CONFIG = {
    googleClientId: 'ВСТАВЬТЕ_СЮДА_CLIENT_ID.apps.googleusercontent.com',
    adminLogUrl: ''
};
