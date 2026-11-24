import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  Users,
  Wrench,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ESTADOS = {
  solicitado: 'Pendiente',
  aceptado: 'Aceptado',
  en_camino: 'En camino',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado: 'Cancelado'
};

const CATEGORIAS = [
  'electricidad',
  'plomeria',
  'reparaciones',
  'cerrajeria',
  'electrodomesticos'
];

function mostrarFecha(fecha) {
  return new Date(fecha).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function PanelAdministrador({ usuario, sessionToken, onVolver, onRecargar }) {
  const [pestana, setPestana] = useState('solicitudes');
  const [resumen, setResumen] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [accionActiva, setAccionActiva] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [ediciones, setEdiciones] = useState({});

  const obtenerDatos = useCallback(async () => {
      const opciones = { p_session_token: sessionToken };
      const [resumenResult, tecnicosResult, trabajosResult] = await Promise.all([
        supabase.rpc('admin_obtener_resumen', opciones),
        supabase.rpc('admin_listar_tecnicos', opciones),
        supabase.rpc('admin_listar_trabajos', opciones)
      ]);
      const fallido = [resumenResult, tecnicosResult, trabajosResult].find((result) => result.error);
      if (fallido?.error) throw fallido.error;

      return {
        resumen: resumenResult.data?.[0] || null,
        tecnicos: tecnicosResult.data || [],
        trabajos: trabajosResult.data || []
      };
  }, [sessionToken]);

  const aplicarDatos = useCallback((datos) => {
    setResumen(datos.resumen);
    setTecnicos(datos.tecnicos);
    setTrabajos(datos.trabajos);
    setEdiciones(Object.fromEntries(
      datos.trabajos.map((trabajo) => [
        trabajo.id,
        { estado: trabajo.estado, tecnicoId: trabajo.tecnico_id || '' }
      ])
    ));
  }, []);

  const cargarDatos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    setError('');

    try {
      aplicarDatos(await obtenerDatos());
    } catch (loadError) {
      setError(`No se pudo cargar el panel: ${loadError.message}`);
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }, [aplicarDatos, obtenerDatos]);

  useEffect(() => {
    let montado = true;
    obtenerDatos()
      .then((datos) => {
        if (montado) aplicarDatos(datos);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudo cargar el panel: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [aplicarDatos, obtenerDatos]);

  const tecnicosAprobados = useMemo(
    () => tecnicos.filter((tecnico) => tecnico.aprobado),
    [tecnicos]
  );
  const trabajosFiltrados = useMemo(
    () => trabajos.filter((trabajo) =>
      (filtroEstado === 'todos' || trabajo.estado === filtroEstado) &&
      (filtroCategoria === 'todas' || trabajo.categoria === filtroCategoria)
    ),
    [filtroCategoria, filtroEstado, trabajos]
  );
  const cambiarAprobacion = async (tecnico) => {
    const accion = tecnico.aprobado ? 'revocar' : 'aprobar';
    setAccionActiva(`tecnico-${tecnico.tecnico_id}`);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('admin_establecer_aprobacion_tecnico', {
        p_session_token: sessionToken,
        p_tecnico_id: tecnico.tecnico_id,
        p_aprobar: !tecnico.aprobado
      });
      if (rpcError) throw rpcError;

      setAviso(tecnico.aprobado ? 'Acceso de técnico revocado.' : 'Técnico aprobado correctamente.');
      await cargarDatos(false);
      onRecargar?.();
    } catch (actionError) {
      setError(`No se pudo ${accion} al técnico: ${actionError.message}`);
    } finally {
      setAccionActiva(null);
    }
  };

  const actualizarTrabajo = async (trabajo) => {
    const edicion = ediciones[trabajo.id] || {};
    const tecnicoId = edicion.tecnicoId || null;
    setAccionActiva(`trabajo-${trabajo.id}`);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('admin_actualizar_trabajo', {
        p_session_token: sessionToken,
        p_trabajo_id: trabajo.id,
        p_estado: edicion.estado || trabajo.estado,
        p_tecnico_id: tecnicoId
      });
      if (rpcError) throw rpcError;

      setAviso('Solicitud actualizada.');
      await cargarDatos(false);
    } catch (actionError) {
      setError(`No se pudo actualizar la solicitud: ${actionError.message}`);
    } finally {
      setAccionActiva(null);
    }
  };

  const actualizarEdicion = (trabajoId, campo, valor) => {
    setEdiciones((actuales) => ({
      ...actuales,
      [trabajoId]: {
        ...(actuales[trabajoId] || {}),
        [campo]: valor
      }
    }));
  };

  return (
    <section className="role-panel admin-panel">
      <div className="role-panel-header">
        <button type="button" onClick={onVolver} className="panel-action-button">
          <ArrowLeft size={16} /> Inicio
        </button>
        <div className="section-heading">
          <span className="section-eyebrow">Control de plataforma</span>
          <h2>Panel de administración</h2>
        </div>
        <div className="role-panel-actions">
          <span className="admin-identity"><ShieldCheck size={16} /> {usuario.email}</span>
          <button
            type="button"
            onClick={() => cargarDatos()}
            disabled={cargando}
            className="panel-action-button"
            aria-label="Actualizar panel de administración"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}

      <div className="admin-metrics">
        <MetricCard icon={Activity} label="Solicitudes totales" value={resumen?.total_solicitudes} />
        <MetricCard icon={Clock3} label="Pendientes" value={resumen?.pendientes} />
        <MetricCard icon={Wrench} label="En curso" value={resumen?.en_curso} />
        <MetricCard icon={CheckCircle2} label="Completadas" value={resumen?.completadas} />
        <MetricCard icon={Users} label="Técnicos activos" value={resumen?.tecnicos_activos} />
        <MetricCard icon={UserRound} label="Clientes registrados" value={resumen?.clientes} />
        <MetricCard icon={Wrench} label="Trabajadores registrados" value={resumen?.trabajadores} />
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Gestión administrativa">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'solicitudes'}
          className={pestana === 'solicitudes' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setPestana('solicitudes')}
        >
          Solicitudes <span>{trabajos.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'tecnicos'}
          className={pestana === 'tecnicos' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setPestana('tecnicos')}
        >
          Técnicos <span>{tecnicos.length}</span>
        </button>
      </div>

      {cargando && <p className="panel-message">Cargando datos de administración...</p>}

      {!cargando && pestana === 'tecnicos' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <span className="section-eyebrow">Acceso profesional</span>
              <h3>Gestión de técnicos</h3>
            </div>
            <span className="admin-subtle">{tecnicosAprobados.length} aprobados · {tecnicos.length - tecnicosAprobados.length} pendientes</span>
          </div>
          {tecnicos.length === 0 && <p className="panel-message">Aún no hay cuentas registradas como técnico.</p>}
          <div className="admin-list">
            {tecnicos.map((tecnico) => (
              <article key={tecnico.tecnico_id} className="admin-technician-card">
                <div className="admin-person-icon">
                  {tecnico.avatar_url && /^https:\/\/\S+$/i.test(tecnico.avatar_url)
                    ? <img src={tecnico.avatar_url} alt="" referrerPolicy="no-referrer" />
                    : <UserRound size={20} />}
                </div>
                <div className="admin-person-details">
                  <strong>{tecnico.nombre || 'Sin nombre'}</strong>
                  <span>{tecnico.correo}</span>
                  <small>
                    {tecnico.titular || tecnico.oficio || 'Especialidad no indicada'} · {tecnico.localidad || 'Zona no indicada'}
                  </small>
                  {tecnico.telefono && <small>{tecnico.telefono}</small>}
                </div>
                <span className={`job-badge ${tecnico.aprobado ? 'job-badge-normal' : 'job-badge-urgent'}`}>
                  {tecnico.aprobado ? 'Aprobado' : 'En revisión'}
                </span>
                <button
                  type="button"
                  className={tecnico.aprobado ? 'panel-action-button revoke-button' : 'panel-action-button panel-primary-action'}
                  disabled={accionActiva !== null}
                  onClick={() => cambiarAprobacion(tecnico)}
                >
                  {tecnico.aprobado ? <X size={15} /> : <UserRoundCheck size={15} />}
                  {accionActiva === `tecnico-${tecnico.tecnico_id}`
                    ? 'Procesando...'
                    : tecnico.aprobado ? 'Revocar' : 'Aprobar'}
                </button>
                <details className="admin-professional-details">
                  <summary>Perfil profesional completo</summary>
                  <div className="admin-professional-content">
                    {tecnico.acerca_de && <p>{tecnico.acerca_de}</p>}
                    <span>
                      {tecnico.anios_experiencia !== null
                        ? `${tecnico.anios_experiencia} años de experiencia`
                        : 'Experiencia no indicada'}
                      {tecnico.tarifa_base !== null && ` · Desde $${Number(tecnico.tarifa_base).toLocaleString('es-MX')} MXN`}
                    </span>
                    {tecnico.disponibilidad && <span>Disponibilidad: {tecnico.disponibilidad}</span>}
                    {tecnico.habilidades?.length > 0 && (
                      <div className="profile-skills">
                        {tecnico.habilidades.map((habilidad) => <span key={habilidad} className="profile-skill">{habilidad}</span>)}
                      </div>
                    )}
                    {tecnico.certificaciones?.length > 0 && (
                      <span>Certificaciones: {tecnico.certificaciones.join(', ')}</span>
                    )}
                    {tecnico.experiencias?.length > 0 && (
                      <ul className="admin-experience-list">
                        {tecnico.experiencias.map((experiencia) => (
                          <li key={experiencia.id}>
                            <strong>{experiencia.puesto}</strong> · {experiencia.empresa || 'Trabajo independiente'}
                            <small>{experiencia.fecha_inicio} — {experiencia.actual ? 'Actualidad' : experiencia.fecha_fin || 'Sin fecha de fin'}</small>
                            {experiencia.descripcion && <span>{experiencia.descripcion}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      {!cargando && pestana === 'solicitudes' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <span className="section-eyebrow">Control operativo</span>
              <h3>Solicitudes globales</h3>
            </div>
            <div className="technician-filters">
              <label>
                <span><Filter size={13} /> Estado</span>
                <select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)}>
                  <option value="todos">Todos los estados</option>
                  {Object.entries(ESTADOS).map(([estado, etiqueta]) => (
                    <option key={estado} value={estado}>{etiqueta}</option>
                  ))}
                </select>
              </label>
              <label>
                <span><Filter size={13} /> Categoría</span>
                <select value={filtroCategoria} onChange={(event) => setFiltroCategoria(event.target.value)}>
                  <option value="todas">Todas las categorías</option>
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>{categoria}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {trabajosFiltrados.length === 0 && (
            <p className="panel-message">No hay solicitudes que coincidan con los filtros.</p>
          )}
          <div className="admin-job-list">
            {trabajosFiltrados.map((trabajo) => {
              const edicion = ediciones[trabajo.id] || {
                estado: trabajo.estado,
                tecnicoId: trabajo.tecnico_id || ''
              };
              const editado = edicion.estado !== trabajo.estado ||
                edicion.tecnicoId !== (trabajo.tecnico_id || '');
              return (
                <article key={trabajo.id} className="admin-job-card">
                  <div className="admin-job-main">
                    <div className="job-badge-row">
                      <span className="job-badge">{trabajo.categoria}</span>
                      <span className="job-badge job-status-badge">
                        {ESTADOS[trabajo.estado] || trabajo.estado}
                      </span>
                      {trabajo.detalles_tecnicos?.urgencia && (
                        <span className="job-badge job-badge-urgent">
                          {trabajo.detalles_tecnicos.urgencia.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                    <h4>{trabajo.titulo}</h4>
                    <p>{trabajo.descripcion}</p>
                    <div className="admin-job-meta">
                      <span><Clock3 size={14} /> {mostrarFecha(trabajo.creado_en)}</span>
                      <span>{trabajo.localidad}{trabajo.direccion ? ` · ${trabajo.direccion}` : ''}</span>
                      <span>{trabajo.nombre_contacto || 'Cliente'} · {trabajo.telefono_contacto || 'Sin teléfono'}</span>
                      <small>Folio: {trabajo.detalles_tecnicos?.folio_solicitud || trabajo.id}</small>
                    </div>
                  </div>
                  <div className="admin-job-controls">
                    <label>
                      <span>Estado</span>
                      <select
                        value={edicion.estado}
                        onChange={(event) => {
                          const siguienteEstado = event.target.value;
                          actualizarEdicion(trabajo.id, 'estado', siguienteEstado);
                          if (siguienteEstado === 'solicitado' || siguienteEstado === 'cancelado') {
                            actualizarEdicion(trabajo.id, 'tecnicoId', '');
                          }
                        }}
                      >
                        {Object.entries(ESTADOS).map(([estado, etiqueta]) => (
                          <option key={estado} value={estado}>{etiqueta}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Técnico asignado</span>
                      <select
                        value={edicion.tecnicoId}
                        disabled={edicion.estado === 'solicitado' || edicion.estado === 'cancelado'}
                        onChange={(event) => actualizarEdicion(trabajo.id, 'tecnicoId', event.target.value)}
                      >
                        <option value="">Sin asignar</option>
                        {trabajo.tecnico_id && !tecnicosAprobados.some(
                          (tecnico) => tecnico.tecnico_id === trabajo.tecnico_id
                        ) && (
                          <option value={trabajo.tecnico_id}>Técnico revocado o no disponible</option>
                        )}
                        {tecnicosAprobados.map((tecnico) => (
                          <option key={tecnico.tecnico_id} value={tecnico.tecnico_id}>
                            {tecnico.nombre || tecnico.correo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="panel-action-button panel-primary-action"
                      disabled={accionActiva !== null || !editado}
                      onClick={() => actualizarTrabajo(trabajo)}
                    >
                      {accionActiva === `trabajo-${trabajo.id}` ? 'Guardando...' : <><Check size={15} /> Guardar cambios</>}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric-card">
      <span className="admin-metric-icon"><Icon size={18} /></span>
      <span className="admin-metric-label">{label}</span>
      <strong>{value ?? '—'}</strong>
    </article>
  );
}
