// Fabrique Logique.html : un seul fichier, qui s'ouvre d'un double-clic, sans serveur.
// JS, CSS et contenu (public/content/) y sont intégrés. À relancer après chaque modification :
//   npm run standalone
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const contentDir = join(root, 'public', 'content');

// Contenu : index + tous les chapitres déclarés.
const index = JSON.parse(readFileSync(join(contentDir, 'index.json'), 'utf8'));
const chapters = {};
for (const mod of index.modules) {
  for (const file of mod.chapters) {
    chapters[`${mod.id}/${file}`] = JSON.parse(readFileSync(join(contentDir, mod.id, `${file}.json`), 'utf8'));
  }
}

// Empêche une chaîne « </script> » de fermer la balise.
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
// Le fichier unique ne s'installe pas (pas de serveur) : on retire manifeste et icônes externes,
// et on intègre la petite icône d'onglet.
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/href="[^"]*favicon-32\.png"/, () => `href="data:image/png;base64,${readFileSync(join(dist, 'icons', 'favicon-32.png')).toString('base64')}"`);
const assets = readdirSync(join(dist, 'assets'));

for (const css of assets.filter((f) => f.endsWith('.css'))) {
  const code = readFileSync(join(dist, 'assets', css), 'utf8');
  html = html.replace(new RegExp(`<link[^>]+href="[^"]*${css}"[^>]*>`), () => `<style>${code}</style>`);
}

const data = `<script>window.__LOGIQUE_CONTENT__ = ${safe(JSON.stringify({ index, chapters }))};</script>`;
// Seul le script d'entrée (référencé par index.html) est intégré. Les morceaux chargés à la demande
// (client Supabase) ne servent pas dans le fichier unique : la synchronisation y est désactivée.
const entries = assets.filter((f) => f.endsWith('.js') && html.includes(f));
for (const js of entries) {
  const code = readFileSync(join(dist, 'assets', js), 'utf8');
  html = html.replace(new RegExp(`<script[^>]+src="[^"]*${js}"[^>]*></script>`), () => '');
  // Le script principal va en fin de <body> : le conteneur #app existe alors déjà.
  html = html.replace('</body>', () => `${data}\n<script type="module">${safe(code)}</script>\n</body>`);
}
html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');

// Garde-fou : ce fichier est versionné, il ne doit contenir aucune configuration Supabase.
if (/[a-z0-9]{20}\.supabase\.co|eyJhbGciOi|sb_publishable_|sb_secret_/.test(html)) {
  throw new Error('Logique.html contiendrait une adresse ou une clé Supabase : construction annulée.');
}

if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) {
  throw new Error('Une ressource n\'a pas été intégrée');
}

const out = join(root, 'Logique.html');
writeFileSync(out, html);
console.log(`Logique.html écrit (${Math.round(html.length / 1024)} Ko, ${Object.keys(chapters).length} chapitres).`);
