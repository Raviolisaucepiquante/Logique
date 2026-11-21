// Écrit dist/sw.js : le service worker qui met toute l'application en cache pour le hors-ligne.
// La liste des fichiers et le numéro de version sont calculés à partir du contenu de dist/ :
// chaque nouvelle construction crée un nouveau cache, et les anciens sont supprimés.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist)
  .map((p) => relative(dist, p).split(sep).join('/'))
  .filter((f) => f !== 'sw.js')
  .sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const urls = ['./', ...files.map((f) => `./${f}`)];

const sw = `// Généré par scripts/build-sw.mjs — ne pas modifier à la main.
const CACHE = 'logique-${version}';
const FILES = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('logique-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La page demande d'activer tout de suite une nouvelle version (bouton « Mettre à jour »).
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Navigation : toujours la page de l'application (les routes sont dans le #).
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  // Fichiers : d'abord le cache (hors ligne), sinon le réseau, puis on garde une copie.
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  })));
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`sw.js écrit : version ${version}, ${urls.length} fichiers en cache.`);
