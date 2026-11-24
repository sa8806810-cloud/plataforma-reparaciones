import { useEffect, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, MapPin, UserRound, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || 'FN';
}

export default function DirectorioTecnicos({ onVerPerfil, excluirUsuarioId }) {
  const [tecnicos, setTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let montado = true;
    let query = supabase
      .from('perfiles')
      .select('user_id, nombre, localidad, avatar_url, titular, anios_experiencia, tarifa_base, habilidades')
      .eq('rol', 'tecnico')
      .order('nombre', { ascending: true });
    if (excluirUsuarioId) query = query.neq('user_id', excluirUsuarioId);

    query
      .then(({ data, error: queryError }) => {
        if (!montado) return;
        if (queryError) throw queryError;
        setTecnicos(data || []);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudo cargar el directorio: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [excluirUsuarioId]);

  return (
    <section className="directory-section" id="tecnicos">
      <div className="section-heading">
        <span className="section-eyebrow">Profesionales de tu zona</span>
        <h2>Técnicos verificados</h2>
        <p>Conoce su experiencia y especialidades antes de solicitar tu servicio.</p>
      </div>
      {cargando && <p className="panel-message">Cargando profesionales...</p>}
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {!cargando && !error && tecnicos.length === 0 && (
        <p className="panel-message">Pronto encontrarás profesionales verificados en tu zona.</p>
      )}
      {!cargando && tecnicos.length > 0 && (
        <div className="directory-grid">
          {tecnicos.map((tecnico) => {
            const avatarValido = tecnico.avatar_url && /^https:\/\/\S+$/i.test(tecnico.avatar_url);
            return (
              <article key={tecnico.user_id} className="directory-card">
                <div className="directory-card-header">
                  <div className="directory-avatar">
                    {avatarValido
                      ? <img src={tecnico.avatar_url} alt="" referrerPolicy="no-referrer" />
                      : <span>{iniciales(tecnico.nombre)}</span>}
                  </div>
                  <span className="verification-badge verified"><BadgeCheck size={14} /> Verificado</span>
                </div>
                <h3>{tecnico.nombre || 'Profesional FixNow'}</h3>
                <p className="directory-title">{tecnico.titular || 'Trabajador / Técnico'}</p>
                {tecnico.localidad && <span className="directory-meta"><MapPin size={14} />{tecnico.localidad}</span>}
                {tecnico.anios_experiencia !== null && <span className="directory-meta"><BriefcaseBusiness size={14} />{tecnico.anios_experiencia} años de experiencia</span>}
                {tecnico.tarifa_base !== null && (
                  <span className="directory-rate">Desde ${Number(tecnico.tarifa_base).toLocaleString('es-MX')} MXN</span>
                )}
                {tecnico.habilidades?.length > 0 && (
                  <div className="directory-skills">
                    {tecnico.habilidades.slice(0, 3).map((habilidad) => <span key={habilidad}>{habilidad}</span>)}
                  </div>
                )}
                <button
                  type="button"
                  className="panel-action-button panel-primary-action"
                  onClick={() => onVerPerfil(tecnico.user_id)}
                >
                  <UserRound size={15} /> Ver perfil profesional
                </button>
              </article>
            );
          })}
        </div>
      )}
      <div className="directory-note"><Wrench size={15} /> La verificación la realiza el equipo FixNow.</div>
    </section>
  );
}
