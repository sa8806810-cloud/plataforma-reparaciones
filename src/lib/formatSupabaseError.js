const MIGRACIONES_PERFILES =
  'Aplica 20261123210000_fixnow_professional_profiles.sql después de 20261123180000_guest_technician_workflow.sql y 20261123194000_fixnow_role_admin_workflows.sql en el SQL Editor de Supabase.';

export function formatSupabaseError(error) {
  const message = error?.message || String(error || 'Error desconocido');
  const tablasPerfiles = ['perfiles', 'experiencias_trabajador'];
  const tabla = tablasPerfiles.find((nombre) =>
    message.includes(`public.${nombre}`) || message.includes(`"${nombre}"`)
  );
  const errorDeEsquema = error?.code === 'PGRST205' ||
    /schema cache|relation .* does not exist|could not find the table/i.test(message);

  if (tabla && errorDeEsquema) {
    return `Supabase no encuentra public.${tabla}. ${MIGRACIONES_PERFILES}`;
  }

  return message;
}
