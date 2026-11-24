-- FixNow: centro de control, moderacion, soporte y contenido del sitio.
-- Ejecutar despues de:
--   20261123180000_guest_technician_workflow.sql
--   20261123194000_fixnow_role_admin_workflows.sql
--   20261123210000_fixnow_professional_profiles.sql
-- Pegar y ejecutar completo en Supabase Dashboard > SQL Editor.

begin;

alter table public.perfiles
  add column if not exists estado_cuenta text not null default 'activo',
  add column if not exists suspension_hasta timestamptz,
  add column if not exists motivo_sancion text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'perfiles_estado_cuenta_valido'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_estado_cuenta_valido
      check (
        estado_cuenta in ('activo', 'suspendido', 'baneado')
        and (
          (estado_cuenta = 'suspendido' and suspension_hasta is not null)
          or (estado_cuenta <> 'suspendido' and suspension_hasta is null)
        )
      );
  end if;
end;
$$;

-- Los campos de moderacion no se exponen en la tabla de perfiles publicos.
revoke select on table public.perfiles from anon, authenticated;
grant select (
  user_id,
  rol,
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
  creado_en,
  actualizado_en
) on table public.perfiles to anon, authenticated;

alter table public.trabajos
  add column if not exists aceptado_en timestamptz,
  add column if not exists motivo_cancelacion text;

create or replace function private.marcar_aceptacion_trabajo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'solicitado'
    and new.estado in ('aceptado', 'en_camino', 'en_proceso', 'completado')
    and new.aceptado_en is null then
    new.aceptado_en := now();
  end if;
  return new;
end;
$$;

revoke all on function private.marcar_aceptacion_trabajo() from public, anon, authenticated;
drop trigger if exists marcar_aceptacion_trabajo on public.trabajos;
create trigger marcar_aceptacion_trabajo
  before update of estado on public.trabajos
  for each row execute function private.marcar_aceptacion_trabajo();

create or replace function private.cuenta_activa_usuario()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.perfiles as p
      where p.user_id = (select auth.uid())
        and (
          p.estado_cuenta = 'activo'
          or (
            p.estado_cuenta = 'suspendido'
            and p.suspension_hasta <= now()
          )
        )
    );
$$;

revoke all on function private.cuenta_activa_usuario() from public, anon, authenticated;
grant execute on function private.cuenta_activa_usuario() to authenticated;

create or replace function public.mi_estado_cuenta()
returns table (
  estado_cuenta text,
  suspension_hasta timestamptz,
  motivo_sancion text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now()
        then 'activo'
      else p.estado_cuenta
    end,
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now()
        then null
      else p.suspension_hasta
    end,
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now()
        then null
      else p.motivo_sancion
    end
  from public.perfiles as p
  where p.user_id = (select auth.uid());
$$;

create or replace function public.es_tecnico_aprobado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.cuenta_activa_usuario()
    and exists (
      select 1
      from public.tecnicos_aprobados as ta
      where ta.usuario_id = (select auth.uid())
    );
$$;

revoke all on function public.mi_estado_cuenta() from public, anon, authenticated;
grant execute on function public.mi_estado_cuenta() to authenticated;
revoke all on function public.es_tecnico_aprobado() from public, anon, authenticated;
grant execute on function public.es_tecnico_aprobado() to authenticated;

drop policy if exists "Cuentas activas pueden crear solicitudes"
  on public.trabajos;
create policy "Cuentas activas pueden crear solicitudes"
  on public.trabajos
  as restrictive
  for insert
  to authenticated
  with check ((select private.cuenta_activa_usuario()));

create table if not exists public.conversaciones_soporte (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_mensaje_en timestamptz,
  ultimo_mensaje text not null default ''
);

create table if not exists public.mensajes_soporte (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null
    references public.conversaciones_soporte(id) on delete cascade,
  remitente_id uuid not null references auth.users(id) on delete cascade,
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 5000),
  creado_en timestamptz not null default now(),
  leido_en timestamptz
);

create index if not exists mensajes_soporte_conversacion_fecha_idx
  on public.mensajes_soporte (conversacion_id, creado_en desc);

alter table public.conversaciones_soporte enable row level security;
alter table public.mensajes_soporte enable row level security;
revoke all on table public.conversaciones_soporte from public, anon, authenticated;
revoke all on table public.mensajes_soporte from public, anon, authenticated;
grant select, insert on table public.conversaciones_soporte to authenticated;
revoke insert on table public.conversaciones_soporte from authenticated;
grant insert (usuario_id) on table public.conversaciones_soporte to authenticated;
grant select on table public.mensajes_soporte to authenticated;
grant insert (conversacion_id, remitente_id, cuerpo) on table public.mensajes_soporte to authenticated;

drop policy if exists "Usuarios consultan su conversacion de soporte"
  on public.conversaciones_soporte;
create policy "Usuarios consultan su conversacion de soporte"
  on public.conversaciones_soporte
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists "Usuarios crean su conversacion de soporte"
  on public.conversaciones_soporte;
create policy "Usuarios crean su conversacion de soporte"
  on public.conversaciones_soporte
  for insert
  to authenticated
  with check (usuario_id = (select auth.uid()));

drop policy if exists "Usuarios consultan mensajes de su conversacion"
  on public.mensajes_soporte;
create policy "Usuarios consultan mensajes de su conversacion"
  on public.mensajes_soporte
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversaciones_soporte as c
      where c.id = conversacion_id
        and c.usuario_id = (select auth.uid())
    )
  );

drop policy if exists "Usuarios envian mensajes a soporte"
  on public.mensajes_soporte;
create policy "Usuarios envian mensajes a soporte"
  on public.mensajes_soporte
  for insert
  to authenticated
  with check (
    remitente_id = (select auth.uid())
    and exists (
      select 1
      from public.conversaciones_soporte as c
      where c.id = conversacion_id
        and c.usuario_id = (select auth.uid())
    )
  );

create or replace function private.actualizar_resumen_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversaciones_soporte as c
  set actualizado_en = new.creado_en,
      ultimo_mensaje_en = new.creado_en,
      ultimo_mensaje = left(new.cuerpo, 280)
  where c.id = new.conversacion_id;
  return new;
end;
$$;

revoke all on function private.actualizar_resumen_conversacion() from public, anon, authenticated;
drop trigger if exists actualizar_resumen_conversacion on public.mensajes_soporte;
create trigger actualizar_resumen_conversacion
  after insert on public.mensajes_soporte
  for each row execute function private.actualizar_resumen_conversacion();

create or replace function public.marcar_mensajes_soporte_leidos()
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

  update public.mensajes_soporte as m
  set leido_en = now()
  from public.conversaciones_soporte as c
  where c.id = m.conversacion_id
    and c.usuario_id = (select auth.uid())
    and m.remitente_id <> (select auth.uid())
    and m.leido_en is null;

  return true;
end;
$$;

create table if not exists public.configuracion_sitio (
  id smallint primary key default 1 check (id = 1),
  configuracion jsonb not null,
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now()
);

alter table public.configuracion_sitio enable row level security;
revoke all on table public.configuracion_sitio from public, anon, authenticated;
grant select on table public.configuracion_sitio to anon, authenticated;

drop policy if exists "Configuracion del sitio es publica"
  on public.configuracion_sitio;
create policy "Configuracion del sitio es publica"
  on public.configuracion_sitio
  for select
  to anon, authenticated
  using (id = 1);

insert into public.configuracion_sitio (id, configuracion)
values (
  1,
  '{
    "brandName": "FixNow",
    "tagline": "Asistencia y reparaciones al instante",
    "heroTitle": "Tu hogar en buenas manos, sin complicaciones.",
    "heroSubtitle": "Encuentra ayuda confiable para reparar, instalar y mantener tu hogar. Describe lo que necesitas y recibe atención de profesionales de tu zona.",
    "primaryAction": "Solicitar reparación o instalación",
    "secondaryAction": "Acceso y registro de cuenta",
    "bannerEnabled": false,
    "bannerText": "",
    "supportPhone": "",
    "footerText": "Servicios confiables para tu hogar.",
    "primaryColor": "#317cf4",
    "featuredCategories": ["electricidad", "instalacion", "plomeria", "reparaciones", "cerrajeria", "electrodomesticos"],
    "showHowItWorks": true,
    "showTechnicians": true,
    "showFaq": true
  }'::jsonb
)
on conflict (id) do nothing;

create table if not exists public.auditoria_administrativa (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  accion text not null,
  objetivo_id uuid,
  detalles jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists auditoria_administrativa_fecha_idx
  on public.auditoria_administrativa (creado_en desc);

alter table public.auditoria_administrativa enable row level security;
revoke all on table public.auditoria_administrativa from public, anon, authenticated;

create or replace function private.registrar_cambio_sesion_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria_administrativa (accion, objetivo_id, detalles)
    values ('administrador_registrado', new.user_id, '{}'::jsonb);
    return new;
  end if;

  if new.session_token is distinct from old.session_token then
    insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
    values (
      new.user_id,
      case
        when old.session_token is null and new.session_token is not null then 'sesion_admin_iniciada'
        when old.session_token is not null and new.session_token is null then 'sesion_admin_cerrada'
        else 'sesion_admin_reemplazada'
      end,
      new.user_id,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

revoke all on function private.registrar_cambio_sesion_admin() from public, anon, authenticated;
drop trigger if exists registrar_cambio_sesion_admin on public.administradores;
create trigger registrar_cambio_sesion_admin
  after insert or update of session_token on public.administradores
  for each row execute function private.registrar_cambio_sesion_admin();

-- Permite que la RPC administrativa cambie roles, sin dar permisos directos
-- para cambiar el rol desde el cliente.
create or replace function public.proteger_identidad_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'El identificador del perfil no se puede cambiar'
      using errcode = '42501';
  end if;

  if new.rol <> old.rol and not public.es_administrador() then
    raise exception 'El rol solo puede cambiarlo un administrador'
      using errcode = '42501';
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

revoke all on function public.proteger_identidad_perfil() from public, anon, authenticated;

create or replace function public.admin_control_resumen(p_session_token uuid)
returns table (
  total_solicitudes bigint,
  pendientes bigint,
  en_curso bigint,
  completadas bigint,
  clientes bigint,
  trabajadores bigint,
  tecnicos_activos bigint,
  tecnicos_pendientes bigint,
  solicitudes_30d bigint,
  solicitudes_30d_prev bigint,
  conversion_30d numeric,
  conversion_30d_prev numeric,
  minutos_promedio_aceptacion numeric,
  actividad_reciente jsonb
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
    (select count(*) from public.tecnicos_aprobados),
    (
      select count(*)
      from public.perfiles as p
      where p.rol = 'tecnico'
        and not exists (
          select 1 from public.tecnicos_aprobados as ta
          where ta.usuario_id = p.user_id
        )
    ),
    (
      select count(*) from public.trabajos
      where creado_en >= now() - interval '30 days'
    ),
    (
      select count(*) from public.trabajos
      where creado_en >= now() - interval '60 days'
        and creado_en < now() - interval '30 days'
    ),
    (
      select coalesce(
        count(*) filter (where estado in ('aceptado', 'en_camino', 'en_proceso', 'completado'))::numeric
          * 100 / nullif(count(*), 0),
        0
      )
      from public.trabajos
      where creado_en >= now() - interval '30 days'
    ),
    (
      select coalesce(
        count(*) filter (where estado in ('aceptado', 'en_camino', 'en_proceso', 'completado'))::numeric
          * 100 / nullif(count(*), 0),
        0
      )
      from public.trabajos
      where creado_en >= now() - interval '60 days'
        and creado_en < now() - interval '30 days'
    ),
    (
      select coalesce(
        avg(extract(epoch from (aceptado_en - creado_en)) / 60)::numeric(12, 2),
        0
      )
      from public.trabajos
      where aceptado_en is not null
        and creado_en >= now() - interval '30 days'
    ),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', recent_job.id,
            'categoria', recent_job.categoria,
            'titulo', recent_job.titulo,
            'estado', recent_job.estado,
            'localidad', recent_job.localidad,
            'creado_en', recent_job.creado_en
          )
          order by recent_job.creado_en desc
        ),
        '[]'::jsonb
      )
      from (
        select id, categoria, titulo, estado, localidad, creado_en
        from public.trabajos
        order by creado_en desc
        limit 10
      ) as recent_job
    );
end;
$$;

create or replace function public.admin_control_listar_usuarios(p_session_token uuid)
returns table (
  user_id uuid,
  correo text,
  telefono text,
  nombre text,
  rol text,
  localidad text,
  estado_cuenta text,
  suspension_hasta timestamptz,
  motivo_sancion text,
  creado_en timestamptz,
  verificado boolean,
  titular text,
  anios_experiencia smallint,
  trabajos_total bigint
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
    p.user_id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'telefono', ''),
    p.nombre,
    p.rol,
    p.localidad,
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now() then 'activo'
      else p.estado_cuenta
    end,
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now() then null
      else p.suspension_hasta
    end,
    case
      when p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now() then null
      else p.motivo_sancion
    end,
    u.created_at,
    ta.usuario_id is not null,
    p.titular,
    p.anios_experiencia,
    (
      select count(*)
      from public.trabajos as t
      where t.cliente_id = p.user_id or t.tecnico_id = p.user_id
    )
  from public.perfiles as p
  join auth.users as u on u.id = p.user_id
  left join public.tecnicos_aprobados as ta on ta.usuario_id = p.user_id
  where not exists (
    select 1 from public.administradores as a where a.user_id = p.user_id
  )
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_control_detalle_usuario(
  p_session_token uuid,
  p_user_id uuid
)
returns table (
  perfil jsonb,
  experiencias jsonb,
  trabajos jsonb
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
    jsonb_build_object(
      'user_id', p.user_id,
      'correo', u.email,
      'telefono', u.raw_user_meta_data ->> 'telefono',
      'nombre', p.nombre,
      'rol', p.rol,
      'localidad', p.localidad,
      'avatar_url', p.avatar_url,
      'titular', p.titular,
      'anios_experiencia', p.anios_experiencia,
      'tarifa_base', p.tarifa_base,
      'acerca_de', p.acerca_de,
      'disponibilidad', p.disponibilidad,
      'habilidades', p.habilidades,
      'certificaciones', p.certificaciones,
      'estado_cuenta', p.estado_cuenta,
      'suspension_hasta', p.suspension_hasta,
      'motivo_sancion', p.motivo_sancion,
      'creado_en', u.created_at,
      'verificado', ta.usuario_id is not null
    ),
    coalesce(exp.items, '[]'::jsonb),
    coalesce(historial.items, '[]'::jsonb)
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
      ) order by e.fecha_inicio desc
    ) as items
    from public.experiencias_trabajador as e
    where e.trabajador_id = p.user_id
  ) as exp on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'categoria', t.categoria,
        'titulo', t.titulo,
        'estado', t.estado,
        'localidad', t.localidad,
        'creado_en', t.creado_en,
        'rol_usuario', case
          when t.cliente_id = p.user_id then 'cliente'
          else 'tecnico'
        end
      ) order by t.creado_en desc
    ) as items
    from public.trabajos as t
    where t.cliente_id = p.user_id or t.tecnico_id = p.user_id
  ) as historial on true
  where p.user_id = p_user_id
    and not exists (
      select 1 from public.administradores as a where a.user_id = p.user_id
    );
end;
$$;

create or replace function public.admin_control_moderar_usuario(
  p_session_token uuid,
  p_user_id uuid,
  p_accion text,
  p_motivo text default null,
  p_hasta timestamptz default null,
  p_nuevo_rol text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado text;
  v_hasta timestamptz;
  v_motivo text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = (select auth.uid()) or exists (
    select 1 from public.administradores as a where a.user_id = p_user_id
  ) then
    raise exception 'No se puede moderar esta cuenta administrativa'
      using errcode = '42501';
  end if;

  select p.rol into v_rol
  from public.perfiles as p
  where p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'No se encontro el perfil del usuario'
      using errcode = 'P0002';
  end if;

  v_estado := case
    when p_accion = 'suspender' then 'suspendido'
    when p_accion = 'banear' then 'baneado'
    when p_accion in ('reactivar', 'cambiar_rol', 'aprobar', 'revocar') then null
    else null
  end;
  if p_accion not in ('suspender', 'banear', 'reactivar', 'cambiar_rol', 'aprobar', 'revocar') then
    raise exception 'Accion de moderacion no valida'
      using errcode = '22023';
  end if;

  if p_accion in ('suspender', 'banear') and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Es obligatorio indicar el motivo de la sancion'
      using errcode = '22023';
  end if;
  if p_accion = 'suspender' and (p_hasta is null or p_hasta <= now()) then
    raise exception 'La fecha de fin de suspension debe ser futura'
      using errcode = '22023';
  end if;
  if p_accion = 'cambiar_rol' and p_nuevo_rol not in ('cliente', 'tecnico') then
    raise exception 'El rol seleccionado no es valido'
      using errcode = '22023';
  end if;
  if p_accion in ('aprobar', 'revocar') and v_rol <> 'tecnico' then
    raise exception 'Solo se puede verificar una cuenta de tecnico'
      using errcode = '22023';
  end if;

  if p_accion in ('suspender', 'banear', 'reactivar') then
    update public.perfiles
    set estado_cuenta = case when p_accion = 'reactivar' then 'activo' else v_estado end,
        suspension_hasta = case when p_accion = 'suspender' then p_hasta else null end,
        motivo_sancion = case when p_accion = 'reactivar' then null else btrim(p_motivo) end
    where user_id = p_user_id;
  elsif p_accion = 'cambiar_rol' then
    update public.perfiles
    set rol = p_nuevo_rol,
        titular = case when p_nuevo_rol = 'cliente' then '' else titular end
    where user_id = p_user_id;

    if p_nuevo_rol = 'cliente' then
      delete from public.tecnicos_aprobados where usuario_id = p_user_id;
    end if;
  elsif p_accion = 'aprobar' then
    insert into public.tecnicos_aprobados (usuario_id)
    values (p_user_id)
    on conflict (usuario_id) do nothing;
  elsif p_accion = 'revocar' then
    delete from public.tecnicos_aprobados where usuario_id = p_user_id;
  end if;

  v_hasta := case when p_accion = 'suspender' then p_hasta else null end;
  v_motivo := case when p_accion in ('suspender', 'banear') then btrim(p_motivo) else null end;
  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'usuario_' || p_accion,
    p_user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'motivo', v_motivo,
      'suspension_hasta', v_hasta,
      'rol_anterior', case when p_accion = 'cambiar_rol' then v_rol end,
      'rol_nuevo', case when p_accion = 'cambiar_rol' then p_nuevo_rol end
    ))
  );

  return true;
end;
$$;

create or replace function public.admin_control_actualizar_trabajo(
  p_session_token uuid,
  p_trabajo_id uuid,
  p_estado text,
  p_tecnico_id uuid,
  p_motivo_cancelacion text default null
)
returns public.trabajos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajo public.trabajos;
  v_estado_anterior text;
  v_tecnico_anterior uuid;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in (
    'solicitado', 'aceptado', 'en_camino', 'en_proceso', 'completado', 'cancelado'
  ) then
    raise exception 'Estado de trabajo no permitido'
      using errcode = '22023';
  end if;
  if p_estado = 'cancelado' and length(btrim(coalesce(p_motivo_cancelacion, ''))) < 3 then
    raise exception 'Indica el motivo de cancelacion'
      using errcode = '22023';
  end if;
  if p_estado in ('solicitado', 'cancelado') and p_tecnico_id is not null then
    raise exception 'Una solicitud pendiente o cancelada no puede tener tecnico asignado'
      using errcode = '22023';
  end if;
  if p_estado in ('aceptado', 'en_camino', 'en_proceso', 'completado')
    and p_tecnico_id is null then
    raise exception 'Una solicitud asignada requiere un tecnico'
      using errcode = '22023';
  end if;
  if p_tecnico_id is not null and not exists (
    select 1 from public.tecnicos_aprobados as ta
    join public.perfiles as p on p.user_id = ta.usuario_id
    where ta.usuario_id = p_tecnico_id
      and p.rol = 'tecnico'
      and (
        p.estado_cuenta = 'activo'
        or (p.estado_cuenta = 'suspendido' and p.suspension_hasta <= now())
      )
  ) then
    raise exception 'El tecnico seleccionado no esta aprobado o tiene una cuenta restringida'
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
        when v_estado_anterior = 'cancelado' then t.motivo_cancelacion
        else null
      end
  where t.id = p_trabajo_id
  returning t.* into v_trabajo;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'solicitud_actualizada',
    p_trabajo_id,
    jsonb_strip_nulls(jsonb_build_object(
      'estado_anterior', v_estado_anterior,
      'estado_nuevo', p_estado,
      'tecnico_anterior', v_tecnico_anterior,
      'tecnico_nuevo', p_tecnico_id,
      'motivo_cancelacion', case when p_estado = 'cancelado' then btrim(p_motivo_cancelacion) end
    ))
  );
  return v_trabajo;
end;
$$;

create or replace function public.admin_control_guardar_configuracion(
  p_session_token uuid,
  p_configuracion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_color text;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_configuracion) <> 'object' then
    raise exception 'La configuracion debe ser un objeto JSON'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuracion -> 'featuredCategories') is distinct from 'array'
    or jsonb_typeof(p_configuracion -> 'showHowItWorks') is distinct from 'boolean'
    or jsonb_typeof(p_configuracion -> 'showTechnicians') is distinct from 'boolean'
    or jsonb_typeof(p_configuracion -> 'showFaq') is distinct from 'boolean'
    or jsonb_typeof(p_configuracion -> 'bannerEnabled') is distinct from 'boolean' then
    raise exception 'Faltan opciones validas de secciones o categorias'
      using errcode = '22023';
  end if;

  v_color := p_configuracion ->> 'primaryColor';
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'El color principal debe estar en formato hexadecimal #RRGGBB'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_configuracion -> 'featuredCategories') as categoria(value)
    where categoria.value not in (
      'electricidad', 'instalacion', 'plomeria', 'reparaciones', 'cerrajeria', 'electrodomesticos'
    )
  ) then
    raise exception 'La lista contiene una categoria no permitida'
      using errcode = '22023';
  end if;
  if length(coalesce(p_configuracion ->> 'brandName', '')) not between 1 and 80
    or length(coalesce(p_configuracion ->> 'tagline', '')) > 160
    or length(coalesce(p_configuracion ->> 'heroTitle', '')) not between 1 and 240
    or length(coalesce(p_configuracion ->> 'heroSubtitle', '')) > 1000
    or length(coalesce(p_configuracion ->> 'primaryAction', '')) not between 1 and 100
    or length(coalesce(p_configuracion ->> 'secondaryAction', '')) > 100
    or length(coalesce(p_configuracion ->> 'bannerText', '')) > 300
    or length(coalesce(p_configuracion ->> 'supportPhone', '')) > 30
    or length(coalesce(p_configuracion ->> 'footerText', '')) > 300 then
    raise exception 'Uno o mas textos exceden el largo permitido o estan vacios'
      using errcode = '22023';
  end if;

  update public.configuracion_sitio
  set configuracion = p_configuracion,
      actualizado_por = (select auth.uid()),
      actualizado_en = now()
  where id = 1;

  insert into public.auditoria_administrativa (actor_id, accion, objetivo_id, detalles)
  values (
    (select auth.uid()),
    'configuracion_sitio_publicada',
    (select auth.uid()),
    jsonb_build_object('brandName', p_configuracion ->> 'brandName')
  );
  return p_configuracion;
end;
$$;

create or replace function public.admin_control_listar_auditoria(
  p_session_token uuid,
  p_limite integer default 100
)
returns table (
  id bigint,
  actor_id uuid,
  actor_correo text,
  accion text,
  objetivo_id uuid,
  detalles jsonb,
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
    a.id,
    a.actor_id,
    u.email::text,
    a.accion,
    a.objetivo_id,
    a.detalles,
    a.creado_en
  from public.auditoria_administrativa as a
  left join auth.users as u on u.id = a.actor_id
  order by a.creado_en desc
  limit greatest(1, least(coalesce(p_limite, 100), 250));
end;
$$;

create or replace function public.admin_control_listar_conversaciones(
  p_session_token uuid,
  p_rol text default null
)
returns table (
  conversacion_id uuid,
  usuario_id uuid,
  nombre text,
  correo text,
  rol text,
  estado_cuenta text,
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
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  return query
  select
    c.id,
    c.usuario_id,
    coalesce(p.nombre, u.email::text, 'Usuario FixNow'),
    u.email::text,
    coalesce(p.rol, 'cliente'),
    coalesce(p.estado_cuenta, 'activo'),
    c.ultimo_mensaje,
    c.ultimo_mensaje_en,
    (
      select count(*)
      from public.mensajes_soporte as m
      where m.conversacion_id = c.id
        and m.remitente_id = c.usuario_id
        and m.leido_en is null
    )
  from public.conversaciones_soporte as c
  join auth.users as u on u.id = c.usuario_id
  left join public.perfiles as p on p.user_id = c.usuario_id
  where p_rol is null or p.rol = p_rol
  order by c.ultimo_mensaje_en desc nulls last, c.creado_en desc;
end;
$$;

create or replace function public.admin_control_listar_mensajes(
  p_session_token uuid,
  p_conversacion_id uuid
)
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
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversaciones_soporte as c where c.id = p_conversacion_id
  ) then
    raise exception 'No se encontro la conversacion'
      using errcode = 'P0002';
  end if;
  return query
  select
    m.id,
    m.conversacion_id,
    m.remitente_id,
    case
      when m.remitente_id = c.usuario_id then coalesce(p.nombre, u.email::text, 'Usuario')
      else 'Administracion'
    end,
    m.cuerpo,
    m.creado_en,
    m.leido_en
  from (
    select ms.*
    from public.mensajes_soporte as ms
    where ms.conversacion_id = p_conversacion_id
    order by ms.creado_en desc
    limit 200
  ) as m
  join public.conversaciones_soporte as c on c.id = m.conversacion_id
  left join public.perfiles as p on p.user_id = m.remitente_id
  left join auth.users as u on u.id = m.remitente_id
  order by m.creado_en asc;
end;
$$;

create or replace function public.admin_control_iniciar_conversacion(
  p_session_token uuid,
  p_usuario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversacion_id uuid;
begin
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.perfiles as p where p.user_id = p_usuario_id
  ) or exists (
    select 1 from public.administradores as a where a.user_id = p_usuario_id
  ) then
    raise exception 'No se encontro el usuario de FixNow'
      using errcode = 'P0002';
  end if;

  insert into public.conversaciones_soporte (usuario_id)
  values (p_usuario_id)
  on conflict (usuario_id) do nothing;

  select c.id into v_conversacion_id
  from public.conversaciones_soporte as c
  where c.usuario_id = p_usuario_id;
  return v_conversacion_id;
end;
$$;

create or replace function public.admin_control_enviar_mensaje(
  p_session_token uuid,
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
  if not public._admin_sesion_vigente(p_session_token) then
    raise exception 'La sesion administrativa ya no esta vigente'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_cuerpo, ''))) not between 1 and 5000 then
    raise exception 'El mensaje debe tener entre 1 y 5000 caracteres'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.perfiles as p where p.user_id = p_usuario_id
  ) or exists (
    select 1 from public.administradores as a where a.user_id = p_usuario_id
  ) then
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

create or replace function public.admin_control_marcar_leidos(
  p_session_token uuid,
  p_conversacion_id uuid
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

revoke all on function public.marcar_mensajes_soporte_leidos() from public, anon, authenticated;
grant execute on function public.marcar_mensajes_soporte_leidos() to authenticated;

-- Deshabilita las RPC administrativas antiguas que no escriben auditoría ni
-- exigen motivo para cancelar; la interfaz usa las variantes auditadas nuevas.
revoke all on function public.admin_establecer_aprobacion_tecnico(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_actualizar_trabajo(uuid, uuid, text, uuid)
  from public, anon, authenticated;

revoke all on function public.admin_control_resumen(uuid) from public, anon, authenticated;
revoke all on function public.admin_control_listar_usuarios(uuid) from public, anon, authenticated;
revoke all on function public.admin_control_detalle_usuario(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_control_moderar_usuario(uuid, uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_control_actualizar_trabajo(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_control_guardar_configuracion(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_control_listar_auditoria(uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_control_listar_conversaciones(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_control_listar_mensajes(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_control_iniciar_conversacion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_control_enviar_mensaje(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_control_marcar_leidos(uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_control_resumen(uuid) to authenticated;
grant execute on function public.admin_control_listar_usuarios(uuid) to authenticated;
grant execute on function public.admin_control_detalle_usuario(uuid, uuid) to authenticated;
grant execute on function public.admin_control_moderar_usuario(uuid, uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_control_actualizar_trabajo(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.admin_control_guardar_configuracion(uuid, jsonb) to authenticated;
grant execute on function public.admin_control_listar_auditoria(uuid, integer) to authenticated;
grant execute on function public.admin_control_listar_conversaciones(uuid, text) to authenticated;
grant execute on function public.admin_control_listar_mensajes(uuid, uuid) to authenticated;
grant execute on function public.admin_control_iniciar_conversacion(uuid, uuid) to authenticated;
grant execute on function public.admin_control_enviar_mensaje(uuid, uuid, text) to authenticated;
grant execute on function public.admin_control_marcar_leidos(uuid, uuid) to authenticated;

commit;
