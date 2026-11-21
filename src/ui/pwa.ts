// Application installable (PWA) : enregistrement du service worker, mise à jour, invite d'installation.
import { h } from './dom';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onPwaChange(fn: () => void): void {
  listeners.add(fn);
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

export function installState(): InstallState {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'available';
  if (isIos()) return 'ios';
  return 'unavailable';
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  if (choice.outcome === 'accepted') installed = true;
  deferred = null;
  notify();
}

/** Vrai quand un service worker contrôle la page : l'application marche alors sans réseau. */
export const offlineReady = () => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;

function showUpdateToast(reg: ServiceWorkerRegistration) {
  if (document.querySelector('.toast')) return;
  const toast = h('div', { class: 'toast', role: 'status' },
    h('span', null, 'Une nouvelle version est disponible.'),
    h('button', {
      type: 'button',
      class: 'btn btn-primary btn-small',
      onclick: () => {
        updating = true;
        reg.waiting?.postMessage('skipWaiting');
        toast.remove();
      },
    }, 'Mettre à jour'),
  );
  document.body.append(toast);
}

let updating = false;

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });

  // Le service worker n'existe que dans la version construite, servie en http(s) :
  // ni en développement, ni pour Logique.html ouvert depuis le disque.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Recharger seulement après un clic sur « Mettre à jour » (pas à la toute première installation).
    if (updating) location.reload();
    else notify();
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const watch = (w: ServiceWorker) => w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast(reg);
        if (w.state === 'activated') notify();
      });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast(reg);
      if (reg.installing) watch(reg.installing);
      reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg.installing); });
    } catch (e) {
      console.warn('Service worker non enregistré :', e);
    }
  };
  // initPwa est appelé après le chargement du contenu : la page est souvent déjà chargée.
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => { void register(); });
}
