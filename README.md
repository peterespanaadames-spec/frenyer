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

3. Aplica, en orden numérico, todas las migraciones de `supabase/migrations/` en el SQL Editor de Supabase. La migración `0009_lock_down_api_rls.sql` sustituye las políticas RLS permisivas heredadas y debe estar aplicada para acceder a datos.
4. Crea el usuario en Supabase Auth y asígnalo a una organización en `organization_members`. El inicio de sesión requiere una membresía válida. El rol `viewer` (y roles desconocidos) es de solo lectura; asigna un rol operativo autorizado para habilitar escrituras. Los cambios manuales de tasa quedan reservados a roles administrativos.

## Alcance de esta entrega
Shell visual, dashboard y módulos navegables de Ventas/POS, Inventario, Finanzas, CxC/CxP, Clientes y Alma. Las rutas de datos de la API validan sesión y membresía; PostgreSQL aplica RLS por organización. Cuentas por Pagar requiere también el vínculo a proveedores de la migración `0008_accounts_payable_supplier_link.sql`.
