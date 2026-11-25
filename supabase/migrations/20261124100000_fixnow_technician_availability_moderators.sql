-- FixNow: cobertura y disponibilidad, perfiles de cliente, moderadores y edición administrativa.
-- Ejecutar después de 20261124090000_fixnow_admin_control_center.sql.

begin;

alter table public.perfiles
  add column if not exists latitud double precision,
  add column if not exists longitud double precision,
  add column if not exists radio_km numeric(5, 2) not null default 10,
  add column if not exists en_linea boolean not null default false,
  add column if not exists disponibilidad_semanal jsonb not null default '{}'::jsonb,
  add column if not exists fechas_bloqueadas jsonb not null default '[]'::jsonb,
  add column if not exists direccion_habitual text not null default '',
  add column if not exists preferencias_contacto text not null default '';

alter table public.perfiles drop constraint if exists perfiles_rol_check;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_rol_permitido'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_rol_permitido
      check (rol in ('cliente', 'tecnico', 'moderador'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_ubicacion_valida'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_ubicacion_valida
      check (
        (latitud is null or latitud between -90 and 90)
        and (longitud is null or longitud between -180 and 180)
        and radio_km between 1 and 100
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_agenda_valida'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_agenda_valida
      check (
        jsonb_typeof(disponibilidad_semanal) = 'object'
        and jsonb_typeof(fechas_bloqueadas) = 'array'
      );
  end if;
end;
$$;

create table if not exists public.moderadores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol_anterior text not null default 'cliente'
    check (rol_anterior in ('cliente', 'tecnico')),
  puede_aprobar_tecnicos boolean not null default false,
  puede_gestionar_solicitudes boolean not null default false,
  puede_responder_soporte boolean not null default false,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.moderadores enable row level security;
revoke all on table public.moderadores from public, anon, authenticated;

create or replace function private.limpiar_moderador_al_cambiar_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol and new.rol <> 'moderador' then
    delete from public.moderadores where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.limpiar_moderador_al_cambiar_rol() from public, anon, authenticated;
drop trigger if exists limpiar_moderador_al_cambiar_rol on public.perfiles;
create trigger limpiar_moderador_al_cambiar_rol
  after update of rol on public.perfiles
  for each row execute function private.limpiar_moderador_al_cambiar_rol();

create or replace function private.moderador_tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.moderadores as m
      join public.perfiles as p on p.user_id = m.user_id
      where m.user_id = (select auth.uid())
        and p.rol = 'moderador'
        and (
          p.estado_cuenta = 'activo'
          or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
        )
        and case p_permiso
          when 'aprobar_tecnicos' then m.puede_aprobar_tecnicos
          when 'gestionar_solicitudes' then m.puede_gestionar_solicitudes
          when 'responder_soporte' then m.puede_responder_soporte
          else false
        end
    );
$$;

revoke all on function private.moderador_tiene_permiso(text) from public, anon, authenticated;

create or replace function public.moderador_mis_permisos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'puede_aprobar_tecnicos', m.puede_aprobar_tecnicos,
    'puede_gestionar_solicitudes', m.puede_gestionar_solicitudes,
    'puede_responder_soporte', m.puede_responder_soporte
  )
  into v_resultado
  from public.moderadores as m
  join public.perfiles as p on p.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and p.rol = 'moderador'
    and (
      p.estado_cuenta = 'activo'
      or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
    );

  if v_resultado is null then
    raise exception 'Esta cuenta no tiene acceso de moderacion activo'
      using errcode = '42501';
  end if;

  return v_resultado;
end;
$$;

create or replace function public.admin_control_listar_moderadores(p_session_token uuid)
returns table (
  user_id uuid,
  correo text,
  nombre text,
  rol_anterior text,
  puede_aprobar_tecnicos boolean,
  puede_gestionar_solicitudes boolean,
  puede_responder_soporte boolean,
  creado_en timestamptz
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
    m.user_id,
    u.email::text,
    p.nombre,
    m.rol_anterior,
    m.puede_aprobar_tecnicos,
    m.puede_gestionar_solicitudes,
    m.puede_responder_soporte,
    m.creado_en
  from public.moderadores as m
  join auth.users as u on u.id = m.user_id
  join public.perfiles as p on p.user_id = m.user_id
  where p.rol = 'moderador'
  order by m.creado_en desc;
end;
$$;

create or replace function public.admin_control_configurar_moderador(
  p_session_token uuid,
  p_correo text,
  p_permisos jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_rol text;
  v_rol_anterior text;
  v_aprobar boolean;
  v_solicitudes boolean;
  v_soporte boolean;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_correo, ''))) not between 3 and 320
    or jsonb_typeof(p_permisos) is distinct from 'object'
    or jsonb_typeof(p_permisos -> 'puede_aprobar_tecnicos') is distinct from 'boolean'
    or jsonb_typeof(p_permisos -> 'puede_gestionar_solicitudes') is distinct from 'boolean'
    or jsonb_typeof(p_permisos -> 'puede_responder_soporte') is distinct from 'boolean' then
    raise exception 'Correo o permisos de moderacion no validos'
      using errcode = '22023';
  end if;

  select u.id, p.rol into v_user_id, v_rol
  from auth.users as u
  join public.perfiles as p on p.user_id = u.id
  where lower(u.email) = lower(btrim(p_correo))
    and u.id <> (select auth.uid())
    and not exists (
      select 1 from public.administradores as a where a.user_id = u.id
    );

  if v_user_id is null then
    raise exception 'No existe una cuenta registrada elegible con ese correo'
      using errcode = 'P0002';
  end if;
  if v_rol not in ('cliente', 'moderador') then
    raise exception 'Solo se puede nombrar moderador a una cuenta de cliente'
      using errcode = '22023';
  end if;

  select coalesce(m.rol_anterior, v_rol)
  into v_rol_anterior
  from public.moderadores as m
  where m.user_id = v_user_id;
  v_rol_anterior := coalesce(v_rol_anterior, case when v_rol = 'moderador' then 'cliente' else v_rol end);
  v_aprobar := (p_permisos ->> 'puede_aprobar_tecnicos')::boolean;
  v_solicitudes := (p_permisos ->> 'puede_gestionar_solicitudes')::boolean;
  v_soporte := (p_permisos ->> 'puede_responder_soporte')::boolean;

  insert into public.moderadores (
    user_id, rol_anterior, puede_aprobar_tecnicos,
    puede_gestionar_solicitudes, puede_responder_soporte, creado_por, actualizado_en
  )
  values (
    v_user_id, v_rol_anterior, v_aprobar, v_solicitudes, v_soporte,
    (select auth.uid()), now()
  )
  on conflict (user_id) do update
  set puede_aprobar_tecnicos = excluded.puede_aprobar_tecnicos,
      puede_gestionar_solicitudes = excluded.puede_gestionar_solicitudes,
      puede_responder_soporte = excluded.puede_responder_soporte,
      actualizado_en = now();

  update public.perfiles set rol = 'moderador' where user_id = v_user_id;
  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'moderador_configurado',
    v_user_id,
    jsonb_build_object(
      'puede_aprobar_tecnicos', v_aprobar,
      'puede_gestionar_solicitudes', v_solicitudes,
      'puede_responder_soporte', v_soporte
    )
  );
  return true;
end;
$$;

create or replace function public.admin_control_revocar_moderador(
  p_session_token uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_anterior text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = (select auth.uid()) or exists (
    select 1 from public.administradores as a where a.user_id = p_user_id
  ) then
    raise exception 'No se puede revocar esta cuenta administrativa'
      using errcode = '42501';
  end if;

  delete from public.moderadores as m
  where m.user_id = p_user_id
  returning m.rol_anterior into v_rol_anterior;
  if not found then
    raise exception 'La cuenta no tiene una asignacion de moderador'
      using errcode = 'P0002';
  end if;

  update public.perfiles
  set rol = coalesce(v_rol_anterior, 'cliente')
  where user_id = p_user_id and rol = 'moderador';
  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'moderador_revocado',
    p_user_id,
    jsonb_build_object('rol_restaurado', coalesce(v_rol_anterior, 'cliente'))
  );
  return true;
end;
$$;

create or replace function public.admin_control_editar_usuario(
  p_session_token uuid,
  p_user_id uuid,
  p_nombre text,
  p_telefono text,
  p_localidad text,
  p_titular text,
  p_rol text,
  p_restablecer_avatar boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_anterior text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = (select auth.uid()) or exists (
    select 1 from public.administradores as a where a.user_id = p_user_id
  ) then
    raise exception 'No se puede editar esta cuenta administrativa'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 1 and 120
    or (nullif(btrim(coalesce(p_telefono, '')), '') is not null
      and btrim(p_telefono) !~ '^[0-9]{10}$')
    or length(coalesce(p_localidad, '')) > 120
    or length(coalesce(p_titular, '')) > 160
    or p_rol not in ('cliente', 'tecnico', 'moderador') then
    raise exception 'Los datos del usuario no son validos'
      using errcode = '22023';
  end if;

  select p.rol into v_rol_anterior
  from public.perfiles as p
  where p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'No se encontro el perfil del usuario'
      using errcode = 'P0002';
  end if;

  update public.perfiles
  set nombre = btrim(p_nombre),
      localidad = btrim(coalesce(p_localidad, '')),
      titular = btrim(coalesce(p_titular, '')),
      rol = p_rol,
      avatar_url = case when coalesce(p_restablecer_avatar, false) then null else avatar_url end
  where user_id = p_user_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'nombre', btrim(p_nombre),
      'telefono', nullif(btrim(coalesce(p_telefono, '')), '')
    )
  where id = p_user_id;

  if p_rol = 'moderador' then
    insert into public.moderadores (user_id, rol_anterior, creado_por)
    values (
      p_user_id,
      case when v_rol_anterior = 'moderador' then 'cliente' else v_rol_anterior end,
      (select auth.uid())
    )
    on conflict (user_id) do nothing;
  else
    delete from public.moderadores where user_id = p_user_id;
  end if;

  if p_rol <> 'tecnico' then
    delete from public.tecnicos_aprobados where usuario_id = p_user_id;
    update public.perfiles set en_linea = false where user_id = p_user_id;
  end if;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'usuario_editado',
    p_user_id,
    jsonb_build_object(
      'rol_anterior', v_rol_anterior,
      'rol_nuevo', p_rol,
      'avatar_restablecido', coalesce(p_restablecer_avatar, false),
      'localidad', btrim(coalesce(p_localidad, ''))
    )
  );
  return true;
end;
$$;

create or replace function public.cliente_obtener_mi_perfil()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'nombre', p.nombre,
    'telefono', u.raw_user_meta_data ->> 'telefono',
    'localidad', p.localidad,
    'avatar_url', p.avatar_url,
    'direccion_habitual', p.direccion_habitual,
    'preferencias_contacto', p.preferencias_contacto
  )
  into v_resultado
  from public.perfiles as p
  join auth.users as u on u.id = p.user_id
  where p.user_id = (select auth.uid())
    and p.rol = 'cliente';

  if v_resultado is null then
    raise exception 'Esta funcion esta disponible solo para cuentas de cliente'
      using errcode = '42501';
  end if;
  return v_resultado;
end;
$$;

create or replace function public.actualizar_mi_perfil_cliente(
  p_nombre text,
  p_telefono text,
  p_localidad text,
  p_avatar_url text,
  p_direccion_habitual text,
  p_preferencias_contacto text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 1 and 120
    or (nullif(btrim(coalesce(p_telefono, '')), '') is not null
      and btrim(p_telefono) !~ '^[0-9]{10}$')
    or length(coalesce(p_localidad, '')) > 120
    or length(coalesce(p_avatar_url, '')) > 2048
    or (nullif(p_avatar_url, '') is not null and p_avatar_url !~ '^https://')
    or length(coalesce(p_direccion_habitual, '')) > 300
    or length(coalesce(p_preferencias_contacto, '')) > 300 then
    raise exception 'Los datos del perfil no son validos'
      using errcode = '22023';
  end if;

  update public.perfiles
  set nombre = btrim(p_nombre),
      localidad = btrim(coalesce(p_localidad, '')),
      avatar_url = nullif(p_avatar_url, ''),
      direccion_habitual = btrim(coalesce(p_direccion_habitual, '')),
      preferencias_contacto = btrim(coalesce(p_preferencias_contacto, ''))
  where user_id = (select auth.uid())
    and rol = 'cliente'
    and estado_cuenta = 'activo';
  if not found then
    raise exception 'No se encontro una cuenta de cliente activa'
      using errcode = '42501';
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'nombre', btrim(p_nombre),
      'telefono', nullif(btrim(coalesce(p_telefono, '')), '')
    )
  where id = (select auth.uid());
  return true;
end;
$$;

create or replace function public.tecnico_obtener_configuracion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;
  select jsonb_build_object(
    'latitud', p.latitud,
    'longitud', p.longitud,
    'radio_km', p.radio_km,
    'en_linea', p.en_linea,
    'disponibilidad_semanal', p.disponibilidad_semanal,
    'fechas_bloqueadas', p.fechas_bloqueadas
  )
  into v_resultado
  from public.perfiles as p
  where p.user_id = (select auth.uid()) and p.rol = 'tecnico';

  if v_resultado is null then
    raise exception 'Esta funcion esta disponible solo para cuentas de tecnico'
      using errcode = '42501';
  end if;
  return v_resultado;
end;
$$;

create or replace function public.tecnico_guardar_configuracion(
  p_latitud double precision,
  p_longitud double precision,
  p_radio_km numeric,
  p_en_linea boolean,
  p_disponibilidad_semanal jsonb,
  p_fechas_bloqueadas jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia record;
  v_numero_fechas integer;
  v_fecha_bloqueada text;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;
  if p_latitud is not null and p_latitud not between -90 and 90
    or p_longitud is not null and p_longitud not between -180 and 180
    or p_radio_km is null or p_radio_km not between 1 and 100
    or jsonb_typeof(p_disponibilidad_semanal) is distinct from 'object'
    or jsonb_typeof(p_fechas_bloqueadas) is distinct from 'array' then
    raise exception 'Ubicacion, radio o agenda no validos'
      using errcode = '22023';
  end if;
  if (p_latitud is null) <> (p_longitud is null) then
    raise exception 'Se deben guardar juntas la latitud y longitud'
      using errcode = '22023';
  end if;
  select jsonb_array_length(p_fechas_bloqueadas) into v_numero_fechas;
  if v_numero_fechas > 90 then
    raise exception 'No se pueden bloquear mas de 90 fechas a la vez'
      using errcode = '22023';
  end if;
  for v_fecha_bloqueada in
    select fecha.value from jsonb_array_elements_text(p_fechas_bloqueadas) as fecha(value)
  loop
    if v_fecha_bloqueada is null
      or v_fecha_bloqueada !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Las fechas bloqueadas deben usar formato AAAA-MM-DD'
        using errcode = '22023';
    end if;
    perform v_fecha_bloqueada::date;
  end loop;

  for v_dia in select key, value from jsonb_each(p_disponibilidad_semanal)
  loop
    if v_dia.key not in ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')
      or jsonb_typeof(v_dia.value) is distinct from 'object'
      or jsonb_typeof(v_dia.value -> 'activo') is distinct from 'boolean' then
      raise exception 'La agenda semanal contiene un dia no valido'
        using errcode = '22023';
    end if;
    if v_dia.value ->> 'activo' = 'true' then
      if coalesce(v_dia.value ->> 'inicio', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_dia.value ->> 'fin', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (v_dia.value ->> 'inicio')::time >= (v_dia.value ->> 'fin')::time then
        raise exception 'Cada dia activo requiere un horario valido de inicio y fin'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  if coalesce(p_en_linea, false) and (
    not exists (
      select 1 from public.tecnicos_aprobados as ta
      where ta.usuario_id = (select auth.uid())
    )
    or not exists (
      select 1 from public.perfiles as p
      where p.user_id = (select auth.uid())
        and (
          p.estado_cuenta = 'activo'
          or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
        )
        and p.rol = 'tecnico'
    )
  ) then
    raise exception 'Solo tecnicos aprobados con cuenta activa pueden conectarse'
      using errcode = '42501';
  end if;

  update public.perfiles
  set latitud = p_latitud,
      longitud = p_longitud,
      radio_km = p_radio_km,
      en_linea = coalesce(p_en_linea, false),
      disponibilidad_semanal = p_disponibilidad_semanal,
      fechas_bloqueadas = p_fechas_bloqueadas
  where user_id = (select auth.uid()) and rol = 'tecnico';
  if not found then
    raise exception 'No se encontro el perfil de tecnico'
      using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create or replace function public.consultar_tecnicos_disponibles(
  p_fecha date,
  p_hora time,
  p_especialidad text default null,
  p_localidad text default null
)
returns table (
  user_id uuid,
  nombre text,
  avatar_url text,
  titular text,
  anios_experiencia smallint,
  localidad text,
  radio_km numeric,
  tarifa_base numeric,
  habilidades text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dia text;
begin
  if (select auth.uid()) is null or p_fecha is null or p_hora is null then
    raise exception 'Inicia sesion y selecciona fecha y hora'
      using errcode = '42501';
  end if;
  if p_fecha < current_date or length(coalesce(p_especialidad, '')) > 100
    or length(coalesce(p_localidad, '')) > 120 then
    raise exception 'La fecha o el filtro no son validos'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.perfiles as c
    where c.user_id = (select auth.uid())
      and c.rol = 'cliente'
      and c.estado_cuenta = 'activo'
  ) then
    raise exception 'Solo clientes con cuenta activa pueden consultar disponibilidad'
      using errcode = '42501';
  end if;

  v_dia := case extract(isodow from p_fecha)::integer
    when 1 then 'lunes'
    when 2 then 'martes'
    when 3 then 'miercoles'
    when 4 then 'jueves'
    when 5 then 'viernes'
    when 6 then 'sabado'
    else 'domingo'
  end;

  return query
  select
    p.user_id,
    p.nombre,
    p.avatar_url,
    p.titular,
    p.anios_experiencia,
    p.localidad,
    p.radio_km,
    p.tarifa_base,
    p.habilidades
  from public.perfiles as p
  join public.tecnicos_aprobados as ta on ta.usuario_id = p.user_id
  where p.rol = 'tecnico'
    and (
      p.estado_cuenta = 'activo'
      or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
    )
    and p.en_linea
    and (p_localidad is null or p.localidad ilike '%' || btrim(p_localidad) || '%')
    and (
      nullif(btrim(coalesce(p_especialidad, '')), '') is null
      or p.habilidades @> array[btrim(p_especialidad)]
      or p.titular ilike '%' || btrim(p_especialidad) || '%'
    )
    and not (p.fechas_bloqueadas @> to_jsonb(p_fecha::text))
    and coalesce((p.disponibilidad_semanal -> v_dia ->> 'activo') = 'true', false)
    and (p.disponibilidad_semanal -> v_dia ->> 'inicio')::time <= p_hora
    and (p.disponibilidad_semanal -> v_dia ->> 'fin')::time > p_hora
  order by p.nombre;
end;
$$;

create or replace function public.listar_trabajos_disponibles_cercanos()
returns table (
  id uuid,
  categoria text,
  subtipo text,
  titulo text,
  descripcion text,
  detalles_tecnicos jsonb,
  localidad text,
  creado_en timestamptz,
  distancia_km numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_radio numeric;
  v_localidad text;
begin
  if (select auth.uid()) is null or (select public.es_tecnico_aprobado()) is not true then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;
  select p.latitud, p.longitud, p.radio_km, p.localidad
  into v_lat, v_lng, v_radio, v_localidad
  from public.perfiles as p
  where p.user_id = (select auth.uid())
    and p.rol = 'tecnico'
    and (
      p.estado_cuenta = 'activo'
      or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
    );
  if not found then
    raise exception 'La cuenta de tecnico no esta activa'
      using errcode = '42501';
  end if;

  return query
  with ubicaciones as (
    select
      t.*,
      case
        when length(t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lat') <= 16
          and (t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lat') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lat')::double precision
        else null
      end as lat_trabajo,
      case
        when length(t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lng') <= 16
          and (t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lng') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (t.detalles_tecnicos -> 'ubicacion_gps' ->> 'lng')::double precision
        else null
      end as lng_trabajo
    from public.trabajos as t
    where t.estado = 'solicitado'
      and t.tecnico_id is null
      and length(btrim(t.nombre_contacto)) between 1 and 120
      and t.telefono_contacto ~ '^[0-9]{10}$'
  ),
  distancias as (
    select
      u.*,
      case
        when v_lat is null or v_lng is null
          or u.lat_trabajo is null or u.lng_trabajo is null
          or u.lat_trabajo not between -90 and 90
          or u.lng_trabajo not between -180 and 180
        then null
        else 6371 * 2 * asin(sqrt(least(1::double precision, greatest(0::double precision,
          power(sin(radians(u.lat_trabajo - v_lat) / 2), 2)
          + cos(radians(v_lat)) * cos(radians(u.lat_trabajo))
          * power(sin(radians(u.lng_trabajo - v_lng) / 2), 2)
        ))))
      end as km
    from ubicaciones as u
  )
  select
    d.id,
    d.categoria,
    d.subtipo,
    d.titulo,
    d.descripcion,
    coalesce(d.detalles_tecnicos, '{}'::jsonb) - 'ubicacion_gps' - 'contacto_invitado',
    d.localidad,
    d.creado_en,
    round(d.km::numeric, 1)
  from distancias as d
  where (
    v_lat is null or v_lng is null
    or (
      d.km is not null and d.km <= v_radio
    )
    or (
      d.km is null and lower(coalesce(d.localidad, '')) = lower(coalesce(v_localidad, ''))
    )
  )
  order by d.km nulls last, d.creado_en asc;
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
    raise exception 'Se requiere una cuenta de tecnico aprobada y activa'
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

create or replace function public.moderador_listar_tecnicos_pendientes()
returns table (
  user_id uuid,
  nombre text,
  localidad text,
  titular text,
  avatar_url text,
  anios_experiencia smallint,
  habilidades text[],
  creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('aprobar_tecnicos') then
    raise exception 'No tienes permiso para aprobar tecnicos'
      using errcode = '42501';
  end if;
  return query
  select p.user_id, p.nombre, p.localidad, p.titular, p.avatar_url,
    p.anios_experiencia, p.habilidades, p.creado_en
  from public.perfiles as p
  where p.rol = 'tecnico'
    and p.estado_cuenta = 'activo'
    and not exists (
      select 1 from public.tecnicos_aprobados as ta where ta.usuario_id = p.user_id
    )
  order by p.creado_en;
end;
$$;

create or replace function public.moderador_aprobar_tecnico(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('aprobar_tecnicos') then
    raise exception 'No tienes permiso para aprobar tecnicos'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.perfiles as p
    where p.user_id = p_user_id and p.rol = 'tecnico' and p.estado_cuenta = 'activo'
  ) then
    raise exception 'No se encontro un tecnico activo pendiente de aprobacion'
      using errcode = 'P0002';
  end if;
  insert into public.tecnicos_aprobados (usuario_id)
  values (p_user_id)
  on conflict (usuario_id) do nothing;
  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values ((select auth.uid()), 'moderador_tecnico_aprobado', p_user_id, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.moderador_listar_solicitudes()
returns table (
  id uuid,
  titulo text,
  categoria text,
  estado text,
  localidad text,
  tecnico_id uuid,
  urgencia text,
  creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('gestionar_solicitudes') then
    raise exception 'No tienes permiso para gestionar solicitudes'
      using errcode = '42501';
  end if;
  return query
  select t.id, t.titulo, t.categoria, t.estado, t.localidad, t.tecnico_id,
    coalesce(t.detalles_tecnicos ->> 'urgencia', 'normal'), t.creado_en
  from public.trabajos as t
  where t.estado not in ('completado', 'cancelado')
  order by
    case coalesce(t.detalles_tecnicos ->> 'urgencia', 'normal')
      when 'emergencia_24_7' then 0
      when 'hoy_mismo' then 1
      else 2
    end,
    t.creado_en;
end;
$$;

create or replace function public.moderador_listar_tecnicos_aprobados()
returns table (
  user_id uuid,
  nombre text,
  localidad text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('gestionar_solicitudes') then
    raise exception 'No tienes permiso para gestionar solicitudes'
      using errcode = '42501';
  end if;
  return query
  select p.user_id, p.nombre, p.localidad
  from public.perfiles as p
  join public.tecnicos_aprobados as ta on ta.usuario_id = p.user_id
  where p.rol = 'tecnico'
    and (
      p.estado_cuenta = 'activo'
      or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
    )
  order by p.nombre;
end;
$$;

create or replace function public.moderador_actualizar_solicitud(
  p_trabajo_id uuid,
  p_estado text,
  p_tecnico_id uuid,
  p_motivo_cancelacion text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado_anterior text;
  v_tecnico_anterior uuid;
begin
  if not private.moderador_tiene_permiso('gestionar_solicitudes') then
    raise exception 'No tienes permiso para gestionar solicitudes'
      using errcode = '42501';
  end if;
  if p_estado is null
    or p_estado not in ('solicitado', 'aceptado', 'en_camino', 'en_proceso', 'completado', 'cancelado') then
    raise exception 'El estado seleccionado no es valido'
      using errcode = '22023';
  end if;
  if p_estado = 'cancelado' and length(btrim(coalesce(p_motivo_cancelacion, ''))) not between 3 and 500 then
    raise exception 'Debes indicar el motivo de cancelacion'
      using errcode = '22023';
  end if;
  if p_estado in ('solicitado', 'cancelado') and p_tecnico_id is not null then
    raise exception 'Una solicitud pendiente o cancelada no puede tener tecnico asignado'
      using errcode = '22023';
  end if;
  if p_estado in ('aceptado', 'en_camino', 'en_proceso', 'completado')
    and p_tecnico_id is null then
    raise exception 'Un trabajo asignado requiere un tecnico aprobado'
      using errcode = '22023';
  end if;
  if p_tecnico_id is not null and not exists (
    select 1
    from public.tecnicos_aprobados as ta
    join public.perfiles as p on p.user_id = ta.usuario_id
    where ta.usuario_id = p_tecnico_id
      and p.rol = 'tecnico'
      and (
        p.estado_cuenta = 'activo'
        or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
      )
  ) then
    raise exception 'El tecnico no esta aprobado o tiene una cuenta restringida'
      using errcode = '22023';
  end if;

  select t.estado, t.tecnico_id into v_estado_anterior, v_tecnico_anterior
  from public.trabajos as t
  where t.id = p_trabajo_id
  for update;
  if not found then
    raise exception 'No se encontro la solicitud'
      using errcode = 'P0002';
  end if;

  update public.trabajos as t
  set estado = p_estado,
      tecnico_id = p_tecnico_id,
      motivo_cancelacion = case
        when p_estado = 'cancelado' then btrim(p_motivo_cancelacion)
        else null
      end
  where t.id = p_trabajo_id;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'moderador_solicitud_actualizada',
    p_trabajo_id,
    jsonb_strip_nulls(jsonb_build_object(
      'estado_anterior', v_estado_anterior,
      'estado_nuevo', p_estado,
      'tecnico_anterior', v_tecnico_anterior,
      'tecnico_nuevo', p_tecnico_id,
      'motivo_cancelacion', case when p_estado = 'cancelado' then btrim(p_motivo_cancelacion) end
    ))
  );
  return true;
end;
$$;

create or replace function public.moderador_cancelar_solicitud(
  p_trabajo_id uuid,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if not private.moderador_tiene_permiso('gestionar_solicitudes') then
    raise exception 'No tienes permiso para gestionar solicitudes'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 3 and 500 then
    raise exception 'Debes indicar un motivo de cancelacion'
      using errcode = '22023';
  end if;
  select t.estado into v_estado
  from public.trabajos as t
  where t.id = p_trabajo_id
  for update;
  if not found or v_estado in ('completado', 'cancelado') then
    raise exception 'La solicitud no existe o ya esta cerrada'
      using errcode = 'P0002';
  end if;
  update public.trabajos
  set estado = 'cancelado', tecnico_id = null, motivo_cancelacion = btrim(p_motivo)
  where id = p_trabajo_id;
  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'moderador_solicitud_cancelada',
    p_trabajo_id,
    jsonb_build_object('estado_anterior', v_estado, 'motivo', btrim(p_motivo))
  );
  return true;
end;
$$;

create or replace function public.moderador_listar_conversaciones()
returns table (
  conversacion_id uuid,
  usuario_id uuid,
  nombre text,
  correo text,
  rol text,
  ultimo_mensaje text,
  ultimo_mensaje_en timestamptz,
  mensajes_no_leidos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('responder_soporte') then
    raise exception 'No tienes permiso para responder soporte'
      using errcode = '42501';
  end if;
  return query
  select c.id, c.usuario_id, coalesce(p.nombre, u.email::text, 'Usuario FixNow'),
    u.email::text, p.rol, c.ultimo_mensaje, c.ultimo_mensaje_en,
    (
      select count(*) from public.mensajes_soporte as m
      where m.conversacion_id = c.id
        and m.remitente_id = c.usuario_id
        and m.leido_en is null
    )
  from public.conversaciones_soporte as c
  join auth.users as u on u.id = c.usuario_id
  join public.perfiles as p on p.user_id = c.usuario_id
  order by c.ultimo_mensaje_en desc nulls last, c.creado_en desc;
end;
$$;

create or replace function public.moderador_listar_mensajes(p_conversacion_id uuid)
returns table (
  id uuid,
  conversacion_id uuid,
  remitente_id uuid,
  remitente_nombre text,
  cuerpo text,
  creado_en timestamptz,
  leido_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('responder_soporte') then
    raise exception 'No tienes permiso para responder soporte'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversaciones_soporte as c
    where c.id = p_conversacion_id
  ) then
    raise exception 'No se encontro la conversacion'
      using errcode = 'P0002';
  end if;
  return query
  select m.id, m.conversacion_id, m.remitente_id,
    case
      when m.remitente_id = c.usuario_id then coalesce(p.nombre, u.email::text, 'Usuario')
      else 'Moderacion FixNow'
    end,
    m.cuerpo, m.creado_en, m.leido_en
  from (
    select ms.* from public.mensajes_soporte as ms
    where ms.conversacion_id = p_conversacion_id
    order by ms.creado_en desc
    limit 200
  ) as m
  join public.conversaciones_soporte as c on c.id = m.conversacion_id
  left join public.perfiles as p on p.user_id = m.remitente_id
  left join auth.users as u on u.id = m.remitente_id
  order by m.creado_en;
end;
$$;

create or replace function public.moderador_enviar_mensaje(
  p_usuario_id uuid,
  p_cuerpo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversacion_id uuid;
  v_mensaje_id uuid;
begin
  if not private.moderador_tiene_permiso('responder_soporte') then
    raise exception 'No tienes permiso para responder soporte'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_cuerpo, ''))) not between 1 and 5000 then
    raise exception 'El mensaje debe tener entre 1 y 5000 caracteres'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.perfiles as p where p.user_id = p_usuario_id)
    or exists (select 1 from public.administradores as a where a.user_id = p_usuario_id) then
    raise exception 'No se encontro el usuario de FixNow'
      using errcode = 'P0002';
  end if;
  insert into public.conversaciones_soporte (usuario_id)
  values (p_usuario_id)
  on conflict (usuario_id) do nothing;
  select c.id into v_conversacion_id
  from public.conversaciones_soporte as c
  where c.usuario_id = p_usuario_id;
  insert into public.mensajes_soporte (conversacion_id, remitente_id, cuerpo)
  values (v_conversacion_id, (select auth.uid()), btrim(p_cuerpo))
  returning id into v_mensaje_id;
  return v_mensaje_id;
end;
$$;

create or replace function public.moderador_marcar_leidos(p_conversacion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.moderador_tiene_permiso('responder_soporte') then
    raise exception 'No tienes permiso para responder soporte'
      using errcode = '42501';
  end if;
  update public.mensajes_soporte as m
  set leido_en = now()
  from public.conversaciones_soporte as c
  where c.id = p_conversacion_id
    and m.conversacion_id = c.id
    and m.remitente_id = c.usuario_id
    and m.leido_en is null;
  return true;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Cada usuario consulta sus propios avatares" on storage.objects;
create policy "Cada usuario consulta sus propios avatares"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Cada usuario sube su propio avatar" on storage.objects;
create policy "Cada usuario sube su propio avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Cada usuario actualiza su propio avatar" on storage.objects;
create policy "Cada usuario actualiza su propio avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Cada usuario elimina su propio avatar" on storage.objects;
create policy "Cada usuario elimina su propio avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

revoke all on function public.moderador_mis_permisos() from public, anon, authenticated;
revoke all on function public.admin_control_listar_moderadores(uuid) from public, anon, authenticated;
revoke all on function public.admin_control_configurar_moderador(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_control_revocar_moderador(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_control_editar_usuario(uuid, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cliente_obtener_mi_perfil() from public, anon, authenticated;
revoke all on function public.actualizar_mi_perfil_cliente(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.tecnico_obtener_configuracion() from public, anon, authenticated;
revoke all on function public.tecnico_guardar_configuracion(double precision, double precision, numeric, boolean, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.consultar_tecnicos_disponibles(date, time, text, text) from public, anon, authenticated;
revoke all on function public.listar_trabajos_disponibles_cercanos() from public, anon, authenticated;
revoke all on function public.moderador_listar_tecnicos_pendientes() from public, anon, authenticated;
revoke all on function public.moderador_aprobar_tecnico(uuid) from public, anon, authenticated;
revoke all on function public.moderador_listar_solicitudes() from public, anon, authenticated;
revoke all on function public.moderador_listar_tecnicos_aprobados() from public, anon, authenticated;
revoke all on function public.moderador_actualizar_solicitud(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.moderador_cancelar_solicitud(uuid, text) from public, anon, authenticated;
revoke all on function public.moderador_listar_conversaciones() from public, anon, authenticated;
revoke all on function public.moderador_listar_mensajes(uuid) from public, anon, authenticated;
revoke all on function public.moderador_enviar_mensaje(uuid, text) from public, anon, authenticated;
revoke all on function public.moderador_marcar_leidos(uuid) from public, anon, authenticated;
revoke all on function public.actualizar_estado_trabajo(uuid, text) from public, anon, authenticated;

grant execute on function public.moderador_mis_permisos() to authenticated;
grant execute on function public.admin_control_listar_moderadores(uuid) to authenticated;
grant execute on function public.admin_control_configurar_moderador(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_control_revocar_moderador(uuid, uuid) to authenticated;
grant execute on function public.admin_control_editar_usuario(uuid, uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.cliente_obtener_mi_perfil() to authenticated;
grant execute on function public.actualizar_mi_perfil_cliente(text, text, text, text, text, text) to authenticated;
grant execute on function public.tecnico_obtener_configuracion() to authenticated;
grant execute on function public.tecnico_guardar_configuracion(double precision, double precision, numeric, boolean, jsonb, jsonb) to authenticated;
grant execute on function public.consultar_tecnicos_disponibles(date, time, text, text) to authenticated;
grant execute on function public.listar_trabajos_disponibles_cercanos() to authenticated;
grant execute on function public.moderador_listar_tecnicos_pendientes() to authenticated;
grant execute on function public.moderador_aprobar_tecnico(uuid) to authenticated;
grant execute on function public.moderador_listar_solicitudes() to authenticated;
grant execute on function public.moderador_listar_tecnicos_aprobados() to authenticated;
grant execute on function public.moderador_actualizar_solicitud(uuid, text, uuid, text) to authenticated;
grant execute on function public.moderador_cancelar_solicitud(uuid, text) to authenticated;
grant execute on function public.moderador_listar_conversaciones() to authenticated;
grant execute on function public.moderador_listar_mensajes(uuid) to authenticated;
grant execute on function public.moderador_enviar_mensaje(uuid, text) to authenticated;
grant execute on function public.moderador_marcar_leidos(uuid) to authenticated;
grant execute on function public.actualizar_estado_trabajo(uuid, text) to authenticated;

commit;
