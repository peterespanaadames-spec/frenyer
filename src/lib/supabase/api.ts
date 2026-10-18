import { supabase } from './client';

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers });
}

