-- Tabla de informes compartidos de «¿Es segura tu web?».
-- Ejecútalo una vez en el editor SQL de tu proyecto de Supabase.
--
-- Seguridad: con RLS activado y SIN políticas, la clave pública (anon) no puede leer ni escribir nada.
-- Solo el servidor de la aplicación, con la clave de servicio (service_role), accede a la tabla.

create table if not exists public.informes (
  id      text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  informe jsonb not null,
  creado  timestamptz not null default now(),
  caduca  timestamptz not null
);

alter table public.informes enable row level security;

-- La lectura ya ignora lo caducado; este índice acelera el borrado de lo viejo.
create index if not exists informes_caduca_idx on public.informes (caduca);

-- Borrado diario de informes caducados (necesita la extensión pg_cron: Database > Extensions > pg_cron).
-- Si no quieres usar pg_cron, puedes lanzar a mano:  delete from public.informes where caduca < now();
-- select cron.schedule('borrar-informes-caducados', '17 3 * * *', $$ delete from public.informes where caduca < now() $$);
