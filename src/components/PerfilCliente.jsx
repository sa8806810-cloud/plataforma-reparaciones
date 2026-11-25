import { useEffect, useState } from 'react';
import { Camera, MapPin, Save } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { subirAvatar } from '../lib/avatarStorage';

const PERFIL_VACIO = {
  nombre: '',
  telefono: '',
  localidad: '',
  avatar_url: '',
  direccion_habitual: '',
  preferencias_contacto: ''
};

export default function PerfilCliente({ usuario }) {
  const [perfil, setPerfil] = useState(PERFIL_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let montado = true;
    supabase.rpc('cliente_obtener_mi_perfil')
      .then(({ data, error: queryError }) => {
        if (queryError) throw queryError;
        if (montado) {
          setPerfil({
            ...PERFIL_VACIO,
            ...data,
            nombre: data?.nombre || usuario.user_metadata?.nombre || '',
            telefono: data?.telefono || usuario.user_metadata?.telefono || ''
          });
        }
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudo cargar tu perfil: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });
    return () => { montado = false; };
  }, [usuario]);

  const cambiar = (campo, valor) => setPerfil((actual) => ({ ...actual, [campo]: valor }));

  const cargarFoto = async (event) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    setAviso('');
    try {
      const avatarUrl = await subirAvatar(usuario.id, archivo);
      cambiar('avatar_url', avatarUrl);
      setAviso('Foto cargada. Guarda los cambios para actualizar tu perfil.');
    } catch (uploadError) {
      setError(`No se pudo subir la foto: ${uploadError.message}`);
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { error: saveError } = await supabase.rpc('actualizar_mi_perfil_cliente', {
        p_nombre: perfil.nombre.trim(),
        p_telefono: perfil.telefono.trim(),
        p_localidad: perfil.localidad.trim(),
        p_avatar_url: perfil.avatar_url || null,
        p_direccion_habitual: perfil.direccion_habitual.trim(),
        p_preferencias_contacto: perfil.preferencias_contacto.trim()
      });
      if (saveError) throw saveError;
      setAviso('Perfil actualizado.');
    } catch (saveError) {
      setError(`No se pudo guardar tu perfil: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const avatarValido = perfil.avatar_url && /^https:\/\/\S+$/i.test(perfil.avatar_url);

  return (
    <section className="client-profile-editor">
      <div className="client-profile-identity">
        <span className="client-profile-avatar">
          {avatarValido ? <img src={perfil.avatar_url} alt={`Foto de ${perfil.nombre}`} referrerPolicy="no-referrer" /> : <span>{(perfil.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase()}</span>}
        </span>
        <div><span className="section-eyebrow">Tu cuenta</span><h3>{perfil.nombre || usuario.email}</h3><span>{usuario.email}</span></div>
      </div>
      {cargando && <p className="panel-message">Cargando perfil...</p>}
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {!cargando && (
        <form className="profile-form-grid" onSubmit={guardar}>
          <label><span>Nombre completo</span><input required maxLength={120} value={perfil.nombre} onChange={(event) => cambiar('nombre', event.target.value)} /></label>
          <label><span>Teléfono / WhatsApp</span><input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={perfil.telefono} onChange={(event) => cambiar('telefono', event.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
          <label><span>Ciudad / zona</span><input maxLength={120} value={perfil.localidad} onChange={(event) => cambiar('localidad', event.target.value)} /></label>
          <label><span>Dirección habitual</span><input maxLength={300} value={perfil.direccion_habitual} onChange={(event) => cambiar('direccion_habitual', event.target.value)} /></label>
          <label className="profile-field-wide"><span>Preferencias de contacto</span><textarea rows={2} maxLength={300} value={perfil.preferencias_contacto} onChange={(event) => cambiar('preferencias_contacto', event.target.value)} placeholder="Ej. Prefiero WhatsApp por la tarde." /></label>
          <label className="profile-field-wide"><span><Camera size={15} />Foto (JPG, PNG o WebP · máximo 2 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={subiendo} onChange={cargarFoto} /></label>
          <div className="profile-field-wide client-profile-actions">
            <button type="submit" className="panel-action-button panel-primary-action" disabled={guardando || subiendo}><Save size={15} />{guardando ? 'Guardando...' : 'Guardar perfil'}</button>
            {perfil.localidad && <span><MapPin size={14} />{perfil.localidad}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
