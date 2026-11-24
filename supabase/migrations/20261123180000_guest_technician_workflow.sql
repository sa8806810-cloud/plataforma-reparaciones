-- Flujo de solicitudes de invitados y asignacion segura a tecnicos.
-- Pegar y ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Para aprobar un tecnico, el administrador agrega su UUID a
-- public.tecnicos_aprobados. Para revocarlo, elimina esa fila.
-- La tabla no concede acceso a anon ni authenticated.

begin;

alter table public.trabajos
  add column if not exists nombre_contacto text,
  add column if not exists telefono_contacto text,
  add column if not exists tecnico_id uuid references auth.users(id) on delete set null;

alter table public.trabajos enable row level security;

create table if not exists public.tecnicos_aprobados (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  aprobado_en timestamptz not null default now()
);

alter table public.tecnicos_aprobados enable row level security;

drop policy if exists "Permitir insertar solicitudes publicas" on public.trabajos;
drop policy if exists "Permitir leer solicitudes" on public.trabajos;

revoke all on table public.trabajos from public, anon, authenticated;
revoke all on table public.tecnicos_aprobados from public, anon, authenticated;
revoke select (
  id, cliente_id, categoria, subtipo, titulo, descripcion, detalles_tecnicos,
  localidad, direccion, referencias_domicilio, estado, creado_en,
  nombre_contacto, telefono_contacto, tecnico_id
), insert (
  id, cliente_id, categoria, subtipo, titulo, descripcion, detalles_tecnicos,
  localidad, direccion, referencias_domicilio, estado, creado_en,
  nombre_contacto, telefono_contacto, tecnico_id
), update (
  id, cliente_id, categoria, subtipo, titulo, descripcion, detalles_tecnicos,
  localidad, direccion, referencias_domicilio, estado, creado_en,
  nombre_contacto, telefono_contacto, tecnico_id
), references (
  id, cliente_id, categoria, subtipo, titulo, descripcion, detalles_tecnicos,
  localidad, direccion, referencias_domicilio, estado, creado_en,
  nombre_contacto, telefono_contacto, tecnico_id
) on table public.trabajos from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Solo usuarios autenticados pueden leer solicitudes propias o ya asignadas.
grant select on table public.trabajos to authenticated;

-- Un visitante solo puede crear una solicitud sin asignacion y con datos de contacto.
grant insert (
  categoria,
  subtipo,
  titulo,
  descripcion,
  detalles_tecnicos,
  localidad,
  direccion,
  referencias_domicilio,
  nombre_contacto,
  telefono_contacto
) on table public.trabajos to anon;

grant insert (
  cliente_id,
  categoria,
  subtipo,
  titulo,
  descripcion,
  detalles_tecnicos,
  localidad,
  direccion,
  referencias_domicilio,
  nombre_contacto,
  telefono_contacto
) on table public.trabajos to authenticated;

create or replace function public.es_tecnico_aprobado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tecnicos_aprobados as ta
      where ta.usuario_id = (select auth.uid())
    );
$$;

create policy "Invitados pueden crear solicitudes con contacto"
on public.trabajos
for insert
to anon
with check (
  cliente_id is null
  and tecnico_id is null
  and estado = 'solicitado'
  and length(btrim(nombre_contacto)) between 1 and 120
  and telefono_contacto ~ '^[0-9]{10}$'
);

create policy "Clientes pueden crear sus solicitudes"
on public.trabajos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and cliente_id = (select auth.uid())
  and tecnico_id is null
  and estado = 'solicitado'
  and length(btrim(nombre_contacto)) between 1 and 120
  and telefono_contacto ~ '^[0-9]{10}$'
);

create policy "Usuarios leen sus solicitudes o trabajos asignados"
on public.trabajos
for select
to authenticated
using (
  cliente_id = (select auth.uid())
  or (
    tecnico_id = (select auth.uid())
    and (select public.es_tecnico_aprobado())
  )
);

-- La lista de trabajos disponibles nunca incluye domicilio, referencias,
-- telefono ni la ubicacion GPS precisa.
create or replace function public.listar_trabajos_disponibles()
returns table (
  id uuid,
  categoria text,
  subtipo text,
  titulo text,
  descripcion text,
  detalles_tecnicos jsonb,
  localidad text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select public.es_tecnico_aprobado()) is not true then
    raise exception 'Se requiere una cuenta de tecnico aprobada'
      using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.categoria,
    t.subtipo,
    t.titulo,
    t.descripcion,
    coalesce(t.detalles_tecnicos, '{}'::jsonb) - 'ubicacion_gps' - 'contacto_invitado',
    t.localidad,
    t.creado_en
  from public.trabajos as t
  where t.estado = 'solicitado'
    and t.tecnico_id is null
    and length(btrim(t.nombre_contacto)) between 1 and 120
    and t.telefono_contacto ~ '^[0-9]{10}$'
  order by t.creado_en asc;
end;
$$;

-- La asignacion es atomica: si dos tecnicos intentan aceptar el mismo trabajo,
-- solo uno puede cambiarlo de solicitado a aceptado.
create or replace function public.aceptar_trabajo(p_trabajo_id uuid)
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

  update public.trabajos as t
  set tecnico_id = (select auth.uid()),
      estado = 'aceptado'
  where t.id = p_trabajo_id
    and t.tecnico_id is null
    and t.estado = 'solicitado'
  returning t.* into v_trabajo;

  if not found then
    raise exception 'El trabajo ya no esta disponible'
      using errcode = 'P0002';
  end if;

  return v_trabajo;
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

  if p_nuevo_estado not in ('en_proceso', 'completado') then
    raise exception 'Estado de trabajo no permitido'
      using errcode = '22023';
  end if;

  update public.trabajos as t
  set estado = p_nuevo_estado
  where t.id = p_trabajo_id
    and t.tecnico_id = (select auth.uid())
    and (
      (t.estado = 'aceptado' and p_nuevo_estado = 'en_proceso')
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

revoke all on function public.es_tecnico_aprobado() from public, anon, authenticated;
revoke all on function public.listar_trabajos_disponibles() from public, anon, authenticated;
revoke all on function public.aceptar_trabajo(uuid) from public, anon, authenticated;
revoke all on function public.actualizar_estado_trabajo(uuid, text) from public, anon, authenticated;

grant execute on function public.es_tecnico_aprobado() to authenticated;
grant execute on function public.listar_trabajos_disponibles() to authenticated;
grant execute on function public.aceptar_trabajo(uuid) to authenticated;
grant execute on function public.actualizar_estado_trabajo(uuid, text) to authenticated;

commit;
