import { createClient } from '@supabase/supabase-js';

const REAL_SUPABASE_URL = 'https://knyqrwpaksawuxoqcayu.supabase.co';
const REAL_SUPABASE_ANON_KEY = 'sb_publishable_pZuReBOMK4oGLY7CDTjiSw_rrMKJFZK';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_URL =
  rawUrl && !rawUrl.toLowerCase().includes('your_') && rawUrl.startsWith('http')
    ? rawUrl
    : REAL_SUPABASE_URL;

const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_ANON_KEY =
  rawKey && !rawKey.toLowerCase().includes('your_') && rawKey.startsWith('sb_')
    ? rawKey
    : REAL_SUPABASE_ANON_KEY;

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
    return !error || error.code !== 'PGRST301';
  } catch {
    return false;
  }
};
