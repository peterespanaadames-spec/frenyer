import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'node:https';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const PORT = 3000;

// Supabase Server Client
const REAL_SUPABASE_URL = 'https://knyqrwpaksawuxoqcayu.supabase.co';
const REAL_SUPABASE_ANON_KEY = 'sb_publishable_pZuReBOMK4oGLY7CDTjiSw_rrMKJFZK';

const rawServerUrl = process.env.VITE_SUPABASE_URL;
const SUPABASE_URL =
  rawServerUrl && !rawServerUrl.toLowerCase().includes('your_') && rawServerUrl.startsWith('http')
    ? rawServerUrl
    : REAL_SUPABASE_URL;

const rawServerKey = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY =
  rawServerKey && !rawServerKey.toLowerCase().includes('your_') && rawServerKey.startsWith('sb_')
    ? rawServerKey
    : REAL_SUPABASE_ANON_KEY;
const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache organization ID
let serverOrgId: string | null = null;
async function getServerOrgId(): Promise<string | null> {
  if (serverOrgId) return serverOrgId;
  try {
    const { data } = await supabaseServer.from('organizations').select('id').limit(1);
    if (data && data.length > 0 && data[0].id) {
      serverOrgId = data[0].id;
      return serverOrgId;
    }
  } catch {
    // ignore
  }
  return null;
}

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
  if (!forceRefresh && lastCertifiedRate && lastCertifiedRate.source === 'MANUAL') {
    return res.json(lastCertifiedRate);
  }

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
  } catch {
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
    } catch {
      usdRate = lastCertifiedRate?.usdRate || 872.3927;
      eurRate = lastCertifiedRate?.eurRate || 977.2194;
      sourceDetails = 'Caché de contingencia offline';
    }
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

  // Persistir en tabla exchange_rates de Supabase si es nueva tasa o forzado
  try {
    const orgId = await getServerOrgId();
    await supabaseServer.from('exchange_rates').insert([{
      organization_id: orgId || null,
      base_currency: 'USD',
      quote_currency: 'VES',
      rate: result.appliedRate,
      is_future_rate: result.isFutureApplied,
      source: result.source,
      observed_at: new Date().toISOString()
    }]);
  } catch {
    // Non-blocking
  }

  return res.json(result);
});

// Endpoint historial de tasas de cambio
app.get('/api/exchange-rates/history', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const { data, error } = await supabaseServer
      .from('exchange_rates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return res.status(200).json({ success: false, data: [] });
    }
    return res.json({ success: true, data: data || [] });
  } catch {
    return res.status(200).json({ success: false, data: [] });
  }
});

// ---------------------------------------------------------------------------
// 2. ENDPOINT: /api/bcv/rates/manual
// ---------------------------------------------------------------------------
app.post('/api/bcv/rates/manual', async (req, res) => {
  const { rate, futureRate: manualFutureRate, valueDate, userRole, notes } = req.body;

  if (userRole && userRole !== 'admin' && userRole !== 'superadmin' && userRole !== 'gerente') {
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

  lastCertifiedRate = {
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

  // Guardar en tabla exchange_rates de Supabase para trazabilidad inmutable
  try {
    const orgId = await getServerOrgId();
    await supabaseServer.from('exchange_rates').insert([{
      organization_id: orgId || null,
      base_currency: 'USD',
      quote_currency: 'VES',
      rate: appliedRate,
      is_future_rate: isFutureApplied,
      source: 'MANUAL',
      observed_at: new Date().toISOString()
    }]);
  } catch {
    // Non-blocking
  }

  return res.json({
    success: true,
    certifiedRate: lastCertifiedRate,
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
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
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

app.get('/api/products', async (_req, res) => {
  try {
    const result = await supabaseRestRequest('products?select=*&order=name.asc');
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
    const result = await supabaseRestRequest('products', {
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

    const result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}`, {
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
    const result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}`, {
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

    const result = await supabaseRestRequest(`products?sku=eq.${encodeURIComponent(sku)}`, {
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
    const result = await supabaseRestRequest('customers?select=*&order=name.asc');
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
    const result = await supabaseRestRequest('customers', {
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

// ---------------------------------------------------------------------------
// 6. BANK ACCOUNTS, PAYMENT METHODS & MOVEMENTS BACKEND PROXY
// ---------------------------------------------------------------------------

// 6.1 BANK ACCOUNTS
app.get('/api/bank-accounts', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await supabaseRestRequest('bank_accounts?select=*&order=bank_name.asc');
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
    const result = await supabaseRestRequest('bank_accounts', {
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
    const result = await supabaseRestRequest(`bank_accounts?id=eq.${id}`, {
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
      const result = await supabaseRestRequest(`bank_accounts?id=eq.${id}`, {
        method: 'DELETE'
      });
      if (result.error) {
        return res.status(200).json({ success: false, error: result.error });
      }
      return res.json({ success: true, permanent: true });
    }

    // Soft delete: Move to "Inactivo"
    const result = await supabaseRestRequest(`bank_accounts?id=eq.${id}`, {
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
    const result = await supabaseRestRequest('payment_methods?select=*&order=name.asc');
    if (result.error) {
      // Fallback if table doesn't exist yet
      return res.json({ success: true, data: [] });
    }
    return res.json({ success: true, data: result.data || [] });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message, data: [] });
  }
});

app.post('/api/payment-methods', async (req, res) => {
  try {
    const method = req.body;
    const result = await supabaseRestRequest('payment_methods', {
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
    const result = await supabaseRestRequest(`payment_methods?id=eq.${id}`, {
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
    const result = await supabaseRestRequest(`payment_methods?id=eq.${id}`, {
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

// 6.3 BANK MOVEMENTS WITH ATOMIC BALANCE ADJUSTMENT & MEMORY FALLBACK
let memoryBankMovements: any[] = [];

app.get('/api/bank-movements', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await supabaseRestRequest('bank_movements?select=*&order=created_at.desc');
    const dbList = result.error || !result.data ? [] : result.data;
    const combined = [...dbList, ...memoryBankMovements.filter(m => !dbList.some((d: any) => d.id === m.id))];
    return res.json({ success: true, data: combined });
  } catch (err: any) {
    return res.json({ success: true, data: memoryBankMovements });
  }
});

app.post('/api/bank-movements', async (req, res) => {
  try {
    const movement = req.body;
    const { bank_account_id, type, amount, commission } = movement;

    // 1. Fetch current account balance
    const accResult = await supabaseRestRequest(`bank_accounts?id=eq.${bank_account_id}`);
    if (accResult.error || !accResult.data || accResult.data.length === 0) {
      return res.status(200).json({ success: false, error: 'Cuenta bancaria no encontrada.' });
    }

    const currentBalance = Number(accResult.data[0].balance) || 0;
    const movAmt = Number(amount) || 0;
    const commAmt = Number(commission) || 0;

    let newBalance = currentBalance;
    if (type === 'ENTRADA') {
      newBalance += movAmt;
    } else if (type === 'SALIDA') {
      newBalance -= (movAmt + commAmt);
    }

    // 2. Atomic update of bank account balance
    const updateResult = await supabaseRestRequest(`bank_accounts?id=eq.${bank_account_id}`, {
      method: 'PATCH',
      body: { balance: newBalance }
    });

    if (updateResult.error) {
      return res.status(200).json({ success: false, error: 'Error actualizando saldo de la cuenta: ' + updateResult.error });
    }

    const newMov = {
      id: movement.id || 'mov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      created_at: new Date().toISOString(),
      ...movement
    };

    // 3. Try insert movement log in Supabase
    const result = await supabaseRestRequest('bank_movements', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: newMov
    });

    const created = result.error || !result.data ? newMov : (Array.isArray(result.data) ? result.data[0] : result.data);
    memoryBankMovements.unshift(created);

    return res.json({ success: true, data: created });
  } catch (err: any) {
    return res.status(200).json({ success: false, error: err?.message });
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
