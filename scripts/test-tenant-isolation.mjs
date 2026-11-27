#!/usr/bin/env node
// scripts/test-tenant-isolation.mjs
//
// Prueba de aislamiento multi-tenant end-to-end contra la base real.
// Crea dos tenants, inserta un producto en cada uno y verifica que ninguno
// ve los datos del otro. Sale con codigo 1 si detecta fuga.
//
// Uso: node scripts/test-tenant-isolation.mjs

import fs from 'node:fs';

const envPath = 'C:\\Users\\usuario\\Desktop\\dev\\app sysfrenyer\\.env.local';
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const BASE = 'http://localhost:3000';
const ADMIN_KEY = env.FRENYER_ACCESS_KEY;

async function register(email) {
  const r = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', fullName: 'Iso Test', companyName: 'Empresa Iso ' + Date.now(), role: 'gerente' })
  });
  const b = await r.json();
  const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, body: b, cookie, orgId: b?.data?.organizationId, userId: b?.data?.user?.id };
}

async function createProduct(cookie, sku, name) {
  const r = await fetch(BASE + '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sku, name, price_usd: 10, cost_usd: 5, stock: 1, category: 'Test', status: 'Activo', unit: 'UND' })
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function listProducts(cookie) {
  const r = await fetch(BASE + '/api/products', { headers: { Cookie: cookie } });
  const b = await r.json().catch(() => ({}));
  return Array.isArray(b?.data) ? b.data : [];
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('OK:  ', msg);
}

(async () => {
  const ts = Date.now();
  const emailA = `iso-a-${ts}@frenyer-test.local`;
  const emailB = `iso-b-${ts}@frenyer-test.local`;

  console.log('Registrando tenant A...');
  const A = await register(emailA);
  console.log('Registrando tenant B...');
  const B = await register(emailB);

  assert(A.status === 200 && A.orgId, 'Tenant A creado con org');
  assert(B.status === 200 && B.orgId, 'Tenant B creado con org');
  assert(A.orgId !== B.orgId, 'Los tenants tienen orgs distintas');

  const skuA = `ISO-A-${ts}`;
  const skuB = `ISO-B-${ts}`;

  console.log('Insertando producto en A...');
  const pa = await createProduct(A.cookie, skuA, 'Producto A');
  console.log('Insertando producto en B...');
  const pb = await createProduct(B.cookie, skuB, 'Producto B');
  assert(pa.status === 200 || pa.status === 201, 'Producto A creado');
  assert(pb.status === 200 || pb.status === 201, 'Producto B creado');

  console.log('Verificando aislamiento de listados...');
  const listA = await listProducts(A.cookie);
  const listB = await listProducts(B.cookie);
  const skusA = listA.map((p) => p.sku);
  const skusB = listB.map((p) => p.sku);
  assert(skusA.includes(skuA), 'A ve su propio producto');
  assert(!skusA.includes(skuB), 'A NO ve el producto de B');
  assert(skusB.includes(skuB), 'B ve su propio producto');
  assert(!skusB.includes(skuA), 'B NO ve el producto de A');

  // Verificar que A no puede leer el producto de B por id directo
  const prodB = pb.body?.data?.[0] || pb.body?.data;
  if (prodB?.id) {
    const r = await fetch(BASE + '/api/products/' + encodeURIComponent(prodB.sku), { headers: { Cookie: A.cookie } });
    const b = await r.json().catch(() => ({}));
    const returned = b?.data;
    const orgOfReturned = Array.isArray(returned) ? returned[0]?.organization_id : returned?.organization_id;
    assert(orgOfReturned !== B.orgId, 'A no recibe el producto de B (org distinta o vacio)');
  }

  console.log('');
  console.log(failures === 0 ? 'RESULTADO: PASS (sin fugas detectadas)' : `RESULTADO: FAIL (${failures} fallos)`);
  process.exit(failures === 0 ? 0 : 1);
})();
