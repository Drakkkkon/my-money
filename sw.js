// Service worker My Money: свежие файлы сайта из сети (автообновление), без интернета — из кэша.
// Внешние запросы (Google, курсы, погода, библиотеки) не перехватываются.
//
// Важно: запрос самой страницы (navigate) нельзя пересоздавать с параметрами — браузер выдаёт ошибку,
// и раньше из-за этого всегда открывалась старая копия index.html из кэша (в установленном приложении
// старая страница + новые скрипты ломали запуск). Теперь страница запрашивается по адресу.
const CACHE = 'my-money-v8';
const CORE = [
    './',
    'index.html',
    'css/style.css',
    'css/win95.css',
    'css/features.css',
    'css/aqua.css',
    'css/mono.css',
    'css/vista.css',
    'css/custom.css',
    'js/extras.js',
    'js/importer.js',
    'js/config.js',
    'js/sound.js',
    'js/soundpicker.js',
    'js/themes.js',
    'js/scrollbars.js',
    'js/cloud.js',
    'js/oldbook.js',
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
