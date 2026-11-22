import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // base relative : l'application fonctionne depuis n'importe quel dossier (GitHub Pages, disque…).
  base: './',
  server: { port: 5180 },
  // Le fichier unique Logique.html est versionné dans le dépôt : on n'y met jamais la configuration Supabase.
  define: mode === 'standalone'
    ? { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' }
    : {},
}));
