import { supabase } from './supabaseClient';

const TIPOS_AVATAR = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

async function subirImagen(usuarioId, archivo, nombre) {
  const extension = TIPOS_AVATAR[archivo?.type];
  if (!usuarioId || !archivo || !extension) {
    throw new Error('Selecciona una imagen JPG, PNG o WebP.');
  }
  if (archivo.size > 2 * 1024 * 1024) {
    throw new Error('La imagen debe pesar 2 MB o menos.');
  }

  const ruta = `${usuarioId}/${nombre}.${extension}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(ruta, archivo, {
      cacheControl: '3600',
      contentType: archivo.type,
      upsert: true
    });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(ruta);
  if (!data?.publicUrl) {
    throw new Error('Storage no devolvió la URL pública del avatar.');
  }
  return data.publicUrl;
}

export function subirAvatar(usuarioId, archivo) {
  return subirImagen(usuarioId, archivo, 'perfil');
}

export function subirLogoSitio(usuarioId, archivo) {
  return subirImagen(usuarioId, archivo, 'logo-sitio');
}
