import { supabase } from './client';

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`No se pudo validar la sesión: ${error.message}`);
  }
  if (!data.session) {
    throw new Error('Inicie sesión para realizar esta operación.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);

  return fetch(input, { ...init, headers });
}
