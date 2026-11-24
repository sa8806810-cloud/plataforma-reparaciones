import { useCallback, useEffect, useState } from 'react';
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

function mostrarFecha(fecha) {
  if (!fecha) return 'Sin fecha';
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function mostrarEstado(estado) {
  const etiquetas = {
    aceptado: 'En camino',
    en_proceso: 'En proceso',
    completado: 'Completado'
  };
  return etiquetas[estado] || estado;
}

export default function TrabajosTecnico({ usuario, onVolver }) {
  const [disponibles, setDisponibles] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajoActivo, setTrabajoActivo] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');

  const obtenerTrabajos = useCallback(async () => {
    const [disponiblesResult, asignadosResult] = await Promise.all([
      supabase.rpc('listar_trabajos_disponibles'),
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
  }, [usuario.id]);

  const cargarTrabajos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const resultado = await obtenerTrabajos();
      setDisponibles(resultado.disponibles);
      setAsignados(resultado.asignados);
    } catch (error) {
      setError(`No se pudieron cargar los trabajos: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [obtenerTrabajos]);

  useEffect(() => {
    let montado = true;

    obtenerTrabajos()
      .then((resultado) => {
        if (!montado) return;
        setDisponibles(resultado.disponibles);
        setAsignados(resultado.asignados);
      })
      .catch((error) => {
        if (montado) setError(`No se pudieron cargar los trabajos: ${error.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [obtenerTrabajos]);

  const aceptarTrabajo = async (trabajoId) => {
    setTrabajoActivo(trabajoId);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('aceptar_trabajo', {
        p_trabajo_id: trabajoId
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setAviso('Trabajo aceptado. Ya puedes consultar el domicilio y los datos de contacto.');
      await cargarTrabajos();
    } catch (error) {
      setError(`No se pudo aceptar el trabajo: ${error.message}`);
    } finally {
      setTrabajoActivo(null);
    }
  };

  const actualizarEstado = async (trabajo) => {
    const nuevoEstado = trabajo.estado === 'aceptado' ? 'en_proceso' : 'completado';
    setTrabajoActivo(trabajo.id);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('actualizar_estado_trabajo', {
        p_trabajo_id: trabajo.id,
        p_nuevo_estado: nuevoEstado
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setAviso(`Estado actualizado: ${mostrarEstado(nuevoEstado)}.`);
      await cargarTrabajos();
    } catch (error) {
      setError(`No se pudo actualizar el estado: ${error.message}`);
    } finally {
      setTrabajoActivo(null);
    }
  };

  const filtrarCategoria = (trabajo) =>
    categoriaFiltro === 'todas' || trabajo.categoria === categoriaFiltro;
  const disponiblesFiltrados = disponibles.filter(
    (trabajo) => filtrarCategoria(trabajo) && (estadoFiltro === 'todos' || estadoFiltro === 'solicitado')
  );
  const asignadosFiltrados = asignados.filter(
    (trabajo) =>
      filtrarCategoria(trabajo) && (estadoFiltro === 'todos' || trabajo.estado === estadoFiltro)
  );

  const tarjetaEstilo = {
    display: 'grid',
    gap: '10px',
    padding: '16px',
    borderRadius: '14px',
    border: '1px solid #334155',
    background: '#111827'
  };

  const botonEstilo = {
    minHeight: '42px',
    padding: '9px 13px',
    border: '1px solid #2563eb',
    borderRadius: '10px',
    background: '#1d4ed8',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer'
  };

  return (
    <section className="technician-panel">
      <div className="technician-toolbar">
        <button type="button" onClick={onVolver} className="panel-action-button" style={botonEstilo}>
          <ArrowLeft size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Inicio
        </button>
        <div className="section-heading">
          <span className="section-eyebrow">Panel profesional</span>
          <h2>Trabajos para técnicos</h2>
        </div>
        <button
          type="button"
          onClick={cargarTrabajos}
          disabled={cargando}
          aria-label="Actualizar trabajos"
          className="panel-action-button panel-refresh-button"
          style={{ ...botonEstilo, marginLeft: 'auto', background: '#1e293b', borderColor: '#475569' }}
        >
          <RefreshCw size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Actualizar
        </button>
      </div>

      <div className="technician-filters">
        <label>
          <span>Categoría</span>
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {Object.entries(ETIQUETAS_CATEGORIA).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="solicitado">Disponible</option>
            <option value="aceptado">En camino</option>
            <option value="en_proceso">En proceso</option>
            <option value="completado">Completado</option>
          </select>
        </label>
      </div>

      {aviso && (
        <p role="status" style={{ ...tarjetaEstilo, color: '#bbf7d0', margin: 0 }}>
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" style={{ ...tarjetaEstilo, color: '#fecaca', margin: 0 }}>
          {error}
        </p>
      )}
      {cargando && <p style={{ color: '#cbd5e1' }}>Cargando trabajos...</p>}

      {!cargando && (
        <>
          <section className="technician-section">
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Disponibles</h3>
            {disponiblesFiltrados.length === 0 && (
              <p style={{ ...tarjetaEstilo, color: '#94a3b8', margin: 0 }}>
                {disponibles.length
                  ? 'No hay trabajos que coincidan con los filtros.'
                  : 'No hay trabajos disponibles en este momento.'}
              </p>
            )}
            <div className="technician-jobs">
            {disponiblesFiltrados.map((trabajo) => {
              const CategoriaIcono = ICONOS_CATEGORIA[trabajo.categoria] || Wrench;
              const urgencia = trabajo.detalles_tecnicos?.urgencia || 'normal';
              const urgente = urgencia === 'hoy_mismo' || urgencia === 'emergencia_24_7' || urgencia === 'urgente';
              return (
              <article key={trabajo.id} className="technician-job-card" style={tarjetaEstilo}>
                <div className="job-badge-row">
                  <span className="job-badge">
                    <CategoriaIcono size={14} />
                    {ETIQUETAS_CATEGORIA[trabajo.categoria] || trabajo.categoria}
                  </span>
                  <span className={`job-badge ${urgente ? 'job-badge-urgent' : 'job-badge-normal'}`}>
                    {ETIQUETAS_URGENCIA[urgencia] || urgencia}
                  </span>
                </div>
                <strong style={{ color: '#f8fafc' }}>{trabajo.titulo}</strong>
                <span className="job-meta">
                  <MapPin size={15} /> {trabajo.localidad}
                </span>
                {trabajo.detalles_tecnicos?.fecha_solicitada && (
                  <span className="job-meta">
                    <Clock3 size={15} /> {mostrarFecha(trabajo.detalles_tecnicos.fecha_solicitada)}
                  </span>
                )}
                {trabajo.detalles_tecnicos?.presupuesto_estimado && (
                  <span className="job-meta">
                    Presupuesto: {trabajo.detalles_tecnicos.presupuesto_estimado}
                  </span>
                )}
                <p style={{ margin: 0, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                  {trabajo.descripcion}
                </p>
                <button
                  type="button"
                  disabled={trabajoActivo !== null}
                  onClick={() => aceptarTrabajo(trabajo.id)}
                  style={botonEstilo}
                >
                  {trabajoActivo === trabajo.id ? 'Aceptando...' : 'Aceptar trabajo'}
                </button>
              </article>
            );})}
            </div>
          </section>

          <section className="technician-section">
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Mis trabajos</h3>
            {asignadosFiltrados.length === 0 && (
              <p style={{ ...tarjetaEstilo, color: '#94a3b8', margin: 0 }}>
                {asignados.length
                  ? 'No hay trabajos que coincidan con los filtros.'
                  : 'Aún no tienes trabajos asignados.'}
              </p>
            )}
            <div className="technician-jobs">
            {asignadosFiltrados.map((trabajo) => (
              <article key={trabajo.id} className="technician-job-card" style={tarjetaEstilo}>
                <div className="job-badge-row">
                  <span className="job-badge">
                    {ETIQUETAS_CATEGORIA[trabajo.categoria] || trabajo.categoria}
                  </span>
                  <span className="job-badge job-status-badge">
                    {mostrarEstado(trabajo.estado)}
                  </span>
                </div>
                <strong style={{ color: '#f8fafc' }}>{trabajo.titulo}</strong>
                <span className="job-meta">
                  <MapPin size={15} /> {trabajo.direccion}, {trabajo.localidad}
                </span>
                {Number.isFinite(trabajo.detalles_tecnicos?.ubicacion_gps?.lat) &&
                  Number.isFinite(trabajo.detalles_tecnicos?.ubicacion_gps?.lng) && (
                    <a
                      className="job-meta job-map-link"
                      href={`https://www.google.com/maps?q=${trabajo.detalles_tecnicos.ubicacion_gps.lat},${trabajo.detalles_tecnicos.ubicacion_gps.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir ubicación GPS en Maps
                    </a>
                  )}
                {trabajo.referencias_domicilio && (
                  <span style={{ color: '#cbd5e1' }}>Referencias: {trabajo.referencias_domicilio}</span>
                )}
                {trabajo.nombre_contacto && <span style={{ color: '#cbd5e1' }}>{trabajo.nombre_contacto}</span>}
                {trabajo.telefono_contacto && (
                  <a
                    href={`tel:${trabajo.telefono_contacto}`}
                    style={{ color: '#60a5fa', textDecoration: 'underline' }}
                  >
                    <Phone size={15} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                    {trabajo.telefono_contacto}
                  </a>
                )}
                {trabajo.estado !== 'completado' && (
                  <button
                    type="button"
                    disabled={trabajoActivo !== null}
                    onClick={() => actualizarEstado(trabajo)}
                    style={{ ...botonEstilo, background: '#15803d', borderColor: '#22c55e' }}
                  >
                    <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    {trabajoActivo === trabajo.id
                      ? 'Actualizando...'
                      : trabajo.estado === 'aceptado'
                        ? 'Iniciar trabajo'
                        : 'Marcar como terminado'}
                  </button>
                )}
              </article>
            ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
