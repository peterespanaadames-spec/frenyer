/**
 * Peticion al servidor con la cookie de sesion httpOnly.
 * La credencial de Supabase nunca viaja en el navegador: el servidor la adjunta.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' });
}

