import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Phone, RefreshCw, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

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
    aceptado: 'Aceptado',
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
    <section style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onVolver} style={botonEstilo}>
          <ArrowLeft size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Inicio
        </button>
        <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.3rem' }}>Trabajos para técnicos</h2>
        <button
          type="button"
          onClick={cargarTrabajos}
          disabled={cargando}
          aria-label="Actualizar trabajos"
          style={{ ...botonEstilo, marginLeft: 'auto', background: '#1e293b', borderColor: '#475569' }}
        >
          <RefreshCw size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Actualizar
        </button>
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
          <section style={{ display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Disponibles</h3>
            {disponibles.length === 0 && (
              <p style={{ ...tarjetaEstilo, color: '#94a3b8', margin: 0 }}>
                No hay trabajos disponibles en este momento.
              </p>
            )}
            {disponibles.map((trabajo) => (
              <article key={trabajo.id} style={tarjetaEstilo}>
                <strong style={{ color: '#f8fafc' }}>{trabajo.titulo}</strong>
                <span style={{ color: '#93c5fd' }}>
                  {trabajo.categoria} · {trabajo.subtipo}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
                  <MapPin size={15} /> {trabajo.localidad}
                </span>
                {trabajo.detalles_tecnicos?.fecha_solicitada && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
                    <Clock3 size={15} /> {mostrarFecha(trabajo.detalles_tecnicos.fecha_solicitada)}
                  </span>
                )}
                {trabajo.detalles_tecnicos?.urgencia && (
                  <span style={{ color: '#fbbf24' }}>
                    Prioridad: {trabajo.detalles_tecnicos.urgencia}
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
            ))}
          </section>

          <section style={{ display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Mis trabajos</h3>
            {asignados.length === 0 && (
              <p style={{ ...tarjetaEstilo, color: '#94a3b8', margin: 0 }}>
                Aún no tienes trabajos asignados.
              </p>
            )}
            {asignados.map((trabajo) => (
              <article key={trabajo.id} style={tarjetaEstilo}>
                <strong style={{ color: '#f8fafc' }}>{trabajo.titulo}</strong>
                <span style={{ color: '#93c5fd' }}>
                  <Wrench size={15} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                  {mostrarEstado(trabajo.estado)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
                  <MapPin size={15} /> {trabajo.direccion}, {trabajo.localidad}
                </span>
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
          </section>
        </>
      )}
    </section>
  );
}
