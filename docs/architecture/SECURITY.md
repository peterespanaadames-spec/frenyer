# Seguridad — Frenyer ERP

> Auditoría del modelo de seguridad tal como está implementado, no como está diseñado.
> Verificado contra `server.ts`, `src/context/AuthContext.tsx`, `src/lib/supabase/` y
> `supabase/migrations/` en la revisión de octubre 2026.

---

## 1. Resumen del modelo

Frenyer aplica una defensa en cuatro capas:

```
Capa 1  Credenciales      Las claves de Supabase NUNCA llegan al navegador.
Capa 2  Autenticación     Cookie httpOnly + sesión firmada (HMAC-SHA256) en modo local.
Capa 3  Autorización      Middleware de servidor por prefijo + RLS de PostgreSQL.
Capa 4  Aislamiento       organization_id por tabla; políticas de RLS por organización.
```

**Estado de cada capa:**

| Capa | Estado | Nota |
|---|---|---|
| 1 · Credenciales | 🟡 Parcial | Correcta en el servidor; 10 módulos del cliente aún usan el cliente Supabase inerte |
| 2 · Autenticación | 🟢 Sólida | PKCE, cookies httpOnly, comparación en tiempo constante, rate limit |
| 3 · Autorización | 🔴 **Con huecos** | 6 Prefijos y 2 endpoints públicos por error |
| 4 · Aislamiento | 🔴 **13 tablas abiertas** | El lockdown de `0009` fue revertido a medias por migraciones posteriores |

---

## 2. Capa 1 — Credenciales

### 2.1 Principio

> El navegador **nunca** recibe una clave de Supabase.

El cliente del navegador se crea deliberadamente **inerte**
(`src/lib/supabase/client.ts:38-44`):

```ts
createClient(url, 'sin-credencial-en-el-navegador', {
  persistSession: false, autoRefreshToken: false, detectSessionInUrl: false
});
```

Y `hasBrowserSupabaseClient` es una constante `false` (`client.ts:13`).

### 2.2 Resolución en el servidor

El servidor resuelve URL y claves en este orden (gana el primer valor **válido**):

| # | Origen | Variables |
|---|---|---|
| 1 | `data/supabase-credentials.json` (gitignored) | `.url`, `.anonKey`, `.serviceRoleKey` |
| 2 | `process.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 3 | `.env.local` | Mismas, **sin** prefijo `VITE_` |
| 4 | `loadedEnv` (Vite `loadEnv` con prefijo vacío) | Mismas |
| 5 | Legado | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — deprecadas |
| 6 | Constante `server.ts:74` | `https://knyqrwpaksawuxoqcayu.supabase.co` |

Validadores: `isRealSupabaseUrl` (`server.ts:26-34`) rechaza `your-project` y `example.com`;
`isRealSupabaseKey` (`server.ts:36-45`) rechaza `your-supabase` y `configure_supabase`.

El origen ganador se expone en `/api/auth/mode` como `credentialsSource` — **sin claves**.

### 2.3 Prohibiciones

> 🚫 **Nunca usar el prefijo `VITE_` para credenciales.** Vite las inyecta en el bundle del
> navegador. La única excepción es `VITE_TURNSTILE_SITE_KEY`, que es pública por diseño
> (clave de sitio de Cloudflare Turnstile).

> 🚫 **Nunca reintroducir `https://your-project.supabase.co`.** Rompe el OAuth de Google
> (redirige a un host inexistente) y falsea `/api/supabase/status`.
> La URL real es `https://knyqrwpaksawuxoqcayu.supabase.co`.

> 🔴 La lista de `tenantScopedTables` (`server.ts:377-395`) **no incluye** `sale_items`,
> `payments`, `receivable_payments`, `payable_payments`, `orders`, `order_items`, `shop_*`,
> `audit_logs` ni `organization_members`. Es más estrecha que el aislamiento de base de datos,
> que a su vez está roto en 13 tablas (ver §5).

---

## 3. Capa 2 — Autenticación

### 3.1 Cadena de resolución de sesión

`resolveRequestSession` (`server.ts:6118-6175`):

```
1. readSessionToken  ──► cookie `frenyer_session`  →  cabecera `Authorization: Bearer`
2. verifyLocalSessionToken ──► ¿válido? → sesión LOCAL (sin ida a Supabase)
3. ¿Supabase configurado? ──► no → null (401)
4. sessionCache (Map en memoria, TTL = min(exp del token, ahora + 5 min))
5. resolveSessionUser ──► auth.getUser(token) + consulta a organization_members
6. ¿token expirado y hay `frenyer_refresh`? ──► refresco + nuevo ciclo
```

**Contexto publicado** (`res.locals.supabaseContext`, `server.ts:6177-6198`):

| Campo | Sesión remota | Sesión local |
|---|---|---|
| `accessToken` | JWT del usuario (→ RLS lo evalúa como el usuario real) | `SUPABASE_ANON_KEY` (→ RLS ve anónimo) |
| `organizationId` | De `organization_members` | `00000000-0000-0000-0000-000000000001` |
| `role` | `organization_members.role` | `'admin'` |
| `isLocalSession` | `false` | `true` |

> ⚠ En **sesión local** las llamadas a Supabase se hacen con la anon key, así que RLS las
> rechaza y el sistema cae de vuelta a los archivos JSON locales. Es el "modo degradado"
> intencionado, pero implica que **el modo local nunca toca la base de datos real**.

### 3.2 Modo local con clave de acceso

Activado por `FRENYER_ACCESS_KEY` (resolución: `process.env` → `.env.local` → `loadedEnv`,
`server.ts:292-299`). Si no está definida, el modo está **apagado** y
`POST /api/auth/local-login` responde **503**.

| Elemento | Detalle |
|---|---|
| Comparación | `safeCompare` (`server.ts:341-350`) — **tiempo constante** y sensible a longitud |
| Cookie | `frenyer_session` (`httpOnly`, `sameSite: 'strict'`, `secure` en producción, `path: '/'`) |
| TTL | **12 horas** (`SESSION_MAX_AGE_MS`, `server.ts:240`) |
| Formato del token | `local.<base64url(payload)>.<base64url(HMAC-SHA256(secreto, body))>` |
| Payload | `{ sub, email, role, organizationId, exp }` — `sub = 'local-' + sha256(email).slice(0,16)` |
| Verificación | `verifyLocalSessionToken` (`server.ts:317-338`): prefijo `local.`, exactamente 3 partes, firma comparada con `crypto.timingSafeEqual`, `exp` comprobado |
| Secreto | `FRENYER_SESSION_SECRET` (mín. 16 chars) → `data/.session-secret` (mín. 32 chars) → se genera `randomBytes(48).toString('hex')` y se persiste |
| Auditoría | `logAuthEvent` anota en `data/auth-audit.log` |

**Eventos auditados:** `LOGIN_OK`, `LOGIN_FALLIDO`, `REGISTRO_OK`, `REGISTRO_FALLIDO`,
`LOGOUT`, `ACCESO_LOCAL_OK`, `ACCESO_LOCAL_FALLIDO`, `GOOGLE_OK`, `GOOGLE_FALLIDO`.

### 3.3 OAuth de Google con PKCE

| Paso | Detalle |
|---|---|
| `GET /api/auth/google` | `code_verifier` = `randomBytes(32).toString('base64url')`; `code_challenge` = base64url(sha256(verifier)); cookie `frenyer_pkce` (httpOnly, `sameSite: 'lax'`, 10 min) |
| Redirección | 302 a `{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to={origen}/api/auth/google/callback&code_challenge=…&code_challenge_method=S256&access_type=offline&prompt=consent` |
| Callback | Canjea `code` + `code_verifier` contra `token?grant_type=pkce` con `client_id = SUPABASE_ANON_KEY`; fija `frenyer_session` + `frenyer_refresh`; 302 a `/dashboard` o `/login?error=…` |
| Origen | `getRequestOrigin` (`server.ts:6087-6092`) respeta `x-forwarded-proto` y `x-forwarded-host` |

### 3.4 Proxy de autenticación

El navegador nunca ve un token de Supabase. El cliente usa
`authenticatedFetch` (`src/lib/supabase/api.ts`) con `credentials: 'include'`, y el login con
Google es una **redirección de página completa** a `/api/auth/google`
(`src/context/AuthContext.tsx:251-259`).

Endpoints: `/api/auth/login`, `/register`, `/session`, `/logout`, `/google`,
`/google/callback`, `/local-login`, `/mode`, `/customer/register`.

### 3.5 Límite de intentos

Almacén: `rateLimitStore = new Map()` **en memoria, en proceso** (`server.ts:196`).
Barrido únicamente cuando supera 5 000 entradas (`server.ts:209-213`).

Algoritmo (`checkRateLimit`, `server.ts:206-233`): la penalización escala en
`min((intentos - límite) * 30 000, 15 * 60_000)` ms.

| Ruta | Clave | Límite | Ventana |
|---|---|---|---|
| `POST /api/auth/login` | `login:<ip>` | 5 | 15 min |
| `POST /api/auth/register` | `register:<ip>` | 5 | 60 min |
| `POST /api/auth/local-login` | `local-login:<ip>` | 5 | 15 min |
| `POST /api/orders` | `orders:<ip>` | 10 | 60 min |

**Sin límite:** `/api/auth/customer/register`, `/api/auth/google*`, `/api/admin/users/*`,
`/api/inventory/adjustments` y el resto.

> 🔴 **No hay `trust proxy`**, pero `getClientIp` (`server.ts:198-204`) confía ciegamente en
> `x-forwarded-for`. Un cliente puede **suplantar su IP** para evadir el límite de intentos.
> En producción hay que habilitar `app.set('trust proxy', 1)` o construir la IP a partir de
> `req.ip` únicamente.

> 🔴 `sessionCache` (`server.ts:6101`) es un `Map` **sin límite ni expulsión**, indexado por el
> JWT crudo. Es una fuga de memoria lenta a lo largo de muchas sesiones.

### 3.6 Mapa de roles — tres vocabularios distintos 🔴

El proyecto tiene **tres sistemas de roles que no coinciden**:

| Sistema | Ubicación | Valores | ¿Se usa para autorizar? |
|---|---|---|---|
| `profiles.role` | `0021:39-40` — CHECK estricto | `gerente`, `administrador`, `cajero`, `cliente` | No directamente |
| `organization_members.role` | `0001:4` — texto libre, default `'viewer'` | cualquiera | **Sí** — es la fuente del rol del servidor |
| `is_org_writer` allowlist | `0009:74-78`, **anulada por `0012:3-14`** | (ya no aplica) | No |

**Traducción `toProfileRole()`** (`server.ts:4220-4227`):

| Entrada (en minúsculas) | Salida |
|---|---|
| `admin`, `administrador`, `propietario`, `owner`, `superadmin`, `root` | `administrador` |
| `manager`, `gerente`, `gerente general`, `supervisor` | `gerente` |
| `cashier`, `cajero`, `vendedor` | `cajero` |
| `cliente`, `customer`, `viewer`, `visitante` | `cliente` |
| **cualquier otro** | `cajero` (defecto seguro) |

> 🚫 **Nunca insertar en `profiles` con un id inventado.** La FK `profiles.id → auth.users(id)`
> lo rechaza y el trigger `handle_new_user` crea la fila con su propio id, dejando al usuario
> duplicado en el listado. El flujo correcto es: crear el usuario en Auth primero, luego PATCH
> del perfil.
>
> 🚫 **Nunca enviar `'admin'` o `'cashier'` a `profiles`.** El CHECK lo viola y la escritura se
> descarta **en silencio**. Traducir siempre con `toProfileRole()`.

> 🔴 Un usuario de Supabase válido **sin fila en `organization_members`** se convierte en
> `role: 'admin'` de la organización por defecto (`server.ts:424-425`). La pertenencia es la
> única fuente de rol; `profiles.role` nunca se consulta para autorizar.

---

## 4. Capa 3 — Autorización de servidor

### 4.1 Middleware

```ts
// server.ts:429-445
async function authenticateSupabaseRequest(req, res, next) {
  const session = await resolveRequestSession(req, res);
  if (!session) {
    res.status(401).json({ success: false, error: 'Sesión requerida…' });
    return;
  }
  applySessionContext(res, session);
  next();
}
```

No hay contexto anónimo de respaldo: una petición sin sesión válida recibe **401**.

### 4.2 Prefijos protegidos (todos los métodos)

`server.ts:458-476` — 18 prefijos:

```
/api/bcv/rates/manual      /api/exchange-rates/history  /api/reports/process-transactions
/api/customers             /api/bank-accounts           /api/payment-methods
/api/bank-movements        /api/bank-transfers          /api/suppliers
/api/quotes                /api/sales                  /api/accounts-receivable
/api/accounts-payable      /api/purchases              /api/branches
/api/expenses              /api/expense-categories     /api/customer
```

`/api/customer` cubre el portal personal del cliente (`GET /api/customer/portal`,
`POST /api/customer/wishlist`). El cliente se identifica con la sesión httpOnly
(`supabaseContext.userEmail`), nunca con un parámetro de la petición, de modo que un
cliente solo puede ver sus propios pedidos, compras y lista de deseo.

### 4.3 Guards por método

```ts
// server.ts:480-482
app.use('/api/orders',               requireAuthForMethods(['GET','PUT','PATCH','DELETE']));
app.use('/api/users',                requireAuthForMethods(['GET','PUT','PATCH','DELETE']));
app.use('/api/inventory-movements',  requireAuthForMethods(['GET','PUT','PATCH','DELETE']));
```

### 4.4 🔴 Huecos de autorización

| # | Endpoint | Problema | Impacto |
|---|---|---|---|
| 1 | `POST /api/users` (`server.ts:4390`) | `POST` no está en la lista de métodos | Cualquiera puede **crear usuarios** del ERP, y con contraseña, crear usuarios en Supabase Auth (`auth.signUp`, línea 4425) |
| 2 | `POST /api/users/:id/toggle-status` (`server.ts:4562`) | Ídem | Cualquiera puede **desactivar** una cuenta |
| 3 | `GET /api/inventory/movements` (`server.ts:1484`) | Prefijo no listado | Se puede **leer el kárdex** de cualquier tenant |
| 4 | `POST /api/inventory/adjustments` (`server.ts:1651`) | Prefijo no listado | Se puede **escribir stock** en el tenant por defecto |
| 5 | `GET /api/debug/bank-movements-check` (`server.ts:3196`) | Sin protección | **Vuelca todos los movimientos y cuentas bancarias** |
| 6 | `GET /api/debug/accounts-list` (`server.ts:3222`) | Sin protección | **Vuelca todas las cuentas bancarias** |

El guard de `/api/inventory-movements` (`server.ts:482`) está **muerto**: ese prefijo no existe
como ruta. Las reales son `/api/inventory/movements` y `/api/inventory/adjustments`.

### 4.5 CORS

`app.use(cors())` (`server.ts:19`) envía `Access-Control-Allow-Origin: *` **sin**
`credentials: true`. Hoy no molesta (el SPA es same-origin), pero impide llamar a la API
desde otro origen con la cookie de sesión.

### 4.6 CSRF

No hay protección CSRF. La mitigación actual es `sameSite: 'strict'` en la cookie de sesión;
la cookie PKCE usa `sameSite: 'lax'` (necesario para el retorno de Google).

### 4.7 Errores

No hay manejador de errores JSON. Una excepción en una ruta devuelve la **página HTML** de
Express, no un JSON de error. Además, varias rutas responden `{ success: false }` con
**HTTP 200**.

---

## 5. Capa 4 — Aislamiento en base de datos

### 5.1 Tres mecanismos

| Mecanismo | Cómo funciona | Tablas |
|---|---|---|
| **(A) Organización directa** | `organization_id` + `USING (is_org_member(organization_id))` | `organizations`, `organization_members`, `products`, `customers`, `sales`, `bank_accounts`, `bank_movements`, `payment_methods`, `exchange_rates`, `audit_logs` |
| **(B) Fila padre** | `EXISTS (SELECT 1 FROM padre p WHERE p.id = hijo.padre_id AND is_org_member(p.organization_id))` | `sale_items`→`sales`, `payments`→`sales`, `payable_payments`→`accounts_payable` |
| **(C) Usuario** | `auth.uid() = customer_id` | `shop_customers`, `customer_wishlist`, `customer_orders` |

### 5.2 🔴 13 tablas sin aislamiento

`0009_lock_down_api_rls.sql` estableció el estado correcto, pero migraciones posteriores lo
revertieron parcialmente:

| Tabla | Política final | Origen |
|---|---|---|
| `branches` | `allow_all_branches` | `0015:49-52` |
| `suppliers` | `allow_all_suppliers` | `0016_fix:45` |
| `accounts_payable` | `allow_all_accounts_payable` **OR** `authenticated_*` | `0016_fix:80` |
| `accounts_receivable` | `allow_all_accounts_receivable` | `0016_fix:107` |
| `receivable_payments` | `allow_all_receivable_payments` **OR** `authenticated_*` | `0019:23` |
| `purchases` | `allow_all_purchases` | `0016_fix:121` |
| `purchase_items` | `allow_all_purchase_items` | `0016_fix:130` |
| `inventory_movements` | `org_member_*` (con `USING (true)`) + `anon_*` | `0017:43-54` |
| `expenses` | `allow_all_expenses` | `0016_expenses:101` |
| `expense_categories` | `allow_all_expense_categories` | `0016_expenses:94` |
| `expense_payments` | `allow_all_expense_payments` | `0016_expenses:108` |
| `orders` | `orders_select/insert/update_all` (`USING (true)`, **sin `TO` ⇒ PUBLIC**) | `0018:64-71` |
| `order_items` | `order_items_select/insert_all` (`USING (true)`, PUBLIC) | `0018:73-76` |

Todas tienen `GRANT ALL` a `anon`. La columna `organization_id` sigue presente en la mayoría:
**la intención sobrevive, solo se perdió la política.** Corregirlo es un cambio de política
por tabla, sin migración de datos.

**Causa raíz:** en PostgreSQL las políticas permisivas se combinan con **OR**. Para
`accounts_payable` y `receivable_payments` coexiste `allow_all_*` con las `authenticated_*`,
por lo que las org-scoped quedan **inertes**.

**Por qué existe el problema:** el servidor consulta PostgREST con la **anon key** cuando no
hay sesión (`server.ts:1196, 1218, 1367, 1400, 1425, 1874, 2269, 3198, 3224, 4075, 4267,
4315, 5439, 5835, 6033, 6205`). Esas peticiones solo funcionan donde exista una política
`USING (true)` — exactamente el conjunto de tablas que perdió el aislamiento.
**Las políticas permisivas son lo que hace funcionar la tienda pública, y a la vez expone
datos de tenants a `anon`.**

### 5.3 Aislamiento por trigger en lugar de política

| Caso | Ubicación | Riesgo |
|---|---|---|
| Trigger de descuento de stock busca `products` por **solo `sku`** | `workspace/0019:59,69` | Una venta del tenant B con el mismo SKU descuenta el stock del tenant A |
| `record_internal_purchase` busca por **solo `sku`, `LIMIT 1`** | `0013:230` | Mismo riesgo en los incrementos de stock |
| `convert_quote_to_invoice` busca por `sku` **y** `organization_id` | `0011:212-213` | ✅ Patrón correcto |
| `organization_id` nullable con DEFAULT centinela | `0003:22-26` | Una inserción sin organización aterriza en el **tenant por defecto** en vez de fallar |
| `organization_id` nullable en 6 tablas | `0003:14-19` | Una fila con org `NULL` no matchea ninguna política `is_org_member` → invisible pero escribible |

### 5.4 Autorización de escritura

- `0009` introdujo `is_org_writer` **con** una lista de roles.
- `0012:3-14` lo **redefundió** a "cualquier miembro de la organización". La lista de roles
  desapareció.
- La **única** restricción por rol que sobrevive está en `exchange_rates`
  (`0009:258-289`, lista en línea sobre `organization_members.role`) y en `profiles`
  (vía `get_my_role()`, `0021:154-159`).
- El servidor también aplica un gate de rol en `POST /api/bcv/rates/manual`
  (`server.ts:778`), pero ese control ocurre **antes** de la llamada a la base de datos, así
  que una llamada directa a PostgREST con la anon key lo bypasa donde exista `allow_all_*`.

---

## 6. Uso de la service role

| Ubicación | Uso |
|---|---|
| `server.ts:163-172` | Resuelve `SUPABASE_SERVICE_ROLE_KEY` (archivo → env → `.env.local`) |
| `server.ts:180-185` | `getSupabaseAdminClient()` — **definido pero nunca invocado** |
| `server.ts:6530-6532` | Inserción en `shop_customers` (requerido: no hay política INSERT) |

La service role **no se usa para consultas de negocio** — es la decisión de diseño correcta
(las RLS siguen aplicándose). Pero el hecho de que el cliente admin no se use tiene
consecuencias: `auth.admin.createUser` y `auth.admin.updateUserById` se invocan sobre el
cliente **anon** y fallan con una anon key real.

---

## 7. Auditoría

| Fuente | Cobertura |
|---|---|
| `data/auth-audit.log` | Eventos de autenticación (append-only) |
| `public.audit_logs` | Tabla creada y con política en `0001`, **nunca escrita ni consultada** |
| `bank_movements.user_name` | Guarda `auth.uid()::text` — un **UUID en un campo de nombre** (`0012:116`) |
| `order_items.activity_history` (jsonb) | Historial de estados del pedido |

No hay registro de auditoría para operaciones financieras (ventas, pagos, movimientos
bancarios) más allá de la fila misma.

---

## 8. Secretos y datos sensibles

| Elemento | Ubicación | Estado |
|---|---|---|
| `data/supabase-credentials.json` | `data/` (gitignored) | No presente en el checkout actual |
| `data/.session-secret` | `data/` (gitignored) | **Presente** — no versionar nunca |
| `data/auth-audit.log` | `data/` (gitignored) | Contiene correos y direcciones IP |
| `data/*.json` | `data/` (gitignored) | **Contiene PII**: correos, teléfonos y direcciones de clientes |
| `.env.local` | Raíz | **Presente en el árbol de trabajo** — verificar que esté en `.gitignore` |

> 🔴 **Los datos personales ya estuvieron versionados.** `data/` (correos, teléfonos y
> direcciones de clientes) se versionó en commits anteriores. Se retiró del árbol en
> `2482998`, pero **sigue en el historial del repositorio público**. Eliminarlo del historial
> exige reescribirlo y hacer force-push.

> ⚠ `data/` está en `.gitignore` (línea 28), pero `data/` contiene PII. Antes de publicar,
> confirmar con `git log --stat -- data/` que no hay datos personales en el historial.

---

## 9. Problema de codificación 🔴

**130 líneas de `server.ts` contienen texto español mal codificado (mojibake).**

- 61 coincidencias del patrón `Ã³` en `server.ts`; **cero** apariciones de `ó` correctamente
  codificada en todo el archivo.
- Ejemplos: `server.ts:438` `'SesiÃ³n requerida. Inicia sesiÃ³n para acceder a esta
  informaciÃ³n.'`, `606`, `698`, `780`, `1027`, `1045`, `1072`, `1075`, `1916`, `2512`,
  `4396`, `6237`, `6330`, `6454`.
- También afecta a `README.md`, `metadata.json` e `index.html`.

**Efecto:** todos los mensajes de error visibles al usuario que llevan acentos se muestran
corruptos en tiempo de ejecución. Es el defecto de calidad más visible del proyecto.

Corrección: reinterpretar los archivos como **UTF-8 con bytesinterpretados como Windows-1252**
y volver a guardarlos como UTF-8. Herramienta: `iconv -f utf-8 -t latin1 archivo > temporal &&
mv temporal archivo`, o un script Node que aplique la tabla de inversión de Windows-1252.

---

## 10. Checklist antes de producción

| # | Ítem | Bloqueante |
|---|---|---|
| 1 | Corregir `app.get('*')` → `app.get('/{*splat}')` en `server.ts:6603` | 🔴 Sí — el arranque en producción falla |
| 2 | Añadir `POST` al guard de `/api/users` y proteger los 4 endpoints con hueco | 🔴 Sí |
| 3 | Añadir `/api/inventory` a los prefijos protegidos | 🔴 Sí |
| 4 | Eliminar o proteger `/api/debug/*` | 🔴 Sí |
| 5 | Restringir las 13 tablas con `allow_all_*` a políticas por organización | 🔴 Sí |
| 6 | Habilitar `trust proxy` y dejar de confiar en `x-forwarded-for` a ciegas | 🟠 Sí |
| 7 | Corregir el mojibake de `server.ts`, `README.md`, `metadata.json`, `index.html` | 🟠 Sí |
| 8 | Unificar los tres vocabularios de rol | 🟠 Sí |
| 9 | Aplicar la tasa manual a `lastCertifiedRate` | 🟠 Sí |
| 10 | Añadir `organization_id` a `sale_items`, `payments`, `order_items`, `purchase_items` | 🟡 Deseable |
| 11 | `sessionCache` con expulsión (LRU o TTL) | 🟡 Deseable |
| 12 | Middleware de CSRF y `credentials: true` en CORS | 🟡 Deseable |
| 13 | Manejador de errores JSON global | 🟡 Deseable |
| 14 | Reescribir el historial del repositorio para eliminar la PII | 🟡 Deseable |
| 15 | Restringir `organization_id` a `NOT NULL` (quitar el DEFAULT centinela de `0003`) | 🟡 Deseable |

Detalle completo y priorización en [KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md).
