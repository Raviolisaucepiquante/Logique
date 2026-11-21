import { defineConfig } from 'vite';

// base relative : l'application fonctionne depuis n'importe quel dossier une fois construite.
export default defineConfig({
  base: './',
  server: { port: 5180 },
});
