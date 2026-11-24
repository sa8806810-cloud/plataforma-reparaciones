-- FixNow: perfiles de cliente/trabajador y experiencia profesional.
-- Ejecutar despues de 20261123180000_guest_technician_workflow.sql y
-- 20261123194000_fixnow_role_admin_workflows.sql.
-- Pegar y ejecutar completo en Supabase Dashboard > SQL Editor.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_token uuid,
  session_updated_at timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.administradores enable row level security;
revoke all on table public.administradores from public, anon, authenticated;
grant select (user_id, session_updated_at, creado_en)
  on table public.administradores to authenticated;

drop policy if exists "Administradores solo consultan su propio registro"
  on public.administradores;
create policy "Administradores solo consultan su propio registro"
  on public.administradores
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente'
    check (rol in ('cliente', 'tecnico')),
  nombre text not null default '',
  localidad text not null default '',
  avatar_url text,
  titular text not null default '',
  anios_experiencia smallint
    check (anios_experiencia is null or anios_experiencia between 0 and 80),
  tarifa_base numeric(10, 2)
    check (tarifa_base is null or tarifa_base >= 0),
  acerca_de text not null default '',
  disponibilidad text not null default '',
  habilidades text[] not null default '{}',
  certificaciones text[] not null default '{}',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.experiencias_trabajador (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references public.perfiles(user_id) on delete cascade,
  puesto text not null,
  empresa text not null default '',
  fecha_inicio date not null,
  fecha_fin date,
  actual boolean not null default false,
  descripcion text not null default '',
  creado_en timestamptz not null default now(),
  constraint experiencia_fechas_validas
    check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint experiencia_actual_sin_fecha_fin
    check (not actual or fecha_fin is null)
);

create index if not exists experiencias_trabajador_fecha_idx
  on public.experiencias_trabajador (trabajador_id, fecha_inicio desc);

create index if not exists perfiles_rol_localidad_idx
  on public.perfiles (rol, localidad);

create or replace function private.es_tecnico_verificado(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.tecnicos_aprobados as ta
      where ta.usuario_id = p_user_id
    );
$$;

revoke all on function private.es_tecnico_verificado(uuid) from public, anon, authenticated;
grant execute on function private.es_tecnico_verificado(uuid) to anon, authenticated;

alter table public.perfiles enable row level security;
revoke all on table public.perfiles from public, anon, authenticated;
grant select on table public.perfiles to anon, authenticated;
grant update (
  nombre,
  localidad,
  avatar_url,
  titular,
  anios_experiencia,
  tarifa_base,
  acerca_de,
  disponibilidad,
  habilidades,
  certificaciones,
  actualizado_en
) on table public.perfiles to authenticated;

drop policy if exists "Perfiles propios o de tecnicos verificados" on public.perfiles;
create policy "Perfiles propios o de tecnicos verificados"
  on public.perfiles
  for select
  to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or (
      rol = 'tecnico'
      and (select private.es_tecnico_verificado(user_id))
    )
  );

drop policy if exists "Usuarios actualizan su propio perfil" on public.perfiles;
create policy "Usuarios actualizan su propio perfil"
  on public.perfiles
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and rol = 'tecnico'
  )
  with check (
    (select auth.uid()) = user_id
    and rol = 'tecnico'
  );

create or replace function public.proteger_identidad_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.rol <> old.rol then
    raise exception 'El identificador y el rol del perfil no se pueden cambiar'
      using errcode = '42501';
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

revoke all on function public.proteger_identidad_perfil() from public, anon, authenticated;
drop trigger if exists proteger_identidad_perfil on public.perfiles;
create trigger proteger_identidad_perfil
  before update on public.perfiles
  for each row execute function public.proteger_identidad_perfil();

create or replace function public.crear_perfil_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  v_rol := case
    when new.raw_user_meta_data ->> 'rol' = 'tecnico' then 'tecnico'
    else 'cliente'
  end;

  insert into public.perfiles (user_id, rol, nombre, localidad, titular)
  values (
    new.id,
    v_rol,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'localidad', ''),
    coalesce(new.raw_user_meta_data ->> 'oficio', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.crear_perfil_auth() from public, anon, authenticated;
drop trigger if exists crear_perfil_auth on auth.users;
create trigger crear_perfil_auth
  after insert on auth.users
  for each row execute function public.crear_perfil_auth();

insert into public.perfiles (user_id, rol, nombre, localidad, titular)
select
  u.id,
  case when u.raw_user_meta_data ->> 'rol' = 'tecnico' then 'tecnico' else 'cliente' end,
  coalesce(u.raw_user_meta_data ->> 'nombre', ''),
  coalesce(u.raw_user_meta_data ->> 'localidad', ''),
  coalesce(u.raw_user_meta_data ->> 'oficio', '')
from auth.users as u
on conflict (user_id) do nothing;

alter table public.experiencias_trabajador enable row level security;
revoke all on table public.experiencias_trabajador from public, anon, authenticated;
grant select on table public.experiencias_trabajador to anon, authenticated;
grant insert, update, delete on table public.experiencias_trabajador to authenticated;

drop policy if exists "Experiencia propia o de tecnicos verificados"
  on public.experiencias_trabajador;
create policy "Experiencia propia o de tecnicos verificados"
  on public.experiencias_trabajador
  for select
  to anon, authenticated
  using (
    (select auth.uid()) = trabajador_id
    or (select private.es_tecnico_verificado(trabajador_id))
  );

drop policy if exists "Tecnicos editan su propia experiencia"
  on public.experiencias_trabajador;
create policy "Tecnicos editan su propia experiencia"
  on public.experiencias_trabajador
  for insert
  to authenticated
  with check (
    trabajador_id = (select auth.uid())
    and exists (
      select 1
      from public.perfiles as p
      where p.user_id = (select auth.uid())
        and p.rol = 'tecnico'
    )
  );

drop policy if exists "Tecnicos actualizan su propia experiencia"
  on public.experiencias_trabajador;
create policy "Tecnicos actualizan su propia experiencia"
  on public.experiencias_trabajador
  for update
  to authenticated
  using (trabajador_id = (select auth.uid()))
  with check (
    trabajador_id = (select auth.uid())
    and exists (
      select 1
      from public.perfiles as p
      where p.user_id = (select auth.uid())
        and p.rol = 'tecnico'
    )
  );

drop policy if exists "Tecnicos eliminan su propia experiencia"
  on public.experiencias_trabajador;
create policy "Tecnicos eliminan su propia experiencia"
  on public.experiencias_trabajador
  for delete
  to authenticated
  using (
    trabajador_id = (select auth.uid())
    and exists (
      select 1
      from public.perfiles as p
      where p.user_id = (select auth.uid())
        and p.rol = 'tecnico'
    )
  );

create or replace function public.listar_mis_trabajos()
returns table (
  id uuid,
  categoria text,
  subtipo text,
  titulo text,
  descripcion text,
  localidad text,
  direccion text,
  estado text,
  creado_en timestamptz,
  detalles_tecnicos jsonb,
  tecnico_id uuid,
  tecnico_nombre text,
  tecnico_oficio text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.categoria,
    t.subtipo,
    t.titulo,
    t.descripcion,
    t.localidad,
    t.direccion,
    t.estado,
    t.creado_en,
    t.detalles_tecnicos,
    t.tecnico_id,
    coalesce(p.nombre, u.raw_user_meta_data ->> 'nombre', 'Tecnico asignado'),
    coalesce(p.titular, u.raw_user_meta_data ->> 'oficio')
  from public.trabajos as t
  left join auth.users as u on u.id = t.tecnico_id
  left join public.perfiles as p on p.user_id = t.tecnico_id
  where t.cliente_id = (select auth.uid())
  order by t.creado_en desc;
end;
$$;

drop function if exists public.admin_obtener_resumen(uuid);
create function public.admin_obtener_resumen(p_session_token uuid)
returns table (
  total_solicitudes bigint,
  pendientes bigint,
  en_curso bigint,
  completadas bigint,
  clientes bigint,
  trabajadores bigint,
  tecnicos_activos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.trabajos),
    (select count(*) from public.trabajos where estado = 'solicitado'),
    (select count(*) from public.trabajos where estado in ('aceptado', 'en_camino', 'en_proceso')),
    (select count(*) from public.trabajos where estado = 'completado'),
    (select count(*) from public.perfiles where rol = 'cliente'),
    (select count(*) from public.perfiles where rol = 'tecnico'),
    (select count(*) from public.tecnicos_aprobados);
end;
$$;

drop function if exists public.admin_listar_tecnicos(uuid);
create function public.admin_listar_tecnicos(p_session_token uuid)
returns table (
  tecnico_id uuid,
  correo text,
  nombre text,
  telefono text,
  localidad text,
  oficio text,
  aprobado boolean,
  aprobado_en timestamptz,
  avatar_url text,
  titular text,
  anios_experiencia smallint,
  tarifa_base numeric,
  acerca_de text,
  disponibilidad text,
  habilidades text[],
  certificaciones text[],
  experiencias jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(p.nombre, u.raw_user_meta_data ->> 'nombre', ''),
    coalesce(u.raw_user_meta_data ->> 'telefono', ''),
    coalesce(p.localidad, u.raw_user_meta_data ->> 'localidad', ''),
    coalesce(p.titular, u.raw_user_meta_data ->> 'oficio', ''),
    ta.usuario_id is not null,
    ta.aprobado_en,
    p.avatar_url,
    p.titular,
    p.anios_experiencia,
    p.tarifa_base,
    p.acerca_de,
    p.disponibilidad,
    p.habilidades,
    p.certificaciones,
    coalesce(exp.experiencias, '[]'::jsonb)
  from public.perfiles as p
  join auth.users as u on u.id = p.user_id
  left join public.tecnicos_aprobados as ta on ta.usuario_id = p.user_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'puesto', e.puesto,
        'empresa', e.empresa,
        'fecha_inicio', e.fecha_inicio,
        'fecha_fin', e.fecha_fin,
        'actual', e.actual,
        'descripcion', e.descripcion
      )
      order by e.fecha_inicio desc
    ) as experiencias
    from public.experiencias_trabajador as e
    where e.trabajador_id = p.user_id
  ) as exp on true
  where p.rol = 'tecnico'
  order by (ta.usuario_id is not null), p.nombre;
end;
$$;

create or replace function public.admin_establecer_aprobacion_tecnico(
  p_session_token uuid,
  p_tecnico_id uuid,
  p_aprobar boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  if p_aprobar then
    if not exists (
      select 1
      from public.perfiles as p
      where p.user_id = p_tecnico_id
        and p.rol = 'tecnico'
    ) then
      raise exception 'El usuario no existe o no tiene perfil de trabajador'
        using errcode = '22023';
    end if;

    insert into public.tecnicos_aprobados (usuario_id)
    values (p_tecnico_id)
    on conflict (usuario_id) do nothing;
  else
    delete from public.tecnicos_aprobados
    where usuario_id = p_tecnico_id;
  end if;

  return true;
end;
$$;

revoke all on function public.proteger_identidad_perfil() from public, anon, authenticated;
revoke all on function public.crear_perfil_auth() from public, anon, authenticated;
revoke all on function public.listar_mis_trabajos() from public, anon, authenticated;
revoke all on function public.admin_obtener_resumen(uuid) from public, anon, authenticated;
revoke all on function public.admin_listar_tecnicos(uuid) from public, anon, authenticated;
revoke all on function public.admin_establecer_aprobacion_tecnico(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.listar_mis_trabajos() to authenticated;
grant execute on function public.admin_obtener_resumen(uuid) to authenticated;
grant execute on function public.admin_listar_tecnicos(uuid) to authenticated;
grant execute on function public.admin_establecer_aprobacion_tecnico(uuid, uuid, boolean) to authenticated;

commit;

-- Primer administrador: crea y confirma primero la cuenta en Authentication.
-- Sustituye el correo por el de esa cuenta y ejecuta esta consulta una sola vez.
-- insert into public.administradores (user_id)
-- select id
-- from auth.users
-- where lower(email) = lower('TU_CORREO_ADMIN@EJEMPLO.COM')
-- on conflict (user_id) do nothing;
