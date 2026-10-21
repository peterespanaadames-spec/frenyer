# Problemas conocidos — Frenyer ERP

> Registro priorizado de defectos y deuda técnica detectados en la revisión de octubre 2026.
> Cada punto incluye la **ubicación exacta**, el **síntoma** y la **corrección propuesta**.
>
> Prioridad: 🔴 bloqueante · 🟠 alto · 🟡 medio · ⚪ bajo

---

## Índice

| ID | Área | Prioridad | Resumen |
|---|---|---|---|
| [P-01](#p-01) | Build | 🔴 | El arranque en producción falla (`app.get('*')` en Express 5) |
| [P-02](#p-02) | Datos | 🔴 | 10 módulos escriben con el cliente Supabase inerte del navegador |
| [P-03](#p-03) | Seguridad | 🔴 | 6 endpoints públicos por error |
| [P-04](#p-04) | Seguridad | 🔴 | 13 tablas sin aislamiento de tenant |
| [P-05](#p-05) | Calidad | 🟠 | Codificación mojibake en 130+ líneas |
| [P-06](#p-06) | Finanzas | 🟠 | La tasa BCV manual nunca se aplica |
| [P-07](#p-07) | Seguridad | 🟠 | Tres vocabularios de rol incompatibles |
| [P-08](#p-08) | Seguridad | 🟠 | `x-forwarded-for` se confía a ciegas |
| [P-09](#p-09) | Base de datos | 🟠 | La cadena de migraciones no se aplica desde cero |
| [P-10](#p-10) | Calidad | 🟠 | Cero pruebas y ESLint sin reglas |
| [P-11](#p-11) | Seguridad | 🟠 | CORS incompatible con la autenticación por cookie |
| [P-12](#p-12) | Base de datos | 🟠 | Restricciones FK que bloquean operaciones legítimas |
| [P-13](#p-13) | Datos | 🟠 | Estados de pago con genero inconsistente |
| [P-14](#p-14) | Base de datos | 🟠 | Duplicidad de la numeración `0016` |
| [P-15](#p-15) | Inventario | 🟡 | Kárdex con 4 fuentes ⇒ filas duplicadas |
| [P-16](#p-16) | Datos | 🟡 | El correlativo de factura no es atómico |
| [P-17](#p-17) | UI | 🟡 | Utilidades de Tailwind sin efecto |
| [P-18](#p-18) | UI | 🟡 | Spinners estáticos (no hay `@keyframes`) |
| [P-19](#p-19) | UI | 🟡 | Dos generaciones de `.auth-*` en conflicto |
| [P-20](#p-20) | Datos | 🟡 | Doble persistencia Supabase + localStorage |
| [P-21](#p-21) | Calidad | 🟡 | Código muerto y dependencias sin uso |
| [P-22](#p-22) | Datos | 🟡 | Cifras de negocio hardcodeadas |
| [P-23](#p-23) | Seguridad | 🟡 | Ausencia de protección CSRF |
| [P-24](#p-24) | Seguridad | 🟡 | `sessionCache` sin expulsión |
| [P-25](#p-25) | API | ⚪ | Convenciones de respuesta inconsistentes |
| [P-26](#p-26) | API | ⚪ | Sin manejador de errores JSON |
| [P-27](#p-27) | Base de datos | ⚪ | Falta de índices para consultas por tenant |
| [P-28](#p-28) | Base de datos | ⚪ | El trigger de stock nunca se aplicó |
| [P-29](#p-29) | Seguridad | ⚪ | PII en el historial del repositorio |
| [P-30](#p-30) | API | ⚪ | Restricciones de la base de datos en la capa HTTP |

---

## Bloqueantes

### P-01
{: #p-01 }

**El arranque en producción falla**

| | |
|---|---|
| **Prioridad** | 🔴 Bloqueante |
| **Ubicación** | `server.ts:6603`, `server.ts:6613` |
| **Categoría** | Build / despliegue |

**Síntoma.** Con `NODE_ENV=production`, el proceso muere al arrancar con:

```
PathError: Missing parameter name at index 1: *
```

**Causa.** Express 5.3.0 usa `path-to-regexp` 8, que exige que el comodín tenga nombre. La
sintaxis `'*'` de Express 4 fue eliminada. Además, `startServer()` se invoca sin `.catch()`,
así que la excepción se convierte en una promesa rechazada sin manejar y el proceso termina.

Verificado contra el `path-to-regexp@8.4.2` instalado en `node_modules`.

**Corrección.**

```ts
// server.ts:6603
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});
```

```ts
// server.ts:6613
startServer().catch((error) => {
  console.error('[Frenyer] No se pudo iniciar el servidor:', error);
  process.exit(1);
});
```

**Verificación.** `NODE_ENV=production node server.ts` → "Servidor bimonetario activo en
http://0.0.0.0:3000" y `curl http://localhost:3000/dashboard` devuelve `index.html`.

---

### P-02
{: #p-02 }

**Los datos no se persisten: 10 módulos usan el cliente Supabase inerte del navegador**

| | |
|---|---|
| **Prioridad** | 🔴 Bloqueante |
| **Ubicación** | `src/lib/supabase/db.ts:1`, `src/lib/supabase/client.ts:13` |
| **Categoría** | Datos / persistencia |

**Síntoma.** Las ventas del POS, el correlativo de facturas, el CRUD de cuentas bancarias, la
conversión de cotizaciones y los reportes de ventas **no guardan ni muestran datos** cuando la
base de datos está conectada. Las páginas quedan vacías sin error visible.

**Causa.** `db.ts:1` importa `hasBrowserSupabaseClient as isSupabaseConfigured`, y ese valor es
una **constante `false`** (`client.ts:13`):

```ts
// client.ts:13
export const hasBrowserSupabaseClient = false;
```

La variable mutable `isSupabaseConfigured` que exporta `client.ts:16` es **otro binding
distinto** que `db.ts` nunca lee. Por tanto, todos los bloques `if (isSupabaseConfigured) { … }`
de `db.ts` están **muertos**, y las llamadas sin condición al cliente inerte fallan con
"invalid JWT".

**Módulos afectados (llamadas sin condición):**

| Módulo | Llamada |
|---|---|
| `db.ts:1022` | `recordSaleInSupabase` — **todo el camino de emisión del POS** |
| `db.ts` | `getNextInvoiceCorrelative` |
| `db.ts` | CRUD de `bank_accounts` (fetch/create/update/delete) |
| `db.ts` | `convertQuoteToInvoiceInSupabase` |
| `SalesReport.tsx` | `exchange_rates`, `customers`, `bank_accounts`, `payments`, `sales`, `sale_items` |
| `AccountsReport.tsx` | `bank_accounts`, `customers`, `sales`, `payments` |
| `SaleDetailPage.tsx` | `sales`, `customers`, `sale_items`, `payments` |
| `ProfitLoss.tsx` | `exchange_rates`, `sales`, `expenses` |
| `CompanyHealth.tsx` | `supabase` + `authenticatedFetch` |
| `Customers.tsx:113,164` | `supabase.from('sales')`, `from('sale_items')` |
| `Movements.tsx:54` | import directo de `supabase` |

**Corrección.** Dos opciones, en orden de preferencia:

1. **Migrar al patrón servidor** (preferido): exponer los endpoints que faltan
   (`POST /api/sales`, `GET /api/sale-items` ya existe, `GET /api/exchange-rates`,
   `GET /api/bank-accounts` ya existe) y reescribir los módulos para usar `db.ts` sobre
   `/api/*`.
2. **Habilitar el cliente del navegador** con un token de sesión de corta duración. Menos
   recomendable: contradice el principio de "Supabase solo en el servidor" y reintroduce la
   superficie de credenciales en el bundle.

**Verificación.** Emitir una venta en el POS y comprobar que aparece en `GET /api/sales`.

---

### P-03
{: #p-03 }

**Seis endpoints públicos por error**

| | |
|---|---|
| **Prioridad** | 🔴 Bloqueante |
| **Ubicación** | `server.ts:480-482`, `server.ts:4390`, `server.ts:4562`, `server.ts:1484`, `server.ts:1651`, `server.ts:3196`, `server.ts:3222` |
| **Categoría** | Seguridad |

**Síntoma.** Un visitante anónimo puede crear usuarios del ERP, desactivar cuentas, leer el
kárdex de inventario, escribir ajustes de stock y volcar las cuentas bancarias.

**Detalle.**

| # | Endpoint | Problema | Impacto |
|---|---|---|---|
| 1 | `POST /api/users` (`:4390`) | El guard de `:481` cubre `GET, PUT, PATCH, DELETE` — **no** `POST` | Crear usuarios del ERP; con `password` ⇒ crear usuarios en Supabase Auth (`auth.signUp`, `:4425`) |
| 2 | `POST /api/users/:id/toggle-status` (`:4562`) | Ídem | Desactivar cuentas de usuario |
| 3 | `GET /api/inventory/movements` (`:1484`) | Prefijo no listado en `:458-476` | Leer el kárdex de cualquier tenant |
| 4 | `POST /api/inventory/adjustments` (`:1651`) | Ídem | **Escribir stock** en el tenant por defecto `00000000-…-0001` |
| 5 | `GET /api/debug/bank-movements-check` (`:3196`) | Sin protección | Volcar todos los movimientos y cuentas bancarias |
| 6 | `GET /api/debug/accounts-list` (`:3222`) | Sin protección | Volcar id y nombre de todas las cuentas bancarias |

Además, el guard de `/api/inventory-movements` (`:482`) está **muerto**: no existe ninguna ruta
con ese prefijo.

**Corrección.**

```ts
// server.ts:481 → incluir POST
app.use('/api/users', requireAuthForMethods(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']));

// server.ts:458-476 → añadir el prefijo real
  '/api/inventory',

// server.ts:3196, 3222 → proteger o eliminar las rutas de diagnóstico
app.use('/api/debug', authenticateSupabaseRequest);
```

**Verificación.** `curl -X POST http://localhost:3000/api/users` sin cookie ⇒ **401**.

---

### P-04
{: #p-04 }

**13 tablas sin aislamiento de tenant**

| | |
|---|---|
| **Prioridad** | 🔴 Bloqueante |
| **Ubicación** | `supabase/migrations/0015`, `0016_fix`, `0016_expenses`, `0017`, `0018`, `0019` |
| **Categoría** | Seguridad / datos |

**Síntoma.** Un cliente anónimo puede leer y escribir datos de **cualquier** organización:
sedes, proveedores, cuentas por cobrar y por pagar, compras, gastos, inventario y pedidos.

**Causa.** La migración `0009_lock_down_api_rls.sql` estableció el modelo correcto (lectura
org-scoped, escritura restringida por rol, `anon` sin acceso). Migraciones posteriores
reintrodujeron políticas `allow_all_*` con `USING (true)` + `GRANT ALL` a `anon`.

**Tablas afectadas:** `branches`, `suppliers`, `accounts_payable`, `accounts_receivable`,
`receivable_payments`, `purchases`, `purchase_items`, `inventory_movements`, `expenses`,
`expense_categories`, `expense_payments`, `orders`, `order_items`.

**Agravante.** En PostgreSQL las políticas permisivas se combinan con **OR**. Para
`accounts_payable` y `receivable_payments` coexiste `allow_all_*` con las `authenticated_*`, por
lo que las políticas org-scoped quedan **inertes**.

**Por qué existe el problema.** El servidor consulta PostgREST con la anon key cuando no hay
sesión (`server.ts:1196, 1218, 1367, 1400, 1425, 1874, 2269, 3198, 3224, 4075, 4267, 4315,
5439, 5835, 6033, 6205`). Esas peticiones solo funcionan donde hay `USING (true)` — exactamente
el conjunto que perdió el aislamiento. **Las políticas permisivas son lo que hace funcionar la
tienda pública, y a la vez exponen datos de tenants.**

**Corrección.** Para cada tabla, `DROP POLICY` de la permisiva y dejar la política org-scoped
del patrón de `0009`. Para las tablas sin `organization_id` (`sale_items`, `payments`,
`receivable_payments`, `payable_payments`, `purchase_items`, `order_items`), usar el patrón
`EXISTS` sobre la fila padre (ya aplicado en `0009` para `sale_items`, `payments` y
`payable_payments`).

**Verificación.**

```sql
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
ORDER BY tablename;
```

El resultado debe estar vacío (salvo las políticas de lectura de `orders`/`order_items`, que
deben reescribirse con un predicado de organización o restricting el rol a `authenticated`).

---

## Altos

### P-05
{: #p-05 }

**Codificación mojibake en 130+ líneas**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `server.ts` (61 ocurrencias), `README.md`, `metadata.json`, `index.html` |
| **Categoría** | Calidad / UX |

**Síntoma.** Todos los mensajes de error con acentos se muestran corruptos en pantalla:
`"SesiÃ³n requerida"`, `"ExtracciÃ³n directa portal oficial BCV"`, `"OperaciÃ³n restringida"`.

**Causa.** Los archivos están guardados con bytes UTF-8 reinterpretados como Windows-1252.
Verificado: `server.ts` contiene **61** ocurrencias del patrón `Ã³` y **cero** apariciones de
`ó` correctamente codificada.

**Corrección.** Reinterpretar como UTF-8 y volver a guardar en UTF-8.

```bash
# Linux / macOS
for f in server.ts README.md metadata.json index.html; do
  iconv -f utf-8 -t latin1 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
```

```powershell
# PowerShell (Windows)
$files = @('server.ts','README.md','metadata.json','index.html')
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f)
  $latin1 = [System.Text.Encoding]::GetEncoding(28591)
  $utf8 = [System.Text.Encoding]::UTF8
  [System.IO.File]::WriteAllBytes($f, $utf8.GetBytes($latin1.GetString($bytes)))
}
```

> ⚠ Revisa el diff: si el archivo ya estaba bien codificado, el script lo **empeoraría**.
> Haz una prueba en una copia antes de aplicar.

**Verificación.** `Select-String -Path server.ts -Pattern 'ó'` devuelve coincidencias y
`Select-String -Path server.ts -Pattern 'Ã³'` no devuelve ninguna.

---

### P-06
{: #p-06 }

**La tasa BCV manual nunca se aplica**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `server.ts:774-848` (POST), `server.ts:519-523` (cálculo) |
| **Categoría** | Finanzas |

**Síntoma.** El usuario fija una tasa manual (por ejemplo 950,00) y el sistema la muestra en la
cabecera, pero **las ventas y los cálculos VES siguen usando la tasa anterior**.

**Causa.** El POST construye `certifiedRate` y la persiste en `exchange_rates`, pero **nunca
asigna `lastCertifiedRate = certifiedRate`**. `calculateTransactionVES` sigue leyendo
`lastCertifiedRate.appliedRate`.

**Corrección.**

```ts
// server.ts, tras persistir la tasa manual
lastCertifiedRate = {
  usdRate: rate,
  currentRate: isFuture ? previousRate : rate,
  futureRate: isFuture ? rate : null,
  appliedRate: rate,
  eurRate: round(rate * 1.08, 4),
  valueDate,
  isFutureRate: isFuture,
  source: 'MANUAL',
  sourceDetails: 'Tasa manual certified',
  checkedAt: new Date().toISOString(),
};
```

**Verificación.** Fijar una tasa manual, emitir una venta y comprobar que `total_ves` usa la
tasa nueva.

---

### P-07
{: #p-07 }

**Tres vocabularios de rol incompatibles**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `0021:39-40` (CHECK), `0001:4` (membresía), `0009:74-78` / `0012:3-14` (writer), `server.ts:424-425`, `server.ts:778` |
| **Categoría** | Seguridad / autorización |

**Síntoma.** Un usuario con rol `administrador` (el valor canónico) **no puede** fijar la tasa
BCV manual. Un miembro sin fila de membresía **obtiene `admin`** de la organización por defecto.

**Los tres sistemas:**

| Sistema | Valores | ¿Se usa para autorizar? |
|---|---|---|
| `profiles.role` | `gerente`, `administrador`, `cajero`, `cliente` (CHECK estricto) | No directamente |
| `organization_members.role` | Texto libre, default `'viewer'` | **Sí** — es la fuente del rol del servidor |
| `is_org_writer` | Lista en `0009:74-78`, **anulada por `0012:3-14`** | No (cualquier miembro escribe) |

**Causa raíz.** `server.ts:424-425` usa `membership?.role || 'admin'`, así que la ausencia de
membresía concede admin. Y la lista de roles de la tasa manual (`server.ts:778`) omite
`administrador`, que es el valor que produce `toProfileRole()`.

**Corrección.**

1. Fuente única de rol: `organization_members.role` (o unificar con `profiles.role`).
2. `server.ts:424-425`: sin membresía ⇒ **denegar** (`401`/`403`), nunca `admin`.
3. `server.ts:778`: añadir `administrador` a la lista, o derivar la lista de una constante
   compartida con `toProfileRole()`.
4. `0021:26` (el trigger `0010:26` escribe `'admin'`) ⇒ usar `'administrador'`.
5. Restaurar la lista de roles en `is_org_writer` (o documentar explícitamente que cualquier
   miembro escribe).

---

### P-08
{: #p-08 }

**`x-forwarded-for` se confía a ciegas**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `server.ts:198-204` |
| **Categoría** | Seguridad |

**Síntoma.** Un cliente puede evadir el límite de intentos de login (5 / 15 min) enviando una
cabecera `X-Forwarded-For` distinta en cada petición.

**Causa.** `getClientIp` toma el primer valor de `x-forwarded-for` sin validar el proxy, y
`app.set('trust proxy', …)` **no está configurado**.

**Corrección.**

```ts
// server.ts, tras crear la app
app.set('trust proxy', 1); // o el número de proxies reales del entorno
```

Y validar que el valor de `x-forwarded-for` provenga de un proxy de confianza.

---

### P-09
{: #p-09 }

**La cadena de migraciones no se aplica desde cero**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `supabase/migrations/` |
| **Categoría** | Base de datos / despliegue |

**Síntoma.** Un entorno nuevo no se puede construir con la cadena de migraciones: varios
scripts fallan.

**Errores conocidos:**

| Script | Error | Causa |
|---|---|---|
| `0003:9` | `column "currency" does not exist` | `0002:16` re-declara `organizations` con `create table if not exists` ⇒ no-op |
| `0002:75` | `column "doc_number" does not exist` | `idx_customers_doc` sobre una columna ausente |
| `0011:89`, `0011:248` | `column "rate_source" does not exist` | Los RPCs de cotizaciones insertan 3 columnas no declaradas |
| `0013:257` | `column "cost_usd" does not exist` | `record_internal_purchase` usa `products.cost_usd` |
| `workspace/0019:58` | `column "cost_usd" does not exist` | El trigger de stock |

**Corrección.** Volcar el esquema real de la base viva y convertirlo en una migración canónica:

```bash
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://<user>:<pass>@db.<ref>.supabase.co:5432/postgres" > schema_canonico.sql
```

Luego dividirlo en migraciones aditivas y numeradas. Detalle en
[DATABASE.md §5](../architecture/DATABASE.md#5-deriva-entre-la-base-viva-y-las-migraciones-🔴).

---

### P-10
{: #p-10 }

**Cero pruebas y ESLint sin reglas**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `eslint.config.js`, `package.json:11-12` |
| **Categoría** | Calidad |

**Síntoma.** `npm run test` no ejecuta nada. `npm run lint` siempre pasa. `npm run test:e2e`
falla por falta de configuración. Ninguna comprobación automática detecta una regresión.

**Estado real:**

| Comprobación | Configuración | Tests | Estado |
|---|---|---|---|
| `npm run lint` | `eslint.config.js` solo tiene `{ ignores: ['dist','node_modules'] }` | — | **Nunca detecta nada** |
| `npm run test` | Sin sección `test` en `vite.config.ts` | 0 archivos | **No ejecuta nada** |
| `npm run test:e2e` | Sin `playwright.config.ts` | 0 archivos | **Falla** |

**Corrección.**

1. ESLint: añadir el plugin de React Hooks y las reglas recomendadas de TypeScript.
2. Vitest: añadir `test: { environment: 'jsdom', globals: true }` a `vite.config.ts`.
3. Empezar por los cálculos bimonetarios: `src/lib/currency.ts` es puro y tiene 9 funciones
   얼마 — candidato ideal a pruebas unitarias.

---

### P-11
{: #p-11 }

**CORS incompatible con la autenticación por cookie**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `server.ts:19` |
| **Categoría** | Seguridad / API |

**Síntoma.** `app.use(cors())` envía `Access-Control-Allow-Origin: *` **sin**
`credentials: true`. Los navegadores rechazan el envío de cookies en peticiones
cross-origin credentialed. Hoy no molesta (el SPA es same-origin), pero impide consumir la API
desde otro origen con la sesión.

**Corrección.**

```ts
app.use(cors({
  origin: ['http://localhost:3000', 'https://<tu-dominio>'],
  credentials: true,
}));
```

---

### P-12
{: #p-12 }

**Restricciones FK que bloquean operaciones legítimas**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `0001:6`, `0002:191`, `0008:15` |
| **Categoría** | Base de datos |

| Restricción | Problema | Efecto |
|---|---|---|
| `products.branch_id` | **NO ACTION** (no `SET NULL`): `0001:6` la creó sin `ON DELETE`; `0015:31` la re-declara con `SET NULL` pero es no-op | **Eliminar una sede con productos falla** |
| `accounts_receivable.customer_id` | **NOT NULL + ON DELETE CASCADE**; `0016_fix:87` intentaría relajarlo (no-op) | No se puede desvincular una CxC de su cliente sin borrarla |
| `accounts_payable.supplier_id` | **ON DELETE RESTRICT** (`0008:15`); `0016_fix:66` intentaría `SET NULL` (no-op) | **Un proveedor con CxP no se puede eliminar**; la app lo esquiva descartando el `supplier_id` (`server.ts:5947`) |

**Corrección.**

```sql
alter table public.products
  drop constraint if exists products_branch_id_fkey,
  add constraint products_branch_id_fkey foreign key (branch_id)
    references public.branches(id) on delete set null;

alter table public.accounts_payable
  drop constraint if exists accounts_payable_supplier_id_fkey,
  add constraint accounts_payable_supplier_id_fkey foreign key (supplier_id)
    references public.suppliers(id) on delete set null;
```

> ⚠ Antes de aplicar, comprobar que no hay filas con `supplier_id` huérfanas.

---

### P-13
{: #p-13 }

**Estados de pago con género inconsistente**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `0008:275`, `0008:169-171` vs `server.ts`, `Dashboard.tsx:172`, `CompanyHealth.tsx:175,182` |
| **Categoría** | Datos |

**Síntoma.** El panel y el reporte de salud del negocio muestran saldos pendientes que ya
están pagados.

**Causa.** Los RPCs escriben `PAGADA` (femenino) mientras el servidor y la UI usan `PAGADO`
(masculino). Los filtros `status = 'PAGADO'` **no encuentran** las filas `PAGADA`.

**Corrección.** Estandarizar en `PAGADO` (masculino, coherente con `expenses.status`) y
migrar los datos existentes:

```sql
update public.accounts_payable   set status = 'PAGADO' where status = 'PAGADA';
update public.accounts_receivable set status = 'PAGADO' where status = 'PAGADA';
```

---

### P-14
{: #p-14 }

**Duplicidad de la numeración `0016`**

| | |
|---|---|
| **Prioridad** | 🟠 Alto |
| **Ubicación** | `supabase/migrations/0016_expenses_module.sql`, `0016_fix_suppliers_payables_purchases.sql` |
| **Categoría** | Base de datos / tooling |

**Síntoma.** `supabase db push` salto una de las dos migraciones, o exige
`supabase migration repair`.

**Causa.** La CLI deriva la versión del prefijo numérico: ambas mapean a la versión `16`.

**Corrección.** Renumerar `0016_fix_suppliers_payables_purchases.sql` a `0017` (y renumerar en
cascada `0017`→`0018`, … `0022`→`0023`) **antes** de alimentar la carpeta a la CLI. Como las
migraciones se aplican a mano, el renumerado es seguro ahora.

---

## Medios

### P-15
{: #p-15 }

**El kárdex fusiona 4 fuentes ⇒ filas duplicadas**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `server.ts:1530-1645` |
| **Categoría** | Inventario |

`GET /api/inventory/movements` fusiona `inventory_movements` + ajustes locales + filas sintéticas
`VENTA` de ventas + filas sintéticas `COMPRA` de compras, deduplicando solo por
`doc_number-sku`. La misma operación presente en dos fuentes aparece dos veces.

**Corrección.** Deduplicar por un identificador compuesto más fuerte
(`doc_number` + `sku` + `movement_type` + `created_at`) o descartar la fuente sintética cuando
existe la fila real.

---

### P-16
{: #p-16 }

**El correlativo de factura no es atómico**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `0011:79-83`, `0011:196-200` |
| **Categoría** | Datos |

Los RPCs calculan `max(int(doc_number))+1` **sin bloqueo de fila**, y no hay índice único en
`(organization_id, doc_number)`. Dos emisiones concurrentes pueden obtener el mismo número.

Además, `doc_number` es un entero con ceros a la izquierda ⇒ `nullif(doc_number,'')::int`
**lanza excepción** ante cualquier número no numérico (y `max()` ignora los `NULL`, así que la
primera fila no numérica rompe el correlativo).

**Corrección.** Usar una secuencia por organización, o `SELECT ... FOR UPDATE` sobre la última
fila. Añadir índice único parcial:

```sql
create unique index if not exists idx_sales_org_doc_number_unique
  on public.sales (organization_id, doc_number)
  where doc_number is not null and trim(doc_number) <> '';
```

---

### P-17
{: #p-17 }

**Utilidades de Tailwind sin efecto**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `AuthCallback.tsx:53-71`, `SaleDetailModal.tsx:267-482`, `ProtectedRoute.tsx:20`, `LoginPage.tsx:173-387`, `Suppliers.tsx:586`, `SalesKPIs.tsx:16`, `SalesTransactionsTable.tsx:36` |
| **Categoría** | UI |

**Síntoma.** La página de callback de autenticación y el modal de detalle de venta se renderizan
**como bloques de texto sin estilo**.

**Causa.** No hay Tailwind en el proyecto (ni `tailwind.config.*`, ni `postcss.config.*`, ni la
dependencia). Esas clases no existen.

**Corrección.** Reescribir esas pantallas con las clases semánticas de `globals.css`. Es un
trabajo de ~2 pantallas; conviene hacerlo antes de que se acumulen más.

---

### P-18
{: #p-18 }

**Spinners estáticos**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | 14 sitios con `animate-spin` |
| **Categoría** | UI |

`className="animate-spin"` aparece en `NewPurchaseModal:1438`, `Config:1837`, `Movements:1765`,
`InternalPurchases:427`, `Inventory:1818`, `DailyInventoryReport:1170`, `Quotes:1282,2610`,
`SaleDetailPage:284`, `Sales:2854,3457`, `BankAccounts:1895,1975,2052`, `Expenses:1642,1921`.
**`globals.css` no contiene ningún `@keyframes`** ⇒ todos los spinners son iconos congelados.
`Orders.tsx:559` usa una clase `spin` que tampoco existe.

**Corrección.** Añadir el `@keyframes spin` a `globals.css`:

```css
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.animate-spin { animation: spin 1s linear infinite; }
```

---

### P-19
{: #p-19 }

**Dos generaciones de `.auth-*` en conflicto**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `globals.css:159-405` (familia "panel") y `globals.css:1095-1440` (familia "card") |
| **Categoría** | UI |

`.auth-page`, `.auth-form`, `.auth-field`, `.auth-subtitle` y `.auth-footer` están **definidos
dos veces**; la segunda definición gana y ambas tienen layouts distintos (grid vs. flex, inputs
de 42 px vs. 48 px, `.auth-input` vs. `.auth-input-wrap`). `LoginPage` **mezcla las dos**:
usa `.auth-input-wrap` (familia A) y `.auth-input-icon` (familia B) en los mismos inputs
(`LoginPage.tsx:230, 246, 310, 326, 341, 369`).

**Corrección.** Unificar en una sola familia y migrar las pantallas que usen la otra.

---

### P-20
{: #p-20 }

**Doble persistencia Supabase + localStorage**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `src/lib/supabase/db.ts` |
| **Categoría** | Datos |

Casi todas las entidades se escriben en Supabase **y** se reflejan en `localStorage`
(`frenyer_local_*`). `fetchSuppliersFromSupabase` (`:294-391`) fusiona tres fuentes con una
clave canónica de documento/nombre; `fetchQuotesFromSupabase` une filas de la base con filas
locales; `fetchInventoryMovementsFromSupabase` **reconstruye** el kárdex desde `sales` +
`purchases` cuando `inventory_movements` está vacía.

`getActiveOrgId()` termina con el UUID de demostración
`00000000-0000-0000-0000-000000000001` (`db.ts:652`) ⇒ una organización equivocada se usa en
silencio en vez de fallar.

**Corrección.** Definir el `localStorage` como caché de solo lectura (no como segunda fuente de
verdad) y eliminar los espejos de escritura.

---

### P-21
{: #p-21 }

**Código muerto y dependencias sin uso**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Categoría** | Calidad |

| Elemento | Ubicación | Nota |
|---|---|---|
| `Kpi` | `src/components/data-display/Kpi.tsx` | Sin importadores |
| `SalesKPIs`, `SalesCharts`, `SalesFilters`, `SalesTransactionsTable` | `src/modules/sales/components/` | Sin importadores |
| `react-redux`, `redux`, `reselect` | `package.json:18,30,32,33` | 0 coincidencias en `src/` |
| `@tanstack/react-query` | `package.json:16` | 0 coincidencias en `src/` |
| `zod`, `react-hook-form` | `package.json:36,19` | 0 coincidencias en `src/` |
| `getSupabaseAdminClient()` | `server.ts:180-185` | Definido, nunca invocado |
| `src/lib/supabase/api.ts` | — | 12 líneas, una sola función |
| `.store-*` (~40 clases) | `globals.css:551-1093` | `ShopPage` usa su propio CSS `cr-*` en línea |
| `.alma-chat`, `.bubble`, `.assistant`… | `globals.css` | CSS de un chat que no está implementado |
| `src/modules/finance/pages/Cash.tsx`, `Finance.tsx`, `Marketing.tsx` | — | Stubs de 18 líneas sin enlace en el menú |

**Corrección.** Eliminar lo muerto o marcarlo claramente. `redux` + `react-query` juntos son
además una decisión de arquitectura contradictoria: elegir uno.

---

### P-22
{: #p-22 }

**Cifras de negocio hardcodeadas**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `Dashboard.tsx:121`, `ProfitLoss.tsx:103`, `AccountsPayable.tsx:99`, `Expenses.tsx:53`, `Sales.tsx:1135`, `DashboardLayout.tsx:362`, `InternalPurchases.tsx:73`, `NewPurchaseModal.tsx:73` |
| **Categoría** | Datos / producto |

| Valor | Ubicación | Problema |
|---|---|---|
| **45 %** de costo de ventas | `Dashboard.tsx:121` | Se usa cuando faltan los ítems de la venta ⇒ infla la utilidad |
| **55 %** de costo de ventas | `ProfitLoss.tsx:103` | Constante, no derivada de los datos reales |
| `MOCK_PAYABLES` | `AccountsPayable.tsx:99` | Array de proveedores y facturas de muestra en producción |
| `36.5` como tasa inicial | `Expenses.tsx:53` | Valor obsoleto antes de la carga asíncrona |
| `"CAJA ABIERTA (#77138)"` | `Sales.tsx:1135` | Etiqueta fija |
| `"Sucursal Principal"` | `DashboardLayout.tsx:362` | Texto fijo en vez de selector de sede |
| `"Tienda Bella Vista (SP-01)"` | `InternalPurchases.tsx:73`, `NewPurchaseModal.tsx:73` | Sede de ejemplo como default, mientras `db.ts:2768-2769` **filtra esa misma sede heredada** |

**Corrección.** Derivar de los datos; cuando no exista, mostrar "—" en vez de un número
inventado. Eliminar `MOCK_PAYABLES` tras la primera carga real.

---

### P-23
{: #p-23 }

**Ausencia de protección CSRF**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `server.ts` (middleware global) |
| **Categoría** | Seguridad |

Los endpoints mutantes usan la cookie de sesión sin token CSRF. La mitigación actual es
`sameSite: 'strict'` en `frenyer_session`; la cookie PKCE usa `sameSite: 'lax'` (necesario
para el retorno de Google).

**Corrección.** Token CSRF de doble envío: un valor en cookie legible + cabecera
`X-CSRF-Token`, verificado en el servidor para los métodos mutantes.

---

### P-24
{: #p-24 }

**`sessionCache` sin expulsión**

| | |
|---|---|
| **Prioridad** | 🟡 Medio |
| **Ubicación** | `server.ts:6101` |
| **Categoría** | Seguridad / rendimiento |

`Map` en memoria indexado por el JWT crudo, sin límite ni expulsión de entradas ⇒ fuga de
memoria lenta a lo largo de muchas sesiones. El TTL es `min(exp del token, ahora + 5 min)`, lo
que evita la caducidad funcional, pero no la acumulación.

**Corrección.** Barrido periódico de las entradas expiradas, o un `Map` con límite de tamaño
(LRU).

---

## Bajos

### P-25
{: #p-25 }

**Convenciones de respuesta inconsistentes**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo |
| **Ubicación** | Múltiples rutas de `server.ts` |
| **Categoría** | API |

Algunas rutas responden `{ success: false }` con **HTTP 200** (productos, gastos, clientes,
proveedores); otras usan 4xx/5xx reales (auth, pedidos, tasas). `POST /api/products` devuelve
**200 con `success: false`** ante un insert fallido.

**Corrección.** Estandarizar: `4xx` para errores del cliente, `5xx` para errores del servidor,
siempre con `{ success: false, error }`.

### P-26
{: #p-26 }

**Sin manejador de errores JSON**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo |
| **Ubicación** | `server.ts` (final de la cadena de middlewares) |
| **Categoría** | API |

Una excepción en una ruta devuelve la **página HTML** por defecto de Express. El cliente espera
JSON y rompe.

**Corrección.**

```ts
app.use((err, _req, res, _next) => {
  console.error('[Frenyer] Error no controlado:', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});
```

### P-27
{: #p-27 }

**Falta de índices para consultas por tenant**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo |
| **Ubicación** | `0002`, `0004`, `0005` |
| **Categoría** | Base de datos / rendimiento |

`payment_methods` y `bank_accounts` no tienen índice sobre `organization_id`.
`bank_movements` **no tiene ningún índice**. `accounts_receivable` tampoco.

**Corrección.**

```sql
create index if not exists idx_bank_accounts_org on public.bank_accounts (organization_id);
create index if not exists idx_payment_methods_org on public.payment_methods (organization_id);
create index if not exists idx_bank_movements_org on public.bank_movements (organization_id);
create index if not exists idx_accounts_receivable_org on public.accounts_receivable (organization_id);
```

### P-28
{: #p-28 }

**El trigger de descuento de stock nunca se aplicó**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo |
| **Ubicación** | `workspace/supabase/migrations/0019_auto_deduct_inventory_stock.sql` |
| **Categoría** | Base de datos / inventario |

El archivo está **fuera** de `supabase/migrations/`, así que ninguna herramienta lo aplica. El
descuento automático de stock y la escritura del kárdex por trigger están **apagados**.
Además, el trigger busca `products` por `sku` **sin** filtrar por organización ⇒ riesgo de
stock cruzado entre tenants.

**Corrección.** Mover el archivo a `supabase/migrations/` con numeración libre, añadir el
predicado `organization_id` al `UPDATE` de `products`, y aplicarlo.

### P-29
{: #p-29 }

**PII en el historial del repositorio**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo (pero revela datos personales) |
| **Ubicación** | Historial de Git |
| **Categoría** | Seguridad / privacidad |

`data/` (correos, teléfonos y direcciones de clientes) **se versionó** en commits anteriores.
Se retiró del árbol en `2482998`, pero **sigue en el historial del repositorio público**.

**Corrección.** Reescribir el historial (`git filter-repo`) y hacer force-push, o usar
`BFG`. Antes, comprobar el alcance:

```bash
git log --stat -- data/
```

### P-30
{: #p-30 }

**Restricciones de la base de datos en la capa HTTP**

| | |
|---|---|
| **Prioridad** | ⚪ Bajo |
| **Ubicación** | `server.ts:1234`, `server.ts:1296`, `server.ts:3859`, `server.ts:4679` |
| **Categoría** | API / robustez |

Cuando una columna no existe en Supabase, el servidor reintenta hasta 6 veces **descartando la
columna offended** (`Could not find the '<col>' column of 'products'`). Esto absorbe la deriva
de esquema en tiempo de ejecución en vez de fallar de forma visible.

Es una red de seguridad útil, pero enmascara el problema: un `POST /api/products` puede
persistir **menos campos de los esperados** sin avisar.

**Corrección.** Mantener el reintento, pero **registrar en el log del servidor** qué columnas se
descartaron, y exponer un aviso en `/api/supabase/status` (`missingTables` ya existe como
mecanismo equivalente para tablas).

---

## Resumen por archivo

| Archivo | Problemas abiertos |
|---|---|
| `server.ts` | P-01, P-03, P-05, P-06, P-07, P-08, P-11, P-23, P-24, P-25, P-26, P-30 |
| `src/lib/supabase/db.ts` | P-02, P-20, P-21 |
| `src/lib/supabase/client.ts` | P-02 |
| `src/styles/globals.css` | P-17, P-18, P-19, P-21 |
| `supabase/migrations/` | P-04, P-09, P-12, P-13, P-14, P-16, P-27, P-28 |
| `package.json` / `eslint.config.js` | P-10, P-21 |
| Varios módulos | P-15, P-17, P-22 |

---

## Orden de ataque sugerido

**Iteración 1 — Desbloquear (1 día)**
P-01 (arranque en producción) · P-05 (mojibake) · P-06 (tasa manual) · P-22 (cifras inventadas)

**Iteración 2 — Cerrar la superficie (2-3 días)**
P-03 (endpoints públicos) · P-08 (IP spoofing) · P-11 (CORS) · P-26 (errores JSON) ·
P-25 (convenciones de respuesta)

**Iteración 3 — Aislar los datos (3-5 días)**
P-04 (13 tablas) · P-12 (FKs) · P-13 (estados) · P-16 (correlativos) · P-27 (índices)

**Iteración 4 — Persistencia correcta (1 semana)**
P-02 (migrar los 10 módulos al servidor) · P-20 (eliminar la doble persistencia)

**Iteración 5 — Calidad (continuo)**
P-10 (tests + ESLint) · P-07 (roles unificados) · P-17/P-18/P-19 (UI) · P-21 (código muerto) ·
P-09/P-14 (migraciones canónicas) · P-15 (kárdex) · P-23/P-24 (CSRF, caché)
