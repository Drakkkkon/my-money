// Service worker My Money: свежие файлы сайта из сети (автообновление), без интернета — из кэша.
// Внешние запросы (Google, курсы, погода, библиотеки) не перехватываются.
//
// Важно: запрос самой страницы (navigate) нельзя пересоздавать с параметрами — браузер выдаёт ошибку,
// и раньше из-за этого всегда открывалась старая копия index.html из кэша (в установленном приложении
// старая страница + новые скрипты ломали запуск). Теперь страница запрашивается по адресу.
const CACHE = 'my-money-v30';
const CORE = [
    './',
    'index.html',
    'css/style.css',
    'css/win95.css',
    'css/features.css',
    'css/aqua.css',
    'css/mono.css',
    'css/vista.css',
    'css/v38.css',
    'css/metro.css',
    'css/layout.css',
    'css/v4.css',
    'css/v41.css',
    'css/v43.css',
    'css/desk95.css',
    'css/v46.css',
    'css/android.css',
    'css/pages.css',
    'css/doom.css',
    'fonts/AmazDooMLeft.ttf',
    'js/android.js',
    'js/pages.js',
    'js/desk95-walls.js',
    'js/desk95-icons.js',
    'js/desk95.js',
    'js/desk95-menu.js',
    'js/desk95-desktop.js',
    'js/desk95-tools.js',
    'js/sizes.js',
    'js/admin.js',
    'js/voice.js',
    'js/voiceengines.js',
    'js/obcatalog.js',
    'js/wall.js',
    'js/i18n.js',
    'js/fonts.js',
    'js/icon.js',
    'js/lang/en.js',
    'js/lang/kk.js',
    'js/lang/fr.js',
    'js/lang/de.js',
    'css/custom.css',
    'js/extras.js',
    'js/importer.js',
    'js/layout.js',
    'js/emoji.js',
    'js/quotes.js',
    'js/goals.js',
    'js/receipt.js',
    'js/recognize.js',
    'js/currency.js',
    'js/shopping.js',
    'js/notify.js',
    'js/bank.js',
    'js/config.js',
    'js/sound.js',
    'js/soundpicker.js',
    'js/themes.js',
    'js/scrollbars.js',
    'js/cloud.js',
    'js/dialogs.js',
    'js/script.js',
    'manifest.webmanifest',
    'images/icon-192.png',
    'images/logo.png'
];

self.addEventListener('install', (event) => {
    // Каждый файл кэшируется отдельно: отсутствие одного (например, config.js) не ломает установку
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => Promise.all(CORE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    const isPage = req.mode === 'navigate';
    const network = isPage
        ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        : fetch(req, { cache: 'no-cache' });

    // Сначала сеть (с проверкой свежести у сервера), при ошибке — кэш
    event.respondWith(
        network
            .then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then(cache => cache.put(isPage ? req.url : req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(isPage ? req.url : req, { ignoreSearch: true })
                .then(hit => hit || (isPage ? caches.match('index.html') : null))
                .then(hit => hit || Response.error()))
    );
});

// Нажатие на уведомление (js/notify.js): открыть уже запущенное приложение или запустить его
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const win = list.find(c => c.url.startsWith(self.registration.scope));
            return win ? win.focus() : self.clients.openWindow('./');
        })
    );
});
