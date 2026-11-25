import { useState } from 'react';
import { BadgeCheck, CalendarDays, Clock3, MapPin, Search, UserRound, Wrench } from 'lucide-react';
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
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || 'FN';
}

export default function AgendaTecnicos({ onSolicitar }) {
  const [fecha, setFecha] = useState(fechaHoy);
  const [hora, setHora] = useState('10:00');
  const [especialidad, setEspecialidad] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [tecnicos, setTecnicos] = useState([]);
  const [buscado, setBuscado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const buscar = async (event) => {
    event.preventDefault();
    const fechaSolicitada = new Date(`${fecha}T${hora}`);
    if (Number.isNaN(fechaSolicitada.getTime()) || fechaSolicitada <= new Date()) {
      setError('Selecciona una fecha y hora futuras.');
      setBuscado(true);
      setTecnicos([]);
      return;
    }
    setCargando(true);
    setError('');
    setBuscado(true);
    try {
      const { data, error: queryError } = await supabase.rpc('consultar_tecnicos_disponibles', {
        p_fecha: fecha,
        p_hora: hora,
        p_especialidad: especialidad || null,
        p_localidad: localidad.trim() || null
      });
      if (queryError) throw queryError;
      setTecnicos(data || []);
    } catch (loadError) {
      setError(`No se pudo consultar la disponibilidad: ${loadError.message}`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="client-booking">
      <div className="role-panel-intro">
        <div><strong>Agenda un servicio</strong><p>Busca profesionales conectados y disponibles en tu horario.</p></div>
      </div>
      <form className="booking-filters" onSubmit={buscar}>
        <label><span>Fecha</span><input type="date" min={fechaHoy()} required value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
        <label><span>Hora local</span><input type="time" required value={hora} onChange={(event) => setHora(event.target.value)} /></label>
        <label><span>Especialidad</span><select value={especialidad} onChange={(event) => setEspecialidad(event.target.value)}><option value="">Todas</option>{ESPECIALIDADES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Ciudad / zona (opcional)</span><select value={localidad} onChange={(event) => setLocalidad(event.target.value)}><option value="">Todas las zonas</option>{LOCALIDADES_REGION.map((zona) => <option value={zona} key={zona}>{zona}</option>)}</select></label>
        <button type="submit" className="panel-action-button panel-primary-action" disabled={cargando}><Search size={16} />{cargando ? 'Buscando...' : 'Ver disponibilidad'}</button>
      </form>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
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
