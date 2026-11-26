import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Search, UserRound, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { LOCALIDADES_REGION } from '../lib/formulariosConfig';

const ESPECIALIDADES = [
  ['Electricidad', 'Electricidad'],
  ['Plomería', 'Plomería'],
  ['Cerrajería', 'Cerrajería'],
  ['Electrodomésticos', 'Electrodomésticos'],
  ['Instalación', 'Instalación'],
  ['Reparaciones', 'Reparaciones'],
  ['Mantenimiento', 'Mantenimiento']
];

function fechaHoy() {
  return claveFecha(new Date());
}

function claveFecha(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function esHoraFutura(fecha, hora) {
  const fechaSolicitada = new Date(`${fecha}T${hora}`);
  return !Number.isNaN(fechaSolicitada.getTime()) && fechaSolicitada > new Date();
}

function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || 'FN';
}

export default function AgendaTecnicos({ onSolicitar }) {
  const [fecha, setFecha] = useState(fechaHoy);
  const [hora, setHora] = useState('10:00');
  const [especialidad, setEspecialidad] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [tecnicos, setTecnicos] = useState([]);
  const [disponibilidadPorFecha, setDisponibilidadPorFecha] = useState({});
  const [buscado, setBuscado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoCalendario, setCargandoCalendario] = useState(true);
  const [versionBusqueda, setVersionBusqueda] = useState(0);
  const [errorCalendario, setErrorCalendario] = useState('');
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [error, setError] = useState('');

  const desdeMes = claveFecha(new Date(mes.getFullYear(), mes.getMonth(), 1));
  const hastaMes = claveFecha(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
  const primerDiaMes = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const espaciosMes = (primerDiaMes.getDay() + 6) % 7;
  const diasCalendario = Array.from({ length: espaciosMes + diasEnMes }, (_, indice) =>
    indice < espaciosMes ? null : new Date(mes.getFullYear(), mes.getMonth(), indice - espaciosMes + 1)
  );
  const mesAnterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  const hoyMes = new Date();
  const puedeRetroceder = mesAnterior.getFullYear() > hoyMes.getFullYear() ||
    (mesAnterior.getFullYear() === hoyMes.getFullYear() && mesAnterior.getMonth() >= hoyMes.getMonth());
  const ultimoDiaSiguiente = new Date(mes.getFullYear(), mes.getMonth() + 2, 0);
  const limiteCalendario = new Date();
  limiteCalendario.setDate(limiteCalendario.getDate() + 180);
  const puedeAvanzar = ultimoDiaSiguiente <= limiteCalendario;

  useEffect(() => {
    let montado = true;
    let solicitando = false;
    let primeraConsulta = true;

    const actualizarDisponibilidad = async () => {
      if (solicitando) return;
      solicitando = true;
      if (primeraConsulta) {
        setCargandoCalendario(true);
        if (buscado) setCargando(true);
      }

      try {
        const { data, error: calendarError } = await supabase.rpc('consultar_calendario_tecnicos', {
          p_desde: desdeMes,
          p_hasta: hastaMes,
          p_hora: hora,
          p_especialidad: especialidad || null,
          p_localidad: localidad.trim() || null
        });
        if (calendarError) throw calendarError;
        if (!montado) return;
        setDisponibilidadPorFecha(Object.fromEntries(
          (data || []).map((item) => [item.fecha, Number(item.tecnicos_disponibles)])
        ));
        setErrorCalendario('');
        setActualizadoEn(new Date());
      } catch (calendarError) {
        if (montado) setErrorCalendario(`No se pudo actualizar el calendario: ${calendarError.message}`);
      } finally {
        if (montado && primeraConsulta) setCargandoCalendario(false);
      }

      if (montado && buscado) {
        if (!esHoraFutura(fecha, hora)) {
          setTecnicos([]);
          setError('Selecciona una fecha y hora futuras.');
          setCargando(false);
        } else {
          try {
            const { data, error: queryError } = await supabase.rpc('consultar_tecnicos_disponibles', {
              p_fecha: fecha,
              p_hora: hora,
              p_especialidad: especialidad || null,
              p_localidad: localidad.trim() || null
            });
            if (queryError) throw queryError;
            if (montado) {
              setTecnicos(data || []);
              setError('');
            }
          } catch (queryError) {
            if (montado) setError(`No se pudo consultar la disponibilidad: ${queryError.message}`);
          } finally {
            if (montado) setCargando(false);
          }
        }
      }
      primeraConsulta = false;
      solicitando = false;
    };

    actualizarDisponibilidad();
    const intervalo = window.setInterval(actualizarDisponibilidad, 20000);
    return () => {
      montado = false;
      window.clearInterval(intervalo);
    };
  }, [buscado, desdeMes, especialidad, fecha, hastaMes, hora, localidad, versionBusqueda]);

  const buscar = async (event) => {
    event.preventDefault();
    if (!esHoraFutura(fecha, hora)) {
      setError('Selecciona una fecha y hora futuras.');
      setBuscado(true);
      setTecnicos([]);
      return;
    }
    setCargando(true);
    setError('');
    setBuscado(true);
    setVersionBusqueda((actual) => actual + 1);
  };

  return (
    <section className="client-booking">
      <div className="role-panel-intro">
        <div><strong>Agenda un servicio</strong><p>Elige una fecha para ver cuántos profesionales están disponibles a la hora seleccionada.</p></div>
      </div>
      <section className="client-availability-calendar" aria-label="Calendario de disponibilidad de técnicos">
        <div className="client-calendar-heading">
          <div><span className="section-eyebrow">Disponibilidad de la comunidad</span><strong>{mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</strong><small>La agenda se actualiza automáticamente cada 20 segundos.</small></div>
          <span className="client-calendar-live"><i />{actualizadoEn ? 'Actualizado en vivo' : 'Conectando...'}</span>
        </div>
        <div className="client-calendar-toolbar">
          <button type="button" aria-label="Mes anterior" disabled={!puedeRetroceder} onClick={() => setMes(mesAnterior)}><ChevronLeft size={17} /></button>
          <strong>{mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" aria-label="Mes siguiente" disabled={!puedeAvanzar} onClick={() => setMes((actual) => new Date(actual.getFullYear(), actual.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
        </div>
        <div className="client-calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => <span key={dia}>{dia}</span>)}</div>
        <div className="client-calendar-days">
          {diasCalendario.map((dia, indice) => {
            if (!dia) return <span className="client-calendar-empty" key={`vacio-${indice}`} />;
            const clave = claveFecha(dia);
            const cantidad = disponibilidadPorFecha[clave] || 0;
            const pasado = clave < fechaHoy();
            return (
              <button
                type="button"
                key={clave}
                className={`client-calendar-day${clave === fecha ? ' selected' : ''}${cantidad > 0 ? ' has-availability' : ''}${pasado ? ' past' : ''}`}
                disabled={pasado || dia > limiteCalendario}
                aria-pressed={clave === fecha}
                aria-label={`${dia.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}: ${cantidad} técnicos disponibles`}
                onClick={() => { setFecha(clave); setBuscado(true); setCargando(true); setError(''); setVersionBusqueda((actual) => actual + 1); }}
              >
                <span>{dia.getDate()}</span>
                <small>{cargandoCalendario ? '·' : cantidad > 0 ? cantidad : '—'}</small>
              </button>
            );
          })}
        </div>
        <div className="client-calendar-legend"><span><i />Número de técnicos disponibles</span><span><b>—</b> Sin disponibilidad para estos filtros y horario</span></div>
        {errorCalendario && <p role="alert" className="panel-message panel-error">{errorCalendario}</p>}
      </section>
      <form className="booking-filters" onSubmit={buscar}>
        <label><span>Fecha seleccionada</span><input type="date" min={fechaHoy()} required value={fecha} onChange={(event) => { setFecha(event.target.value); setMes(new Date(`${event.target.value}T12:00:00`)); }} /></label>
        <label><span>Hora local</span><input type="time" required value={hora} onChange={(event) => setHora(event.target.value)} /></label>
        <label><span>Especialidad</span><select value={especialidad} onChange={(event) => setEspecialidad(event.target.value)}><option value="">Todas</option>{ESPECIALIDADES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Ciudad / zona (opcional)</span><select value={localidad} onChange={(event) => setLocalidad(event.target.value)}><option value="">Todas las zonas</option>{LOCALIDADES_REGION.map((zona) => <option value={zona} key={zona}>{zona}</option>)}</select></label>
        <button type="submit" className="panel-action-button panel-primary-action" disabled={cargando}><Search size={16} />{cargando ? 'Buscando...' : 'Ver disponibilidad'}</button>
      </form>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {buscado && cargando && <p className="panel-message">Actualizando técnicos disponibles...</p>}
      {buscado && !cargando && !error && tecnicos.length === 0 && <p className="panel-message">No encontramos técnicos disponibles para esa combinación. Prueba otro horario o zona.</p>}
      <div className="available-technicians">
        {tecnicos.map((tecnico) => {
          const avatarValido = tecnico.avatar_url && /^https:\/\/\S+$/i.test(tecnico.avatar_url);
          return (
            <article className="available-technician-card" key={tecnico.user_id}>
              <span className="available-technician-avatar">
                {avatarValido ? <img src={tecnico.avatar_url} alt={`Foto de ${tecnico.nombre}`} referrerPolicy="no-referrer" /> : iniciales(tecnico.nombre)}
              </span>
              <div className="available-technician-copy">
                <h3>{tecnico.nombre || 'Profesional FixNow'} <BadgeCheck size={16} /></h3>
                <p>{tecnico.titular || 'Técnico verificado'}</p>
                <span><MapPin size={14} />{tecnico.localidad} · cobertura {tecnico.radio_km} km</span>
                <span><UserRound size={14} />{tecnico.anios_experiencia ?? 0} años de experiencia</span>
                {tecnico.tarifa_base !== null && <span>Desde ${Number(tecnico.tarifa_base).toLocaleString('es-MX')} MXN</span>}
              </div>
              <button
                type="button"
                className="panel-action-button panel-primary-action"
                onClick={() => onSolicitar?.(tecnico, fecha, hora, localidad)}
              >
                <Wrench size={15} />Solicitar
              </button>
            </article>
          );
        })}
      </div>
      {buscado && tecnicos.length > 0 && (
        <p className="field-note"><CalendarDays size={14} />{fecha} · <Clock3 size={14} /> {hora}. La reserva se enviará como preferencia; el técnico deberá aceptar la solicitud.</p>
      )}
    </section>
  );
}
