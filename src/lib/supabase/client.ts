import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function isValidSupabaseUrl(url?: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return (
    /^https?:\/\//i.test(clean) &&
    !clean.includes('your-project') &&
    !clean.includes('example.com')
  );
}

function isValidSupabaseKey(key?: string): boolean {
  if (!key) return false;
  const clean = key.trim().toLowerCase();
  return (
    clean.length > 20 &&
    !clean.includes('your-supabase') &&
    !clean.includes('configure-supabase')
  );
}

// 1. Check env vars first, then fallback to stored connection in browser
const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const storedUrl = typeof window !== 'undefined' ? (localStorage.getItem('frenyer_supabase_url') || '').trim() : '';
const storedKey = typeof window !== 'undefined' ? (localStorage.getItem('frenyer_supabase_anon_key') || '').trim() : '';

const initialUrl = isValidSupabaseUrl(envUrl)
  ? envUrl
  : isValidSupabaseUrl(storedUrl)
  ? storedUrl
  : envUrl || 'https://your-project.supabase.co';

const initialKey = isValidSupabaseKey(envKey)
  ? envKey
  : isValidSupabaseKey(storedKey)
  ? storedKey
  : envKey || 'configure-supabase-publishable-key';

export let isSupabaseConfigured = isValidSupabaseUrl(initialUrl) && isValidSupabaseKey(initialKey);
export let SUPABASE_URL = initialUrl;
export let SUPABASE_ANON_KEY = initialKey;

function createSupabaseInstance(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export let supabase: SupabaseClient = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Updates the client in runtime, persists to localStorage and dispatches a change event
 */
export function updateSupabaseClient(url: string, key: string): boolean {
  const cleanUrl = url.trim();
  const cleanKey = key.trim();

  if (!isValidSupabaseUrl(cleanUrl) || !isValidSupabaseKey(cleanKey)) {
    return false;
  }

  SUPABASE_URL = cleanUrl;
  SUPABASE_ANON_KEY = cleanKey;
  isSupabaseConfigured = true;

  if (typeof window !== 'undefined') {
    localStorage.setItem('frenyer_supabase_url', cleanUrl);
    localStorage.setItem('frenyer_supabase_anon_key', cleanKey);
  }

  supabase = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('frenyer:supabase-configured', {
      detail: { url: cleanUrl }
    }));
  }

  return true;
}

export const isSupabaseConnected = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);

    clearTimeout(timeoutId);
    return !error;
  } catch {
    return false;
  }
};
