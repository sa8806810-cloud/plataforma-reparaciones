-- FixNow: paneles por rol, administracion segura y sesion administrativa unica.
-- Pegar y ejecutar completo en Supabase Dashboard > SQL Editor.
-- Requiere public.trabajos y public.tecnicos_aprobados del flujo de invitados y tecnicos.

begin;

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

create index if not exists trabajos_tecnico_estado_creado_idx
  on public.trabajos (tecnico_id, estado, creado_en desc);

create index if not exists trabajos_cliente_estado_creado_idx
  on public.trabajos (cliente_id, estado, creado_en desc);

create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.administradores as a
      where a.user_id = (select auth.uid())
    );
$$;

create or replace function public._admin_sesion_vigente(p_session_token uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_session_token is not null
    and exists (
      select 1
      from public.administradores as a
      where a.user_id = (select auth.uid())
        and a.session_token = p_session_token
    );
$$;

create or replace function public.admin_iniciar_sesion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_token uuid;
begin
  update public.administradores as a
  set session_token = gen_random_uuid(),
      session_updated_at = now()
  where a.user_id = (select auth.uid())
  returning a.session_token into v_session_token;

  if v_session_token is null then
    raise exception 'Esta cuenta no tiene acceso de administrador'
      using errcode = '42501';
  end if;

  return v_session_token;
end;
$$;

create or replace function public.admin_validar_sesion(p_session_token uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._admin_sesion_vigente(p_session_token);
$$;

create or replace function public.admin_cerrar_sesion(p_session_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  update public.administradores as a
  set session_token = null,
      session_updated_at = now()
  where a.user_id = (select auth.uid())
    and a.session_token = p_session_token;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

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
    coalesce(u.raw_user_meta_data ->> 'nombre', 'Tecnico asignado'),
    u.raw_user_meta_data ->> 'oficio'
  from public.trabajos as t
  left join auth.users as u on u.id = t.tecnico_id
  where t.cliente_id = (select auth.uid())
  order by t.creado_en desc;
end;
$$;

create or replace function public.cancelar_mi_trabajo(p_trabajo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;

  update public.trabajos as t
  set estado = 'cancelado'
  where t.id = p_trabajo_id
    and t.cliente_id = (select auth.uid())
    and t.tecnico_id is null
    and t.estado = 'solicitado';

  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'La solicitud ya fue aceptada o no te pertenece'
      using errcode = '42501';
  end if;

  return true;
end;
$$;

create or replace function public.actualizar_estado_trabajo(
  p_trabajo_id uuid,
  p_nuevo_estado text
)
returns public.trabajos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajo public.trabajos;
begin
  if (select auth.uid()) is null or (select public.es_tecnico_aprobado()) is not true then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;

  if p_nuevo_estado not in ('en_camino', 'en_proceso', 'completado') then
    raise exception 'Estado de trabajo no permitido'
      using errcode = '22023';
  end if;

  update public.trabajos as t
  set estado = p_nuevo_estado
  where t.id = p_trabajo_id
    and t.tecnico_id = (select auth.uid())
    and (
      (t.estado = 'aceptado' and p_nuevo_estado = 'en_camino')
      or (t.estado = 'en_camino' and p_nuevo_estado = 'en_proceso')
      or (t.estado = 'en_proceso' and p_nuevo_estado = 'completado')
    )
  returning t.* into v_trabajo;

  if not found then
    raise exception 'No se pudo actualizar el estado de este trabajo'
      using errcode = '42501';
  end if;

  return v_trabajo;
end;
$$;

create or replace function public.admin_obtener_resumen(p_session_token uuid)
returns table (
  total_solicitudes bigint,
  pendientes bigint,
  en_curso bigint,
  completadas bigint,
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
    count(t.id),
    count(t.id) filter (where t.estado = 'solicitado'),
    count(t.id) filter (where t.estado in ('aceptado', 'en_camino', 'en_proceso')),
    count(t.id) filter (where t.estado = 'completado'),
    (select count(*) from public.tecnicos_aprobados)
  from public.trabajos as t;
end;
$$;

create or replace function public.admin_listar_tecnicos(p_session_token uuid)
returns table (
  tecnico_id uuid,
  correo text,
  nombre text,
  telefono text,
  localidad text,
  oficio text,
  aprobado boolean,
  aprobado_en timestamptz
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
    coalesce(u.raw_user_meta_data ->> 'nombre', ''),
    coalesce(u.raw_user_meta_data ->> 'telefono', ''),
    coalesce(u.raw_user_meta_data ->> 'localidad', ''),
    coalesce(u.raw_user_meta_data ->> 'oficio', ''),
    ta.usuario_id is not null,
    ta.aprobado_en
  from auth.users as u
  left join public.tecnicos_aprobados as ta on ta.usuario_id = u.id
  where u.raw_user_meta_data ->> 'rol' = 'tecnico'
  order by (ta.usuario_id is not null), u.created_at desc;
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
      from auth.users as u
      where u.id = p_tecnico_id
        and u.raw_user_meta_data ->> 'rol' = 'tecnico'
    ) then
      raise exception 'El usuario no existe o no tiene perfil de tecnico'
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

create or replace function public.admin_listar_trabajos(p_session_token uuid)
returns setof public.trabajos
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
  select t.*
  from public.trabajos as t
  order by t.creado_en desc;
end;
$$;

create or replace function public.admin_actualizar_trabajo(
  p_session_token uuid,
  p_trabajo_id uuid,
  p_estado text,
  p_tecnico_id uuid
)
returns public.trabajos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajo public.trabajos;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  if p_estado is null
    or p_estado not in ('solicitado', 'aceptado', 'en_camino', 'en_proceso', 'completado', 'cancelado') then
    raise exception 'Estado de trabajo no permitido'
      using errcode = '22023';
  end if;

  if p_tecnico_id is not null and not exists (
    select 1
    from public.tecnicos_aprobados as ta
    where ta.usuario_id = p_tecnico_id
  ) then
    raise exception 'El tecnico seleccionado no esta aprobado'
      using errcode = '22023';
  end if;

  if p_tecnico_id is null and p_estado in ('aceptado', 'en_camino', 'en_proceso') then
    raise exception 'Un trabajo activo requiere un tecnico asignado'
      using errcode = '22023';
  end if;

  if p_tecnico_id is not null and p_estado in ('solicitado', 'cancelado') then
    raise exception 'Una solicitud pendiente o cancelada no puede conservar tecnico asignado'
      using errcode = '22023';
  end if;

  update public.trabajos as t
  set estado = p_estado,
      tecnico_id = p_tecnico_id
  where t.id = p_trabajo_id
  returning t.* into v_trabajo;

  if not found then
    raise exception 'No se encontro la solicitud'
      using errcode = 'P0002';
  end if;

  return v_trabajo;
end;
$$;

revoke all on function public.es_administrador() from public, anon, authenticated;
revoke all on function public._admin_sesion_vigente(uuid) from public, anon, authenticated;
revoke all on function public.admin_iniciar_sesion() from public, anon, authenticated;
revoke all on function public.admin_validar_sesion(uuid) from public, anon, authenticated;
revoke all on function public.admin_cerrar_sesion(uuid) from public, anon, authenticated;
revoke all on function public.listar_mis_trabajos() from public, anon, authenticated;
revoke all on function public.cancelar_mi_trabajo(uuid) from public, anon, authenticated;
revoke all on function public.actualizar_estado_trabajo(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_obtener_resumen(uuid) from public, anon, authenticated;
revoke all on function public.admin_listar_tecnicos(uuid) from public, anon, authenticated;
revoke all on function public.admin_establecer_aprobacion_tecnico(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_listar_trabajos(uuid) from public, anon, authenticated;
revoke all on function public.admin_actualizar_trabajo(uuid, uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.es_administrador() to authenticated;
grant execute on function public.admin_iniciar_sesion() to authenticated;
grant execute on function public.admin_validar_sesion(uuid) to authenticated;
grant execute on function public.admin_cerrar_sesion(uuid) to authenticated;
grant execute on function public.listar_mis_trabajos() to authenticated;
grant execute on function public.cancelar_mi_trabajo(uuid) to authenticated;
grant execute on function public.actualizar_estado_trabajo(uuid, text) to authenticated;
grant execute on function public.admin_obtener_resumen(uuid) to authenticated;
grant execute on function public.admin_listar_tecnicos(uuid) to authenticated;
grant execute on function public.admin_establecer_aprobacion_tecnico(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_listar_trabajos(uuid) to authenticated;
grant execute on function public.admin_actualizar_trabajo(uuid, uuid, text, uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trabajos'
  ) then
    execute 'alter publication supabase_realtime add table public.trabajos';
  end if;
end;
$$;

commit;

-- Primer administrador (ejecutar despues de crear y confirmar la cuenta en Auth):
-- insert into public.administradores (user_id)
-- select id from auth.users where lower(email) = lower('TU_CORREO_ADMIN@EJEMPLO.COM')
-- on conflict (user_id) do nothing;
