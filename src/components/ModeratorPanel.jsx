import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ClipboardList, LogOut, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function ModeratorPanel({ usuario, permisos, onCerrarSesion }) {
  const [tecnicos, setTecnicos] = useState([]);
  const [tecnicosAprobados, setTecnicosAprobados] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [conversaciones, setConversaciones] = useState([]);
  const [conversacion, setConversacion] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    const tareas = [];
    if (permisos.puede_aprobar_tecnicos) {
      tareas.push(supabase.rpc('moderador_listar_tecnicos_pendientes').then(({ data, error: rpcError }) => {
        if (rpcError) throw rpcError;
        setTecnicos(data || []);
      }));
    }
    if (permisos.puede_gestionar_solicitudes) {
      tareas.push(Promise.all([
        supabase.rpc('moderador_listar_solicitudes'),
        supabase.rpc('moderador_listar_tecnicos_aprobados')
      ]).then(([solicitudesResult, tecnicosResult]) => {
        if (solicitudesResult.error) throw solicitudesResult.error;
        if (tecnicosResult.error) throw tecnicosResult.error;
        setSolicitudes(solicitudesResult.data || []);
        setTecnicosAprobados(tecnicosResult.data || []);
      }));
    }
    if (permisos.puede_responder_soporte) {
      tareas.push(supabase.rpc('moderador_listar_conversaciones').then(({ data, error: rpcError }) => {
        if (rpcError) throw rpcError;
        setConversaciones(data || []);
      }));
    }
    const resultados = await Promise.allSettled(tareas);
    const fallido = resultados.find((resultado) => resultado.status === 'rejected');
    if (fallido) throw fallido.reason;
  }, [permisos]);

  useEffect(() => {
    let montado = true;
    const inicial = window.setTimeout(() => {
      cargar()
        .catch((loadError) => { if (montado) setError(`No se pudieron cargar las herramientas: ${loadError.message}`); })
        .finally(() => { if (montado) setCargando(false); });
    }, 0);
    const intervalo = window.setInterval(() => {
      cargar().catch((loadError) => { if (montado) setError(`No se pudieron actualizar los datos: ${loadError.message}`); });
    }, 15000);
    return () => {
      montado = false;
      window.clearTimeout(inicial);
      window.clearInterval(intervalo);
    };
  }, [cargar]);

  useEffect(() => {
    if (!conversacion || !permisos.puede_responder_soporte) return undefined;
    let montado = true;
    const actualizarMensajes = async () => {
      try {
        const { data, error: queryError } = await supabase.rpc('moderador_listar_mensajes', {
          p_conversacion_id: conversacion.conversacion_id
        });
        if (queryError) throw queryError;
        if (montado) setMensajes(data || []);
      } catch (loadError) {
        if (montado) setError(`No se pudieron actualizar los mensajes: ${loadError.message}`);
      }
    };
    const intervalo = window.setInterval(actualizarMensajes, 5000);
    return () => {
      montado = false;
      window.clearInterval(intervalo);
    };
  }, [conversacion, permisos.puede_responder_soporte]);

  const aprobar = async (tecnico) => {
    setProcesando(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('moderador_aprobar_tecnico', { p_user_id: tecnico.user_id });
      if (rpcError) throw rpcError;
      setAviso(`Perfil aprobado: ${tecnico.nombre || 'técnico'}.`);
      await cargar();
    } catch (actionError) {
      setError(`No se pudo aprobar el perfil: ${actionError.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const actualizarSolicitud = async (solicitud, cambios) => {
    setProcesando(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('moderador_actualizar_solicitud', {
        p_trabajo_id: solicitud.id,
        p_estado: cambios.estado,
        p_tecnico_id: cambios.tecnicoId || null,
        p_motivo_cancelacion: cambios.estado === 'cancelado' ? cambios.motivo : null
      });
      if (rpcError) throw rpcError;
      setAviso('Solicitud actualizada y acción registrada en auditoría.');
      await cargar();
    } catch (actionError) {
      setError(`No se pudo actualizar la solicitud: ${actionError.message}`);
    }
    setProcesando(false);
  };

  const abrirConversacion = async (item) => {
    setConversacion(item);
    setMensajes([]);
    setError('');
    try {
      const { error: readError } = await supabase.rpc('moderador_marcar_leidos', {
        p_conversacion_id: item.conversacion_id
      });
      if (readError) throw readError;
      const { data, error: messageError } = await supabase.rpc('moderador_listar_mensajes', {
        p_conversacion_id: item.conversacion_id
      });
      if (messageError) throw messageError;
      setMensajes(data || []);
      await cargar();
    } catch (loadError) {
      setError(`No se pudo abrir la conversación: ${loadError.message}`);
    }
  };

  const enviarRespuesta = async (event) => {
    event.preventDefault();
    if (!conversacion || !respuesta.trim()) return;
    setProcesando(true);
    setError('');
    try {
      const { error: sendError } = await supabase.rpc('moderador_enviar_mensaje', {
        p_usuario_id: conversacion.usuario_id,
        p_cuerpo: respuesta.trim()
      });
      if (sendError) throw sendError;
      setRespuesta('');
      await abrirConversacion(conversacion);
      setAviso('Respuesta enviada.');
    } catch (sendError) {
      setError(`No se pudo enviar la respuesta: ${sendError.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const tienePermisos = Object.values(permisos).some(Boolean);

  return (
    <section className="moderator-console">
      <header className="moderator-header">
        <div><span className="section-eyebrow">FixNow · Operaciones</span><h1><ShieldCheck size={23} /> Centro de moderación</h1><p>{usuario.email} · Permisos limitados por función</p></div>
        <div className="moderator-header-actions">
          <button type="button" className="panel-action-button" onClick={() => cargar()} disabled={cargando}><RefreshCw size={15} />Actualizar</button>
          <button type="button" className="panel-action-button" onClick={onCerrarSesion}><LogOut size={15} />Cerrar sesión</button>
        </div>
      </header>
      <div className="moderator-permission-chips">
        {permisos.puede_aprobar_tecnicos && <span><BadgeCheck size={14} />Aprobar técnicos</span>}
        {permisos.puede_gestionar_solicitudes && <span><ClipboardList size={14} />Gestionar solicitudes</span>}
        {permisos.puede_responder_soporte && <span><MessageCircle size={14} />Responder soporte</span>}
      </div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {!tienePermisos && <p className="panel-message">Esta cuenta aún no tiene permisos de moderación asignados. Contacta al administrador principal.</p>}
      {cargando && <p className="panel-message">Cargando herramientas asignadas...</p>}

      {permisos.puede_aprobar_tecnicos && (
        <section className="moderator-section">
          <div className="admin-module-intro"><div><span className="section-eyebrow">Comunidad</span><h2>Perfiles pendientes</h2><p>Aprueba técnicos con cuenta activa para habilitar sus herramientas profesionales.</p></div><span className="admin-result-count">{tecnicos.length} pendientes</span></div>
          {tecnicos.length === 0 && <p className="admin-empty">No hay perfiles pendientes.</p>}
          <div className="moderator-record-list">{tecnicos.map((tecnico) => (
            <article key={tecnico.user_id} className="moderator-record">
              <span className="admin-user-avatar">{(tecnico.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
              <span><strong>{tecnico.nombre || 'Sin nombre'}</strong><small>{tecnico.titular || 'Técnico'} · {tecnico.localidad || 'Zona no indicada'}</small><small>{(tecnico.habilidades || []).join(' · ')}</small></span>
              <button type="button" className="panel-action-button panel-primary-action" disabled={procesando} onClick={() => aprobar(tecnico)}><BadgeCheck size={15} />Aprobar</button>
            </article>
          ))}</div>
        </section>
      )}

      {permisos.puede_gestionar_solicitudes && (
        <section className="moderator-section">
          <div className="admin-module-intro"><div><span className="section-eyebrow">Operación</span><h2>Solicitudes abiertas</h2><p>Asigna técnicos y actualiza estados; las acciones quedan registradas en auditoría.</p></div><span className="admin-result-count">{solicitudes.length} abiertas</span></div>
          <div className="moderator-record-list">{solicitudes.map((solicitud) => (
            <ModeratorRequestRow
              key={`${solicitud.id}:${solicitud.estado}:${solicitud.tecnico_id || ''}`}
              solicitud={solicitud}
              tecnicos={tecnicosAprobados}
              procesando={procesando}
              onActualizar={actualizarSolicitud}
            />
          ))}</div>
        </section>
      )}

      {permisos.puede_responder_soporte && (
        <section className="moderator-section">
          <div className="admin-module-intro"><div><span className="section-eyebrow">Atención</span><h2>Mensajería y soporte</h2><p>Acceso restringido a conversaciones y respuestas de soporte.</p></div><span className="admin-result-count">{conversaciones.length} conversaciones</span></div>
          <div className="moderator-inbox">
            <aside className="moderator-conversations">
              {conversaciones.map((item) => (
                <button type="button" key={item.conversacion_id} className={conversacion?.conversacion_id === item.conversacion_id ? 'active' : ''} onClick={() => abrirConversacion(item)}>
                  <strong>{item.nombre}</strong><small>{item.rol} · {item.ultimo_mensaje || 'Conversación iniciada'}</small>
                  {Number(item.mensajes_no_leidos) > 0 && <span>{item.mensajes_no_leidos}</span>}
                </button>
              ))}
              {conversaciones.length === 0 && <p className="admin-empty">No hay conversaciones en la bandeja.</p>}
            </aside>
            <div className="moderator-thread">
              {!conversacion && <p className="admin-empty">Selecciona una conversación.</p>}
              {conversacion && <>
                <header><strong>{conversacion.nombre}</strong><small>{conversacion.correo} · {conversacion.rol}</small></header>
                <div className="moderator-messages">{mensajes.map((mensaje) => (
                  <article key={mensaje.id} className={mensaje.remitente_id === usuario.id ? 'own' : ''}><strong>{mensaje.remitente_nombre}</strong><p>{mensaje.cuerpo}</p><time>{new Date(mensaje.creado_en).toLocaleString('es-MX')}</time></article>
                ))}</div>
                <form onSubmit={enviarRespuesta}><textarea rows={2} maxLength={5000} required value={respuesta} onChange={(event) => setRespuesta(event.target.value)} placeholder="Escribe una respuesta..." /><button type="submit" disabled={procesando || !respuesta.trim()} aria-label="Enviar respuesta"><Send size={17} /></button></form>
              </>}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

function ModeratorRequestRow({ solicitud, tecnicos, procesando, onActualizar }) {
  const [estado, setEstado] = useState(solicitud.estado);
  const [tecnicoId, setTecnicoId] = useState(solicitud.tecnico_id || '');
  const [motivo, setMotivo] = useState('');
  const requiereTecnico = !['solicitado', 'cancelado'].includes(estado);

  const guardar = (event) => {
    event.preventDefault();
    onActualizar(solicitud, { estado, tecnicoId, motivo });
  };

  return (
    <article className="moderator-request-row">
      <div className="moderator-request-summary">
        <strong>{solicitud.titulo}</strong>
        <small>{solicitud.categoria} · {solicitud.localidad} · {solicitud.urgencia.replaceAll('_', ' ')}</small>
      </div>
      <form className="moderator-request-form" onSubmit={guardar}>
        <label><span>Estado</span><select value={estado} onChange={(event) => { setEstado(event.target.value); if (['solicitado', 'cancelado'].includes(event.target.value)) setTecnicoId(''); }}>
          <option value="solicitado">Pendiente</option>
          <option value="aceptado">Aceptado</option>
          <option value="en_camino">En camino</option>
          <option value="en_proceso">En proceso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select></label>
        <label><span>Técnico asignado</span><select value={tecnicoId} disabled={!requiereTecnico} onChange={(event) => setTecnicoId(event.target.value)}>
          <option value="">Selecciona un técnico</option>
          {tecnicos.map((tecnico) => <option value={tecnico.user_id} key={tecnico.user_id}>{tecnico.nombre} · {tecnico.localidad}</option>)}
        </select></label>
        {estado === 'cancelado' && <label className="moderator-request-reason"><span>Motivo de cancelación</span><textarea required minLength={3} maxLength={500} rows={2} value={motivo} onChange={(event) => setMotivo(event.target.value)} /></label>}
        <button type="submit" className="panel-action-button panel-primary-action" disabled={procesando || (requiereTecnico && !tecnicoId)}><ClipboardList size={15} />Guardar</button>
      </form>
    </article>
  );
}
