# Instalación y operación — Frenyer ERP

> Guía para levantar el proyecto en un entorno de desarrollo o producción.
> Verificada contra `package.json`, `server.ts`, `.env.example` y `vite.config.ts`
> en la revisión de octubre 2026.

---

## 1. Requisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | **22.6+** para `npm start`; **18+** para `npm run dev` | `npm start` usa `node server.ts` y necesita *type stripping* nativo (Node ≥ 22.6). `npm run dev` usa `tsx` y no lo necesita |
| npm | 10+ | |
| Windows / Linux / macOS | — | En Windows x64 hay binarios nativos precompilados (ver §6) |

No se requiere Docker, ni la CLI de Supabase, ni una base de datos local: la persistencia
principal es Supabase (remoto) y el respaldo local es un directorio `data/` de archivos JSON.

---

## 2. Instalación

```bash
npm install
```

> ⚠ En Windows x64 la instalación de binarios nativos (`esbuild`,
> `@rolldown/binding-win32-x64-msvc`, `lightningcss-win32-x64-msvc`) puede fallar o descargar
> el paquete truncado. Ver §6.

---

## 3. Configuración

### 3.1 Variables de entorno

Copia `.env.example` a `.env.local` y rellénalo. **Nunca versionar `.env.local`.**

| Variable | Obligatoria | Descripción |
|---|---|---|
| `SUPABASE_URL` | Sí (salvo modo local) | URL del proyecto Supabase. Ej.: `https://knyqrwpaksawuxoqcayu.supabase.co` |
| `SUPABASE_ANON_KEY` | Sí (salvo modo local) | Clave anónima (`anon`/`publishable`) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Solo para operaciones administrativas puntuales de Supabase Auth. **Nunca para consultas de negocio** (bypassearía las RLS) |
| `FRENYER_ACCESS_KEY` | No | Habilita el acceso directo con clave. Si se omite, el modo queda deshabilitado y `POST /api/auth/local-login` responde 503 |
| `FRENYER_SESSION_SECRET` | No | Secreto para firmar las sesiones locales. Mínimo 16 caracteres. Si se omite, se genera y guarda en `data/.session-secret` |
| `VITE_TURNSTILE_SITE_KEY` | No | Clave **pública** de Cloudflare Turnstile para los formularios de la tienda |

> 🚫 **Nunca uses el prefijo `VITE_` para credenciales de Supabase.** Vite las inyecta en el
> bundle del navegador. `VITE_TURNSTILE_SITE_KEY` sí es pública por diseño.

> ⚠ `.env.local` se lee **dos veces** con dos parsers distintos: el parser propio de
> `server.ts:48-69` y el `loadEnv` de Vite con prefijo vacío (`server.ts:71`). La precedencia
> sigue poniendo `process.env` primero, pero es una fuente de mantenimiento.

### 3.2 Alternativa: archivo de credenciales

En lugar de variables de entorno, se puede crear `data/supabase-credentials.json` (está en
`.gitignore`):

```json
{
  "url": "https://knyqrwpaksawuxoqcayu.supabase.co",
  "anonKey": "...",
  "serviceRoleKey": "..."
}
```

Este archivo tiene **precedencia sobre todas las variables de entorno**.

### 3.3 Orden de precedencia

```
data/supabase-credentials.json  →  process.env  →  .env.local  →  loadedEnv  →  VITE_* (deprecado)  →  constante
```

Gana el primer valor **válido** (no el primer valor no vacío). Un valor con `your-project`,
`example.com`, `your-supabase` o `configure_supabase` se considera inválido y se descarta.

### 3.4 Comprobar el estado

```bash
curl http://localhost:3000/api/auth/mode
```

Respuesta esperada (sin claves):

```json
{
  "success": true,
  "data": {
    "supabaseConfigured": true,
    "supabaseConnected": true,
    "missingTables": [],
    "supabaseUrl": "https://knyqrwpaksawuxoqcayu.supabase.co",
    "localAccessEnabled": false,
    "credentialsSource": "env"
  }
}
```

---

## 4. Base de datos

### 4.1 Aplicar las migraciones

> ⚠ **No hay CLI de Supabase ni `config.toml` en el proyecto.** Las migraciones se aplican
> **a mano** desde el **SQL Editor** del panel de Supabase, **en orden numérico**.

```bash
# 1. Abrir https://supabase.com → proyecto knyqrwpaksawuxoqcayu → SQL Editor → New query
# 2. Pegar y ejecutar, uno por uno, en este orden:
supabase/migrations/0001_initial.sql
supabase/migrations/0002_complete_schema.sql
...
supabase/migrations/0022_shop_customer_tables.sql
```

> 🔴 **La cadena NO se aplica limpiamente desde cero.** Ver §4.3.

### 4.2 Migración huérfana

`workspace/supabase/migrations/0019_auto_deduct_inventory_stock.sql` está **fuera** de la
carpeta de migraciones y nunca se aplica por herramienta. Si quieres el descuento automático de
stock y la escritura del kárdex por trigger, ejecuta ese archivo **manualmente** en el SQL
Editor, **después** de `0017_inventory_movements.sql`.

### 4.3 ⚠ Problemas conocidos de la cadena

| Problema | Efecto | Workaround |
|---|---|---|
| `0003:9` inserta `organizations.currency`, columna que solo existe en el no-op `0002:16` | **Error: la columna "currency" no existe** | Añadir `ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS currency text;` antes de `0003` |
| `0002:75` crea `idx_customers_doc (doc_number)` sobre una columna inexistente | Error al crear el índice | Ejecutar `0002` en dos pasos, o añadir la columna antes |
| `0011:89` y `0011:248` insertan `rate_source`, `rate_value_date`, `is_future_rate` en `sales` | Error en los RPC de cotizaciones | `ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS rate_source text, ADD COLUMN IF NOT EXISTS rate_value_date timestamptz, ADD COLUMN IF NOT EXISTS is_future_rate boolean;` |
| `0013:257` usa `products.cost_usd` | Error en `record_internal_purchase` | `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_usd numeric(18,4) DEFAULT 0;` |
| `0009` y `0016_fix` y `0019` se contradicen en políticas | El resultado final depende del orden real de aplicación | Verificar con `SELECT * FROM pg_policies WHERE schemaname='public'` al terminar |
| Columnas que la app usa y no están en ninguna migración | `products` (7), `customers` (8), `branches` (1), `organizations` (4), `exchange_rates` (1), `sales` (3) | Ver la tabla completa en [DATABASE.md §5](../architecture/DATABASE.md#5-deriva-entre-la-base-viva-y-las-migraciones-🔴) |

> 📌 **Recomendación:** volca el esquema real de la base viva con
> `pg_dump --schema-only` y conviértelo en una migración canónica que sí se aplique desde cero.

### 4.4 Configurar Supabase Auth

1. **Authentication → Providers → Google**: activar y registrar
   - Client ID y Client Secret de Google Cloud.
   - **Redirect URI**: `https://<tu-dominio>/api/auth/google/callback` y
     `http://localhost:3000/api/auth/google/callback`.
2. **Authentication → URL Configuration**:
   - Site URL: `https://<tu-dominio>` (o `http://localhost:3000` en desarrollo).
   - Additional Redirect URLs: ambos callbacks de arriba.
3. **Confirmación de correo:** si está desactivada, `/api/auth/register` devuelve sesión
   inmediatamente y fija las cookies. Si está activada, devuelve
   `requiresEmailConfirmation: true` y el usuario debe confirmar.
4. **Bot and Abuse Protection (Turnstile)**: si usas `VITE_TURNSTILE_SITE_KEY`, añade
   `http://localhost:3000/` y el dominio de producción a las URLs permitidas.

---

## 5. Scripts disponibles

| Comando | Qué hace | Notas |
|---|---|---|
| `npm run dev` | `tsx server.ts` — servidor Express + Vite en modo middleware en `0.0.0.0:3000` | El puerto es **hardcodeado** (`server.ts:23`); `process.env.PORT` se ignora |
| `npm run build` | `tsc -b && vite build` | Verifica tipos + genera `dist/` |
| `npm run preview` | `vite preview --host 0.0.0.0 --port 3000` | Sirve solo el cliente compilado, **sin la API**. Choca con `npm run dev` |
| `npm run start` | `node server.ts` | Requiere Node ≥ 22.6. Con `NODE_ENV=production` sirve `dist/` |
| `npm run lint` | `eslint .` | ⚠ `eslint.config.js` no define reglas ⇒ **siempre pasa**. No es una verificación útil todavía |
| `npm run test` | `vitest` | ⚠ **No hay ningún archivo de prueba** ⇒ sale sin ejecutar nada |
| `npm run test:e2e` | `playwright test` | ⚠ **No hay `playwright.config.ts` ni pruebas** ⇒ falla |

### 5.1 Verificación mínima recomendada

```bash
npm run build     # debe terminar sin errores de TypeScript
npm run lint      # debe terminar sin errores
```

> En Windows, si `npm run build` falla con **error 193**, es el binario nativo
> `lightningcss-win32-x64-msvc` truncado. Ver §6.

---

## 6. Problemas de instalación en Windows

```bash
# esbuild
npm install esbuild --no-save

# binding de rolldown
npm install @rolldown/binding-win32-x64-msvc --no-save

# lightningcss (el error 193 viene de aquí)
npm install lightningcss-win32-x64-msvc@1.33.0 --no-save
```

Después, limpia la caché de Vite si el error persiste:

```bash
rm -rf node_modules/.vite
```

---

## 7. Modos de operación

### 7.1 Modo Supabase (completo)

- El servidor usa la anon key para las lecturas públicas y el **JWT del usuario** para las
  peticiones autenticadas (de modo que RLS evalúa al usuario real).
- La sesión viaja en la cookie httpOnly `frenyer_session`.
- Los módulos que usan el cliente Supabase **del navegador** (inerte) **no funcionan** — ver
  [KNOWN_ISSUES.md](KNOWN_ISSUES.md#datos-no-se-persisten).

### 7.2 Modo local (degradado)

Se activa cuando Supabase **no está configurado** o cuando se define `FRENYER_ACCESS_KEY`.

- `POST /api/auth/local-login` valida la clave con comparación en tiempo constante y emite una
  cookie firmada con HMAC-SHA256, válida **12 horas**.
- Las llamadas a Supabase se hacen con la **anon key**, así que RLS las rechaza y el sistema
  cae a los archivos JSON de `data/`.
- **El modo local nunca toca la base de datos real.** Es un modo de continuidad, no de datos.

### 7.3 Modo público (sin sesión)

Sin sesión, la aplicación sigue funcionando como **tienda pública**: el catálogo se sirve con
`DEFAULT_CATALOG_PRODUCTS` y `POST /api/orders` acepta compras.

---

## 8. Estructura de `data/`

El directorio `data/` es el respaldo local. Está en `.gitignore` (línea 28) y **contiene PII**.

| Archivo | Contenido | Creado por |
|---|---|---|
| `.session-secret` | Secreto de firma de las sesiones locales | `resolveSessionSecret` (`server.ts:275-284`) |
| `auth-audit.log` | Eventos de autenticación (append-only) | `logAuthEvent` (`server.ts:356-362`) |
| `users.json` | Usuarios asociados (rol, cargo, estado, permisos) | `GET`/`POST`/`PATCH /api/users` |
| `customers.json` | CRM de clientes | `createLocalCollection('customers.json')` |
| `sales.json` | Ventas | `createLocalCollection('sales.json')` |
| `quotes.json` | Cotizaciones | `createLocalCollection('quotes.json')` |
| `expenses.json` | Gastos | `createLocalCollection('expenses.json')` |
| `expense_categories.json` | Categorías de gasto | `createLocalCollection('expense_categories.json')` |
| `exchange_rate_history.json` | Historial de tasas | `createLocalCollection('exchange_rate_history.json')` |
| `orders.json` | Pedidos de la tienda (tope 500) | `loadPersistedOrders` / `savePersistedOrder` |
| `inventory_adjustments.json` | Ajustes de stock (tope 500) | `loadPersistedAdjustments` |
| `bank_accounts.json` | Cuentas bancarias (3 por defecto) | `loadPersistedBankAccounts` |
| `bank_movements.json` | Kárdex bancario | `loadPersistedBankMovements` |
| `payment_methods.json` | Métodos de pago (5 por defecto) | `loadPersistedPaymentMethods` |
| `suppliers.json` | Proveedores | `loadPersistedSuppliers` |
| `branches.json` | Sedes | `loadPersistedBranches` |
| `accounts_receivable.json` | CxC (caché del servidor) | `loadPersistedReceivables` |
| `accounts_payable.json` | CxP | `loadPersistedPayables` |
| `purchases.json` | Compras internas | `loadPersistedPurchases` |
| `supabase-credentials.json` | Credenciales (opcional) | manual |

> ⚠ Las rutas se resuelven con `path.resolve(process.cwd(), 'data', file)`: son **relativas al
> directorio de trabajo**, no a la raíz del proyecto. Ejecutar el servidor desde otro directorio
> crea un árbol `data/` vacío en silencio.

> ⚠ Las escrituras **reescriben el archivo completo**, sin bloqueo ni renombre atómico. Dos
> peticiones concurrentes pueden perder una escritura. `orders.json` e
> `inventory_adjustments.json` se truncan silenciosamente a 500 filas.

---

## 9. Producción

### 9.1 Compilar y servir

```bash
npm run build
NODE_ENV=production node server.ts
```

### 9.2 🔴 Antes de arrancar en producción

El arranque en producción **falla** por un defecto conocido:

```
PathError: Missing parameter name at index 1: *
```

`server.ts:6603` usa `app.get('*', ...)`, sintaxis que Express 5 (path-to-regexp v8) ya no
acepta. Como `startServer()` se invoca sin `.catch()` (`server.ts:6613`), la excepción termina
en una promesa rechazada sin manejar.

**Corrección:**

```ts
// server.ts:6603
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});
```

### 9.3 Lista de verificación de producción

| # | Ítem | Bloqueante |
|---|---|---|
| 1 | Corregir `app.get('*')` → `app.get('/{*splat}')` | 🔴 Sí |
| 2 | Habilitar `app.set('trust proxy', 1)` y dejar de confiar en `x-forwarded-for` a ciegas | 🔴 Sí |
| 3 | Proteger `POST /api/users` y `POST /api/users/:id/toggle-status` | 🔴 Sí |
| 4 | Proteger `/api/inventory/*` | 🔴 Sí |
| 5 | Eliminar o proteger `/api/debug/*` | 🔴 Sí |
| 6 | Restringir las 13 tablas con `allow_all_*` | 🔴 Sí |
| 7 | `cors()` con `credentials: true` y origen explícito | 🟠 Sí |
| 8 | Unificar los tres vocabularios de rol | 🟠 Sí |
| 9 | Corregir el mojibake de `server.ts`, `README.md`, `metadata.json`, `index.html` | 🟠 Sí |
| 10 | Aplicar la tasa manual a `lastCertifiedRate` | 🟠 Sí |
| 11 | Corregir los 10 módulos que usan el cliente Supabase inerte del navegador | 🟠 Sí |
| 12 | Rewriting del historial del repositorio para eliminar la PII | 🟡 Deseable |
| 13 | Backups de `data/` con retención | 🟡 Deseable |

Detalle completo en [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

### 9.4 Reverse proxy

El servidor escucha en `0.0.0.0:3000`. Configura el proxy inverso para:

- Reenviar `X-Forwarded-Proto` y `X-Forwarded-Host` (los usa `getRequestOrigin`,
  `server.ts:6087-6092`, para construir la URL de retorno del OAuth de Google).
- Preservar la cookie `frenyer_session` con `SameSite=Strict` y `Secure` en producción.
- No terminar TLS en el servidor Node.

---

## 10. Copias de seguridad

| Qué | Dónde | Cómo |
|---|---|---|
| Base de datos | Supabase | Backups automáticos del panel (configurar retención) o `pg_dump` programado |
| Respaldo local | `data/` | Copiar el directorio; **contiene PII** ⇒ cifrar y limitar el acceso |
| Secretos | `data/.session-secret`, `.env.local` | Nunca versionar. Si `data/.session-secret` se pierde, todas las sesiones locales caducan |
| Código | Git | `git log --stat -- data/` para confirmar que no hay PII en el historial |

> 🔴 **Los datos personales ya estuvieron versionados.** `data/` (correos, teléfonos y
> direcciones de clientes) se versionó en commits anteriores. Se retiró del árbol en
> `2482998`, pero **sigue en el historial del repositorio público**. Eliminarlo exige
> reescribir el historial y hacer force-push.

---

## 11. Recursos relacionados

- [Arquitectura](../architecture/OVERVIEW.md)
- [Referencia de API](../architecture/API.md)
- [Base de datos](../architecture/DATABASE.md)
- [Problemas conocidos](KNOWN_ISSUES.md)
- [Solución de problemas](TROUBLESHOOTING.md)
