import { useCallback, useEffect, useRef, useState } from 'react';
import { Headset, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

function mostrarHora(fecha) {
  return new Date(fecha).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function SupportChat({ usuario, nombre, rol }) {
  const [abierto, setAbierto] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [cuerpo, setCuerpo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const mensajesRef = useRef(null);

  const cargarMensajes = useCallback(async (id = conversationId) => {
    if (!id) return;
    const { data, error: queryError } = await supabase
      .from('mensajes_soporte')
      .select('id, conversacion_id, remitente_id, cuerpo, creado_en, leido_en')
      .eq('conversacion_id', id)
      .order('creado_en', { ascending: true })
      .limit(200);
    if (queryError) throw queryError;
    setMensajes(data || []);

    const { error: readError } = await supabase.rpc('marcar_mensajes_soporte_leidos');
    if (readError) throw readError;
  }, [conversationId]);

  useEffect(() => {
    if (!abierto || !usuario?.id || conversationId) return undefined;
    let montado = true;

    const prepararConversacion = async () => {
      const { data: existente, error: selectError } = await supabase
        .from('conversaciones_soporte')
        .select('id')
        .eq('usuario_id', usuario.id)
        .maybeSingle();
      if (selectError) throw selectError;
      if (existente?.id) return existente.id;

      const { data: creada, error: insertError } = await supabase
        .from('conversaciones_soporte')
        .insert({ usuario_id: usuario.id })
        .select('id')
        .single();
      if (insertError?.code === '23505') {
        const { data: carrera, error: carreraError } = await supabase
          .from('conversaciones_soporte')
          .select('id')
          .eq('usuario_id', usuario.id)
          .single();
        if (carreraError) throw carreraError;
        return carrera.id;
      }
      if (insertError) throw insertError;
      return creada.id;
    };

    Promise.resolve()
      .then(() => {
        if (!montado) return null;
        setCargando(true);
        setError('');
        return prepararConversacion();
      })
      .then(async (id) => {
        if (!montado || !id) return;
        setConversationId(id);
        await cargarMensajes(id);
      })
      .catch((loadError) => {
        if (montado) setError(`No se pudo abrir soporte: ${loadError.message}`);
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, [abierto, cargarMensajes, conversationId, usuario?.id]);

  useEffect(() => {
    if (!abierto || !conversationId) return undefined;
    let actualizando = false;
    const actualizar = async () => {
      if (actualizando) return;
      actualizando = true;
      try {
        await cargarMensajes();
      } catch (loadError) {
        setError(`No se pudieron actualizar los mensajes: ${loadError.message}`);
      } finally {
        actualizando = false;
      }
    };
    const intervalo = window.setInterval(actualizar, 5000);
    return () => window.clearInterval(intervalo);
  }, [abierto, cargarMensajes, conversationId]);

  useEffect(() => {
    if (abierto && mensajesRef.current) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
    }
  }, [abierto, mensajes]);

  const enviarMensaje = async (event) => {
    event.preventDefault();
    const texto = cuerpo.trim();
    if (!texto || !conversationId || enviando) return;
    setEnviando(true);
    setError('');
    try {
      const { error: insertError } = await supabase
        .from('mensajes_soporte')
        .insert({
          conversacion_id: conversationId,
          remitente_id: usuario.id,
          cuerpo: texto
        });
      if (insertError) throw insertError;
      setCuerpo('');
      await cargarMensajes();
    } catch (sendError) {
      setError(`No se pudo enviar el mensaje: ${sendError.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="support-launcher"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
      >
        {abierto ? <X size={18} /> : <MessageCircle size={18} />}
        <span>{abierto ? 'Cerrar soporte' : 'Soporte / Chat con Admin'}</span>
      </button>
      {abierto && (
        <section className="support-chat-window" aria-label="Chat con soporte FixNow">
          <header className="support-chat-header">
            <span className="support-chat-icon"><Headset size={18} /></span>
            <span><strong>Soporte FixNow</strong><small>{nombre || usuario?.email} · {rol}</small></span>
            <button type="button" aria-label="Cerrar chat" onClick={() => setAbierto(false)}><X size={17} /></button>
          </header>
          <div className="support-chat-messages" ref={mensajesRef}>
            {cargando && <p className="support-chat-state">Abriendo conversación...</p>}
            {!cargando && mensajes.length === 0 && (
              <p className="support-chat-state">Hola. Escribe aquí y el equipo de administración te responderá.</p>
            )}
            {mensajes.map((mensaje) => {
              const propio = mensaje.remitente_id === usuario?.id;
              return (
                <article key={mensaje.id} className={propio ? 'support-message own' : 'support-message'}>
                  <p>{mensaje.cuerpo}</p>
                  <time>{mostrarHora(mensaje.creado_en)}</time>
                </article>
              );
            })}
          </div>
          {error && <p role="alert" className="support-chat-error">{error}</p>}
          <form className="support-chat-form" onSubmit={enviarMensaje}>
            <textarea
              value={cuerpo}
              onChange={(event) => setCuerpo(event.target.value)}
              placeholder="Escribe tu mensaje..."
              maxLength={5000}
              rows={2}
              required
            />
            <button type="submit" aria-label="Enviar mensaje" disabled={enviando || !cuerpo.trim()}>
              <Send size={17} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
