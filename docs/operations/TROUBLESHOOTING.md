# Solución de problemas — Frenyer ERP

> Guía de diagnóstico por síntoma. Cada entrada indica la causa más probable y cómo
> confirmarla. Referencia: [KNOWN_ISSUES.md](KNOWN_ISSUES.md) para el detalle de cada defecto.

---

## Arranque y build

### El servidor no arranca en producción

```
PathError: Missing parameter name at index 1: *
```

**Causa:** `app.get('*', ...)` (`server.ts:6603`) es sintaxis inválida en Express 5.

**Solución:** `app.get('/{*splat}', ...)`. Ver [KNOWN_ISSUES P-01](KNOWN_ISSUES.md#p-01).

---

### `npm run build` falla con error 193 en Windows

**Causa:** el paquete `lightningcss-win32-x64-msvc` se descargó truncado (589 KB).

**Solución:**

```bash
npm install lightningcss-win32-x64-msvc@1.33.0 --no-save
rm -rf node_modules/.vite
```

Si persiste, borra `node_modules` y `package-lock.json` y reinstala.

---

### `npm run build` falla con errores de módulos nativos de Windows

**Solución:**

```bash
npm install esbuild --no-save
npm install @rolldown/binding-win32-x64-msvc --no-save
```

---

### `EADDRINUSE: address already in use :::3000`

**Causa:** el puerto 3000 está **hardcodeado** en `server.ts:23`; `process.env.PORT` se ignora.

**Solución:**

```powershell
# Windows
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9
```

> 💡 `vite.config.ts` también reserva el 3000, así que `vite preview` choca con `npm run dev`.

---

### Los cambios en `.env.local` no surten efecto

**Causa:** `tsx server.ts` **no recarga en caliente**. Las variables se leen una vez al arrancar.

**Solución:** reiniciar el proceso de desarrollo.

---

### El servidor arranca pero la interfaz sale en blanco

Comprueba, en este orden:

1. **La consola del navegador** — ¿error de red en `/api/auth/session`?
2. `curl http://localhost:3000/api/auth/mode` — ¿devuelve `supabaseConnected: true`?
3. ¿`dist/` existe? En producción, `npm run build` debe ejecutarse **antes**.
4. La terminal del servidor — ¿hay un error al montar Vite?

---

## Autenticación

### `POST /api/auth/login` devuelve 503

**Causa:** Supabase no está configurado en el servidor.

**Diagnóstico:**

```bash
curl http://localhost:3000/api/auth/mode
```

Si `supabaseConfigured: false`, revisa `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `.env.local`.
Consulta `credentialsSource` para saber qué origen está ganando.

---

### El login devuelve 401 con credenciales correctas

| Causa | Cómo comprobarla |
|---|---|
| Confirmación de correo activada | En Supabase → Authentication → Providers → Email, desactiva "Confirm email" |
| La contraseña cumple el mínimo de 8 caracteres | `server.ts:6273` exige 8 en el registro |
| Rate limit | 5 intentos / 15 min ⇒ **429**, no 401. La respuesta incluye `retryAfterSeconds` |
| La URL de Supabase es un placeholder | `isRealSupabaseUrl` rechaza `your-project` y `example.com` |

---

### El OAuth de Google redirige a una URL inexistente

**Causa:** la URL de Supabase es `https://your-project.supabase.co` o similar.

**Solución:** usar `https://knyqrwpaksawuxoqcayu.supabase.co`.

Además, en Supabase → Authentication → URL Configuration, la **Redirect URL** debe incluir
`https://<tu-dominio>/api/auth/google/callback` y `http://localhost:3000/api/auth/google/callback`.

---

### La sesión se pierde al recargar

| Causa | Comprobación |
|---|---|
| La cookie se está borrando | `httpOnly`, `sameSite`, `secure` y `path` en `setSessionCookie` (`server.ts:243-251`) |
| `FRENYER_SESSION_SECRET` cambia entre arranques | Si no está definido, se genera en `data/.session-secret`. **No borres ese archivo** |
| El servidor corre en otro host/puerto | La cookie es de host; `localhost:3000` y `localhost:3001` no comparten cookies |

---

### `POST /api/auth/local-login` devuelve 503

**Causa:** `FRENYER_ACCESS_KEY` no está definida. El modo local está **apagado** por diseño.

**Solución:** definirla en `.env.local` y reiniciar.

---

### `GET /api/auth/session` devuelve 401 en modo local

**Causa:** la cookie `frenyer_session` no está o el `data/.session-secret` cambió (firma inválida).

**Diagnóstico:** revisa `data/auth-audit.log` — registra `ACCESO_LOCAL_OK` / `ACCESO_LOCAL_FALLIDO`.

---

## Datos

### Las páginas salen vacías aunque la base de datos tiene datos

**Causa más probable:** el módulo usa el cliente Supabase **inerte** del navegador. Los bloques
`if (isSupabaseConfigured)` de `db.ts` están muertos porque ese valor es la constante `false`
(`client.ts:13`).

**Módulos afectados:** `SalesReport`, `AccountsReport`, `SaleDetailPage`, `ProfitLoss`,
`CompanyHealth`, `Customers`, `Movements`, y el flujo de emisión del POS.

**Diagnóstico:** en la consola del navegador, busca `invalid API key` o `JWT` en las peticiones
a `*.supabase.co`. Ver [KNOWN_ISSUES P-02](KNOWN_ISSUES.md#p-02).

**Solución:** migrar el módulo a las rutas `/api/*` del servidor.

---

### `source: 'local'` en la respuesta de la API

**Significa:** Supabase falló y el servidor devolvió el respaldo de `data/`.

**Causas habituales:**

1. RLS rechaza la consulta (la anon key no ve los datos del tenant).
2. La tabla no existe.
3. Las credenciales no están configuradas.

**Diagnóstico:** `curl http://localhost:3000/api/supabase/status` → campo `missingTables`.

---

### `Could not find the '<column>' column of '<table>'`

**Causa:** la base de datos viva tiene menos columnas que las que espera el código. Es la
deriva documentada en [DATABASE.md §5](../architecture/DATABASE.md#5-deriva-entre-la-base-viva-y-las-migraciones-🔴).

**El servidor/workaround:** reintenta hasta 6 veces descartando la columna. Si ves el error en
la consola, la escritura **se está perdiendo ese campo**.

**Solución:** añadir la columna en Supabase. Las más frecuentes:

```sql
alter table public.products add column if not exists cost_usd numeric(18,4) default 0;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists min_stock numeric(18,4) default 0;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists unit text;
alter table public.customers add column if not exists doc_number text;
alter table public.customers add column if not exists code text;
alter table public.customers add column if not exists doc_type text;
alter table public.customers add column if not exists credit_limit numeric(18,4) default 0;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists orders_count integer default 0;
alter table public.customers add column if not exists total_spent_usd numeric(18,4) default 0;
alter table public.customers add column if not exists last_order_date timestamptz;
alter table public.branches add column if not exists address text;
alter table public.organizations add column if not exists currency text;
alter table public.organizations add column if not exists rif text;
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists address text;
alter table public.exchange_rates add column if not exists is_future_rate boolean default false;
alter table public.sales add column if not exists rate_source text;
alter table public.sales add column if not exists rate_value_date timestamptz;
alter table public.sales add column if not exists is_future_rate boolean default false;
```

---

### El POST devuelve 200 con `success: false`

**No es un bug del cliente.** Varias rutas responden `{ success: false }` con **HTTP 200**.
**Siempre hay que leer `success`**, no solo el código HTTP.

Ver [KNOWN_ISSUES P-25](KNOWN_ISSUES.md#p-25).

---

### Las ventas del POS no se guardan

**Causa:** `recordSaleInSupabase` (`db.ts:1022`) escribe por el cliente inerte del navegador.
No existe `POST /api/sales`.

**Solución:** ver [KNOWN_ISSUES P-02](KNOWN_ISSUES.md#p-02). Como parche, el POS sigue
actualizando el stock vía `PATCH /api/products/:sku/stock`, que sí llega al servidor.

---

### El panel muestra saldos pendientes que ya están pagados

**Causa:** los RPCs escriben `PAGADA` y los filtros buscan `PAGADO`.

**Solución:** ver [KNOWN_ISSUES P-13](KNOWN_ISSUES.md#p-13).

---

### Los proveedores se duplican

| Causa | Comprobación |
|---|---|
| RIF con formatos distintos (`J-123` vs `J 123`) | La normalización quita espacios, puntos y guiones (`server.ts:3570-3629`) |
| El mismo proveedor con nombres distintos | Se deduplica por nombre normalizado como último recurso |
| Filas huérfanas en `accounts_payable` | `autoReconcileSuppliers` las sintetiza como proveedores nuevos |
| `0020` no se aplicó | Sin los índices únicos parciales no hay protección a nivel de base de datos |

**Diagnóstico:**

```sql
select organization_id, upper(trim(doc_number)) as doc, count(*)
from public.suppliers
where doc_number is not null and trim(doc_number) <> ''
group by 1, 2 having count(*) > 1;
```

---

### No se puede eliminar un proveedor con cuentas por pagar

**Causa:** la FK `accounts_payable.supplier_id` es `ON DELETE RESTRICT` (`0008:15`).

**Solución:** ver [KNOWN_ISSUES P-12](KNOWN_ISSUES.md#p-12).

---

### No se puede eliminar una sede con productos

**Causa:** la FK `products.branch_id` es `NO ACTION` (`0001:6`).

**Solución:** ver [KNOWN_ISSUES P-12](KNOWN_ISSUES.md#p-12).

---

## Tipos de cambio

### `GET /api/bcv/rates` devuelve 503

Significa que **ninguna** de las tres fuentes respondieron:

1. `bcv.org.ve` (8 s) — puede estar caído o cambiar el HTML.
2. `ve.dolarapi.com` (5 s).
3. La tasa certificada en memoria.

**Diagnóstico:** prueba la conectividad desde la máquina del servidor.

**Solución temporal:** fija una tasa manual con `POST /api/bcv/rates/manual` (rol autorizado).

---

### La tasa manual se muestra pero no se aplica a los cálculos

**Causa:** `lastCertifiedRate` no se actualiza. Ver
[KNOWN_ISSUES P-06](KNOWN_ISSUES.md#p-06).

---

### `POST /api/bcv/rates/manual` devuelve 403

**Causa:** el rol de `organization_members.role` no está en la lista
{`admin`, `superadmin`, `gerente`, `gerente general`, `manager`, `owner`}.

**Trampa:** `administrador` **no** está en la lista, aunque es el valor canónico de
`profiles.role`. Y el rol que se comprueba viene de `organization_members`, no de `profiles`.
Ver [KNOWN_ISSUES P-07](KNOWN_ISSUES.md#p-07).

---

### El total VES no cuadra con la tasa mostrada

Comprueba:

1. Que el documento guarde su propia `exchange_rate` (es una instantánea, por diseño).
2. El redondeo: 2 decimales para importes, 4 para tasas.
3. Si el documento se creó con una **tasa futura** (regla de las 16:00 en Caracas).

---

## Interfaz

### Los textos con acentos salen como `SesiÃ³n`, `OperaciÃ³n`

**Causa:** mojibake. Ver [KNOWN_ISSUES P-05](KNOWN_ISSUES.md#p-05).

---

### La página de callback de autenticación sale sin estilos

**Causa:** usa utilidades de Tailwind, que no están instaladas. Afecta a
`AuthCallback.tsx` y `SaleDetailModal.tsx`.

Ver [KNOWN_ISSUES P-17](KNOWN_ISSUES.md#p-17).

---

### Los spinners no giran

**Causa:** `globals.css` no tiene ningún `@keyframes`. Ver
[KNOWN_ISSUES P-18](KNOWN_ISSUES.md#p-18).

---

### El formulario de login se ve deformado

**Causa:** las dos familias `.auth-*` en conflicto; `LoginPage` mezcla ambas.

Ver [KNOWN_ISSUES P-19](KNOWN_ISSUES.md#p-19).

---

### El menú lateral no marca la sección activa

**Causa:** el resaltado usa igualdad exacta de ruta (`Sidebar.tsx:186` y `:219`). En
`/ventas-flash/reporte/123` no se marca "Reporte de ventas".

**Solución:** usar `location.pathname.startsWith(child.to)`.

---

### El sidebar no aparece en el móvil

Comprueba:

1. El ancho de la ventana < 640 px (el breakpoint está en `globals.css:7-13`).
2. Que `.mobile-menu` esté visible (lo activa el media query).
3. Que el botón `.mobile-menu` de `DashboardLayout` (`:271-279`) esté presente.

---

### Un usuario ve el menú casi vacío

**Causa:** `AuthContext.resolveProfile` asigna por defecto los permisos `['compras']`
(`AuthContext.tsx:86`) cuando el correo no aparece en `GET /api/users`. El Sidebar filtra por
`ventas | inventario | finanzas | reportes | usuarios` ⇒ solo queda visible "Gestión de
Contactos", que no tiene clave de permiso.

**Solución:** corregir el conjunto de permisos por defecto a
`['ventas','inventario','finanzas','reportes','usuarios']`, o añadir el usuario a
`data/users.json`.

---

### Un usuario con rol `cliente` ve un frame del ERP antes de ser redirigido

**Causa:** la protección real por rol es un `useEffect` de `DashboardLayout` (`:86-151`) que
corre **después** del montaje. `ProtectedRoute.allowedRoles` existe pero **nunca se pasa**.

**Solución:** pasar `allowedRoles` en el router, o mover la comprobación a `ProtectedRoute`.

---

### La tienda online no carga productos

| Causa | Comprobación |
|---|---|
| Sin productos en Supabase | `curl http://localhost:3000/api/public/products` |
| La sesión bloquea la lectura | Se usa el token si existe; si no, la anon key |
| RLS bloquea la anon key | `GET /api/products` tiene fallback a `DEFAULT_CATALOG_PRODUCTS`; si tampoco aparece, revisa `/api/supabase/status` |

---

## Rendimiento y recursos

### La memoria crece con el uso

**Causa probable:** `sessionCache` (`server.ts:6101`) es un `Map` sin expulsión.

Ver [KNOWN_ISSUES P-24](KNOWN_ISSUES.md#p-24).

---

### Dos escrituras simultáneas se pierden

**Causa:** los archivos JSON de `data/` se reescriben completos, sin bloqueo ni renombre
atómico. Además, `orders.json` e `inventory_adjustments.json` se truncan a 500 filas.

**Solución:** serializar las escrituras por archivo (cola en memoria) o migrar a SQLite.

---

### El servidor crea un `data/` vacío en otra carpeta

**Causa:** las rutas se resuelven con `process.cwd()`. Arrancar el servidor desde otro
directorio cambia la base de datos local.

**Solución:** arrancar siempre desde la raíz del proyecto.

---

## Diagnóstico general

### Herramientas del proyecto

```bash
# Estado de Supabase (tablas faltantes incluidas)
curl http://localhost:3000/api/supabase/status

# Modo de autenticación y origen de las credenciales
curl http://localhost:3000/api/auth/mode

# Sesión actual
curl http://localhost:3000/api/auth/session

# Diagnóstico de cuentas bancarias (¡público! — ver P-03)
curl http://localhost:3000/api/debug/bank-movements-check
```

### Registro de auditoría de autenticación

```bash
tail -50 data/auth-audit.log
```

Eventos: `LOGIN_OK`, `LOGIN_FALLIDO`, `REGISTRO_OK`, `REGISTRO_FALLIDO`, `LOGOUT`,
`ACCESO_LOCAL_OK`, `ACCESO_LOCAL_FALLIDO`, `GOOGLE_OK`, `GOOGLE_FALLIDO`.

### Verificar las políticas RLS reales

```sql
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Para detectar tablas abiertas a `anon`:

```sql
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and 'anon' = any(roles)
order by tablename;
```

### Verificar el estado de las sesiones locales

```bash
# No borres este archivo: perderlo invalida todas las sesiones
ls -la data/.session-secret
```

---

## Escalar el problema

Cuando un síntoma no está en esta guía, el orden de diagnóstico es:

1. **Consola del navegador** — errores de red y de consola.
2. **Terminal del servidor** — el log de Express.
3. **`GET /api/auth/mode`** — ¿el servidor está configurado y conectado?
4. **`GET /api/supabase/status`** — ¿qué tablas faltan?
5. **`data/auth-audit.log`** — ¿qué intentos de autenticación hubo?
6. **SQL en Supabase** — `pg_policies` y el contenido real de la tabla.
7. **Referencia de API** — [API.md](../architecture/API.md) para la forma exacta de cada endpoint.
