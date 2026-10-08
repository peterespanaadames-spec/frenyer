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

3. Aplica, en orden numérico, todas las migraciones de `supabase/migrations/` en el SQL Editor de Supabase. Las migraciones `0009` y `0010` son necesarias para RLS seguro y el registro con organización automática.
4. Habilita la confirmación de correo en Supabase Auth. Cada alta crea una organización aislada y asigna al primer usuario el rol `admin`; nunca se toma el rol desde los datos del navegador. Los roles `viewer` y desconocidos son de solo lectura.
5. Para CAPTCHA real, define `VITE_TURNSTILE_SITE_KEY` en `.env.local` y configura el secreto Turnstile en **Supabase → Authentication → Bot and Abuse Protection**. Sin claves no se simula una verificación; el formulario sigue funcionando sin el widget.
6. En Supabase Auth, añade `http://localhost:3000/` (y el dominio de producción) a las URLs de redirección permitidas para confirmar el correo y recuperar contraseñas.

## Alcance de esta entrega
Shell visual, dashboard y módulos navegables de Ventas/POS, Inventario, Finanzas, CxC/CxP, Clientes y Alma. Las rutas de datos de la API validan sesión y membresía; PostgreSQL aplica RLS por organización. Cuentas por Pagar requiere también el vínculo a proveedores de la migración `0008_accounts_payable_supplier_link.sql`.
