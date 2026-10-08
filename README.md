# Frenyer
Starter ejecutable de la plataforma SaaS Frenyer en español.

## Stack
React 19 · Vite · TypeScript · Supabase/PostgreSQL · React Router · Recharts · Lucide.

## Arranque

1. Copia `.env.example` a `.env.local` y configura la URL y la clave publicable de tu proyecto Supabase. No publiques archivos `.env`.
2. Instala dependencias y arranca la aplicación:

```bash
npm install
npm run dev
```

3. Por ahora `VITE_AUTH_REQUIRED=false` permite navegar la interfaz sin iniciar sesión. Las rutas API y RLS de Supabase siguen exigiendo una sesión para consultar o cambiar datos protegidos. Para volver a exigir inicio de sesión, establece `VITE_AUTH_REQUIRED=true` y reinicia la aplicación.
4. Para habilitar cuentas reales, aplica en orden numérico todas las migraciones de `supabase/migrations/` en SQL Editor, incluyendo `0009` y `0010`. Habilita la confirmación de correo en Supabase Auth. El registro crea una organización aislada y asigna `admin` al primer usuario; los roles `viewer` y desconocidos son de solo lectura.
5. Para CAPTCHA real, define `VITE_TURNSTILE_SITE_KEY` y configura el secreto en **Supabase → Authentication → Bot and Abuse Protection**. Añade `http://localhost:3000/` y el dominio de producción a las URLs permitidas de redirección.

## Alcance de esta entrega
Shell visual, dashboard y módulos navegables de Ventas/POS, Inventario, Finanzas, CxC/CxP, Clientes y Alma. Las rutas de datos de la API validan sesión y membresía; PostgreSQL aplica RLS por organización. Cuentas por Pagar requiere también el vínculo a proveedores de la migración `0008_accounts_payable_supplier_link.sql`.
