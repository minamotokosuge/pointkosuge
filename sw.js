/**
 * sw.js
 * Service Worker for "Kosuge Villager Point Card" PWA.
 * Handles caching for offline access.
 */

const CACHE_NAME = 'kosuge-point-v1';
const urlsToCache = [
    './',
    'index.html',
    'app.js',
    'manifest.json',
    'sw.js',
    // Add ZXing library if hosted locally
    // e.g., 'path/to/zxing/library/umd/index.min.js',
    // Example for icons (create these in an 'icons' folder)
    'icons/icon-192x192.png',
    'icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // No cache hit - fetch from network
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
