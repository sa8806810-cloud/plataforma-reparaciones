-- Calendario de excepciones por fecha y consulta segura de disponibilidad para clientes.
-- Ejecutar después de 20261124100000_fixnow_technician_availability_moderators.sql.

begin;

alter table public.perfiles
  add column if not exists disponibilidad_fechas jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'perfiles_disponibilidad_fechas_objeto'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_disponibilidad_fechas_objeto
      check (jsonb_typeof(disponibilidad_fechas) = 'object');
  end if;
end;
$$;

create or replace function private.tecnico_disponible_en_fecha(
  p_tecnico_id uuid,
  p_fecha date,
  p_hora time
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles as p
    where p.user_id = p_tecnico_id
      and p.rol = 'tecnico'
      and case
        when p.disponibilidad_fechas ? p_fecha::text then
          case
            when coalesce(p.disponibilidad_fechas -> p_fecha::text ->> 'activo', 'false') = 'true'
              and coalesce(p.disponibilidad_fechas -> p_fecha::text ->> 'inicio', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
              and coalesce(p.disponibilidad_fechas -> p_fecha::text ->> 'fin', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            then (p.disponibilidad_fechas -> p_fecha::text ->> 'inicio')::time <= p_hora
              and (p.disponibilidad_fechas -> p_fecha::text ->> 'fin')::time > p_hora
            else false
          end
        else
          not (p.fechas_bloqueadas @> to_jsonb(p_fecha::text))
          and case
            when coalesce(p.disponibilidad_semanal -> (
              case extract(isodow from p_fecha)::integer
                when 1 then 'lunes'
                when 2 then 'martes'
                when 3 then 'miercoles'
                when 4 then 'jueves'
                when 5 then 'viernes'
                when 6 then 'sabado'
                else 'domingo'
              end
            ) ->> 'activo', 'false') = 'true'
              and coalesce(p.disponibilidad_semanal -> (
                case extract(isodow from p_fecha)::integer
                  when 1 then 'lunes'
                  when 2 then 'martes'
                  when 3 then 'miercoles'
                  when 4 then 'jueves'
                  when 5 then 'viernes'
                  when 6 then 'sabado'
                  else 'domingo'
                end
              ) ->> 'inicio', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
              and coalesce(p.disponibilidad_semanal -> (
                case extract(isodow from p_fecha)::integer
                  when 1 then 'lunes'
                  when 2 then 'martes'
                  when 3 then 'miercoles'
                  when 4 then 'jueves'
                  when 5 then 'viernes'
                  when 6 then 'sabado'
                  else 'domingo'
                end
              ) ->> 'fin', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            then (p.disponibilidad_semanal -> (
              case extract(isodow from p_fecha)::integer
                when 1 then 'lunes'
                when 2 then 'martes'
                when 3 then 'miercoles'
                when 4 then 'jueves'
                when 5 then 'viernes'
                when 6 then 'sabado'
                else 'domingo'
              end
            ) ->> 'inicio')::time <= p_hora
              and (p.disponibilidad_semanal -> (
                case extract(isodow from p_fecha)::integer
                  when 1 then 'lunes'
                  when 2 then 'martes'
                  when 3 then 'miercoles'
                  when 4 then 'jueves'
                  when 5 then 'viernes'
                  when 6 then 'sabado'
                  else 'domingo'
                end
              ) ->> 'fin')::time > p_hora
            else false
          end
      end
  );
$$;

revoke all on function private.tecnico_disponible_en_fecha(uuid, date, time)
  from public, anon, authenticated;

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
    'fechas_bloqueadas', p.fechas_bloqueadas,
    'disponibilidad_fechas', p.disponibilidad_fechas
  )
  into v_resultado
  from public.perfiles as p
  where p.user_id = (select auth.uid())
    and p.rol = 'tecnico';

  if v_resultado is null then
    raise exception 'Esta funcion esta disponible solo para cuentas de tecnico'
      using errcode = '42501';
  end if;
  return v_resultado;
end;
$$;

create or replace function public.tecnico_guardar_agenda_fecha(
  p_fecha date,
  p_activo boolean default true,
  p_inicio time default null,
  p_fin time default null,
  p_restaurar_semanal boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agenda jsonb;
  v_hoy date := timezone('America/Mexico_City', now())::date;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere iniciar sesion'
      using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha < v_hoy or p_fecha > v_hoy + 180 then
    raise exception 'Selecciona una fecha entre hoy y los proximos 180 dias'
      using errcode = '22023';
  end if;
  if not coalesce(p_restaurar_semanal, false)
    and (p_activo is null or (
      p_activo and (
        p_inicio is null
        or p_fin is null
        or p_inicio >= p_fin
      )
    )) then
    raise exception 'Indica si trabajaras y define un horario valido'
      using errcode = '22023';
  end if;

  select coalesce(p.disponibilidad_fechas, '{}'::jsonb)
  into v_agenda
  from public.perfiles as p
  where p.user_id = (select auth.uid())
    and p.rol = 'tecnico'
    and (
      p.estado_cuenta = 'activo'
      or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
    )
  for update;

  if not found then
    raise exception 'No se encontro una cuenta de tecnico activa'
      using errcode = '42501';
  end if;

  if coalesce(p_restaurar_semanal, false) then
    v_agenda := v_agenda - p_fecha::text;
  else
    v_agenda := jsonb_set(
      v_agenda,
      array[p_fecha::text],
      jsonb_build_object(
        'activo', p_activo,
        'inicio', case when p_activo then to_char(p_inicio, 'HH24:MI') else null end,
        'fin', case when p_activo then to_char(p_fin, 'HH24:MI') else null end
      ),
      true
    );
  end if;

  update public.perfiles as p
  set disponibilidad_fechas = v_agenda,
      fechas_bloqueadas = coalesce(p.fechas_bloqueadas, '[]'::jsonb) - p_fecha::text
  where p.user_id = (select auth.uid())
    and p.rol = 'tecnico';
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
  v_hoy date := timezone('America/Mexico_City', now())::date;
begin
  if (select auth.uid()) is null or p_fecha is null or p_hora is null then
    raise exception 'Inicia sesion y selecciona fecha y hora'
      using errcode = '42501';
  end if;
  if p_fecha < v_hoy
    or (p_fecha = v_hoy and p_hora <= timezone('America/Mexico_City', now())::time)
    or length(coalesce(p_especialidad, '')) > 100
    or length(coalesce(p_localidad, '')) > 120 then
    raise exception 'La fecha o el filtro no son validos'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.perfiles as c
    where c.user_id = (select auth.uid())
      and c.rol = 'cliente'
      and c.estado_cuenta = 'activo'
  ) then
    raise exception 'Solo clientes con cuenta activa pueden consultar disponibilidad'
      using errcode = '42501';
  end if;

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
    and private.tecnico_disponible_en_fecha(p.user_id, p_fecha, p_hora)
  order by p.nombre;
end;
$$;

create or replace function public.consultar_calendario_tecnicos(
  p_desde date,
  p_hasta date,
  p_hora time,
  p_especialidad text default null,
  p_localidad text default null
)
returns table (
  fecha date,
  tecnicos_disponibles bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesion para consultar el calendario'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.perfiles as c
    where c.user_id = (select auth.uid())
      and c.rol = 'cliente'
      and c.estado_cuenta = 'activo'
  ) then
    raise exception 'Solo clientes con cuenta activa pueden consultar disponibilidad'
      using errcode = '42501';
  end if;
  if p_desde is null
    or p_hasta is null
    or p_hora is null
    or p_hasta < p_desde
    or p_hasta - p_desde > 40
    or p_hasta < v_hoy
    or p_hasta > v_hoy + 180
    or length(coalesce(p_especialidad, '')) > 100
    or length(coalesce(p_localidad, '')) > 120 then
    raise exception 'El rango o los filtros del calendario no son validos'
      using errcode = '22023';
  end if;

  return query
  with fechas as (
    select series.dia::date as dia
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as series(dia)
  ),
  tecnicos as (
    select p.user_id, p.habilidades, p.titular, p.localidad
    from public.perfiles as p
    join public.tecnicos_aprobados as ta on ta.usuario_id = p.user_id
    where p.rol = 'tecnico'
      and p.en_linea
      and (
        p.estado_cuenta = 'activo'
        or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
      )
      and (p_localidad is null or p.localidad ilike '%' || btrim(p_localidad) || '%')
      and (
        nullif(btrim(coalesce(p_especialidad, '')), '') is null
        or p.habilidades @> array[btrim(p_especialidad)]
        or p.titular ilike '%' || btrim(p_especialidad) || '%'
      )
  )
  select
    f.dia,
    count(t.user_id)::bigint
  from fechas as f
  left join tecnicos as t
    on f.dia >= v_hoy
    and (f.dia > v_hoy or p_hora > timezone('America/Mexico_City', now())::time)
    and private.tecnico_disponible_en_fecha(t.user_id, f.dia, p_hora)
  group by f.dia
  order by f.dia;
end;
$$;

revoke all on function public.tecnico_obtener_configuracion() from public, anon, authenticated;
revoke all on function public.tecnico_guardar_agenda_fecha(date, boolean, time, time, boolean) from public, anon, authenticated;
revoke all on function public.consultar_tecnicos_disponibles(date, time, text, text) from public, anon, authenticated;
revoke all on function public.consultar_calendario_tecnicos(date, date, time, text, text) from public, anon, authenticated;

grant execute on function public.tecnico_obtener_configuracion() to authenticated;
grant execute on function public.tecnico_guardar_agenda_fecha(date, boolean, time, time, boolean) to authenticated;
grant execute on function public.consultar_tecnicos_disponibles(date, time, text, text) to authenticated;
grant execute on function public.consultar_calendario_tecnicos(date, date, time, text, text) to authenticated;

commit;
