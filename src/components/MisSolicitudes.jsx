import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  UserRound,
  XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ETIQUETAS_ESTADO = {
  solicitado: 'Pendiente',
  aceptado: 'Aceptado',
  en_camino: 'En camino',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado: 'Cancelado'
};

function mostrarFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function MisSolicitudes({ usuario, onVolver, onNuevaSolicitud }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajoActivo, setTrabajoActivo] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [estadoRealtime, setEstadoRealtime] = useState('');

  const obtenerSolicitudes = useCallback(async () => {
    const { data, error: queryError } = await supabase.rpc('listar_mis_trabajos');
    if (queryError) throw queryError;
    return data || [];
  }, []);

  const cargarSolicitudes = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    setError('');

    try {
      setSolicitudes(await obtenerSolicitudes());
    } catch (loadError) {
      setError(`No se pudieron cargar tus solicitudes: ${loadError.message}`);
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }, [obtenerSolicitudes]);

  useEffect(() => {
    let montado = true;
    obtenerSolicitudes()
      .then((data) => {
        if (montado) setSolicitudes(data);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudieron cargar tus solicitudes: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    const channel = supabase
      .channel(`cliente-trabajos-${usuario.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajos',
          filter: `cliente_id=eq.${usuario.id}`
        },
        () => {
          cargarSolicitudes(false);
        }
      )
      .subscribe((status, subscriptionError) => {
        if (!montado) return;
        if (status === 'SUBSCRIBED') {
          setEstadoRealtime('Actualizaciones en tiempo real activas');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setEstadoRealtime(
            `No se pudo activar tiempo real${subscriptionError?.message ? `: ${subscriptionError.message}` : '.'}`
          );
        }
      });

    return () => {
      montado = false;
      supabase.removeChannel(channel);
    };
  }, [cargarSolicitudes, obtenerSolicitudes, usuario.id]);

  const cancelarSolicitud = async (trabajoId) => {
    setTrabajoActivo(trabajoId);
    setAviso('');
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('cancelar_mi_trabajo', {
        p_trabajo_id: trabajoId
      });
      if (rpcError) throw rpcError;

      setAviso('Solicitud cancelada.');
      await cargarSolicitudes(false);
    } catch (cancelError) {
      setError(`No se pudo cancelar la solicitud: ${cancelError.message}`);
    } finally {
      setTrabajoActivo(null);
    }
  };

  return (
    <section className="role-panel">
      <div className="role-panel-header">
        <button type="button" onClick={onVolver} className="panel-action-button">
          <ArrowLeft size={16} /> Inicio
        </button>
        <div className="section-heading">
          <span className="section-eyebrow">Tu actividad</span>
          <h2>Panel de cliente</h2>
        </div>
        <div className="role-panel-actions">
          <button type="button" onClick={onNuevaSolicitud} className="panel-action-button panel-primary-action">
            <Plus size={16} /> Nueva solicitud
          </button>
          <button
            type="button"
            onClick={() => cargarSolicitudes()}
            disabled={cargando}
            className="panel-action-button"
            aria-label="Actualizar solicitudes"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      <div className="role-panel-intro">
        <div>
          <strong>Hola, {usuario.user_metadata?.nombre || usuario.email}</strong>
          <p>Consulta el avance de tus solicitudes y el técnico asignado.</p>
        </div>
        <span className="realtime-indicator">
          <span aria-hidden="true" />
          {estadoRealtime || 'Conectando actualizaciones...'}
        </span>
      </div>

      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {cargando && <p className="panel-message">Cargando tus solicitudes...</p>}
      {!cargando && !error && solicitudes.length === 0 && (
        <div className="empty-role-state">
          <ClipboardList size={28} aria-hidden="true" />
          <h3>Aún no tienes solicitudes</h3>
          <p>Cuéntanos qué necesitas y encuentra ayuda confiable para tu hogar.</p>
          <button type="button" onClick={onNuevaSolicitud} className="panel-action-button panel-primary-action">
            <Plus size={16} /> Crear mi primera solicitud
          </button>
        </div>
      )}
      {!cargando && solicitudes.length > 0 && (
        <div className="technician-jobs">
          {solicitudes.map((solicitud) => (
            <article key={solicitud.id} className="technician-job-card">
              <div className="job-badge-row">
                <span className="job-badge">{solicitud.categoria}</span>
                <span className={`job-badge job-status-badge status-${solicitud.estado}`}>
                  {ETIQUETAS_ESTADO[solicitud.estado] || solicitud.estado}
                </span>
              </div>
              <h3>{solicitud.titulo}</h3>
              <p>{solicitud.descripcion}</p>
              <span className="job-meta">
                <MapPin size={15} /> {solicitud.localidad}
              </span>
              <span className="job-meta">
                <CalendarDays size={15} /> {mostrarFecha(solicitud.creado_en)}
              </span>
              {solicitud.tecnico_id && (
                <div className="assigned-technician">
                  <UserRound size={17} />
                  <span>
                    <strong>{solicitud.tecnico_nombre}</strong>
                    {solicitud.tecnico_oficio && <small>{solicitud.tecnico_oficio}</small>}
                  </span>
                  <CheckCircle2 size={16} className="assigned-check" />
                </div>
              )}
              {solicitud.detalles_tecnicos?.folio_solicitud && (
                <span className="job-meta">
                  <Clock3 size={15} /> Folio {solicitud.detalles_tecnicos.folio_solicitud}
                </span>
              )}
              {solicitud.estado === 'solicitado' && !solicitud.tecnico_id && (
                <button
                  type="button"
                  className="panel-action-button cancel-request-button"
                  disabled={trabajoActivo !== null}
                  onClick={() => cancelarSolicitud(solicitud.id)}
                >
                  <XCircle size={16} />
                  {trabajoActivo === solicitud.id ? 'Cancelando...' : 'Cancelar solicitud'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
