import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import { createServer as createViteServer, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'node:https';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const PORT = 3000;

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
function readEnvLocalFile(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
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

const loadedEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
const localEnvFile = readEnvLocalFile();

function resolveSupabaseUrl(): string {
  if (isRealSupabaseUrl(localEnvFile.VITE_SUPABASE_URL)) return localEnvFile.VITE_SUPABASE_URL.trim();
  if (isRealSupabaseUrl(process.env.VITE_SUPABASE_URL)) return process.env.VITE_SUPABASE_URL!.trim();
  if (isRealSupabaseUrl(loadedEnv.VITE_SUPABASE_URL)) return loadedEnv.VITE_SUPABASE_URL.trim();
  return process.env.VITE_SUPABASE_URL || loadedEnv.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
}

function resolveSupabaseKey(): string {
  if (isRealSupabaseKey(localEnvFile.VITE_SUPABASE_ANON_KEY)) return localEnvFile.VITE_SUPABASE_ANON_KEY.trim();
  if (isRealSupabaseKey(process.env.VITE_SUPABASE_ANON_KEY)) return process.env.VITE_SUPABASE_ANON_KEY!.trim();
  if (isRealSupabaseKey(loadedEnv.VITE_SUPABASE_ANON_KEY)) return loadedEnv.VITE_SUPABASE_ANON_KEY.trim();
  return process.env.VITE_SUPABASE_ANON_KEY || loadedEnv.VITE_SUPABASE_ANON_KEY || 'configure-supabase-publishable-key';
}

let SUPABASE_URL = resolveSupabaseUrl();
let SUPABASE_ANON_KEY = resolveSupabaseKey();

let isSupabaseConfigured = isRealSupabaseUrl(SUPABASE_URL) && isRealSupabaseKey(SUPABASE_ANON_KEY);
let supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface SupabaseRequestContext {
  accessToken: string;
  organizationId: string;
  role: string;
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
  'accounts_payable'
]);

async function authenticateSupabaseRequest(
  req: Request,
  res: AuthenticatedResponse,
  next: NextFunction
): Promise<void> {
  if (!isSupabaseConfigured) {
    res.status(503).json({ success: false, error: 'La conexión con Supabase no está configurada.' });
    return;
  }

  const match = (req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ success: false, error: 'Inicie sesión para acceder a este recurso.' });
    return;
  }

  try {
    const accessToken = match[1];
    const { data: userData, error: userError } = await supabaseServer.auth.getUser(accessToken);
    if (userError || !userData.user) {
      res.status(401).json({ success: false, error: 'La sesión no es válida o ha vencido.' });
      return;
    }

    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: membership, error: membershipError } = await userSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      res.status(403).json({ success: false, error: `No se pudo validar la organización: ${membershipError.message}` });
      return;
    }
    if (!membership?.organization_id) {
      res.status(403).json({ success: false, error: 'El usuario no pertenece a una organización autorizada.' });
      return;
    }

    res.locals.supabaseContext = {
      accessToken,
      organizationId: membership.organization_id,
      role: membership.role || ''
    };
    next();
  } catch (error) {
    console.error('Error authenticating API request:', error);
    res.status(401).json({ success: false, error: 'No se pudo validar la sesión.' });
  }
}

app.use([
  '/api/bcv/rates/manual',
  '/api/exchange-rates/history',
  '/api/reports/process-transactions',
  '/api/products',
  '/api/customers',
  '/api/bank-accounts',
  '/api/payment-methods',
  '/api/bank-movements',
  '/api/bank-transfers',
  '/api/suppliers',
  '/api/quotes',
  '/api/sales',
  '/api/accounts-receivable',
  '/api/accounts-payable'
], authenticateSupabaseRequest);

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
} | null = null;

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

// ---------------------------------------------------------------------------
// 1. ENDPOINT: /api/bcv/rates
// ---------------------------------------------------------------------------
app.get('/api/bcv/rates', async (req, res) => {
  const timeInfo = getCaracasTimeInfo();

  const forceRefresh = req.query.refresh === 'true';

  let usdRate = 0;
  let eurRate = 0;
  let valueDate = timeInfo.todayCaracasStr;
  let source: 'BCV_DIRECT' | 'DOLAR_API_FALLBACK' | 'MANUAL' = 'BCV_DIRECT';
  let sourceDetails = 'Extracción directa portal oficial BCV';

  let bcvSuccess = false;
  try {
    const html = await fetchBcvDirectText('https://www.bcv.org.ve/glosario/cambio-oficial', 8000);

    // Parse USD rate from BCV official page: matches <strong class="strong-tb">872,39270000</strong> inside #dolar div
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
      const timeoutId = setTimeout(() => controller.abort(), 5000);

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
        return res.json({
          ...lastCertifiedRate,
          sourceDetails: 'Última tasa externa certificada disponible en caché',
          checkedAt: new Date().toISOString()
        });
      }
      return res.status(503).json({
        success: false,
        error: 'No hay una tasa BCV disponible. Intenta de nuevo cuando el servicio esté accesible.'
      });
    }
  }

  if (!Number.isFinite(usdRate) || usdRate <= 0) {
    if (lastCertifiedRate && lastCertifiedRate.source !== 'MANUAL') {
      return res.json({
        ...lastCertifiedRate,
        sourceDetails: 'Última tasa externa certificada disponible en caché',
        checkedAt: new Date().toISOString()
      });
    }
    return res.status(503).json({
      success: false,
      error: 'El servicio de tasas no devolvió un valor válido.'
    });
  }

  const isDateFuture = valueDate > timeInfo.todayCaracasStr || valueDate > timeInfo.todayCaracasIso;
  const isFutureTime = isDateFuture || timeInfo.isAfter4PM;

  // Regla de Tasa Futura del usuario:
  // "en el momento de buscar el valor de la tasa, si existe una tasa futura es la que grabaras, de lo contrario te quedas con la tasa actual."
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

  // Si existe tasa futura, es la que se graba y aplica directamente
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

  return res.json(result);
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
      return res.status(result.status).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch {
    return res.status(500).json({ success: false, error: 'Error cargando el historial de tasas.' });
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
      error: 'Acción restringida: La intervención manual de tasas requiere privilegios de Administrador.'
    });
  }

  const numCurrent = parseFloat(rate);
  if (!numCurrent || numCurrent <= 0) {
    return res.status(400).json({ error: 'La tasa manual ingresada debe ser un número positivo válido.' });
  }

  const numFuture = manualFutureRate ? parseFloat(manualFutureRate) : null;
  const timeInfo = getCaracasTimeInfo();

  // Rule: Si existe una tasa futura es la que se grabará, de lo contrario se queda con la tasa actual
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
// 4. SUPABASE BACKEND PROXY (Garantiza cero problemas de CORS o Iframe)
// ---------------------------------------------------------------------------
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
    const headers: Record<string, string> = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Accept': 'application/json',
      ...options.headers
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = https.request(url, { method, headers, timeout: 8000 }, (res) => {
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

function authenticatedSupabaseRestRequest(
  res: AuthenticatedResponse,
  endpoint: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any; error?: string }> {
  const context = res.locals.supabaseContext;
  if (!context) {
    return Promise.resolve({ status: 401, data: null, error: 'Se requiere una sesión autenticada.' });
  }

  const method = options.method || 'GET';
  const table = endpoint.split('?')[0].split('/')[0];
  let body = options.body;
  if (tenantScopedTables.has(table) && (method === 'POST' || method === 'PATCH') && body) {
    const rows = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        return Promise.resolve({ status: 400, data: null, error: 'El cuerpo de la solicitud no es válido.' });
      }
      const rowOrgId = (row as { organization_id?: string }).organization_id;
      if (rowOrgId && rowOrgId !== context.organizationId) {
        return Promise.resolve({ status: 403, data: null, error: 'No puede modificar datos de otra organización.' });
      }
      (row as { organization_id?: string }).organization_id = context.organizationId;
    }
    body = Array.isArray(body) ? rows : rows[0];
  }

  return supabaseRestRequest(endpoint, { ...options, body }, context.accessToken);
}

app.get('/api/products', async (_req, res: AuthenticatedResponse) => {
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'products?select=*&order=name.asc');
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'products', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: product
    });

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }

    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.put('/api/products/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const updates = req.body;

    const result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/products/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'DELETE'
    });

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.patch('/api/products/:sku/stock', async (req, res) => {
  try {
    const { sku } = req.params;
    const { stock } = req.body;

    const result = await authenticatedSupabaseRestRequest(res, `products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'PATCH',
      body: { stock }
    });

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// 5. CUSTOMERS BACKEND PROXY
// ---------------------------------------------------------------------------
app.get('/api/customers', async (_req, res) => {
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'customers?select=*&order=name.asc');
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const customer = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'customers', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: customer
    });

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }

    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.get('/api/quotes', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    // 1. Intentar consulta completa con columnas de ciclo de vida (migración 0011)
    let result = await authenticatedSupabaseRestRequest(
      res,
      `sales?organization_id=eq.${encodeURIComponent(orgId)}&doc_type=eq.COTIZACION&select=id,organization_id,customer_id,doc_number,status,payment_type,exchange_rate,subtotal_usd,total_usd,total_ves,notes,quote_status,expires_at,converted_to_sale_id,created_at,customers(id,name,phone,doc_type,doc_number,email),sale_items(id,sku,name,quantity,unit_price_usd,total_usd,total_ves)&order=created_at.desc`
    );

    // 2. Si la columna quote_status aún no existe en Supabase, reintentar sin las columnas opcionales
    if (
      result.error &&
      typeof result.error === 'string' &&
      (result.error.includes('quote_status') || result.error.includes('column') || result.error.includes('42703'))
    ) {
      const fallbackResult = await authenticatedSupabaseRestRequest(
        res,
        `sales?organization_id=eq.${encodeURIComponent(orgId)}&doc_type=eq.COTIZACION&select=id,organization_id,customer_id,doc_number,status,payment_type,exchange_rate,subtotal_usd,total_usd,total_ves,notes,created_at,customers(id,name,phone,doc_type,doc_number,email),sale_items(id,sku,name,quantity,unit_price_usd,total_usd,total_ves)&order=created_at.desc`
      );

      if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
        const enriched = fallbackResult.data.map((item: any) => ({
          ...item,
          quote_status: item.status === 'CANCELADA' ? 'Rechazada' : 'Creada',
          expires_at: null,
          converted_to_sale_id: null
        }));
        return res.json({ success: true, data: enriched, schemaNotice: 'quote_status_missing' });
      }
    }

    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
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
    return res.status(404).json({ success: false, error: 'Migración de cotizaciones no encontrada' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/quotes', async (req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || req.body.organizationId || '00000000-0000-0000-0000-000000000001';
    const { customerId, validityDays, notes, items, exchangeRate, rateSource, isFutureRate, rateValueDate } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Datos de cotización incompletos (cliente e ítems requeridos).' });
    }

    const rate = Number(exchangeRate) || 1;
    const subtotal = items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0), 0);
    const totalVes = Math.round(subtotal * rate * 100) / 100;

    // Obtener siguiente correlativo de cotización
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

    // Si falló por falta de la columna quote_status o expires_at, reintentar sin ellas
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
      return res.status(200).json({ success: false, error: insertSale.error });
    }

    const createdSale = Array.isArray(insertSale.data) ? insertSale.data[0] : insertSale.data;
    const saleId = createdSale?.id;

    if (!saleId) {
      return res.status(200).json({ success: false, error: 'No se obtuvo el identificador de la cotización generada.' });
    }

    // Insertar ítems en sale_items
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
    return res.status(500).json({ success: false, error: err?.message || 'Error en servidor registrando cotización.' });
  }
});

// ---------------------------------------------------------------------------
// 6. BANK ACCOUNTS, PAYMENT METHODS & MOVEMENTS BACKEND PROXY
// ---------------------------------------------------------------------------

// 6.1 BANK ACCOUNTS
app.get('/api/bank-accounts', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'bank_accounts?select=*&order=bank_name.asc');
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.post('/api/bank-accounts', async (req, res) => {
  try {
    const account = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'bank_accounts', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: account
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.patch('/api/bank-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const result = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/bank-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isPermanent = req.query.permanent === 'true';

    if (isPermanent) {
      // Physical delete from Supabase table
      const result = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
        method: 'DELETE'
      });
      if (result.error) {
        return res.status(200).json({ success: false, error: result.error });
      }
      return res.json({ success: true, permanent: true });
    }

    // Soft delete: Move to "Inactivo"
    const result = await authenticatedSupabaseRestRequest(res, `bank_accounts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: { status: 'Inactivo' }
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true, permanent: false });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// 6.2 PAYMENT METHODS
app.get('/api/payment-methods', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'payment_methods?select=*&order=name.asc');
    if (result.error) {
      return res.status(502).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message });
  }
});

app.post('/api/payment-methods', async (req, res) => {
  try {
    const method = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'payment_methods', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: method
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.patch('/api/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const result = await authenticatedSupabaseRestRequest(res, `payment_methods?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await authenticatedSupabaseRestRequest(res, `payment_methods?id=eq.${id}`, {
      method: 'DELETE'
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// 6.3 BANK MOVEMENTS WITH BALANCE ADJUSTMENT
app.get('/api/bank-movements', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await authenticatedSupabaseRestRequest(res, 'bank_movements?select=*&order=created_at.desc');
    if (result.error) {
      return res.status(502).json({ success: false, error: result.error });
    }
    if (!Array.isArray(result.data)) {
      return res.status(502).json({ success: false, error: 'Supabase devolvió una respuesta inválida al consultar movimientos.' });
    }
    return res.json({ success: true, data: result.data });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message });
  }
});

app.post('/api/bank-movements', async (req, res) => {
  try {
    const movement = req.body || {};
    const {
      bank_account_id: bankAccountId,
      type,
      amount,
      rate,
      commission = 0,
      commission_type: commissionType = 'Fija'
    } = movement;
    if (!bankAccountId || !['ENTRADA', 'SALIDA'].includes(type)) {
      return res.status(400).json({ success: false, error: 'La cuenta y el tipo de movimiento son obligatorios.' });
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
        !Number.isFinite(Number(rate)) || Number(rate) <= 0 ||
        !Number.isFinite(Number(commission)) || Number(commission) < 0 ||
        !['Fija', 'Porcentual'].includes(commissionType) ||
        typeof movement.concept !== 'string' || !movement.concept.trim()) {
      return res.status(400).json({ success: false, error: 'Los datos del movimiento no son válidos.' });
    }

    const result = await authenticatedSupabaseRestRequest(res, 'rpc/record_bank_movement', {
      method: 'POST',
      body: {
        p_bank_account_id: bankAccountId,
        p_type: type,
        p_amount: Number(amount),
        p_rate: Number(rate),
        p_concept: movement.concept.trim(),
        p_reference: typeof movement.reference === 'string' ? movement.reference.trim() : null,
        p_commission: Number(commission),
        p_commission_type: commissionType
      }
    });
    if (result.error) {
      const status = result.status >= 400 && result.status < 500 ? result.status : 502;
      return res.status(status).json({ success: false, error: result.error });
    }
    if (!result.data) {
      return res.status(502).json({ success: false, error: 'Supabase no devolvió el movimiento registrado.' });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Error procesando el movimiento.' });
  }
});

app.post('/api/bank-transfers', async (req, res) => {
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
    if (!Number.isFinite(Number(sourceAmount)) || Number(sourceAmount) <= 0 ||
        !Number.isFinite(Number(targetAmount)) || Number(targetAmount) <= 0 ||
        !Number.isFinite(Number(rate)) || Number(rate) <= 0 ||
        !Number.isFinite(Number(commission)) || Number(commission) < 0 ||
        !['Fija', 'Porcentual'].includes(commissionType) ||
        typeof transfer.concept !== 'string' || !transfer.concept.trim()) {
      return res.status(400).json({ success: false, error: 'Los datos de la transferencia no son válidos.' });
    }

    const result = await authenticatedSupabaseRestRequest(res, 'rpc/record_bank_transfer', {
      method: 'POST',
      body: {
        p_source_account_id: sourceAccountId,
        p_target_account_id: targetAccountId,
        p_source_amount: Number(sourceAmount),
        p_target_amount: Number(targetAmount),
        p_rate: Number(rate),
        p_concept: transfer.concept.trim(),
        p_reference: typeof transfer.reference === 'string' ? transfer.reference.trim() : null,
        p_commission: Number(commission),
        p_commission_type: commissionType
      }
    });
    if (result.error) {
      const status = result.status >= 400 && result.status < 500 ? result.status : 502;
      return res.status(status).json({ success: false, error: result.error });
    }
    if (!result.data) {
      return res.status(502).json({ success: false, error: 'Supabase no devolvió los movimientos de la transferencia.' });
    }
    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Error procesando la transferencia.' });
  }
});

// ---------------------------------------------------------------------------
// 7. PROVEEDORES (SUPPLIERS) BACKEND PROXY
// ---------------------------------------------------------------------------
app.get('/api/suppliers', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `suppliers?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=name.asc`
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.post('/api/suppliers', async (req, res: AuthenticatedResponse) => {
  try {
    const supplier = req.body;
    const result = await authenticatedSupabaseRestRequest(res, 'suppliers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: supplier
    });
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message || 'Error en servidor' });
  }
});

app.patch('/api/suppliers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `suppliers?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: updates
      }
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `suppliers?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      }
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
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
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.get('/api/accounts-receivable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `accounts_receivable?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.get('/api/accounts-payable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext!.organizationId;
    const result = await authenticatedSupabaseRestRequest(
      res,
      `accounts_payable?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`
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
// 9. SUPABASE CONNECTION & MANAGEMENT ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/supabase/status', async (_req, res) => {
  const configured = isRealSupabaseUrl(SUPABASE_URL) && isRealSupabaseKey(SUPABASE_ANON_KEY);
  if (!configured) {
    return res.json({
      configured: false,
      connected: false,
      url: SUPABASE_URL,
      message: 'Supabase no está configurado con una URL o clave anónima válida.'
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

app.post('/api/supabase/config', async (req, res) => {
  const { url, anonKey } = req.body || {};
  const cleanUrl = typeof url === 'string' ? url.trim() : '';
  const cleanKey = typeof anonKey === 'string' ? anonKey.trim() : '';

  if (!isRealSupabaseUrl(cleanUrl)) {
    return res.status(400).json({
      success: false,
      error: 'La URL proporcionada no es válida. Debe iniciar con https:// y pertenecer a un proyecto de Supabase.'
    });
  }

  if (!isRealSupabaseKey(cleanKey)) {
    return res.status(400).json({
      success: false,
      error: 'La clave anónima (anon key) proporcionada no es válida o está incompleta.'
    });
  }

  // Probe live connection
  try {
    const probeRes = await new Promise<{ status: number; error?: string }>((resolve) => {
      const parsedUrl = new URL(`${cleanUrl}/rest/v1/organizations?select=id&limit=1`);
      const probeReq = https.request(
        parsedUrl,
        {
          method: 'GET',
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`,
            Accept: 'application/json'
          },
          timeout: 6000
        },
        (pRes) => {
          resolve({ status: pRes.statusCode || 200 });
        }
      );
      probeReq.on('timeout', () => {
        probeReq.destroy();
        resolve({ status: 504, error: 'Tiempo de espera agotado al conectar con Supabase.' });
      });
      probeReq.on('error', (err) => {
        resolve({ status: 500, error: err.message });
      });
      probeReq.end();
    });

    if (probeRes.status >= 500) {
      return res.status(502).json({
        success: false,
        error: `No se pudo establecer conexión con Supabase en ${cleanUrl} (${probeRes.error || `HTTP ${probeRes.status}`}).`
      });
    }

    // Update server instance
    SUPABASE_URL = cleanUrl;
    SUPABASE_ANON_KEY = cleanKey;
    isSupabaseConfigured = true;
    supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Persist to .env.local
    try {
      const envLocalContent = `VITE_SUPABASE_URL=${cleanUrl}\nVITE_SUPABASE_ANON_KEY=${cleanKey}\n`;
      fs.writeFileSync(path.resolve(process.cwd(), '.env.local'), envLocalContent, 'utf-8');
    } catch (saveErr) {
      console.warn('Could not persist .env.local file:', saveErr);
    }

    return res.json({
      success: true,
      message: 'Conexión con Supabase verificada y establecida con éxito.',
      url: cleanUrl
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Error validando credenciales de Supabase.'
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
    let bundledSql = `-- ==============================================================================\n-- FRENYER ERP — PAQUETE COMPLETO DE MIGRACIONES UNIFICADAS (0001 - 0012)\n-- ==============================================================================\n-- Ejecuta este script en el SQL Editor de tu consola de Supabase para inicializar\n-- todas las tablas, índices, triggers y políticas RLS necesarias para Frenyer.\n-- ==============================================================================\n\n`;

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
// VITE DEV / STATIC SERVING
// ---------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Frenyer ERP] Servidor bimonetario activo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
