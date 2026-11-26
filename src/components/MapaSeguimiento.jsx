import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation, Radio, ShieldCheck } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabaseClient';

const ESTADOS_ACTIVOS = ['aceptado', 'en_camino', 'en_proceso'];

function coordenada(valor, minimo, maximo) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= minimo && numero <= maximo ? numero : null;
}

function mostrarActualizacion(fecha) {
  if (!fecha) return 'Sin ubicación en vivo';
  return `Actualizado ${new Date(fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

export default function MapaSeguimiento({
  trabajo,
  modo = 'cliente',
  tecnicoId,
  compartiendo = false,
  onCompartirChange,
  disabled = false
}) {
  const contenedorMapa = useRef(null);
  const mapaRef = useRef(null);
  const marcadorClienteRef = useRef(null);
  const marcadorTecnicoRef = useRef(null);
  const rutaRef = useRef(null);
  const ultimaPeticionRef = useRef(0);
  const peticionEnCursoRef = useRef(false);
  const [ubicacionTecnico, setUbicacionTecnico] = useState(null);
  const [error, setError] = useState('');
  const [estadoUbicacion, setEstadoUbicacion] = useState('');

  const latitudGpsCliente = trabajo.detalles_tecnicos?.ubicacion_gps?.lat;
  const longitudGpsCliente = trabajo.detalles_tecnicos?.ubicacion_gps?.lng;
  const puntoCliente = useMemo(
    () => {
      const lat = coordenada(latitudGpsCliente, -90, 90);
      const lng = coordenada(longitudGpsCliente, -180, 180);
      return lat === null || lng === null ? null : [lat, lng];
    },
    [latitudGpsCliente, longitudGpsCliente]
  );
  const esTecnico = modo === 'tecnico';
  const idTecnico = tecnicoId || trabajo.tecnico_id;
  const domicilio = [trabajo.direccion, trabajo.localidad].filter(Boolean).join(', ');
  const latitudCliente = puntoCliente?.[0] ?? null;
  const longitudCliente = puntoCliente?.[1] ?? null;

  useEffect(() => {
    if (!esTecnico || !compartiendo) return undefined;
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        const ahora = Date.now();
        if (peticionEnCursoRef.current || ahora - ultimaPeticionRef.current < 7000) return;
        peticionEnCursoRef.current = true;
        ultimaPeticionRef.current = ahora;
        const punto = {
          latitud: coords.latitude,
          longitud: coords.longitude,
          precision_m: coords.accuracy,
          actualizado_en: new Date().toISOString(),
          compartiendo: true
        };
        setUbicacionTecnico(punto);
        setEstadoUbicacion('Compartiendo ubicación en vivo');
        try {
          const { data, error: locationError } = await supabase.rpc('tecnico_actualizar_ubicacion_trabajo', {
            p_trabajo_id: trabajo.id,
            p_latitud: coords.latitude,
            p_longitud: coords.longitude,
            p_precision_m: coords.accuracy
          });
          if (locationError) throw locationError;
          if (data) setUbicacionTecnico((actual) => actual ? { ...actual, actualizado_en: data } : actual);
        } catch (locationError) {
          setError(`No se pudo compartir la ubicación: ${locationError.message}`);
          setEstadoUbicacion('No se pudo actualizar el GPS');
        } finally {
          peticionEnCursoRef.current = false;
        }
      },
      (gpsError) => {
        setError(`No se pudo obtener el GPS: ${gpsError.message}`);
        setEstadoUbicacion('Ubicación no disponible');
        onCompartirChange?.(trabajo.id, false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      peticionEnCursoRef.current = false;
      supabase.rpc('tecnico_detener_compartir_ubicacion').then(({ error: stopError }) => {
        if (stopError) console.error('No se pudo detener el uso compartido del GPS:', stopError.message);
      }).catch((stopError) => {
        console.error('No se pudo detener el uso compartido del GPS:', stopError);
      });
    };
  }, [compartiendo, esTecnico, onCompartirChange, trabajo.id]);

  useEffect(() => {
    if (esTecnico || !idTecnico || !ESTADOS_ACTIVOS.includes(trabajo.estado)) return undefined;
    let montado = true;

    const cargarUbicacion = async () => {
      const { data, error: queryError } = await supabase
        .from('ubicaciones_tecnico')
        .select('tecnico_id, latitud, longitud, precision_m, compartiendo, actualizado_en')
        .eq('tecnico_id', idTecnico)
        .maybeSingle();
      if (!montado) return;
      if (queryError) {
        setError(`No se pudo actualizar el mapa del técnico: ${queryError.message}`);
        return;
      }
      setUbicacionTecnico(data?.compartiendo ? data : null);
      setError('');
    };

    cargarUbicacion();
    const intervalo = window.setInterval(cargarUbicacion, 15000);
    const canal = supabase
      .channel(`seguimiento-tecnico-${trabajo.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ubicaciones_tecnico',
        filter: `tecnico_id=eq.${idTecnico}`
      }, cargarUbicacion)
      .subscribe((status, subscriptionError) => {
        if (!montado) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(`Tiempo real no disponible${subscriptionError?.message ? `: ${subscriptionError.message}` : ''}. Se actualizará periódicamente.`);
        }
      });

    return () => {
      montado = false;
      window.clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [esTecnico, idTecnico, trabajo.estado, trabajo.id]);

  useEffect(() => {
    if (!contenedorMapa.current || !puntoCliente) return undefined;
    const mapa = L.map(contenedorMapa.current, { scrollWheelZoom: false, zoomControl: true })
      .setView(puntoCliente, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapa);
    marcadorClienteRef.current = L.marker(puntoCliente, {
      icon: L.divIcon({ className: 'tracking-map-pin tracking-map-pin-client', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 30] })
    }).addTo(mapa).bindPopup('Ubicación del servicio');
    mapaRef.current = mapa;
    const resizeTimer = window.setTimeout(() => mapa.invalidateSize(), 100);

    return () => {
      window.clearTimeout(resizeTimer);
      mapa.remove();
      mapaRef.current = null;
      marcadorClienteRef.current = null;
      marcadorTecnicoRef.current = null;
      rutaRef.current = null;
    };
  }, [latitudCliente, longitudCliente, puntoCliente]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !puntoCliente) return;
    if (ubicacionTecnico?.compartiendo) {
      const puntoTecnico = [Number(ubicacionTecnico.latitud), Number(ubicacionTecnico.longitud)];
      if (puntoTecnico.every(Number.isFinite)) {
        if (!marcadorTecnicoRef.current) {
          marcadorTecnicoRef.current = L.marker(puntoTecnico, {
            icon: L.divIcon({ className: 'tracking-map-pin tracking-map-pin-tech', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 30] })
          }).addTo(mapa).bindPopup('Ubicación actual del técnico');
        } else {
          marcadorTecnicoRef.current.setLatLng(puntoTecnico);
        }
        const puntos = [puntoTecnico, puntoCliente];
        if (!rutaRef.current) {
          rutaRef.current = L.polyline(puntos, { color: '#2563eb', weight: 4, opacity: 0.8, dashArray: '8 7' }).addTo(mapa);
          mapa.fitBounds(L.latLngBounds(puntos), { padding: [28, 28], maxZoom: 15 });
        } else {
          rutaRef.current.setLatLngs(puntos);
        }
        return;
      }
    }

    if (marcadorTecnicoRef.current) {
      mapa.removeLayer(marcadorTecnicoRef.current);
      marcadorTecnicoRef.current = null;
    }
    if (rutaRef.current) {
      mapa.removeLayer(rutaRef.current);
      rutaRef.current = null;
    }
  }, [puntoCliente, ubicacionTecnico]);

  const urlMapa = puntoCliente
    ? `https://www.google.com/maps/dir/?api=1&destination=${puntoCliente[0]},${puntoCliente[1]}${ubicacionTecnico ? `&origin=${ubicacionTecnico.latitud},${ubicacionTecnico.longitud}` : ''}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(domicilio || 'Ubicación del servicio')}`;
  const estadoCompartido = ubicacionTecnico?.actualizado_en
    ? mostrarActualizacion(ubicacionTecnico.actualizado_en)
    : 'Esperando ubicación del técnico';

  return (
    <section className="job-tracking" aria-label="Mapa de seguimiento del trabajo">
      <header className="job-tracking-heading">
        <div><span className="section-eyebrow">Seguimiento del servicio</span><strong>{esTecnico ? 'Ubicación del cliente' : 'Tu técnico en camino'}</strong></div>
        {esTecnico && <span className={`tracking-live-status${compartiendo ? ' live' : ''}`}><i />{compartiendo ? estadoUbicacion || 'Solicitando GPS…' : 'GPS detenido'}</span>}
        {!esTecnico && <span className={`tracking-live-status${ubicacionTecnico?.actualizado_en ? ' live' : ''}`}><i />{estadoCompartido}</span>}
      </header>
      {puntoCliente
        ? <div ref={contenedorMapa} className="job-tracking-map" role="application" aria-label="Mapa del servicio y ubicación actual del técnico" />
        : <div className="job-tracking-no-map"><MapPin size={18} /><span><strong>No hay coordenadas GPS para este servicio</strong><small>{domicilio || 'El cliente no compartió su ubicación.'}</small></span></div>}
      {esTecnico && (
        <div className="tracking-tech-controls">
          <p><ShieldCheck size={14} />Tu ubicación se comparte únicamente con el cliente de este servicio mientras el trabajo está activo.</p>
          <button type="button" disabled={disabled || (!compartiendo && !puntoCliente)} className={`panel-action-button ${compartiendo ? 'tracking-stop-button' : 'panel-primary-action'}`} onClick={() => {
            setError('');
            if (!compartiendo && !navigator.geolocation) {
              setError('Este dispositivo no ofrece geolocalización.');
              return;
            }
            setEstadoUbicacion(compartiendo ? 'GPS detenido' : 'Solicitando GPS…');
            onCompartirChange?.(trabajo.id, !compartiendo);
          }}>
            <Radio size={15} />{compartiendo ? 'Dejar de compartir GPS' : disabled ? 'Detén el GPS del otro trabajo' : puntoCliente ? 'Iniciar GPS en vivo' : 'Falta la ubicación GPS del cliente'}
          </button>
        </div>
      )}
      {!esTecnico && (
        <div className="tracking-client-status">
          <span>{error ? 'No se pudo actualizar la ubicación.' : ubicacionTecnico?.actualizado_en ? `Técnico: ${estadoCompartido}` : 'La ubicación se mostrará cuando el técnico inicie el GPS en vivo.'}</span>
          {error && <small>{error}</small>}
        </div>
      )}
      {esTecnico && error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {puntoCliente && (
        <a className="tracking-navigation-link" href={urlMapa} target="_blank" rel="noreferrer">
          <Navigation size={15} />Abrir navegación hacia el cliente
        </a>
      )}
    </section>
  );
}
