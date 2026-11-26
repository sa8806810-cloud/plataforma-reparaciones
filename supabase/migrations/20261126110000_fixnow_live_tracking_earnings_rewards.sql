-- Seguimiento activo, registro de ingresos, métricas y recompensas.
-- Ejecutar después de 20261126102800_fixnow_live_technician_calendar.sql.

begin;

create table if not exists public.ubicaciones_tecnico (
  tecnico_id uuid primary key references auth.users(id) on delete cascade,
  latitud double precision not null check (latitud between -90 and 90),
  longitud double precision not null check (longitud between -180 and 180),
  precision_m numeric(8, 2) not null default 0 check (precision_m between 0 and 10000),
  compartiendo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table public.ubicaciones_tecnico enable row level security;
revoke all on table public.ubicaciones_tecnico from public, anon, authenticated;
grant select on table public.ubicaciones_tecnico to authenticated;

drop policy if exists "Participantes ven ubicacion de trabajo activo" on public.ubicaciones_tecnico;
create policy "Participantes ven ubicacion de trabajo activo"
on public.ubicaciones_tecnico
for select
to authenticated
using (
  exists (
    select 1
    from public.trabajos as t
    where t.tecnico_id = ubicaciones_tecnico.tecnico_id
      and t.estado in ('aceptado', 'en_camino', 'en_proceso')
      and (
        t.tecnico_id = (select auth.uid())
        or t.cliente_id = (select auth.uid())
      )
  )
);

create or replace function private.limpiar_ubicacion_tecnico_inactivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol <> 'tecnico' or new.estado_cuenta <> 'activo' then
    delete from public.ubicaciones_tecnico
    where tecnico_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.limpiar_ubicacion_tecnico_inactivo() from public, anon, authenticated;

drop trigger if exists limpiar_ubicacion_tecnico_inactivo on public.perfiles;
create trigger limpiar_ubicacion_tecnico_inactivo
after update of rol, estado_cuenta on public.perfiles
for each row execute function private.limpiar_ubicacion_tecnico_inactivo();

create or replace function private.limpiar_ubicacion_tecnico_revocado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ubicaciones_tecnico
  where tecnico_id = old.usuario_id;
  return old;
end;
$$;

revoke all on function private.limpiar_ubicacion_tecnico_revocado() from public, anon, authenticated;

drop trigger if exists limpiar_ubicacion_tecnico_revocado on public.tecnicos_aprobados;
create trigger limpiar_ubicacion_tecnico_revocado
after delete on public.tecnicos_aprobados
for each row execute function private.limpiar_ubicacion_tecnico_revocado();

create table if not exists public.ganancias_tecnico (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null unique references public.trabajos(id) on delete cascade,
  tecnico_id uuid not null references auth.users(id) on delete cascade,
  monto numeric(12, 2) not null check (monto > 0 and monto <= 10000000),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia')),
  creado_en timestamptz not null default now(),
  liquidado_en timestamptz,
  liquidado_por uuid references auth.users(id) on delete set null,
  check (metodo_pago = 'transferencia' or liquidado_en is null)
);

create index if not exists ganancias_tecnico_usuario_fecha_idx
  on public.ganancias_tecnico (tecnico_id, creado_en desc);
create index if not exists ganancias_tecnico_transferencias_pendientes_idx
  on public.ganancias_tecnico (creado_en desc)
  where metodo_pago = 'transferencia' and liquidado_en is null;

alter table public.ganancias_tecnico enable row level security;
revoke all on table public.ganancias_tecnico from public, anon, authenticated;
grant select on table public.ganancias_tecnico to authenticated;

drop policy if exists "Tecnicos consultan sus ganancias" on public.ganancias_tecnico;
create policy "Tecnicos consultan sus ganancias"
on public.ganancias_tecnico
for select
to authenticated
using (tecnico_id = (select auth.uid()));

create table if not exists public.recompensas_tecnico (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  descripcion text not null default '' check (length(descripcion) <= 500),
  meta_trabajos integer not null check (meta_trabajos between 1 and 100000),
  premio text not null default '' check (length(premio) <= 120),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists recompensas_tecnico_activas_idx
  on public.recompensas_tecnico (activa, meta_trabajos);

alter table public.recompensas_tecnico enable row level security;
revoke all on table public.recompensas_tecnico from public, anon, authenticated;
grant select on table public.recompensas_tecnico to authenticated;

drop policy if exists "Tecnicos consultan recompensas activas" on public.recompensas_tecnico;
create policy "Tecnicos consultan recompensas activas"
on public.recompensas_tecnico
for select
to authenticated
using (
  activa
  and exists (
    select 1
    from public.perfiles as p
    where p.user_id = (select auth.uid())
      and p.rol = 'tecnico'
  )
);

create table if not exists private.tecnico_sesiones_linea (
  id bigint generated always as identity primary key,
  tecnico_id uuid not null references auth.users(id) on delete cascade,
  inicio_en timestamptz not null default now(),
  fin_en timestamptz,
  creado_en timestamptz not null default now()
);

create unique index if not exists tecnico_sesiones_linea_abierta_idx
  on private.tecnico_sesiones_linea (tecnico_id)
  where fin_en is null;
create index if not exists tecnico_sesiones_linea_usuario_inicio_idx
  on private.tecnico_sesiones_linea (tecnico_id, inicio_en desc);

alter table private.tecnico_sesiones_linea enable row level security;
revoke all on table private.tecnico_sesiones_linea from public, anon, authenticated;

create table if not exists private.tecnico_metricas_diarias (
  tecnico_id uuid not null references auth.users(id) on delete cascade,
  fecha_local date not null,
  distancia_km numeric(12, 3) not null default 0 check (distancia_km >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (tecnico_id, fecha_local)
);

alter table private.tecnico_metricas_diarias enable row level security;
revoke all on table private.tecnico_metricas_diarias from public, anon, authenticated;

create or replace function private.registrar_sesion_linea_tecnico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.en_linea then
      insert into private.tecnico_sesiones_linea (tecnico_id)
      values (new.user_id)
      on conflict (tecnico_id) where fin_en is null do nothing;
    end if;
  elsif new.en_linea is distinct from old.en_linea then
    if new.en_linea then
      insert into private.tecnico_sesiones_linea (tecnico_id)
      values (new.user_id)
      on conflict (tecnico_id) where fin_en is null do nothing;
    else
      update private.tecnico_sesiones_linea
      set fin_en = now()
      where tecnico_id = new.user_id
        and fin_en is null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.registrar_sesion_linea_tecnico() from public, anon, authenticated;

drop trigger if exists registrar_sesion_linea_tecnico_insert on public.perfiles;
create trigger registrar_sesion_linea_tecnico_insert
after insert on public.perfiles
for each row execute function private.registrar_sesion_linea_tecnico();

drop trigger if exists registrar_sesion_linea_tecnico_update on public.perfiles;
create trigger registrar_sesion_linea_tecnico_update
after update of en_linea on public.perfiles
for each row execute function private.registrar_sesion_linea_tecnico();

insert into private.tecnico_sesiones_linea (tecnico_id, inicio_en)
select p.user_id, now()
from public.perfiles as p
where p.rol = 'tecnico'
  and p.en_linea
on conflict (tecnico_id) where fin_en is null do nothing;

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
  if p_nuevo_estado = 'completado' then
    raise exception 'Registra el monto y la forma de pago al completar el trabajo'
      using errcode = '22023';
  end if;
  if p_nuevo_estado not in ('en_camino', 'en_proceso') then
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
    )
  returning t.* into v_trabajo;

  if not found then
    raise exception 'No se pudo actualizar el estado de este trabajo'
      using errcode = '42501';
  end if;
  return v_trabajo;
end;
$$;

create or replace function public.tecnico_actualizar_ubicacion_trabajo(
  p_trabajo_id uuid,
  p_latitud double precision,
  p_longitud double precision,
  p_precision_m numeric default 0
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tecnico_id uuid := (select auth.uid());
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_anterior public.ubicaciones_tecnico;
  v_distancia double precision;
  v_segundos double precision;
  v_actualizado_en timestamptz := now();
begin
  if v_tecnico_id is null
    or p_latitud is null or p_latitud not between -90 and 90
    or p_longitud is null or p_longitud not between -180 and 180
    or coalesce(p_precision_m, 0) not between 0 and 10000 then
    raise exception 'La ubicacion GPS no es valida'
      using errcode = '22023';
  end if;

  if (select public.es_tecnico_aprobado()) is not true
    or not exists (
      select 1
      from public.perfiles as p
      where p.user_id = v_tecnico_id
        and p.rol = 'tecnico'
        and p.estado_cuenta = 'activo'
    )
    or not exists (
      select 1
      from public.trabajos as t
      where t.id = p_trabajo_id
        and t.tecnico_id = v_tecnico_id
        and t.estado in ('aceptado', 'en_camino', 'en_proceso')
    ) then
    raise exception 'Solo puedes compartir tu ubicacion en un trabajo activo asignado'
      using errcode = '42501';
  end if;

  select u.*
  into v_anterior
  from public.ubicaciones_tecnico as u
  where u.tecnico_id = v_tecnico_id
  for update;

  if found
    and v_anterior.compartiendo
    and v_anterior.precision_m <= 100
    and coalesce(p_precision_m, 0) <= 100
    and timezone('America/Mexico_City', v_anterior.actualizado_en)::date = v_hoy then
    v_segundos := extract(epoch from (v_actualizado_en - v_anterior.actualizado_en));
    if v_segundos between 1 and 600 then
      v_distancia := 6371 * 2 * asin(sqrt(least(1::double precision, greatest(0::double precision,
        power(sin(radians(p_latitud - v_anterior.latitud) / 2), 2)
        + cos(radians(v_anterior.latitud)) * cos(radians(p_latitud))
        * power(sin(radians(p_longitud - v_anterior.longitud) / 2), 2)
      ))));

      if v_distancia >= 0.01 and v_distancia <= greatest(0.1, v_segundos * 0.05) then
        insert into private.tecnico_metricas_diarias as metrica (tecnico_id, fecha_local, distancia_km)
        values (v_tecnico_id, v_hoy, v_distancia)
        on conflict (tecnico_id, fecha_local)
        do update set
          distancia_km = metrica.distancia_km + excluded.distancia_km,
          actualizado_en = now();
      end if;
    end if;
  end if;

  insert into public.ubicaciones_tecnico (
    tecnico_id, latitud, longitud, precision_m, compartiendo, actualizado_en
  )
  values (
    v_tecnico_id, p_latitud, p_longitud, coalesce(p_precision_m, 0), true, v_actualizado_en
  )
  on conflict (tecnico_id) do update set
    latitud = excluded.latitud,
    longitud = excluded.longitud,
    precision_m = excluded.precision_m,
    compartiendo = true,
    actualizado_en = excluded.actualizado_en;

  return v_actualizado_en;
end;
$$;

create or replace function public.tecnico_detener_compartir_ubicacion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or (select public.es_tecnico_aprobado()) is not true then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;

  delete from public.ubicaciones_tecnico
  where tecnico_id = (select auth.uid());
  return true;
end;
$$;

create or replace function public.tecnico_completar_trabajo(
  p_trabajo_id uuid,
  p_monto numeric,
  p_metodo_pago text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tecnico_id uuid := (select auth.uid());
begin
  if v_tecnico_id is null
    or (select public.es_tecnico_aprobado()) is not true
    or not exists (
      select 1
      from public.perfiles as p
      where p.user_id = v_tecnico_id
        and p.rol = 'tecnico'
        and p.estado_cuenta = 'activo'
    ) then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 10000000
    or p_metodo_pago is null
    or p_metodo_pago not in ('efectivo', 'transferencia') then
    raise exception 'Indica un monto y forma de pago validos'
      using errcode = '22023';
  end if;

  perform 1
  from public.trabajos as t
  where t.id = p_trabajo_id
    and t.tecnico_id = v_tecnico_id
    and t.estado = 'en_proceso'
  for update;

  if not found then
    raise exception 'Solo puedes cerrar un trabajo en proceso que este asignado a tu cuenta'
      using errcode = '42501';
  end if;

  insert into public.ganancias_tecnico (trabajo_id, tecnico_id, monto, metodo_pago)
  values (p_trabajo_id, v_tecnico_id, round(p_monto, 2), p_metodo_pago);

  update public.trabajos
  set estado = 'completado'
  where id = p_trabajo_id
    and tecnico_id = v_tecnico_id;

  if not exists (
    select 1
    from public.trabajos as t
    where t.tecnico_id = v_tecnico_id
      and t.estado in ('aceptado', 'en_camino', 'en_proceso')
  ) then
    delete from public.ubicaciones_tecnico
    where tecnico_id = v_tecnico_id;
  end if;

  return true;
end;
$$;

create or replace function public.tecnico_obtener_centro_ganancias()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tecnico_id uuid := (select auth.uid());
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio_dia timestamptz := (timezone('America/Mexico_City', now())::date::timestamp at time zone 'America/Mexico_City');
  v_horas_hoy numeric := 0;
  v_ganancias_hoy numeric := 0;
  v_trabajos_completados bigint := 0;
begin
  if v_tecnico_id is null
    or (select public.es_tecnico_aprobado()) is not true
    or not exists (
      select 1
      from public.perfiles as p
      where p.user_id = v_tecnico_id
        and p.rol = 'tecnico'
        and p.estado_cuenta = 'activo'
    ) then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;

  select coalesce(sum(
    extract(epoch from (
      least(coalesce(s.fin_en, now()), now())
      - greatest(s.inicio_en, v_inicio_dia)
    )) / 3600
  ), 0)
  into v_horas_hoy
  from private.tecnico_sesiones_linea as s
  where s.tecnico_id = v_tecnico_id
    and coalesce(s.fin_en, now()) > v_inicio_dia;

  select coalesce(sum(g.monto), 0)
  into v_ganancias_hoy
  from public.ganancias_tecnico as g
  where g.tecnico_id = v_tecnico_id
    and (g.creado_en at time zone 'America/Mexico_City')::date = v_hoy;

  select count(*)
  into v_trabajos_completados
  from public.trabajos as t
  where t.tecnico_id = v_tecnico_id
    and t.estado = 'completado';

  return jsonb_build_object(
    'ganancias_total', (
      select coalesce(sum(g.monto), 0)
      from public.ganancias_tecnico as g
      where g.tecnico_id = v_tecnico_id
    ),
    'efectivo_total', (
      select coalesce(sum(g.monto), 0)
      from public.ganancias_tecnico as g
      where g.tecnico_id = v_tecnico_id
        and g.metodo_pago = 'efectivo'
    ),
    'transferencias_total', (
      select coalesce(sum(g.monto), 0)
      from public.ganancias_tecnico as g
      where g.tecnico_id = v_tecnico_id
        and g.metodo_pago = 'transferencia'
    ),
    'saldo_pendiente', (
      select coalesce(sum(g.monto), 0)
      from public.ganancias_tecnico as g
      where g.tecnico_id = v_tecnico_id
        and g.metodo_pago = 'transferencia'
        and g.liquidado_en is null
    ),
    'horas_online_hoy', round(v_horas_hoy, 2),
    'distancia_km_hoy', coalesce((
      select coalesce(m.distancia_km, 0)
      from private.tecnico_metricas_diarias as m
      where m.tecnico_id = v_tecnico_id
        and m.fecha_local = v_hoy
    ), 0),
    'ganancias_hoy', v_ganancias_hoy,
    'ganancias_hora_hoy', case
      when v_horas_hoy > 0 then round(v_ganancias_hoy / v_horas_hoy, 2)
      else 0
    end,
    'ultimo_trabajo', (
      select jsonb_build_object(
        'monto', g.monto,
        'metodo_pago', g.metodo_pago,
        'titulo', t.titulo,
        'creado_en', g.creado_en
      )
      from public.ganancias_tecnico as g
      join public.trabajos as t on t.id = g.trabajo_id
      where g.tecnico_id = v_tecnico_id
      order by g.creado_en desc
      limit 1
    ),
    'trabajos_completados', v_trabajos_completados,
    'movimientos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'trabajo_id', g.trabajo_id,
          'titulo', t.titulo,
          'monto', g.monto,
          'metodo_pago', g.metodo_pago,
          'creado_en', g.creado_en,
          'liquidado_en', g.liquidado_en
        )
        order by g.creado_en desc
      )
      from (
        select *
        from public.ganancias_tecnico
        where tecnico_id = v_tecnico_id
        order by creado_en desc
        limit 30
      ) as g
      join public.trabajos as t on t.id = g.trabajo_id
    ), '[]'::jsonb),
    'recompensas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre,
          'descripcion', r.descripcion,
          'meta_trabajos', r.meta_trabajos,
          'premio', r.premio,
          'progreso', least(v_trabajos_completados, r.meta_trabajos),
          'completada', v_trabajos_completados >= r.meta_trabajos
        )
        order by r.meta_trabajos, r.creado_en
      )
      from public.recompensas_tecnico as r
      where r.activa
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_listar_recompensas(p_session_token uuid)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  meta_trabajos integer,
  premio text,
  activa boolean,
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
  select r.id, r.nombre, r.descripcion, r.meta_trabajos, r.premio, r.activa, r.creado_en
  from public.recompensas_tecnico as r
  order by r.creado_en desc;
end;
$$;

create or replace function public.admin_guardar_recompensa(
  p_session_token uuid,
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_meta_trabajos integer,
  p_premio text,
  p_activa boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_accion text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 1 and 100
    or length(coalesce(p_descripcion, '')) > 500
    or p_meta_trabajos not between 1 and 100000
    or length(coalesce(p_premio, '')) > 120
    or p_activa is null then
    raise exception 'Revisa los datos de la recompensa'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.recompensas_tecnico (
      id, nombre, descripcion, meta_trabajos, premio, activa
    )
    values (
      v_id, btrim(p_nombre), btrim(coalesce(p_descripcion, '')),
      p_meta_trabajos, btrim(coalesce(p_premio, '')), p_activa
    );
    v_accion := 'recompensa_creada';
  else
    update public.recompensas_tecnico
    set nombre = btrim(p_nombre),
        descripcion = btrim(coalesce(p_descripcion, '')),
        meta_trabajos = p_meta_trabajos,
        premio = btrim(coalesce(p_premio, '')),
        activa = p_activa,
        actualizado_en = now()
    where id = p_id
    returning id into v_id;
    if not found then
      raise exception 'No se encontro la recompensa'
        using errcode = 'P0002';
    end if;
    v_accion := 'recompensa_actualizada';
  end if;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    v_accion,
    v_id,
    jsonb_build_object('nombre', btrim(p_nombre), 'activa', p_activa, 'meta_trabajos', p_meta_trabajos)
  );
  return v_id;
end;
$$;

create or replace function public.admin_eliminar_recompensa(
  p_session_token uuid,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  delete from public.recompensas_tecnico
  where id = p_id
  returning nombre into v_nombre;
  if not found then
    raise exception 'No se encontro la recompensa'
      using errcode = 'P0002';
  end if;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'recompensa_eliminada',
    p_id,
    jsonb_build_object('nombre', v_nombre)
  );
  return true;
end;
$$;

create or replace function public.admin_listar_transferencias_pendientes(p_session_token uuid)
returns table (
  ganancia_id uuid,
  trabajo_id uuid,
  tecnico_id uuid,
  tecnico_nombre text,
  titulo text,
  folio text,
  monto numeric,
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
    g.id,
    g.trabajo_id,
    g.tecnico_id,
    coalesce(p.nombre, 'Tecnico'),
    t.titulo,
    t.detalles_tecnicos ->> 'folio_solicitud',
    g.monto,
    g.creado_en
  from public.ganancias_tecnico as g
  join public.trabajos as t on t.id = g.trabajo_id
  left join public.perfiles as p on p.user_id = g.tecnico_id
  where g.metodo_pago = 'transferencia'
    and g.liquidado_en is null
  order by g.creado_en asc;
end;
$$;

create or replace function public.admin_liquidar_transferencia(
  p_session_token uuid,
  p_ganancia_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tecnico_id uuid;
  v_monto numeric;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;

  update public.ganancias_tecnico
  set liquidado_en = now(),
      liquidado_por = (select auth.uid())
  where id = p_ganancia_id
    and metodo_pago = 'transferencia'
    and liquidado_en is null
  returning tecnico_id, monto into v_tecnico_id, v_monto;
  if not found then
    raise exception 'La transferencia ya fue liquidada o no existe'
      using errcode = 'P0002';
  end if;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'ganancia_transferencia_liquidada',
    v_tecnico_id,
    jsonb_build_object('ganancia_id', p_ganancia_id, 'monto', v_monto)
  );
  return true;
end;
$$;

revoke all on function public.tecnico_actualizar_ubicacion_trabajo(uuid, double precision, double precision, numeric) from public, anon, authenticated;
revoke all on function public.tecnico_detener_compartir_ubicacion() from public, anon, authenticated;
revoke all on function public.tecnico_completar_trabajo(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.tecnico_obtener_centro_ganancias() from public, anon, authenticated;
revoke all on function public.admin_listar_recompensas(uuid) from public, anon, authenticated;
revoke all on function public.admin_guardar_recompensa(uuid, uuid, text, text, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_eliminar_recompensa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_listar_transferencias_pendientes(uuid) from public, anon, authenticated;
revoke all on function public.admin_liquidar_transferencia(uuid, uuid) from public, anon, authenticated;

grant execute on function public.tecnico_actualizar_ubicacion_trabajo(uuid, double precision, double precision, numeric) to authenticated;
grant execute on function public.tecnico_detener_compartir_ubicacion() to authenticated;
grant execute on function public.tecnico_completar_trabajo(uuid, numeric, text) to authenticated;
grant execute on function public.tecnico_obtener_centro_ganancias() to authenticated;
grant execute on function public.admin_listar_recompensas(uuid) to authenticated;
grant execute on function public.admin_guardar_recompensa(uuid, uuid, text, text, integer, text, boolean) to authenticated;
grant execute on function public.admin_eliminar_recompensa(uuid, uuid) to authenticated;
grant execute on function public.admin_listar_transferencias_pendientes(uuid) to authenticated;
grant execute on function public.admin_liquidar_transferencia(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ubicaciones_tecnico'
    ) then
    execute 'alter publication supabase_realtime add table public.ubicaciones_tecnico';
  end if;
end;
$$;

commit;
