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
  'accounts_payable',
  'purchases',
  'purchase_items',
  'branches',
  'expenses',
  'expense_categories',
  'expense_payments',
  'inventory_movements'
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
    res.locals.supabaseContext = {
      accessToken: SUPABASE_ANON_KEY,
      organizationId: '00000000-0000-0000-0000-000000000001',
      role: 'admin'
    };
    next();
    return;
  }

  try {
    const accessToken = match[1];
    const { data: userData, error: userError } = await supabaseServer.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      // Fallback transparente al contexto de la organización activa
      res.locals.supabaseContext = {
        accessToken: SUPABASE_ANON_KEY,
        organizationId: '00000000-0000-0000-0000-000000000001',
        role: 'admin'
      };
      next();
      return;
    }

    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: membership } = await userSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const orgId = membership?.organization_id || '00000000-0000-0000-0000-000000000001';

    res.locals.supabaseContext = {
      accessToken,
      organizationId: orgId,
      role: membership?.role || 'admin'
    };
    next();
  } catch (error) {
    console.warn('Aviso en validación de sesión (aplicando contexto por defecto):', error);
    res.locals.supabaseContext = {
      accessToken: SUPABASE_ANON_KEY,
      organizationId: '00000000-0000-0000-0000-000000000001',
      role: 'admin'
    };
    next();
  }
}

app.use([
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
  '/api/expense-categories'
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
  const context = res.locals.supabaseContext || {
    accessToken: SUPABASE_ANON_KEY,
    organizationId: '00000000-0000-0000-0000-000000000001',
    role: 'admin'
  };

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

const DEFAULT_CATALOG_PRODUCTS = [
  {
    id: '5e9ce423-ba0d-4870-9f6f-44332d1e4189',
    sku: 'MOT-0001',
    barcode: '7591001000112',
    name: 'Amortiguador Delantero Reforzado Gas',
    category: 'Repuestos',
    brand: 'Monroe',
    description: 'Amortiguador delantero presurizado con nitrógeno de alta durabilidad para vías venezolanas.',
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
    name: 'Batería Automotriz 12V 800AMP Libre Mantenimiento',
    category: 'Electricidad',
    brand: 'Duncan',
    description: 'Batería sellada de alta capacidad de arranque en frío 800AMP con garantía nacional.',
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
    name: 'Aceite de Motor Sintético 20W50 1 Galón',
    category: 'Lubricantes',
    brand: 'Castrol',
    description: 'Lubricante sintético con aditivos antidesgaste para máxima protección térmica y antifricción.',
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
    name: 'Pastillas de Freno Cerámica Delanteras',
    category: 'Frenos',
    brand: 'Wagner',
    description: 'Juego de pastillas cerámicas de bajo desprendimiento de polvo y frenado suave sin chirridos.',
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
    description: 'Filtro de aire de algodón de alta permeabilidad lavable y de flujo óptimo.',
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
    name: 'Bujías de Iridio Punta Platino (Pack x4)',
    category: 'Encendido',
    brand: 'NGK',
    description: 'Juego de 4 bujías láser con electrodo central de iridio para encendido instantáneo.',
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
    name: 'Bombillo LED H4 Alta y Baja 6000K Blanco Frío',
    category: 'Iluminación',
    brand: 'Philips',
    description: 'Kit de 2 bombillos LED de alta intensidad 12.000 lúmenes con disipador pasivo.',
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
    name: 'Correa de Distribución Reforzada HNBR',
    category: 'Motor',
    brand: 'Gates',
    description: 'Correa dentada de caucho sintético reforzado resistente a altas temperaturas y aceites.',
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
    name: 'Refrigerante Anticorrosivo 50/50 1 Galón Verde',
    category: 'Lubricantes',
    brand: 'Prestone',
    description: 'Líquido refrigerante y anticongelante formulado para evitar corrosión y cavitación de bomba.',
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
    description: 'Rotor de disco de freno en hierro fundido tratado contra deformaciones térmicas.',
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

    // Fallback resiliente si la tabla está vacía o inaccesible sin sesión
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

    // Sanitizar branch_id si no es UUID válido
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
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
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
const INVENTORY_ADJUSTMENTS_FILE = path.resolve(process.cwd(), 'data', 'inventory_adjustments.json');

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
    // Resolver orgId y token (ya sea desde sesión de usuario o entorno predeterminado)
    let orgId = (res as AuthenticatedResponse).locals?.supabaseContext?.organizationId;
    let token = (res as AuthenticatedResponse).locals?.supabaseContext?.accessToken;

    if (!orgId) {
      const match = (req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) {
        try {
          const { data: userData } = await supabaseServer.auth.getUser(match[1]);
          if (userData?.user) {
            token = match[1];
            const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${match[1]}` } }
            });
            const { data: mem } = await userClient
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

    // 1. Consultar movimientos registrados directamente en inventory_movements (si la tabla existe)
    let rawMovements: any[] = [];
    try {
      const movRes = await queryDb(
        `inventory_movements?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`
      );
      if (!movRes.error && Array.isArray(movRes.data)) {
        rawMovements = movRes.data;
      }
    } catch {
      rawMovements = [];
    }

    // Cargar ajustes históricos y persistentes locales
    const persistedAdjustments = loadPersistedAdjustments(orgId);
    const loggedKeys = new Set(rawMovements.map((m: any) => `${m.doc_number}-${m.sku}`));
    
    // Integrar ajustes persistentes que no estén ya en la tabla de Supabase
    for (const adj of persistedAdjustments) {
      const key = `${adj.doc_number}-${adj.sku}`;
      if (!loggedKeys.has(key)) {
        rawMovements.push(adj);
        loggedKeys.add(key);
      }
    }

    const loggedDocKeys = new Set(rawMovements.map((m: any) => `${m.doc_number}-${m.sku}`));

    // 2. Consultar ventas reales para integrar sus líneas al kárdex si no están registradas
    const salesRes = await queryDb(
      `sales?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.COMPLETADA&select=id,doc_number,doc_type,created_at,exchange_rate,customers(id,name),sale_items(*)&order=created_at.desc&limit=250`
    );

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

    // 3. Consultar compras reales para integrar sus líneas al kárdex si no están registradas
    const purchasesRes = await queryDb(
      `purchases?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.COMPLETADA&select=id,doc_number,invoice_number,purchase_date,created_at,exchange_rate,suppliers(id,name),purchase_items(*)&order=created_at.desc&limit=250`
    );

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

    // 4. Unificar y ordenar cronológicamente
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
            const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${match[1]}` } }
            });
            const { data: mem } = await userClient
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
      return res.status(404).json({ success: false, error: `Producto con código ${sku} no encontrado en catálogo.` });
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
const ORDERS_FILE = path.resolve(process.cwd(), 'data', 'orders.json');

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

    const effectiveRate = Number(exchange_rate) || lastCertifiedRate?.appliedRate || 877.90;

    // 0. Validación previa de existencia en inventario (bloquear stock insuficiente o negativo)
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
      customer_email: customer_email ? String(customer_email).trim() : '',
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
            // Guardar en respaldo persistente local si tabla aún no existe en Supabase
            savePersistedAdjustment({ ...movementData, id: `mov-order-${it.sku}-${orderId}` });
          }
        }
      } catch (stockErr) {
        console.warn('Error descontando stock en pedido web:', stockErr);
      }
    }

    // 3. Intentar inserción en Supabase si la tabla orders existe
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
      return res.status(400).json({ success: false, error: 'Estado de entrega no válido.' });
    }

    const currentOrders = loadPersistedOrders();
    const orderIdx = currentOrders.findIndex((o: any) => o.id === id || o.order_number === id);
    if (orderIdx === -1) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
    }

    const order = currentOrders[orderIdx];
    const prevStatus = order.delivery_status;

    // Reglas de transición de estado
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
      description: `Estado de entrega actualizado: ${prevStatus} → ${status}${notes ? ` (${notes})` : ''}`,
      user: String(user)
    };
    if (!Array.isArray(order.activity_history)) order.activity_history = [];
    order.activity_history.push(auditEntry);

    savePersistedOrder(order);

    // Intentar actualizar en Supabase si está disponible
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
      return res.status(400).json({ success: false, error: 'Estado de pago no válido.' });
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
      description: `Estado del pago actualizado: ${prevStatus} → ${status}${reference ? ` (Ref: ${reference})` : ''}`,
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

app.get('/api/public/config', async (_req, res) => {
  const effectiveRate = lastCertifiedRate?.appliedRate || 877.90;
  const rateDate = lastCertifiedRate?.valueDate || 'Hoy';

  return res.json({
    success: true,
    data: {
      businessName: 'Frenyer, C.A.',
      rif: 'J-123456789',
      phone: '+58 212 555 1212',
      whatsapp: '+58 412 000 0000',
      email: 'contacto@frenyer.com',
      address: 'Av. Francisco de Miranda, Centro Financiero, Caracas, Venezuela',
      slogan: 'Tu aliado comercial bimonetario',
      bcvRate: effectiveRate,
      bcvRateDate: rateDate,
      branches: [
        { id: 'suc-01', name: 'Sede Principal - Despacho Central', address: 'Av. Francisco de Miranda, Caracas' },
        { id: 'suc-02', name: 'Sucursal Chacao', address: 'Calle Bolívar, Chacao' },
        { id: 'suc-03', name: 'Almacén Los Ruices', address: 'Zona Industrial Los Ruices' }
      ]
    }
  });
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
// 6.1 BANK ACCOUNTS (RESILIENT DUAL PERSISTENCE)
const BANK_ACCOUNTS_FILE = path.resolve(process.cwd(), 'data', 'bank_accounts.json');

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
  return [
    {
      id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517',
      organization_id: '00000000-0000-0000-0000-000000000001',
      bank_name: 'Banesco',
      account_number: '0134-0055-26',
      account_type: 'Corriente',
      currency: 'VES',
      balance: 192259.61,
      status: 'Activo',
      created_at: new Date().toISOString()
    },
    {
      id: 'ba063cfe-3aef-4a50-b86f-52ef90bf7fdb',
      organization_id: '00000000-0000-0000-0000-000000000001',
      bank_name: 'Efectivo USD',
      account_number: '0001',
      account_type: 'Efectivo',
      currency: 'USD',
      balance: 31.42,
      status: 'Activo',
      created_at: new Date().toISOString()
    },
    {
      id: 'ef41a1a3-abce-443a-9f3c-0cfb434d06e2',
      organization_id: '00000000-0000-0000-0000-000000000001',
      bank_name: 'Vzla Bolivares',
      account_number: '0102',
      account_type: 'Corriente',
      currency: 'VES',
      balance: 112361.04,
      status: 'Activo',
      created_at: new Date().toISOString()
    }
  ];
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
const BANK_MOVEMENTS_FILE = path.resolve(process.cwd(), 'data', 'bank_movements.json');
const PAYMENT_METHODS_FILE = path.resolve(process.cwd(), 'data', 'payment_methods.json');

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
    console.warn('Aviso cargando métodos de pago locales:', err);
  }
  return [
    { id: 'pm-1', name: 'Pago Móvil Banesco', currency: 'VES', type: 'Pago Móvil', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-2', name: 'Transferencia Banesco', currency: 'VES', type: 'Transferencia', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-3', name: 'Punto de Venta Banesco', currency: 'VES', type: 'Punto de Venta', bank_account_id: 'a37f2b1e-2ee8-46ef-b76b-44a4f3d6b517' },
    { id: 'pm-4', name: 'Efectivo Dólares', currency: 'USD', type: 'Efectivo', bank_account_id: 'ba063cfe-3aef-4a50-b86f-52ef90bf7fdb' },
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
    console.warn('Aviso guardando método de pago local:', err);
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
      name: method.name || 'Método',
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
      return res.json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
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
      return res.status(400).json({ success: false, error: 'El monto del movimiento debe ser un número positivo.' });
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
      // Buscar cuenta según tipo o moneda
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
      return res.status(404).json({ success: false, error: 'No se encontró la cuenta bancaria para registrar el movimiento.' });
    }

    const resolvedAccountId = targetAccount.id;
    const delta = type === 'ENTRADA' ? numAmount : -(numAmount + effectiveCommission);
    const currentBalance = Number(targetAccount.balance) || 0;
    const newBalance = Math.round((currentBalance + delta) * 100) / 100;

    let rpcSuccess = false;
    let createdMovement: any = null;

    // 1. Intentar registrar vía RPC atómica si está disponible
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
      return res.status(400).json({ success: false, error: 'Los montos deben ser números positivos.' });
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
          name: `Comisión bancaria - Transferencia (${reference})`,
          category: 'Gastos Bancarios',
          type: 'VARIABLE',
          amount: effectiveCommission,
          currency: sourceCurrency,
          exchange_rate: numRate,
          due_date: new Date().toISOString().slice(0, 10),
          status: 'PAGADO',
          payment_account_id: sourceAccountId,
          notes: `Comisión registrada automáticamente por transferencia bancaria desde ${srcBankName} (Ref: ${reference})`
        };

        await authenticatedSupabaseRestRequest(res, 'expenses', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: expensePayload
        });
      } catch (commErr) {
        console.warn('Aviso registrando gasto de comisión bancaria en transferencia:', commErr);
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
const SUPPLIERS_FILE = path.resolve(process.cwd(), 'data', 'suppliers.json');

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

  // 2. Coincidencia por RIF / doc_number normalizado (si no está vacío)
  const normDoc = normalizeSupplierDoc(candidate.doc_number);
  if (normDoc) {
    const idx = suppliersList.findIndex((s: any) => normalizeSupplierDoc(s?.doc_number) === normDoc);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  // 3. Coincidencia por nombre normalizado (si no está vacío)
  const normName = normalizeSupplierName(candidate.name);
  if (normName) {
    const idx = suppliersList.findIndex((s: any) => normalizeSupplierName(s?.name) === normName);
    if (idx >= 0) return { supplier: suppliersList[idx], index: idx };
  }

  // 4. Coincidencia por código PRV
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
        doc_type: doc.startsWith('J') ? 'RIF Jurídico' : 'RIF (J / G / V)',
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
    const bankMovFile = path.resolve(process.cwd(), 'data', 'bank_movements.json');
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

    // 2. Consultar tabla suppliers en Supabase si está disponible
    let dbSuppliers: any[] = [];
    try {
      const result = await supabaseRestRequest('suppliers?select=*&order=created_at.desc', {}, token);
      if (!result.error && Array.isArray(result.data)) {
        dbSuppliers = result.data;
      }
    } catch (e) {
      console.warn('Aviso consultando suppliers en Supabase:', e);
    }

    // 3. Fusionar usando findExistingSupplier por clave de negocio canónica (doc_number / name)
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

    // 2. Sincronizar en Supabase (PATCH si existía con UUID, o POST si es nuevo)
    try {
      let payload: Record<string, any> = { ...supplierRecord };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

      if (existing?.supplier?.id && isUuid) {
        await supabaseRestRequest(`suppliers?id=eq.${encodeURIComponent(targetId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: payload
        }, token);
      } else {
        let attempts = 0;
        while (attempts < 6) {
          attempts++;
          const result = await supabaseRestRequest('suppliers', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: payload
          }, token);
          if (!result.error && result.data) {
            const created = Array.isArray(result.data) ? result.data[0] : result.data;
            const merged = { ...supplierRecord, ...created };
            savePersistedSupplier(merged);
            return res.json({ success: true, data: merged });
          }
          if (result.error) {
            const missingColMatch = result.error.match(/Could not find the '([^']+)' column of 'suppliers'/i);
            if (missingColMatch && missingColMatch[1] && missingColMatch[1] in payload) {
              delete payload[missingColMatch[1]];
              continue;
            }
            break;
          }
        }
      }
    } catch (sbErr) {
      console.warn('Aviso sincronizando proveedor en Supabase:', sbErr);
    }

    return res.json({ success: true, data: supplierRecord });
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

    // Intentar en Supabase
    try {
      let attempts = 0;
      while (attempts < 6) {
        attempts++;
        const result = await supabaseRestRequest(
          `suppliers?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: updatesPayload
          }
        );
        if (!result.error) {
          const updated = Array.isArray(result.data) ? result.data[0] : result.data;
          const merged = { ...(existing || {}), ...rawUpdates, ...updated };
          savePersistedSupplier(merged);
          return res.json({ success: true, data: merged });
        }
        const missingColMatch = result.error?.match(/Could not find the '([^']+)' column of 'suppliers'/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in updatesPayload) {
          delete updatesPayload[missingColMatch[1]];
          continue;
        }
        break;
      }
    } catch (sbErr) {
      console.warn('Aviso actualizando proveedor en Supabase:', sbErr);
    }

    return res.json({ success: true, data: { ...(existing || {}), ...rawUpdates } });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    deletePersistedSupplier(id);

    try {
      await supabaseRestRequest(
        `suppliers?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
    } catch (sbErr) {
      console.warn('Aviso eliminando proveedor en Supabase:', sbErr);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 7.B SEDES Y ALMACENES (BRANCHES) PROXY
// ---------------------------------------------------------------------------
const BRANCHES_FILE = path.resolve(process.cwd(), 'data', 'branches.json');

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

    // 2. Si hubo fallo de conexión temporal con Supabase, retornar sedes persistidas del usuario (sin datos estáticos)
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
// 7.B.2 GESTIÓN DE USUARIOS ASOCIADOS Y CONTROL RBAC PROXY
// ---------------------------------------------------------------------------
const USERS_FILE = path.resolve(process.cwd(), 'data', 'users.json');

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

app.get('/api/users', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    
    // 1. Intentar consultar perfiles/usuarios de Supabase si existe conexión
    try {
      const result = await supabaseRestRequest('profiles?select=*&order=created_at.desc');
      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        // Mapear al modelo unificado de usuarios asociados
        const mappedFromSupabase = result.data.map((p: any) => {
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
            permissions: Array.isArray(p.permissions) ? p.permissions : ['ventas'],
            created_at: p.created_at || new Date().toISOString()
          };
        });

        // Combinar con los locales para asegurar que no se pierdan usuarios guardados localmente
        const localList = loadPersistedUsers();
        const combined = [...mappedFromSupabase];
        localList.forEach((lu: any) => {
          if (!combined.some(cu => String(cu.id) === String(lu.id) || (cu.email && cu.email.toLowerCase() === (lu.email || '').toLowerCase()))) {
            combined.push(lu);
          }
        });

        return res.json({ success: true, data: combined });
      }
    } catch (sbErr) {
      console.warn('Aviso consultando usuarios en Supabase:', sbErr);
    }

    // 2. Si Supabase no responde o está en modo local resiliente
    let local = loadPersistedUsers();
    if (local.length === 0) {
      // Seed default user if empty
      const defaultUser = {
        id: 'usr-001',
        name: 'Administrador Principal',
        email: 'fotocopiasfyp@gmail.com',
        role: 'Admin',
        title: 'Director General',
        active: true,
        initials: 'AP',
        permissions: ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'],
        created_at: new Date().toISOString()
      };
      savePersistedUser(defaultUser);
      local = [defaultUser];
    }
    return res.json({ success: true, data: local });
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

    const userId = body.id || `usr-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
    const names = body.name.trim().split(/\s+/);
    const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();

    // Default permissions per role if not specified
    let permissions = Array.isArray(body.permissions) ? body.permissions : [];
    if (permissions.length === 0) {
      const role = (body.role || 'Cashier').toLowerCase();
      if (role === 'admin' || role === 'propietario' || role === 'administrador') {
        permissions = ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'];
      } else if (role === 'manager' || role === 'gerente') {
        permissions = ['ventas', 'inventario', 'reportes'];
      } else if (role === 'cashier' || role === 'cajero') {
        permissions = ['ventas'];
      } else {
        permissions = ['reportes'];
      }
    }

    const newUser: Record<string, any> = {
      id: userId,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      role: body.role || 'Cashier',
      title: body.title ? body.title.trim() : (body.role || 'Asociado'),
      active: body.active !== undefined ? Boolean(body.active) : true,
      initials: initials,
      permissions: permissions,
      created_at: new Date().toISOString()
    };

    // 1. Guardar en persistencia local resiliente
    savePersistedUser(newUser);

    // 2. Intentar registrar en Supabase (tabla profiles y organization_members)
    try {
      // Si el id es UUID válido, podemos intentar registrar en profiles
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const sbPayload: Record<string, any> = {
        full_name: newUser.name,
        email: newUser.email,
        role: newUser.role.toLowerCase()
      };
      if (isUuid) {
        sbPayload.id = userId;
      }
      await supabaseRestRequest('profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: sbPayload
      });
    } catch (sbErr) {
      console.warn('Aviso sincronizando usuario con Supabase (guardado localmente):', sbErr);
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
    const current = loadPersistedUsers();
    const existing = current.find((u: any) => String(u.id) === String(id));

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }

    const updatedUser = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (updates.name) {
      const names = updates.name.trim().split(/\s+/);
      updatedUser.initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();
    }

    savePersistedUser(updatedUser);

    // Intentar actualizar en Supabase si corresponde
    try {
      await supabaseRestRequest(`profiles?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: {
          full_name: updatedUser.name,
          role: (updatedUser.role || '').toLowerCase()
        }
      });
    } catch {}

    return res.json({ success: true, data: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/users/:id/toggle-status', async (req, res: AuthenticatedResponse) => {
  try {
    const { id } = req.params;
    const current = loadPersistedUsers();
    const existing = current.find((u: any) => String(u.id) === String(id));

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }

    const newActiveState = !existing.active;
    const updatedUser = {
      ...existing,
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
    const { id } = req.params;
    deletePersistedUser(id);

    try {
      await supabaseRestRequest(`profiles?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {}

    return res.json({ success: true, message: 'Usuario eliminado exitosamente.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// 7.C MÓDULO DE GASTOS FIJOS Y VARIABLES (EXPENSES) PROXY
// ---------------------------------------------------------------------------
app.get('/api/expense-categories', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId;
    if (!orgId) {
      return res.status(200).json({ success: true, data: [] });
    }
    const result = await authenticatedSupabaseRestRequest(
      res,
      `expense_categories?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=name.asc`
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
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
      return res.status(200).json({ success: false, error: result.error });
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
      return res.status(200).json({ success: true, data: [] });
    }
    const result = await authenticatedSupabaseRestRequest(
      res,
      `expenses?organization_id=eq.${encodeURIComponent(orgId)}&select=*&order=due_date.asc,created_at.desc`
    );
    if (result.error) {
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
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

    return res.status(200).json({ success: false, error: lastError });
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

    return res.status(200).json({ success: false, error: lastError });
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
    return res.status(200).json({ success: false, error: result.error });
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
      return res.status(200).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// Endpoint para registrar pago de gasto con auditoría y enlace a tesorería
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
      return res.status(400).json({ success: false, error: 'Monto de pago no válido.' });
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

    // 2. Si se especificó cuenta bancaria, registrar movimiento de egreso
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
            user_name: 'Administración / Gastos',
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

    // 3. Actualizar el registro del gasto (último pago y próxima fecha si es fijo)
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
      return res.status(200).json({ success: false, error: result.error, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

const ACCOUNTS_RECEIVABLE_FILE = path.resolve(process.cwd(), 'data', 'accounts_receivable.json');
const ACCOUNTS_PAYABLE_FILE = path.resolve(process.cwd(), 'data', 'accounts_payable.json');
const PURCHASES_FILE = path.resolve(process.cwd(), 'data', 'purchases.json');

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

app.get('/api/accounts-receivable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    let dbItems: any[] = [];

    // 1. Consultar Supabase con relación de clientes, pagos y ventas con ítems
    try {
      const result = await supabaseRestRequest(
        'accounts_receivable?select=*,customers(*),receivable_payments(*),sales(*,sale_items(*))&order=created_at.desc'
      );
      if (!result.error && Array.isArray(result.data)) {
        dbItems = result.data;
      } else {
        const fallbackRes = await supabaseRestRequest('accounts_receivable?select=*,customers(*)&order=created_at.desc');
        if (!fallbackRes.error && Array.isArray(fallbackRes.data)) {
          dbItems = fallbackRes.data;
        }
      }

      // 2. Consultar pagos registrados en Supabase (tabla payments para ventas directas/POS y receivable_payments para abonos)
      const saleIds = dbItems.map((r: any) => r.sale_id).filter(Boolean);
      let salePayments: any[] = [];
      if (saleIds.length > 0) {
        const salePaysRes = await supabaseRestRequest(`payments?sale_id=in.(${saleIds.join(',')})&order=created_at.desc`);
        if (!salePaysRes.error && Array.isArray(salePaysRes.data)) {
          salePayments = salePaysRes.data;
        }
      }

      const directPaymentsRes = await supabaseRestRequest('receivable_payments?select=*&order=payment_date.desc');
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

      // 3. Procesar y unificar los pagos reales de cada cuenta por cobrar
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

        // Deduplicar pagos
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

        // Si la orden está cancelada/pagada en Supabase y no había fila explícita en payments ni receivable_payments
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

      // Si obtuvimos registros reales de Supabase, actualizamos la caché local con los datos reales
      if (dbItems.length > 0) {
        try {
          fs.writeFileSync(ACCOUNTS_RECEIVABLE_FILE, JSON.stringify(dbItems, null, 2), 'utf-8');
        } catch {}
        return res.json({ success: true, data: dbItems });
      }
    } catch (sbErr) {
      console.warn('Aviso consultando accounts_receivable en Supabase:', sbErr);
    }

    // 4. Si Supabase no devolvió registros o hubo error de red, usar respaldo local
    const fallbackData = loadPersistedReceivables(orgId);
    return res.json({ success: true, data: fallbackData });
  } catch (err: any) {
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

    const record = {
      ...raw,
      id: newId,
      organization_id: orgId,
      doc_number: (raw.doc_number || '').trim(),
      concept: raw.concept?.trim() || 'Venta a crédito o saldo pendiente',
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
      return res.status(400).json({ success: false, error: 'Monto de abono inválido' });
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

    // 2. Intentar registrar en Supabase
    try {
      await supabaseRestRequest('receivable_payments', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: paymentRecord
      });
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

      // Si no se envió ID o no se encontró, resolver según moneda o método
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

app.get('/api/accounts-payable', async (_req, res: AuthenticatedResponse) => {
  try {
    const orgId = res.locals.supabaseContext?.organizationId || '00000000-0000-0000-0000-000000000001';
    let dbItems: any[] = [];

    try {
      const result = await supabaseRestRequest('accounts_payable?select=*,payable_payments(*),suppliers(id,name,doc_number,phone,email,contact_person)&order=created_at.desc');
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

      // Consultar payable_payments directamente por si el join vino vacío
      const directPaymentsRes = await supabaseRestRequest('payable_payments?select=*&order=payment_date.desc');
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
        map.set(p.id, { ...local, ...p, payable_payments: Array.from(payMap.values()) });
      }
    }

    // Reconciliar pagos para registros con saldo amortizado
    for (const [id, item] of map.entries()) {
      const tot = Number(item.total_usd) || 0;
      const bal = Number(item.balance_usd != null ? item.balance_usd : tot);
      const paidDiff = Math.round(Math.max(0, tot - bal) * 100) / 100;
      const pays = Array.isArray(item.payable_payments) ? item.payable_payments : [];
      const currentSum = pays.reduce((s: number, p: any) => s + (Number(p.amount_usd || p.amount) || 0), 0);
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

    return res.json({ success: true, data: Array.from(map.values()) });
  } catch (err: any) {
    return res.status(200).json({ success: true, data: loadPersistedPayables() });
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
      return res.status(400).json({ success: false, error: 'Monto de abono inválido' });
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

    // 2.b Si se especificó una cuenta bancaria, registrar egreso (SALIDA) de la cuenta
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

    // 2. Si es compra a CRÉDITO, generar y registrar automáticamente el compromiso en cuentas por pagar
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
        description: notes || `Compra a crédito registrada bajo ${docNumber}`,
        created_at: new Date().toISOString()
      };
      savePersistedPayable(payableRecord);

      // Sincronizar en Supabase accounts_payable
      try {
        let pPayload: Record<string, any> = { ...payableRecord };
        delete pPayload.supplier_id; // Evitar colisión si no existe la columna en Supabase
        await supabaseRestRequest('accounts_payable', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: pPayload
        });
      } catch (apErr) {
        console.warn('Aviso sincronizando compromiso de crédito en Supabase:', apErr);
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
      message: 'Compra registrada con éxito.',
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
    let bundledSql = `-- ==============================================================================\n-- FRENYER ERP — PAQUETE COMPLETO DE MIGRACIONES UNIFICADAS (0001 - 0015)\n-- ==============================================================================\n-- Ejecuta este script en el SQL Editor de tu consola de Supabase para inicializar\n-- todas las tablas, índices, triggers y políticas RLS necesarias para Frenyer.\n-- ==============================================================================\n\n`;

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
// CUSTOMER & ADMIN AUTH/USER MANAGEMENT ROUTES
// ---------------------------------------------------------------------------

// Customer Registration
app.post('/api/auth/customer/register', async (req, res) => {
  const { email, password, full_name, phone, address } = req.body;
  
  try {
    // 1. Register user in auth.users (email_confirm: true skips verification)
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      user_metadata: { role: 'cliente', full_name },
      email_confirm: true 
    });
    if (authError) throw authError;

    // 2. Insert into public.shop_customers
    const { error: dbError } = await supabaseServer
      .from('shop_customers')
      .insert({ id: authData.user!.id, email, full_name, phone, address });
    
    if (dbError) throw dbError;

    res.json({ success: true, user: authData.user });
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
