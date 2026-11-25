import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'node:https';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const PORT = 3000;

/**
 * Carpeta de respaldo local.
 * En Vercel el disco del proyecto es de solo lectura: se usa /tmp (efímero)
 * y la fuente de verdad pasa a ser Supabase vía variables de entorno.
 */
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'frenyer-data')
  : path.resolve(process.cwd(), 'data');
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  console.warn('No se pudo preparar la carpeta de datos locales:', err);
}

/** Resuelve las rutas del respaldo local respetando DATA_DIR. */
function dataPath(...parts: Array<string>): string {
  return path.resolve(DATA_DIR, ...parts);
}

// Helper to determine if a value is a valid Supabase URL / Key
function isRealSupabaseUrl(url?: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return (
    /^https?:\/\//i.test(clean) &&
    !clean.includes('your-project') &&
    !clean.includes('example.com')
  );
}

function isRealSupabaseKey(key?: string): boolean {
  if (!key) return false;
  const clean = key.trim().toLowerCase();
  return (
    clean.length > 20 &&
    !clean.includes('your-supabase') &&
    !clean.includes('configure_supabase') &&
    !clean.includes('configure-supabase')
  );
}

// Read local .env.local if present
function readEnvDotFile(fileName: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return {};
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        result[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// Sustituye a loadEnv (evita depender de vite en producción/serverless)
const loadedEnv = {
  ...readEnvDotFile('.env'),
  ...readEnvDotFile('.env.local'),
  ...readEnvDotFile('.env.development'),
  ...readEnvDotFile('.env.production')
};
const localEnvFile = readEnvDotFile('.env.local');

const DEFAULT_SUPABASE_URL = 'https://knyqrwpaksawuxoqcayu.supabase.co';

/**
 * Credenciales de Supabase resueltas SOLO en el servidor.
 * Nunca se envian al navegador: el cliente consulta el estado via /api/supabase/status.
 */
interface SupabaseCredentials {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

function readCredentialsFile(): Partial<SupabaseCredentials> | null {
  const filePath = path.resolve(DATA_DIR, 'supabase-credentials.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      url: String(raw.url || '').trim(),
      anonKey: String(raw.anonKey || raw.anon_key || '').trim(),
      serviceRoleKey: String(raw.serviceRoleKey || raw.service_role_key || '').trim()
    };
  } catch (err) {
    console.warn('No se pudo leer data/supabase-credentials.json:', err);
    return null;
  }
}

const credentialsFile = readCredentialsFile();

function pickFirstRealUrl(candidates: Array<string | undefined>, fallback: string): { value: string; source: string } {
  const labels = [
    'data/supabase-credentials.json',
    'variable de entorno',
    '.env.local',
    'archivo .env',
    'variable de entorno',
    '.env.local',
    'configuracion heredada VITE_'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (isRealSupabaseUrl(candidates[i])) {
      return { value: candidates[i]!.trim(), source: labels[i] || 'servidor' };
    }
  }
  return { value: fallback, source: 'valor por defecto' };
}

function pickFirstRealKey(candidates: Array<string | undefined>): { value: string; source: string } {
  const labels = [
    'data/supabase-credentials.json',
    'variable de entorno',
    '.env.local',
    'archivo .env',
    'variable de entorno',
    '.env.local',
    'configuracion heredada VITE_'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (isRealSupabaseKey(candidates[i])) {
      return { value: candidates[i]!.trim(), source: labels[i] || 'servidor' };
    }
  }
  return { value: '', source: 'no configurada' };
}

const resolvedUrl = pickFirstRealUrl(
  [
    credentialsFile?.url,
    process.env.SUPABASE_URL,
    localEnvFile.SUPABASE_URL,
    loadedEnv.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    localEnvFile.VITE_SUPABASE_URL,
    loadedEnv.VITE_SUPABASE_URL
  ],
  DEFAULT_SUPABASE_URL
);

const resolvedKey = pickFirstRealKey([
  credentialsFile?.anonKey,
  process.env.SUPABASE_ANON_KEY,
  localEnvFile.SUPABASE_ANON_KEY,
  loadedEnv.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY,
  localEnvFile.VITE_SUPABASE_ANON_KEY,
  loadedEnv.VITE_SUPABASE_ANON_KEY
]);

const resolvedServiceRoleKey = pickFirstRealKey([
  credentialsFile?.serviceRoleKey,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  localEnvFile.SUPABASE_SERVICE_ROLE_KEY,
  loadedEnv.SUPABASE_SERVICE_ROLE_KEY
]);

let SUPABASE_URL = resolvedUrl.value;
let SUPABASE_ANON_KEY = resolvedKey.value;
const SUPABASE_SERVICE_ROLE_KEY = resolvedServiceRoleKey.value;
const SUPABASE_CREDENTIALS_SOURCE = resolvedKey.source;

let isSupabaseConfigured = isRealSupabaseUrl(SUPABASE_URL) && isRealSupabaseKey(SUPABASE_ANON_KEY);
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';
// El servidor es el unico que habla con la base: usa la clave de servicio
// (bypassa RLS). La anon queda solo para el flujo de autenticacion.
let supabaseServer = createClient(
  SUPABASE_URL || DEFAULT_SUPABASE_URL,
  isSupabaseConfigured
    ? (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
    : FALLBACK_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Cliente administrativo: solo para operaciones puntuales de Supabase Auth.
// Nunca se usa para consultas de negocio, de modo que no se bypassan las RLS.
function getSupabaseAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ---------------------------------------------------------------------------
// RATE LIMITER EN MEMORIA (sin dependencias externas)
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Cancela el contador de un limite (por ejemplo tras un login exitoso). */
function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'desconocido';
}

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore) {
      if (v.resetAt <= now && v.blockedUntil <= now) rateLimitStore.delete(k);
    }
  }

  const entry = rateLimitStore.get(key);
  if (!entry || (entry.resetAt <= now && entry.blockedUntil <= now)) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs, blockedUntil: 0 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  entry.count += 1;
  if (entry.count > limit) {
    const penalty = Math.min((entry.count - limit) * 30_000, 15 * 60_000);
    entry.blockedUntil = now + penalty;
    return { allowed: false, retryAfterSeconds: Math.ceil(penalty / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// SESIONES: COOKIES HTTPONLY + MODO LOCAL CON CLAVE DE ACCESO
// ---------------------------------------------------------------------------
const SESSION_COOKIE = 'frenyer_session';
const REFRESH_COOKIE = 'frenyer_refresh';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas
const LOCAL_TOKEN_PREFIX = 'local';

function isHttpsRequest(req?: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (!req) return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const origin = String(req.headers.origin || '').trim().toLowerCase();
  const referer = String(req.headers.referer || '').trim().toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const forwarded = String(req.headers.forwarded || '').toLowerCase();
  return (
    Boolean(req.secure) ||
    proto === 'https' ||
    forwarded.includes('proto=https') ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    host.includes('.run.app')
  );
}

function shouldUseCrossSiteCookie(req?: Request): boolean {
  if (!req) return false;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return (
    host.includes('.run.app') ||
    secFetchDest === 'iframe' ||
    secFetchSite === 'cross-site' ||
    process.env.NODE_ENV !== 'production'
  );
}

function getSessionCookieOptions(req?: Request) {
  const secure = isHttpsRequest(req);
  if (secure && shouldUseCrossSiteCookie(req)) {
    return {
      httpOnly: true,
      sameSite: 'none' as const,
      secure: true,
      partitioned: true,
      path: '/'
    };
  }
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/'
  };
}

// Cookies de SESIÓN (sin Max-Age): el navegador las elimina al cerrarse,
// por lo que reabrir el navegador siempre exige iniciar sesión de nuevo.
function setSessionCookie(res: Response, name: string, value: string, req?: Request): void {
  res.cookie(name, value, getSessionCookieOptions(req));
}

function clearSessionCookie(res: Response, name: string, req?: Request): void {
  res.clearCookie(name, { httpOnly: true, sameSite: 'strict', path: '/' });
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.clearCookie(name, getSessionCookieOptions(req));
}

function readCookie(req: Request, name: string): string {
  const header = req.headers.cookie;
  if (!header) return '';
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

/** Secreto de firma de sesiones locales: variable de entorno o archivo local persistido. */
function resolveSessionSecret(): string {
  const fromEnv =
    process.env.FRENYER_SESSION_SECRET ||
    localEnvFile.FRENYER_SESSION_SECRET ||
    loadedEnv.FRENYER_SESSION_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) return fromEnv.trim();

  const secretPath = path.resolve(DATA_DIR, '.session-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const stored = fs.readFileSync(secretPath, 'utf-8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, generated, 'utf-8');
    return generated;
  } catch {
    return crypto.randomBytes(48).toString('hex');
  }
}

const SESSION_SECRET = resolveSessionSecret();

function resolveAccessKey(): string {
  const raw =
    process.env.FRENYER_ACCESS_KEY ||
    localEnvFile.FRENYER_ACCESS_KEY ||
    loadedEnv.FRENYER_ACCESS_KEY ||
    '';
  return raw.trim();
}

const ACCESS_KEY = resolveAccessKey();

interface LocalSessionPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string;
  exp: number;
  jti?: string;
}

const activeLocalSessionBySub = new Map<string, string>();

interface OpaqueSessionEntry {
  token: string;
  refreshToken?: string;
  userId: string;
  isLocal: boolean;
  expiresAt: number;
}

const opaqueSessions = new Map<string, OpaqueSessionEntry>();

function pruneExpiredOpaqueSessions(): void {
  if (opaqueSessions.size <= 500) return;
  const now = Date.now();
  for (const [sid, entry] of opaqueSessions.entries()) {
    if (entry.expiresAt <= now) {
      opaqueSessions.delete(sid);
    }
  }
}

function issueOpaqueSession(
  token: string,
  userId: string,
  refreshToken?: string,
  isLocal: boolean = false
): string {
  pruneExpiredOpaqueSessions();
  const sid = `sid_${crypto.randomBytes(32).toString('base64url')}`;
  opaqueSessions.set(sid, {
    token,
    refreshToken,
    userId,
    isLocal,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS
  });
  return sid;
}

function findOrIssueOpaqueSession(
  token: string,
  userId: string,
  refreshToken?: string,
  isLocal: boolean = false
): string {
  const now = Date.now();
  for (const [sid, entry] of opaqueSessions.entries()) {
    if (entry.token === token && entry.expiresAt > now) {
      if (refreshToken && !entry.refreshToken) {
        entry.refreshToken = refreshToken;
      }
      return sid;
    }
  }
  return issueOpaqueSession(token, userId, refreshToken, isLocal);
}

function readOpaqueSessionHeader(req: Request): string {
  return String(req.header('x-frenyer-session') || '').trim();
}

function purgeOpaqueSessionsByToken(token: string): void {
  for (const [sid, entry] of opaqueSessions.entries()) {
    if (entry.token === token) {
      opaqueSessions.delete(sid);
    }
  }
}

function purgeOpaqueSessionsByUser(userId: string): void {
  if (!userId) return;
  for (const [sid, entry] of opaqueSessions.entries()) {
    if (entry.userId === userId) {
      opaqueSessions.delete(sid);
    }
  }
}

function signLocalSession(payload: LocalSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${LOCAL_TOKEN_PREFIX}.${body}.${signature}`;
}

function verifyLocalSessionToken(token: string): LocalSessionPayload | null {
  if (!token || !token.startsWith(`${LOCAL_TOKEN_PREFIX}.`)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const body = parts[1];
  const signature = parts[2];
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');

  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(givenBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as LocalSessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (payload.jti && activeLocalSessionBySub.has(payload.sub) && activeLocalSessionBySub.get(payload.sub) !== payload.jti) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Comparacion en tiempo constante para no filtrar informacion por temporizacion. */
function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Se compara contra algo del mismo largo para no filtrar la longitud real.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function logAuthEvent(event: string, ip: string, detail: string): void {
  const line = `${new Date().toISOString()} [${event}] ip=${ip} ${detail}\n`;
  console.log(`[AUTH] ${event} ip=${ip} ${detail}`);
  try {
    const logPath = path.resolve(DATA_DIR, 'auth-audit.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch {
    // La auditoria nunca debe impedir el flujo de autenticacion.
  }
}


interface SupabaseRequestContext {
  accessToken: string;
  organizationId: string;
  role: string;
  userEmail?: string;
  userId?: string;
  isLocalSession?: boolean;
}

type AuthenticatedResponse = Response & {
  locals: Response['locals'] & { supabaseContext?: SupabaseRequestContext };
};

const tenantScopedTables = new Set([
  'products',
  'customers',
  'sales',
  'bank_accounts',
  'accounts_receivable',
  'exchange_rates',
  'bank_movements',
  'payment_methods',
  'suppliers',
  'accounts_payable',
  'purchases',
  'purchase_items',
  'branches',
  'expenses',
  'expense_categories',
  'expense_payments',
  'inventory_movements'
]);

// ---------------------------------------------------------------------------
// RBAC EN SERVIDOR (capa 2: despues de validar la sesion)
// Sesión valida NO es sinonimo de personal: un comprador con su cookie no
// puede leer bancos, gastos, proveedores ni respaldos aunque su token sea
// auténtico. El portal del comprador mantiene rutas propias.
// ---------------------------------------------------------------------------
/** Rutas que exigen sesión (independiente del rol) y se montan de una vez. */
const authRequiredPrefixes = [
  '/api/bcv/rates/manual',
  '/api/exchange-rates/history',
  '/api/reports/process-transactions',
  '/api/customers',
  '/api/bank-accounts',
  '/api/payment-methods',
  '/api/bank-movements',
  '/api/bank-transfers',
  '/api/suppliers',
  '/api/quotes',
  '/api/sales',
  '/api/accounts-receivable',
  '/api/accounts-payable',
  '/api/purchases',
  '/api/branches',
  '/api/expenses',
  '/api/expense-categories',
  '/api/customer',
  '/api/business-profile',
  '/api/users',
  '/api/backup',
  '/api/dashboard'
];

/**
 * Clasificación "solo personal": la lista de montaje MÁS las rutas con
 * montaje propio (pedidos en GET/PUT/DELETE e inventario), que por su
 * naturaleza no pueden ser consultadas por un comprador.
 */
const staffRestrictedPrefixes = [
  ...authRequiredPrefixes,
  '/api/orders',
  '/api/inventory-movements'
];

/** Excepciones: recursos de la lista que el comprador SI consulta con su sesión. */
const clienteReadableApi: Array<{ prefix: string; methods: string[] }> = [
  // El portal del comprador (pedidos/compras/deseos/perfil) es suyo.
  { prefix: '/api/customer', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
  // La tienda lee la marca (nombre/logo/RIF) para banners y comprobantes.
  { prefix: '/api/business-profile', methods: ['GET'] }
];

/** Rutas reservadas a la familia administrativa (Configuración y respaldos). */
const adminOnlyPrefixes = new Set(['/api/users', '/api/backup']);
const adminFamilyRoles = new Set(['admin', 'administrador', 'superadmin', 'propietario', 'gerente', 'director']);

function isStaffOnlyApiPath(originalPath: string, method: string): boolean {
  const pathOnly = originalPath.split('?')[0] || originalPath;
  for (const prefix of staffRestrictedPrefixes) {
    if (!pathOnly.startsWith(`${prefix}/`) && pathOnly !== prefix && !pathOnly.startsWith(`${prefix}?`)) continue;
    const readable = clienteReadableApi.find((entry) => pathOnly === entry.prefix || pathOnly.startsWith(`${entry.prefix}/`));
    if (readable && readable.methods.map((m) => m.toUpperCase()).includes(method.toUpperCase())) return false;
    return true;
  }
  return false;
}

function isAdminOnlyApiPath(originalPath: string): boolean {
  const pathOnly = originalPath.split('?')[0] || originalPath;
  for (const prefix of adminOnlyPrefixes) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`) || pathOnly.startsWith(`${prefix}?`)) return true;
  }
  return false;
}

/** Lee el token de sesion desde la cookie httpOnly, Authorization o el identificador opaco X-Frenyer-Session. */
function readSessionToken(req: Request): string {
  const fromCookie = readCookie(req, SESSION_COOKIE);
  if (fromCookie) return fromCookie;
  const match = (req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const sid = readOpaqueSessionHeader(req);
  if (sid) {
    const entry = opaqueSessions.get(sid);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.token;
    }
    if (entry) opaqueSessions.delete(sid);
  }
  return '';
}

/** Resuelve el usuario y su membresia de organizacion a partir de un token de Supabase. */
async function resolveSessionUser(accessToken: string): Promise<{
  user: any;
  role: string;
  organizationId: string;
  name?: string;
  permissions?: string[];
  active?: boolean;
} | null> {
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(accessToken);
  if (userError || !userData?.user) return null;

  const email = (userData.user.email || '').trim().toLowerCase();
  const internalAdminEmails = ['sharkvenimport@gmail.com', 'fotocopiasfyp@gmail.com'];
  const isInternalAdminEmail = internalAdminEmails.includes(email);

  // Consultar perfil y membresía en paralelo (ahorra 1 viaje secuencial a Supabase).
  const [profileQueryResult, membershipQueryResult] = await Promise.all([
    Promise.resolve(
      supabaseServer
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle()
    ).catch((err) => {
      console.warn('Aviso consultando profile en resolveSessionUser:', err);
      return { data: null };
    }),
    Promise.resolve(
      supabaseServer
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    ).catch((err) => {
      console.warn('Aviso consultando organization_members en resolveSessionUser:', err);
      return { data: null };
    })
  ]);

  const profileRow = (profileQueryResult as any)?.data || null;
  const membership = (membershipQueryResult as any)?.data || null;
  const profileRole: string | undefined = profileRow?.role;
  const membershipOrgId: string = membership?.organization_id || '00000000-0000-0000-0000-000000000001';
  const membershipRole: string | undefined = membership?.role;

  // 3. Consultar metadata del usuario en Auth
  const metadataRole = userData.user.user_metadata?.role;

  // 4. Consultar lista local de persistencia
  const localUsers = loadPersistedUsers();
  const localMatch = localUsers.find(u => u.email && u.email.toLowerCase() === email);

  if (profileRow?.active === false || localMatch?.active === false) {
    return null;
  }

  let resolvedRole =
    (profileRole && profileRole !== 'cliente' ? profileRole : undefined) ||
    (membershipRole && membershipRole !== 'cliente' ? membershipRole : undefined) ||
    (metadataRole && metadataRole !== 'cliente' ? metadataRole : undefined) ||
    (localMatch?.role && localMatch.role !== 'cliente' ? localMatch.role : undefined) ||
    profileRole ||
    membershipRole ||
    metadataRole ||
    localMatch?.role;

  if (isInternalAdminEmail) {
    resolvedRole = 'gerente';
  } else if (!resolvedRole) {
    resolvedRole = 'cliente';
  }

  const resolvedName =
    profileRow?.full_name ||
    profileRow?.name ||
    localMatch?.name ||
    userData.user.user_metadata?.full_name ||
    userData.user.user_metadata?.name ||
    '';

  const resolvedPermissions = resolveEffectivePermissions(
    resolvedRole,
    Array.isArray(profileRow?.permissions) && profileRow.permissions.length > 0
      ? profileRow.permissions
      : localMatch?.permissions
  );

  return {
    user: userData.user,
    role: resolvedRole,
    organizationId: membershipOrgId,
    name: resolvedName,
    permissions: resolvedPermissions,
    active: true
  };
}

async function authenticateSupabaseRequest(
  req: Request,
  res: AuthenticatedResponse,
  next: NextFunction
): Promise<void> {
  const session = await resolveRequestSession(req, res);
  if (!session) {
    res.status(401).json({
      success: false,
      error: 'SesiÃ³n requerida. Inicia sesiÃ³n para acceder a esta informaciÃ³n.'
    });
    return;
  }

  // RBAC: la sesion solo acredita identidad; el rol decide el alcance.
  const roleForAccess = (session.local?.role || session.remote?.role || '').trim().toLowerCase();
  const originalPath = req.originalUrl || req.url || '';

  // Familia administrativa: solo gerencia/superior pasa.
  if (isAdminOnlyApiPath(originalPath) && !adminFamilyRoles.has(roleForAccess)) {
    logAuthEvent('ACCESO_DENEGADO', getClientIp(req), `rol=${roleForAccess || 'desconocido'} ruta=${originalPath.split('?')[0]}`);
    res.status(403).json({
      success: false,
      error: 'No tienes autorizaciÃ³n para administrar esta secciÃ³n.',
      code: 'ROLE_FORBIDDEN'
    });
    return;
  }

  // Personal: el comprador web queda fuera de los recursos del ERP.
  if (isClienteRole(roleForAccess) && isStaffOnlyApiPath(originalPath, req.method)) {
    logAuthEvent('ACCESO_DENEGADO', getClientIp(req), `rol=${roleForAccess || 'desconocido'} ruta=${originalPath.split('?')[0]}`);
    res.status(403).json({
      success: false,
      error: 'Este recurso es exclusivo del personal del negocio.',
      code: 'ROLE_FORBIDDEN'
    });
    return;
  }

  applySessionContext(res, session);
  next();
}

/** Middleware de solo lectura/escritura: permite pasar los metodos no indicados. */
function requireAuthForMethods(methods: string[]) {
  return (req: Request, res: AuthenticatedResponse, next: NextFunction): void => {
    if (!methods.includes(req.method)) {
      next();
      return;
    }
    authenticateSupabaseRequest(req, res, next);
  };
}

app.use(authRequiredPrefixes, authenticateSupabaseRequest);

// Lectura y actualizacion de pedidos quedan protegidas; el POST y el rastreo /track siguen publicos
// para permitir la compra y el seguimiento por numero de pedido.
app.use('/api/orders', (req: Request, res: AuthenticatedResponse, next: NextFunction): void => {
  if (req.path.startsWith('/track') || req.method === 'POST') {
    next();
    return;
  }
  authenticateSupabaseRequest(req, res, next);
});
app.use('/api/inventory-movements', requireAuthForMethods(['GET', 'PUT', 'PATCH', 'DELETE']));

// HTTPS Agent for BCV
const bcvHttpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// State in memory for current rate & manual override
let lastCertifiedRate: {
  usdRate: number;
  currentRate: number;
  futureRate: number | null;
  appliedRate: number;
  eurRate: number;
  valueDate: string;
  isFutureRate: boolean;
  isFutureApplied: boolean;
  futureRateHigher: boolean;
  source: 'BCV_DIRECT' | 'DOLAR_API_FALLBACK' | 'MANUAL';
  checkedAt: string;
  sourceDetails?: string;
  isManual?: boolean;
} | null = {
  usdRate: 877.90,
  currentRate: 877.90,
  futureRate: null,
  appliedRate: 877.90,
  eurRate: Math.round((877.90 * 1.08) * 10000) / 10000,
  valueDate: new Date().toLocaleDateString('es-VE'),
  isFutureRate: false,
  isFutureApplied: false,
  futureRateHigher: false,
  source: 'MANUAL',
  checkedAt: new Date().toISOString(),
  sourceDetails: 'Tasa inicial por defecto (877.90)'
};

function calculateTransactionVES(usdAmount: number, providedRate?: number): { vesAmount: number; rate: number } {
  const rate = providedRate && providedRate > 0 ? providedRate : (lastCertifiedRate?.appliedRate || 877.90);
  const vesAmount = Math.round((usdAmount * rate) * 100) / 100;
  return { vesAmount, rate };
}

// Helper to get Caracas date and hour (UTC-4)
function getCaracasTimeInfo() {
  const now = new Date();
  const caracasDateStr = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  const [d, m, y] = caracasDateStr.split('/');
  const todayCaracasIso = `${y}-${m}-${d}`;

  const caracasHourStr = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    hour: 'numeric',
    hour12: false
  }).format(now);

  const caracasHour = parseInt(caracasHourStr, 10) || 0;

  return {
    todayCaracasStr: caracasDateStr,
    todayCaracasIso,
    caracasHour,
    isAfter4PM: caracasHour >= 16
  };
}

// Helper to fetch text with HTTPS agent and timeout
function fetchBcvDirectText(url: string, timeoutMs = 7000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: bcvHttpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es-ES;q=0.9,es;q=0.8,en;q=0.7'
        },
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 400) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Caché breve para evitar scraping externo al BCV en cada cambio de pantalla o carga de layout.
const BCV_CACHE_TTL_MS = 10 * 60_000;
let bcvExternalCache: any = null;
let bcvExternalCachedAt = 0;
let bcvExternalInflight: Promise<any> | null = null;

// ---------------------------------------------------------------------------
// 1. ENDPOINT: /api/bcv/rates
// ---------------------------------------------------------------------------
app.get('/api/bcv/rates', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';

  if (!forceRefresh && bcvExternalCache && (Date.now() - bcvExternalCachedAt < BCV_CACHE_TTL_MS)) {
    return res.json(bcvExternalCache);
  }

  const fetchRatePayload = async () => {
    const timeInfo = getCaracasTimeInfo();

    let usdRate = 0;
    let eurRate = 0;
    let valueDate = timeInfo.todayCaracasStr;
    let source: 'BCV_DIRECT' | 'DOLAR_API_FALLBACK' | 'MANUAL' = 'BCV_DIRECT';
    let sourceDetails = 'Extracción directa portal oficial BCV';

    let bcvSuccess = false;
    try {
      const html = await fetchBcvDirectText('https://www.bcv.org.ve/glosario/cambio-oficial', 4500);

      const dolarMatch = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i) ||
                         html.match(/id=["']dolar["'][\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i);
      const euroMatch = html.match(/id=["']euro["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i) ||
                        html.match(/id=["']euro["'][\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i);
      const dateMatch = html.match(/class=["']date-display-single["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/Fecha Valor:[\s\S]*?content=["']([^"']+)["']/i) ||
                        html.match(/Fecha Valor:\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i);

      if (dolarMatch && dolarMatch[1]) {
        const cleanDolar = dolarMatch[1].replace(/\./g, '').replace(',', '.').trim();
        usdRate = parseFloat(cleanDolar);

        if (euroMatch && euroMatch[1]) {
          const cleanEuro = euroMatch[1].replace(/\./g, '').replace(',', '.').trim();
          eurRate = parseFloat(cleanEuro);
        }

        if (dateMatch && dateMatch[1]) {
          valueDate = dateMatch[1].trim();
        }

        if (usdRate > 0) {
          bcvSuccess = true;
          source = 'BCV_DIRECT';
          sourceDetails = 'Portal oficial BCV (https://www.bcv.org.ve/glosario/cambio-oficial)';
        }
      }
    } catch (error) {
      console.warn('No se pudo consultar directamente la tasa BCV:', error);
      bcvSuccess = false;
    }

    if (!bcvSuccess) {
      try {
        source = 'DOLAR_API_FALLBACK';
        sourceDetails = 'Fallback automático ve.dolarapi.com/v1/dolares/oficial';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const [dolarRes, euroRes] = await Promise.all([
          fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: controller.signal }),
          fetch('https://ve.dolarapi.com/v1/euros/oficial', { signal: controller.signal }).catch(() => null)
        ]);

        clearTimeout(timeoutId);

        if (dolarRes.ok) {
          const dolarJson: any = await dolarRes.json();
          usdRate = Number(dolarJson.promedio || dolarJson.precio) || 0;
          if (dolarJson.fechaActualizacion) {
            valueDate = new Date(dolarJson.fechaActualizacion).toLocaleDateString('es-VE');
          }
        }

        if (euroRes && euroRes.ok) {
          const euroJson: any = await euroRes.json();
          eurRate = Number(euroJson.promedio || euroJson.precio) || 0;
        }
      } catch (error) {
        console.warn('No se pudo consultar el servicio alternativo de tasas:', error);
        if (lastCertifiedRate && lastCertifiedRate.source !== 'MANUAL') {
          return {
            status: 200,
            payload: {
              ...lastCertifiedRate,
              sourceDetails: 'Última tasa externa certificada disponible en caché',
              checkedAt: new Date().toISOString()
            }
          };
        }
        return {
          status: 503,
          payload: {
            success: false,
            error: 'No hay una tasa BCV disponible. Intenta de nuevo cuando el servicio esté accesible.'
          }
        };
      }
    }

    if (!Number.isFinite(usdRate) || usdRate <= 0) {
      if (lastCertifiedRate && lastCertifiedRate.source !== 'MANUAL') {
        return {
          status: 200,
          payload: {
            ...lastCertifiedRate,
            sourceDetails: 'Última tasa externa certificada disponible en caché',
            checkedAt: new Date().toISOString()
          }
        };
      }
      return {
        status: 503,
        payload: {
          success: false,
          error: 'El servicio de tasas no devolvió un valor válido.'
        }
      };
    }

    const isDateFuture = valueDate > timeInfo.todayCaracasStr || valueDate > timeInfo.todayCaracasIso;
    const isFutureTime = isDateFuture || timeInfo.isAfter4PM;

    let currentRate = usdRate;
    let futureRate: number | null = null;

    if (isFutureTime) {
      futureRate = usdRate;
      currentRate = lastCertifiedRate?.currentRate || (usdRate > 10 ? Math.round((usdRate * 0.998) * 10000) / 10000 : usdRate);
    } else {
      currentRate = usdRate;
      futureRate = null;
    }

    let appliedRate = currentRate;
    let isFutureApplied = false;

    if (futureRate !== null && futureRate > 0) {
      appliedRate = futureRate;
      isFutureApplied = true;
    } else {
      appliedRate = currentRate;
      isFutureApplied = false;
    }

    const result = {
      usdRate: Math.round(appliedRate * 10000) / 10000,
      currentRate: Math.round(currentRate * 10000) / 10000,
      futureRate: futureRate ? Math.round(futureRate * 10000) / 10000 : null,
      appliedRate: Math.round(appliedRate * 10000) / 10000,
      eurRate: Math.round(eurRate * 10000) / 10000,
      valueDate,
      isFutureRate: isFutureApplied,
      isFutureApplied,
      futureRateHigher: futureRate !== null && futureRate > currentRate,
      source,
      sourceDetails: isFutureApplied
        ? `Tasa futura BCV grabada y aplicada (${appliedRate} con fecha valor ${valueDate})`
        : `Tasa actual BCV grabada y aplicada (${appliedRate})`,
      checkedAt: new Date().toISOString()
    };

    lastCertifiedRate = result;
    bcvExternalCache = result;
    bcvExternalCachedAt = Date.now();

    return { status: 200, payload: result };
  };

  if (!bcvExternalInflight || forceRefresh) {
    bcvExternalInflight = fetchRatePayload().finally(() => {
      bcvExternalInflight = null;
    });
  }

  const outcome = await bcvExternalInflight;
  return res.status(outcome.status).json(outcome.payload);
});

// Endpoint historial de tasas de cambio
app.get('/api/exchange-rates/history', async (_req, res: AuthenticatedResponse) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const result = await authenticatedSupabaseRestRequest(
      res,
      `exchange_rates?organization_id=eq.${encodeURIComponent(res.locals.supabaseContext!.organizationId)}&select=*&order=created_at.desc&limit=30`
    );
    if (result.error) {
      const local = localExchangeRateHistory.load(res.locals.supabaseContext!.organizationId);
      return res.json({ success: true, data: local, source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch {
    const local = localExchangeRateHistory.load(res.locals.supabaseContext!.organizationId);
    return res.json({ success: true, data: local, source: 'local' });
  }
});

// ---------------------------------------------------------------------------
// 2. ENDPOINT: /api/bcv/rates/manual
// ---------------------------------------------------------------------------
app.post('/api/bcv/rates/manual', async (req, res: AuthenticatedResponse) => {
  const { rate, futureRate: manualFutureRate, valueDate, notes } = req.body;
  const role = res.locals.supabaseContext?.role.toLowerCase();

  if (!role || !['admin', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner'].includes(role)) {
    return res.status(403).json({
      error: 'AcciÃ³n restringida: La intervenciÃ³n manual de tasas requiere privilegios de Administrador.'
    });
  }

  const numCurrent = parseFloat(rate);
  if (!numCurrent || numCurrent <= 0) {
    return res.status(400).json({ error: 'La tasa manual ingresada debe ser un nÃºmero positivo vÃ¡lido.' });
  }

  const numFuture = manualFutureRate ? parseFloat(manualFutureRate) : null;
  const timeInfo = getCaracasTimeInfo();

  // Rule: Si existe una tasa futura es la que se grabarÃ¡, de lo contrario se queda con la tasa actual
  let appliedRate = numCurrent;
  let isFutureApplied = false;

  if (numFuture && numFuture > 0) {
    appliedRate = numFuture;
    isFutureApplied = true;
  } else {
    appliedRate = numCurrent;
    isFutureApplied = false;
  }

  const certifiedRate = {
    usdRate: Math.round(appliedRate * 10000) / 10000,
    currentRate: Math.round(numCurrent * 10000) / 10000,
    futureRate: numFuture ? Math.round(numFuture * 10000) / 10000 : null,
    appliedRate: Math.round(appliedRate * 10000) / 10000,
    eurRate: Math.round((appliedRate * 1.08) * 10000) / 10000,
    valueDate: valueDate || timeInfo.todayCaracasStr,
    isFutureRate: isFutureApplied,
    isFutureApplied,
    futureRateHigher: numFuture !== null && numFuture > numCurrent,
    source: 'MANUAL',
    sourceDetails: isFutureApplied
      ? `Tasa manual futura grabada y aplicada (${numFuture}) - ${notes || 'Sin notas'}`
      : `Tasa manual actual grabada y aplicada (${numCurrent}) - ${notes || 'Sin notas'}`,
    isManual: true,
    checkedAt: new Date().toISOString()
  };

  const persistResult = await authenticatedSupabaseRestRequest(res, 'exchange_rates', {
    method: 'POST',
    body: {
      organization_id: res.locals.supabaseContext!.organizationId,
      base_currency: 'USD',
      quote_currency: 'VES',
      rate: appliedRate,
      is_future_rate: isFutureApplied,
      source: 'MANUAL',
      observed_at: new Date().toISOString()
    }
  });
  if (persistResult.error) {
    return res.status(persistResult.status).json({
      success: false,
      error: `No se pudo guardar el historial de la tasa: ${persistResult.error}`
    });
  }

  return res.json({
    success: true,
    certifiedRate,
    message: isFutureApplied
      ? 'Tasa futura manual grabada y aplicada exitosamente.'
      : 'Tasa actual manual registrada exitosamente.'
  });
});

// ---------------------------------------------------------------------------
// 3. ENDPOINT: /api/reports/process-transactions
// ---------------------------------------------------------------------------
app.post('/api/reports/process-transactions', (req, res) => {
  const { transactions } = req.body;

  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Se requiere un arreglo de transacciones.' });
  }

  const processed = transactions.map((t: any) => {
    const boundRate = Number(t.bcv_rate || t.exchange_rate || 1);
    const rawVes = Number(t.amount_ves || t.total_ves || 0);
    const calculatedUSD = boundRate > 0 ? Math.round((rawVes / boundRate) * 100) / 100 : 0;

    return {
      ...t,
      bcv_rate_applied: boundRate,
      normalized_usd_amount: Number(t.total_usd || t.amount_usd || calculatedUSD),
      is_future_rate_applied: Boolean(t.is_future_rate)
    };
  });

  return res.json({
    success: true,
    count: processed.length,
    processed
  });
});

// ---------------------------------------------------------------------------
// 3b. AUTOCOMPLETADO DE PERSONA POR CEDULA (API cedula.com.ve)
// Cada consulta gasta un credito prepagado de la cuenta del negocio: se
// protege con limite de ritmo por IP y cache local de las consultas exitosas.
// Las credenciales (CEDULA_APP_ID / CEDULA_TOKEN) viven solo en el servidor.
// ---------------------------------------------------------------------------
// Credenciales del servicio: en Vercel viven en process.env; en local las lee
// el parser de archivos .env (loadedEnv). Nunca se exponen al navegador.
const CEDULA_APP_ID = (process.env.CEDULA_APP_ID || loadedEnv.CEDULA_APP_ID || '').trim();
const CEDULA_TOKEN = (process.env.CEDULA_TOKEN || loadedEnv.CEDULA_TOKEN || '').trim();
const CEDULA_API_URL = 'https://api.cedula.com.ve/api/v1';
const CEDULA_LOOKUPS_FILE = path.resolve(DATA_DIR, 'cedula_lookups.json');
const CEDULA_RATE_LIMIT_PER_MINUTE = 15;
const CEDULA_RATE_WINDOW_MS = 60_000;

const cedulaLookupCache: Record<string, { data: unknown; cachedAt: string }> = {};
let cedulaLookupCacheLoaded = false;

function ensureCedulaLookupCache(): void {
  if (cedulaLookupCacheLoaded) return;
  cedulaLookupCacheLoaded = true;
  try {
    const raw = fs.readFileSync(CEDULA_LOOKUPS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { lookups?: Record<string, { data: unknown; cachedAt: string }> };
    if (parsed && typeof parsed === 'object' && parsed.lookups) {
      for (const [key, value] of Object.entries(parsed.lookups)) {
        if (value && typeof value === 'object' && 'data' in value) {
          cedulaLookupCache[key] = value;
        }
      }
    }
  } catch {
    /* archivo ausente o ilegible: cache vacia */
  }
}

function persistCedulaLookupCache(): void {
  try {
    fs.writeFileSync(
      CEDULA_LOOKUPS_FILE,
      JSON.stringify({ lookups: cedulaLookupCache }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[cedula-lookup] No se pudo guardar el cache local:', err);
  }
}

/** Acepta "V-12345678", "V12345678", "12345678" (sin letra asume V). */
function parseCedulaDoc(input: string): { nacionalidad: 'V' | 'E'; digits: string } | null {
  const normalized = input.trim().toUpperCase().replace(/[\s.\-–]/g, '');
  const match = normalized.match(/^([VE]?)(\d{5,9})$/);
  if (!match) return null;
  const nacionalidad = (match[1] || 'V') as 'V' | 'E';
  if (match[2].startsWith('0')) return null; // una cedula no comienza en 0
  return { nacionalidad, digits: match[2] };
}

const cedulaRateBuckets = new Map<string, number[]>();

function isCedulaRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (cedulaRateBuckets.get(ip) ?? []).filter((t) => now - t < CEDULA_RATE_WINDOW_MS);
  if (hits.length >= CEDULA_RATE_LIMIT_PER_MINUTE) {
    cedulaRateBuckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  cedulaRateBuckets.set(ip, hits);
  if (cedulaRateBuckets.size > 500) cedulaRateBuckets.clear();
  return false;
}

app.get('/api/cedula-lookup', async (req, res) => {
  if (!CEDULA_APP_ID || !CEDULA_TOKEN) {
    return res.status(503).json({
      found: false,
      configured: false,
      message: 'Autocompletado por cédula no configurado: faltan las credenciales del servidor.'
    });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.ip || 'anon').split(',')[0].trim();
  if (isCedulaRateLimited(ip)) {
    return res.status(429).json({
      found: false,
      error: 'Demasiadas consultas seguidas. Espera un momento e intenta de nuevo.'
    });
  }

  const doc = String(req.query.doc ?? '').trim();
  const parsed = parseCedulaDoc(doc);
  if (!parsed) {
    return res.status(400).json({
      found: false,
      error: 'Formato de cédula inválido: usa V o E seguido de 5 a 9 dígitos (ej. V-12345678).'
    });
  }

  const cacheKey = `${parsed.nacionalidad}-${parsed.digits}`;
  ensureCedulaLookupCache();
  const cached = cedulaLookupCache[cacheKey];
  if (cached) {
    return res.json({ ...(cached.data as object), cached: true });
  }

  const url = `${CEDULA_API_URL}?app_id=${encodeURIComponent(CEDULA_APP_ID)}&token=${encodeURIComponent(
    CEDULA_TOKEN
  )}&nacionalidad=${parsed.nacionalidad}&cedula=${parsed.digits}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const upstream = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    const json = await upstream.json().catch(() => null);

    if (!upstream.ok || !json || json.error) {
      const upstreamDetail = json && typeof json.error_str === 'string' ? json.error_str : '';
      return res.status(upstream.status === 404 ? 404 : 502).json({
        found: false,
        error: upstreamDetail || 'No se encontró a la persona en el registro o el servicio no respondió con datos.'
      });
    }

    const data = json.data ?? {};
    const names = [data.primer_nombre, data.segundo_nombre].filter(Boolean).join(' ').trim();
    const lastNames = [data.primer_apellido, data.segundo_apellido].filter(Boolean).join(' ').trim();
    const fullName = [names, lastNames].filter(Boolean).join(' ').trim();

    const payload = {
      found: true,
      configured: true,
      input: doc,
      identity: {
        nacionalidad: data.nacionalidad || parsed.nacionalidad,
        cedula: String(data.cedula || parsed.digits),
        rif: typeof data.rif === 'string' ? data.rif.trim() : '',
        names,
        lastNames,
        fullName
      },
      location: {
        estado: data.cne?.estado ?? '',
        municipio: data.cne?.municipio ?? '',
        parroquia: data.cne?.parroquia ?? '',
        centroElectoral: data.cne?.centro_electoral ?? ''
      }
    };

    cedulaLookupCache[cacheKey] = { data: payload, cachedAt: new Date().toISOString() };
    persistCedulaLookupCache();

    return res.json({ ...payload, cached: false });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return res.status(502).json({
      found: false,
      error: aborted
        ? 'La consulta al registro tardó demasiado. Intenta de nuevo.'
        : 'No se pudo contactar el servicio de consulta de cédulas.'
    });
  }
});

// ---------------------------------------------------------------------------
// 4. SUPABASE BACKEND PROXY (Garantiza cero problemas de CORS o Iframe)
// ---------------------------------------------------------------------------
const supabaseHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 64
});

function supabaseRestRequest(
  endpoint: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {},
  accessToken?: string
): Promise<{ status: number; data: any; error?: string }> {
  return new Promise((resolve) => {
    const url = new URL(
      endpoint.startsWith('http')
        ? endpoint
        : `${SUPABASE_URL}/rest/v1/${endpoint.replace(/^\//, '')}`
    );
    const method = options.method || 'GET';
    const bodyStr = options.body ? JSON.stringify(options.body) : null;
    // Datos: siempre con la clave de servicio cuando existe (bypassa RLS).
    // La clave anon queda reservada para el flujo de autenticacion.
    const dataKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const headers: Record<string, string> = {
      'apikey': dataKey,
      'Authorization': `Bearer ${dataKey}`,
      'Accept': 'application/json',
      ...options.headers
    };
    // El token del usuario solo se usa si no hay clave de servicio configurada.
    if (accessToken && !SUPABASE_SERVICE_ROLE_KEY) headers['Authorization'] = `Bearer ${accessToken}`;

    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = https.request(url, { method, headers, timeout: 8000, agent: supabaseHttpsAgent }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = raw;
        }

        if (res.statusCode && res.statusCode >= 400) {
          resolve({
            status: res.statusCode,
            data: null,
            error: (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) || `HTTP ${res.statusCode}`
          });
        } else {
          resolve({ status: res.statusCode || 200, data: parsed });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, data: null, error: 'Tiempo de espera agotado con Supabase' });
    });

    req.on('error', (err) => {
      resolve({ status: 500, data: null, error: err.message });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Llamada REST con la clave de servicio (solo servidor). Se usa como respaldo
 * cuando RLS bloquea una insercion legitima con la sesion del usuario
 * (p.ej. receivable_payments sigue con RLS activo mientras la tabla
 * organization_members esta vacia). El control de inquilino lo aplica el
 * servidor antes de llamarla.
 */
function supabaseServiceRestRequest(
  endpoint: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any; error?: string }> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return Promise.resolve({ status: 0, data: null, error: 'Clave de servicio no configurada' });
  }
  return supabaseRestRequest(
    endpoint,
    { ...options, headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, ...(options.headers || {}) } },
    SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Llamada directa a la API de autenticacion de Supabase usando la credencial
 * que solo existe en el servidor. El navegador nunca la ve.
 * accessToken: cuando se pasa, la peticion viaja identificada con ese token
 * (necesario para revocar la sesion exacta, p. ej. en el logout).
 */
function supabaseAuthRequest(
  endpoint: string,
  body: any,
  method: 'POST' | 'GET' = 'POST',
  accessToken?: string
): Promise<{ status: number; data: any; error?: string }> {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/auth/v1/${endpoint.replace(/^\//, '')}`);
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers: Record<string, string> = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      'Accept': 'application/json'
    };

    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = https.request(url, { method, headers, timeout: 15000, agent: supabaseHttpsAgent }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = raw;
        }

        if (res.statusCode && res.statusCode >= 400) {
          const message =
            (parsed && typeof parsed === 'object' && (parsed.error_description || parsed.msg || parsed.message || parsed.error)) ||
            `HTTP ${res.statusCode}`;
          resolve({ status: res.statusCode, data: parsed, error: message });
        } else {
          resolve({ status: res.statusCode || 200, data: parsed });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, data: null, error: 'Tiempo de espera agotado con el servicio de autenticacion.' });
    });

    req.on('error', (err) => {
      resolve({ status: 500, data: null, error: err.message });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function authenticatedSupabaseRestRequest(
  res: AuthenticatedResponse,
  endpoint: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any; error?: string }> {
  const context = res.locals.supabaseContext || {
    accessToken: SUPABASE_ANON_KEY,
    organizationId: '00000000-0000-0000-0000-000000000001',
    role: 'admin'
  };
  // Log de diagnóstico solo si se habilita FRENYER_DEBUG_LOGS=on
  // (imprimir endpoint+token y payloads en cada llamada ralentiza serverless).
  if (process.env.FRENYER_DEBUG_LOGS === 'on') {
    console.log('Requesting endpoint:', endpoint, 'with context:', {
      organizationId: context.organizationId,
      role: context.role,
      accessToken: context.accessToken ? '(presente)' : '(ausente)'
    });
  }

  const method = options.method || 'GET';
  const table = endpoint.split('?')[0].split('/')[0];
  let body = options.body;
  if (tenantScopedTables.has(table) && (method === 'POST' || method === 'PATCH') && body) {
    const rows = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        return Promise.resolve({ status: 400, data: null, error: 'El cuerpo de la solicitud no es vÃ¡lido.' });
      }
      const rowOrgId = (row as { organization_id?: string }).organization_id;
      if (rowOrgId && rowOrgId !== context.organizationId) {
        return Promise.resolve({ status: 403, data: null, error: 'No puede modificar datos de otra organizaciÃ³n.' });
      }
      (row as { organization_id?: string }).organization_id = context.organizationId;
    }
    body = Array.isArray(body) ? rows : rows[0];
  }

  const res_supa = await supabaseRestRequest(endpoint, { ...options, body }, context.accessToken);
  if (res_supa.error) {
    console.error('DEBUG: authenticatedSupabaseRestRequest failed:', { endpoint, error: res_supa.error, status: res_supa.status });
  }
  return res_supa;
}

const DEFAULT_CATALOG_PRODUCTS = [
  {
    id: '5e9ce423-ba0d-4870-9f6f-44332d1e4189',
    sku: 'MOT-0001',
    barcode: '7591001000112',
    name: 'Amortiguador Delantero Reforzado Gas',
    category: 'Repuestos',
    brand: 'Monroe',
    description: 'Amortiguador delantero presurizado con nitrÃ³geno de alta durabilidad para vÃ­as venezolanas.',
    unit: 'UND',
    cost_usd: 25.15,
    price_usd: 35.00,
    stock: 22,
    min_stock: 5,
    status: 'Activo'
  },
  {
    id: '6f0de534-ca1e-4981-a070-55443e2f5290',
    sku: 'BAT-0002',
    barcode: '7591001000229',
    name: 'BaterÃ­a Automotriz 12V 800AMP Libre Mantenimiento',
    category: 'Electricidad',
    brand: 'Duncan',
    description: 'BaterÃ­a sellada de alta capacidad de arranque en frÃ­o 800AMP con garantÃ­a nacional.',
    unit: 'UND',
    cost_usd: 72.00,
    price_usd: 95.00,
    stock: 15,
    min_stock: 3,
    status: 'Activo'
  },
  {
    id: '7a1ef645-db2f-4a92-b181-66554f306301',
    sku: 'LUB-0003',
    barcode: '7591001000336',
    name: 'Aceite de Motor SintÃ©tico 20W50 1 GalÃ³n',
    category: 'Lubricantes',
    brand: 'Castrol',
    description: 'Lubricante sintÃ©tico con aditivos antidesgaste para mÃ¡xima protecciÃ³n tÃ©rmica y antifricciÃ³n.',
    unit: 'GLN',
    cost_usd: 8.50,
    price_usd: 12.00,
    stock: 45,
    min_stock: 10,
    status: 'Activo'
  },
  {
    id: '8b2fa756-ec30-4b03-c292-776650417412',
    sku: 'FRE-0004',
    barcode: '7591001000443',
    name: 'Pastillas de Freno CerÃ¡mica Delanteras',
    category: 'Frenos',
    brand: 'Wagner',
    description: 'Juego de pastillas cerÃ¡micas de bajo desprendimiento de polvo y frenado suave sin chirridos.',
    unit: 'JGO',
    cost_usd: 19.00,
    price_usd: 28.00,
    stock: 18,
    min_stock: 4,
    status: 'Activo'
  },
  {
    id: '9c30b867-fd41-4c14-d3a3-887761528523',
    sku: 'FLT-0005',
    barcode: '7591001000550',
    name: 'Filtro de Aire Alto Rendimiento Flujo Directo',
    category: 'Filtros',
    brand: 'K&N',
    description: 'Filtro de aire de algodÃ³n de alta permeabilidad lavable y de flujo Ã³ptimo.',
    unit: 'UND',
    cost_usd: 9.80,
    price_usd: 15.00,
    stock: 30,
    min_stock: 8,
    status: 'Activo'
  },
  {
    id: '0d41c978-0e52-4d25-e4b4-998872639634',
    sku: 'BUJ-0006',
    barcode: '7591001000667',
    name: 'BujÃ­as de Iridio Punta Platino (Pack x4)',
    category: 'Encendido',
    brand: 'NGK',
    description: 'Juego de 4 bujÃ­as lÃ¡ser con electrodo central de iridio para encendido instantÃ¡neo.',
    unit: 'PACK',
    cost_usd: 16.50,
    price_usd: 24.00,
    stock: 25,
    min_stock: 5,
    status: 'Activo'
  },
  {
    id: '1e52da89-1f63-4e36-f5c5-0a998374a745',
    sku: 'LMP-0007',
    barcode: '7591001000774',
    name: 'Bombillo LED H4 Alta y Baja 6000K Blanco FrÃ­o',
    category: 'IluminaciÃ³n',
    brand: 'Philips',
    description: 'Kit de 2 bombillos LED de alta intensidad 12.000 lÃºmenes con disipador pasivo.',
    unit: 'PAR',
    cost_usd: 11.20,
    price_usd: 18.00,
    stock: 12,
    min_stock: 4,
    status: 'Activo'
  },
  {
    id: '2f63eb90-2074-4f47-06d6-1ba09485b856',
    sku: 'COR-0008',
    barcode: '7591001000881',
    name: 'Correa de DistribuciÃ³n Reforzada HNBR',
    category: 'Motor',
    brand: 'Gates',
    description: 'Correa dentada de caucho sintÃ©tico reforzado resistente a altas temperaturas y aceites.',
    unit: 'UND',
    cost_usd: 14.00,
    price_usd: 22.00,
    stock: 8,
    min_stock: 2,
    status: 'Activo'
  },
  {
    id: '3a74fc01-3185-4058-17e7-2cb10596c967',
    sku: 'REF-0009',
    barcode: '7591001000998',
    name: 'Refrigerante Anticorrosivo 50/50 1 GalÃ³n Verde',
    category: 'Lubricantes',
    brand: 'Prestone',
    description: 'LÃ­quido refrigerante y anticongelante formulado para evitar corrosiÃ³n y cavitaciÃ³n de bomba.',
    unit: 'GLN',
    cost_usd: 9.50,
    price_usd: 14.50,
    stock: 35,
    min_stock: 6,
    status: 'Activo'
  },
  {
    id: '4b850d12-4296-4169-28f8-3dc216a7da78',
    sku: 'DIS-0010',
    barcode: '7591001001001',
    name: 'Disco de Freno Ventilado Delantero',
    category: 'Frenos',
    brand: 'Brembo',
    description: 'Rotor de disco de freno en hierro fundido tratado contra deformaciones tÃ©rmicas.',
    unit: 'UND',
    cost_usd: 28.00,
    price_usd: 42.00,
    stock: 10,
    min_stock: 2,
    status: 'Activo'
  }
];

app.get('/api/products', async (req, res: AuthenticatedResponse) => {
  try {
    let result;
    if (res.locals?.supabaseContext) {
      result = await authenticatedSupabaseRestRequest(res, 'products?select=*&order=name.asc');
    } else {
      result = await supabaseRestRequest('products?select=*&order=name.asc');
    }

    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      const map = new Map<string, any>();
      result.data.forEach((p: any) => {
        if (p.sku && !map.has(p.sku)) {
          map.set(p.sku, p);
        }
      });
      return res.json({ success: true, data: Array.from(map.values()) });
    }

    // Fallback resiliente si la tabla estÃ¡ vacÃ­a o inaccesible sin sesiÃ³n
    return res.json({ success: true, data: DEFAULT_CATALOG_PRODUCTS });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: DEFAULT_CATALOG_PRODUCTS });
  }
});

app.get('/api/public/products', async (_req, res) => {
  try {
    const result = await supabaseRestRequest('products?select=*&order=name.asc');
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      const map = new Map<string, any>();
      result.data.forEach((p: any) => {
        if (p.sku && !map.has(p.sku)) {
          map.set(p.sku, p);
        }
      });
      return res.json({ success: true, data: Array.from(map.values()) });
    }
    return res.json({ success: true, data: DEFAULT_CATALOG_PRODUCTS });
  } catch {
    return res.json({ success: true, data: DEFAULT_CATALOG_PRODUCTS });
  }
});

app.post('/api/products', authenticateSupabaseRequest, async (req, res) => {
  try {
    const rawProduct = req.body || {};
    let productPayload: Record<string, any> = { ...rawProduct };

    // Sanitizar branch_id si no es UUID vÃ¡lido
    const isValidUuid = (val?: string | null) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (productPayload.branch_id && !isValidUuid(productPayload.branch_id)) {
      delete productPayload.branch_id;
    }

    // Si ya existe un producto con el mismo SKU, actualizarlo en lugar de insertar duplicado
    if (productPayload.sku) {
      const checkRes = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(productPayload.sku)}&select=*`);
      if (!checkRes.error && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
        const updateRes = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(productPayload.sku)}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: productPayload
        });
        if (!updateRes.error && updateRes.data) {
          const updated = Array.isArray(updateRes.data) ? updateRes.data[0] : updateRes.data;
          return res.json({ success: true, data: { ...rawProduct, ...updated } });
        }
      }
    }

    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < 6) {
      attempts++;
      const result = await authenticatedSupabaseRestRequest(res, 'products', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: productPayload
      });

      if (!result.error && result.data) {
        const created = Array.isArray(result.data) ? result.data[0] : result.data;
        return res.json({ success: true, data: { ...rawProduct, ...created } });
      }

      lastError = result.error || 'Error creando producto';
      if (/uuid|branch_id|branches|foreign key/i.test(lastError) && productPayload.branch_id) {
        delete productPayload.branch_id;
        continue;
      }
      const missingColMatch = lastError.match(/Could not find the '([^']+)' column of 'products'/i);
      if (missingColMatch && missingColMatch[1] && missingColMatch[1] in productPayload) {
        delete productPayload[missingColMatch[1]];
        continue;
      }
      break;
    }

    return res.status(200).json({ success: false, error: lastError });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.put('/api/products/:sku', authenticateSupabaseRequest, async (req, res) => {
  try {
    const { sku } = req.params;
    const rawUpdates = req.body || {};
    let updatesPayload: Record<string, any> = { ...rawUpdates };

    const isValidUuid = (val?: string | null) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (updatesPayload.branch_id && !isValidUuid(updatesPayload.branch_id)) {
      delete updatesPayload.branch_id;
    }

    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < 6) {
      attempts++;
      const result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: updatesPayload
      });

      if (!result.error) {
        return res.json({ success: true });
      }

      lastError = result.error || 'Error actualizando producto';
      if (/uuid|branch_id|branches|foreign key/i.test(lastError) && updatesPayload.branch_id) {
        delete updatesPayload.branch_id;
        continue;
      }
      const missingColMatch = lastError.match(/Could not find the '([^']+)' column of 'products'/i);
      if (missingColMatch && missingColMatch[1] && missingColMatch[1] in updatesPayload) {
        delete updatesPayload[missingColMatch[1]];
        continue;
      }
      break;
    }

    return res.status(200).json({ success: false, error: lastError });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/products/:sku', authenticateSupabaseRequest, async (req, res) => {
  try {
    const { sku } = req.params;
    const result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=representation' }
    });

    if (result.error) {
      const local = localQuotes.load(orgId);
      return res.status(200).json({ success: true, data: local, source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    const local = localQuotes.load(res.locals.supabaseContext?.organizationId);
    return res.status(200).json({ success: true, data: local, source: 'local' });
  }
});

app.get('/api/products/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU requerido' });
    }

    const result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}&limit=1`);
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      return res.json({ success: true, data: result.data[0] });
    }

    const fallback = DEFAULT_CATALOG_PRODUCTS.find(p => p.sku === sku);
    if (fallback) {
      return res.json({ success: true, data: fallback });
    }

    return res.json({
      success: true,
      data: {
        sku,
        name: 'Producto',
        category: 'General',
        price_usd: 0,
        stock: 0,
        status: 'Activo'
      }
    });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.get(['/api/products/:sku/stock', '/api/stock/:sku'], async (req, res) => {
  try {
    const { sku } = req.params;
    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU requerido' });
    }

    const result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}&select=stock&limit=1`);
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      return res.json({ success: true, sku, stock: Number(result.data[0].stock) || 0 });
    }

    const fallback = DEFAULT_CATALOG_PRODUCTS.find(p => p.sku === sku);
    const stock = fallback ? fallback.stock : 0;
    return res.json({ success: true, sku, stock });
  } catch (err: any) {
    return res.status(200).json({ success: true, sku: req.params.sku, stock: 0 });
  }
});

app.patch('/api/products/:sku/stock', authenticateSupabaseRequest, async (req, res) => {
  try {
    const { sku } = req.params;
    const { stock } = req.body;

    let result;
    if ((res as AuthenticatedResponse).locals?.supabaseContext) {
      result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        body: { stock }
      });
    } else {
      result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        body: { stock }
      });
    }

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// 4.B INVENTORY MOVEMENTS AND ADJUSTMENTS PROXY
// ---------------------------------------------------------------------------
const INVENTORY_ADJUSTMENTS_FILE = path.resolve(DATA_DIR, 'inventory_adjustments.json');

function loadPersistedAdjustments(orgId?: string): any[] {
  try {
    if (fs.existsSync(INVENTORY_ADJUSTMENTS_FILE)) {
      const content = fs.readFileSync(INVENTORY_ADJUSTMENTS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) {
          return list.filter((item: any) => !item.organization_id || item.organization_id === orgId);
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando ajustes persistentes:', err);
  }
  return [];
}

function savePersistedAdjustment(adjustment: any) {
  try {
    const dir = path.dirname(INVENTORY_ADJUSTMENTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = loadPersistedAdjustments();
    const existingIdx = current.findIndex(
      (a: any) => a.id === adjustment.id || (a.doc_number && a.doc_number === adjustment.doc_number && a.sku === adjustment.sku)
    );
    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...adjustment };
    } else {
      current.unshift(adjustment);
    }
    fs.writeFileSync(INVENTORY_ADJUSTMENTS_FILE, JSON.stringify(current.slice(0, 500), null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando ajuste persistente:', err);
  }
}

app.get('/api/inventory/movements', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    // Resolver orgId y token (ya sea desde sesiÃ³n de usuario o entorno predeterminado)
    let orgId = (res as AuthenticatedResponse).locals?.supabaseContext?.organizationId;
    let token = (res as AuthenticatedResponse).locals?.supabaseContext?.accessToken;

    if (!orgId) {
      const match = (req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) {
        try {
          const { data: userData } = await supabaseServer.auth.getUser(match[1]);
          if (userData?.user) {
            token = match[1];
            // El servidor ya usa la clave de servicio: no hace falta un cliente
            // por usuario para leer la membresia.
            const { data: mem } = await supabaseServer
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', userData.user.id)
              .limit(1)
              .maybeSingle();
            if (mem?.organization_id) {
              orgId = mem.organization_id;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (!orgId) {
      orgId = '00000000-0000-0000-0000-000000000001';
    }

    // Helper para consultar Supabase con el token disponible o anon
    const queryDb = (endpoint: string, options = {}) => {
      if (token) {
        return supabaseRestRequest(endpoint, options, token);
      }
      return supabaseRestRequest(endpoint, options, SUPABASE_ANON_KEY);
    };

    // Consultar movimientos, ventas y compras en paralelo (antes 3 viajes en serie).
    const [movRes, salesRes, purchasesRes] = await Promise.all([
      queryDb(`inventory_movements?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`).catch(() => ({ error: 'err', data: null })),
      queryDb(`sales?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.COMPLETADA&select=id,doc_number,doc_type,created_at,exchange_rate,customers(id,name),sale_items(*)&order=created_at.desc&limit=250`),
      queryDb(`purchases?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.COMPLETADA&select=id,doc_number,invoice_number,purchase_date,created_at,exchange_rate,suppliers(id,name),purchase_items(*)&order=created_at.desc&limit=250`)
    ]);

    let rawMovements: any[] = (!movRes.error && Array.isArray(movRes.data)) ? movRes.data : [];

    // Cargar ajustes históricos y persistentes locales
    const persistedAdjustments = loadPersistedAdjustments(orgId);
    const loggedKeys = new Set(rawMovements.map((m: any) => `${m.doc_number}-${m.sku}`));

    for (const adj of persistedAdjustments) {
      const key = `${adj.doc_number}-${adj.sku}`;
      if (!loggedKeys.has(key)) {
        rawMovements.push(adj);
        loggedKeys.add(key);
      }
    }

    const loggedDocKeys = new Set(rawMovements.map((m: any) => `${m.doc_number}-${m.sku}`));

    const syntheticSalesMovements: any[] = [];
    if (!salesRes.error && Array.isArray(salesRes.data)) {
      for (const sale of salesRes.data) {
        const items = Array.isArray(sale.sale_items) ? sale.sale_items : [];
        const clientName = sale.customers?.name || 'Cliente Mostrador';
        for (const item of items) {
          const docKey = `${sale.doc_number}-${item.sku}`;
          if (loggedDocKeys.has(docKey)) continue;

          syntheticSalesMovements.push({
            id: `sale-${item.id || item.sku}-${sale.id}`,
            organization_id: orgId,
            sku: item.sku,
            product_name: item.name,
            movement_type: 'VENTA',
            doc_type: sale.doc_type || 'FACTURA',
            doc_number: sale.doc_number,
            entity_type: 'CLIENTE',
            entity_name: clientName,
            quantity: -Math.abs(Number(item.quantity) || 1),
            unit_price_usd: Number(item.unit_price_usd) || 0,
            unit_cost_usd: 0,
            exchange_rate: Number(sale.exchange_rate) || 1,
            total_usd: Number(item.total_usd) || 0,
            total_ves: Number(item.total_ves) || (Number(item.total_usd) * Number(sale.exchange_rate)),
            previous_stock: 0,
            new_stock: 0,
            reason: `Venta POS (${sale.doc_type || 'Factura'} #${sale.doc_number})`,
            notes: null,
            created_at: sale.created_at
          });
        }
      }
    }

    const syntheticPurchasesMovements: any[] = [];
    if (!purchasesRes.error && Array.isArray(purchasesRes.data)) {
      for (const pur of purchasesRes.data) {
        const items = Array.isArray(pur.purchase_items) ? pur.purchase_items : [];
        const supplierName = pur.suppliers?.name || 'Proveedor';
        for (const item of items) {
          const docKey = `${pur.doc_number}-${item.sku}`;
          if (loggedDocKeys.has(docKey)) continue;

          syntheticPurchasesMovements.push({
            id: `pur-${item.id || item.sku}-${pur.id}`,
            organization_id: orgId,
            sku: item.sku,
            product_name: item.name,
            movement_type: 'COMPRA',
            doc_type: 'COMPRA',
            doc_number: pur.invoice_number || pur.doc_number,
            entity_type: 'PROVEEDOR',
            entity_name: supplierName,
            quantity: Math.abs(Number(item.quantity) || 1),
            unit_price_usd: 0,
            unit_cost_usd: Number(item.unit_cost_usd) || 0,
            exchange_rate: Number(pur.exchange_rate) || 1,
            total_usd: Number(item.total_usd) || 0,
            total_ves: Number(item.total_ves) || (Number(item.total_usd) * Number(pur.exchange_rate)),
            previous_stock: 0,
            new_stock: 0,
            reason: `Compra interna (${pur.invoice_number || pur.doc_number})`,
            notes: null,
            created_at: pur.created_at || pur.purchase_date
          });
        }
      }
    }

    // 4. Unificar y ordenar cronolÃ³gicamente
    const allMovements = [...rawMovements, ...syntheticSalesMovements, ...syntheticPurchasesMovements].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });

    return res.json({ success: true, data: allMovements });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error consultando movimientos de inventario' });
  }
});

app.post('/api/inventory/adjustments', async (req, res) => {
  try {
    let orgId = (res as AuthenticatedResponse).locals?.supabaseContext?.organizationId;
    let token = (res as AuthenticatedResponse).locals?.supabaseContext?.accessToken;

    if (!orgId) {
      const match = (req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) {
        try {
          const { data: userData } = await supabaseServer.auth.getUser(match[1]);
          if (userData?.user) {
            token = match[1];
            // El servidor ya usa la clave de servicio: no hace falta un cliente
            // por usuario para leer la membresia.
            const { data: mem } = await supabaseServer
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', userData.user.id)
              .limit(1)
              .maybeSingle();
            if (mem?.organization_id) {
              orgId = mem.organization_id;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (!orgId) {
      orgId = '00000000-0000-0000-0000-000000000001';
    }

    const queryDb = (endpoint: string, options = {}) => {
      if (token) {
        return supabaseRestRequest(endpoint, options, token);
      }
      return supabaseRestRequest(endpoint, options, SUPABASE_ANON_KEY);
    };

    const {
      sku,
      adjustment_type,
      quantity,
      reason,
      notes,
      doc_number,
      unit_cost_usd,
      unit_price_usd,
      exchange_rate
    } = req.body || {};

    if (!sku || !adjustment_type || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'El producto, el tipo de ajuste y la cantidad son obligatorios.' });
    }

    // 1. Obtener producto de Supabase
    const prodRes = await queryDb(
      `products?organization_id=eq.${encodeURIComponent(orgId)}&sku=eq.${encodeURIComponent(sku)}&limit=1`
    );

    if (prodRes.error || !Array.isArray(prodRes.data) || prodRes.data.length === 0) {
      return res.status(404).json({ success: false, error: `Producto con cÃ³digo ${sku} no encontrado en catÃ¡logo.` });
    }

    const product = prodRes.data[0];
    const prevStock = Number(product.stock) || 0;
    const numQty = Math.abs(Number(quantity) || 0);

    let nextStock = prevStock;
    let netDelta = 0;
    let movType = 'AJUSTE_ENTRADA';

    if (adjustment_type === 'ENTRADA') {
      nextStock = prevStock + numQty;
      netDelta = numQty;
      movType = 'AJUSTE_ENTRADA';
    } else if (adjustment_type === 'SALIDA') {
      nextStock = Math.max(0, prevStock - numQty);
      netDelta = -numQty;
      movType = 'AJUSTE_SALIDA';
    } else if (adjustment_type === 'CORRECCION') {
      nextStock = Math.max(0, Number(quantity) || 0);
      netDelta = nextStock - prevStock;
      movType = 'AJUSTE_CORRECCION';
    } else {
      return res.status(400).json({ success: false, error: 'Tipo de ajuste no reconocido.' });
    }

    const rate = Number(exchange_rate) || 1;
    const unitVal = Number(unit_cost_usd) || Number(product.cost_usd) || Number(product.price_usd) || 0;
    const totalUsd = Math.round(Math.abs(netDelta) * unitVal * 100) / 100;
    const totalVes = Math.round(totalUsd * rate * 100) / 100;

    const autoDoc = doc_number && doc_number.trim()
      ? doc_number.trim()
      : `AJU-${String(Math.floor(1000 + Math.random() * 9000))}`;

    // 2. Actualizar stock en tabla products
    const updateProdRes = await queryDb(
      `products?organization_id=eq.${encodeURIComponent(orgId)}&sku=eq.${encodeURIComponent(sku)}`,
      {
        method: 'PATCH',
        body: { stock: nextStock }
      }
    );

    if (updateProdRes.error) {
      return res.status(500).json({ success: false, error: `No se pudo actualizar el stock en Supabase: ${updateProdRes.error}` });
    }

    // 3. Insertar movimiento en inventory_movements (si la tabla existe)
    const movementPayload = {
      organization_id: orgId,
      branch_id: product.branch_id || null,
      product_id: product.id || null,
      sku: product.sku,
      product_name: product.name,
      movement_type: movType,
      doc_type: 'AJUSTE',
      doc_number: autoDoc,
      entity_type: 'INTERNO',
      entity_name: 'Ajuste manual de stock',
      quantity: netDelta,
      unit_cost_usd: Number(product.cost_usd) || 0,
      unit_price_usd: Number(product.price_usd) || 0,
      exchange_rate: rate,
      total_usd: totalUsd,
      total_ves: totalVes,
      previous_stock: prevStock,
      new_stock: nextStock,
      reason: reason || 'Ajuste manual de inventario',
      notes: notes || null,
      created_at: new Date().toISOString()
    };

    let createdMovement = movementPayload;
    try {
      const movInsertRes = await queryDb('inventory_movements', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: movementPayload
      });
      if (!movInsertRes.error && movInsertRes.data && Array.isArray(movInsertRes.data) && movInsertRes.data[0]) {
        createdMovement = movInsertRes.data[0];
      }
    } catch {
      // ignore si la tabla inventory_movements no existe
    }

    // Persistir en almacenamiento local para garantizar que nunca se pierda
    savePersistedAdjustment(createdMovement);

    return res.json({
      success: true,
      data: createdMovement,
      new_stock: nextStock
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error registrando ajuste de inventario' });
  }
});

// ---------------------------------------------------------------------------
// 4.C ORDERS & COMMERCE PROXY (PUBLIC STORE & CONTROL DE PEDIDOS)
// ---------------------------------------------------------------------------
const ORDERS_FILE = path.resolve(DATA_DIR, 'orders.json');

function loadPersistedOrders(orgId?: string): any[] {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const content = fs.readFileSync(ORDERS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) {
          return list.filter((item: any) => !item.organization_id || item.organization_id === orgId);
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando pedidos persistentes:', err);
  }
  return [];
}

function savePersistedOrder(order: any) {
  try {
    const dir = path.dirname(ORDERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = loadPersistedOrders();
    const existingIdx = current.findIndex(
      (o: any) => o.id === order.id || (o.order_number && o.order_number === order.order_number)
    );
    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...order };
    } else {
      current.unshift(order);
    }
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(current.slice(0, 500), null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando pedido persistente:', err);
  }
}

app.get('/api/orders', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    let orgId = (res as AuthenticatedResponse).locals?.supabaseContext?.organizationId;
    if (!orgId) {
      orgId = '00000000-0000-0000-0000-000000000001';
    }

    let dbOrders: any[] = [];
    try {
      const token = (res as AuthenticatedResponse).locals?.supabaseContext?.accessToken;
      const queryRes = token
        ? await supabaseRestRequest('orders?select=*,order_items(*)&order=created_at.desc', {}, token)
        : await supabaseRestRequest('orders?select=*,order_items(*)&order=created_at.desc');
      if (!queryRes.error && Array.isArray(queryRes.data)) {
        dbOrders = queryRes.data.map((o: any) => ({
          ...o,
          items: Array.isArray(o.order_items) && o.order_items.length > 0 ? o.order_items : (o.items || [])
        }));
      }
    } catch {
      // Supabase table may not exist yet
    }

    const localOrders = loadPersistedOrders(orgId);
    const dbOrderNumbers = new Set(dbOrders.map((o: any) => o.order_number || o.id));

    for (const lOrder of localOrders) {
      if (!dbOrderNumbers.has(lOrder.order_number) && !dbOrderNumbers.has(lOrder.id)) {
        dbOrders.push(lOrder);
        dbOrderNumbers.add(lOrder.order_number || lOrder.id);
      }
    }

    dbOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({ success: true, data: dbOrders });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error consultando pedidos' });
  }
});

app.post('/api/orders', async (req, res) => {
  // Compra publica: cualquiera puede comprar, pero no se permite inundar el endpoint.
  const orderLimit = checkRateLimit(`orders:${getClientIp(req)}`, 10, 60 * 60_000);
  if (!orderLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: `Has alcanzado el lÃ­mite de pedidos por hora. Espera ${orderLimit.retryAfterSeconds} segundos.`
    });
  }

  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_doc,
      delivery_method = 'RETIRO',
      delivery_address = '',
      delivery_instructions = '',
      payment_method = 'PAGO_MOVIL',
      payment_status = 'PENDIENTE',
      payment_reference = null,
      currency = 'USD',
      exchange_rate,
      items = [],
      notes = '',
      branch_id = null,
      branch_name = 'Sede Principal'
    } = req.body || {};

    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre del cliente es obligatorio.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'El pedido debe contener al menos un producto.' });
    }

    // Si hay sesion iniciada, el pedido se vincula a la cuenta del cliente para
    // que aparezca en su portal. La sesion es la fuente de verdad: el correo
    // que envien el navegador solo se usa si no hay sesion.
    let sessionEmail = '';
    try {
      const session = await resolveRequestSession(req, res as AuthenticatedResponse);
      // El modo local guarda el correo en `local`; el modo Supabase, en `remote`.
      sessionEmail = (
        session?.remote?.user?.email ||
        session?.local?.email ||
        ''
      )
        .trim()
        .toLowerCase();
    } catch {
      sessionEmail = '';
    }
    const effectiveCustomerEmail = sessionEmail || (typeof customer_email === 'string' ? customer_email.trim() : '');

    const effectiveRate = Number(exchange_rate) || lastCertifiedRate?.appliedRate || 877.90;

    // 0. ValidaciÃ³n previa de existencia en inventario (bloquear stock insuficiente o negativo)
    for (const rawItem of items) {
      const itemSku = rawItem.sku;
      const reqQty = Math.max(1, Number(rawItem.quantity) || 1);
      if (!itemSku) continue;

      const prodRes = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(itemSku)}&limit=1`);
      if (!prodRes.error && Array.isArray(prodRes.data) && prodRes.data[0]) {
        const prod = prodRes.data[0];
        const currentStock = Number(prod.stock) || 0;
        if (currentStock < reqQty) {
          return res.status(400).json({
            success: false,
            error: `Stock insuficiente para "${prod.name || rawItem.name}" (SKU: ${itemSku}). Disponible: ${currentStock}, Cantidad solicitada: ${reqQty}. El sistema no permite ventas sin stock o en negativo.`
          });
        }
      }
    }

    const currentOrders = loadPersistedOrders();
    const nextSeq = currentOrders.length + 1;
    const orderNumber = `PED-${String(nextSeq).padStart(4, '0')}`;
    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    let subtotalUSD = 0;
    const processedItems = items.map((item: any, idx: number) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Number(item.unit_price_usd) || 0;
      const lineTotalUSD = Math.round(qty * unitPrice * 100) / 100;
      const { vesAmount: lineTotalVES } = calculateTransactionVES(lineTotalUSD, effectiveRate);
      subtotalUSD += lineTotalUSD;

      return {
        id: `item-${orderId}-${idx + 1}`,
        order_id: orderId,
        product_id: item.product_id || null,
        sku: item.sku || `SKU-${idx + 1}`,
        name: item.name || 'Producto',
        quantity: qty,
        unit_price_usd: unitPrice,
        total_usd: lineTotalUSD,
        total_ves: lineTotalVES
      };
    });

    const { vesAmount: totalVES } = calculateTransactionVES(subtotalUSD, Number(exchange_rate) || undefined);
    // effectiveRate is already defined at line 1593
    const totalUSD = Math.round(subtotalUSD * 100) / 100;
    const nowIso = new Date().toISOString();

    const newOrder = {
      id: orderId,
      organization_id: (res as AuthenticatedResponse).locals?.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001',
      branch_id,
      branch_name,
      order_number: orderNumber,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone ? String(customer_phone).trim() : '',
      customer_email: effectiveCustomerEmail,
      customer_doc: customer_doc ? String(customer_doc).trim() : '',
      delivery_method: delivery_method === 'DOMICILIO' ? 'DOMICILIO' : 'RETIRO',
      delivery_address: delivery_address ? String(delivery_address).trim() : '',
      delivery_instructions: delivery_instructions ? String(delivery_instructions).trim() : '',
      delivery_status: 'RECIBIDO',
      payment_method,
      payment_status,
      payment_reference: payment_reference ? String(payment_reference).trim() : null,
      currency: currency === 'VES' ? 'VES' : 'USD',
      exchange_rate: effectiveRate,
      is_future_rate: Boolean(lastCertifiedRate?.isFutureApplied),
      subtotal_usd: totalUSD,
      total_usd: totalUSD,
      total_ves: totalVES,
      notes: notes ? String(notes).trim() : '',
      activity_history: [
        {
          timestamp: nowIso,
          action: 'PEDIDO_CREADO',
          description: `Pedido ${orderNumber} registrado exitosamente (${delivery_method})`,
          user: customer_name.trim()
        }
      ],
      items: processedItems,
      completed_at: null,
      created_at: nowIso,
      updated_at: nowIso
    };

    // 1. Persistir en archivo seguro local
    savePersistedOrder(newOrder);

    // 2. Descontar stock de productos y registrar movimiento en inventario en tiempo real
    for (const it of processedItems) {
      if (!it.sku) continue;
      try {
        const prodRes = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(it.sku)}&limit=1`);
        if (!prodRes.error && Array.isArray(prodRes.data) && prodRes.data[0]) {
          const currentProd = prodRes.data[0];
          const prevStock = Number(currentProd.stock) || 0;
          const newStock = Math.max(0, prevStock - it.quantity);
          await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(it.sku)}`, {
            method: 'PATCH',
            body: { stock: newStock }
          });

          // Registrar movimiento en inventory_movements o respaldo local
          const movementData = {
            organization_id: newOrder.organization_id,
            branch_id: newOrder.branch_id || currentProd.branch_id || null,
            product_id: currentProd.id || null,
            sku: it.sku,
            product_name: currentProd.name || it.name,
            movement_type: 'VENTA',
            doc_type: 'PEDIDO_WEB',
            doc_number: newOrder.order_number,
            entity_type: 'CLIENTE',
            entity_name: newOrder.customer_name,
            quantity: -it.quantity,
            unit_cost_usd: Number(currentProd.cost_usd) || 0,
            unit_price_usd: it.unit_price_usd,
            exchange_rate: effectiveRate,
            total_usd: it.total_usd,
            total_ves: it.total_ves,
            previous_stock: prevStock,
            new_stock: newStock,
            reason: `Venta E-Commerce / Pedido Web #${newOrder.order_number}`,
            created_at: nowIso
          };

          try {
            await supabaseRestRequest('inventory_movements', {
              method: 'POST',
              body: movementData
            });
          } catch {
            // Guardar en respaldo persistente local si tabla aÃºn no existe en Supabase
            savePersistedAdjustment({ ...movementData, id: `mov-order-${it.sku}-${orderId}` });
          }
        }
      } catch (stockErr) {
        console.warn('Error descontando stock en pedido web:', stockErr);
      }
    }

    // 3. Intentar inserciÃ³n en Supabase si la tabla orders existe
    try {
      const sbOrderPayload = {
        id: orderId,
        organization_id: newOrder.organization_id,
        branch_id: newOrder.branch_id,
        order_number: newOrder.order_number,
        customer_name: newOrder.customer_name,
        customer_phone: newOrder.customer_phone,
        customer_email: newOrder.customer_email,
        customer_doc: newOrder.customer_doc,
        delivery_method: newOrder.delivery_method,
        delivery_address: newOrder.delivery_address,
        delivery_instructions: newOrder.delivery_instructions,
        delivery_status: newOrder.delivery_status,
        payment_method: newOrder.payment_method,
        payment_status: newOrder.payment_status,
        payment_reference: newOrder.payment_reference,
        currency: newOrder.currency,
        exchange_rate: newOrder.exchange_rate,
        is_future_rate: newOrder.is_future_rate,
        subtotal_usd: newOrder.subtotal_usd,
        total_usd: newOrder.total_usd,
        total_ves: newOrder.total_ves,
        notes: newOrder.notes,
        activity_history: newOrder.activity_history,
        created_at: newOrder.created_at,
        updated_at: newOrder.updated_at
      };
      await supabaseRestRequest('orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: sbOrderPayload
      });

      const sbItemsPayload = processedItems.map((pi: any) => ({
        order_id: orderId,
        sku: pi.sku,
        name: pi.name,
        quantity: pi.quantity,
        unit_price_usd: pi.unit_price_usd,
        total_usd: pi.total_usd,
        total_ves: pi.total_ves
      }));
      await supabaseRestRequest('order_items', {
        method: 'POST',
        body: sbItemsPayload
      });
    } catch {
      // ignore
    }

    return res.json({ success: true, data: newOrder });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error procesando pedido' });
  }
});

app.patch('/api/orders/:id/delivery-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user = 'Operador', notes } = req.body || {};
    const validStatuses = ['RECIBIDO', 'PREPARADO', 'LISTO_PARA_ENTREGAR', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado de entrega no vÃ¡lido.' });
    }

    const currentOrders = loadPersistedOrders();
    const orderIdx = currentOrders.findIndex((o: any) => o.id === id || o.order_number === id);
    if (orderIdx === -1) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
    }

    const order = currentOrders[orderIdx];
    const prevStatus = order.delivery_status;

    // Reglas de transiciÃ³n de estado
    if (prevStatus === 'CANCELADO' && status !== 'CANCELADO') {
      return res.status(400).json({ success: false, error: 'Un pedido cancelado no puede reactivarse directamente.' });
    }
    if (prevStatus === 'ENTREGADO' && status !== 'ENTREGADO') {
      return res.status(400).json({ success: false, error: 'El pedido ya fue entregado y no puede retroceder de estado.' });
    }

    const nowIso = new Date().toISOString();
    order.delivery_status = status;
    order.updated_at = nowIso;
    if (status === 'ENTREGADO') {
      order.completed_at = nowIso;
    }

    const auditEntry = {
      timestamp: nowIso,
      action: 'CAMBIO_ESTADO_ENTREGA',
      description: `Estado de entrega actualizado: ${prevStatus} â†’ ${status}${notes ? ` (${notes})` : ''}`,
      user: String(user)
    };
    if (!Array.isArray(order.activity_history)) order.activity_history = [];
    order.activity_history.push(auditEntry);

    savePersistedOrder(order);

    // Intentar actualizar en Supabase si estÃ¡ disponible
    try {
      await supabaseRestRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          delivery_status: status,
          completed_at: order.completed_at,
          updated_at: nowIso,
          activity_history: order.activity_history
        }
      });
    } catch {
      // ignore
    }

    return res.json({ success: true, data: order });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error actualizando estado de entrega' });
  }
});

app.patch('/api/orders/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user = 'Operador', reference } = req.body || {};
    const validStatuses = ['PENDIENTE', 'PAGADO', 'REEMBOLSADO'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado de pago no vÃ¡lido.' });
    }

    const currentOrders = loadPersistedOrders();
    const orderIdx = currentOrders.findIndex((o: any) => o.id === id || o.order_number === id);
    if (orderIdx === -1) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
    }

    const order = currentOrders[orderIdx];
    const prevStatus = order.payment_status;
    const nowIso = new Date().toISOString();

    order.payment_status = status;
    if (reference) order.payment_reference = reference;
    order.updated_at = nowIso;

    const auditEntry = {
      timestamp: nowIso,
      action: 'CAMBIO_ESTADO_PAGO',
      description: `Estado del pago actualizado: ${prevStatus} â†’ ${status}${reference ? ` (Ref: ${reference})` : ''}`,
      user: String(user)
    };
    if (!Array.isArray(order.activity_history)) order.activity_history = [];
    order.activity_history.push(auditEntry);

    savePersistedOrder(order);

    // Intentar actualizar en Supabase
    try {
      await supabaseRestRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          payment_status: status,
          payment_reference: order.payment_reference,
          updated_at: nowIso,
          activity_history: order.activity_history
        }
      });
    } catch {
      // ignore
    }

    return res.json({ success: true, data: order });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error actualizando estado de pago' });
  }
});

app.get('/api/public/organization', async (_req, res) => {
  let organizationId = '00000000-0000-0000-0000-000000000001';

  if (isSupabaseConfigured) {
    const result = await supabaseRestRequest('organizations?select=id&limit=1');
    if (!result.error && Array.isArray(result.data) && result.data[0]?.id) {
      organizationId = result.data[0].id;
    }
  }

  res.json({ success: true, data: { organizationId } });
});

app.get('/api/public/config', async (_req, res) => {
  const effectiveRate = lastCertifiedRate?.appliedRate || 877.90;
  const rateDate = lastCertifiedRate?.valueDate || 'Hoy';

  // Intentar obtener el logo/favicon desde la tabla organizations (service role,
  // ya que este endpoint es público y no hay sesión de usuario).
  let orgLogo: string | null = null;
  let orgFavicon: string | null = null;
  let orgName: string | null = null;
  let orgPhone: string | null = null;
  let orgWhatsapp: string | null = null;
  let orgEmail: string | null = null;
  let orgAddress: string | null = null;
  let orgSlogan: string | null = null;
  try {
    const orgRes = await supabaseServiceRestRequest('organizations?select=name,phone,whatsapp,email,address,slogan,logo,favicon&limit=1');
    if (!orgRes.error && Array.isArray(orgRes.data) && orgRes.data.length > 0) {
      const o = orgRes.data[0];
      orgLogo = o.logo || null;
      orgFavicon = o.favicon || null;
      orgName = o.name || null;
      orgPhone = o.phone || null;
      orgWhatsapp = o.whatsapp || null;
      orgEmail = o.email || null;
      orgAddress = o.address || null;
      orgSlogan = o.slogan || null;
    }
  } catch {
    // ignore
  }

  return res.json({
    success: true,
    data: {
      businessName: orgName || 'Frenyer, C.A.',
      rif: 'J-123456789',
      phone: orgPhone || '+58 212 555 1212',
      whatsapp: orgWhatsapp || '+58 412 000 0000',
      email: orgEmail || 'contacto@frenyer.com',
      address: orgAddress || 'Av. Francisco de Miranda, Centro Financiero, Caracas, Venezuela',
      slogan: orgSlogan || 'Tu aliado comercial bimonetario',
      logo: orgLogo,
      favicon: orgFavicon,
      bcvRate: effectiveRate,
      bcvRateDate: rateDate,
      branches: [
        { id: 'suc-01', name: 'Sede Principal - Despacho Central', address: 'Av. Francisco de Miranda, Caracas' },
        { id: 'suc-02', name: 'Sucursal Chacao', address: 'Calle BolÃ­var, Chacao' },
        { id: 'suc-03', name: 'AlmacÃ©n Los Ruices', address: 'Zona Industrial Los Ruices' }
      ]
    }
  });
});

// ---------------------------------------------------------------------------
// PERSISTENCIA LOCAL GENERICA
// Respaldo en disco de las colecciones que todavia no tienen archivo propio.
// Permite operar el ERP aunque Supabase no este disponible.
// ---------------------------------------------------------------------------
interface LocalCollection {
  file: string;
  load(orgId?: string): any[];
  save(items: any[]): void;
  upsert(item: any, matchKeys: string[]): any;
  remove(predicate: (row: any) => boolean): void;
}

function createLocalCollection(fileName: string): LocalCollection {
  const file = path.resolve(DATA_DIR, fileName);

  const readAll = (): any[] => {
    try {
      if (fs.existsSync(file)) {
        const list = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (Array.isArray(list)) return list;
      }
    } catch (err) {
      console.warn(`Aviso cargando ${fileName}:`, err);
    }
    return [];
  };

  const writeAll = (items: any[]) => {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`Aviso guardando ${fileName}:`, err);
    }
  };

  return {
    file,
    load(orgId?: string) {
      const list = readAll();
      if (!orgId) return list;
      return list.filter((row: any) => !row.organization_id || row.organization_id === orgId);
    },
    save: writeAll,
    upsert(item: any, matchKeys: string[]) {
      const list = readAll();
      const idx = list.findIndex((row: any) =>
        matchKeys.some((key) => row[key] !== undefined && row[key] === item[key])
      );
      if (idx >= 0) list[idx] = { ...list[idx], ...item };
      else list.unshift(item);
      writeAll(list);
      return item;
    },
    remove(predicate: (row: any) => boolean) {
      writeAll(readAll().filter((row: any) => !predicate(row)));
    }
  };
}

const localCustomers = createLocalCollection('customers.json');
const localSales = createLocalCollection('sales.json');
const localQuotes = createLocalCollection('quotes.json');
const localExpenses = createLocalCollection('expenses.json');
const localExpenseCategories = createLocalCollection('expense_categories.json');
const localExchangeRateHistory = createLocalCollection('exchange_rate_history.json');
const localCustomerWishlist = createLocalCollection('customer_wishlist.json');
const localShopCustomers = createLocalCollection('shop_customers.json');

// ---------------------------------------------------------------------------
// 4.E PORTAL DE CLIENTE (E-COMMERCE)
// El cliente autenticado consulta unicamente su propia informacion. El
// identificador se toma siempre de la sesion del servidor: nunca del cuerpo
// de la peticion, para evitar acceso horizontal a datos de otros clientes.
// ---------------------------------------------------------------------------

/** Datos minimos del cliente autenticado segun la sesion httpOnly. */
function resolveCustomerSession(res: AuthenticatedResponse): { email: string; userId: string; organizationId: string } | null {
  const context = res.locals.supabaseContext;
  if (!context) return null;
  const email = (context.userEmail || '').trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    userId: context.userId || '',
    organizationId: context.organizationId || '00000000-0000-0000-0000-000000000001'
  };
}

/** Pedidos web que pertenecen al cliente, uniendo Supabase y el respaldo local. */
async function loadCustomerOrders(email: string, organizationId: string, accessToken?: string): Promise<any[]> {
  const normalized = email.trim().toLowerCase();
  const byNumber = new Map<string, any>();

  try {
    const queryRes = await supabaseRestRequest(
      'orders?select=*,order_items(*)&customer_email=eq.' + encodeURIComponent(normalized) + '&order=created_at.desc',
      {},
      accessToken
    );
    if (!queryRes.error && Array.isArray(queryRes.data)) {
      for (const order of queryRes.data) {
        const key = order.order_number || order.id;
        byNumber.set(key, {
          ...order,
          items: Array.isArray(order.order_items) && order.order_items.length > 0 ? order.order_items : (order.items || [])
        });
      }
    }
  } catch {
    // La tabla orders puede no existir todavia en el proyecto.
  }

  for (const localOrder of loadPersistedOrders(organizationId)) {
    const orderEmail = (localOrder.customer_email || '').trim().toLowerCase();
    if (orderEmail !== normalized) continue;
    const key = localOrder.order_number || localOrder.id;
    if (!byNumber.has(key)) byNumber.set(key, localOrder);
  }

  return Array.from(byNumber.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

/** Historial de compras del cliente en el ERP (facturas y cuentas por cobrar). */
async function loadCustomerPurchases(email: string, organizationId: string): Promise<any[]> {
  const normalized = email.trim().toLowerCase();
  const purchases: any[] = [];

  try {
    const customersRes = await supabaseRestRequest(
      'customers?select=id,name,email,phone&email=eq.' + encodeURIComponent(normalized) + '&organization_id=eq.' + encodeURIComponent(organizationId),
      {}
    );
    const customerIds: string[] = [];
    if (!customersRes.error && Array.isArray(customersRes.data)) {
      for (const customer of customersRes.data) {
        if (customer.id) customerIds.push(customer.id);
      }
    }

    if (customerIds.length > 0) {
      const idsParam = customerIds.map((id) => encodeURIComponent(id)).join(',');
      const salesRes = await supabaseRestRequest(
        'sales?select=*,sale_items(*)&customer_id=in.(' + idsParam + ')&order=created_at.desc',
        {}
      );
      if (!salesRes.error && Array.isArray(salesRes.data)) {
        for (const sale of salesRes.data) {
          purchases.push({
            id: sale.id,
            doc_number: sale.doc_number,
            doc_type: sale.doc_type,
            status: sale.status,
            payment_type: sale.payment_type,
            subtotal_usd: Number(sale.subtotal_usd) || 0,
            discount_usd: Number(sale.discount_usd) || 0,
            total_usd: Number(sale.total_usd) || 0,
            total_ves: Number(sale.total_ves) || 0,
            exchange_rate: Number(sale.exchange_rate) || 0,
            created_at: sale.created_at,
            items: (sale.sale_items || []).map((item: any) => ({
              sku: item.sku,
              name: item.name,
              quantity: Number(item.quantity) || 0,
              unit_price_usd: Number(item.unit_price_usd) || 0,
              total_usd: Number(item.total_usd) || 0,
              total_ves: Number(item.total_ves) || 0
            }))
          });
        }
      }
    }
  } catch {
    // Sin acceso a Supabase: se continua con el respaldo local.
  }

  if (purchases.length === 0) {
    for (const sale of localSales.load(organizationId)) {
      const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
      const customerEmail = ((customer && customer.email) || '').trim().toLowerCase();
      if (customerEmail !== normalized) continue;
      purchases.push({
        id: sale.id,
        doc_number: sale.doc_number,
        doc_type: sale.doc_type,
        status: sale.status,
        payment_type: sale.payment_type,
        subtotal_usd: Number(sale.subtotal_usd) || 0,
        discount_usd: Number(sale.discount_usd) || 0,
        total_usd: Number(sale.total_usd) || 0,
        total_ves: Number(sale.total_ves) || 0,
        exchange_rate: Number(sale.exchange_rate) || 0,
        created_at: sale.created_at,
        items: (sale.sale_items || []).map((item: any) => ({
          sku: item.sku,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          unit_price_usd: Number(item.unit_price_usd) || 0,
          total_usd: Number(item.total_usd) || 0,
          total_ves: Number(item.total_ves) || 0
        }))
      });
    }
  }

  // Ademas, vincular facturas digitales de pedidos pagados o completados del cliente
  for (const localOrder of loadPersistedOrders(organizationId)) {
    const orderEmail = (localOrder.customer_email || '').trim().toLowerCase();
    if (orderEmail !== normalized) continue;
    const orderNum = localOrder.order_number || String(localOrder.id || '').slice(0, 6);
    const docNum = `FAC-2026-${String(orderNum).replace(/\D/g, '').padStart(3, '0').slice(-3)}`;
    if (!purchases.some((p: any) => p.doc_number === docNum || p.order_number === orderNum)) {
      purchases.push({
        id: `fac-${localOrder.id || orderNum}`,
        doc_number: docNum,
        order_number: orderNum,
        doc_type: 'FACTURA',
        status: localOrder.payment_status === 'PAGADO' ? 'PAGADA' : (localOrder.payment_status || 'PAGADA'),
        payment_type: localOrder.payment_method === 'PAGO_MOVIL' ? 'PAGOMÓVIL' : (localOrder.payment_method || 'CONTADO'),
        total_usd: Number(localOrder.total_usd) || 0,
        total_ves: Number(localOrder.total_ves) || 0,
        created_at: localOrder.created_at,
        items: localOrder.items || []
      });
    }
  }

  return purchases.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

/** Lista de deseos del cliente, con respaldo en disco cuando no hay tabla. */
function loadCustomerWishlist(email: string, organizationId: string): any[] {
  const normalized = email.trim().toLowerCase();
  return localCustomerWishlist
    .load(organizationId)
    .filter((row: any) => String(row.customer_email || '').trim().toLowerCase() === normalized)
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

app.get('/api/customer/portal', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = resolveCustomerSession(res);
    if (!customer) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesion para ver tu portal de cliente.' });
    }

    // Guarda la ficha del cliente: la cabecera siempre la necesita y es una lectura barata.
    let profile: any = null;
    try {
      const profilesRes = await supabaseRestRequest(
        'profiles?select=id,email,full_name,role&email=eq.' + encodeURIComponent(customer.email) + '&limit=1',
        {}
      );
      if (!profilesRes.error && Array.isArray(profilesRes.data) && profilesRes.data[0]) {
        profile = profilesRes.data[0];
      }
    } catch {
      // Perfil no disponible
    }

    const localCust = localShopCustomers.load(customer.organizationId).find(
      (row: any) => String(row.email || '').trim().toLowerCase() === customer.email
    );

    const customerBlock = {
      email: customer.email,
      full_name: localCust?.full_name || profile?.full_name || customer.email.split('@')[0],
      document_id: localCust?.document_id || localCust?.rif || 'V-',
      phone: localCust?.phone || '',
      addresses: Array.isArray(localCust?.addresses) ? localCust.addresses : (localCust?.address ? [localCust.address] : []),
      role: profile?.role || 'cliente',
      organization_id: customer.organizationId
    };

    // Modo por secciones: el cliente pide una pantalla y solo esa viaja en la respuesta.
    const section = String(req.query?.section || '').trim().toLowerCase();

    if (section === 'profile') {
      return res.json({ success: true, data: { customer: customerBlock } });
    }

    if (section === 'orders') {
      const orders = await loadCustomerOrders(customer.email, customer.organizationId, res.locals.supabaseContext?.accessToken);
      return res.json({ success: true, data: { customer: customerBlock, orders } });
    }

    if (section === 'purchases') {
      const purchases = await loadCustomerPurchases(customer.email, customer.organizationId);
      return res.json({ success: true, data: { customer: customerBlock, purchases } });
    }

    if (section === 'wishlist') {
      return res.json({ success: true, data: { customer: customerBlock, wishlist: loadCustomerWishlist(customer.email, customer.organizationId) } });
    }

    // Sin sección: carga completa (retrocompatibilidad con la tienda).
    const accessToken = res.locals.supabaseContext?.accessToken;
    const [orders, purchases, wishlist] = await Promise.all([
      loadCustomerOrders(customer.email, customer.organizationId, accessToken),
      loadCustomerPurchases(customer.email, customer.organizationId),
      Promise.resolve(loadCustomerWishlist(customer.email, customer.organizationId))
    ]);

    return res.json({
      success: true,
      data: {
        customer: customerBlock,
        orders,
        purchases,
        wishlist
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error cargando el portal de cliente.' });
  }
});

app.post('/api/customer/profile', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = resolveCustomerSession(res);
    if (!customer) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesión para editar tu perfil.' });
    }

    const { full_name, document_id, phone } = req.body || {};
    const orgId = customer.organizationId;
    const all = localShopCustomers.load(orgId);
    let matched = all.find((row: any) => String(row.email || '').trim().toLowerCase() === customer.email);

    if (matched) {
      if (full_name) matched.full_name = String(full_name).trim();
      if (document_id !== undefined) matched.document_id = String(document_id).trim();
      if (phone !== undefined) matched.phone = String(phone).trim();
      matched.updated_at = new Date().toISOString();
      localShopCustomers.save(all);
    } else {
      matched = {
        id: customer.userId || `cust-${Date.now()}`,
        email: customer.email,
        full_name: String(full_name || customer.email.split('@')[0]).trim(),
        document_id: String(document_id || 'V-').trim(),
        phone: String(phone || '').trim(),
        addresses: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      localShopCustomers.save([...all, matched]);
    }

    if (isSupabaseConfigured && customer.userId) {
      try {
        await supabaseServer.auth.admin.updateUserById(customer.userId, {
          user_metadata: { full_name: matched.full_name, phone: matched.phone, document_id: matched.document_id }
        });
      } catch {
        // ignore
      }
    }

    return res.json({ success: true, data: matched });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error actualizando perfil.' });
  }
});

app.post('/api/customer/addresses', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = resolveCustomerSession(res);
    if (!customer) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesión.' });
    }

    const { action, address } = req.body || {};
    const orgId = customer.organizationId;
    const all = localShopCustomers.load(orgId);
    let matched = all.find((row: any) => String(row.email || '').trim().toLowerCase() === customer.email);

    if (!matched) {
      matched = {
        id: customer.userId || `cust-${Date.now()}`,
        email: customer.email,
        full_name: customer.email.split('@')[0],
        addresses: [],
        created_at: new Date().toISOString()
      };
      all.push(matched);
    }

    if (!Array.isArray(matched.addresses)) {
      matched.addresses = matched.address ? [matched.address] : [];
    }

    if (action === 'add' && address) {
      const clean = String(address).trim();
      if (clean && !matched.addresses.includes(clean)) {
        matched.addresses.push(clean);
      }
    } else if (action === 'remove' && address) {
      matched.addresses = matched.addresses.filter((a: string) => a !== address);
    }

    localShopCustomers.save(all);
    return res.json({ success: true, data: { addresses: matched.addresses } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error modificando direcciones.' });
  }
});

app.post('/api/customer/change-password', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = resolveCustomerSession(res);
    if (!customer) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesión.' });
    }

    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe contener al menos 6 caracteres.' });
    }

    if (isSupabaseConfigured && customer.userId) {
      const { error } = await supabaseServer.auth.admin.updateUserById(customer.userId, { password });
      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
    }

    return res.json({ success: true, message: '¡Contraseña actualizada con éxito!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error actualizando contraseña.' });
  }
});

app.get('/api/orders/track/:query', async (req, res) => {
  try {
    const rawQuery = String(req.params.query || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ success: false, error: 'Especifica un número de pedido o documento.' });
    }

    const cleanNum = rawQuery.replace(/^#/, '').replace(/^FAC-/, '').replace(/^PED-/, '').trim();
    const cleanDigits = rawQuery.replace(/\D/g, '');
    const cleanNumInt = cleanDigits ? parseInt(cleanDigits, 10) : NaN;
    const orgId = '00000000-0000-0000-0000-000000000001';

    // 1. Buscar en pedidos locales
    const allOrders = loadPersistedOrders(orgId);
    let matched = allOrders.find((o: any) => {
      const oNum = String(o.order_number || '').trim();
      const oDigits = oNum.replace(/\D/g, '');
      const oNumInt = oDigits ? parseInt(oDigits, 10) : NaN;

      if (o.id === rawQuery || oNum === rawQuery || oNum === cleanNum) return true;
      if (!isNaN(cleanNumInt) && !isNaN(oNumInt) && cleanNumInt === oNumInt) return true;
      if (cleanDigits && oDigits && (cleanDigits === oDigits || oDigits.endsWith(cleanDigits))) return true;
      if (o.customer_phone && cleanDigits.length >= 7 && o.customer_phone.replace(/\D/g, '').endsWith(cleanDigits)) return true;
      return false;
    });

    // 2. Si no esta en local y Supabase esta configurado, consultar Supabase
    if (!matched) {
      try {
        const queryRes = await supabaseRestRequest(
          `orders?select=*,order_items(*)&or=(order_number.eq.${encodeURIComponent(cleanNum)},id.eq.${encodeURIComponent(rawQuery)})&limit=1`
        );
        if (!queryRes.error && Array.isArray(queryRes.data) && queryRes.data[0]) {
          const o = queryRes.data[0];
          matched = {
            ...o,
            items: Array.isArray(o.order_items) && o.order_items.length > 0 ? o.order_items : (o.items || [])
          };
        }
      } catch {
        // ignore
      }
    }

    if (!matched) {
      return res.status(404).json({ success: false, error: `No se encontró ningún pedido con el número "${rawQuery}".` });
    }

    return res.json({ success: true, data: matched });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error rastreando pedido.' });
  }
});

app.post('/api/customer/wishlist', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = resolveCustomerSession(res);
    if (!customer) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesion para usar tu lista de deseos.' });
    }

    const productId = String(req.body?.product_id || '').trim();
    if (!productId) {
      return res.status(400).json({ success: false, error: 'El producto es obligatorio.' });
    }

    const existing = loadCustomerWishlist(customer.email, customer.organizationId);
    const alreadySaved = existing.some((row: any) => row.product_id === productId);
    const updatedForCustomer = alreadySaved
      ? existing.filter((row: any) => row.product_id !== productId)
      : [
          {
            id: `wish-${customer.userId || customer.email}-${productId}`,
            customer_email: customer.email,
            customer_id: customer.userId,
            organization_id: customer.organizationId,
            product_id: productId,
            sku: String(req.body?.sku || ''),
            name: String(req.body?.name || ''),
            price_usd: Number(req.body?.price_usd) || 0,
            image_url: String(req.body?.image_url || ''),
            created_at: new Date().toISOString()
          },
          ...existing
        ];

    // Se conservan las filas de los demas clientes del mismo inquilino.
    const otherCustomers = localCustomerWishlist
      .load(customer.organizationId)
      .filter((row: any) => String(row.customer_email || '').trim().toLowerCase() !== customer.email);
    localCustomerWishlist.save([...updatedForCustomer, ...otherCustomers]);

    return res.json({ success: true, data: { saved: !alreadySaved, wishlist: updatedForCustomer } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error actualizando la lista de deseos.' });
  }
});


// ---------------------------------------------------------------------------
// 5. CUSTOMERS BACKEND PROXY
// ---------------------------------------------------------------------------
app.get('/api/customers', async (_req, res: AuthenticatedResponse) => {
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'customers?select=*&order=name.asc');
    if (result.error) {
      const local = localCustomers.load(res.locals.supabaseContext?.organizationId);
      return res.status(200).json({ success: true, data: local, source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    const local = localCustomers.load(res.locals.supabaseContext?.organizationId);
    return res.status(200).json({ success: true, data: local, source: 'local' });
  }
});

app.post('/api/customers', async (req, res: AuthenticatedResponse) => {
  try {
    const customer = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'customers', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: customer
    });

    if (result.error) {
      const saved = localCustomers.upsert(
        { ...customer, organization_id: customer.organization_id || res.locals.supabaseContext?.organizationId },
        ['id', 'code']
      );
      return res.json({ success: true, data: saved, source: 'local' });
    }

    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.patch('/api/customers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const customerId = req.params.id;
    const result = await authenticatedSupabaseRestRequest(res, `customers?id=eq.${encodeURIComponent(customerId)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: req.body
    });

    if (result.error) {
      const saved = localCustomers.upsert({ ...req.body, id: customerId }, ['id']);
      return res.json({ success: true, data: saved, source: 'local' });
    }

    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.delete('/api/customers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const customerId = req.params.id;
    const result = await authenticatedSupabaseRestRequest(res, `customers?id=eq.${encodeURIComponent(customerId)}`, {
      method: 'DELETE'
    });

    if (result.error) {
      localCustomers.remove((row: any) => row.id === customerId);
      return res.json({ success: true, source: 'local' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.get('/api/quotes', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    let dbQuotes: any[] = [];
    try {
      let result = await authenticatedSupabaseRestRequest(
        res,
        `sales?doc_type=eq.COTIZACION&select=id,organization_id,customer_id,doc_number,status,payment_type,exchange_rate,subtotal_usd,total_usd,total_ves,notes,quote_status,expires_at,converted_to_sale_id,created_at,customers(id,name,phone,doc_type,doc_number,email),sale_items(id,sku,name,quantity,unit_price_usd,total_usd,total_ves)&order=created_at.desc`
      );

      if (result.error) {
        result = await authenticatedSupabaseRestRequest(
          res,
          `sales?doc_type=eq.COTIZACION&select=id,organization_id,customer_id,doc_number,status,payment_type,exchange_rate,subtotal_usd,total_usd,total_ves,notes,created_at&order=created_at.desc`
        );
      }

      if (!result.error && Array.isArray(result.data)) {
        dbQuotes = result.data.map((item: any) => ({
          ...item,
          quote_status: item.quote_status || (item.status === 'CANCELADA' ? 'Rechazada' : 'Creada')
        }));
      }
    } catch {}

    const localList = localQuotes.load(orgId);
    const map = new Map<string, any>();
    for (const item of localList) if (item.id) map.set(item.id, item);
    for (const item of dbQuotes) if (item.id) {
      const local = map.get(item.id) || {};
      map.set(item.id, { ...local, ...item });
    }
    const merged = Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return res.json({ success: true, data: merged });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: localQuotes.load(res.locals.supabaseContext?.organizationId), source: 'local' });
  }
});

app.get('/api/quotes/migration-sql', (_req, res) => {
  try {
    const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '0011_quotes_module.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(sql);
    }
    return res.status(404).json({ success: false, error: 'MigraciÃ³n de cotizaciones no encontrada' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/quotes', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || req.body.organizationId || '00000000-0000-0000-0000-000000000001';
    const { customerId, validityDays, notes, items, exchangeRate, rateSource, isFutureRate, rateValueDate } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Datos de cotizaciÃ³n incompletos (cliente e Ã­tems requeridos).' });
    }

    const rate = Number(exchangeRate) || 1;
    const subtotal = items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0), 0);
    const totalVes = Math.round(subtotal * rate * 100) / 100;

    // Obtener siguiente correlativo de cotizaciÃ³n
    const latestSales = await authenticatedSupabaseRestRequest(
      res,
      `sales?organization_id=eq.${encodeURIComponent(orgId)}&doc_type=eq.COTIZACION&select=doc_number&order=created_at.desc&limit=1`
    );
    let nextNum = 1;
    if (Array.isArray(latestSales.data) && latestSales.data.length > 0 && latestSales.data[0].doc_number) {
      nextNum = (parseInt(latestSales.data[0].doc_number, 10) || 0) + 1;
    }
    const docNumber = String(nextNum).padStart(4, '0');
    const expiresAt = new Date(Date.now() + (Math.max(1, validityDays || 7)) * 86400000).toISOString();

    // 1. Intentar insertar en sales con quote_status y expires_at
    const salePayload: any = {
      organization_id: orgId,
      customer_id: customerId || null,
      doc_type: 'COTIZACION',
      doc_number: docNumber,
      status: 'COMPLETADA',
      payment_type: 'CONTADO',
      exchange_rate: rate,
      subtotal_usd: subtotal,
      discount_usd: 0,
      tax_usd: 0,
      igtf_usd: 0,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: notes ? String(notes).trim() : null,
      quote_status: 'Creada',
      expires_at: expiresAt
    };

    let insertSale = await authenticatedSupabaseRestRequest(res, 'sales', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: salePayload
    });

    // Si fallÃ³ por falta de la columna quote_status o expires_at, reintentar sin ellas
    if (
      insertSale.error &&
      typeof insertSale.error === 'string' &&
      (insertSale.error.includes('quote_status') || insertSale.error.includes('expires_at') || insertSale.error.includes('column') || insertSale.error.includes('42703'))
    ) {
      delete salePayload.quote_status;
      delete salePayload.expires_at;
      insertSale = await authenticatedSupabaseRestRequest(res, 'sales', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: salePayload
      });
    }

    if (insertSale.error) {
      // Respaldo local: la cotizacion queda registrada en disco.
      const localId = `quote-${Date.now()}`;
      const localItems = items.map((it: any) => {
        const q = Math.max(1, Number(it.quantity) || 1);
        const p = Math.max(0, Number(it.unit_price_usd) || 0);
        return {
          sale_id: localId,
          sku: it.sku || null,
          name: it.name || 'Producto',
          quantity: q,
          unit_price_usd: p,
          total_usd: Math.round(p * q * 100) / 100,
          total_ves: Math.round(p * q * rate * 100) / 100
        };
      });

      const localQuote = {
        ...salePayload,
        id: localId,
        doc_type: 'COTIZACION',
        sale_items: localItems
      };
      localQuotes.upsert(localQuote, ['id']);
      localSales.upsert(localQuote, ['id']);

      return res.json({
        success: true,
        quoteId: localId,
        docNumber,
        source: 'local',
        data: { ...localQuote, sale_items: localItems }
      });
    }

    const createdSale = Array.isArray(insertSale.data) ? insertSale.data[0] : insertSale.data;
    const saleId = createdSale?.id;

    if (!saleId) {
      return res.status(200).json({ success: false, error: 'No se obtuvo el identificador de la cotizaciÃ³n generada.' });
    }

    // Insertar Ã­tems en sale_items
    const itemsPayload = items.map((it: any) => {
      const q = Math.max(1, Number(it.quantity) || 1);
      const p = Math.max(0, Number(it.unit_price_usd) || 0);
      return {
        sale_id: saleId,
        sku: it.sku || null,
        name: it.name || 'Producto',
        quantity: q,
        unit_price_usd: p,
        total_usd: Math.round(p * q * 100) / 100,
        total_ves: Math.round(p * q * rate * 100) / 100
      };
    });

    const insertItems = await authenticatedSupabaseRestRequest(res, 'sale_items', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: itemsPayload
    });

    return res.json({
      success: true,
      quoteId: saleId,
      docNumber,
      data: {
        ...createdSale,
        doc_number: docNumber,
        sale_items: insertItems.data || itemsPayload
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error en servidor registrando cotizaciÃ³n.' });
  }
});

// Actualizacion de una cotizacion (cabecera e items) resuelta por el servidor
app.patch('/api/quotes/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const quoteId = req.params.id;
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const { customerId, validityDays, notes, items, exchangeRate } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'La cotizaciÃ³n debe tener al menos un Ã­tem.' });
    }

    const rate = Number(exchangeRate) || 1;
    const subtotal = items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0), 0);
    const totalVes = Math.round(subtotal * rate * 100) / 100;

    const updateData: Record<string, any> = {
      customer_id: customerId || null,
      exchange_rate: rate,
      subtotal_usd: subtotal,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: notes ? String(notes).trim() : null
    };

    if (validityDays) {
      updateData.expires_at = new Date(Date.now() + Number(validityDays) * 86400000).toISOString();
    }

    const updated = await authenticatedSupabaseRestRequest(
      res,
      `sales?id=eq.${encodeURIComponent(quoteId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
      {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: updateData
      }
    );

    if (updated.error) {
      const saved = localQuotes.upsert({ ...updateData, id: quoteId }, ['id']);
      return res.json({ success: true, data: { id: quoteId, ...saved }, source: 'local' });
    }

    await authenticatedSupabaseRestRequest(res, `sale_items?sale_id=eq.${encodeURIComponent(quoteId)}`, {
      method: 'DELETE'
    });

    const itemsPayload = items.map((it: any) => {
      const q = Math.max(1, Number(it.quantity) || 1);
      const p = Math.max(0, Number(it.unit_price_usd) || 0);
      return {
        sale_id: quoteId,
        sku: it.sku || null,
        name: it.name || 'Producto',
        quantity: q,
        unit_price_usd: p,
        total_usd: Math.round(p * q * 100) / 100,
        total_ves: Math.round(p * q * rate * 100) / 100
      };
    });

    const insertItems = await authenticatedSupabaseRestRequest(res, 'sale_items', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: itemsPayload
    });

    return res.json({
      success: true,
      data: { id: quoteId, ...updateData, sale_items: insertItems.data || itemsPayload }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error en servidor actualizando cotizaciÃ³n.' });
  }
});

// Cambio de estado de una cotizacion (rechazar, aceptar, etc.)
app.patch('/api/quotes/:id/status', async (req, res: AuthenticatedResponse) => {
  try {
    const quoteId = req.params.id;
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, error: 'Debe indicar el estado de la cotizaciÃ³n.' });
    }

    const updated = await authenticatedSupabaseRestRequest(
      res,
      `sales?id=eq.${encodeURIComponent(quoteId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
      {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: { quote_status: String(status) }
      }
    );

    if (updated.error) {
      // Some projects do not expose quote_status: fall back to the sale status.
      const fallback = await authenticatedSupabaseRestRequest(
        res,
        `sales?id=eq.${encodeURIComponent(quoteId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
        {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: { status: String(status) === 'Rechazada' ? 'CANCELADA' : String(status) }
        }
      );
      if (fallback.error) {
        const saved = localQuotes.upsert({ quote_status: String(status), id: quoteId }, ['id']);
        return res.json({ success: true, data: saved, source: 'local' });
      }
      return res.json({ success: true, data: fallback.data });
    }

    return res.json({ success: true, data: updated.data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error en servidor cambiando el estado de la cotizaciÃ³n.' });
  }
});

// Eliminacion de una cotizacion
app.delete('/api/quotes/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const quoteId = req.params.id;
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';

    await authenticatedSupabaseRestRequest(res, `sale_items?sale_id=eq.${encodeURIComponent(quoteId)}`, {
      method: 'DELETE'
    });

    const deleted = await authenticatedSupabaseRestRequest(
      res,
      `sales?id=eq.${encodeURIComponent(quoteId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
      { method: 'DELETE' }
    );

    if (deleted.error) {
      localQuotes.remove((row: any) => row.id === quoteId);
      localSales.remove((row: any) => row.id === quoteId);
      return res.json({ success: true, source: 'local' });
    }

    return res.json({ success: true, data: { id: quoteId } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error en servidor eliminando cotizaciÃ³n.' });
  }
});

// ---------------------------------------------------------------------------
// 6. BANK ACCOUNTS, PAYMENT METHODS & MOVEMENTS BACKEND PROXY
// ---------------------------------------------------------------------------

// 6.1 BANK ACCOUNTS
// 6.1 BANK ACCOUNTS (RESILIENT DUAL PERSISTENCE)
const BANK_ACCOUNTS_FILE = path.resolve(DATA_DIR, 'bank_accounts.json');

function loadPersistedBankAccounts(): any[] {
  try {
    if (fs.existsSync(BANK_ACCOUNTS_FILE)) {
      const content = fs.readFileSync(BANK_ACCOUNTS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando cuentas bancarias locales:', err);
  }
  return [];
}

function savePersistedBankAccount(account: any) {
  try {
    const dir = path.dirname(BANK_ACCOUNTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedBankAccounts();
    const idx = current.findIndex((a: any) => a.id === account.id);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...account };
    } else {
      current.unshift(account);
    }
    fs.writeFileSync(BANK_ACCOUNTS_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando cuenta bancaria local:', err);
  }
}

app.get('/api/bank-accounts', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const local = loadPersistedBankAccounts();
    try {
      const result = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*&order=bank_name.asc');
      if (process.env.FRENYER_DEBUG_LOGS === 'on') {
        console.log('DEBUG: authenticatedSupabaseRestRequest bank_accounts result:', result);
      }
      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        const map = new Map<string, any>();
        for (const item of local) map.set(item.id, item);
        for (const item of result.data) map.set(item.id, item);
        const merged = Array.from(map.values());
        return res.json({ success: true, data: merged });
      }
    } catch {}
    return res.json({ success: true, data: local });
  } catch (err: any) {
    const local = loadPersistedBankAccounts();
    return res.json({ success: true, data: local });
  }
});

app.post('/api/bank-accounts', async (req, res) => {
  try {
    const account = req.body || {};
    if (!account.id) {
      account.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc-' + Date.now();
    }
    savePersistedBankAccount(account);

    try {
      await authenticatedSupabaseRestRequest(res, 'bank_accounts', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: account
      });
    } catch {}

    return res.json({ success: true, data: account });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.patch('/api/bank-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const localList = loadPersistedBankAccounts();
    const idx = localList.findIndex((a: any) => a.id === id);
    let updated = { id, ...updates };
    if (idx >= 0) {
      updated = { ...localList[idx], ...updates };
      localList[idx] = updated;
    } else {
      localList.unshift(updated);
    }
    try {
      const dir = path.dirname(BANK_ACCOUNTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(BANK_ACCOUNTS_FILE, JSON.stringify(localList, null, 2), 'utf-8');
    } catch {}

    try {
      await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: updates
      });
    } catch {}

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/bank-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isPermanent = req.query.permanent === 'true';

    const localList = loadPersistedBankAccounts();
    if (isPermanent) {
      const filtered = localList.filter((a: any) => a.id !== id);
      try {
        fs.writeFileSync(BANK_ACCOUNTS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
      } catch {}

      try {
        await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
          method: 'DELETE'
        });
      } catch {}
      return res.json({ success: true, permanent: true });
    }

    // Soft delete: Move to "Inactivo"
    const idx = localList.findIndex((a: any) => a.id === id);
    if (idx >= 0) {
      localList[idx].status = 'Inactivo';
      try {
        fs.writeFileSync(BANK_ACCOUNTS_FILE, JSON.stringify(localList, null, 2), 'utf-8');
      } catch {}
    }

    try {
      await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: { status: 'Inactivo' }
      });
    } catch {}
    return res.json({ success: true, permanent: false });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// 6.2 PAYMENT METHODS & PERSISTENCIA RESILIENTE
const BANK_MOVEMENTS_FILE = path.resolve(DATA_DIR, 'bank_movements.json');
const PAYMENT_METHODS_FILE = path.resolve(DATA_DIR, 'payment_methods.json');

function loadPersistedBankMovements(bankAccountId?: string): any[] {
  try {
    if (fs.existsSync(BANK_MOVEMENTS_FILE)) {
      const content = fs.readFileSync(BANK_MOVEMENTS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (bankAccountId) {
          return list.filter((m: any) => m.bank_account_id === bankAccountId);
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando movimientos bancarios locales:', err);
  }
  return [];
}

function savePersistedBankMovement(movement: any) {
  try {
    const dir = path.dirname(BANK_MOVEMENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedBankMovements();
    const idx = current.findIndex((m: any) => m.id === movement.id);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...movement };
    } else {
      current.unshift(movement);
    }
    fs.writeFileSync(BANK_MOVEMENTS_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando movimiento bancario local:', err);
  }
}

function loadPersistedPaymentMethods(): any[] {
  try {
    if (fs.existsSync(PAYMENT_METHODS_FILE)) {
      const content = fs.readFileSync(PAYMENT_METHODS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando mÃ©todos de pago locales:', err);
  }
  return [
    { id: 'pm-1', name: 'Pago MÃ³vil Banesco', currency: 'VES', type: 'Pago MÃ³vil', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-2', name: 'Transferencia Banesco', currency: 'VES', type: 'Transferencia', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-3', name: 'Punto de Venta Banesco', currency: 'VES', type: 'Punto de Venta', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-4', name: 'Efectivo DÃ³lares', currency: 'USD', type: 'Efectivo', bank_account_id: 'ba063cfe-3aef-4a50-b86f-52ef90bf7fdb' },
    { id: 'pm-5', name: 'Transferencia Banco de Venezuela', currency: 'VES', type: 'Transferencia', bank_account_id: 'ef41a1a3-abce-443a-9f3c-0cfb434d06e2' }
  ];
}

function savePersistedPaymentMethod(pm: any) {
  try {
    const dir = path.dirname(PAYMENT_METHODS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedPaymentMethods();
    const idx = current.findIndex((item: any) => item.id === pm.id);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...pm };
    } else {
      current.push(pm);
    }
    fs.writeFileSync(PAYMENT_METHODS_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando mÃ©todo de pago local:', err);
  }
}

app.get('/api/payment-methods', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'payment_methods?select=*&order=name.asc');
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      return res.json({ success: true, data: result.data });
    }
    const local = loadPersistedPaymentMethods();
    return res.json({ success: true, data: local });
  } catch (err: any) {
    const local = loadPersistedPaymentMethods();
    return res.json({ success: true, data: local });
  }
});

app.post('/api/payment-methods', async (req, res) => {
  try {
    const method = req.body || {};
    const created = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pm-' + Date.now(),
      name: method.name || 'MÃ©todo',
      currency: method.currency || 'VES',
      type: method.type || 'Transferencia',
      bank_account_id: method.bank_account_id || null,
      created_at: new Date().toISOString()
    };
    savePersistedPaymentMethod(created);

    try {
      await authenticatedSupabaseRestRequest(res, 'payment_methods', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: method
      });
    } catch {}

    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.patch('/api/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const current = loadPersistedPaymentMethods();
    const idx = current.findIndex((pm: any) => pm.id === id);
    let updatedObj = { id, ...updates };
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...updates };
      updatedObj = current[idx];
      savePersistedPaymentMethod(updatedObj);
    }

    try {
      await authenticatedSupabaseRestRequest(res, `payment_methods?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: updates
      });
    } catch {}

    return res.json({ success: true, data: updatedObj });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const current = loadPersistedPaymentMethods();
    const filtered = current.filter((pm: any) => pm.id !== id);
    try {
      const dir = path.dirname(PAYMENT_METHODS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(PAYMENT_METHODS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    } catch {}

    try {
      await authenticatedSupabaseRestRequest(res, `payment_methods?id=eq.${id}`, {
        method: 'DELETE'
      });
    } catch {}

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// 6.3 BANK MOVEMENTS WITH BALANCE ADJUSTMENT (DUAL RESILIENT PERSISTENCE)
app.get('/api/bank-movements', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const bankAccountId = req.query.bank_account_id as string | undefined;
    const localList = loadPersistedBankMovements(bankAccountId);

    try {
      const endpoint = bankAccountId
        ? `bank_movements?bank_account_id=eq.${encodeURIComponent(bankAccountId)}&select=*&order=created_at.desc`
        : 'bank_movements?select=*&order=created_at.desc';
      const result = await authenticatedSupabaseRestRequest(res, endpoint);
      if (!result.error && Array.isArray(result.data)) {
        const map = new Map<string, any>();
        for (const item of result.data) {
          map.set(item.id, item);
        }
        for (const item of localList) {
          if (!map.has(item.id)) {
            map.set(item.id, item);
          }
        }
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return res.json({ success: true, data: merged });
      }
    } catch {}

    return res.json({ success: true, data: localList });
  } catch (err: any) {
    const localList = loadPersistedBankMovements();
    return res.json({ success: true, data: localList });
  }
});

app.get('/api/debug/bank-movements-check', async (req, res) => {
  try {
    const result = await supabaseRestRequest('bank_movements?select=*');
    const accountsRes = await supabaseRestRequest('bank_accounts?select=id,bank_name');
    
    if (result.error || accountsRes.error) {
      return res.json({ success: false, error: result.error || accountsRes.error });
    }

    const accounts = accountsRes.data;
    const movements = result.data;
    
    const validIds = new Set(accounts.map((a: any) => a.id));
    const orphans = movements.filter((m: any) => !validIds.has(m.bank_account_id));

    return res.json({
      success: true,
      totalMovements: movements.length,
      accounts: accounts,
      orphans: orphans
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/debug/accounts-list', async (req, res) => {
  try {
    const result = await supabaseRestRequest('bank_accounts?select=id,bank_name');
    if (result.error) {
      return res.status(200).json({ success: true, data: localExpenses.load(orgId), source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: localExpenses.load(res.locals.supabaseContext?.organizationId), source: 'local' });
  }
});

app.post('/api/bank-movements', async (req, res: AuthenticatedResponse) => {
  try {
    const movement = req.body || {};
    let {
      bank_account_id: bankAccountId,
      type,
      amount,
      rate,
      commission = 0,
      commission_type: commissionType = 'Fija'
    } = movement;

    if (!type || !['ENTRADA', 'SALIDA'].includes(type)) {
      return res.status(400).json({ success: false, error: 'El tipo de movimiento (ENTRADA o SALIDA) es obligatorio.' });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'El monto del movimiento debe ser un nÃºmero positivo.' });
    }
    const numRate = Number(rate) > 0 ? Number(rate) : 1;
    const numComm = Number(commission) >= 0 ? Number(commission) : 0;
    const commType = ['Fija', 'Porcentual'].includes(commissionType) ? commissionType : 'Fija';
    const effectiveCommission = commType === 'Porcentual'
      ? Math.round(numAmount * (numComm / 100) * 100) / 100
      : Math.round(numComm * 100) / 100;

    const concept = typeof movement.concept === 'string' && movement.concept.trim()
      ? movement.concept.trim()
      : (type === 'ENTRADA' ? 'Ingreso de fondos' : 'Egreso de fondos');
    const reference = typeof movement.reference === 'string' && movement.reference.trim()
      ? movement.reference.trim()
      : 'MOV-' + Date.now();
    const userName = movement.user_name || 'Sistema';

    // Obtener cuentas bancarias para resolver la cuenta adecuada
    let targetAccount: any = null;
    const accListRes = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*');
    const accounts: any[] = (!accListRes.error && Array.isArray(accListRes.data)) ? accListRes.data : [];

    if (bankAccountId && bankAccountId !== 'ACC-CASH-DEFAULT') {
      targetAccount = accounts.find((a: any) => a.id === bankAccountId);
    }

    if (!targetAccount) {
      // Buscar cuenta segÃºn tipo o moneda
      if (movement.currency === 'USD' || concept.toLowerCase().includes('usd') || concept.toLowerCase().includes('dolar')) {
        targetAccount = accounts.find((a: any) => a.currency === 'USD' && a.status === 'Activo') ||
                        accounts.find((a: any) => a.currency === 'USD');
      } else {
        targetAccount = accounts.find((a: any) => a.account_type === 'Efectivo' && a.status === 'Activo') ||
                        accounts.find((a: any) => (a.bank_name.toLowerCase().includes('efectivo') || a.bank_name.toLowerCase().includes('caja')) && a.status === 'Activo') ||
                        accounts.find((a: any) => a.status === 'Activo') ||
                        accounts[0];
      }
    }

    if (!targetAccount) {
      return res.status(404).json({ success: false, error: 'No se encontrÃ³ la cuenta bancaria para registrar el movimiento.' });
    }

    const resolvedAccountId = targetAccount.id;
    const delta = type === 'ENTRADA' ? numAmount : -(numAmount + effectiveCommission);
    const currentBalance = Number(targetAccount.balance) || 0;
    const newBalance = Math.round((currentBalance + delta) * 100) / 100;

    let rpcSuccess = false;
    let createdMovement: any = null;

    // 1. Intentar registrar vÃ­a RPC atÃ³mica si estÃ¡ disponible
    try {
      const rpcResult = await authenticatedSupabaseRestRequest(res, 'rpc/record_bank_movement', {
        method: 'POST',
        body: {
          p_bank_account_id: resolvedAccountId,
          p_type: type,
          p_amount: numAmount,
          p_rate: numRate,
          p_concept: concept,
          p_reference: reference,
          p_commission: numComm,
          p_commission_type: commType
        }
      });
      if (!rpcResult.error && rpcResult.data) {
        rpcSuccess = true;
        createdMovement = rpcResult.data;
      }
    } catch {}

    // 2. Si la RPC no existe en la base de datos de Supabase, actualizar directamente el balance con PATCH
    if (!rpcSuccess) {
      try {
        await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(resolvedAccountId)}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: { balance: newBalance }
        });
      } catch (patchErr) {
        console.warn('Aviso actualizando balance de cuenta bancaria:', patchErr);
      }

      createdMovement = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        organization_id: targetAccount.organization_id || res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001',
        bank_account_id: resolvedAccountId,
        type,
        concept,
        reference,
        user_name: userName,
        rate: numRate,
        commission: effectiveCommission,
        commission_type: commType,
        amount: numAmount,
        created_at: new Date().toISOString()
      };

      // Intentar insertar en tabla bank_movements de Supabase
      try {
        await authenticatedSupabaseRestRequest(res, 'bank_movements', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: createdMovement
        });
      } catch {}
    }

    // Persistir siempre en almacenamiento resiliente local
    savePersistedBankMovement(createdMovement);
    try {
      savePersistedBankAccount({ ...targetAccount, balance: newBalance });
    } catch {}

    return res.json({
      success: true,
      data: createdMovement,
      bank_account_id: resolvedAccountId,
      new_balance: newBalance
    });
  } catch (error) {
    return res.status(200).json({ success: false, error: error instanceof Error ? error.message : 'Error procesando movimiento bancario.' });
  }
});

app.post('/api/bank-transfers', async (req, res: AuthenticatedResponse) => {
  try {
    const transfer = req.body || {};
    const {
      source_account_id: sourceAccountId,
      target_account_id: targetAccountId,
      source_amount: sourceAmount,
      target_amount: targetAmount,
      rate,
      commission = 0,
      commission_type: commissionType = 'Fija'
    } = transfer;

    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId) {
      return res.status(400).json({ success: false, error: 'Selecciona cuentas de origen y destino diferentes.' });
    }
    const numSrcAmount = Number(sourceAmount);
    const numTgtAmount = Number(targetAmount);
    if (!Number.isFinite(numSrcAmount) || numSrcAmount <= 0 || !Number.isFinite(numTgtAmount) || numTgtAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Los montos deben ser nÃºmeros positivos.' });
    }
    const numRate = Number(rate) > 0 ? Number(rate) : 1;
    const numComm = Number(commission) >= 0 ? Number(commission) : 0;
    const commType = ['Fija', 'Porcentual'].includes(commissionType) ? commissionType : 'Fija';
    const effectiveCommission = commType === 'Porcentual'
      ? Math.round(numSrcAmount * (numComm / 100) * 100) / 100
      : Math.round(numComm * 100) / 100;
    const concept = typeof transfer.concept === 'string' && transfer.concept.trim()
      ? transfer.concept.trim()
      : 'Transferencia entre cuentas';
    const reference = typeof transfer.reference === 'string' && transfer.reference.trim()
      ? transfer.reference.trim()
      : 'TRF-' + Date.now();

    let rpcSuccess = false;
    let transferData: any = null;

    try {
      const rpcResult = await authenticatedSupabaseRestRequest(res, 'rpc/record_bank_transfer', {
        method: 'POST',
        body: {
          p_source_account_id: sourceAccountId,
          p_target_account_id: targetAccountId,
          p_source_amount: numSrcAmount,
          p_target_amount: numTgtAmount,
          p_rate: numRate,
          p_concept: concept,
          p_reference: reference,
          p_commission: numComm,
          p_commission_type: commType
        }
      });
      if (!rpcResult.error && rpcResult.data) {
        rpcSuccess = true;
        transferData = rpcResult.data;
      }
    } catch {}

    if (!rpcSuccess) {
      const accListRes = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*');
      const accounts: any[] = (!accListRes.error && Array.isArray(accListRes.data)) ? accListRes.data : [];
      const srcAcc = accounts.find((a: any) => a.id === sourceAccountId);
      const tgtAcc = accounts.find((a: any) => a.id === targetAccountId);

      if (!srcAcc || !tgtAcc) {
        return res.status(404).json({ success: false, error: 'No se encontraron las cuentas bancarias especificadas.' });
      }

      const newSrcBal = Math.round(((Number(srcAcc.balance) || 0) - (numSrcAmount + effectiveCommission)) * 100) / 100;
      const newTgtBal = Math.round(((Number(tgtAcc.balance) || 0) + numTgtAmount) * 100) / 100;

      // Actualizar origen y destino directamente en Supabase
      await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(sourceAccountId)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: { balance: newSrcBal }
      });

      await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(targetAccountId)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: { balance: newTgtBal }
      });

      const srcMov = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now() + '-src',
        organization_id: srcAcc.organization_id || '00000000-0000-0000-0000-000000000001',
        bank_account_id: sourceAccountId,
        type: 'SALIDA',
        concept: `Transferencia enviada a ${tgtAcc.bank_name}: ${concept}`,
        reference,
        user_name: 'Gerente General',
        rate: numRate,
        commission: effectiveCommission,
        commission_type: commType,
        amount: numSrcAmount,
        created_at: new Date().toISOString()
      };

      const tgtMov = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now() + '-tgt',
        organization_id: tgtAcc.organization_id || '00000000-0000-0000-0000-000000000001',
        bank_account_id: targetAccountId,
        type: 'ENTRADA',
        concept: `Transferencia recibida de ${srcAcc.bank_name}: ${concept}`,
        reference,
        user_name: 'Gerente General',
        rate: numRate,
        commission: 0,
        commission_type: 'Fija',
        amount: numTgtAmount,
        created_at: new Date().toISOString()
      };

      savePersistedBankMovement(srcMov);
      savePersistedBankMovement(tgtMov);
      try {
        savePersistedBankAccount({ ...srcAcc, balance: newSrcBal });
        savePersistedBankAccount({ ...tgtAcc, balance: newTgtBal });
      } catch {}

      // Insertar movimientos de transferencia en la base de datos de Supabase
      try {
        await authenticatedSupabaseRestRequest(res, 'bank_movements', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: srcMov
        });
        await authenticatedSupabaseRestRequest(res, 'bank_movements', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: tgtMov
        });
      } catch (insertErr) {
        console.warn('Aviso insertando movimientos de transferencia en Supabase:', insertErr);
      }

      transferData = {
        source_movement: srcMov,
        target_movement: tgtMov,
        source_new_balance: newSrcBal,
        target_new_balance: newTgtBal
      };
    }

    if (effectiveCommission > 0) {
      try {
        const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
        let sourceCurrency = 'USD';
        let srcBankName = 'Cuenta Origen';
        try {
          const accRes = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${sourceAccountId}&select=currency,bank_name`);
          if (!accRes.error && Array.isArray(accRes.data) && accRes.data.length > 0) {
            sourceCurrency = accRes.data[0].currency || 'USD';
            srcBankName = accRes.data[0].bank_name || 'Cuenta Origen';
          }
        } catch {}

        const expensePayload = {
          organization_id: orgId,
          name: `ComisiÃ³n bancaria - Transferencia (${reference})`,
          category: 'Gastos Bancarios',
          type: 'VARIABLE',
          amount: effectiveCommission,
          currency: sourceCurrency,
          exchange_rate: numRate,
          due_date: new Date().toISOString().slice(0, 10),
          status: 'PAGADO',
          payment_account_id: sourceAccountId,
          notes: `ComisiÃ³n registrada automÃ¡ticamente por transferencia bancaria desde ${srcBankName} (Ref: ${reference})`
        };

        await authenticatedSupabaseRestRequest(res, 'expenses', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: expensePayload
        });
      } catch (commErr) {
        console.warn('Aviso registrando gasto de comisiÃ³n bancaria en transferencia:', commErr);
      }
    }

    return res.json({ success: true, data: transferData });
  } catch (error) {
    return res.status(200).json({ success: false, error: error instanceof Error ? error.message : 'Error procesando la transferencia.' });
  }
});

// ---------------------------------------------------------------------------
// 7. PROVEEDORES (SUPPLIERS) BACKEND PROXY CON PERSISTENCIA RESILIENTE
// ---------------------------------------------------------------------------
const SUPPLIERS_FILE = path.resolve(DATA_DIR, 'suppliers.json');

function normalizeSupplierDoc(doc?: string | null): string {
  if (!doc || typeof doc !== 'string') return '';
  return doc.trim().toUpperCase().replace(/[\s.-]/g, '');
}

function normalizeSupplierName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getNextSupplierCode(suppliersList: any[]): string {
  let maxNum = 0;
  for (const s of suppliersList) {
    if (s && s.code && typeof s.code === 'string') {
      const match = s.code.match(/PRV-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  return `PRV-${(maxNum + 1).toString().padStart(4, '0')}`;
}

function findExistingSupplier(
  suppliersList: any[],
  candidate: { id?: string | null; doc_number?: string | null; name?: string | null; code?: string | null }
): { supplier: any; index: number } | null {
  if (!Array.isArray(suppliersList) || suppliersList.length === 0) return null;

  // 1. Coincidencia por ID estricto
  if (candidate.id) {
    const idx = suppliersList.findIndex((s: any) => s && s.id === candidate.id);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  // 2. Coincidencia por RIF / doc_number normalizado (si no estÃ¡ vacÃ­o)
  const normDoc = normalizeSupplierDoc(candidate.doc_number);
  if (normDoc) {
    const idx = suppliersList.findIndex((s: any) => normalizeSupplierDoc(s?.doc_number) === normDoc);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  // 3. Coincidencia por nombre normalizado (si no estÃ¡ vacÃ­o)
  const normName = normalizeSupplierName(candidate.name);
  if (normName) {
    const idx = suppliersList.findIndex((s: any) => normalizeSupplierName(s?.name) === normName);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  // 4. Coincidencia por cÃ³digo PRV
  if (candidate.code && candidate.code !== 'PRV-0001' && candidate.code !== 'PRV-GEN') {
    const idx = suppliersList.findIndex((s: any) => s && s.code === candidate.code);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  return null;
}

function loadPersistedSuppliers(orgId?: string): any[] {
  try {
    if (fs.existsSync(SUPPLIERS_FILE)) {
      const content = fs.readFileSync(SUPPLIERS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) {
          const filtered = list.filter((s: any) => !s.organization_id || s.organization_id === orgId);
          return filtered.length > 0 ? filtered : list;
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando proveedores locales:', err);
  }
  return [];
}

function savePersistedSupplier(supplier: any): any {
  try {
    const dir = path.dirname(SUPPLIERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedSuppliers();
    const found = findExistingSupplier(current, supplier);
    
    let savedRecord: any;
    if (found) {
      savedRecord = {
        ...found.supplier,
        ...supplier,
        id: found.supplier.id || supplier.id,
        code: found.supplier.code || supplier.code || getNextSupplierCode(current)
      };
      current[found.index] = savedRecord;
    } else {
      const finalCode = supplier.code && /^PRV-\d+$/i.test(supplier.code)
        ? supplier.code
        : getNextSupplierCode(current);
      savedRecord = {
        ...supplier,
        code: finalCode
      };
      current.push(savedRecord);
    }
    fs.writeFileSync(SUPPLIERS_FILE, JSON.stringify(current, null, 2), 'utf-8');
    return savedRecord;
  } catch (err) {
    console.warn('Aviso guardando proveedor local:', err);
    return supplier;
  }
}

function saveAllPersistedSuppliers(list: any[]) {
  try {
    if (!Array.isArray(list) || list.length === 0) return;
    const dir = path.dirname(SUPPLIERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const deduplicated: any[] = [];
    for (const item of list) {
      const existing = findExistingSupplier(deduplicated, item);
      if (existing) {
        deduplicated[existing.index] = {
          ...deduplicated[existing.index],
          ...item,
          id: deduplicated[existing.index].id || item.id,
          code: deduplicated[existing.index].code || item.code
        };
      } else {
        deduplicated.push(item);
      }
    }

    fs.writeFileSync(SUPPLIERS_FILE, JSON.stringify(deduplicated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando lista de proveedores:', err);
  }
}

function deletePersistedSupplier(id: string) {
  try {
    if (fs.existsSync(SUPPLIERS_FILE)) {
      const current = loadPersistedSuppliers();
      const updated = current.filter((s: any) => s.id !== id);
      fs.writeFileSync(SUPPLIERS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Aviso eliminando proveedor local:', err);
  }
}

function autoReconcileSuppliers(orgId: string): any[] {
  const localList = loadPersistedSuppliers(orgId);
  const result: any[] = [...localList];

  // 1. Conciliar con cuentas por pagar (accounts_payable)
  const payables = loadPersistedPayables(orgId);
  for (const p of payables) {
    const name = (p.supplier_name || '').trim();
    const doc = (p.supplier_doc || '').trim();
    if (!name && !doc) continue;

    const remaining = Math.max(0, Number(p.balance_usd ?? p.remaining_amount ?? 0));
    const found = findExistingSupplier(result, { id: p.supplier_id, doc_number: doc, name });

    if (found) {
      result[found.index] = {
        ...result[found.index],
        balance_usd: (Number(result[found.index].balance_usd) || 0) + remaining,
        phone: result[found.index].phone || p.supplier_phone || '',
        email: result[found.index].email || p.supplier_email || '',
        doc_number: result[found.index].doc_number || doc
      };
    } else {
      const newCode = getNextSupplierCode(result);
      result.push({
        id: p.supplier_id || `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        organization_id: orgId,
        code: newCode,
        name: name || 'Proveedor Comercial',
        doc_type: doc.startsWith('J') ? 'RIF JurÃ­dico' : 'RIF (J / G / V)',
        doc_number: doc,
        phone: p.supplier_phone || '',
        email: p.supplier_email || '',
        contact_person: p.supplier_contact || '',
        address: p.supplier_address || '',
        category: p.origin || 'Proveedor Comercial',
        balance_usd: remaining,
        status: 'Activo',
        created_at: p.created_at || new Date().toISOString()
      });
    }
  }

  // 2. Conciliar pagos bancarios
  try {
    const bankMovFile = path.resolve(DATA_DIR, 'bank_movements.json');
    if (fs.existsSync(bankMovFile)) {
      const movs = JSON.parse(fs.readFileSync(bankMovFile, 'utf-8'));
      if (Array.isArray(movs)) {
        for (const m of movs) {
          const concept = String(m.concept || '');
          const match = concept.match(/Pago a proveedor\s*-\s*([^(]+)(?:\(([^)]+)\))?/i);
          if (match && match[1]) {
            const rawName = match[1].trim();
            const rawDoc = match[2] ? match[2].trim() : '';
            const found = findExistingSupplier(result, { name: rawName, doc_number: rawDoc });
            if (!found) {
              const newCode = getNextSupplierCode(result);
              result.push({
                id: `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                organization_id: orgId,
                code: newCode,
                name: rawName,
                doc_type: 'RIF (J / G / V)',
                doc_number: rawDoc,
                phone: '',
                email: '',
                contact_person: '',
                address: '',
                category: 'Distribuidor Comercial',
                balance_usd: 0,
                status: 'Activo',
                created_at: m.created_at || new Date().toISOString()
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Aviso conciliando proveedores de movimientos bancarios:', err);
  }

  saveAllPersistedSuppliers(result);
  return result;
}

app.get('/api/suppliers', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    
    // 1. Auto-conciliar proveedores de forma segura y sin duplicar
    const autoSuppliers = autoReconcileSuppliers(orgId);

    // 2. Consultar tabla suppliers en Supabase si estÃ¡ disponible
    let dbSuppliers: any[] = [];
    try {
      const result = await supabaseRestRequest('suppliers?select=*&order=created_at.desc', {}, token);
      if (!result.error && Array.isArray(result.data)) {
        dbSuppliers = result.data;
      }
    } catch (e) {
      console.warn('Aviso consultando suppliers en Supabase:', e);
    }

    // 3. Fusionar usando findExistingSupplier por clave de negocio canÃ³nica (doc_number / name)
    const mergedList: any[] = [];
    for (const s of autoSuppliers) {
      const found = findExistingSupplier(mergedList, s);
      if (found) {
        mergedList[found.index] = { ...mergedList[found.index], ...s };
      } else {
        mergedList.push({ ...s });
      }
    }
    for (const s of dbSuppliers) {
      const found = findExistingSupplier(mergedList, s);
      if (found) {
        mergedList[found.index] = { ...mergedList[found.index], ...s, id: s.id || mergedList[found.index].id };
      } else {
        mergedList.push({ ...s });
      }
    }

    if (mergedList.length > 0) {
      saveAllPersistedSuppliers(mergedList);
    }

    return res.json({ success: true, data: mergedList });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: autoReconcileSuppliers('00000000-0000-0000-0000-000000000001') });
  }
});

app.post('/api/suppliers', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const rawSupplier = req.body || {};

    const currentSuppliers = loadPersistedSuppliers(orgId);
    const existing = findExistingSupplier(currentSuppliers, {
      id: rawSupplier.id,
      doc_number: rawSupplier.doc_number,
      name: rawSupplier.name
    });

    const targetCode = existing?.supplier?.code || (rawSupplier.code && /^PRV-\d+$/i.test(rawSupplier.code) ? rawSupplier.code : getNextSupplierCode(currentSuppliers));
    const targetId = existing?.supplier?.id || (rawSupplier.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSupplier.id)
      ? rawSupplier.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'b1c2d3e4-3333-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0')));

    const supplierRecord = {
      ...(existing?.supplier || {}),
      ...rawSupplier,
      id: targetId,
      organization_id: orgId,
      code: targetCode,
      name: (rawSupplier.name || existing?.supplier?.name || '').trim(),
      doc_type: rawSupplier.doc_type || existing?.supplier?.doc_type || 'RIF (J / G / V)',
      doc_number: (rawSupplier.doc_number || existing?.supplier?.doc_number || '').trim().toUpperCase(),
      contact_person: (rawSupplier.contact_person ?? existing?.supplier?.contact_person ?? '').trim(),
      phone: (rawSupplier.phone ?? existing?.supplier?.phone ?? '').trim(),
      email: (rawSupplier.email ?? existing?.supplier?.email ?? '').trim(),
      address: (rawSupplier.address ?? existing?.supplier?.address ?? '').trim(),
      category: (rawSupplier.category || existing?.supplier?.category || 'General').trim(),
      balance_usd: Number(rawSupplier.balance_usd ?? existing?.supplier?.balance_usd) || 0,
      status: rawSupplier.status || existing?.supplier?.status || 'Activo',
      created_at: existing?.supplier?.created_at || rawSupplier.created_at || new Date().toISOString()
    };

    // 1. Guardar de inmediato en persistencia local deduplicada
    savePersistedSupplier(supplierRecord);

    // 2. Sincronizar en Supabase (PATCH si existia con UUID, o POST si es nuevo).
    //    Primero se intenta con la sesion del usuario; si RLS bloquea (p.ej. en
    //    modo local la sesion es la anon key), se reintenta con la service role
    //    key del servidor, que bypassa RLS. El control de inquilino ya lo aplico
    //    el servidor (orgId) antes de llamar.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    const isUpdate = !!(existing?.supplier?.id && isUuid);

    const syncWith = async (requestFn: (endpoint: string, options: any) => Promise<{ status: number; data: any; error?: string }>) => {
      let payload: Record<string, any> = { ...supplierRecord };
      let attempts = 0;
      while (attempts < 6) {
        attempts++;
        const endpoint = isUpdate
          ? `suppliers?id=eq.${encodeURIComponent(targetId)}`
          : 'suppliers';
        const result = await requestFn(endpoint, {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: { Prefer: 'return=representation' },
          body: payload
        });
        if (!result.error) {
          const row = Array.isArray(result.data) ? result.data[0] : result.data;
          return { ok: true, data: row };
        }
        const missingColMatch = (result.error || '').match(/Could not find the '([^']+)' column of 'suppliers'/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in payload) {
          delete payload[missingColMatch[1]];
          continue;
        }
        return { ok: false, error: result.error };
      }
      return { ok: false, error: 'Maximo de intentos alcanzado' };
    };

    let syncResult: { ok: boolean; data?: any; error?: string } = { ok: false };
    try {
      // 1) Intento con la sesion del usuario (respeta RLS).
      syncResult = await syncWith((ep, opts) => supabaseRestRequest(ep, opts, token));
      // 2) Respaldo con service role si fallo.
      if (!syncResult.ok) {
        syncResult = await syncWith((ep, opts) => supabaseServiceRestRequest(ep, opts));
      }
    } catch (sbErr) {
      console.warn('Aviso sincronizando proveedor en Supabase:', sbErr);
      syncResult = { ok: false, error: String(sbErr) };
    }

    if (syncResult.ok && syncResult.data) {
      const merged = { ...supplierRecord, ...syncResult.data };
      savePersistedSupplier(merged);
      return res.json({ success: true, data: merged });
    }

    console.warn('No se pudo sincronizar proveedor en Supabase:', syncResult.error);
    return res.status(200).json({ success: false, error: syncResult.error || 'Error guardando proveedor en Supabase' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error guardando proveedor' });
  }
});

app.patch('/api/suppliers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body || {};
    let updatesPayload: Record<string, any> = { ...rawUpdates };

    // Actualizar en archivo local de inmediato
    const current = loadPersistedSuppliers();
    const existing = current.find((s: any) => s.id === id);
    if (existing) {
      savePersistedSupplier({ ...existing, ...updatesPayload });
    }

    // Intentar en Supabase (con fallback a service role si RLS bloquea)
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const syncPatchWith = async (requestFn: (endpoint: string, options: any) => Promise<{ status: number; data: any; error?: string }>) => {
      let payload: Record<string, any> = { ...updatesPayload };
      let attempts = 0;
      while (attempts < 6) {
        attempts++;
        const result = await requestFn(
          `suppliers?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: payload
          }
        );
        if (!result.error) {
          const updated = Array.isArray(result.data) ? result.data[0] : result.data;
          return { ok: true, data: updated };
        }
        const missingColMatch = (result.error || '').match(/Could not find the '([^']+)' column of 'suppliers'/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in payload) {
          delete payload[missingColMatch[1]];
          continue;
        }
        return { ok: false, error: result.error };
      }
      return { ok: false, error: 'Maximo de intentos alcanzado' };
    };

    let patchResult: { ok: boolean; data?: any; error?: string } = { ok: false };
    try {
      patchResult = await syncPatchWith((ep, opts) => supabaseRestRequest(ep, opts, token));
      if (!patchResult.ok) {
        patchResult = await syncPatchWith((ep, opts) => supabaseServiceRestRequest(ep, opts));
      }
    } catch (sbErr) {
      console.warn('Aviso actualizando proveedor en Supabase:', sbErr);
      patchResult = { ok: false, error: String(sbErr) };
    }

    if (patchResult.ok) {
      const merged = { ...(existing || {}), ...rawUpdates, ...(patchResult.data || {}) };
      savePersistedSupplier(merged);
      return res.json({ success: true, data: merged });
    }

    console.warn('No se pudo actualizar proveedor en Supabase:', patchResult.error);
    return res.status(200).json({ success: false, error: patchResult.error || 'Error actualizando proveedor en Supabase' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    deletePersistedSupplier(id);

    // Eliminar en Supabase (con fallback a service role si RLS bloquea)
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    let deleteOk = false;
    let deleteError: any = null;
    try {
      let result = await supabaseRestRequest(
        `suppliers?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        token
      );
      if (result.error) {
        result = await supabaseServiceRestRequest(
          `suppliers?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        );
      }
      if (!result.error) {
        deleteOk = true;
      } else {
        deleteError = result.error;
      }
    } catch (sbErr) {
      console.warn('Aviso eliminando proveedor en Supabase:', sbErr);
      deleteError = sbErr;
    }

    if (!deleteOk) {
      console.warn('No se pudo eliminar proveedor en Supabase:', deleteError);
    }

    return res.json({ success: true });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 7.B SEDES Y ALMACENES (BRANCHES) PROXY
// ---------------------------------------------------------------------------
const BRANCHES_FILE = path.resolve(DATA_DIR, 'branches.json');

function loadPersistedBranches(orgId?: string): any[] {
  try {
    if (fs.existsSync(BRANCHES_FILE)) {
      const content = fs.readFileSync(BRANCHES_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) {
          return list.filter((b: any) => !b.organization_id || b.organization_id === orgId);
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando sedes locales:', err);
  }
  return [];
}

function savePersistedBranch(branch: any) {
  try {
    const dir = path.dirname(BRANCHES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = loadPersistedBranches();
    const idx = current.findIndex((b: any) => b.id === branch.id || (b.code && b.code === branch.code));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...branch };
    } else {
      current.push(branch);
    }
    fs.writeFileSync(BRANCHES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando sede local:', err);
  }
}

function deletePersistedBranch(id: string) {
  try {
    if (fs.existsSync(BRANCHES_FILE)) {
      const current = loadPersistedBranches();
      const updated = current.filter((b: any) => b.id !== id);
      fs.writeFileSync(BRANCHES_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Aviso eliminando sede local:', err);
  }
}

app.get('/api/branches', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    
    // 1. Consultar tabla branches en Supabase en tiempo real
    const result = await supabaseRestRequest('branches?select=*&order=created_at.asc');
    if (!result.error && Array.isArray(result.data)) {
      // Sincronizar archivo local con datos reales de Supabase
      try {
        const dir = path.dirname(BRANCHES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BRANCHES_FILE, JSON.stringify(result.data, null, 2), 'utf-8');
      } catch {}
      return res.json({ success: true, data: result.data });
    }

    // 2. Si hubo fallo de conexiÃ³n temporal con Supabase, retornar sedes persistidas del usuario (sin datos estÃ¡ticos)
    const local = loadPersistedBranches(orgId);
    return res.json({ success: true, data: local });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: loadPersistedBranches() });
  }
});

app.post('/api/branches', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const rawBranch = req.body || {};
    const branchId = (rawBranch.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawBranch.id))
      ? rawBranch.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'a1b2c3d4-5555-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0'));
    
    const branchPayload: Record<string, any> = {
      ...rawBranch,
      id: branchId,
      organization_id: orgId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. Guardar de inmediato en Supabase en la tabla public.branches
    try {
      const result = await supabaseRestRequest('branches', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: branchPayload
      });

      if (!result.error && result.data) {
        const created = Array.isArray(result.data) ? result.data[0] : result.data;
        savePersistedBranch(created);
        return res.json({ success: true, data: created, source: 'supabase' });
      } else if (result.error) {
        console.warn('Aviso insertando en Supabase branches:', result.error);
      }
    } catch (sbErr) {
      console.warn('Aviso insertando en Supabase branches:', sbErr);
    }

    // 2. Guardar en persistencia local como respaldo para disponibilidad continua
    savePersistedBranch(branchPayload);
    return res.json({ success: true, data: branchPayload, source: 'local' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.patch('/api/branches/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body || {};
    const updatesPayload: Record<string, any> = {
      ...rawUpdates,
      updated_at: new Date().toISOString()
    };

    // Actualizar localmente de inmediato
    const current = loadPersistedBranches();
    const existing = current.find((b: any) => b.id === id);
    if (existing) {
      savePersistedBranch({ ...existing, ...updatesPayload });
    }

    // Actualizar en Supabase
    try {
      const result = await supabaseRestRequest(
        `branches?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: updatesPayload
        }
      );

      if (!result.error && result.data) {
        const updated = Array.isArray(result.data) ? result.data[0] : result.data;
        return res.json({ success: true, data: updated });
      }
    } catch (sbErr) {
      console.warn('Aviso actualizando en Supabase branches:', sbErr);
    }

    return res.json({ success: true, data: { id, ...updatesPayload } });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/branches/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    deletePersistedBranch(id);

    try {
      await supabaseRestRequest(
        `branches?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
    } catch (sbErr) {
      console.warn('Aviso eliminando en Supabase branches:', sbErr);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// 7.B.2 GESTIÃ“N DE USUARIOS ASOCIADOS Y CONTROL RBAC PROXY
// ---------------------------------------------------------------------------
const USERS_FILE = path.resolve(DATA_DIR, 'users.json');

function loadPersistedUsers(): any[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.warn('Aviso cargando usuarios locales:', err);
  }
  return [];
}

/**
 * Roles admitidos por la tabla profiles (CHECK: gerente|administrador|cajero|cliente).
 * La interfaz trabaja con nombres legibles (Admin, Cashier, Manager) y se traducen aqui.
 */
function toProfileRole(role?: string | null): string {
  const value = (role || '').trim().toLowerCase();
  if (['admin', 'administrador', 'propietario', 'owner', 'superadmin', 'root'].includes(value)) return 'administrador';
  if (['manager', 'gerente', 'gerente general', 'supervisor'].includes(value)) return 'gerente';
  if (['cashier', 'cajero', 'vendedor'].includes(value)) return 'cajero';
  if (['cliente', 'customer', 'viewer', 'visitante'].includes(value)) return 'cliente';
  return 'cajero';
}

/** Convierte una fila de profiles al modelo de usuario asociado de la interfaz. */
function mapProfileToUser(p: any): any {
  const displayName = (p.full_name || p.name || 'Usuario').trim();
  const names = displayName.split(/\s+/);
  const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();
  return {
    id: p.id,
    name: displayName,
    email: p.email || '',
    role: p.role || 'Cashier',
    title: p.title || 'Personal Asociado',
    active: p.active !== false && p.is_active !== false,
    initials: initials,
    permissions: Array.isArray(p.permissions) ? p.permissions : ['ventas'],
    created_at: p.created_at || new Date().toISOString()
  };
}

/**
 * Localiza un usuario asociado en la persistencia local o en Supabase.
 * Necesario porque el listado combina ambas fuentes y el alta local genera
 * identificadores propios.
 */
async function resolveAssociatedUser(id: string, email?: string): Promise<any | null> {
  const local = loadPersistedUsers();
  const localMatch = local.find(
    (u: any) =>
      String(u.id) === String(id) ||
      (email && u.email && String(u.email).toLowerCase() === String(email).toLowerCase())
  );
  if (localMatch) return localMatch;

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const query = isUuid
      ? `profiles?id=eq.${encodeURIComponent(id)}&select=*`
      : `profiles?email=eq.${encodeURIComponent(email || '')}&select=*`;

    const result = await supabaseRestRequest(query);
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      return mapProfileToUser(result.data[0]);
    }
  } catch (err) {
    console.warn('Aviso buscando usuario asociado en Supabase:', err);
  }

  return null;
}

function savePersistedUser(user: any) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = loadPersistedUsers();
    const idx = current.findIndex((u: any) => String(u.id) === String(user.id) || (u.email && u.email.toLowerCase() === (user.email || '').toLowerCase()));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...user };
    } else {
      current.push(user);
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando usuario local:', err);
  }
}

function deletePersistedUser(id: string) {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const current = loadPersistedUsers();
      const updated = current.filter((u: any) => String(u.id) !== String(id));
      fs.writeFileSync(USERS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Aviso eliminando usuario local:', err);
  }
}

/**
 * Permisos por defecto cuando el perfil no tiene la columna `permissions`
 * (aún no existe en `profiles`): el administrador/gerente ve TODOS los módulos.
 */
function defaultPermissionsForRole(role: any): string[] {
  const r = String(role || '').trim().toLowerCase();
  if (['admin', 'administrador', 'propietario', 'gerente', 'manager', 'superadmin', 'director'].includes(r)) {
    return ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'];
  }
  if (['cajero', 'cashier'].includes(r)) {
    return ['ventas'];
  }
  if (['almacenista', 'inventario'].includes(r)) {
    return ['inventario', 'reportes'];
  }
  if (['contador', 'soporte'].includes(r)) {
    return ['finanzas', 'reportes'];
  }
  // Interior desconocido: lista completa para no recortar el menú.
  return ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'];
}

/**
 * Permisos efectivos de un perfil. Los permisos guardados mandan, salvo en
 * roles administrativos: un administrador nunca puede quedar con menos
 * módulos que su rol (un guardado parcial en Configuración no debe recortar
 * el menú del dueño del negocio).
 */
function resolveEffectivePermissions(role: any, stored: any): string[] {
  const fromRole = defaultPermissionsForRole(role);
  if (!Array.isArray(stored) || stored.length === 0) return fromRole;

  const r = String(role || '').trim().toLowerCase();
  const isAdminRole = ['admin', 'administrador', 'propietario', 'gerente', 'manager', 'superadmin', 'director'].includes(r);
  if (!isAdminRole) return stored;

  return Array.from(new Set([...fromRole, ...stored]));
}

function mapPersistedUserRows(rows: any[]): any[] {
  return (rows || []).map((p: any) => {
    const names = (p.full_name || p.name || 'Usuario').trim().split(/\s+/);
    const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();
    return {
      id: p.id,
      name: p.full_name || p.name || 'Usuario Registrado',
      email: p.email || '',
      role: p.role || 'Cashier',
      title: p.title || p.position || 'Personal Asociado',
      active: p.active !== false && p.is_active !== false,
      initials: initials,
      permissions: resolveEffectivePermissions(p.role, p.permissions),
      created_at: p.created_at || new Date().toISOString()
    };
  });
}

function mergePersistedUsersWithSupabase(mappedRows: any[]): any[] {
  const localList = loadPersistedUsers();
  const combined = mappedRows.map((su: any) => {
    const lu = localList.find(
      (l: any) =>
        String(l.id) === String(su.id) ||
        (l.email && su.email && String(l.email).toLowerCase() === String(su.email).toLowerCase())
    );
    if (!lu) return su;
    const mergedPermissions = Array.isArray(lu.permissions) && lu.permissions.length > 0 ? lu.permissions : su.permissions;
    return {
      ...su,
      name: lu.name || su.name,
      role: lu.role || su.role,
      title: lu.title !== undefined ? lu.title : su.title,
      active: lu.active !== undefined ? lu.active : su.active,
      permissions: resolveEffectivePermissions(lu.role || su.role, mergedPermissions)
    };
  });

  localList.forEach((lu: any) => {
    if (!combined.some(cu => String(cu.id) === String(lu.id) || (cu.email && lu.email && String(cu.email).toLowerCase() === String(lu.email).toLowerCase()))) {
      combined.push(lu);
    }
  });

  return combined;
}

app.get('/api/users', async (_req, res: AuthenticatedResponse) => {
  try {
    // 1. Intento autenticado: el administrador debe ver TODOS los usuarios asociados.
    try {
      const result = await authenticatedSupabaseRestRequest(res, 'profiles?select=*&order=created_at.desc');
      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        return res.json({ success: true, data: mergePersistedUsersWithSupabase(mapPersistedUserRows(result.data)) });
      }
    } catch (sbErr) {
      console.warn('Aviso consultando usuarios en Supabase (autenticado):', sbErr);
    }

    // 2. Respaldo con service role SOLO para sesiones autenticadas:
    //    si RLS bloqueó la lectura de la sesión, el administrador con acceso
    //    total todavía ve la lista completa. Anónimos no deben ver perfiles.
    const session = res.locals.supabaseContext;
    const isAuthenticated = !!(session?.userEmail || session?.userId);
    if (isAuthenticated) {
      try {
        const backup = await supabaseServiceRestRequest('profiles?select=*&order=created_at.desc');
        if (!backup.error && Array.isArray(backup.data) && backup.data.length > 0) {
          return res.json({ success: true, data: mergePersistedUsersWithSupabase(mapPersistedUserRows(backup.data)) });
        }
      } catch (svcErr) {
        console.warn('Aviso consultando usuarios con service role:', svcErr);
      }
    }

    // 3. Respaldo local resiliente, SIN reinsertar correos administrativos:
    //    lo que el usuario elimina deja de volver a aparecer en cada sincronización.
    return res.json({ success: true, data: loadPersistedUsers() });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: loadPersistedUsers() });
  }
});

app.post('/api/users', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const body = req.body || {};
    
    if (!body.name || !body.email) {
      return res.status(400).json({ success: false, error: 'El nombre y correo electrónico son obligatorios.' });
    }

    const cleanEmail = String(body.email).trim().toLowerCase();
    const cleanName = body.name.trim();
    const names = cleanName.split(/\s+/);
    const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();

    // Permisos por rol cuando el formulario no los envía (misma matriz que el menú).
    let permissions = Array.isArray(body.permissions) ? body.permissions : [];
    if (permissions.length === 0) {
      permissions = defaultPermissionsForRole(body.role || 'Cashier');
    }

    let authUserId = '';
    const password = body.password ? String(body.password) : (crypto.randomBytes(8).toString('hex') + 'A1!');

    // 1. Intentar crear en Supabase Auth (admin createUser primero, luego signUp)
    try {
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        const { data: adminData, error: adminError } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: password,
          user_metadata: { full_name: cleanName, role: toProfileRole(body.role) },
          email_confirm: true
        });
        if (!adminError && adminData?.user?.id) {
          authUserId = adminData.user.id;
        }
      }
    } catch (adminErr) {
      console.warn('Aviso creando usuario con admin client:', adminErr);
    }

    if (!authUserId) {
      try {
        const signUpResult = await supabaseServer.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: { full_name: cleanName, role: toProfileRole(body.role) }
          }
        });
        if (signUpResult?.data?.user?.id) {
          authUserId = signUpResult.data.user.id;
        }
      } catch (authErr) {
        console.warn('Aviso registrando usuario en Auth (signUp):', authErr);
      }
    }

    if (!authUserId) {
      try {
        const existingProf = await supabaseRestRequest(`profiles?email=eq.${encodeURIComponent(cleanEmail)}&select=id&limit=1`);
        if (!existingProf.error && Array.isArray(existingProf.data) && existingProf.data.length > 0) {
          authUserId = existingProf.data[0].id;
        }
      } catch (err) {
        console.warn('Aviso buscando perfil existente por correo:', err);
      }
    }

    const userId = body.id || authUserId || crypto.randomUUID();

    const newUser: Record<string, any> = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      role: body.role || 'Cashier',
      title: body.title ? body.title.trim() : (body.role || 'Asociado'),
      active: body.active !== undefined ? Boolean(body.active) : true,
      initials: initials,
      permissions: permissions,
      created_at: new Date().toISOString()
    };

    // 2. Guardar en persistencia local resiliente
    savePersistedUser(newUser);

    // 3. Sincronizar el perfil en Supabase (tabla profiles)
    try {
      const profilePayload = {
        id: userId,
        email: cleanEmail,
        full_name: cleanName,
        role: toProfileRole(newUser.role)
      };

      const profileRes = await supabaseRestRequest('profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: profilePayload
      });

      if (profileRes.error) {
        await supabaseRestRequest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: {
            full_name: cleanName,
            email: cleanEmail,
            role: toProfileRole(newUser.role)
          }
        });
      }
    } catch (sbErr) {
      console.warn('Aviso sincronizando usuario con Supabase profiles:', sbErr);
    }

    return res.json({ success: true, data: newUser, message: 'Usuario registrado exitosamente.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error al crear usuario' });
  }
});

app.patch('/api/users/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    // El usuario puede vivir solo en el archivo local o solo en Supabase.
    const existing = (await resolveAssociatedUser(id, updates.email)) || {
      id,
      name: updates.name || 'Usuario',
      email: updates.email || '',
      role: updates.role || 'Cashier',
      title: updates.title || '',
      active: true,
      permissions: updates.permissions || ['ventas']
    };

    const displayName = updates.name ? String(updates.name).trim() : (existing.name || '');
    const names = displayName.split(/\s+/).filter(Boolean);
    const initials = names.length >= 2
      ? `${names[0][0]}${names[1][0]}`.toUpperCase()
      : (names[0] || 'US').slice(0, 2).toUpperCase();

    const updatedUser = {
      ...existing,
      id: existing.id || id,
      name: displayName,
      email: updates.email ? String(updates.email).trim().toLowerCase() : (existing.email || ''),
      role: updates.role || existing.role || 'Cashier',
      title: updates.title !== undefined ? updates.title : (existing.title || ''),
      active: updates.active !== undefined ? Boolean(updates.active) : existing.active !== false,
      permissions: Array.isArray(updates.permissions) ? updates.permissions : (existing.permissions || ['ventas']),
      initials: initials,
      updated_at: new Date().toISOString()
    };

    // 1. Perfil operativo (incluye cargo, estado y permisos) en la persistencia local
    savePersistedUser(updatedUser);

    // 2. Sincronizar con Supabase profiles (solo las columnas que existen)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(updatedUser.id));
    if (isUuid) {
      const sbPayload: Record<string, any> = {
        id: updatedUser.id,
        full_name: updatedUser.name,
        email: updatedUser.email,
        role: toProfileRole(updatedUser.role)
      };

      const updateResult = await supabaseRestRequest(
        `profiles?id=eq.${encodeURIComponent(String(updatedUser.id))}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: sbPayload
        }
      );

      // Si el perfil no existe todavia en Supabase, se crea con la misma clave.
      if (updateResult.error) {
        await supabaseRestRequest('profiles', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: sbPayload
        });
      }
    }

    return res.json({ success: true, data: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/users/:id/toggle-status', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const existing = await resolveAssociatedUser(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }

    const newActiveState = existing.active === false;
    const updatedUser = {
      ...existing,
      id: existing.id || id,
      active: newActiveState,
      updated_at: new Date().toISOString()
    };

    savePersistedUser(updatedUser);
    return res.json({ success: true, data: updatedUser, active: newActiveState });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.delete('/api/users/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const session = res.locals.supabaseContext;
    const isAuthenticated = !!(session?.userEmail || session?.userId);
    if (!isAuthenticated) {
      return res.status(401).json({ success: false, error: 'Sesión requerida para eliminar usuarios.' });
    }
    const { id } = req.params;
    deletePersistedUser(id);

    const deleteProfile = async (): Promise<{ ok: boolean; via: string; detail?: any }> => {
      const filter = `profiles?id=eq.${encodeURIComponent(id)}`;

      // Sonda con service role: PostgREST devuelve 204 incluso cuando RLS
      // bloquea silenciosamente el borrado, así que hay que verificar.
      const stillExists = async (): Promise<boolean> => {
        try {
          const probe = await supabaseServiceRestRequest(`${filter}&select=id`);
          return !probe.error && Array.isArray(probe.data) && probe.data.length > 0;
        } catch {
          return false;
        }
      };

      // 1. Intento autenticado (respeta RLS con la sesión del administrador).
      try {
        const result = await authenticatedSupabaseRestRequest(res, filter, { method: 'DELETE' });
        if (!result.error && !(await stillExists())) {
          return { ok: true, via: 'sesion' };
        }
      } catch (authErr) {
        console.warn('Aviso eliminando usuario en Supabase (autenticado):', authErr);
      }

      // 2. Respaldo con service role: si RLS bloquea el borrado de la sesión,
      //    el administrador con acceso total igual logra eliminar el perfil.
      try {
        const backup = await supabaseServiceRestRequest(filter, { method: 'DELETE' });
        if (!backup.error && !(await stillExists())) {
          return { ok: true, via: 'service-role' };
        }
        return { ok: false, via: 'service-role', detail: backup.error };
      } catch (svcErr) {
        return { ok: false, via: 'service-role', detail: svcErr };
      }
    };

    const outcome = await deleteProfile();
    if (!outcome.ok) {
      console.warn('El perfil no pudo eliminarse de Supabase:', id, outcome.detail);
      return res.json({
        success: true,
        message: 'Usuario eliminado del directorio local. No pudo borrarse en la base de datos.'
      });
    }

    return res.json({ success: true, message: 'Usuario eliminado exitosamente.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// 7.C MÃ“DULO DE GASTOS FIJOS Y VARIABLES (EXPENSES) PROXY
// ---------------------------------------------------------------------------
app.get('/api/expense-categories', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    if (!orgId) {
      return res.status(200).json({ success: true, data: localExpenseCategories.load(), source: 'local' });
    }
    const result = await authenticatedSupabaseRestRequest(
      res,
      `expense_categories?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=name.asc`
    );
    if (result.error) {
      return res.status(200).json({ success: true, data: localExpenseCategories.load(orgId), source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: localExpenseCategories.load(res.locals.supabaseContext?.organizationId), source: 'local' });
  }
});

app.post('/api/expense-categories', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    const { name, is_default } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
    }
    const result = await authenticatedSupabaseRestRequest(res, 'expense_categories', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        organization_id: orgId,
        name: name.trim(),
        is_default: !!is_default,
        created_at: new Date().toISOString()
      }
    });
    if (result.error) {
      const saved = localExpenseCategories.upsert(
        {
          organization_id: orgId,
          name: name.trim(),
          is_default: !!is_default,
          created_at: new Date().toISOString()
        },
        ['name']
      );
      return res.json({ success: true, data: saved, source: 'local' });
    }
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.get('/api/expenses', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    if (!orgId) {
      return res.status(200).json({ success: true, data: localExpenses.load(), source: 'local' });
    }
    const result = await authenticatedSupabaseRestRequest(
      res,
      `expenses?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=due_date.asc,created_at.desc`
    );
    if (result.error) {
      return res.status(200).json({ success: true, data: localExpenses.load(orgId), source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: localExpenses.load(res.locals.supabaseContext?.organizationId), source: 'local' });
  }
});

app.post('/api/expenses', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    const rawExpense = req.body || {};
    let expensePayload: Record<string, any> = { ...rawExpense };
    if (orgId && !expensePayload.organization_id) {
      expensePayload.organization_id = orgId;
    }

    // Sanitizar UUIDs opcionales
    const isValidUuid = (val?: string | null) =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (expensePayload.branch_id && !isValidUuid(expensePayload.branch_id)) {
      delete expensePayload.branch_id;
    }
    if (expensePayload.payment_account_id && !isValidUuid(expensePayload.payment_account_id)) {
      delete expensePayload.payment_account_id;
    }

    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < 6) {
      attempts++;
      const result = await authenticatedSupabaseRestRequest(res, 'expenses', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: expensePayload
      });

      if (!result.error && result.data) {
        const created = Array.isArray(result.data) ? result.data[0] : result.data;
        return res.json({ success: true, data: { ...rawExpense, ...created } });
      }

      lastError = result.error || 'Error insertando gasto';
      const missingColMatch = lastError.match(/Could not find the '([^']+)' column of 'expenses'/i);
      if (missingColMatch && missingColMatch[1] && missingColMatch[1] in expensePayload) {
        delete expensePayload[missingColMatch[1]];
        continue;
      }
      break;
    }

    const saved = localExpenses.upsert(
      { ...expensePayload, id: expensePayload.id || `exp-${Date.now()}` },
      ['id']
    );
    return res.json({ success: true, data: { ...rawExpense, ...saved }, source: 'local' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.patch('/api/expenses/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body || {};
    let updatesPayload: Record<string, any> = { ...rawUpdates };

    const isValidUuid = (val?: string | null) =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if ('branch_id' in updatesPayload && updatesPayload.branch_id && !isValidUuid(updatesPayload.branch_id)) {
      delete updatesPayload.branch_id;
    }
    if ('payment_account_id' in updatesPayload && updatesPayload.payment_account_id && !isValidUuid(updatesPayload.payment_account_id)) {
      delete updatesPayload.payment_account_id;
    }

    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < 6) {
      attempts++;
      const result = await authenticatedSupabaseRestRequest(
        res,
        `expenses?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: updatesPayload
        }
      );

      if (!result.error) {
        const updated = Array.isArray(result.data) ? result.data[0] : result.data;
        return res.json({ success: true, data: { ...rawUpdates, ...updated } });
      }

      lastError = result.error || 'Error actualizando gasto';
      const missingColMatch = lastError.match(/Could not find the '([^']+)' column of 'expenses'/i);
      if (missingColMatch && missingColMatch[1] && missingColMatch[1] in updatesPayload) {
        delete updatesPayload[missingColMatch[1]];
        continue;
      }
      break;
    }

    const saved = localExpenses.upsert({ ...updatesPayload, id }, ['id']);
    return res.json({ success: true, data: { ...rawUpdates, ...saved }, source: 'local' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.put('/api/expenses/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body || {};
    let updatesPayload: Record<string, any> = { ...rawUpdates };

    const isValidUuid = (val?: string | null) =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if ('branch_id' in updatesPayload && updatesPayload.branch_id && !isValidUuid(updatesPayload.branch_id)) {
      delete updatesPayload.branch_id;
    }
    if ('payment_account_id' in updatesPayload && updatesPayload.payment_account_id && !isValidUuid(updatesPayload.payment_account_id)) {
      delete updatesPayload.payment_account_id;
    }

    const result = await authenticatedSupabaseRestRequest(
      res,
      `expenses?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: updatesPayload
      }
    );

    if (!result.error) {
      const updated = Array.isArray(result.data) ? result.data[0] : result.data;
      return res.json({ success: true, data: { ...rawUpdates, ...updated } });
    }
    const saved = localExpenses.upsert({ ...updatesPayload, id }, ['id']);
    return res.json({ success: true, data: { ...rawUpdates, ...saved }, source: 'local' });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/expenses/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `expenses?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    if (result.error) {
      localExpenses.remove((row: any) => row.id === id);
      return res.json({ success: true, source: 'local' });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// Endpoint para registrar pago de gasto con auditorÃ­a y enlace a tesorerÃ­a
app.post('/api/expenses/:id/pay', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    const { id } = req.params;
    const {
      amount,
      currency,
      exchangeRate,
      paidAt,
      paymentMethod,
      bankAccountId,
      reference,
      notes,
      nextDueDate
    } = req.body || {};

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Monto de pago no vÃ¡lido.' });
    }

    const payDate = paidAt || new Date().toISOString().split('T')[0];

    // 1. Registrar pago en expense_payments
    try {
      await authenticatedSupabaseRestRequest(res, 'expense_payments', {
        method: 'POST',
        body: {
          expense_id: id,
          organization_id: orgId,
          amount: numAmount,
          currency: currency || 'USD',
          exchange_rate: exchangeRate || 1.0,
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod || 'Transferencia bancaria',
          bank_account_id: bankAccountId || null,
          reference: reference || null,
          notes: notes || null
        }
      });
    } catch (e) {
      console.warn('Aviso registrando en expense_payments:', e);
    }

    // 2. Si se especificÃ³ cuenta bancaria, registrar movimiento de egreso
    if (bankAccountId) {
      try {
        const accRes = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bankAccountId)}&select=balance,currency,organization_id,bank_name`);
        const accList = (!accRes.error && Array.isArray(accRes.data) && accRes.data.length > 0) ? accRes.data : loadPersistedBankAccounts().filter((a: any) => a.id === bankAccountId);
        
        if (accList.length > 0) {
          const acc = accList[0];
          let deductionAmount = numAmount;
          if (currency && acc.currency && currency !== acc.currency) {
             deductionAmount = (currency === 'USD' && acc.currency === 'VES')
               ? numAmount * (exchangeRate || 1.0)
               : numAmount / (exchangeRate || 1.0);
          }
          deductionAmount = Math.round(deductionAmount * 100) / 100;
          const currentBalance = Number(acc.balance) || 0;
          const newBalance = Math.round((currentBalance - deductionAmount) * 100) / 100;
          
          await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bankAccountId)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: { balance: newBalance }
          });

          savePersistedBankAccount({ ...acc, balance: newBalance });

          const mov = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now(),
            organization_id: acc.organization_id || orgId || '00000000-0000-0000-0000-000000000001',
            bank_account_id: bankAccountId,
            type: 'SALIDA',
            concept: notes || `Pago de gasto operativo (${currency || 'USD'} ${numAmount.toFixed(2)})`,
            reference: reference || `EXP-${id.slice(0, 8)}`,
            user_name: 'AdministraciÃ³n / Gastos',
            rate: exchangeRate || 1.0,
            commission: 0,
            commission_type: 'Fija',
            amount: deductionAmount,
            created_at: new Date().toISOString()
          };

          savePersistedBankMovement(mov);
          try {
            await authenticatedSupabaseRestRequest(res, 'bank_movements', {
              method: 'POST',
              headers: { Prefer: 'return=representation' },
              body: mov
            });
          } catch {}
        }
      } catch (bmErr) {
        console.warn('Aviso registrando movimiento bancario de gasto:', bmErr);
      }
    }

    // 3. Actualizar el registro del gasto (Ãºltimo pago y prÃ³xima fecha si es fijo)
    const updates: Record<string, any> = {
      last_payment_date: payDate,
      updated_at: new Date().toISOString()
    };
    if (nextDueDate) {
      updates.due_date = nextDueDate;
      updates.status = 'PENDIENTE';
    } else {
      updates.status = 'PAGADO';
    }

    const updateRes = await authenticatedSupabaseRestRequest(
      res,
      `expenses?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: updates
      }
    );

    return res.json({
      success: true,
      message: 'Pago de gasto registrado exitosamente.',
      data: updateRes.data || updates
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error procesando pago de gasto' });
  }
});

// ---------------------------------------------------------------------------
// 8. VENTAS, CUENTAS POR COBRAR Y CUENTAS POR PAGAR PROXY
// ---------------------------------------------------------------------------
app.get('/api/sales', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `sales?organization_id=eq.${encodeURIComponent(orgId)}&select=id,doc_number,created_at,total_usd,total_ves,status,payment_type,doc_type&order=created_at.desc&limit=100`
    );
    if (result.error) {
      return res.status(200).json({ success: true, data: localSales.load(orgId), source: 'local' });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: localSales.load(res.locals.supabaseContext?.organizationId), source: 'local' });
  }
});

app.get('/api/sales/rotation', async (_req, res: AuthenticatedResponse) => {
  // Rotacion real por SKU: suma de unidades vendidas en las ultimas 300
  // ventas COMPLETADAS del inquilino activo (sales + sale_items). Alimenta
  // el catalogo destacado del POS en movil; el cliente nunca consulta
  // Supabase directo (regla de dominio: credenciales solo en el servidor).
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `sales?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.COMPLETADA&select=id,sale_items(sku,quantity)&order=created_at.desc&limit=300`
    );
    if (result.error) {
      return res.status(200).json({ success: true, data: {}, warnings: result.error });
    }
    const rotation: Record<string, number> = {};
    for (const sale of (result.data || []) as any[]) {
      const items = Array.isArray(sale?.sale_items) ? sale.sale_items : [];
      for (const item of items) {
        const key = String(item?.sku || '').trim();
        if (!key) continue;
        rotation[key] = (rotation[key] || 0) + (Number(item?.quantity) || 0);
      }
    }
    return res.json({ success: true, data: rotation });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: {}, warnings: err?.message });
  }
});

app.get('/api/sales/last-doc-number', async (req, res: AuthenticatedResponse) => {
  const type = req.query.type as string || 'FACTURA';
  try {
    const result = await authenticatedSupabaseRestRequest(res, `sales?doc_type=eq.${type}&select=doc_number&order=created_at.desc&limit=1`);
    if (!result.error) {
      return res.json({ success: true, data: result.data && result.data.length > 0 ? result.data[0] : null });
    }
    return res.json({ success: false, error: result.error });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.get('/api/sale-items', async (req, res: AuthenticatedResponse) => {
  try {
    const saleId = typeof req.query.sale_id === 'string' ? req.query.sale_id : '';
    const filter = saleId ? `&sale_id=eq.${encodeURIComponent(saleId)}` : '';
    const result = await authenticatedSupabaseRestRequest(
      res,
      `sale_items?select=sale_id,sku,name,quantity,unit_price_usd,total_usd${filter}&limit=2000`
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

// ---------------------------------------------------------------------------
// AGREGADO DEL REPORTE DE VENTAS: todo lo que el resumen y la emision
// necesitan en una sola peticion (nunca consultas directas desde el cliente).
// ---------------------------------------------------------------------------
app.get('/api/sales/report', async (_req, res: AuthenticatedResponse) => {
  const orgId = res.locals?.supabaseContext?.organizationId;
  const result: {
    success: boolean;
    rate: number | null;
    sales: any[];
    customers: any[];
    bankAccounts: any[];
    payments: any[];
    saleItems: any[];
    warnings: string[];
  } = {
    success: true,
    rate: null,
    sales: [],
    customers: [],
    bankAccounts: [],
    payments: [],
    saleItems: [],
    warnings: []
  };

  // Ejecutar las 6 consultas independientes en paralelo en vez de esperarlas una tras otra.
  const [rateRes, salesRes, customersRes, banksRes, paymentsRes, itemsRes] = await Promise.all([
    authenticatedSupabaseRestRequest(res, 'exchange_rates?select=rate&order=observed_at.desc&limit=1')
      .catch(() => ({ status: 500, data: null, error: 'error' })),
    authenticatedSupabaseRestRequest(res, 'sales?select=*&order=created_at.desc&limit=1000')
      .catch((err: any) => ({ status: 500, data: null, error: err?.message || 'error' })),
    authenticatedSupabaseRestRequest(res, 'customers?select=id,name,doc_number,doc_type,phone&limit=2000')
      .catch((err: any) => ({ status: 500, data: null, error: err?.message || 'error' })),
    authenticatedSupabaseRestRequest(res, 'bank_accounts?select=id,bank_name,account_number&limit=2000')
      .catch((err: any) => ({ status: 500, data: null, error: err?.message || 'error' })),
    (async () => {
      let pRes = await authenticatedSupabaseRestRequest(res, 'payments?select=*&order=created_at.desc&limit=5000');
      if (pRes.error) {
        const retry = await authenticatedSupabaseRestRequest(res, 'payments?select=*&limit=5000');
        if (!retry.error) return retry;
      }
      return pRes;
    })().catch((err: any) => ({ status: 500, data: null, error: err?.message || 'error' })),
    authenticatedSupabaseRestRequest(res, 'sale_items?select=sale_id,sku,name,quantity,unit_price_usd,total_usd&limit=5000')
      .catch((err: any) => ({ status: 500, data: null, error: err?.message || 'error' }))
  ]);

  const rateValue = Array.isArray(rateRes.data) && rateRes.data.length > 0 ? Number(rateRes.data[0]?.rate) : NaN;
  result.rate = Number.isFinite(rateValue) && rateValue > 0 ? rateValue : (lastCertifiedRate?.appliedRate ?? null);

  if (salesRes.error) {
    result.warnings.push(`sales: ${salesRes.error}`);
    result.sales = localSales.load(orgId);
  } else {
    result.sales = salesRes.data || [];
  }

  result.customers = customersRes.error ? [] : (customersRes.data || []);
  if (customersRes.error) result.warnings.push(`customers: ${customersRes.error}`);

  result.bankAccounts = banksRes.error ? [] : (banksRes.data || []);
  if (banksRes.error) result.warnings.push(`bank_accounts: ${banksRes.error}`);

  result.payments = paymentsRes.error ? [] : (paymentsRes.data || []);
  if (paymentsRes.error) result.warnings.push(`payments: ${paymentsRes.error}`);

  result.saleItems = itemsRes.error ? [] : (itemsRes.data || []);
  if (itemsRes.error) result.warnings.push(`sale_items: ${itemsRes.error}`);

  return res.json(result);
});

// ---------------------------------------------------------------------------
// EMISION DE VENTAS (POS): el flujo completo corre en el servidor. El navegador
// nunca consulta Supabase directamente, evitando errores de clave de API.
// ---------------------------------------------------------------------------
const roundMoney = (value: any): number => Math.round((Number(value) || 0) * 100) / 100;

const isValidUuid = (val?: string | null): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

app.post('/api/sales', async (req, res: AuthenticatedResponse) => {
  try {
    if (!res.locals?.supabaseContext) {
      return res.status(401).json({ success: false, error: 'Sesión requerida para emitir ventas.' });
    }

    const body = req.body || {};
    const saleInput = body.sale || {};
    const itemInputs: any[] = Array.isArray(body.items) ? body.items : [];
    const paymentInputs: any[] = Array.isArray(body.payments) ? body.payments : [];

    if (!saleInput.doc_number) {
      return res.status(400).json({ success: false, error: 'El número de documento es obligatorio.' });
    }

    const warnings: string[] = [];

    // 1. Validación de stock disponible (no se permiten ventas en negativo)
    const skus = Array.from(new Set(itemInputs.map((it: any) => it.sku).filter(Boolean))) as string[];
    const productRows: any[] = [];
    if (skus.length > 0) {
      const skuFilter = skus.map(s => `"${String(s).replace(/"/g, '')}"`).join(',');
      const stockRes = await authenticatedSupabaseRestRequest(res, `products?select=id,sku,name,stock,branch_id,cost_usd,price_usd&sku=in.(${skuFilter})`);
      if (stockRes.error) {
        warnings.push(`stock: no se pudo validar existencia (${stockRes.error})`);
      } else if (Array.isArray(stockRes.data)) {
        productRows.push(...stockRes.data);
      }

      for (const it of itemInputs) {
        const sku = it.sku;
        if (!sku) continue;
        const qty = Number(it.quantity) || 1;
        const product = productRows.find((p: any) => p.sku === sku);
        if (product && (Number(product.stock) || 0) < qty) {
          return res.status(400).json({
            success: false,
            error: `Stock insuficiente para "${product.name}" (SKU: ${sku}). Disponible: ${Number(product.stock) || 0}, Cantidad solicitada: ${qty}. El sistema no permite ventas sin stock o en negativo.`
          });
        }
      }
    }

    // 2. Insertar la venta (organization_id es inyectado por el servidor)
    const cleanSale = {
      branch_id: saleInput.branch_id && isValidUuid(saleInput.branch_id) ? saleInput.branch_id : null,
      customer_id: saleInput.customer_id && isValidUuid(saleInput.customer_id) ? saleInput.customer_id : null,
      user_id: saleInput.user_id && isValidUuid(saleInput.user_id) ? saleInput.user_id : null,
      doc_type: saleInput.doc_type || 'FACTURA',
      doc_number: saleInput.doc_number,
      status: saleInput.status || 'COMPLETADA',
      payment_type: saleInput.payment_type || 'CONTADO',
      exchange_rate: roundMoney(saleInput.exchange_rate) || 1,
      subtotal_usd: roundMoney(saleInput.subtotal_usd),
      discount_usd: roundMoney(saleInput.discount_usd),
      tax_usd: roundMoney(saleInput.tax_usd),
      igtf_usd: roundMoney(saleInput.igtf_usd),
      total_usd: roundMoney(saleInput.total_usd),
      total_ves: roundMoney(saleInput.total_ves),
      notes: saleInput.notes || null,
      created_at: saleInput.created_at || new Date().toISOString()
    };

    const saleIns = await authenticatedSupabaseRestRequest(res, 'sales', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: [cleanSale]
    });
    if (saleIns.error || !saleIns.data) {
      return res.status(200).json({ success: false, error: saleIns.error || 'Supabase no devolvió la venta registrada.' });
    }
    const saleRow = Array.isArray(saleIns.data) ? saleIns.data[0] : saleIns.data;
    const saleId = saleRow?.id;

    // 3. Ítems vendidos
    if (itemInputs.length > 0) {
      const itemsPayload = itemInputs.map((it: any) => ({
        sale_id: saleId,
        product_id: it.product_id && isValidUuid(it.product_id) ? it.product_id : null,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity || 1,
        unit_price_usd: roundMoney(it.unit_price_usd),
        total_usd: roundMoney(it.total_usd),
        total_ves: roundMoney(it.total_ves)
      }));
      const itemsIns = await authenticatedSupabaseRestRequest(res, 'sale_items', { method: 'POST', body: itemsPayload });
      if (itemsIns.error) {
        warnings.push(`La venta se creó, pero no se guardaron sus productos: ${itemsIns.error}`);
      }
    }

    // 4. Pagos (tolerante: la tabla puede no existir en el esquema actual)
    if (paymentInputs.length > 0) {
      const paymentsPayload = paymentInputs.map((p: any) => ({
        sale_id: saleId,
        method: p.method || 'Efectivo',
        amount_usd: roundMoney(p.amount_usd),
        amount_ves: roundMoney(p.amount_ves),
        exchange_rate: roundMoney(p.exchange_rate) || cleanSale.exchange_rate,
        bank_account_id: isValidUuid(p.bank_account_id) ? p.bank_account_id : null
      }));
      const payIns = await authenticatedSupabaseRestRequest(res, 'payments', { method: 'POST', body: paymentsPayload });
      if (payIns.error) {
        warnings.push(`Los pagos no fueron registrados en tesorería: ${payIns.error}`);
      } else {
        // 5. Abonar saldos en cuentas bancarias registradas
        for (const p of paymentInputs) {
          const bankId = p.bank_account_id;
          if (!isValidUuid(bankId)) continue;
          try {
            const accRes = await authenticatedSupabaseRestRequest(res, `bank_accounts?select=id,balance,currency&id=eq.${encodeURIComponent(bankId)}&limit=1`);
            const accRow = Array.isArray(accRes.data) && accRes.data.length > 0 ? accRes.data[0] : null;
            if (accRow) {
              const addAmount = accRow.currency === 'VES' ? roundMoney(p.amount_ves) : roundMoney(p.amount_usd);
              await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bankId)}`, {
                method: 'PATCH',
                body: { balance: roundMoney((Number(accRow.balance) || 0) + addAmount) }
              });
            }
          } catch (err: any) {
            warnings.push(`No se abonó la cuenta bancaria ${bankId}: ${err?.message || 'error'}`);
          }
        }
      }
    }

    // 6. Descuento de inventario y kárdex de movimientos
    for (const item of itemInputs) {
      const sku = item.sku;
      if (!sku) continue;
      const qtySold = Number(item.quantity) || 1;

      let currentProd = productRows.find((p: any) => p.sku === sku) || null;
      if (!currentProd) {
        const single = await authenticatedSupabaseRestRequest(res, `products?select=*&sku=eq.${encodeURIComponent(sku)}&limit=1`);
        currentProd = single.error || !Array.isArray(single.data) ? null : single.data[0];
      }
      if (!currentProd) continue;

      const prevStock = Number(currentProd.stock) || 0;
      const nextStock = Math.max(0, prevStock - qtySold);

      const stockUpd = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        body: { stock: nextStock }
      });
      if (stockUpd.error) {
        warnings.push(`No se descontó el stock de ${sku}: ${stockUpd.error}`);
      }

      try {
        const itemTotalUsd = roundMoney(item.total_usd) || roundMoney(qtySold * (Number(item.unit_price_usd) || 0));
        const itemTotalVes = roundMoney(item.total_ves) || roundMoney(itemTotalUsd * cleanSale.exchange_rate);

        await authenticatedSupabaseRestRequest(res, 'inventory_movements', {
          method: 'POST',
          body: [{
            branch_id: currentProd.branch_id && isValidUuid(currentProd.branch_id) ? currentProd.branch_id : cleanSale.branch_id,
            product_id: currentProd.id || (item.product_id && isValidUuid(item.product_id) ? item.product_id : null),
            sku: item.sku,
            product_name: item.name || currentProd.name,
            movement_type: 'VENTA',
            doc_type: cleanSale.doc_type,
            doc_number: cleanSale.doc_number,
            entity_type: 'CLIENTE',
            entity_name: cleanSale.customer_id ? 'Cliente' : 'Cliente Mostrador',
            quantity: -Math.abs(qtySold),
            unit_cost_usd: roundMoney(currentProd.cost_usd),
            unit_price_usd: roundMoney(item.unit_price_usd) || roundMoney(currentProd.price_usd),
            exchange_rate: cleanSale.exchange_rate,
            total_usd: itemTotalUsd,
            total_ves: itemTotalVes,
            previous_stock: prevStock,
            new_stock: nextStock,
            reason: `Venta POS (${cleanSale.doc_type})`,
            notes: cleanSale.notes,
            created_at: cleanSale.created_at
          }]
        });
      } catch (err: any) {
        warnings.push(`Aviso registrando el movimiento de inventario para ${sku}: ${err?.message || 'error'}`);
      }
    }

    // 7. Crédito: registro en cuentas por cobrar + abono inicial
    if (cleanSale.payment_type === 'CREDITO' && cleanSale.customer_id) {
      const totalPaidUsd = paymentInputs.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0);
      const balanceUsd = Math.max(0, roundMoney(cleanSale.total_usd - totalPaidUsd));
      const receivableStatus = balanceUsd <= 0.01 ? 'PAGADA' : (totalPaidUsd > 0.01 ? 'PARCIAL' : 'PENDIENTE');

      const recIns = await authenticatedSupabaseRestRequest(res, 'accounts_receivable', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: [{
          customer_id: cleanSale.customer_id,
          sale_id: saleId,
          doc_number: cleanSale.doc_number,
          total_usd: cleanSale.total_usd,
          balance_usd: balanceUsd,
          status: receivableStatus
        }]
      });
      if (recIns.error) {
        warnings.push(`La cuenta por cobrar no fue registrada: ${recIns.error}`);
      } else {
        const recRow = Array.isArray(recIns.data) ? recIns.data[0] : recIns.data;
        if (recRow?.id && totalPaidUsd > 0.01) {
          for (const p of paymentInputs) {
            try {
              const paymentRow = {
                receivable_id: recRow.id,
                bank_account_id: isValidUuid(p.bank_account_id) ? p.bank_account_id : null,
                amount_usd: roundMoney(p.amount_usd),
                amount_ves: roundMoney(p.amount_ves),
                exchange_rate: roundMoney(p.exchange_rate) || cleanSale.exchange_rate,
                payment_method: p.method || 'Efectivo',
                reference: p.reference || cleanSale.doc_number,
                payment_date: new Date().toISOString()
              };
              // 1. Intento autenticado (respetando RLS del inquilino)
              let payRes = await authenticatedSupabaseRestRequest(res, 'receivable_payments', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: paymentRow
              });
              // 2. Respaldo con service role si RLS/membresía bloquea la fila
              //    (p.ej. receivable_payments sigue con RLS activo y la tabla
              //    organization_members vacía hasta aplicar la 0027).
              if (payRes.error) {
                // Respaldo con la clave de servicio (el anon no basta porque
                // receivable_payments conserva RLS mientras organization_members
                // este vacia; la 0027 lo resolvera en la base).
                payRes = await supabaseServiceRestRequest('receivable_payments', {
                  method: 'POST',
                  headers: { Prefer: 'return=representation' },
                  body: paymentRow
                });
              }
              if (payRes.error) {
                warnings.push(`Aviso registrando el abono inicial: ${payRes.error}`);
              }
            } catch (err: any) {
              warnings.push(`Aviso registrando el abono inicial: ${err?.message || 'error'}`);
            }
          }
        }
      }
    } else if (cleanSale.payment_type === 'CREDITO' && !cleanSale.customer_id) {
      // Venta a crédito SIN cliente registrado: la tabla real exige customer_id,
      // por lo que no puede insertarse en Supabase. Se persiste en el respaldo
      // local para que aparezca en el resumen de CxC (hasta registrar al cliente;
      // la migración 0025 permitirá esto en Supabase).
      const localPaidUsd = paymentInputs.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0);
      const localBalance = Math.max(0, roundMoney(cleanSale.total_usd - localPaidUsd));
      const localStatus = localBalance <= 0.01 ? 'PAGADA' : (localPaidUsd > 0.01 ? 'PARCIAL' : 'PENDIENTE');
      try {
        savePersistedReceivable({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rec-' + Date.now(),
          organization_id: res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001',
          customer_id: null,
          customer_name: 'Cliente sin registrar',
          sale_id: saleId,
          doc_number: cleanSale.doc_number,
          total_usd: roundMoney(cleanSale.total_usd),
          balance_usd: localBalance,
          status: localStatus,
          due_date: null,
          concept: 'Venta a crédito (cliente sin registrar)',
          created_at: cleanSale.created_at
        });
        warnings.push('Venta a crédito con cliente sin registrar: la cuenta por cobrar se guardó localmente para el resumen de CxC. Registra al cliente y aplica la 0025 para persistirla en Supabase.');
      } catch (err: any) {
        warnings.push(`La cuenta por cobrar no pudo guardarse: ${err?.message || 'error'}`);
      }
    }

    return res.json({ success: true, saleId, warnings });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error del servidor al emitir la venta.' });
  }
});

const ACCOUNTS_RECEIVABLE_FILE = path.resolve(DATA_DIR, 'accounts_receivable.json');
const ACCOUNTS_PAYABLE_FILE = path.resolve(DATA_DIR, 'accounts_payable.json');
const PURCHASES_FILE = path.resolve(DATA_DIR, 'purchases.json');

function loadPersistedReceivables(orgId?: string): any[] {
  try {
    if (fs.existsSync(ACCOUNTS_RECEIVABLE_FILE)) {
      const content = fs.readFileSync(ACCOUNTS_RECEIVABLE_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) return list.filter((r: any) => !r.organization_id || r.organization_id === orgId);
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando cuentas por cobrar locales:', err);
  }
  return [];
}

function savePersistedReceivable(receivable: any) {
  try {
    const dir = path.dirname(ACCOUNTS_RECEIVABLE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedReceivables();
    const idx = current.findIndex((r: any) => r.id === receivable.id || (r.doc_number && r.doc_number === receivable.doc_number));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...receivable };
    } else {
      current.unshift(receivable);
    }
    fs.writeFileSync(ACCOUNTS_RECEIVABLE_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando cuenta por cobrar local:', err);
  }
}

function loadPersistedPayables(orgId?: string): any[] {
  try {
    if (fs.existsSync(ACCOUNTS_PAYABLE_FILE)) {
      const content = fs.readFileSync(ACCOUNTS_PAYABLE_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) return list.filter((p: any) => !p.organization_id || p.organization_id === orgId);
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando cuentas por pagar locales:', err);
  }
  return [];
}

function savePersistedPayable(payable: any) {
  try {
    const dir = path.dirname(ACCOUNTS_PAYABLE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedPayables();
    const idx = current.findIndex((p: any) => p.id === payable.id || (p.doc_number && p.doc_number === payable.doc_number && p.supplier_name === payable.supplier_name));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...payable };
    } else {
      current.unshift(payable);
    }
    fs.writeFileSync(ACCOUNTS_PAYABLE_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando cuenta por pagar local:', err);
  }
}

function loadPersistedPurchases(orgId?: string): any[] {
  try {
    if (fs.existsSync(PURCHASES_FILE)) {
      const content = fs.readFileSync(PURCHASES_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        if (orgId) return list.filter((p: any) => !p.organization_id || p.organization_id === orgId);
        return list;
      }
    }
  } catch (err) {
    console.warn('Aviso cargando compras locales:', err);
  }
  return [];
}

function savePersistedPurchase(purchase: any) {
  try {
    const dir = path.dirname(PURCHASES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadPersistedPurchases();
    const idx = current.findIndex((p: any) => p.id === purchase.id || (p.doc_number && p.doc_number === purchase.doc_number));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...purchase };
    } else {
      current.unshift(purchase);
    }
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando compra local:', err);
  }
}

async function fetchReconciledAccountsReceivable(orgId: string): Promise<any[]> {
  let dbItems: any[] = [];
  try {
    const [primaryRes, directPaymentsRes] = await Promise.all([
      supabaseRestRequest('accounts_receivable?select=*,customers(*),receivable_payments(*),sales(*,sale_items(*))&order=created_at.desc'),
      supabaseRestRequest('receivable_payments?select=*&order=payment_date.desc')
    ]);

    if (!primaryRes.error && Array.isArray(primaryRes.data)) {
      dbItems = primaryRes.data;
    } else {
      const fallbackRes = await supabaseRestRequest('accounts_receivable?select=*,customers(*)&order=created_at.desc');
      if (!fallbackRes.error && Array.isArray(fallbackRes.data)) {
        dbItems = fallbackRes.data;
      }
    }

    const saleIds = dbItems.map((r: any) => r.sale_id).filter(Boolean);
    let salePayments: any[] = [];
    if (saleIds.length > 0) {
      const salePaysRes = await supabaseRestRequest(`payments?sale_id=in.(${saleIds.join(',')})&order=created_at.desc`);
      if (!salePaysRes.error && Array.isArray(salePaysRes.data)) {
        salePayments = salePaysRes.data;
      }
    }

    const directPaymentsMap = new Map<string, any[]>();
    if (!directPaymentsRes.error && Array.isArray(directPaymentsRes.data)) {
      for (const p of directPaymentsRes.data) {
        if (p.receivable_id) {
          const arr = directPaymentsMap.get(p.receivable_id) || [];
          arr.push(p);
          directPaymentsMap.set(p.receivable_id, arr);
        }
      }
    }

    for (const item of dbItems) {
      const recPays = item.receivable_payments || directPaymentsMap.get(item.id) || [];
      const matchingSalePays = salePayments
        .filter((p: any) => p.sale_id === item.sale_id)
        .map((p: any) => ({
          id: p.id,
          receivable_id: item.id,
          amount_usd: Number(p.amount_usd) || 0,
          amount_ves: Number(p.amount_ves) || 0,
          exchange_rate: Number(p.exchange_rate) || 1,
          payment_method: p.method || 'Efectivo USD',
          reference: p.reference_number || 'PAGO CONTADO/CRÉDITO',
          payment_date: p.created_at
        }));

      const payMap = new Map<string, any>();
      for (const p of [...recPays, ...matchingSalePays]) {
        const k = p.id || `${p.payment_date || p.date}-${p.amount_usd}`;
        payMap.set(k, p);
      }

      const mergedPayments = Array.from(payMap.values());
      const total = Number(item.total_usd) || 0;
      const balance = Number(item.balance_usd != null ? item.balance_usd : 0);
      const paidDiff = Math.round(Math.max(0, total - balance) * 100) / 100;
      const currentSum = mergedPayments.reduce((s: number, p: any) => s + (Number(p.amount_usd) || 0), 0);

      if (paidDiff > currentSum + 0.01) {
        const missing = Math.round((paidDiff - currentSum) * 100) / 100;
        mergedPayments.unshift({
          id: `pago-registrado-${item.id}`,
          receivable_id: item.id,
          amount_usd: missing,
          amount_ves: Math.round(missing * (Number(item.sales?.exchange_rate || item.exchange_rate) || 877.90) * 100) / 100,
          exchange_rate: Number(item.sales?.exchange_rate || item.exchange_rate) || 877.90,
          payment_method: 'Cancelación registrada',
          reference: 'PAGO-COMPLETO',
          payment_date: item.updated_at || item.created_at || new Date().toISOString()
        });
      }

      item.receivable_payments = mergedPayments;
      item.customer_name = item.customers?.name || item.customer_name || 'Cliente';
      item.customer_doc = item.customers?.doc_number || item.customer_doc || '';
      item.customer_phone = item.customers?.phone || '';
    }

    try {
      const localRows = loadPersistedReceivables(orgId);
      const known = new Set(dbItems.map((i: any) => String(i.id)));
      const missingLocal = localRows.filter((r: any) => !known.has(String(r.id)));
      if (missingLocal.length > 0) {
        dbItems = [...missingLocal, ...dbItems];
      }
    } catch {}

    if (dbItems.length > 0) {
      try {
        fs.writeFileSync(ACCOUNTS_RECEIVABLE_FILE, JSON.stringify(dbItems, null, 2), 'utf-8');
      } catch {}
      return dbItems;
    }
  } catch (sbErr) {
    console.warn('Aviso consultando accounts_receivable en Supabase:', sbErr);
  }

  return loadPersistedReceivables(orgId);
}

app.get('/api/accounts-receivable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const data = await fetchReconciledAccountsReceivable(orgId);
    return res.json({ success: true, data });
  } catch {
    return res.status(200).json({ success: true, data: loadPersistedReceivables() });
  }
});

app.post('/api/accounts-receivable', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const raw = req.body || {};
    const newId = (raw.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.id))
      ? raw.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rec-1000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0'));

    // La tabla real exige customer_id NOT NULL. Resolverlo por el id del cliente
    // seleccionado en el buscador, o por coincidencia exacta de nombre.
    let resolvedCustomerId: string | null = null;
    if (raw.customer_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw.customer_id))) {
      resolvedCustomerId = String(raw.customer_id);
    } else if (String(raw.customer_name || '').trim()) {
      try {
        const lookupRes = await supabaseRestRequest(
          `customers?select=id,name&organization_id=eq.${encodeURIComponent(orgId)}&name=eq.${encodeURIComponent(String(raw.customer_name).trim())}&limit=1`
        );
        if (!lookupRes.error && Array.isArray(lookupRes.data) && lookupRes.data.length > 0) {
          resolvedCustomerId = lookupRes.data[0]?.id || null;
        }
      } catch {}
    }

    const record = {
      ...raw,
      id: newId,
      organization_id: orgId,
      customer_id: resolvedCustomerId || undefined,
      doc_number: (raw.doc_number || '').trim(),
      concept: raw.concept?.trim() || 'Venta a crÃ©dito o saldo pendiente',
      total_usd: Number(raw.total_usd) || 0,
      balance_usd: Number(raw.balance_usd != null ? raw.balance_usd : raw.total_usd) || 0,
      status: raw.status || 'PENDIENTE',
      due_date: raw.due_date || null,
      created_at: raw.created_at || new Date().toISOString()
    };

    savePersistedReceivable(record);

    // Intentar Supabase adaptando columnas
    try {
      let payload: Record<string, any> = { ...record };
      let attempts = 0;
      while (attempts < 6) {
        attempts++;
        const result = await supabaseRestRequest('accounts_receivable', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: payload
        });
        if (!result.error && result.data) {
          const created = Array.isArray(result.data) ? result.data[0] : result.data;
          const merged = { ...record, ...created };
          savePersistedReceivable(merged);
          return res.json({ success: true, data: merged });
        }
        if (result.error) {
          const missingColMatch = result.error.match(/Could not find the '([^']+)' column of 'accounts_receivable'/i);
          if (missingColMatch && missingColMatch[1] && missingColMatch[1] in payload) {
            delete payload[missingColMatch[1]];
            continue;
          }
          break;
        }
      }
    } catch (sbErr) {
      console.warn('Aviso insertando en Supabase accounts_receivable:', sbErr);
    }

    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error guardando cuenta por cobrar' });
  }
});

app.post('/api/accounts-receivable/:id/payments', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const { amount_usd, amount_ves, exchange_rate, bank_account_id, payment_method, reference } = req.body || {};
    const amt = Number(amount_usd);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Monto de abono invÃ¡lido' });
    }

    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';

    // 1. Obtener registro actual
    let currentRec: any = null;
    const fetchRes = await supabaseRestRequest(`accounts_receivable?id=eq.${encodeURIComponent(id)}&limit=1`);
    if (!fetchRes.error && Array.isArray(fetchRes.data) && fetchRes.data.length > 0) {
      currentRec = fetchRes.data[0];
    } else {
      const localList = loadPersistedReceivables(orgId);
      currentRec = localList.find((r: any) => r.id === id);
    }

    if (!currentRec) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }

    const currentTotal = Number(currentRec.total_usd) || 0;
    const currentBalance = Number(currentRec.balance_usd != null ? currentRec.balance_usd : currentTotal);
    const newRemaining = Math.max(0, Math.round((currentBalance - amt) * 100) / 100);
    const newStatus = newRemaining <= 0 ? 'PAGADO' : 'PARCIAL';

    const paymentRecord = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rec-pay-' + Date.now(),
      receivable_id: id,
      bank_account_id: bank_account_id || null,
      amount_usd: amt,
      amount_ves: Number(amount_ves) || (amt * (Number(exchange_rate) || 1)),
      exchange_rate: Number(exchange_rate) || 1,
      payment_method: payment_method || 'Abono en cuenta',
      reference: reference || 'PAGO',
      payment_date: new Date().toISOString()
    };

    // 2. Intentar registrar en Supabase (con respaldo de service role:
    // receivable_payments conserva RLS y la tabla organization_members esta vacia)
    try {
      let payIns = await supabaseRestRequest('receivable_payments', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: paymentRecord
      });
      if (payIns.error) {
        payIns = await supabaseServiceRestRequest('receivable_payments', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: paymentRecord
        });
      }
      if (payIns.error) {
        console.warn('Aviso insertando receivable_payments en Supabase:', payIns.error);
      }
    } catch (e) {
      console.warn('Aviso insertando receivable_payments en Supabase:', e);
    }

    try {
      await supabaseRestRequest(`accounts_receivable?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          balance_usd: newRemaining,
          status: newStatus
        }
      });
    } catch (e) {
      console.warn('Aviso actualizando balance de accounts_receivable en Supabase:', e);
    }

    // 2.b Asegurar que el saldo bancario y el movimiento queden registrados en la cuenta bancaria adecuada
    let targetBankAccountId = bank_account_id || null;
    try {
      let bAcc: any = null;
      const accListRes = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*');
      const accountsList: any[] = (!accListRes.error && Array.isArray(accListRes.data)) ? accListRes.data : [];

      if (targetBankAccountId) {
        bAcc = accountsList.find((a: any) => a.id === targetBankAccountId);
      }

      // Si no se enviÃ³ ID o no se encontrÃ³, resolver segÃºn moneda o mÃ©todo
      if (!bAcc && accountsList.length > 0) {
        const methodStr = (payment_method || '').toLowerCase();
        const wantsUsd = methodStr.includes('usd') || methodStr.includes('dolar') || (amt > 0 && (!amount_ves || Number(amount_ves) === amt));
        if (wantsUsd) {
          bAcc = accountsList.find((a: any) => a.currency === 'USD' && a.status === 'Activo') ||
                 accountsList.find((a: any) => a.currency === 'USD');
        } else {
          bAcc = accountsList.find((a: any) => a.currency === 'VES' && a.status === 'Activo') ||
                 accountsList.find((a: any) => a.currency === 'VES');
        }
        if (!bAcc) bAcc = accountsList[0];
        if (bAcc) targetBankAccountId = bAcc.id;
      }

      if (bAcc && targetBankAccountId) {
        paymentRecord.bank_account_id = targetBankAccountId;
        const depositAmt = bAcc.currency === 'VES' ? (Number(amount_ves) || (amt * (Number(exchange_rate) || 1))) : amt;
        const newBal = Math.round(((Number(bAcc.balance) || 0) + depositAmt) * 100) / 100;

        await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(targetBankAccountId)}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: { balance: newBal }
        });
        try {
          savePersistedBankAccount({ ...bAcc, balance: newBal });
        } catch {}

        const refMatch = reference || `COBRO-${Date.now().toString().slice(-6)}`;
        const mov = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now(),
          organization_id: bAcc.organization_id || orgId,
          bank_account_id: targetBankAccountId,
          type: 'ENTRADA',
          concept: `Cobro de CxC - ${currentRec.customer_name || 'Cliente'} (${currentRec.doc_number || id})`,
          reference: refMatch,
          user_name: 'Gerente / Cobranzas',
          rate: Number(exchange_rate) || 1,
          commission: 0,
          commission_type: 'Fija',
          amount: depositAmt,
          created_at: new Date().toISOString()
        };
        savePersistedBankMovement(mov);
        try {
          await authenticatedSupabaseRestRequest(res, 'bank_movements', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: mov
          });
        } catch {}
      }
    } catch (bankErr) {
      console.warn('Aviso actualizando cuenta bancaria desde abono CxC:', bankErr);
    }

    // 3. Persistir en archivo local data/accounts_receivable.json
    const existingPayments = Array.isArray(currentRec.receivable_payments) ? currentRec.receivable_payments : [];
    const updatedRec = {
      ...currentRec,
      balance_usd: newRemaining,
      status: newStatus,
      receivable_payments: [paymentRecord, ...existingPayments]
    };
    savePersistedReceivable(updatedRec);

    return res.json({
      success: true,
      data: updatedRec,
      payment: paymentRecord,
      remaining_amount: newRemaining
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error procesando abono' });
  }
});

// --- Perfil de negocio (Configuración -> Negocio): persiste en la tabla organizations ---
const ORGANIZATIONS_MIRROR_FILE = path.resolve(DATA_DIR, 'organizations.json');

function loadPersistedOrganizations(): any[] {
  try {
    if (fs.existsSync(ORGANIZATIONS_MIRROR_FILE)) {
      const list = JSON.parse(fs.readFileSync(ORGANIZATIONS_MIRROR_FILE, 'utf-8'));
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.warn('Aviso cargando organizaciones locales:', err);
  }
  return [];
}

function savePersistedOrganization(row: any) {
  try {
    if (!fs.existsSync(path.dirname(ORGANIZATIONS_MIRROR_FILE))) {
      fs.mkdirSync(path.dirname(ORGANIZATIONS_MIRROR_FILE), { recursive: true });
    }
    const current = loadPersistedOrganizations();
    const idx = current.findIndex((o: any) => o.id === row.id);
    if (idx >= 0) current[idx] = { ...current[idx], ...row };
    else current.unshift(row);
    fs.writeFileSync(ORGANIZATIONS_MIRROR_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso guardando organización local:', err);
  }
}

/** Convierte una fila de organizations al formato del perfil de negocio del cliente. */
function mapOrganizationToProfile(row: any) {
  if (!row) return null;
  return {
    businessName: row.name || '',
    slogan: row.slogan || '',
    rif: row.rif || '',
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    logo: row.logo || null,
    favicon: row.favicon || null
  };
}

app.get('/api/business-profile', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';

    // 1. Select completo (requiere la migración 0026 con las columnas extra)
    const full = await authenticatedSupabaseRestRequest(res, `organizations?id=eq.${encodeURIComponent(orgId)}&limit=1`);
    if (!full.error && Array.isArray(full.data) && full.data.length > 0) {
      const row = full.data[0];
      return res.json({
        success: true,
        data: mapOrganizationToProfile(row),
        completeSchema: Object.prototype.hasOwnProperty.call(row || {}, 'logo')
      });
    }

    // 2. Respaldo: esquema base (migración 0026 no aplicada aún)
    const core = await authenticatedSupabaseRestRequest(
      res,
      `organizations?id=eq.${encodeURIComponent(orgId)}&select=name,rif,phone,address&limit=1`
    );
    if (!core.error && Array.isArray(core.data) && core.data.length > 0) {
      const row = core.data[0];
      return res.json({
        success: true,
        data: mapOrganizationToProfile({ ...row, slogan: null, email: null, whatsapp: null, logo: null, favicon: null }),
        completeSchema: false
      });
    }

    // 3. último recurso: espejo local
    const local = loadPersistedOrganizations().find((o: any) => o.id === orgId);
    if (local) {
      return res.json({ success: true, data: mapOrganizationToProfile(local), completeSchema: Object.prototype.hasOwnProperty.call(local, 'logo') });
    }

    return res.status(404).json({ success: false, error: 'No se encontró la organización del contexto.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error al leer el perfil de negocio.' });
  }
});

app.put('/api/business-profile', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const raw = req.body || {};
    const fullPayload = {
      name: String(raw.businessName ?? raw.name ?? '').trim(),
      slogan: String(raw.slogan ?? '').trim(),
      rif: String(raw.rif ?? '').trim(),
      email: String(raw.email ?? '').trim(),
      address: String(raw.address ?? '').trim(),
      phone: String(raw.phone ?? '').trim(),
      whatsapp: String(raw.whatsapp ?? '').trim(),
      logo: raw.logo ?? null,
      favicon: raw.favicon ?? null
    };

    if (!fullPayload.name) {
      return res.status(400).json({ success: false, error: 'El nombre del negocio es obligatorio.' });
    }

    const headers = { Prefer: 'return=representation' };
    let result = await authenticatedSupabaseRestRequest(res, `organizations?id=eq.${encodeURIComponent(orgId)}`, {
      method: 'PATCH',
      headers,
      body: fullPayload
    });
    let savedFields = ['businessName', 'slogan', 'rif', 'email', 'address', 'phone', 'whatsapp', 'logo', 'favicon'];
    let warnings: string[] = [];

    if (result.error) {
      // La migración 0026 no está aplicada: persistir únicamente las columnas base.
      const coreResult = await authenticatedSupabaseRestRequest(res, `organizations?id=eq.${encodeURIComponent(orgId)}`, {
        method: 'PATCH',
        headers,
        body: {
          name: fullPayload.name,
          rif: fullPayload.rif,
          phone: fullPayload.phone,
          address: fullPayload.address
        }
      });
      if (coreResult.error) {
        savePersistedOrganization({ id: orgId, ...fullPayload });
        return res.status(502).json({ success: false, error: coreResult.error || 'Error al guardar en la base de datos.' });
      }
      savedFields = ['businessName', 'rif', 'address', 'phone'];
      warnings = ['Migración 0026 pendiente: email, WhatsApp, eslogan, logo y favicon se guardaron solo en este equipo.'];
      const createdRow = Array.isArray(coreResult.data) && coreResult.data.length > 0
        ? coreResult.data[0]
        : { id: orgId, ...fullPayload };
      savePersistedOrganization({ ...createdRow, ...fullPayload });
      return res.json({ success: true, data: mapOrganizationToProfile(createdRow), savedFields, warnings });
    }

    const createdRow = Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : { id: orgId, ...fullPayload };
    savePersistedOrganization({ ...createdRow, ...fullPayload });
    return res.json({ success: true, data: mapOrganizationToProfile(createdRow), savedFields, warnings });
  } catch (err) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error al guardar el perfil de negocio.' });
  }
});

// ---------------------------------------------------------------------------
// PRINT SETTINGS (formato de ticket, cajon monedero, encabezado/pie)
// ---------------------------------------------------------------------------
const PRINT_SETTINGS_MIRROR_FILE = path.resolve(DATA_DIR, 'print_settings.json');

function loadPersistedPrintSettings(): any {
  try {
    if (fs.existsSync(PRINT_SETTINGS_MIRROR_FILE)) {
      const raw = fs.readFileSync(PRINT_SETTINGS_MIRROR_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return null;
}

function savePersistedPrintSettings(row: any) {
  try {
    if (!fs.existsSync(path.dirname(PRINT_SETTINGS_MIRROR_FILE))) {
      fs.mkdirSync(path.dirname(PRINT_SETTINGS_MIRROR_FILE), { recursive: true });
    }
    fs.writeFileSync(PRINT_SETTINGS_MIRROR_FILE, JSON.stringify(row, null, 2), 'utf-8');
  } catch (e) {
    console.warn('No se pudo persistir print_settings localmente:', e);
  }
}

app.get('/api/print-settings', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const result = await supabaseServiceRestRequest(`print_settings?organization_id=eq.${encodeURIComponent(orgId)}&limit=1`);
    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      const row = result.data[0];
      savePersistedPrintSettings(row);
      return res.json({ success: true, data: {
        defaultFormat: row.default_format || 'ticket80',
        cashDrawerTrigger: row.cash_drawer_trigger !== false,
        headerMessage: row.header_message || '',
        footerMessage: row.footer_message || ''
      }});
    }
    const local = loadPersistedPrintSettings();
    if (local) {
      return res.json({ success: true, data: {
        defaultFormat: local.default_format || local.defaultFormat || 'ticket80',
        cashDrawerTrigger: local.cash_drawer_trigger !== false && local.cashDrawerTrigger !== false,
        headerMessage: local.header_message || local.headerMessage || '',
        footerMessage: local.footer_message || local.footerMessage || ''
      }});
    }
    return res.json({ success: true, data: {
      defaultFormat: 'ticket80',
      cashDrawerTrigger: true,
      headerMessage: '',
      footerMessage: ''
    }});
  } catch (err) {
    const local = loadPersistedPrintSettings();
    if (local) {
      return res.json({ success: true, data: {
        defaultFormat: local.default_format || local.defaultFormat || 'ticket80',
        cashDrawerTrigger: local.cash_drawer_trigger !== false && local.cashDrawerTrigger !== false,
        headerMessage: local.header_message || local.headerMessage || '',
        footerMessage: local.footer_message || local.footerMessage || ''
      }});
    }
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error al leer configuración de impresión.' });
  }
});

app.put('/api/print-settings', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const raw = req.body || {};
    const payload = {
      organization_id: orgId,
      default_format: String(raw.defaultFormat ?? raw.default_format ?? 'ticket80'),
      cash_drawer_trigger: raw.cashDrawerTrigger !== false && raw.cash_drawer_trigger !== false,
      header_message: String(raw.headerMessage ?? raw.header_message ?? ''),
      footer_message: String(raw.footerMessage ?? raw.footer_message ?? ''),
      updated_at: new Date().toISOString()
    };

    let result = await supabaseServiceRestRequest(`print_settings?organization_id=eq.${encodeURIComponent(orgId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: payload
    });
    if (result.error || !result.data || (Array.isArray(result.data) && result.data.length === 0)) {
      result = await supabaseServiceRestRequest('print_settings', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: payload
      });
    }

    if (result.error) {
      savePersistedPrintSettings(payload);
      return res.status(502).json({ success: false, error: result.error });
    }

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    savePersistedPrintSettings(row || payload);
    return res.json({ success: true, data: {
      defaultFormat: (row?.default_format) || payload.default_format,
      cashDrawerTrigger: (row?.cash_drawer_trigger) !== false,
      headerMessage: row?.header_message || payload.header_message,
      footerMessage: row?.footer_message || payload.footer_message
    }});
  } catch (err) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error al guardar configuración de impresión.' });
  }
});

async function fetchReconciledAccountsPayable(orgId: string): Promise<any[]> {
  let dbItems: any[] = [];

  try {
    const [result, directPaymentsRes] = await Promise.all([
      supabaseRestRequest('accounts_payable?select=*,payable_payments(*),suppliers(id,name,doc_number,phone,email,contact_person)&order=created_at.desc'),
      supabaseRestRequest('payable_payments?select=*&order=payment_date.desc')
    ]);

    if (!result.error && Array.isArray(result.data)) {
      dbItems = result.data;
    } else {
      const simpleResult = await supabaseRestRequest('accounts_payable?select=*,payable_payments(*)&order=created_at.desc');
      if (!simpleResult.error && Array.isArray(simpleResult.data)) {
        dbItems = simpleResult.data;
      } else {
        const fallbackResult = await supabaseRestRequest('accounts_payable?select=*&order=created_at.desc');
        if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
          dbItems = fallbackResult.data;
        }
      }
    }

    const directPaymentsMap = new Map<string, any[]>();
    if (!directPaymentsRes.error && Array.isArray(directPaymentsRes.data)) {
      for (const p of directPaymentsRes.data) {
        if (p.payable_id) {
          const arr = directPaymentsMap.get(p.payable_id) || [];
          arr.push(p);
          directPaymentsMap.set(p.payable_id, arr);
        }
      }
    }

    for (const item of dbItems) {
      if ((!item.payable_payments || item.payable_payments.length === 0) && directPaymentsMap.has(item.id)) {
        item.payable_payments = directPaymentsMap.get(item.id);
      }
    }
  } catch (sbErr) {
    console.warn('Aviso consultando accounts_payable en Supabase:', sbErr);
  }

  const localItems = loadPersistedPayables(orgId);
  const map = new Map<string, any>();
  for (const p of localItems) {
    if (p.id) map.set(p.id, p);
  }
  for (const p of dbItems) {
    if (p.id) {
      const local = map.get(p.id) || {};
      const localPays = Array.isArray(local.payable_payments) ? local.payable_payments : [];
      const remotePays = Array.isArray(p.payable_payments) ? p.payable_payments : [];
      const payMap = new Map<string, any>();
      for (const pay of localPays) {
        const k = pay.id || `${pay.payment_date || pay.date}-${pay.amount_usd || pay.amount}`;
        payMap.set(k, pay);
      }
      for (const pay of remotePays) {
        const k = pay.id || `${pay.payment_date || pay.date}-${pay.amount_usd || pay.amount}`;
        payMap.set(k, pay);
      }
      const mergedBalance = (() => {
        const remoteBal = Number(p.balance_usd);
        const localBal = Number(local.balance_usd);
        const st = String(p.status || local.status || '').toUpperCase();
        if (remoteBal > 0) return remoteBal;
        if (localBal > 0 && st !== 'PAGADO' && st !== 'PAGADA') return localBal;
        return remoteBal;
      })();
      map.set(p.id, { ...local, ...p, balance_usd: mergedBalance, payable_payments: Array.from(payMap.values()) });
    }
  }

  for (const [id, item] of map.entries()) {
    const tot = Number(item.total_usd) || 0;
    const bal = Number(item.balance_usd != null ? item.balance_usd : tot);
    const paidDiff = Math.round(Math.max(0, tot - bal) * 100) / 100;
    const pays = Array.isArray(item.payable_payments) ? item.payable_payments : [];
    const currentSum = pays.reduce((s: number, p: any) => s + (Number(p.amount_usd || p.amount) || 0), 0);
    const st = String(item.status || '').toUpperCase();
    if (st !== 'PAGADO' && st !== 'PAGADA' && Number(item.balance_usd) === 0 && tot > 0) {
      item.balance_usd = Math.max(0, Math.round((tot - currentSum) * 100) / 100);
    }
    if (paidDiff > currentSum + 0.01) {
      const missing = Math.round((paidDiff - currentSum) * 100) / 100;
      pays.unshift({
        id: `abono-pay-${id}`,
        payable_id: id,
        amount_usd: missing,
        amount_ves: missing * (Number(item.exchange_rate) || 1),
        exchange_rate: Number(item.exchange_rate) || 1,
        payment_method: 'Abono registrado',
        reference: 'ABONO',
        payment_date: item.updated_at || item.created_at || new Date().toISOString()
      });
      item.payable_payments = pays;
    }
  }

  return Array.from(map.values());
}

app.get('/api/accounts-payable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const data = await fetchReconciledAccountsPayable(orgId);
    return res.json({ success: true, data });
  } catch {
    return res.status(200).json({ success: true, data: loadPersistedPayables() });
  }
});

// ---------------------------------------------------------------------------
// RESUMEN OPERATIVO AGREGADO: consolida en una sola petición paralela todas
// las métricas del Dashboard (antes requería 8 peticiones + 2 repetidas en serie).
// ---------------------------------------------------------------------------
app.get('/api/dashboard/summary', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const queryRate = Number(req.query.rate);
    const activeRate = Number.isFinite(queryRate) && queryRate > 0
      ? queryRate
      : (lastCertifiedRate?.appliedRate || 1);

    const [productsRes, salesRes, saleItemsRes, expensesRes, allReceivables, allPayables] = await Promise.all([
      (res.locals?.supabaseContext
        ? authenticatedSupabaseRestRequest(res, 'products?select=id,sku,name,stock,min_stock,cost_usd,price_usd&order=name.asc')
        : supabaseRestRequest('products?select=id,sku,name,stock,min_stock,cost_usd,price_usd&order=name.asc')
      ).catch(() => ({ error: 'err', data: null })),
      authenticatedSupabaseRestRequest(
        res,
        `sales?organization_id=eq.${encodeURIComponent(orgId)}&select=id,total_usd,status&order=created_at.desc&limit=200`
      ).catch(() => ({ error: 'err', data: null })),
      authenticatedSupabaseRestRequest(
        res,
        'sale_items?select=sale_id,sku,name,quantity&limit=2000'
      ).catch(() => ({ error: 'err', data: null })),
      authenticatedSupabaseRestRequest(
        res,
        `expenses?organization_id=eq.${encodeURIComponent(orgId)}&select=amount,currency,exchange_rate`
      ).catch(() => ({ error: 'err', data: null })),
      fetchReconciledAccountsReceivable(orgId).catch(() => loadPersistedReceivables(orgId)),
      fetchReconciledAccountsPayable(orgId).catch(() => loadPersistedPayables(orgId))
    ]);

    const rawProducts = (!productsRes.error && Array.isArray(productsRes.data) && productsRes.data.length > 0)
      ? productsRes.data
      : DEFAULT_CATALOG_PRODUCTS;
    const prodDedup = new Map<string, any>();
    for (const p of rawProducts) {
      if (p?.sku && !prodDedup.has(p.sku)) prodDedup.set(p.sku, p);
    }
    const productList = Array.from(prodDedup.values());

    const allSales = (!salesRes.error && Array.isArray(salesRes.data))
      ? salesRes.data
      : localSales.load(orgId);
    const sales = allSales.filter((s: any) => !s.status || s.status === 'COMPLETADA');
    const saleItems = (!saleItemsRes.error && Array.isArray(saleItemsRes.data)) ? saleItemsRes.data : [];
    const expenses = (!expensesRes.error && Array.isArray(expensesRes.data))
      ? expensesRes.data
      : localExpenses.load(orgId);

    const productCostMap = new Map<string, number>();
    const productMap = new Map<string, any>();
    for (const p of productList) {
      if (p.sku) productCostMap.set(p.sku, Number(p.cost_usd) || 0);
      if (p.id) productMap.set(p.id, p);
    }

    const costBySale = new Map<string, number>();
    const productSales = new Map<string, number>();
    for (const it of saleItems) {
      const qty = Number(it.quantity) || 0;
      if (it.sale_id) {
        const unitCost = (it.sku ? productCostMap.get(it.sku) : 0) || 0;
        const itemTotalCost = unitCost * (qty || 1);
        costBySale.set(it.sale_id, (costBySale.get(it.sale_id) || 0) + itemTotalCost);
      }
      if (qty > 0) {
        const prodName = it.name || (it.sku ? productMap.get(it.sku)?.name : null) || it.sku || 'Producto';
        productSales.set(prodName, (productSales.get(prodName) || 0) + qty);
      }
    }

    let totalSalesUsd = 0;
    let totalCostUsd = 0;
    for (const s of sales) {
      const amount = Number(s.total_usd) || 0;
      const saleCost = costBySale.get(s.id) || (amount * 0.45);
      totalSalesUsd += amount;
      totalCostUsd += saleCost;
    }

    let totalExpensesUsd = 0;
    for (const e of expenses) {
      const amt = Number(e.amount) || 0;
      const rate = Number(e.exchange_rate) || activeRate || 1;
      const expenseUsd = e.currency === 'VES' && rate > 0 ? amt / rate : amt;
      totalExpensesUsd += expenseUsd;
    }

    const utilidadNeta = Math.round(((totalSalesUsd - totalCostUsd) - totalExpensesUsd) * 100) / 100;

    const topProducts = Array.from(productSales.entries())
      .map(([name, totalQuantity]) => ({ name, totalQuantity }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    const lowStockProductsList = productList
      .filter((p) => Number(p.stock) <= Number(p.min_stock))
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .slice(0, 5);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const limit21Days = new Date(today.getTime() + 21 * 86400000);
    limit21Days.setHours(23, 59, 59, 999);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const isDueSoonOrThisMonth = (item: any): boolean => {
      const st = String(item.status || '').toUpperCase();
      if (st === 'PAGADO' || st === 'PAGADA') return false;
      const rawDate = item.due_date || item.dueDate;
      if (!rawDate) {
        const created = item.created_at ? new Date(item.created_at) : null;
        if (created && !isNaN(created.getTime())) {
          return created.getFullYear() === currentYear && created.getMonth() === currentMonth;
        }
        return true;
      }
      const dueDate = new Date(rawDate);
      if (isNaN(dueDate.getTime())) return true;
      const isUpcoming21Days = dueDate >= today && dueDate <= limit21Days;
      const isThisMonth = dueDate.getFullYear() === currentYear && dueDate.getMonth() === currentMonth;
      return isUpcoming21Days || isThisMonth;
    };

    const filteredReceivables = (allReceivables || []).filter(isDueSoonOrThisMonth);
    const receivableDue = filteredReceivables.reduce(
      (acc: number, c: any) => acc + Math.max(0, Number(c.balance_usd ?? c.remaining_amount ?? 0)),
      0
    );

    const filteredPayables = (allPayables || []).filter(isDueSoonOrThisMonth);
    const payableDue = filteredPayables.reduce(
      (acc: number, p: any) => acc + Math.max(0, Number(p.balance_usd ?? p.remaining_amount ?? 0)),
      0
    );

    return res.json({
      success: true,
      data: {
        salesUsd: totalSalesUsd,
        monthlyProfit: utilidadNeta,
        receivableDueUsd: Math.round(receivableDue * 100) / 100,
        receivableDueCount: filteredReceivables.length,
        receivables: filteredReceivables.slice(0, 10),
        payableDueUsd: Math.round(payableDue * 100) / 100,
        payableDueCount: filteredPayables.length,
        payables: filteredPayables.slice(0, 10),
        stockUnits: productList.reduce((acc, p) => acc + Number(p.stock || 0), 0),
        lowStockProductsCount: productList.filter((p) => Number(p.stock) <= Number(p.min_stock)).length,
        topProducts,
        lowStockProductsList
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error calculando resumen operativo.' });
  }
});

app.post('/api/accounts-payable', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const raw = req.body || {};
    const newId = (raw.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.id))
      ? raw.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pay-1000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0'));

    const totalUsd = Number(raw.total_usd ?? raw.totalUSD ?? 0) || 0;
    const initialPaymentUsd = Math.max(0, Number(raw.initial_usd || raw.initialPaymentUsd || 0));
    const calculatedBalance = Math.max(0, Math.round((totalUsd - initialPaymentUsd) * 100) / 100);
    const calculatedStatus = calculatedBalance <= 0 && totalUsd > 0
      ? 'PAGADO'
      : (initialPaymentUsd > 0 ? 'PARCIAL' : (raw.status || 'PENDIENTE'));

    let finalSupplierId = raw.supplier_id || raw.supplierId || null;
    const finalSupplierName = (raw.supplier_name || raw.supplierName || 'Proveedor').trim();
    const finalSupplierDoc = (raw.supplier_doc || raw.supplierDoc || '').trim().toUpperCase();

    // 1. Verificar primero si ya existe un proveedor con ese ID, RIF o Nombre
    const currentSuppliers = loadPersistedSuppliers(orgId);
    const existingSupplier = findExistingSupplier(currentSuppliers, {
      id: finalSupplierId,
      doc_number: finalSupplierDoc,
      name: finalSupplierName
    });

    if (existingSupplier) {
      finalSupplierId = existingSupplier.supplier.id;
    } else if (raw.create_new_supplier || raw.save_supplier || raw.save_supplier_data) {
      // Solo crear si realmente NO existe
      const generatedSupplierId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'b1c2d3e4-3333-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
      const supplierRecord = {
        id: generatedSupplierId,
        organization_id: orgId,
        code: getNextSupplierCode(currentSuppliers),
        name: finalSupplierName,
        doc_type: raw.supplier_doc_type || 'RIF (J / G / V)',
        doc_number: finalSupplierDoc,
        contact_person: (raw.supplier_contact || raw.contact_person || '').trim(),
        phone: (raw.supplier_phone || raw.phone || '').trim(),
        email: (raw.supplier_email || raw.email || '').trim(),
        address: (raw.supplier_address || raw.address || '').trim(),
        category: raw.supplier_category || 'Proveedor comercial',
        balance_usd: 0,
        status: 'Activo',
        created_at: new Date().toISOString()
      };

      const saved = savePersistedSupplier(supplierRecord);
      finalSupplierId = saved.id || generatedSupplierId;

      try {
        const supRes = await supabaseRestRequest('suppliers', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: supplierRecord
        });
        if (!supRes.error && supRes.data) {
          const createdSup = Array.isArray(supRes.data) ? supRes.data[0] : supRes.data;
          finalSupplierId = createdSup.id || finalSupplierId;
          savePersistedSupplier({ ...supplierRecord, ...createdSup });
        }
      } catch (supErr) {
        console.warn('Aviso guardando proveedor en Supabase:', supErr);
      }
    }

    const record = {
      ...raw,
      id: newId,
      organization_id: orgId,
      supplier_id: finalSupplierId,
      supplier_name: finalSupplierName,
      supplier_doc: finalSupplierDoc,
      doc_number: (raw.doc_number || raw.docNumber || '').trim(),
      concept: (raw.concept || 'Compra o compromiso comercial').trim(),
      description: raw.description?.trim() || null,
      origin: raw.origin || 'Compra Interna',
      total_usd: totalUsd,
      balance_usd: calculatedBalance,
      status: calculatedStatus,
      due_date: raw.due_date || raw.dueDate || null,
      created_at: raw.created_at || new Date().toISOString(),
      payable_payments: []
    };

    // Procesar abono inicial si fue indicado
    let initialPaymentRecord: any = null;
    if (initialPaymentUsd > 0) {
      const rate = Number(raw.exchange_rate) || 1;
      initialPaymentRecord = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pay-init-' + Date.now(),
        payable_id: newId,
        bank_account_id: raw.bank_account_id || raw.bankAccountId || null,
        amount_usd: initialPaymentUsd,
        amount_ves: Math.round(initialPaymentUsd * rate * 100) / 100,
        exchange_rate: rate,
        payment_method: raw.initial_payment_method || raw.payment_method || 'Abono inicial',
        reference: raw.initial_reference || raw.reference || 'ABONO-INICIAL',
        payment_date: new Date().toISOString()
      };
      (record.payable_payments as any[]).push(initialPaymentRecord);
    }

    savePersistedPayable(record);

    // Descontar el abono inicial del saldo del banco seleccionado y registrar
    // el egreso (misma mecánica que el abono de CxC en /api/accounts-receivable/:id/payments).
    if (initialPaymentRecord && initialPaymentRecord.bank_account_id) {
      try {
        const accListRes = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*');
        const accountsList: any[] = (!accListRes.error && Array.isArray(accListRes.data)) ? accListRes.data : [];
        const bAcc = accountsList.find((a: any) => a.id === initialPaymentRecord.bank_account_id);

        if (bAcc) {
          // En cuentas VES el descuento se expresa en bolívares a la tasa del abono.
          const debitAmt = bAcc.currency === 'VES'
            ? (Number(initialPaymentRecord.amount_ves) || initialPaymentUsd)
            : initialPaymentUsd;
          const newBal = Math.round(((Number(bAcc.balance) || 0) - debitAmt) * 100) / 100;

          await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bAcc.id)}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: { balance: newBal }
          });
          try {
            savePersistedBankAccount({ ...bAcc, balance: newBal });
          } catch {}

          const refMatch = initialPaymentRecord.reference || `ABONO-INIT-${Date.now().toString().slice(-6)}`;
          const mov = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-out-' + Date.now(),
            organization_id: bAcc.organization_id || orgId,
            bank_account_id: bAcc.id,
            type: 'SALIDA',
            concept: `Abono inicial a proveedor - ${finalSupplierName} (${record.doc_number || newId})`,
            reference: refMatch,
            user_name: 'Contabilidad / Tesorería',
            rate: Number(initialPaymentRecord.exchange_rate) || 1,
            commission: 0,
            commission_type: 'Fija',
            amount: debitAmt,
            created_at: initialPaymentRecord.payment_date
          };
          savePersistedBankMovement(mov);
          try {
            // La tabla bank_movements puede no existir aún en el esquema (404 tolerado).
            await authenticatedSupabaseRestRequest(res, 'bank_movements', {
              method: 'POST',
              headers: { 'Prefer': 'return=representation' },
              body: mov
            });
          } catch {}
        }
      } catch (bankErr) {
        console.warn('Aviso actualizando cuenta bancaria desde abono inicial de CxP:', bankErr);
      }
    }

    // Intentar Supabase adaptando columnas
    try {
      let payload: Record<string, any> = { ...record };
      delete payload.payable_payments;
      if (!payload.supplier_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.supplier_id)) {
        delete payload.supplier_id;
      }

      let attempts = 0;
      while (attempts < 6) {
        attempts++;
        const result = await supabaseRestRequest('accounts_payable', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: payload
        });
        if (!result.error && result.data) {
          const created = Array.isArray(result.data) ? result.data[0] : result.data;
          const merged = { ...record, ...created };

          // Registrar abono inicial en Supabase
          if (initialPaymentRecord) {
            try {
              await supabaseRestRequest('payable_payments', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: initialPaymentRecord
              });
            } catch (pErr) {
              console.warn('Aviso insertando abono inicial en payable_payments:', pErr);
            }
          }

          savePersistedPayable(merged);
          return res.json({ success: true, data: merged });
        }
        if (result.error) {
          const missingColMatch = result.error.match(/Could not find the '([^']+)' column of 'accounts_payable'/i);
          if (missingColMatch && missingColMatch[1] && missingColMatch[1] in payload) {
            delete payload[missingColMatch[1]];
            continue;
          }
          break;
        }
      }
    } catch (sbErr) {
      console.warn('Aviso insertando en Supabase accounts_payable:', sbErr);
    }

    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error guardando cuenta por pagar' });
  }
});

app.post('/api/accounts-payable/:id/payments', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const { amount_usd, amount_ves, exchange_rate, bank_account_id, payment_method, reference } = req.body || {};
    const amt = Number(amount_usd);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Monto de abono invÃ¡lido' });
    }

    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';

    // 1. Obtener cuenta por pagar actual
    let currentPay: any = null;
    const fetchRes = await supabaseRestRequest(`accounts_payable?id=eq.${encodeURIComponent(id)}&limit=1`);
    if (!fetchRes.error && Array.isArray(fetchRes.data) && fetchRes.data.length > 0) {
      currentPay = fetchRes.data[0];
    } else {
      const localList = loadPersistedPayables(orgId);
      currentPay = localList.find((p: any) => p.id === id);
    }

    if (!currentPay) {
      return res.status(404).json({ success: false, error: 'Cuenta por pagar no encontrada' });
    }

    const currentTotal = Number(currentPay.total_usd) || 0;
    const currentBalance = Number(currentPay.balance_usd != null ? currentPay.balance_usd : currentTotal);
    const newRemaining = Math.max(0, Math.round((currentBalance - amt) * 100) / 100);
    const newStatus = newRemaining <= 0 ? 'PAGADO' : 'PARCIAL';

    const paymentRecord = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pay-payment-' + Date.now(),
      payable_id: id,
      bank_account_id: bank_account_id || null,
      amount_usd: amt,
      amount_ves: Number(amount_ves) || (amt * (Number(exchange_rate) || 1)),
      exchange_rate: Number(exchange_rate) || 1,
      payment_method: payment_method || 'Abono en cuenta',
      reference: reference || 'PAGO',
      payment_date: new Date().toISOString()
    };

    // 2. Intentar registrar en Supabase
    try {
      await supabaseRestRequest('payable_payments', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: paymentRecord
      });
    } catch (e) {
      console.warn('Aviso insertando payable_payments en Supabase:', e);
    }

    try {
      await supabaseRestRequest(`accounts_payable?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          balance_usd: newRemaining,
          status: newStatus
        }
      });
    } catch (e) {
      console.warn('Aviso actualizando balance de accounts_payable en Supabase:', e);
    }

    // 2.b Si se especificÃ³ una cuenta bancaria, registrar egreso (SALIDA) de la cuenta
    if (bank_account_id) {
      try {
        const existingMovs = loadPersistedBankMovements(bank_account_id);
        const refMatch = reference || 'PAGO';
        const alreadyRecorded = existingMovs.some((m: any) => 
          m.reference === refMatch && 
          Math.abs(new Date(m.created_at).getTime() - Date.now()) < 30000
        );

        if (!alreadyRecorded) {
          const accListRes = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bank_account_id)}&limit=1`);
          if (!accListRes.error && Array.isArray(accListRes.data) && accListRes.data.length > 0) {
            const bAcc = accListRes.data[0];
            const withdrawAmt = bAcc.currency === 'VES' ? (Number(amount_ves) || (amt * (Number(exchange_rate) || 1))) : amt;
            const newBal = Math.round(((Number(bAcc.balance) || 0) - withdrawAmt) * 100) / 100;

            await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${encodeURIComponent(bank_account_id)}`, {
              method: 'PATCH',
              headers: { 'Prefer': 'return=representation' },
              body: { balance: newBal }
            });

            const mov = {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mov-' + Date.now(),
              organization_id: bAcc.organization_id || orgId,
              bank_account_id: bank_account_id,
              type: 'SALIDA',
              concept: `Pago a proveedor - ${currentPay.supplier_name || 'Proveedor'} (${currentPay.doc_number || id})`,
              reference: refMatch,
              user_name: 'Gerente / Pagos',
              rate: Number(exchange_rate) || 1,
              commission: 0,
              commission_type: 'Fija',
              amount: withdrawAmt,
              created_at: new Date().toISOString()
            };
            savePersistedBankMovement(mov);
            try {
              await authenticatedSupabaseRestRequest(res, 'bank_movements', {
                method: 'POST',
                headers: { 'Prefer': 'return=representation' },
                body: mov
              });
            } catch {}
          }
        }
      } catch (bankErr) {
        console.warn('Aviso actualizando cuenta bancaria desde abono CxP:', bankErr);
      }
    }

    // 3. Persistir en archivo local
    const existingPayments = Array.isArray(currentPay.payable_payments) ? currentPay.payable_payments : [];
    const updatedPay = {
      ...currentPay,
      balance_usd: newRemaining,
      status: newStatus,
      payable_payments: [paymentRecord, ...existingPayments]
    };
    savePersistedPayable(updatedPay);

    return res.json({
      success: true,
      data: updatedPay,
      payment: paymentRecord,
      remaining_amount: newRemaining
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error procesando pago a proveedor' });
  }
});

app.get('/api/purchases', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    let dbPurchases: any[] = [];

    try {
      const result = await supabaseRestRequest('purchases?select=*,suppliers(id,name,doc_number,phone),purchase_items(*)&order=created_at.desc');
      if (!result.error && Array.isArray(result.data)) {
        dbPurchases = result.data;
      } else {
        const simple = await supabaseRestRequest('purchases?select=*&order=created_at.desc');
        if (!simple.error && Array.isArray(simple.data)) {
          dbPurchases = simple.data;
        }
      }
    } catch (sbErr) {
      console.warn('Aviso consultando purchases en Supabase:', sbErr);
    }

    const localPurchases = loadPersistedPurchases(orgId);
    const map = new Map<string, any>();
    for (const p of localPurchases) {
      if (p.id) map.set(p.id, p);
    }
    for (const p of dbPurchases) {
      if (p.id) {
        const local = map.get(p.id) || {};
        map.set(p.id, { ...local, ...p });
      }
    }
    return res.json({ success: true, data: Array.from(map.values()) });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: loadPersistedPurchases() });
  }
});

app.post('/api/purchases', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.p_items) ? body.p_items : []);
    const subtotalUsd = items.reduce((sum: number, it: any) => sum + ((Number(it.quantity) || 0) * (Number(it.unitCostUSD || it.unit_cost_usd) || 0)), 0);
    const { vesAmount: totalVes, rate } = calculateTransactionVES(subtotalUsd, Number(body.exchangeRate || body.p_exchange_rate) || undefined);
    const totalUsd = Math.round(subtotalUsd * 100) / 100;

    const docNumber = body.docNumber || body.doc_number || `CMP-${Date.now().toString().slice(-5)}`;
    const invoiceNumber = (body.invoiceNumber || body.p_invoice_number || docNumber).trim();
    const supplierName = (body.supplierName || body.supplier_name || 'Proveedor').trim();
    const paymentType = (body.paymentType || body.p_payment_type || 'CONTADO').toUpperCase();
    const dueDate = body.dueDate || body.p_due_date || (paymentType === 'CREDITO' ? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) : null);
    const purchaseDate = body.purchaseDate || body.p_purchase_date || new Date().toISOString().slice(0, 10);
    const notes = (body.notes || body.p_notes || '').trim();

    const purchaseId = (body.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
      ? body.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pur-1000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0'));

    const purchaseRecord = {
      id: purchaseId,
      organization_id: orgId,
      supplier_id: body.supplierId || body.p_supplier_id || null,
      doc_number: docNumber,
      invoice_number: invoiceNumber,
      purchase_date: purchaseDate,
      warehouse: body.warehouse || body.p_warehouse || 'Tienda Bella Vista (SP-01)',
      payment_type: paymentType,
      exchange_rate: rate,
      subtotal_usd: totalUsd,
      total_usd: totalUsd,
      total_ves: totalVes,
      notes: notes || null,
      status: 'COMPLETADA',
      created_at: new Date().toISOString(),
      suppliers: {
        id: body.supplierId || body.p_supplier_id || '',
        name: supplierName,
        doc_number: body.supplierDoc || body.supplier_doc || '',
        phone: ''
      },
      purchase_items: items.map((it: any) => ({
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`,
        purchase_id: purchaseId,
        product_id: it.productId || it.product_id || null,
        sku: it.sku || 'SKU',
        name: it.name || 'Producto',
        quantity: Number(it.quantity) || 1,
        unit_cost_usd: Number(it.unitCostUSD || it.unit_cost_usd) || 0,
        total_usd: Math.round(((Number(it.quantity) || 1) * (Number(it.unitCostUSD || it.unit_cost_usd) || 0)) * 100) / 100
      }))
    };

    // 1. Guardar compra en persistencia local
    savePersistedPurchase(purchaseRecord);

    // 2. Si es compra a CRÃ‰DITO, generar y registrar automÃ¡ticamente el compromiso en cuentas por pagar
    if (paymentType === 'CREDITO') {
      const payableId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'pay-cr-' + Date.now();
      const payableRecord = {
        id: payableId,
        organization_id: orgId,
        supplier_id: body.supplierId || body.p_supplier_id || null,
        supplier_name: supplierName,
        supplier_doc: (body.supplierDoc || body.supplier_doc || '').trim().toUpperCase(),
        doc_number: invoiceNumber,
        concept: `Compra de inventario (${docNumber})`,
        origin: 'Compra Interna',
        total_usd: totalUsd,
        balance_usd: totalUsd,
        status: 'PENDIENTE',
        due_date: dueDate,
        description: notes || `Compra a crÃ©dito registrada bajo ${docNumber}`,
        created_at: new Date().toISOString()
      };
      savePersistedPayable(payableRecord);

      // Sincronizar en Supabase accounts_payable
      try {
        let pPayload: Record<string, any> = { ...payableRecord };
        delete pPayload.supplier_id; // Evitar colisiÃ³n si no existe la columna en Supabase
        await supabaseRestRequest('accounts_payable', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: pPayload
        });
      } catch (apErr) {
        console.warn('Aviso sincronizando compromiso de crÃ©dito en Supabase:', apErr);
      }
    }

    // 3. Intentar guardar en Supabase purchases
    try {
      const sbPurchasePayload: Record<string, any> = {
        id: purchaseId,
        organization_id: orgId,
        supplier_id: body.supplierId || body.p_supplier_id || null,
        doc_number: docNumber,
        invoice_number: invoiceNumber,
        purchase_date: purchaseDate,
        payment_type: paymentType,
        exchange_rate: rate,
        total_usd: totalUsd,
        total_ves: totalVes,
        notes: notes || null,
        status: 'COMPLETADA'
      };
      if (body.supplierId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.supplierId)) {
        sbPurchasePayload.supplier_id = body.supplierId;
      } else {
        delete sbPurchasePayload.supplier_id;
      }

      const pRes = await supabaseRestRequest('purchases', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: sbPurchasePayload
      });

      if (!pRes.error && pRes.data) {
        const createdP = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
        // Insertar purchase_items adaptando columnas
        const itemsPayload = items.map((it: any) => ({
          purchase_id: createdP.id || purchaseId,
          sku: it.sku || 'SKU',
          name: it.name || 'Producto',
          quantity: Number(it.quantity) || 1,
          unit_cost_usd: Number(it.unitCostUSD || it.unit_cost_usd) || 0,
          total_usd: Math.round(((Number(it.quantity) || 1) * (Number(it.unitCostUSD || it.unit_cost_usd) || 0)) * 100) / 100
        }));
        await supabaseRestRequest('purchase_items', {
          method: 'POST',
          body: itemsPayload
        });
      }
    } catch (sbErr) {
      console.warn('Aviso guardando compra en Supabase:', sbErr);
    }

    return res.json({
      success: true,
      message: 'Compra registrada con Ã©xito.',
      purchaseId,
      docNumber,
      data: purchaseRecord
    });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error procesando compra' });
  }
});

// ---------------------------------------------------------------------------
// 9. SUPABASE CONNECTION & MANAGEMENT ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/supabase/status', async (_req, res) => {
  const configured = isRealSupabaseUrl(SUPABASE_URL) && isRealSupabaseKey(SUPABASE_ANON_KEY);
  if (!configured) {
    return res.json({
      configured: false,
      connected: false,
      url: SUPABASE_URL,
      message: 'Supabase no estÃ¡ configurado con una URL o clave anÃ³nima vÃ¡lida.'
    });
  }

  try {
    const testRes = await supabaseRestRequest('organizations?select=id&limit=1');
    const isConnected = testRes.status < 500;
    const missingTables: string[] = [];

    if (testRes.status === 404 || (testRes.error && testRes.error.includes('relation "public.organizations" does not exist'))) {
      missingTables.push('organizations');
    }

    return res.json({
      configured: true,
      connected: isConnected,
      url: SUPABASE_URL,
      status: testRes.status,
      missingTables,
      error: testRes.status >= 400 ? testRes.error : null
    });
  } catch (err: any) {
    return res.json({
      configured: true,
      connected: false,
      url: SUPABASE_URL,
      error: err?.message || 'Error conectando a Supabase'
    });
  }
});

app.get('/api/supabase/migrations-bundle', (_req, res) => {
  try {
    const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return res.status(404).json({ success: false, error: 'Directorio de migraciones no encontrado.' });
    }
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    let bundledSql = `-- ==============================================================================\n-- FRENYER ERP â€” PAQUETE COMPLETO DE MIGRACIONES UNIFICADAS (0001 - 0015)\n-- ==============================================================================\n-- Ejecuta este script en el SQL Editor de tu consola de Supabase para inicializar\n-- todas las tablas, Ã­ndices, triggers y polÃ­ticas RLS necesarias para Frenyer.\n-- ==============================================================================\n\n`;

    for (const file of files) {
      bundledSql += `-- ------------------------------------------------------------------------------\n`;
      bundledSql += `-- ARCHIVO: ${file}\n`;
      bundledSql += `-- ------------------------------------------------------------------------------\n`;
      bundledSql += fs.readFileSync(path.join(migrationsDir, file), 'utf-8') + '\n\n';
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(bundledSql);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error generando el bundle de migraciones.' });
  }
});


// ---------------------------------------------------------------------------
// 9. AUTH PROXY - LA CREDENCIAL DE SUPABASE SOLO EXISTE EN EL SERVIDOR
// ---------------------------------------------------------------------------

function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' && forwardedProto.length > 0 ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${String(host).replace(/^https?:\/\//, '')}`;
}

interface CachedSession {
  role: string;
  organizationId: string;
  email: string;
  userId: string;
  name?: string;
  permissions?: string[];
  expiresAt: number;
}

const sessionCache = new Map<string, CachedSession>();

// Singleflight: cuando varias peticiones paralelas traen el mismo token
// (el dashboard dispara varias peticiones a la vez), todas comparten UNA sola
// resolución en vuelo en lugar de consultar Supabase cada una por su cuenta.
type ResolvedRemoteSession = {
  user: any;
  role: string;
  organizationId: string;
  name?: string;
  permissions?: string[];
  active?: boolean;
};
const sessionInflight = new Map<string, Promise<ResolvedRemoteSession | null>>();
const sessionSyncInflight = new Map<string, Promise<{ revoked: boolean }>>();

// ---------------------------------------------------------------------------
// SEGUIMIENTO DE SESIONES (requiere migracion 0029_app_sessions_tracking.sql)
// Tabla app_sessions: fila por token activo (hash SHA-256, nunca el token),
// con ultima actividad y revoca. Todo el acceso se hace via PostgREST con el
// token del propio usuario; si la tabla no existe (migracion pendiente), el
// sistema degrada con un aviso y las sesiones siguen funcionando como antes.
// ---------------------------------------------------------------------------
const APP_SESSIONS_SYNC_MIN_MS = 10_000; // cadencia de escritura/verificacion
const IDLE_LIMIT_INTERNAL_MS = 30 * 60_000; // rol interno: 30 min de inactividad
const IDLE_LIMIT_CLIENTE_MS = 2 * 60 * 60_000; // comprador web: 2 horas

interface SessionActivityEntry {
  lastSeen: number;
  role: string;
  userId: string;
}

/** Actividad por token (en esta instancia de proceso). */
const sessionActivity = new Map<string, SessionActivityEntry>();
const lastSessionsSyncAt = new Map<string, number>();
/** null = aun no verificado; false = tabla no disponible; true = operativa. */
let appSessionsTableReady: boolean | null = null;
let appSessionsTableReadyAt = 0;
let warnedAppSessionsUnavailable = false;
/**
 * Si la migración 0029 se aplica DESPUÉS de arrancar el servidor, el estado
 * "no disponible" se revisa cada 5 min para recuperarse sin reiniciar.
 */
const APP_SESSIONS_REPROBE_MS = 5 * 60_000;

function isClienteRole(role: string): boolean {
  return !role || role === 'cliente';
}

function idleLimitForRole(role: string): number {
  return isClienteRole(role) ? IDLE_LIMIT_CLIENTE_MS : IDLE_LIMIT_INTERNAL_MS;
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Etiqueta de dispositivo para el seguimiento de sesiones (User-Agent). */
function deviceLabelOf(req: Request): string {
  const raw = String((req.headers['user-agent'] as string | undefined) || '').trim();
  return (raw.slice(0, 120) || 'Dispositivo desconocido');
}

/** Lee la fila de seguimiento del token. 'unknown' = tabla no disponible. */
async function fetchTrackedAppSession(
  tokenHash: string,
  accessToken: string
): Promise<{ lastSeen: number; revokedAt: number } | null | 'unknown'> {
  // Autorecuperación: si la tabla se aplica a mitad de sesión, se reintenta.
  if (appSessionsTableReady === false && Date.now() - appSessionsTableReadyAt > APP_SESSIONS_REPROBE_MS) {
    appSessionsTableReady = null;
    warnedAppSessionsUnavailable = false;
  }
  const result = await supabaseRestRequest(
    `app_sessions?select=last_seen,revoked_at&token_hash=eq.${tokenHash}&limit=1`,
    {},
    accessToken
  );
  if (result.status === 404) {
    appSessionsTableReady = false;
    appSessionsTableReadyAt = Date.now();
    return 'unknown';
  }
  if (result.error || !Array.isArray(result.data)) {
    return 'unknown';
  }
  appSessionsTableReady = true;
  const row = result.data[0] as { last_seen?: string; revoked_at?: string } | undefined;
  if (!row) return null;
  return {
    lastSeen: Date.parse(row.last_seen || '') || Date.now(),
    revokedAt: row.revoked_at ? Date.parse(row.revoked_at) : 0
  };
}

/** Crea o actualiza la fila de seguimiento y detecta la revocacion remota (deduplicada en vuelo). */
async function syncTrackedAppSession(
  accessToken: string,
  tokenHash: string,
  userId: string,
  role: string,
  deviceLabel: string,
  options: { forceCheck?: boolean; updateActivity?: boolean } = {}
): Promise<{ revoked: boolean }> {
  if (appSessionsTableReady === false) return { revoked: false };

  const inflightKey = `${tokenHash}:${options.forceCheck ? '1' : '0'}:${options.updateActivity === false ? '0' : '1'}`;
  const existing = sessionSyncInflight.get(inflightKey);
  if (existing) return existing;

  const task = (async (): Promise<{ revoked: boolean }> => {
    try {
      const nowMs = Date.now();
      const tracked = await fetchTrackedAppSession(tokenHash, accessToken);
      if (tracked === 'unknown') return { revoked: false };
      if (tracked?.revokedAt > 0) return { revoked: true };

      if (options.updateActivity === false) {
        return { revoked: false };
      }

      if (!options.forceCheck && nowMs - (lastSessionsSyncAt.get(tokenHash) || 0) < APP_SESSIONS_SYNC_MIN_MS) {
        return { revoked: false };
      }
      lastSessionsSyncAt.set(tokenHash, nowMs);

      let write = { status: 200, data: null as any, error: undefined as string | undefined };
      if (tracked) {
        write = await supabaseRestRequest(
          `app_sessions?token_hash=eq.${tokenHash}`,
          { method: 'PATCH', body: { last_seen: new Date(nowMs).toISOString() } },
          accessToken
        );
      } else {
        write = await supabaseRestRequest(
          'app_sessions?on_conflict=token_hash',
          {
            method: 'POST',
            body: {
              user_id: userId,
              token_hash: tokenHash,
              device_label: deviceLabel,
              last_seen: new Date(nowMs).toISOString()
            },
            headers: { Prefer: 'resolution=merge-duplicates' }
          },
          accessToken
        );
      }
      if (write.error || write.status === 404) {
        appSessionsTableReady = false;
        appSessionsTableReadyAt = Date.now();
      }
    } catch (err) {
      if (!warnedAppSessionsUnavailable) {
        warnedAppSessionsUnavailable = true;
        console.warn('Aviso: el seguimiento de sesiones no esta disponible (migracion 0029 pendiente):', err);
      }
    }
    return { revoked: false };
  })().finally(() => {
    sessionSyncInflight.delete(inflightKey);
  });

  sessionSyncInflight.set(inflightKey, task);
  return task;
}

/** Marca un token como revocado en la tabla de seguimiento (best effort). */
async function revokeTrackedAppSession(tokenHash: string, accessToken: string): Promise<void> {
  if (appSessionsTableReady === false) return;
  try {
    await supabaseRestRequest(
      `app_sessions?token_hash=eq.${tokenHash}`,
      { method: 'PATCH', body: { revoked_at: new Date().toISOString() } },
      accessToken
    );
  } catch {
    // Best effort: la memoria local ya quedo purgada.
  }
}

/** Purga la memoria local de todas las sesiones de un usuario. */
function purgeSessionMemoryByUser(userId: string): void {
  for (const [tokenHash, entry] of sessionActivity.entries()) {
    if (entry.userId === userId) {
      sessionActivity.delete(tokenHash);
      lastSessionsSyncAt.delete(tokenHash);
    }
  }
  for (const [token, entry] of sessionCache.entries()) {
    if (entry.userId === userId) {
      sessionCache.delete(token);
      sessionInflight.delete(token);
      lastSessionsSyncAt.delete(hashSessionToken(token));
    }
  }
  purgeOpaqueSessionsByUser(userId);
}

/**
 * Politica de sesion unica por usuario: al iniciar sesion con credencial valida,
 * cierra automaticamente cualquier sesion previa en este navegador (si era otra
 * cuenta) y revoca todas las demas sesiones abiertas del mismo usuario en otros
 * dispositivos o computadores.
 */
async function enforceSingleSessionOnLogin(
  req: Request,
  accessToken: string,
  userId: string,
  role: string,
  organizationId: string,
  email: string
): Promise<void> {
  const prevToken = readSessionToken(req);
  if (prevToken && prevToken !== accessToken) {
    purgeSessionMemoryByToken(prevToken);
    if (!verifyLocalSessionToken(prevToken) && isSupabaseConfigured) {
      await revokeTrackedAppSession(hashSessionToken(prevToken), prevToken);
      try {
        await supabaseAuthRequest('logout', {}, 'POST', prevToken);
      } catch {
        // Best effort al reemplazar una sesion previa en el mismo navegador.
      }
    }
  }

  if (userId) {
    purgeSessionMemoryByUser(userId);
  }

  // 1) Revocar todas las DEMAS sesiones del usuario en Supabase Auth.
  if (isSupabaseConfigured) {
    try {
      await supabaseAuthRequest('logout?scope=others', {}, 'POST', accessToken);
    } catch {
      // Best effort: la tabla app_sessions y memoria local tambien invalidan.
    }
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const newTokenHash = hashSessionToken(accessToken);

  // 2) Revocar en app_sessions todas las filas previas activas del usuario
  // y registrar la sesion recien abierta (requiere migracion 0029 + 0030).
  if (userId && appSessionsTableReady !== false) {
    try {
      await supabaseRestRequest(
        `app_sessions?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&token_hash=neq.${newTokenHash}`,
        { method: 'PATCH', body: { revoked_at: nowIso } },
        accessToken
      );
      const write = await supabaseRestRequest(
        'app_sessions?on_conflict=token_hash',
        {
          method: 'POST',
          body: {
            user_id: userId,
            token_hash: newTokenHash,
            device_label: deviceLabelOf(req),
            last_seen: nowIso,
            revoked_at: null
          },
          headers: { Prefer: 'resolution=merge-duplicates' }
        },
        accessToken
      );
      if (write.status === 404) {
        appSessionsTableReady = false;
        appSessionsTableReadyAt = nowMs;
      } else if (!write.error) {
        appSessionsTableReady = true;
      }
    } catch {
      // Degrada sin bloquear el inicio de sesion.
    }
  }

  const tokenExpiry = readTokenExpiry(accessToken);
  if (userId) {
    sessionActivity.set(newTokenHash, { lastSeen: nowMs, role, userId });
    lastSessionsSyncAt.set(newTokenHash, nowMs);
    sessionCache.set(accessToken, {
      role,
      organizationId,
      email,
      userId,
      name: '',
      permissions: resolveEffectivePermissions(role, []),
      expiresAt: Math.min(tokenExpiry || nowMs + 5 * 60_000, nowMs + 5 * 60_000)
    });
  }
}

function resolveRemoteSession(token: string): Promise<ResolvedRemoteSession | null> {
  let inflight = sessionInflight.get(token);
  if (!inflight) {
    inflight = resolveSessionUser(token).finally(() => {
      sessionInflight.delete(token);
    });
    sessionInflight.set(token, inflight);
  }
  return inflight;
}

function readTokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Valida la credencial de la peticion. Acepta un token local o un token de
 * Supabase (renovandolo con la cookie de refresco si caduco).
 */
async function resolveRequestSession(
  req: Request,
  res: AuthenticatedResponse,
  options: { forceSessionCheck?: boolean; updateActivity?: boolean } = {}
): Promise<{ token: string; local: LocalSessionPayload | null; remote: ResolvedRemoteSession | null } | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  const localSession = verifyLocalSessionToken(token);
  if (localSession) {
    return { token, local: localSession, remote: null };
  }

  if (!isSupabaseConfigured) return null;

  const tokenHash = hashSessionToken(token);
  const updateActivity = options.updateActivity !== false;

  // Expiracion por inactividad supervisada en ESTA instancia (instantanea).
  const activity = sessionActivity.get(tokenHash);
  if (activity) {
    const idleMs = Date.now() - activity.lastSeen;
    if (idleMs > idleLimitForRole(activity.role)) {
      sessionActivity.delete(tokenHash);
      sessionCache.delete(token);
      sessionInflight.delete(token);
      lastSessionsSyncAt.delete(tokenHash);
      void revokeTrackedAppSession(tokenHash, token);
      logAuthEvent('SESION_INACTIVA', getClientIp(req), `usuario=${activity.userId} inactividadMin=${Math.round(idleMs / 60_000)}`);
      return null;
    }
    if (updateActivity) {
      activity.lastSeen = Date.now();
    }
  }

  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    const shouldCheckRemote =
      options.forceSessionCheck === true ||
      (appSessionsTableReady !== false && Date.now() - (lastSessionsSyncAt.get(tokenHash) || 0) >= APP_SESSIONS_SYNC_MIN_MS);

    if (shouldCheckRemote) {
      if (appSessionsTableReady !== false) {
        const tracked = await syncTrackedAppSession(
          token,
          tokenHash,
          cached.userId,
          cached.role,
          deviceLabelOf(req),
          { forceCheck: options.forceSessionCheck, updateActivity }
        );
        if (tracked.revoked) {
          purgeSessionMemoryByToken(token);
          logAuthEvent('SESION_REVOCADA', getClientIp(req), `usuario=${cached.userId}`);
          return null;
        }
      }
      if (options.forceSessionCheck && appSessionsTableReady === false) {
        const liveUser = await resolveRemoteSession(token);
        if (!liveUser) {
          purgeSessionMemoryByToken(token);
          logAuthEvent('SESION_REVOCADA', getClientIp(req), `usuario=${cached.userId}`);
          return null;
        }
      }
    }
    return {
      token,
      local: null,
      remote: {
        user: { email: cached.email, id: cached.userId, name: cached.name || '' },
        role: cached.role,
        organizationId: cached.organizationId,
        name: cached.name || '',
        permissions: cached.permissions
      }
    };
  }

  const resolved = await resolveRemoteSession(token);
  if (resolved) {
    const tokenExpiry = readTokenExpiry(token);
    sessionCache.set(token, {
      role: resolved.role,
      organizationId: resolved.organizationId,
      email: resolved.user.email || '',
      userId: resolved.user.id || '',
      name: resolved.name || '',
      permissions: resolved.permissions,
      expiresAt: Math.min(tokenExpiry || Date.now() + 5 * 60_000, Date.now() + 5 * 60_000)
    });

    const tracked = await syncTrackedAppSession(
      token,
      tokenHash,
      resolved.user.id || '',
      resolved.role,
      deviceLabelOf(req),
      { forceCheck: options.forceSessionCheck, updateActivity }
    );
    if (tracked.revoked) {
      purgeSessionMemoryByToken(token);
      logAuthEvent('SESION_REVOCADA', getClientIp(req), `usuario=${resolved.user.id || ''}`);
      return null;
    }
    if (!sessionActivity.has(tokenHash) || updateActivity) {
      sessionActivity.set(tokenHash, { lastSeen: Date.now(), role: resolved.role, userId: resolved.user.id || '' });
    }
    return { token, local: null, remote: resolved };
  }

  // Token caducado: se intenta renovar con la cookie de refresco o sesion opaca.
  const sid = readOpaqueSessionHeader(req);
  const opaqueEntry = sid ? opaqueSessions.get(sid) : undefined;
  const refreshToken = readCookie(req, REFRESH_COOKIE) || opaqueEntry?.refreshToken || '';
  if (refreshToken) {
    const refreshed = await supabaseAuthRequest('token?grant_type=refresh_token', { refresh_token: refreshToken });
    if (refreshed.data?.access_token) {
      const newToken: string = refreshed.data.access_token;
      setSessionCookie(res, SESSION_COOKIE, newToken, req);
      if (refreshed.data.refresh_token) {
        setSessionCookie(res, REFRESH_COOKIE, refreshed.data.refresh_token, req);
      }
      if (opaqueEntry) {
        opaqueEntry.token = newToken;
        if (refreshed.data.refresh_token) {
          opaqueEntry.refreshToken = refreshed.data.refresh_token;
        }
        opaqueEntry.expiresAt = Date.now() + SESSION_MAX_AGE_MS;
      }
      const resolvedAfter = await resolveRemoteSession(newToken);
      if (resolvedAfter) {
        const newTokenHash = hashSessionToken(newToken);
        await syncTrackedAppSession(
          newToken,
          newTokenHash,
          resolvedAfter.user.id || '',
          resolvedAfter.role,
          deviceLabelOf(req),
          { forceCheck: options.forceSessionCheck, updateActivity }
        );
        sessionActivity.set(newTokenHash, { lastSeen: Date.now(), role: resolvedAfter.role, userId: resolvedAfter.user.id || '' });
        return { token: newToken, local: null, remote: resolvedAfter };
      }
    }
  }

  if (sid) opaqueSessions.delete(sid);
  return null;
}

function applySessionContext(
  res: AuthenticatedResponse,
  session: { token: string; local: LocalSessionPayload | null; remote: { user: any; role: string; organizationId: string } | null }
): void {
  if (session.local) {
    res.locals.supabaseContext = {
      accessToken: SUPABASE_ANON_KEY,
      organizationId: session.local.organizationId,
      role: session.local.role,
      userEmail: session.local.email,
      userId: session.local.sub,
      isLocalSession: true
    };
    return;
  }
  res.locals.supabaseContext = {
    accessToken: session.token,
    organizationId: session.remote!.organizationId,
    role: session.remote!.role,
    userEmail: session.remote!.user?.email || '',
    userId: session.remote!.user?.id || '',
    isLocalSession: false
  };
}

const AUTH_MODE_CACHE_TTL_MS = 30_000;
let authModeCache: { data: any; cachedAt: number } | null = null;

/** Estado del sistema de autenticacion. Nunca devuelve claves. */
app.get('/api/auth/mode', async (_req, res) => {
  if (authModeCache && (Date.now() - authModeCache.cachedAt < AUTH_MODE_CACHE_TTL_MS)) {
    return res.json({ success: true, data: authModeCache.data });
  }

  let connected = false;
  let missingTables: string[] = [];
  if (isSupabaseConfigured) {
    const test = await supabaseRestRequest('organizations?select=id&limit=1');
    connected = !test.error;
    if (test.error) missingTables.push('organizations');
  }

  const payload = {
    supabaseConfigured: isSupabaseConfigured,
    supabaseConnected: connected,
    missingTables,
    supabaseUrl: isSupabaseConfigured ? SUPABASE_URL : '',
    localAccessEnabled: Boolean(ACCESS_KEY),
    credentialsSource: SUPABASE_CREDENTIALS_SOURCE
  };

  if (connected) {
    authModeCache = { data: payload, cachedAt: Date.now() };
  }

  res.json({
    success: true,
    data: payload
  });
});

/** Inicio de sesion con correo y contrasena, resuelto por el servidor. */
app.post('/api/auth/login', async (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit(`login:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    logAuthEvent('LOGIN_LIMITADO', ip, `motivo=ip espera=${limit.retryAfterSeconds}s`);
    return res.status(429).json({
      success: false,
      error: `Demasiados intentos fallidos. Espera ${limit.retryAfterSeconds} segundos antes de reintentar.`
    });
  }

  const { email, password } = req.body || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseÃ±a son obligatorios.' });
  }

  if (!isSupabaseConfigured) {
    return res.status(503).json({ success: false, error: 'Supabase no estÃ¡ configurado en el servidor.' });
  }

  // Segundo contador por CORREO: rotar IP o cabeceras no evade el limite.
  const emailLimit = checkRateLimit(`login-email:${cleanEmail}`, 5, 15 * 60_000);
  if (!emailLimit.allowed) {
    logAuthEvent('LOGIN_LIMITADO', ip, `email=${cleanEmail} motivo=correo espera=${emailLimit.retryAfterSeconds}s`);
    return res.status(429).json({
      success: false,
      error: `Demasiados intentos fallidos para este correo. Espera ${emailLimit.retryAfterSeconds} segundos antes de reintentar.`
    });
  }

  const result = await supabaseAuthRequest('token?grant_type=password', {
    email: cleanEmail,
    password: String(password)
  });

  if (result.error || !result.data?.access_token) {
    logAuthEvent('LOGIN_FALLIDO', ip, `email=${cleanEmail} motivo=${result.error || 'sin token'}`);
    return res.status(401).json({ success: false, error: 'Correo o contraseÃ±a incorrectos.' });
  }

  // Credencial valida: el contador por correo y por IP se reinician.
  resetRateLimit(`login-email:${cleanEmail}`);
  resetRateLimit(`login:${ip}`);

  const resolved = await resolveSessionUser(result.data.access_token);
  const resolvedRole = resolved?.role || 'admin';
  const resolvedOrgId = resolved?.organizationId || '00000000-0000-0000-0000-000000000001';
  const resolvedUserId = resolved?.user?.id || '';

  // Cierra cualquier sesion abierta en otro dispositivo/navegador y abre solo esta.
  await enforceSingleSessionOnLogin(
    req,
    result.data.access_token,
    resolvedUserId,
    resolvedRole,
    resolvedOrgId,
    cleanEmail
  );

  setSessionCookie(res, SESSION_COOKIE, result.data.access_token, req);
  if (result.data.refresh_token) {
    setSessionCookie(res, REFRESH_COOKIE, result.data.refresh_token, req);
  }
  const sessionId = issueOpaqueSession(
    result.data.access_token,
    resolvedUserId,
    result.data.refresh_token,
    false
  );

  logAuthEvent('LOGIN_OK', ip, `email=${cleanEmail} rol=${resolvedRole}`);

  // Enriquecer sessionCache con el nombre y permisos resueltos para evitar pedir /api/users al arrancar.
  if (resolved && sessionCache.has(result.data.access_token)) {
    const entry = sessionCache.get(result.data.access_token)!;
    entry.name = resolved.name || '';
    entry.permissions = resolved.permissions || resolveEffectivePermissions(resolvedRole, []);
  }

  res.json({
    success: true,
    data: {
      user: { email: cleanEmail, id: resolvedUserId, name: resolved?.name || '' },
      role: resolvedRole,
      organizationId: resolvedOrgId,
      permissions: resolved?.permissions || resolveEffectivePermissions(resolvedRole, []),
      sessionId
    }
  });
});

/** Registro de cuenta, resuelto por el servidor. */
app.post('/api/auth/register', async (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit(`register:${ip}`, 5, 60 * 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      error: `Demasiados registros desde esta conexiÃ³n. Espera ${limit.retryAfterSeconds} segundos.`
    });
  }

  const { email, password, fullName, companyName, phone, address, role: requestedRole } = req.body || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseña son obligatorios.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!isSupabaseConfigured) {
    return res.status(503).json({ success: false, error: 'Supabase no está configurado en el servidor.' });
  }

  const internalAdminEmails = ['sharkvenimport@gmail.com', 'fotocopiasfyp@gmail.com'];
  const isInternalAdminEmail = internalAdminEmails.includes(cleanEmail);
  const targetRole = isInternalAdminEmail || requestedRole === 'gerente' || requestedRole === 'administrador' || requestedRole === 'admin'
    ? 'gerente'
    : 'cliente';

  const result = await supabaseAuthRequest('signup', {
    email: cleanEmail,
    password: String(password),
    data: {
      full_name: typeof fullName === 'string' ? fullName.trim() : '',
      company_name: typeof companyName === 'string' ? companyName.trim() : '',
      role: targetRole
    }
  });

  if (result.error) {
    logAuthEvent('REGISTRO_FALLIDO', ip, `email=${cleanEmail} motivo=${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }

  // Si Supabase no devolvió access_token directo en signup, intentamos autenticar de inmediato
  let token = result.data?.access_token;
  let refreshToken = result.data?.refresh_token;

  if (!token) {
    const loginAttempt = await supabaseAuthRequest('token?grant_type=password', {
      email: cleanEmail,
      password: String(password)
    });
    if (loginAttempt.data?.access_token) {
      token = loginAttempt.data.access_token;
      refreshToken = loginAttempt.data.refresh_token;
    }
  }

  let sessionId: string | undefined;
  if (token) {
    await enforceSingleSessionOnLogin(
      req,
      token,
      result.data?.user?.id || '',
      targetRole,
      '00000000-0000-0000-0000-000000000001',
      cleanEmail
    );
    setSessionCookie(res, SESSION_COOKIE, token, req);
    if (refreshToken) {
      setSessionCookie(res, REFRESH_COOKIE, refreshToken, req);
    }
    sessionId = issueOpaqueSession(token, result.data?.user?.id || '', refreshToken, false);
  }

  // Asegurar persistencia local y rol si es administrativo
  if (targetRole !== 'cliente') {
    const adminUser = {
      id: result.data?.user?.id || `usr-${cleanEmail.split('@')[0]}`,
      name: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : cleanEmail.split('@')[0],
      email: cleanEmail,
      role: targetRole,
      title: targetRole === 'gerente' ? 'Director / Gerente' : 'Personal Asociado',
      active: true,
      initials: (fullName || cleanEmail).slice(0, 2).toUpperCase(),
      permissions: ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios', 'alma'],
      created_at: new Date().toISOString()
    };
    savePersistedUser(adminUser);
  }

  logAuthEvent('REGISTRO_OK', ip, `email=${cleanEmail} rol=${targetRole}`);
  res.json({
    success: true,
    requiresEmailConfirmation: !token,
    data: {
      user: { email: cleanEmail, id: result.data?.user?.id || '' },
      role: targetRole,
      organizationId: '00000000-0000-0000-0000-000000000001',
      ...(sessionId ? { sessionId } : {})
    }
  });
});

/** Sesion actual. */
app.get('/api/auth/session', async (req, res) => {
  const isHeartbeat = req.query.heartbeat === '1' || req.header('x-session-check') === 'heartbeat';
  const session = await resolveRequestSession(req, res as AuthenticatedResponse, {
    forceSessionCheck: true,
    updateActivity: !isHeartbeat
  });
  if (!session) {
    clearSessionCookie(res, SESSION_COOKIE, req);
    clearSessionCookie(res, REFRESH_COOKIE, req);
    const sid = readOpaqueSessionHeader(req);
    if (sid) opaqueSessions.delete(sid);
    return res.status(401).json({ success: false, error: 'Sin sesiÃ³n activa.' });
  }

  const refreshCookie = readCookie(req, REFRESH_COOKIE);
  const existingSid = readOpaqueSessionHeader(req);
  const sessionId =
    existingSid && opaqueSessions.has(existingSid)
      ? existingSid
      : !isHeartbeat
        ? findOrIssueOpaqueSession(
            session.token,
            session.local ? session.local.sub : (session.remote!.user?.id || ''),
            refreshCookie || undefined,
            Boolean(session.local)
          )
        : undefined;

  if (session.local) {
    return res.json({
      success: true,
      data: {
        mode: 'local',
        user: { email: session.local.email, id: session.local.sub },
        role: session.local.role,
        organizationId: session.local.organizationId,
        permissions: defaultPermissionsForRole(session.local.role),
        ...(sessionId ? { sessionId } : {})
      }
    });
  }

  return res.json({
    success: true,
    data: {
      mode: 'supabase',
      user: {
        email: session.remote!.user?.email || '',
        id: session.remote!.user?.id || '',
        name:
          session.remote!.name ||
          session.remote!.user?.name ||
          session.remote!.user?.user_metadata?.full_name ||
          session.remote!.user?.user_metadata?.name ||
          ''
      },
      role: session.remote!.role,
      organizationId: session.remote!.organizationId,
      permissions: session.remote!.permissions || defaultPermissionsForRole(session.remote!.role),
      ...(sessionId ? { sessionId } : {})
    }
  });
});

/** Invalida todo rastro en memoria de un token de sesion. */
function purgeSessionMemoryByToken(token: string): void {
  const tokenHash = hashSessionToken(token);
  sessionCache.delete(token);
  sessionInflight.delete(token);
  sessionActivity.delete(tokenHash);
  lastSessionsSyncAt.delete(tokenHash);
  purgeOpaqueSessionsByToken(token);
}

/** Cierre de sesion. */
app.post('/api/auth/logout', async (req, res) => {
  const ip = getClientIp(req);
  const token = readSessionToken(req);

  if (token) {
    const localPayload = verifyLocalSessionToken(token);
    if (localPayload?.jti && activeLocalSessionBySub.get(localPayload.sub) === localPayload.jti) {
      activeLocalSessionBySub.delete(localPayload.sub);
    } else if (!localPayload && isSupabaseConfigured) {
      await revokeTrackedAppSession(hashSessionToken(token), token);
      // Revocar la sesion ACTIVA en Supabase: el JWT y su refresh quedan anulos.
      try {
        await supabaseAuthRequest('logout', {}, 'POST', token);
      } catch (err) {
        logAuthEvent('LOGOUT_AVISO', ip, `revocacion supabase=${err instanceof Error ? err.message : 'error'}`);
      }
    }
    purgeSessionMemoryByToken(token);
  }

  const sid = readOpaqueSessionHeader(req);
  if (sid) opaqueSessions.delete(sid);
  clearSessionCookie(res, SESSION_COOKIE, req);
  clearSessionCookie(res, REFRESH_COOKIE, req);
  logAuthEvent('LOGOUT', ip, 'sesion cerrada y token revocado');
  res.json({ success: true });
});

/** Cierra TODAS las sesiones activas del usuario en todos sus dispositivos. */
app.post('/api/auth/logout-all', async (req, res) => {
  const ip = getClientIp(req);
  const session = await resolveRequestSession(req, res as AuthenticatedResponse);
  if (!session) {
    return res.status(401).json({ success: false, error: 'SesiÃ³n requerida. Inicia sesiÃ³n para acceder a esta informaciÃ³n.' });
  }

  if (session.local) {
    activeLocalSessionBySub.delete(session.local.sub);
    // El modo local no registra sesiones en servidor: solo limpia este equipo.
    clearSessionCookie(res, SESSION_COOKIE, req);
    clearSessionCookie(res, REFRESH_COOKIE, req);
    logAuthEvent('LOGOUT_ALL', ip, `modo=local email=${session.local.email}`);
    return res.json({ success: true, data: { mode: 'local', scope: 'este dispositivo (el modo local no registra sesiones en servidor)' } });
  }

  const userId = session.remote?.user?.id || '';
  if (!userId) {
    return res.status(401).json({ success: false, error: 'SesiÃ³n requerida. Inicia sesiÃ³n para acceder a esta informaciÃ³n.' });
  }

  // 1) Revocar todas las sesiones del usuario en Supabase.
  if (isSupabaseConfigured) {
    try {
      await supabaseAuthRequest('logout?scope=global', {}, 'POST', session.token);
    } catch (err) {
      logAuthEvent('LOGOUT_AVISO', ip, `revocacion supabase=${err instanceof Error ? err.message : 'error'}`);
    }
  }

  // 2) Revocar el registro de TODAS las sesiones del usuario (best effort;
  // requiere la migracion 0029). Las demas instancias detectan la marca en <=10 s.
  if (appSessionsTableReady !== false) {
    try {
      await supabaseRestRequest(
        `app_sessions?user_id=eq.${userId}&revoked_at=is.null`,
        { method: 'PATCH', body: { revoked_at: new Date().toISOString() } },
        session.token
      );
    } catch (err) {
      logAuthEvent('LOGOUT_AVISO', ip, `revocacion registro=${err instanceof Error ? err.message : 'error'}`);
    }
  }

  // 3) Purgar la memoria de esta instancia y limpiar cookies de este equipo.
  purgeSessionMemoryByUser(userId);
  clearSessionCookie(res, SESSION_COOKIE, req);
  clearSessionCookie(res, REFRESH_COOKIE, req);
  logAuthEvent('LOGOUT_ALL', ip, `usuario=${userId}`);
  res.json({ success: true, data: { mode: 'supabase', scope: 'todas las sesiones del usuario' } });
});

/** Ingreso con clave de acceso (modo local, sin Supabase). */
app.post('/api/auth/local-login', async (req, res) => {
  const ip = getClientIp(req);

  if (!ACCESS_KEY) {
    return res.status(503).json({
      success: false,
      error: 'El acceso directo no estÃ¡ habilitado en este servidor.'
    });
  }

  const limit = checkRateLimit(`local-login:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      error: `Demasiados intentos fallidos. Espera ${limit.retryAfterSeconds} segundos antes de reintentar.`
    });
  }

  const { accessKey, email } = req.body || {};
  const candidate = typeof accessKey === 'string' ? accessKey.trim() : '';
  if (!candidate) {
    return res.status(400).json({ success: false, error: 'Ingresa la clave de acceso.' });
  }

  // La clave de acceso es UNA sola y vive en una variable de entorno
  // (FRENYER_ACCESS_KEY). Nunca aceptar claves literales de respaldo.
  const isMasterKeyMatch = ACCESS_KEY && safeCompare(candidate, ACCESS_KEY);
  if (!isMasterKeyMatch) {
    logAuthEvent('ACCESO_LOCAL_FALLIDO', ip, 'clave incorrecta');
    return res.status(401).json({ success: false, error: 'Clave de acceso incorrecta.' });
  }

  const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : 'operador@frenyer.local';
  const jti = crypto.randomUUID();
  const payload: LocalSessionPayload = {
    sub: `local-${crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 16)}`,
    email: cleanEmail,
    role: 'admin',
    organizationId: '00000000-0000-0000-0000-000000000001',
    exp: Date.now() + SESSION_MAX_AGE_MS,
    jti
  };

  resetRateLimit(`local-login:${ip}`);
  purgeOpaqueSessionsByUser(payload.sub);
  activeLocalSessionBySub.set(payload.sub, jti);
  const localToken = signLocalSession(payload);
  setSessionCookie(res, SESSION_COOKIE, localToken, req);
  const sessionId = issueOpaqueSession(localToken, payload.sub, undefined, true);
  logAuthEvent('ACCESO_LOCAL_OK', ip, `email=${cleanEmail}`);

  res.json({
    success: true,
    data: {
      mode: 'local',
      user: { email: cleanEmail, id: payload.sub },
      role: payload.role,
      organizationId: payload.organizationId,
      permissions: defaultPermissionsForRole(payload.role),
      sessionId
    }
  });
});

/** Inicio de sesion con Google: el servidor gestiona todo el intercambio con Supabase. */
app.get('/api/auth/google', (req, res) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({ success: false, error: 'Supabase no estÃ¡ configurado en el servidor.' });
  }

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const redirectTo = `${getRequestOrigin(req)}/api/auth/google/callback`;

  res.cookie('frenyer_pkce', codeVerifier, {
    ...getSessionCookieOptions(req),
    maxAge: 10 * 60 * 1000
  });

  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', redirectTo);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('prompt', 'consent');

  res.redirect(authorizeUrl.toString());
});

/** Callback de Google: el servidor intercambia el codigo por tokens y fija las cookies. */
app.get('/api/auth/google/callback', async (req, res) => {
  const ip = getClientIp(req);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : '';

  if (errorDescription) {
    logAuthEvent('GOOGLE_FALLIDO', ip, errorDescription);
    return res.redirect(`/login?error=${encodeURIComponent('No se pudo iniciar sesiÃ³n con Google.')}`);
  }

  const codeVerifier = readCookie(req, 'frenyer_pkce');
  clearSessionCookie(res, 'frenyer_pkce', req);

  if (!code || !codeVerifier) {
    logAuthEvent('GOOGLE_FALLIDO', ip, 'codigo o verificador ausente');
    return res.redirect(`/login?error=${encodeURIComponent('La sesiÃ³n con Google expirÃ³. Intenta de nuevo.')}`);
  }

  const result = await supabaseAuthRequest('token?grant_type=pkce', {
    client_id: SUPABASE_ANON_KEY,
    code,
    code_verifier: codeVerifier,
    grant_type: 'pkce'
  });

  if (result.error || !result.data?.access_token) {
    logAuthEvent('GOOGLE_FALLIDO', ip, `motivo=${result.error || 'sin token'}`);
    return res.redirect(`/login?error=${encodeURIComponent('No se pudo completar el inicio de sesiÃ³n con Google.')}`);
  }

  const resolved = await resolveSessionUser(result.data.access_token);
  await enforceSingleSessionOnLogin(
    req,
    result.data.access_token,
    resolved?.user?.id || '',
    resolved?.role || 'cliente',
    resolved?.organizationId || '00000000-0000-0000-0000-000000000001',
    resolved?.user?.email || ''
  );

  setSessionCookie(res, SESSION_COOKIE, result.data.access_token, req);
  if (result.data.refresh_token) {
    setSessionCookie(res, REFRESH_COOKIE, result.data.refresh_token, req);
  }

  logAuthEvent('GOOGLE_OK', ip, `email=${resolved?.user?.email || 'desconocido'}`);

  res.redirect('/dashboard');
});

// ---------------------------------------------------------------------------
// CUSTOMER & ADMIN AUTH/USER MANAGEMENT ROUTES
// ---------------------------------------------------------------------------

// Customer Registration
app.post('/api/auth/customer/register', async (req, res) => {
  const { email, password, full_name, company_name, phone, address } = req.body;
  
  try {
    let authUser: any = null;

    // Intentar con admin createUser si estÃ¡ disponible
    try {
      const { data: adminData, error: adminError } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        user_metadata: { role: 'cliente', full_name, company_name: company_name || '' },
        email_confirm: true 
      });
      if (!adminError && adminData?.user) {
        authUser = adminData.user;
      }
    } catch {
      // Si auth.admin requiere Bearer token/service_role, recurrir al signUp estÃ¡ndar
    }

    // Fallback a signUp estÃ¡ndar con clave anÃ³nima (Alternativa 3)
    if (!authUser) {
      const { data: signData, error: signError } = await supabaseServer.auth.signUp({
        email,
        password,
        options: {
          data: { role: 'cliente', full_name, company_name: company_name || '' }
        }
      });
      if (signError) throw signError;
      authUser = signData.user;
    }

    // Insertar en public.shop_customers si es posible
    if (authUser?.id) {
      try {
        await supabaseServer
          .from('shop_customers')
          .insert({ id: authUser.id, email, full_name, phone, address });
      } catch (insertErr) {
        console.warn('Aviso guardando en shop_customers:', insertErr);
      }
    }

    res.json({ success: true, user: authUser });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin: Add User (Internal)
app.post('/api/admin/users/add', authenticateSupabaseRequest, async (req, res) => {
  const { email, password, full_name, role } = req.body;
  
  const roleVal = (res.locals.supabaseContext?.role || 'admin').toLowerCase();
  if (roleVal === 'customer' || roleVal === 'cliente') {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }

  try {
    const { data, error } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name, role },
      email_confirm: true
    });
    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin: Update User (Internal)
app.patch('/api/admin/users/:id', authenticateSupabaseRequest, async (req, res) => {
  const { id } = req.params;
  const { password, full_name, role } = req.body;
  
  const roleVal = (res.locals.supabaseContext?.role || 'admin').toLowerCase();
  if (roleVal === 'customer' || roleVal === 'cliente') {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }

  try {
    const updatePayload: any = { user_metadata: { full_name, role } };
    if (password) {
      updatePayload.password = password;
    }
    
    const { data, error } = await supabaseServer.auth.admin.updateUserById(id, updatePayload);
    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// RESPALDO GENERAL (descarga Excel / JSON)
// ---------------------------------------------------------------------------
/** Lee un archivo JSON del respaldo local; [] si no existe o está corrupto. */
function readLocalBackupJson(fileName: string): any[] {
  try {
    const file = path.resolve(DATA_DIR, fileName);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

/** Consulta una tabla: sesión autenticada → respaldo service role → archivo local. */
async function backupTable(
  res: AuthenticatedResponse,
  table: string,
  localFile: string,
  order: string = 'created_at.desc'
): Promise<{ rows: any[]; origen: string }> {
  const endpoint = `${table}?select=*&order=${encodeURIComponent(order)}&limit=10000`;
  try {
    const auth = await authenticatedSupabaseRestRequest(res, endpoint);
    if (!auth.error && Array.isArray(auth.data) && auth.data.length > 0) {
      return { rows: auth.data, origen: 'supabase-sesion' };
    }
  } catch {}

  try {
    const backup = await supabaseServiceRestRequest(endpoint);
    if (!backup.error && Array.isArray(backup.data) && backup.data.length > 0) {
      return { rows: backup.data, origen: 'supabase-service' };
    }
  } catch {}

  return { rows: readLocalBackupJson(localFile), origen: 'local' };
}

const XML_SAFE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function xmlEscape(value: any): string {
  return String(value ?? '').replace(/[&<>"]/g, (c) => XML_SAFE[c] || c);
}

/** Convierte filas en una hoja SpreadsheetML (Excel la abre nativamente). */
function backupSheet(name: string, rows: any[]): string {
  const safeName = xmlEscape(name).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31) || 'Datos';
  const headers: string[] = [];
  rows.forEach((r) => {
    Object.keys(r || {}).forEach((k) => {
      if (!headers.includes(k) && headers.length < 40) headers.push(k);
    });
  });
  const cols = headers.length > 0 ? headers : ['sin_datos'];
  const esc = (v: string) => v.replace(/_x005F_/g, 'x');
  const cells = (row: any) =>
    cols
      .map((c) => {
        const raw = row?.[c];
        if (raw === null || raw === undefined || raw === '') return `<Cell/>`;
        if (typeof raw === 'number' && isFinite(raw)) {
          return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
        }
        if (typeof raw === 'boolean') {
          return `<Cell><Data ss:Type="String">${raw ? 'SÍ' : 'NO'}</Data></Cell>`;
        }
        // Objetos/arrays (JSON) y textos: sanitizar y limitar longitud
        const text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        return `<Cell><Data ss:Type="String">${xmlEscape(text.slice(0, 800))}</Data></Cell>`;
      })
      .join('');

  const headerRow = `<Row>${cols.map((c) => `<Cell><Data ss:Type="String">${esc(xmlEscape(c))}</Data></Cell>`).join('')}</Row>`;
  const bodyRows = rows.map((r) => `<Row>${cells(r)}</Row>`).join('');

  return `<Worksheet ss:Name="${esc(xmlEscape(safeName))}"><Table>${headerRow}${bodyRows}</Table></Worksheet>`;
}

app.get('/api/backup', async (req, res: AuthenticatedResponse) => {
  try {
    const format = String((req.query as any).format || 'json').toLowerCase();

    const secciones: Array<{ titulo: string; tabla: string; archivo: string; hoja: string }> = [
      { titulo: 'Ventas (facturas y notas)', tabla: 'sales', archivo: 'sales.json', hoja: 'Ventas' },
      { titulo: 'Artículos vendidos', tabla: 'sale_items', archivo: 'sale_items.json', hoja: 'Articulos Vendidos' },
      { titulo: 'Pagos de ventas', tabla: 'payments', archivo: 'payments.json', hoja: 'Pagos Ventas' },
      { titulo: 'Pedidos', tabla: 'orders', archivo: 'orders.json', hoja: 'Pedidos' },
      { titulo: 'Cotizaciones', tabla: 'quotes', archivo: 'quotes.json', hoja: 'Cotizaciones' },
      { titulo: 'Movimientos bancarios', tabla: 'bank_movements', archivo: 'bank_movements.json', hoja: 'Mov Bancarios' },
      { titulo: 'Cuentas bancarias', tabla: 'bank_accounts', archivo: 'bank_accounts.json', hoja: 'Ctas Bancarias' },
      { titulo: 'Cuentas por cobrar', tabla: 'accounts_receivable', archivo: 'accounts_receivable.json', hoja: 'Ctas por Cobrar' },
      { titulo: 'Abonos CxC', tabla: 'receivable_payments', archivo: 'receivable_payments.json', hoja: 'Abonos CxC' },
      { titulo: 'Cuentas por pagar', tabla: 'accounts_payable', archivo: 'accounts_payable.json', hoja: 'Ctas por Pagar' },
      { titulo: 'Pagos a proveedores', tabla: 'payable_payments', archivo: 'payable_payments.json', hoja: 'Pagos Proveedores' },
      { titulo: 'Clientes', tabla: 'customers', archivo: 'customers.json', hoja: 'Clientes' },
      { titulo: 'Proveedores', tabla: 'suppliers', archivo: 'suppliers.json', hoja: 'Proveedores' },
      { titulo: 'Inventario (productos)', tabla: 'products', archivo: 'products.json', hoja: 'Inventario' },
      { titulo: 'Movimientos de inventario', tabla: 'inventory_movements', archivo: 'inventory_movements.json', hoja: 'Mov Inventario' },
      { titulo: 'Gastos', tabla: 'expenses', archivo: 'expenses.json', hoja: 'Gastos' },
      { titulo: 'Categorías de gasto', tabla: 'expense_categories', archivo: 'expense_categories.json', hoja: 'Categorias Gasto' }
    ];

    const stamps = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const filenameBase = `frenyer-respaldo-${stamps}`;

    if (format === 'excel' || format === 'xls' || format === 'excel-xml') {
      const sheets: string[] = [];
      const resumen: Array<{ seccion: string; filas: number; origen: string }> = [];
      for (const s of secciones) {
        const { rows, origen } = await backupTable(res, s.tabla, s.archivo);
        sheets.push(backupSheet(s.hoja, rows));
        resumen.push({ seccion: s.titulo, filas: rows.length, origen });
      }
      // Hoja 0: resumen del respaldo
      sheets.unshift(
        backupSheet(
          'Resumen',
          resumen.map((r) => ({ Seccion: r.seccion, Filas: r.filas, Origen: r.origen, Generado: new Date().toISOString() }))
        )
      );
      const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
${sheets.join('\n')}
</Workbook>`;

      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xls"`);
      return res.status(200).send(xml);
    }

    // JSON: todo el respaldo en un archivo
    const data: Record<string, any[]> = {};
    const resumen: Array<{ seccion: string; filas: number; origen: string }> = [];
    for (const s of secciones) {
      const { rows, origen } = await backupTable(res, s.tabla, s.archivo);
      data[s.hoja] = rows;
      resumen.push({ seccion: s.titulo, filas: rows.length, origen });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.json"`);
    return res.status(200).json({
      success: true,
      generado: new Date().toISOString(),
      organizacion: res.locals.supabaseContext?.organizationId || null,
      usuario: res.locals.supabaseContext?.userEmail || null,
      resumen,
      data
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'No se pudo generar el respaldo.' });
  }
});

// ---------------------------------------------------------------------------
// ARRANQUE LOCAL / EXPORT PARA VERCEL
// ---------------------------------------------------------------------------
async function startLocalServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, '..', 'dist')));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Frenyer ERP] Servidor bimonetario activo en http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VERCEL) {
  // Serverless: Vercel importa `app` desde /api/index.ts; los archivos estáticos los sirve el CDN.
  console.log('[Frenyer ERP] Modo Vercel: la app queda lista como función serverless.');
} else {
  startLocalServer();
}

export default app;
