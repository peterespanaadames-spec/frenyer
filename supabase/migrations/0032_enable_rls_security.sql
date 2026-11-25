-- ============================================================================
-- 0032_enable_rls_security.sql
-- Cierra por completo el acceso publico a las tablas del esquema `public`.
--
-- PRERREQUISITO OBLIGATORIO:
--   El backend (api/server.ts) ya debe estar desplegado usando
--   SUPABASE_SERVICE_ROLE_KEY. Si esta migracion se ejecuta antes de ese
--   despliegue, la API deja de funcionar (permission denied for table ...).
--
-- QUE HACE:
--   1. Habilita RLS en TODAS las tablas de public (incluidas las creadas
--      fuera de las migraciones).
--   2. Elimina todas las politicas existentes: sin politicas, RLS deniega
--      todo salvo para service_role, que tiene BYPASSRLS.
--   3. Revoca el acceso directo de anon y authenticated a tablas, secuencias
--      y funciones.
--   4. Revoca los privilegios por defecto para objetos futuros.
--   5. Conserva el acceso total de service_role.
--   6. Fuerza security_invoker en las vistas de public.
--
-- ES IDEMPOTENTE: se puede ejecutar varias veces sin errores.
--
-- ANTES DE EJECUTAR:
--   - Guarda un respaldo: pg_dump del esquema y
--     select * from pg_policies where schemaname = 'public';
--   - Confirma que SUPABASE_SERVICE_ROLE_KEY existe en Vercel (frenyer y
--     compuflores) y en el entorno local.
-- ============================================================================

begin;

-- 1) Habilitar RLS en todas las tablas y tablas particionadas de public.
do $$
declare r record;
begin
  for r in
    select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.tabla);
  end loop;
end $$;

-- 2) Eliminar todas las politicas de public.
--    Las politicas permisivas USING (true) dejarian RLS abierto aunque este
--    habilitado, por eso se eliminan todas. Con cero politicas, cualquier rol
--    sin BYPASSRLS queda denegado.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Revocar acceso directo de los roles publicos de Supabase.
revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Las funciones se conceden a PUBLIC por defecto en PostgreSQL. Sin esto,
-- una funcion SECURITY DEFINER seguiria siendo invocable via RPC.
revoke all privileges on all functions in schema public from PUBLIC;

-- 4) Revocar tambien los privilegios por defecto de objetos futuros.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke execute on functions from PUBLIC;

-- 5) Garantizar que service_role conserva acceso total.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 6) Vistas: que respeten la RLS de quien consulta.
--    Las vistas materializadas no admiten security_invoker; sus permisos ya
--    quedaron revocados en el paso 3.
do $$
declare r record;
begin
  for r in
    select c.relname as vista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  loop
    begin
      execute format('alter view public.%I set (security_invoker = true)', r.vista);
    exception when others then
      null;
    end;
  end loop;
end $$;

commit;

-- ============================================================================
-- VERIFICACION (ejecutar despues, fuera de la transaccion)
-- ============================================================================
-- a) Ninguna tabla debe quedar con rls = false:
--    select c.relname as tabla, c.relrowsecurity as rls
--    from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind in ('r', 'p')
--    order by c.relrowsecurity, c.relname;
--
-- b) No deben quedar politicas:
--    select tablename, policyname from pg_policies where schemaname = 'public';
--
-- c) Prueba externa con la clave anonima (debe responder permission denied):
--    curl "$SUPABASE_URL/rest/v1/sales?select=id&limit=1" \
--         -H "apikey: $SUPABASE_ANON_KEY"
--
-- ROLLBACK:
--    No hay rollback automatico. Para revertir, restaura el respaldo de
--    pg_policies y vuelve a otorgar los permisos que necesites. No desactives
--    RLS: eso reabre la alerta.
-- ============================================================================
