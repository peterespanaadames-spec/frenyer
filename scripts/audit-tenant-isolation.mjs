#!/usr/bin/env node
// scripts/audit-tenant-isolation.mjs
//
// Auditor estatico de aislamiento multi-tenant.
// Escanea api/server.ts buscando consultas a tablas con organization_id que
// no filtren por tenant. Sale con codigo 1 si encuentra violaciones claras.
//
// Uso: node scripts/audit-tenant-isolation.mjs

import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'api', 'server.ts');
const src = fs.readFileSync(file, 'utf8');

// Tablas que tienen columna organization_id en la base de datos actual.
const TENANT_TABLES_WITH_ORG = new Set([
  'products', 'customers', 'sales', 'bank_accounts', 'accounts_receivable',
  'exchange_rates', 'bank_movements', 'payment_methods', 'suppliers',
  'accounts_payable', 'purchases', 'branches', 'expenses', 'expense_categories',
  'expense_payments', 'inventory_movements', 'customer_advances',
  'customer_advance_movements', 'organizations', 'shop_customers',
  'customer_wishlist', 'customer_orders', 'profiles'
]);

// Filtros que identifican un recurso unico (no son fuga cross-tenant).
const UNIQUE_KEY_RE = /[?&](slug|id|sku|code|email|doc_number|advance_number)=eq\./i;

const violations = [];
const warnings = [];

// Buscar llamadas a supabaseRestRequest / authenticatedSupabaseRestRequest
// con un endpoint que sea un string literal (sin interpolacion).
const re = /(authenticatedSupabaseRestRequest|supabaseRestRequest)\s*\(\s*(?:res\s*,\s*)?(['"`])([^'"`]+)\2/g;
let m;
while ((m = re.exec(src)) !== null) {
  const fn = m[1];
  const endpoint = m[3];
  const authenticated = fn === 'authenticatedSupabaseRestRequest';
  const table = endpoint.split('?')[0].split('/')[0].trim();
  if (!table || !TENANT_TABLES_WITH_ORG.has(table)) continue;

  // Detectar metodo HTTP en las opciones que siguen al endpoint.
  const after = src.slice(m.index + m[0].length, m.index + m[0].length + 120);
  const methodMatch = after.match(/method\s*:\s*['"`]([A-Z]+)['"`]/);
  const method = methodMatch ? methodMatch[1] : 'GET';

  const hasOrgFilter = /[?&]organization_id=/.test(endpoint) || /organization_id=/.test(after);
  const hasUniqueKey = UNIQUE_KEY_RE.test(endpoint);

  if (authenticated) {
    continue;
  }

  // supabaseRestRequest (sin sesion). Solo los GET sin filtro ni clave unica
  // son fugas potenciales; los POST/PUT/PATCH/DELETE llevan organization_id
  // en el cuerpo.
  if (method !== 'GET') continue;
  if (hasOrgFilter || hasUniqueKey) continue;

  violations.push({ fn, table, endpoint });
}

// Adicional: detectar endpoints GET que usan supabaseRestRequest sobre tablas tenant
// sin filtro (ya cubierto arriba). Reportar tambien los que usan .from(...) directo.
const fromRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;
while ((m = fromRe.exec(src)) !== null) {
  const table = m[1];
  if (!TENANT_TABLES_WITH_ORG.has(table)) continue;
  // Buscar si en las 200 chars siguientes hay .eq('organization_id' o filtro
  const ctx = src.slice(m.index, m.index + 220);
  if (/organization_id/.test(ctx)) continue;
  if (/\.eq\(\s*['"`](id|slug|sku|email)['"`]/.test(ctx)) continue;
  warnings.push({ table, snippet: ctx.replace(/\s+/g, ' ').slice(0, 120) });
}

console.log('=== Auditoria de aislamiento multi-tenant ===');
console.log('Archivo:', file);
console.log('');

if (violations.length === 0 && warnings.length === 0) {
  console.log('OK: no se detectaron consultas sin filtro de tenant.');
  process.exit(0);
}

if (violations.length > 0) {
  console.log('VIOLACIONES (consultas sin sesion a tablas tenant sin organization_id):');
  for (const v of violations) {
    console.log(`  - [${v.table}] ${v.endpoint}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('ADVERTENCIAS (revisar manualmente):');
  for (const w of warnings) {
    console.log(`  - [${w.table}] ${w.snippet}`);
  }
  console.log('');
}

process.exit(violations.length > 0 ? 1 : 0);
