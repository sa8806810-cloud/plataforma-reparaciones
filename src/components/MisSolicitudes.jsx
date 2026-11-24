import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ETIQUETAS_ESTADO = {
  solicitado: 'Buscando técnico',
  aceptado: 'Técnico asignado',
  en_camino: 'En camino',
  en_proceso: 'En proceso',
  completado: 'Completado'
};

function mostrarFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function MisSolicitudes({ usuario, onVolver }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const obtenerSolicitudes = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('trabajos')
      .select('id, categoria, subtipo, titulo, descripcion, localidad, estado, creado_en, detalles_tecnicos')
      .eq('cliente_id', usuario.id)
      .order('creado_en', { ascending: false });

    if (queryError) throw queryError;
    return data || [];
  }, [usuario.id]);

  const cargarSolicitudes = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      setSolicitudes(await obtenerSolicitudes());
    } catch (error) {
      setError(`No se pudieron cargar tus solicitudes: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [obtenerSolicitudes]);

  useEffect(() => {
    let montado = true;

    obtenerSolicitudes()
      .then((data) => {
        if (montado) setSolicitudes(data);
      })
      .catch((error) => {
        if (montado) setError(`No se pudieron cargar tus solicitudes: ${error.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [obtenerSolicitudes]);

  return (
    <section className="technician-panel">
      <div className="technician-toolbar">
        <button type="button" onClick={onVolver} className="panel-action-button">
          <ArrowLeft size={16} /> Inicio
        </button>
        <div className="section-heading">
          <span className="section-eyebrow">Tu actividad</span>
          <h2>Mis solicitudes</h2>
        </div>
        <button
          type="button"
          onClick={cargarSolicitudes}
          disabled={cargando}
          className="panel-action-button panel-refresh-button"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {cargando && <p className="panel-message">Cargando tus solicitudes...</p>}
      {!cargando && !error && solicitudes.length === 0 && (
        <p className="panel-message">Aún no tienes solicitudes asociadas a tu cuenta.</p>
      )}
      {!cargando && solicitudes.length > 0 && (
        <div className="technician-jobs">
          {solicitudes.map((solicitud) => (
            <article key={solicitud.id} className="technician-job-card">
              <div className="job-badge-row">
                <span className="job-badge">{solicitud.categoria}</span>
                <span className="job-badge job-status-badge">
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
              {solicitud.detalles_tecnicos?.folio_solicitud && (
                <span className="job-meta">
                  Folio {solicitud.detalles_tecnicos.folio_solicitud}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
