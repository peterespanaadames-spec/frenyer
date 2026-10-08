import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL || '';
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const isSupabaseConfigured =
  /^https?:\/\//i.test(configuredUrl) &&
  !configuredUrl.toLowerCase().includes('your-project') &&
  configuredKey.length > 20 &&
  !configuredKey.toLowerCase().includes('your-supabase');
export const SUPABASE_URL = isSupabaseConfigured ? configuredUrl : 'http://127.0.0.1:54321';
export const SUPABASE_ANON_KEY = isSupabaseConfigured
  ? configuredKey
  : 'configure-supabase-publishable-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const isSupabaseConnected = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('organizations').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
};
