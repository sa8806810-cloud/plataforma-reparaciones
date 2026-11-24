import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  ClipboardList,
  Send,
  Clock,
  Sparkles,
  CheckCircle2,
  Calendar,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Square
} from 'lucide-react';
import { CATEGORIAS_REPARACION, LOCALIDADES_REGION } from '../lib/formulariosConfig';
import { supabase } from '../lib/supabaseClient';

const OPCIONES_URGENCIA = [
  { id: 'urgente', label: 'Hoy / Urgente', badge: '#ef4444' },
  { id: 'semana', label: 'Esta semana', badge: '#f59e0b' },
  { id: 'cotizar', label: 'Sin prisa', badge: '#3b82f6' }
];

const CHIPS_RAPIDOS = [
  'Hay perro en el patio',
  'Ocupo presupuesto claro',
  'Mejor en la mañana',
  'Mejor por la tarde',
  'Servicio ya cortado o sin funcionar'
];

const COORDENADAS_LOCALIDAD = {
  Pajacuarán: { lat: 20.1456, lng: -102.5597 },
  'Venustiano Carranza': { lat: 20.1369, lng: -102.6347 },
  Sahuayo: { lat: 20.0564, lng: -102.7222 },
  Jiquilpan: { lat: 19.9922, lng: -102.7164 },
  VistaHermosa: { lat: 20.2364, lng: -102.4567 },
  'Vista Hermosa': { lat: 20.2364, lng: -102.4567 },
  Tanhuato: { lat: 20.2817, lng: -102.3278 },
  Briseñas: { lat: 20.2414, lng: -102.5586 }
};

const DIAS_SEMANA_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatearFechaISO(anio, mesIndice, dia) {
  const mm = String(mesIndice + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${anio}-${mm}-${dd}`;
}

function obtenerHoyISO() {
  const hoy = new Date();
  return formatearFechaISO(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

function construirCeldasMes(anio, mesIndice) {
  const primerDiaSemana = new Date(anio, mesIndice, 1).getDay();
  const totalDiasMes = new Date(anio, mesIndice + 1, 0).getDate();
  const celdas = [];

  for (let i = 0; i < primerDiaSemana; i += 1) {
    celdas.push({ tipo: 'vacio', key: `vacio-${i}` });
  }

  for (let dia = 1; dia <= totalDiasMes; dia += 1) {
    const iso = formatearFechaISO(anio, mesIndice, dia);
    celdas.push({
      tipo: 'dia',
      key: iso,
      dia,
      iso
    });
  }

  return celdas;
}

function formatearFechaLarga(isoStr) {
  if (!isoStr) return '';
  const partes = isoStr.split('-');
  if (partes.length !== 3) return isoStr;
  const fechaObj = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return fechaObj.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export default function SolicitarReparacion({ usuario, onVolver }) {
  const usuarioId = usuario?.id || null;
  const categoriasKeys = Object.keys(CATEGORIAS_REPARACION);
  const fechaHoyISO = useMemo(() => obtenerHoyISO(), []);
  const fechaInicialObj = useMemo(() => new Date(), []);

  const [categoria, setCategoria] = useState(categoriasKeys[0]);
  const subtiposKeys = Object.keys(CATEGORIAS_REPARACION[categoria].subtipos);
  const [subtipo, setSubtipo] = useState(subtiposKeys[0]);
  const [urgencia, setUrgencia] = useState('urgente');
  const [fechaElegida, setFechaElegida] = useState(fechaHoyISO);
  const [mesVista, setMesVista] = useState({
    anio: fechaInicialObj.getFullYear(),
    mes: fechaInicialObj.getMonth()
  });

  const [localidad, setLocalidad] = useState(LOCALIDADES_REGION[0]);
  const [nombreContacto, setNombreContacto] = useState(usuario?.user_metadata?.nombre || '');
  const [telefonoContacto, setTelefonoContacto] = useState(usuario?.user_metadata?.telefono || '');
  const [direccion, setDireccion] = useState('');
  const [referencias, setReferencias] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [respuestasTecnicas, setRespuestasTecnicas] = useState({});

  const [ubicacionGPS, setUbicacionGPS] = useState(null);
  const [estadoGPS, setEstadoGPS] = useState('');
  const [rastreandoTiempoReal, setRastreandoTiempoReal] = useState(false);
  const watchIdRef = useRef(null);

  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const celdasMes = useMemo(
    () => construirCeldasMes(mesVista.anio, mesVista.mes),
    [mesVista.anio, mesVista.mes]
  );

  const tituloMesAnio = useMemo(() => {
    const ref = new Date(mesVista.anio, mesVista.mes, 1);
    return ref.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }, [mesVista.anio, mesVista.mes]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const preguntasActuales = CATEGORIAS_REPARACION[categoria]?.subtipos[subtipo]?.preguntas || [];
  const totalPreguntas = preguntasActuales.length;
  const preguntasRespondidas = preguntasActuales.filter((p) => Boolean(respuestasTecnicas[p.id])).length;

  let pasosCompletados = preguntasRespondidas;
  if (direccion.trim()) pasosCompletados += 1;
  if (descripcion.trim()) pasosCompletados += 1;
  if (fechaElegida) pasosCompletados += 1;
  const totalPasos = totalPreguntas + 3;
  const porcentajeProgreso = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

  const coordsBase = COORDENADAS_LOCALIDAD[localidad] || { lat: 20.1456, lng: -102.5597 };
  const latActiva = ubicacionGPS ? ubicacionGPS.lat : coordsBase.lat;
  const lngActiva = ubicacionGPS ? ubicacionGPS.lng : coordsBase.lng;

  const parametrosMapa = new URLSearchParams({
    q: `${latActiva},${lngActiva}`,
    z: '16',
    output: 'embed'
  });
  const mapaUrl = `https://maps.google.com/maps?${parametrosMapa.toString()}`;
  const enlaceGoogleMaps = `https://www.google.com/maps?q=${latActiva},${lngActiva}`;

  const detenerTiempoReal = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setRastreandoTiempoReal(false);
    setEstadoGPS('Ubicación en tiempo real detenida.');
  };

  const iniciarUbicacionTiempoReal = () => {
    if (!navigator.geolocation) {
      setEstadoGPS('Este dispositivo no permite ubicación automática; escribe tu dirección abajo.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setRastreandoTiempoReal(true);
    setEstadoGPS('Buscando tu ubicación en tiempo real...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const inicial = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          precision: Math.round(pos.coords.accuracy || 0),
          actualizado: new Date().toLocaleTimeString('es-MX')
        };
        setUbicacionGPS(inicial);
        setEstadoGPS(`Ubicación activa (${inicial.actualizado})`);
      },
      () => {
        setEstadoGPS('Seguimos intentando obtener señal en tiempo real...');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );

    const idWatch = navigator.geolocation.watchPosition(
      (pos) => {
        const nuevaUbicacion = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          precision: Math.round(pos.coords.accuracy || 0),
          actualizado: new Date().toLocaleTimeString('es-MX')
        };
        setUbicacionGPS(nuevaUbicacion);
        setEstadoGPS(
          `En tiempo real (${nuevaUbicacion.actualizado}) · ±${nuevaUbicacion.precision}m`
        );
      },
      (error_) => {
        if (error_?.code === 1) {
          setRastreandoTiempoReal(false);
          setEstadoGPS('Permiso denegado en el navegador. Actívalo en ajustes o escribe tu dirección.');
        } else if (error_?.code === 2) {
          setEstadoGPS('Señal de ubicación no disponible ahora; revisa ubicación del dispositivo o escribe dirección.');
        } else {
          setEstadoGPS('Tiempo de espera agotado; reintenta o escribe tu dirección.');
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
    );

    watchIdRef.current = idWatch;
  };

  const handleCambiarMes = (deltaMes) => {
    setMesVista((prev) => {
      const nuevaFecha = new Date(prev.anio, prev.mes + deltaMes, 1);
      return { anio: nuevaFecha.getFullYear(), mes: nuevaFecha.getMonth() };
    });
  };

  const handleSeleccionarFechaISO = (nuevoISO) => {
    if (!nuevoISO) return;
    setFechaElegida(nuevoISO);
    const partes = nuevoISO.split('-');
    if (partes.length === 3) {
      setMesVista({
        anio: Number(partes[0]),
        mes: Number(partes[1]) - 1
      });
    }
  };

  const handleCategoriaChange = (nuevaCat) => {
    setCategoria(nuevaCat);
    const primerSubtipo = Object.keys(CATEGORIAS_REPARACION[nuevaCat].subtipos)[0];
    setSubtipo(primerSubtipo);
    setRespuestasTecnicas({});
  };

  const handlePreguntaChange = (preguntaId, valor) => {
    setRespuestasTecnicas((prev) => ({ ...prev, [preguntaId]: valor }));
  };

  const handleAgregarChip = (textoChip) => {
    setDescripcion((prev) => {
      const limpio = prev.trim();
      if (!limpio) return textoChip;
      if (limpio.toLowerCase().includes(textoChip.toLowerCase())) return limpio;
      return `${limpio}. ${textoChip}`;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');

    const payload = {
      categoria,
      subtipo,
      titulo: CATEGORIAS_REPARACION[categoria].subtipos[subtipo].label,
      descripcion,
      nombre_contacto: nombreContacto.trim(),
      telefono_contacto: telefonoContacto.trim(),
      detalles_tecnicos: {
        ...respuestasTecnicas,
        urgencia,
        fecha_solicitada: fechaElegida,
        ubicacion_gps: ubicacionGPS
      },
      localidad,
      direccion,
      referencias_domicilio: referencias
    };

    if (usuarioId) {
      payload.cliente_id = usuarioId;
    }

    try {
      const { error } = await supabase.from('trabajos').insert([payload]);
      if (error) {
        setMensaje(`No se pudo enviar la solicitud: ${error.message}`);
        return;
      }
      setMensaje('¡Solicitud guardada correctamente!');
      setDescripcion('');
      setDireccion('');
      setReferencias('');
      setRespuestasTecnicas({});
    } catch (error) {
      setMensaje(`No se pudo enviar la solicitud: ${error.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const tarjetaEstilo = {
    background: 'rgba(17, 24, 39, 0.94)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '18px',
    padding: 'clamp(14px, 4vw, 22px)',
    display: 'grid',
    gap: '14px',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)'
  };

  const campoEstilo = {
    width: '100%',
    minHeight: '44px',
    padding: '11px 13px',
    borderRadius: '11px',
    border: '1px solid #334155',
    background: '#0b1220',
    color: '#f8fafc',
    fontSize: '1rem',
    boxSizing: 'border-box'
  };

  const tituloServicioActual = CATEGORIAS_REPARACION[categoria]?.subtipos[subtipo]?.label || '';
  const etiquetaUrgenciaActual = OPCIONES_URGENCIA.find((o) => o.id === urgencia)?.label || '';

  return (
    <section style={{ width: '100%', maxWidth: '720px', margin: '0 auto', display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            if (onVolver) {
              onVolver();
            } else {
              window.history.back();
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '42px',
            padding: '10px 14px',
            borderRadius: '11px',
            border: '1px solid #334155',
            background: '#182234',
            color: '#f8fafc',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} />
          <span>Regresar</span>
        </button>

        <div style={{ display: 'grid', gap: '2px', flex: '1 1 200px' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.15rem, 4vw, 1.35rem)', letterSpacing: '-0.01em' }}>
            Solicitar reparación o instalación
          </h2>
          <span style={{ fontSize: '0.86rem', color: '#94a3b8' }}>
            Elige fecha, revisa el mapa y envía tu solicitud
          </span>
        </div>
      </div>

      <div style={{ ...tarjetaEstilo, padding: '14px 16px', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.86rem' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
            Progreso ({preguntasRespondidas}/{totalPreguntas} preguntas)
          </span>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{porcentajeProgreso}%</span>
        </div>
        <div style={{ height: '7px', borderRadius: '999px', background: '#0b1220', overflow: 'hidden' }}>
          <div
            style={{
              width: `${porcentajeProgreso}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
              transition: 'width 0.25s ease'
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: '12px',
          border: '1px dashed rgba(148, 163, 184, 0.3)',
          borderRadius: '12px',
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.5)'
        }}
      >
        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '2px' }}>
          Publicidad
        </div>
        <div style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
          Espacio reservado para anuncio (Google AdSense)
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        <div style={tarjetaEstilo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#93c5fd', fontWeight: 600, fontSize: '0.95rem' }}>
            <ClipboardList size={18} />
            <span>1. Servicio, fecha y detalles</span>
          </div>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Categoría</span>
            <select value={categoria} onChange={(e) => handleCategoriaChange(e.target.value)} style={campoEstilo}>
              {categoriasKeys.map((key) => (
                <option key={key} value={key}>
                  {CATEGORIAS_REPARACION[key].label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Tipo de servicio</span>
            <select
              value={subtipo}
              onChange={(e) => {
                setSubtipo(e.target.value);
                setRespuestasTecnicas({});
              }}
              style={campoEstilo}
            >
              {Object.entries(CATEGORIAS_REPARACION[categoria].subtipos).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              padding: '12px',
              borderRadius: '14px',
              background: '#0b1220',
              border: '1px solid #334155',
              display: 'grid',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>
                <Calendar size={16} color="#60a5fa" /> Calendario (día, mes y año)
              </span>
              <input
                type="date"
                value={fechaElegida}
                min={fechaHoyISO}
                onChange={(e) => handleSeleccionarFechaISO(e.target.value)}
                style={{
                  minHeight: '38px',
                  padding: '6px 10px',
                  borderRadius: '9px',
                  border: '1px solid #475569',
                  background: '#111827',
                  color: '#f8fafc',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => handleCambiarMes(-1)}
                aria-label="Mes anterior"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '38px',
                  minHeight: '38px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  cursor: 'pointer'
                }}
              >
                <ChevronLeft size={18} />
              </button>

              <strong style={{ textTransform: 'capitalize', fontSize: '0.95rem', color: '#f1f5f9' }}>
                {tituloMesAnio}
              </strong>

              <button
                type="button"
                onClick={() => handleCambiarMes(1)}
                aria-label="Mes siguiente"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '38px',
                  minHeight: '38px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  cursor: 'pointer'
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', textAlign: 'center' }}>
              {DIAS_SEMANA_CORTOS.map((nombreDia) => (
                <span key={nombreDia} style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
                  {nombreDia}
                </span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {celdasMes.map((celda) => {
                if (celda.tipo === 'vacio') {
                  return <div key={celda.key} style={{ minHeight: '38px' }} />;
                }
                const seleccionada = fechaElegida === celda.iso;
                const pasada = celda.iso < fechaHoyISO;
                return (
                  <button
                    key={celda.key}
                    type="button"
                    disabled={pasada}
                    onClick={() => setFechaElegida(celda.iso)}
                    style={{
                      display: 'grid',
                      justifyItems: 'center',
                      alignContent: 'center',
                      minHeight: '38px',
                      padding: '2px',
                      borderRadius: '8px',
                      border: seleccionada ? '1.5px solid #3b82f6' : '1px solid #1e293b',
                      background: seleccionada ? '#172554' : '#111827',
                      color: pasada ? '#475569' : '#f8fafc',
                      opacity: pasada ? 0.45 : 1,
                      cursor: pasada ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '0.86rem', fontWeight: 700 }}>{celda.dia}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
              Fecha elegida: <strong style={{ textTransform: 'capitalize' }}>{formatearFechaLarga(fechaElegida)}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.92rem', color: '#e2e8f0' }}>
              <Clock size={16} color="#fbbf24" /> Prioridad del servicio
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {OPCIONES_URGENCIA.map((op) => {
                const activa = urgencia === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setUrgencia(op.id)}
                    style={{
                      minHeight: '40px',
                      padding: '9px 14px',
                      borderRadius: '999px',
                      border: activa ? `1.5px solid ${op.badge}` : '1px solid #334155',
                      background: activa ? '#1e293b' : '#0b1220',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                      fontWeight: activa ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          </div>

          {preguntasActuales.map((preg) => (
            <label key={preg.id} style={{ display: 'grid', gap: '6px' }}>
              <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>{preg.label}</span>
              <select
                value={respuestasTecnicas[preg.id] || ''}
                onChange={(e) => handlePreguntaChange(preg.id, e.target.value)}
                required
                style={campoEstilo}
              >
                <option value="">Selecciona una opción...</option>
                {preg.opciones.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div style={tarjetaEstilo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#67e8f9', fontWeight: 600, fontSize: '0.95rem' }}>
            <MapPin size={18} />
            <span>2. Ubicación en tiempo real y domicilio</span>
          </div>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Localidad / municipio</span>
            <select value={localidad} onChange={(e) => setLocalidad(e.target.value)} style={campoEstilo}>
              {LOCALIDADES_REGION.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              padding: '12px',
              borderRadius: '14px',
              background: '#0b1220',
              border: '1px solid #334155',
              display: 'grid',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>
                Ubicación en tiempo real (sin cuenta)
              </span>

              {rastreandoTiempoReal ? (
                <button
                  type="button"
                  onClick={detenerTiempoReal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '40px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #ef4444',
                    background: '#450a0a',
                    color: '#fecaca',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Square size={14} />
                  <span>Detener tiempo real</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={iniciarUbicacionTiempoReal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '40px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #22c55e',
                    background: '#052e16',
                    color: '#bbf7d0',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Navigation size={15} />
                  <span>Activar ubicación en vivo</span>
                </button>
              )}
            </div>

            {estadoGPS && <div style={{ fontSize: '0.82rem', color: '#93c5fd' }}>{estadoGPS}</div>}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                Coordenadas: {latActiva}, {lngActiva}
              </span>
              <a
                href={enlaceGoogleMaps}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.84rem',
                  color: '#60a5fa',
                  textDecoration: 'underline'
                }}
              >
                Abrir en Google Maps
              </a>
            </div>

            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b', background: '#0f172a' }}>
              <iframe
                title="Mapa de Google Maps en tiempo real"
                src={mapaUrl}
                style={{ width: '100%', height: '200px', border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Nombre de contacto</span>
            <input
              type="text"
              value={nombreContacto}
              onChange={(e) => setNombreContacto(e.target.value)}
              placeholder="Nombre de quien recibirá al técnico"
              autoComplete="name"
              maxLength={120}
              required
              style={campoEstilo}
            />
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Teléfono de contacto (10 dígitos)</span>
            <input
              type="tel"
              value={telefonoContacto}
              onChange={(e) => setTelefonoContacto(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Ej. 3541234567"
              autoComplete="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              title="Ingresa un teléfono de 10 dígitos."
              required
              style={campoEstilo}
            />
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Dirección (calle y número)</span>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Ej. Calle Morelos #45, Col. Centro"
              required
              style={campoEstilo}
            />
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Referencias del lugar</span>
            <input
              type="text"
              value={referencias}
              onChange={(e) => setReferencias(e.target.value)}
              placeholder="Ej. Portón café, frente al terreno baldío"
              style={campoEstilo}
            />
          </label>

          <div style={{ display: 'grid', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem', color: '#94a3b8' }}>
              <Sparkles size={15} color="#60a5fa" /> Toca para agregar detalles rápidos:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {CHIPS_RAPIDOS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAgregarChip(chip)}
                  style={{
                    minHeight: '36px',
                    padding: '6px 11px',
                    borderRadius: '999px',
                    border: '1px solid #334155',
                    background: '#0f172a',
                    color: '#cbd5e1',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontSize: '0.92rem', color: '#e2e8f0' }}>Detalles adicionales</span>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe qué se ocupa hacer, horarios disponibles, etc."
              required
              style={{ ...campoEstilo, resize: 'vertical' }}
            />
          </label>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: '#0b1220',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'grid',
              gap: '6px',
              fontSize: '0.86rem',
              color: '#cbd5e1'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#86efac', fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>Resumen de solicitud</span>
            </div>
            <div>
              <strong>Servicio:</strong> {tituloServicioActual} ({localidad})
            </div>
            <div>
              <strong>Fecha:</strong> <span style={{ textTransform: 'capitalize' }}>{formatearFechaLarga(fechaElegida)}</span> ({fechaElegida})
            </div>
            <div>
              <strong>Prioridad:</strong> {etiquetaUrgenciaActual}
            </div>
          </div>

          <button
            type="submit"
            disabled={enviando}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              minHeight: '48px',
              padding: '15px 18px',
              borderRadius: '13px',
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)'
            }}
          >
            <Send size={18} />
            <span>{enviando ? 'Enviando...' : 'Publicar solicitud'}</span>
          </button>

          {mensaje && (
            <p
              style={{
                margin: 0,
                padding: '12px',
                borderRadius: '10px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '0.92rem'
              }}
            >
              {mensaje}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}