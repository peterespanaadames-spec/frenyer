import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://knyqrwpaksawuxoqcayu.supabase.co';

/**
 * El navegador NUNCA recibe una credencial de Supabase.
 * Toda la comunicacion con la base de datos pasa por el servidor (/api/*),
 * que resuelve las claves, valida la sesion y aplica las RLS.
 *
 * El cliente de Supabase que se crea aqui es inerte: se conserva unicamente
 * porque algunos modulos lo usan para detectar capacidades, no para leer datos.
 */
export const hasBrowserSupabaseClient = false;

/** Estado informado por el servidor. Se actualiza con refreshSupabaseStatus(). */
export let isSupabaseConfigured = false;
export let SUPABASE_URL = DEFAULT_SUPABASE_URL;

export interface SupabaseServerStatus {
  supabaseConfigured: boolean;
  supabaseConnected: boolean;
  missingTables: string[];
  supabaseUrl: string;
  localAccessEnabled: boolean;
  credentialsSource: string;
}

export let supabaseServerStatus: SupabaseServerStatus = {
  supabaseConfigured: false,
  supabaseConnected: false,
  missingTables: [],
  supabaseUrl: '',
  localAccessEnabled: false,
  credentialsSource: 'desconocida'
};

function createInertSupabaseInstance(url: string): SupabaseClient {
  return createClient(url, 'sin-credencial-en-el-navegador', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export let supabase: SupabaseClient = createInertSupabaseInstance(SUPABASE_URL);

/**
 * Consulta al servidor el estado de la conexion con Supabase.
 * No devuelve claves: solo informacion de estado.
 */
export async function refreshSupabaseStatus(): Promise<SupabaseServerStatus> {
  try {
    const res = await fetch('/api/auth/mode', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.data as SupabaseServerStatus | undefined;
    if (!data) throw new Error('Respuesta sin estado');

    supabaseServerStatus = data;
    isSupabaseConfigured = Boolean(data.supabaseConfigured && data.supabaseConnected);
    SUPABASE_URL = data.supabaseUrl || DEFAULT_SUPABASE_URL;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('frenyer:supabase-status', { detail: supabaseServerStatus }));
    }

    return supabaseServerStatus;
  } catch {
    supabaseServerStatus = {
      supabaseConfigured: false,
      supabaseConnected: false,
      missingTables: [],
      supabaseUrl: '',
      localAccessEnabled: false,
      credentialsSource: 'sin conexion'
    };
    isSupabaseConfigured = false;
    return supabaseServerStatus;
  }
}

/** Verifica la conexion consultando al servidor (no se usa la clave del navegador). */
export const isSupabaseConnected = async (): Promise<boolean> => {
  const status = await refreshSupabaseStatus();
  return status.supabaseConnected;
};
