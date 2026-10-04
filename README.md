# Frenyer
Starter ejecutable de la plataforma SaaS Frenyer en español.

## Stack
React 19 · Vite · TypeScript · Supabase/PostgreSQL · React Router · Recharts · Lucide.

## Arranque
cp .env.example .env.local
npm install
npm run dev

Aplicar `supabase/migrations/0001_initial.sql` con Supabase CLI antes de usar datos reales.

## Alcance de esta entrega
Shell visual, dashboard y seis módulos navegables con datos demostrativos: Ventas/POS, Inventario, Finanzas, CxC/CxP, Clientes y Alma. Incluye base inicial multi-tenant/RLS. Las transacciones reales y reglas fiscales/contables deben implementarse en las siguientes migraciones.
