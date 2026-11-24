import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const HABILIDADES = [
  'Electricidad',
  'Plomería',
  'Cerrajería',
  'Electrodomésticos',
  'Instalación',
  'Reparaciones',
  'Mantenimiento'
];

const EXPERIENCIA_VACIA = {
  id: null,
  puesto: '',
  empresa: '',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: '',
  actual: false,
  descripcion: ''
};

function mostrarFecha(fecha) {
  if (!fecha) return 'Actualidad';
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
    month: 'short',
    year: 'numeric'
  });
}

function iniciales(nombre = '') {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] || '')
    .join('')
    .toUpperCase() || 'FN';
}

export default function PerfilTrabajador({
  usuario,
  trabajadorId,
  editable = false,
  onVolver,
  verificadoOverride
}) {
  const id = trabajadorId || usuario?.id;
  const esCuentaPropia = usuario?.id === id;
  const esPropio = Boolean(editable && esCuentaPropia);
  const [perfil, setPerfil] = useState(null);
  const [experiencias, setExperiencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [modoExperiencia, setModoExperiencia] = useState(null);
  const [experienciaForm, setExperienciaForm] = useState(EXPERIENCIA_VACIA);

  const cargarPerfil = useCallback(async () => {
    const [perfilResult, experienciaResult] = await Promise.all([
      supabase
        .from('perfiles')
        .select('user_id, rol, nombre, localidad, avatar_url, titular, anios_experiencia, tarifa_base, acerca_de, disponibilidad, habilidades, certificaciones')
        .eq('user_id', id)
        .maybeSingle(),
      supabase
        .from('experiencias_trabajador')
        .select('id, puesto, empresa, fecha_inicio, fecha_fin, actual, descripcion')
        .eq('trabajador_id', id)
        .order('fecha_inicio', { ascending: false })
    ]);

    if (perfilResult.error) throw perfilResult.error;
    if (experienciaResult.error) throw experienciaResult.error;
    if (!perfilResult.data) {
      throw new Error('El perfil no está disponible o el trabajador aún no fue verificado.');
    }

    return {
      perfil: perfilResult.data,
      experiencias: experienciaResult.data || []
    };
  }, [id]);

  useEffect(() => {
    let montado = true;

    cargarPerfil()
      .then(async (resultado) => {
        let verificado = Boolean(verificadoOverride);
        if (esCuentaPropia) {
          const { data, error: errorVerificacion } = await supabase.rpc('es_tecnico_aprobado');
          if (errorVerificacion) throw errorVerificacion;
          verificado = data === true;
        }

        if (!montado) return;
        setPerfil({ ...resultado.perfil, verificado });
        setExperiencias(resultado.experiencias);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudo cargar el perfil profesional: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [cargarPerfil, esCuentaPropia, verificadoOverride]);

  const habilidadesSeleccionadas = useMemo(
    () => new Set(perfil?.habilidades || []),
    [perfil?.habilidades]
  );

  const cambiarCampo = (campo, valor) => {
    setPerfil((actual) => ({ ...actual, [campo]: valor }));
  };

  const guardarPerfil = async (event) => {
    event.preventDefault();
    if (!perfil || !esPropio) return;
    setGuardando(true);
    setError('');
    setAviso('');

    const cambios = {
      nombre: perfil.nombre.trim(),
      localidad: perfil.localidad.trim(),
      avatar_url: perfil.avatar_url?.trim() || null,
      titular: perfil.titular.trim(),
      anios_experiencia: perfil.anios_experiencia === '' || perfil.anios_experiencia === null
        ? null
        : Number(perfil.anios_experiencia),
      tarifa_base: perfil.tarifa_base === '' || perfil.tarifa_base === null
        ? null
        : Number(perfil.tarifa_base),
      acerca_de: perfil.acerca_de.trim(),
      disponibilidad: perfil.disponibilidad.trim(),
      habilidades: perfil.habilidades || [],
      certificaciones: perfil.certificaciones || []
    };

    try {
      const { data, error: updateError } = await supabase
        .from('perfiles')
        .update(cambios)
        .eq('user_id', id)
        .select('user_id, rol, nombre, localidad, avatar_url, titular, anios_experiencia, tarifa_base, acerca_de, disponibilidad, habilidades, certificaciones')
        .single();
      if (updateError) throw updateError;

      setPerfil((actual) => ({ ...data, verificado: actual.verificado }));
      setAviso('Perfil profesional guardado.');
    } catch (saveError) {
      setError(`No se pudo guardar el perfil: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const alternarHabilidad = (habilidad) => {
    const actuales = perfil?.habilidades || [];
    cambiarCampo(
      'habilidades',
      actuales.includes(habilidad)
        ? actuales.filter((item) => item !== habilidad)
        : [...actuales, habilidad]
    );
  };

  const iniciarExperiencia = (experiencia = EXPERIENCIA_VACIA) => {
    setExperienciaForm({
      ...EXPERIENCIA_VACIA,
      ...experiencia,
      fecha_fin: experiencia.fecha_fin || '',
      actual: Boolean(experiencia.actual)
    });
    setModoExperiencia(experiencia.id ? 'editar' : 'crear');
    setError('');
    setAviso('');
  };

  const guardarExperiencia = async (event) => {
    event.preventDefault();
    if (!esPropio) return;
    setGuardando(true);
    setError('');
    setAviso('');

    const fila = {
      trabajador_id: id,
      puesto: experienciaForm.puesto.trim(),
      empresa: experienciaForm.empresa.trim(),
      fecha_inicio: experienciaForm.fecha_inicio,
      fecha_fin: experienciaForm.actual ? null : experienciaForm.fecha_fin || null,
      actual: experienciaForm.actual,
      descripcion: experienciaForm.descripcion.trim()
    };

    try {
      const query = experienciaForm.id
        ? supabase.from('experiencias_trabajador').update(fila).eq('id', experienciaForm.id).eq('trabajador_id', id)
        : supabase.from('experiencias_trabajador').insert(fila);
      const { error: saveError } = await query;
      if (saveError) throw saveError;

      setModoExperiencia(null);
      setAviso(experienciaForm.id ? 'Experiencia actualizada.' : 'Experiencia agregada.');
      await refrescarExperiencias();
    } catch (saveError) {
      setError(`No se pudo guardar la experiencia: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const refrescarExperiencias = async () => {
    const { data, error: queryError } = await supabase
      .from('experiencias_trabajador')
      .select('id, puesto, empresa, fecha_inicio, fecha_fin, actual, descripcion')
      .eq('trabajador_id', id)
      .order('fecha_inicio', { ascending: false });
    if (queryError) throw queryError;
    setExperiencias(data || []);
  };

  const eliminarExperiencia = async (experiencia) => {
    if (!esPropio) return;
    setGuardando(true);
    setError('');
    setAviso('');

    try {
      const { error: deleteError } = await supabase
        .from('experiencias_trabajador')
        .delete()
        .eq('id', experiencia.id)
        .eq('trabajador_id', id);
      if (deleteError) throw deleteError;
      setExperiencias((actuales) => actuales.filter((item) => item.id !== experiencia.id));
      setAviso('Experiencia eliminada.');
    } catch (deleteError) {
      setError(`No se pudo eliminar la experiencia: ${deleteError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const nombre = perfil?.nombre || usuario?.user_metadata?.nombre || 'Profesional FixNow';
  const avatar = perfil?.avatar_url;
  const urlAvatarValida = avatar && /^https:\/\/\S+$/i.test(avatar);
  const habilidades = perfil?.habilidades || [];
  const certificaciones = perfil?.certificaciones || [];

  return (
    <section className="professional-profile">
      {onVolver && (
        <button type="button" className="panel-action-button profile-back-button" onClick={onVolver}>
          <ArrowLeft size={16} /> Regresar
        </button>
      )}
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {cargando && <p className="panel-message">Cargando perfil profesional...</p>}
      {!cargando && perfil && (
        <>
          <header className="professional-profile-header">
            <div className="professional-cover" />
            <div className="professional-identity">
              <div className="professional-avatar">
                {urlAvatarValida
                  ? <img src={avatar} alt={`Foto de ${nombre}`} referrerPolicy="no-referrer" />
                  : <span>{iniciales(nombre)}</span>}
              </div>
              <div className="professional-heading">
                <div className="professional-name-row">
                  <h2>{nombre}</h2>
                  <span className={perfil.verificado ? 'verification-badge verified' : 'verification-badge pending'}>
                    {perfil.verificado ? <BadgeCheck size={15} /> : <Clock3 size={14} />}
                    {perfil.verificado ? 'Verificado' : 'En revisión'}
                  </span>
                </div>
                <p>{perfil.titular || 'Trabajador / Técnico FixNow'}</p>
                <div className="professional-meta">
                  {perfil.localidad && <span><MapPin size={14} /> {perfil.localidad}</span>}
                  {perfil.anios_experiencia !== null && perfil.anios_experiencia !== '' && (
                    <span><BriefcaseBusiness size={14} /> {perfil.anios_experiencia} años de experiencia</span>
                  )}
                  {perfil.tarifa_base !== null && perfil.tarifa_base !== '' && (
                    <span>Desde ${Number(perfil.tarifa_base).toLocaleString('es-MX')} MXN</span>
                  )}
                </div>
              </div>
              {esPropio && <span className="profile-owner-label">Tu perfil</span>}
            </div>
          </header>

          {esPropio ? (
            <form className="profile-editor" onSubmit={guardarPerfil}>
              <section className="profile-section">
                <div className="profile-section-heading">
                  <div>
                    <span className="section-eyebrow">Presentación</span>
                    <h3>Tu perfil profesional</h3>
                  </div>
                  <button type="submit" className="panel-action-button panel-primary-action" disabled={guardando}>
                    <Save size={15} /> {guardando ? 'Guardando...' : 'Guardar perfil'}
                  </button>
                </div>
                <div className="profile-form-grid">
                  <label>
                    <span>Nombre completo</span>
                    <input value={perfil.nombre || ''} maxLength={120} required onChange={(event) => cambiarCampo('nombre', event.target.value)} />
                  </label>
                  <label>
                    <span>Titular profesional</span>
                    <input value={perfil.titular || ''} maxLength={160} placeholder="Técnico Electricista y Mantenimiento Residencial" onChange={(event) => cambiarCampo('titular', event.target.value)} />
                  </label>
                  <label>
                    <span>Ciudad / zona de cobertura</span>
                    <input value={perfil.localidad || ''} maxLength={120} required onChange={(event) => cambiarCampo('localidad', event.target.value)} />
                  </label>
                  <label>
                    <span>Años de experiencia</span>
                    <input type="number" min="0" max="80" value={perfil.anios_experiencia ?? ''} onChange={(event) => cambiarCampo('anios_experiencia', event.target.value)} />
                  </label>
                  <label>
                    <span>Tarifa base opcional (MXN)</span>
                    <input type="number" min="0" step="0.01" value={perfil.tarifa_base ?? ''} onChange={(event) => cambiarCampo('tarifa_base', event.target.value)} />
                  </label>
                  <label>
                    <span>Enlace a foto o avatar (HTTPS)</span>
                    <input type="url" placeholder="https://..." value={perfil.avatar_url || ''} onChange={(event) => cambiarCampo('avatar_url', event.target.value)} />
                  </label>
                  <label className="profile-field-wide">
                    <span>Acerca de mí</span>
                    <textarea rows="4" maxLength={2000} value={perfil.acerca_de || ''} placeholder="Resume tu experiencia, enfoque y tipo de servicios." onChange={(event) => cambiarCampo('acerca_de', event.target.value)} />
                  </label>
                  <label className="profile-field-wide">
                    <span>Disponibilidad horaria</span>
                    <textarea rows="2" maxLength={500} value={perfil.disponibilidad || ''} placeholder="Ej. Lunes a sábado, 8:00 a 18:00" onChange={(event) => cambiarCampo('disponibilidad', event.target.value)} />
                  </label>
                </div>
              </section>

              <section className="profile-section">
                <div className="profile-section-heading">
                  <div>
                    <span className="section-eyebrow">Lo que haces</span>
                    <h3>Especialidades y habilidades</h3>
                  </div>
                </div>
                <div className="skill-picker">
                  {HABILIDADES.map((habilidad) => (
                    <button
                      type="button"
                      key={habilidad}
                      className={habilidadesSeleccionadas.has(habilidad) ? 'skill-option selected' : 'skill-option'}
                      aria-pressed={habilidadesSeleccionadas.has(habilidad)}
                      onClick={() => alternarHabilidad(habilidad)}
                    >
                      {habilidadesSeleccionadas.has(habilidad) && <Check size={13} />}
                      {habilidad}
                    </button>
                  ))}
                </div>
                <label className="profile-field-label">
                  <span>Certificaciones o cursos (separados por coma)</span>
                  <input
                    value={certificaciones.join(', ')}
                    maxLength={1000}
                    placeholder="Ej. Instalaciones eléctricas, Seguridad industrial"
                    onChange={(event) => cambiarCampo(
                      'certificaciones',
                      event.target.value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20)
                    )}
                  />
                </label>
              </section>
            </form>
          ) : (
            <>
              <section className="profile-section">
                <div className="profile-section-heading">
                  <div><span className="section-eyebrow">Perfil profesional</span><h3>Acerca de mí</h3></div>
                </div>
                <p className="profile-about">{perfil.acerca_de || 'Este profesional aún no ha agregado una presentación.'}</p>
                {perfil.disponibilidad && (
                  <div className="profile-availability"><Clock3 size={16} /><span><strong>Disponibilidad</strong>{perfil.disponibilidad}</span></div>
                )}
              </section>
              <ProfileSkills habilidades={habilidades} certificaciones={certificaciones} />
            </>
          )}

          <section className="profile-section">
            <div className="profile-section-heading">
              <div>
                <span className="section-eyebrow">Trayectoria</span>
                <h3>Experiencia laboral</h3>
              </div>
              {esPropio && (
                <button type="button" className="panel-action-button" onClick={() => iniciarExperiencia()}>
                  <Plus size={15} /> Agregar experiencia
                </button>
              )}
            </div>

            {modoExperiencia && (
              <form className="experience-editor" onSubmit={guardarExperiencia}>
                <div className="profile-form-grid">
                  <label>
                    <span>Cargo o proyecto</span>
                    <input required maxLength={140} value={experienciaForm.puesto} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, puesto: event.target.value }))} />
                  </label>
                  <label>
                    <span>Empresa o cuenta propia</span>
                    <input maxLength={140} value={experienciaForm.empresa} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, empresa: event.target.value }))} />
                  </label>
                  <label>
                    <span>Fecha de inicio</span>
                    <input type="date" required value={experienciaForm.fecha_inicio} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, fecha_inicio: event.target.value }))} />
                  </label>
                  <label>
                    <span>Fecha de fin</span>
                    <input type="date" disabled={experienciaForm.actual} value={experienciaForm.fecha_fin} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, fecha_fin: event.target.value }))} />
                  </label>
                  <label className="experience-current profile-field-wide">
                    <input type="checkbox" checked={experienciaForm.actual} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, actual: event.target.checked, fecha_fin: event.target.checked ? '' : actual.fecha_fin }))} />
                    <span>Actualmente trabajo aquí</span>
                  </label>
                  <label className="profile-field-wide">
                    <span>Descripción y logros</span>
                    <textarea rows="3" maxLength={1600} value={experienciaForm.descripcion} onChange={(event) => setExperienciaForm((actual) => ({ ...actual, descripcion: event.target.value }))} />
                  </label>
                </div>
                <div className="experience-form-actions">
                  <button type="submit" className="panel-action-button panel-primary-action" disabled={guardando}>
                    <Save size={15} /> {guardando ? 'Guardando...' : 'Guardar experiencia'}
                  </button>
                  <button type="button" className="panel-action-button" onClick={() => setModoExperiencia(null)}>
                    <X size={15} /> Cancelar
                  </button>
                </div>
              </form>
            )}

            {experiencias.length === 0 && !modoExperiencia && (
              <p className="profile-empty">Aún no hay experiencia agregada.</p>
            )}
            <div className="experience-list">
              {experiencias.map((experiencia) => (
                <article key={experiencia.id} className="experience-entry">
                  <span className="experience-icon"><BriefcaseBusiness size={18} /></span>
                  <div className="experience-content">
                    <div className="experience-title-row">
                      <div>
                        <h4>{experiencia.puesto}</h4>
                        <p>{experiencia.empresa || 'Trabajo independiente'}</p>
                      </div>
                      {esPropio && (
                        <div className="experience-actions">
                          <button type="button" aria-label={`Editar ${experiencia.puesto}`} onClick={() => iniciarExperiencia(experiencia)}><Pencil size={15} /></button>
                          <button type="button" aria-label={`Eliminar ${experiencia.puesto}`} disabled={guardando} onClick={() => eliminarExperiencia(experiencia)}><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                    <span className="experience-dates">
                      <CalendarDays size={14} /> {mostrarFecha(experiencia.fecha_inicio)} — {experiencia.actual ? 'Actualidad' : mostrarFecha(experiencia.fecha_fin)}
                    </span>
                    {experiencia.descripcion && <p className="experience-description">{experiencia.descripcion}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {!esPropio && (
            <ProfileSkills habilidades={habilidades} certificaciones={certificaciones} />
          )}
        </>
      )}
    </section>
  );
}

function ProfileSkills({ habilidades, certificaciones }) {
  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <div><span className="section-eyebrow">Conocimientos</span><h3>Especialidades y certificaciones</h3></div>
        <GraduationCap size={19} className="profile-section-icon" />
      </div>
      {habilidades.length > 0 ? (
        <div className="profile-skills">
          {habilidades.map((habilidad) => <span key={habilidad} className="profile-skill">{habilidad}</span>)}
        </div>
      ) : <p className="profile-empty">Aún no se agregaron especialidades.</p>}
      {certificaciones.length > 0 && (
        <ul className="certification-list">
          {certificaciones.map((certificacion) => <li key={certificacion}><BadgeCheck size={15} />{certificacion}</li>)}
        </ul>
      )}
    </section>
  );
}
