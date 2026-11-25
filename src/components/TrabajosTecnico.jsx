import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Droplets,
  Hammer,
  KeyRound,
  MapPin,
  Phone,
  Plug,
  Refrigerator,
  RefreshCw,
  Wrench,
  Zap
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import PerfilTrabajador from './PerfilTrabajador';

const ICONOS_CATEGORIA = {
  electricidad: Zap,
  plomeria: Droplets,
  reparaciones: Hammer,
  cerrajeria: KeyRound,
  electrodomesticos: Refrigerator,
  instalacion: Plug
};

const ETIQUETAS_CATEGORIA = {
  electricidad: 'Electricidad',
  plomeria: 'Plomería',
  reparaciones: 'Reparaciones',
  cerrajeria: 'Cerrajería',
  electrodomesticos: 'Electrodomésticos'
};

const ETIQUETAS_URGENCIA = {
  normal: 'Normal',
  hoy_mismo: 'Hoy mismo',
  emergencia_24_7: 'Emergencia 24/7',
  urgente: 'Urgente',
  semana: 'Esta semana',
  cotizar: 'Sin prisa'
};

const ESTADOS_ACTIVOS = ['aceptado', 'en_camino', 'en_proceso'];

function mostrarFecha(fecha) {
  if (!fecha) return 'Sin fecha';
  return new Date(fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function mostrarEstado(estado) {
  const etiquetas = {
    aceptado: 'Aceptado',
    en_camino: 'En camino',
    en_proceso: 'En proceso',
    completado: 'Completado'
  };
  return etiquetas[estado] || estado;
}

export default function TrabajosTecnico({ usuario, onVolver, aprobado = true }) {
  const [disponibles, setDisponibles] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajoActivo, setTrabajoActivo] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [urgenciaFiltro, setUrgenciaFiltro] = useState('todas');
  const [distanciaFiltro, setDistanciaFiltro] = useState('todas');
  const [pestana, setPestana] = useState(aprobado ? 'disponibles' : 'perfil');

  const obtenerTrabajos = useCallback(async () => {
    if (!aprobado) {
      return { disponibles: [], asignados: [] };
    }
    const [disponiblesResult, asignadosResult] = await Promise.all([
      supabase.rpc('listar_trabajos_disponibles_cercanos'),
      supabase
        .from('trabajos')
        .select('*')
        .eq('tecnico_id', usuario.id)
        .order('creado_en', { ascending: false })
    ]);

    if (disponiblesResult.error || asignadosResult.error) {
      throw new Error(
        disponiblesResult.error?.message ||
          asignadosResult.error?.message ||
          'No se pudieron cargar los trabajos.'
      );
    }

    return {
      disponibles: disponiblesResult.data || [],
      asignados: asignadosResult.data || []
    };
  }, [aprobado, usuario.id]);

  const aplicarTrabajos = useCallback((resultado) => {
    setDisponibles(resultado.disponibles);
    setAsignados(resultado.asignados);
  }, []);

  const cargarTrabajos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const resultado = await obtenerTrabajos();
      aplicarTrabajos(resultado);
    } catch (loadError) {
      setError(`No se pudieron cargar los trabajos: ${loadError.message}`);
    } finally {
      setCargando(false);
    }
  }, [aplicarTrabajos, obtenerTrabajos]);

  useEffect(() => {
    let montado = true;
    obtenerTrabajos()
      .then((resultado) => {
        if (montado) aplicarTrabajos(resultado);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudieron cargar los trabajos: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [aplicarTrabajos, obtenerTrabajos]);

  const aceptarTrabajo = async (trabajoId) => {
    setTrabajoActivo(trabajoId);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('aceptar_trabajo', {
        p_trabajo_id: trabajoId
      });
      if (rpcError) throw rpcError;

      setAviso('Trabajo aceptado. Los datos del cliente ya están disponibles en Mis trabajos activos.');
      setPestana('activos');
      await cargarTrabajos();
    } catch (actionError) {
      setError(`No se pudo aceptar el trabajo: ${actionError.message}`);
    } finally {
      setTrabajoActivo(null);
    }
  };

  const actualizarEstado = async (trabajo) => {
    const siguienteEstado = {
      aceptado: 'en_camino',
      en_camino: 'en_proceso',
      en_proceso: 'completado'
    }[trabajo.estado];

    if (!siguienteEstado) return;
    setTrabajoActivo(trabajo.id);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('actualizar_estado_trabajo', {
        p_trabajo_id: trabajo.id,
        p_nuevo_estado: siguienteEstado
      });
      if (rpcError) throw rpcError;

      setAviso(`Estado actualizado: ${mostrarEstado(siguienteEstado)}.`);
      await cargarTrabajos();
    } catch (actionError) {
      setError(`No se pudo actualizar el estado: ${actionError.message}`);
    } finally {
      setTrabajoActivo(null);
    }
  };

  const filtrar = useCallback((trabajo) => {
    const urgencia = trabajo.detalles_tecnicos?.urgencia || 'normal';
    return (categoriaFiltro === 'todas' || trabajo.categoria === categoriaFiltro) &&
      (urgenciaFiltro === 'todas' || urgencia === urgenciaFiltro) &&
      (distanciaFiltro === 'todas' || trabajo.distancia_km === null ||
        trabajo.distancia_km === undefined || Number(trabajo.distancia_km) <= Number(distanciaFiltro));
  }, [categoriaFiltro, distanciaFiltro, urgenciaFiltro]);

  const trabajosActivos = useMemo(
    () => asignados.filter((trabajo) => ESTADOS_ACTIVOS.includes(trabajo.estado)).filter(filtrar),
    [asignados, filtrar]
  );
  const trabajosCompletados = useMemo(
    () => asignados.filter((trabajo) => trabajo.estado === 'completado').filter(filtrar),
    [asignados, filtrar]
  );
  const disponiblesFiltrados = useMemo(
    () => disponibles.filter(filtrar),
    [disponibles, filtrar]
  );
  const trabajosVisibles = {
    disponibles: disponiblesFiltrados,
    activos: trabajosActivos,
    historial: trabajosCompletados
  }[pestana] || [];

  return (
    <section className="role-panel">
      <div className="role-panel-header">
        <button type="button" onClick={onVolver} className="panel-action-button">
          <ArrowLeft size={16} /> Inicio
        </button>
        <div className="section-heading">
          <span className="section-eyebrow">Panel profesional</span>
          <h2>Mis trabajos</h2>
        </div>
        <button
          type="button"
          onClick={cargarTrabajos}
          disabled={cargando}
          aria-label="Actualizar trabajos"
          className="panel-action-button"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {!aprobado && (
        <p role="status" className="panel-message">
          Tu cuenta está en revisión. Completa tu perfil profesional; al aprobarse podrás consultar y aceptar trabajos.
        </p>
      )}

      {pestana !== 'perfil' && <div className="technician-filters">
        <label>
          <span>Categoría</span>
          <select value={categoriaFiltro} onChange={(event) => setCategoriaFiltro(event.target.value)}>
            <option value="todas">Todas las categorías</option>
            {Object.entries(ETIQUETAS_CATEGORIA).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Urgencia</span>
          <select value={urgenciaFiltro} onChange={(event) => setUrgenciaFiltro(event.target.value)}>
            <option value="todas">Todas las urgencias</option>
            {Object.entries(ETIQUETAS_URGENCIA).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        {pestana === 'disponibles' && (
          <label>
            <span>Distancia máxima</span>
            <select value={distanciaFiltro} onChange={(event) => setDistanciaFiltro(event.target.value)}>
              <option value="todas">Todas las distancias</option>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
            </select>
          </label>
        )}
      </div>}

      <div className="role-tabs" role="tablist" aria-label="Trabajos del técnico">
        <RoleTab id="disponibles" selected={pestana} setSelected={setPestana} count={disponibles.length} disabled={!aprobado}>
          Trabajos disponibles
        </RoleTab>
        <RoleTab id="activos" selected={pestana} setSelected={setPestana} count={trabajosActivos.length} disabled={!aprobado}>
          Mis trabajos activos
        </RoleTab>
        <RoleTab id="historial" selected={pestana} setSelected={setPestana} count={trabajosCompletados.length} disabled={!aprobado}>
          Historial completado
        </RoleTab>
        <RoleTab id="perfil" selected={pestana} setSelected={setPestana}>
          Mi Perfil Profesional
        </RoleTab>
      </div>

      {pestana === 'perfil' && <PerfilTrabajador usuario={usuario} editable />}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {cargando && <p className="panel-message">Cargando trabajos...</p>}

      {pestana !== 'perfil' && !cargando && trabajosVisibles.length === 0 && (
        <p className="panel-message">
          {pestana === 'disponibles'
            ? 'No hay trabajos disponibles que coincidan con los filtros.'
            : pestana === 'activos'
              ? 'No tienes trabajos activos que coincidan con los filtros.'
              : 'Aún no tienes trabajos completados que coincidan con los filtros.'}
        </p>
      )}

      {pestana !== 'perfil' && !cargando && trabajosVisibles.length > 0 && (
        <div className="technician-jobs">
          {trabajosVisibles.map((trabajo) => (
            <TrabajoCard
              key={trabajo.id}
              trabajo={trabajo}
              disponible={pestana === 'disponibles'}
              trabajoActivo={trabajoActivo}
              onAceptar={aceptarTrabajo}
              onActualizar={actualizarEstado}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleTab({ id, selected, setSelected, count, children, disabled = false }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected === id}
      disabled={disabled}
      className={selected === id ? 'role-tab active' : 'role-tab'}
      onClick={() => setSelected(id)}
    >
      {children}{count !== undefined && <span>{count}</span>}
    </button>
  );
}

function TrabajoCard({ trabajo, disponible, trabajoActivo, onAceptar, onActualizar }) {
  const CategoriaIcono = ICONOS_CATEGORIA[trabajo.categoria] || Wrench;
  const urgencia = trabajo.detalles_tecnicos?.urgencia || 'normal';
  const urgente = ['hoy_mismo', 'emergencia_24_7', 'urgente'].includes(urgencia);
  const siguienteAccion = {
    aceptado: 'Marcar en camino',
    en_camino: 'Iniciar trabajo',
    en_proceso: 'Marcar como terminado'
  }[trabajo.estado];

  return (
    <article className="technician-job-card">
      <div className="job-badge-row">
        <span className="job-badge">
          <CategoriaIcono size={14} />
          {ETIQUETAS_CATEGORIA[trabajo.categoria] || trabajo.categoria}
        </span>
        <span className={`job-badge ${urgente ? 'job-badge-urgent' : 'job-badge-normal'}`}>
          {ETIQUETAS_URGENCIA[urgencia] || urgencia}
        </span>
        {!disponible && (
          <span className="job-badge job-status-badge">{mostrarEstado(trabajo.estado)}</span>
        )}
      </div>
      <h3>{trabajo.titulo}</h3>
      <p>{trabajo.descripcion}</p>
      <span className="job-meta">
        <MapPin size={15} /> {disponible ? trabajo.localidad : `${trabajo.direccion}, ${trabajo.localidad}`}
      </span>
      {disponible && trabajo.distancia_km !== null && trabajo.distancia_km !== undefined &&
        Number.isFinite(Number(trabajo.distancia_km)) && (
        <span className="job-meta">{Number(trabajo.distancia_km).toLocaleString('es-MX')} km de tu punto base</span>
      )}
      <span className="job-meta">
        <Clock3 size={15} /> {mostrarFecha(trabajo.creado_en)}
      </span>
      {trabajo.detalles_tecnicos?.presupuesto_estimado && (
        <span className="job-meta">Presupuesto estimado: {trabajo.detalles_tecnicos.presupuesto_estimado}</span>
      )}

      {!disponible && (
        <div className="protected-contact">
          <strong>Contacto del cliente</strong>
          {trabajo.nombre_contacto && <span>{trabajo.nombre_contacto}</span>}
          {trabajo.telefono_contacto && (
            <a href={`tel:${trabajo.telefono_contacto}`}>
              <Phone size={15} /> {trabajo.telefono_contacto}
            </a>
          )}
          {trabajo.referencias_domicilio && <small>Referencias: {trabajo.referencias_domicilio}</small>}
          {Number.isFinite(trabajo.detalles_tecnicos?.ubicacion_gps?.lat) &&
            Number.isFinite(trabajo.detalles_tecnicos?.ubicacion_gps?.lng) && (
              <a
                href={`https://www.google.com/maps?q=${trabajo.detalles_tecnicos.ubicacion_gps.lat},${trabajo.detalles_tecnicos.ubicacion_gps.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir ubicación GPS en Maps
              </a>
            )}
        </div>
      )}

      {disponible ? (
        <button
          type="button"
          className="panel-action-button panel-primary-action"
          disabled={trabajoActivo !== null}
          onClick={() => onAceptar(trabajo.id)}
        >
          {trabajoActivo === trabajo.id ? 'Aceptando...' : 'Aceptar trabajo'}
        </button>
      ) : siguienteAccion && (
        <button
          type="button"
          className="panel-action-button panel-primary-action"
          disabled={trabajoActivo !== null}
          onClick={() => onActualizar(trabajo)}
        >
          <CheckCircle2 size={16} />
          {trabajoActivo === trabajo.id ? 'Actualizando...' : siguienteAccion}
        </button>
      )}
    </article>
  );
}
