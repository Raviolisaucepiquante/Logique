// Synchronisation de la progression avec Supabase (optionnelle).
//
// Principe : la progression vit d'abord dans le navigateur (hors ligne, sans compte).
// Quand on est connecté, chaque modification est envoyée quelques secondes plus tard ;
// si le réseau manque, on réessaie dès qu'il revient (et à chaque retour sur l'application).
// À chaque synchronisation : on lit la sauvegarde en ligne, on la FUSIONNE avec la progression
// locale (merge.ts), on garde le résultat des deux côtés. Rien n'est jamais écrasé.
//
// Configuration (jamais dans le dépôt) : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY,
// dans .env.local en local, et dans les secrets GitHub pour la version publiée. Voir docs/SUPABASE.md.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { mergeProgress, normalizeProgress, sameProgress } from './merge';
import { applySynced, deviceId, onSave, syncedPart } from './progress';

/**
 * Adresse du projet, réduite à son origine : on accepte aussi qu'on ait collé l'adresse de l'API
 * (« https://xxx.supabase.co/rest/v1/ ») ou une barre finale.
 */
export function projectOrigin(raw: string | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  try {
    return new URL(s).origin;
  } catch {
    return undefined;
  }
}

const URL_ = projectOrigin(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
const TABLE = 'progress';
const LAST_SYNC_KEY = 'logiquepe:last-sync';
const DEBOUNCE_MS = 2500;

export type SyncStatus =
  | { kind: 'unavailable'; reason: 'not-configured' | 'file' }
  | { kind: 'signed-out' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: string }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

let client: SupabaseClient | null = null;
let session: Session | null = null;
let status: SyncStatus = { kind: 'unavailable', reason: 'not-configured' };
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const statusListeners = new Set<() => void>();
const dataListeners = new Set<() => void>();

/** L'interface s'abonne pour afficher l'état (connecté, synchronisé, hors ligne…). */
export function onSyncChange(fn: () => void): void { statusListeners.add(fn); }
/** Prévenir quand la progression locale a été enrichie par celle d'un autre appareil. */
export function onRemoteData(fn: () => void): void { dataListeners.add(fn); }

function setStatus(s: SyncStatus) {
  status = s;
  statusListeners.forEach((fn) => fn());
}

export const syncStatus = () => status;
export const userEmail = () => session?.user.email ?? null;

/** Connexion Google activée dans le projet Supabase ? (null tant qu'on ne sait pas, par exemple hors ligne). */
let googleEnabled: boolean | null = null;
export const googleAvailable = () => googleEnabled !== false;

/** Lit les méthodes de connexion activées dans Supabase, pour ne proposer que celles qui marchent. */
async function loadProviders(): Promise<void> {
  if (!URL_ || !KEY || !navigator.onLine) return;
  try {
    const res = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
    if (!res.ok) return;
    const s = (await res.json()) as { external?: Record<string, boolean> };
    googleEnabled = !!s.external?.google;
    statusListeners.forEach((fn) => fn());
  } catch {
    /* hors ligne ou serveur injoignable : on laisse le bouton */
  }
}
export const lastSync = () => { try { return localStorage.getItem(LAST_SYNC_KEY); } catch { return null; } };

/** Adresse de retour après la connexion : la page actuelle, sans paramètres. */
const redirectUrl = () => location.origin + location.pathname;

/** Retire de l'adresse les paramètres laissés par la connexion (?code=…, ?error=…). */
function cleanUrl() {
  const url = new URL(location.href);
  if (['code', 'error', 'error_code', 'error_description'].some((p) => url.searchParams.has(p))) {
    history.replaceState(null, '', url.pathname + url.hash);
  }
}

export async function initSync(): Promise<void> {
  if (location.protocol === 'file:') return setStatus({ kind: 'unavailable', reason: 'file' });
  if (!URL_ || !KEY) return setStatus({ kind: 'unavailable', reason: 'not-configured' });

  // Chargé seulement quand la synchronisation est configurée : sans compte, l'app reste légère.
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(URL_, KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'logiquepe:auth' },
  });

  const urlError = new URL(location.href).searchParams.get('error_description');
  void loadProviders();
  const { data } = await client.auth.getSession();
  session = data.session;
  cleanUrl();

  client.auth.onAuthStateChange((event, s) => {
    session = s;
    if (!s) setStatus({ kind: 'signed-out' });
    else if (event === 'SIGNED_IN') void syncNow();
    else statusListeners.forEach((fn) => fn());
  });

  onSave(schedule);
  window.addEventListener('online', () => { void syncNow(); });
  window.addEventListener('offline', () => { if (session) setStatus({ kind: 'offline' }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });

  if (urlError) setStatus({ kind: 'error', message: `Connexion refusée : ${urlError}` });
  else if (session) void syncNow();
  else setStatus({ kind: 'signed-out' });
}

function schedule() {
  if (!session) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, DEBOUNCE_MS);
}

/** Lit la sauvegarde en ligne, fusionne avec la progression locale, enregistre le résultat des deux côtés. */
export async function syncNow(): Promise<void> {
  if (!client || !session) return;
  if (!navigator.onLine) return setStatus({ kind: 'offline' });
  if (running) { again = true; return; }
  running = true;
  setStatus({ kind: 'syncing' });
  try {
    const userId = session.user.id;
    const { data, error } = await client.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
    if (error) throw error;

    const local = syncedPart();
    const remote = data ? normalizeProgress((data as { data: unknown }).data, deviceId) : null;
    const merged = remote ? mergeProgress(local, remote) : local;

    if (!sameProgress(merged, local)) {
      applySynced(merged);
      dataListeners.forEach((fn) => fn());
    }
    if (!remote || !sameProgress(merged, remote)) {
      const { error: upErr } = await client.from(TABLE).upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() });
      if (upErr) throw upErr;
    }
    const at = new Date().toISOString();
    try { localStorage.setItem(LAST_SYNC_KEY, at); } catch { /* ignoré */ }
    setStatus({ kind: 'synced', at });
  } catch (e) {
    if (!navigator.onLine) setStatus({ kind: 'offline' });
    else setStatus({ kind: 'error', message: explain(e) });
  } finally {
    running = false;
    if (again) { again = false; void syncNow(); }
  }
}

function explain(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/relation .*progress.* does not exist|Could not find the table/i.test(msg)) {
    return 'la table « progress » n\'existe pas encore dans Supabase (voir le guide, étape SQL).';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'serveur injoignable, nouvel essai plus tard.';
  return msg;
}

export async function signInWithGoogle(): Promise<void> {
  if (!client) return;
  if (!navigator.onLine) return setStatus({ kind: 'error', message: 'pas de connexion internet pour se connecter.' });
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  if (error) setStatus({ kind: 'error', message: error.message });
}

/** Envoie un lien de connexion par e-mail. Renvoie un message d'erreur, ou null si l'envoi a réussi. */
export async function signInWithEmail(email: string): Promise<string | null> {
  if (!client) return 'Synchronisation non configurée.';
  if (!navigator.onLine) return 'Pas de connexion internet : la connexion au compte demande le réseau (l\'application, elle, marche hors ligne).';
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } });
  if (!error) return null;
  if (/rate limit/i.test(error.message)) return 'Trop d\'e-mails envoyés récemment : réessaie dans une heure, ou utilise Google.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) return 'Serveur de connexion injoignable. Vérifie ta connexion internet et réessaie.';
  return error.message;
}

/** Déconnexion : la progression reste sur cet appareil. */
export async function signOut(): Promise<void> {
  if (!client) return;
  await client.auth.signOut();
  session = null;
  setStatus({ kind: 'signed-out' });
}
