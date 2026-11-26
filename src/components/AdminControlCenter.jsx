import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Banknote,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clock3,
  Columns3,
  Copy,
  Download,
  Eye,
  FileClock,
  Gift,
  ListFilter,
  LayoutDashboard,
  ImagePlus,
  Menu,
  MapPinned,
  MapPin,
  MessageCircle,
  Paintbrush,
  Phone,
  RefreshCw,
  CalendarDays,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Table2,
  UserRound,
  Users,
  UserCog,
  Wrench,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig } from '../lib/siteConfig';
import { subirLogoSitio } from '../lib/avatarStorage';

const ESTADOS = {
  solicitado: 'Pendiente',
  aceptado: 'Aceptado',
  en_camino: 'En camino',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado: 'Cancelado'
};

const CATEGORIAS = [
  'electricidad',
  'plomeria',
  'reparaciones',
  'cerrajeria',
  'electrodomesticos'
];

const MODULOS = [
  { grupo: 'Operación', id: 'resumen', etiqueta: 'Resumen ejecutivo', icono: LayoutDashboard },
  { grupo: 'Operación', id: 'solicitudes', etiqueta: 'Solicitudes', icono: Wrench },
  { grupo: 'Operación', id: 'zonas', etiqueta: 'Mapa, zonas y categorías', icono: MapPinned },
  { grupo: 'Comunidad', id: 'usuarios', etiqueta: 'Usuarios y técnicos', icono: Users },
  { grupo: 'Comunidad', id: 'moderadores', etiqueta: 'Moderadores', icono: UserCog },
  { grupo: 'Comunidad', id: 'recompensas', etiqueta: 'Ganancias y recompensas', icono: Gift },
  { grupo: 'Comunidad', id: 'soporte', etiqueta: 'Mensajería y soporte', icono: MessageCircle },
  { grupo: 'Plataforma', id: 'cms', etiqueta: 'Presentación web', icono: Paintbrush },
  { grupo: 'Plataforma', id: 'reglas', etiqueta: 'Configuración y reglas', icono: Settings },
  { grupo: 'Plataforma', id: 'auditoria', etiqueta: 'Auditoría y seguridad', icono: FileClock },
  { grupo: 'Vistas previas', id: 'preview-cliente', etiqueta: 'Panel cliente · demo', icono: Eye },
  { grupo: 'Vistas previas', id: 'preview-tecnico', etiqueta: 'Panel técnico · demo', icono: Eye }
];

function mostrarFecha(fecha, conHora = false) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-MX', conHora
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

function mostrarUrgencia(trabajo) {
  const clave = trabajo.detalles_tecnicos?.urgencia || 'normal';
  return {
    normal: 'Normal',
    hoy_mismo: 'Hoy mismo',
    emergencia_24_7: 'Emergencia 24/7'
  }[clave] || clave.replaceAll('_', ' ');
}

export default function AdminControlCenter({
  usuario,
  sessionToken,
  onVolver,
  onCerrarSesion,
  onRecargar,
  configuracionSitio,
  onConfiguracionPublicada
}) {
  const [modulo, setModulo] = useState('resumen');
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [trabajos, setTrabajos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [usuarioParaChat, setUsuarioParaChat] = useState(null);
  const [usuarioParaFicha, setUsuarioParaFicha] = useState(null);

  const cargarDatos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    setError('');
    try {
      const parametros = { p_session_token: sessionToken };
      const [resumenResult, trabajosResult, usuariosResult, conversacionesResult] = await Promise.all([
        supabase.rpc('admin_control_resumen', parametros),
        supabase.rpc('admin_listar_trabajos', parametros),
        supabase.rpc('admin_control_listar_usuarios', parametros),
        supabase.rpc('admin_control_listar_conversaciones', { ...parametros, p_rol: null })
      ]);
      const fallido = [resumenResult, trabajosResult, usuariosResult, conversacionesResult].find((resultado) => resultado.error);
      if (fallido?.error) throw fallido.error;

      setResumen(resumenResult.data?.[0] || null);
      setTrabajos(trabajosResult.data || []);
      setUsuarios(usuariosResult.data || []);
      setMensajesNoLeidos((conversacionesResult.data || []).reduce((total, item) => total + Number(item.mensajes_no_leidos || 0), 0));
    } catch (loadError) {
      setError(`No se pudo actualizar el centro de control: ${loadError.message}`);
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    const cargaInicial = window.setTimeout(() => cargarDatos(), 0);
    const intervalo = window.setInterval(() => cargarDatos(false), 15000);
    return () => {
      window.clearTimeout(cargaInicial);
      window.clearInterval(intervalo);
    };
  }, [cargarDatos]);

  const ejecutarModeracion = async (usuarioObjetivo, accion, opciones = {}) => {
    const { error: rpcError } = await supabase.rpc('admin_control_moderar_usuario', {
      p_session_token: sessionToken,
      p_user_id: usuarioObjetivo.user_id,
      p_accion: accion,
      p_motivo: opciones.motivo || null,
      p_hasta: opciones.hasta || null,
      p_nuevo_rol: opciones.rol || null
    });
    if (rpcError) throw rpcError;
    setAviso(mensajeModeracion(accion));
    await cargarDatos(false);
    onRecargar?.();
  };

  const guardarSolicitud = async (solicitud, cambios) => {
    const { error: rpcError } = await supabase.rpc('admin_control_actualizar_trabajo', {
      p_session_token: sessionToken,
      p_trabajo_id: solicitud.id,
      p_estado: cambios.estado,
      p_tecnico_id: cambios.tecnicoId || null,
      p_motivo_cancelacion: cambios.estado === 'cancelado' ? cambios.motivoCancelacion : null
    });
    if (rpcError) throw rpcError;
    setAviso('Solicitud actualizada y acción registrada en auditoría.');
    await cargarDatos(false);
  };
  const aprobarDesdeCola = async (objetivo) => {
    try {
      await ejecutarModeracion(objetivo, 'aprobar');
    } catch (actionError) {
      setError(`No se pudo aprobar el técnico: ${actionError.message}`);
    }
  };

  const solicitudSeleccionada = trabajos.find((trabajo) => trabajo.id === modulo?.solicitudId);
  const moduloActivo = typeof modulo === 'string' ? modulo : 'solicitudes';
  const esVistaPrevia = moduloActivo.startsWith('preview-');
  const tecnicosPendientes = usuarios.filter((item) => item.rol === 'tecnico' && !item.verificado && item.estado_cuenta === 'activo');
  const solicitudesPendientes = trabajos.filter((item) => item.estado === 'solicitado').length;
  const seccionesModulo = ['Operación', 'Comunidad', 'Plataforma', 'Vistas previas'].map((grupo) => ({
    grupo,
    items: MODULOS.filter((item) => item.grupo === grupo)
  }));
  const seleccionarModulo = (id) => {
    setModulo(id);
    setSidebarAbierto(false);
    setError('');
  };

  return (
    <section className="admin-console">
      <div className="admin-console-layout">
        <aside className={sidebarAbierto ? 'admin-sidebar open' : 'admin-sidebar'}>
          <div className="admin-sidebar-brand">
            <span className="brand-mark"><ShieldCheck size={18} /></span>
            <span><strong>FixNow <em>Admin</em></strong><small>Centro de operaciones</small></span>
            <span className="admin-system-status"><i />Operativo</span>
          </div>
          <nav aria-label="Módulos administrativos">
            {seccionesModulo.map(({ grupo, items }) => (
              <div className="admin-sidebar-group" key={grupo}>
                <span className="admin-sidebar-group-label">{grupo}</span>
                {items.map(({ id, etiqueta, icono: Icon }) => {
                  const badge = id === 'solicitudes' ? solicitudesPendientes
                    : id === 'usuarios' ? tecnicosPendientes.length
                      : id === 'soporte' ? mensajesNoLeidos : 0;
                  return (
                    <button
                      type="button"
                      key={id}
                      aria-current={moduloActivo === id ? 'page' : undefined}
                      className={moduloActivo === id ? 'admin-sidebar-link active' : 'admin-sidebar-link'}
                      onClick={() => seleccionarModulo(id)}
                    >
                      <Icon size={17} /><span>{etiqueta}</span>
                      {badge > 0 && <span className="admin-sidebar-count">{badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="admin-sidebar-account">
            <span className="admin-user-avatar">{(usuario.email || 'AD').slice(0, 2).toUpperCase()}</span>
            <span><strong>{usuario.email}</strong><small><i className="admin-session-light" /> Sesión única activa</small></span>
          </div>
          <div className="admin-sidebar-quick-actions">
            <button type="button" onClick={onVolver}><ArrowLeft size={15} />Ver sitio público</button>
            <button type="button" onClick={onCerrarSesion}><X size={15} />Cerrar sesión</button>
          </div>
        </aside>
        {sidebarAbierto && <button className="admin-sidebar-scrim" type="button" aria-label="Cerrar navegación" onClick={() => setSidebarAbierto(false)} />}

        <main className="admin-console-main">
          <header className="admin-console-topbar">
            <button
              type="button"
              className="admin-mobile-menu"
              aria-label="Abrir navegación administrativa"
              aria-expanded={sidebarAbierto}
              onClick={() => setSidebarAbierto((abierto) => !abierto)}
            >
              <Menu size={19} />
            </button>
            <div className="admin-console-heading">
              <span className="section-eyebrow">FixNow · Operaciones</span>
              <h1>{MODULOS.find((item) => item.id === moduloActivo)?.etiqueta || 'Solicitudes'}</h1>
            </div>
            <div className="admin-console-actions">
              <span className="admin-console-identity"><ShieldCheck size={15} />{usuario.email}</span>
              {esVistaPrevia
                ? <span className="admin-demo-pill"><Eye size={14} />Datos de demostración</span>
                : <button type="button" className="panel-action-button" onClick={() => cargarDatos()} disabled={cargando}>
                  <RefreshCw size={15} />Actualizar
                </button>}
            </div>
          </header>
          {error && <p role="alert" className="panel-message panel-error">{error}</p>}
          {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
          {cargando && <p className="panel-message">Cargando datos de administración...</p>}
          {!cargando && moduloActivo === 'resumen' && (
            <ExecutiveSummary
              resumen={resumen}
              trabajos={trabajos}
              usuarios={usuarios}
              onIrAModulo={seleccionarModulo}
              onAbrirSolicitud={(solicitud) => setModulo({ id: 'solicitudes', solicitudId: solicitud.id })}
              onAprobarTecnico={aprobarDesdeCola}
            />
          )}
          {moduloActivo === 'solicitudes' && (
            <RequestsModule
              trabajos={trabajos}
              tecnicos={usuarios.filter((item) => item.rol === 'tecnico' && item.verificado && item.estado_cuenta === 'activo')}
              seleccionada={solicitudSeleccionada}
              onAbrir={(solicitud) => setModulo({ id: 'solicitudes', solicitudId: solicitud.id })}
              onCerrarDetalle={() => setModulo('solicitudes')}
              onGuardar={guardarSolicitud}
            />
          )}
          {moduloActivo === 'zonas' && <ZonesModule trabajos={trabajos} />}
          {moduloActivo === 'usuarios' && (
            <UsersModule
              usuarios={usuarios}
              sessionToken={sessionToken}
              onAccion={ejecutarModeracion}
              usuarioInicial={usuarioParaFicha}
              onUsuarioInicialProcesado={setUsuarioParaFicha}
              onActualizado={() => cargarDatos(false)}
              onEnviarMensaje={(objetivo) => {
                setUsuarioParaChat(objetivo);
                seleccionarModulo('soporte');
              }}
            />
          )}
          {moduloActivo === 'moderadores' && (
            <ModeratorsModule sessionToken={sessionToken} />
          )}
          {moduloActivo === 'recompensas' && (
            <RewardsAdminModule sessionToken={sessionToken} />
          )}
          {moduloActivo === 'soporte' && (
            <SupportInbox
              sessionToken={sessionToken}
              usuarioAdminId={usuario.id}
              usuarios={usuarios}
              trabajos={trabajos}
              usuarioInicial={usuarioParaChat}
              onUsuarioInicialProcesado={() => setUsuarioParaChat(null)}
              onUnreadCount={setMensajesNoLeidos}
              onAbrirUsuario={(objetivo) => {
                setUsuarioParaFicha(objetivo);
                seleccionarModulo('usuarios');
              }}
            />
          )}
          {moduloActivo === 'cms' && (
            <SiteEditor
              usuarioId={usuario.id}
              sessionToken={sessionToken}
              initialConfig={configuracionSitio || DEFAULT_SITE_CONFIG}
              onPublished={onConfiguracionPublicada}
            />
          )}
          {moduloActivo === 'reglas' && (
            <PlatformRules
              sessionToken={sessionToken}
              initialConfig={configuracionSitio || DEFAULT_SITE_CONFIG}
              onPublished={onConfiguracionPublicada}
            />
          )}
          {moduloActivo === 'auditoria' && (
            <AuditModule sessionToken={sessionToken} />
          )}
          {esVistaPrevia && <RolePanelPreview role={moduloActivo === 'preview-cliente' ? 'cliente' : 'tecnico'} />}
        </main>
      </div>
    </section>
  );
}

function RolePanelPreview({ role }) {
  const esCliente = role === 'cliente';
  const [pestana, setPestana] = useState(esCliente ? 'solicitudes' : 'disponibles');
  const tabs = esCliente
    ? [['solicitudes', 'Mis solicitudes'], ['agenda', 'Agendar técnico'], ['perfil', 'Mi perfil']]
    : [['disponibles', 'Disponibles'], ['activos', 'Mis trabajos'], ['agenda', 'Agenda y cobertura'], ['perfil', 'Perfil profesional']];

  return (
    <section className="admin-role-preview">
      <div className="admin-role-preview-banner">
        <div className="admin-role-preview-icon"><Eye size={19} /></div>
        <div><strong>Vista previa de {esCliente ? 'Cliente' : 'Técnico'}</strong><p>Explora la experiencia sin crear una cuenta. Los datos son ficticios y los cambios no se guardan.</p></div>
        <span>SOLO DEMO</span>
      </div>
      {!esCliente && <article className="admin-tech-preview-hero">
        <div className="admin-tech-preview-avatar">CR<span><BadgeCheck size={14} /></span></div>
        <div className="admin-tech-preview-main">
          <div className="admin-tech-preview-title"><span className="admin-tech-verified"><BadgeCheck size={14} /> Técnico verificado</span><span className="admin-tech-online"><i /> Disponible ahora</span></div>
          <h2>Carlos Rodríguez</h2>
          <p>Electricista residencial · Instalaciones y mantenimiento</p>
          <div className="admin-tech-preview-meta"><span><MapPin size={14} /> Sahuayo, Michoacán</span><span><BriefcaseBusiness size={14} /> 9 años de experiencia</span><span><Star size={14} /> 4.9 (38 reseñas)</span></div>
          <div className="admin-tech-preview-skills"><span>Instalaciones eléctricas</span><span>Iluminación</span><span>Centros de carga</span><span>Mantenimiento</span></div>
        </div>
        <aside className="admin-tech-completion"><span>Perfil profesional</span><strong>92% completo</strong><div><i /></div><button type="button" disabled>Editar perfil (demo)</button></aside>
      </article>}
      <div className="admin-role-preview-heading">
        <div><span className="section-eyebrow">{esCliente ? 'Espacio del cliente' : 'Actividad y rendimiento'}</span><h2>{esCliente ? 'Hola, Mariana' : 'Tu jornada profesional'}</h2><p>{esCliente ? 'Aquí puedes seguir tus servicios y encontrar profesionales.' : 'Revisa tus solicitudes, agenda y resultados desde un solo lugar.'}</p></div>
        {esCliente && <span className="admin-demo-profile"><b>ML</b><span>Cliente</span></span>}
      </div>
      <div className="admin-role-preview-metrics">
        {(esCliente
          ? [['1', 'Servicio en curso'], ['4', 'Servicios completados'], ['100%', 'Perfil completo']]
          : [['3', 'Trabajos disponibles'], ['1', 'Trabajo activo'], ['96%', 'Calificación']]
        ).map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </div>
      <div className="admin-user-tabs" role="tablist" aria-label={`Pestañas de vista previa ${role}`}>
        {tabs.map(([id, label]) => <button type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'active' : ''} key={id} onClick={() => setPestana(id)}>{label}</button>)}
      </div>
      {esCliente && pestana === 'solicitudes' && <div className="admin-preview-cards">
        <article className="admin-preview-service-card">
          <div className="admin-preview-card-top"><span className="job-badge">Plomería</span><span className="job-badge job-status-badge status-en_camino">Técnico en camino</span></div>
          <h3>Reparación de fuga en cocina</h3><p>Folio FN-2048 · Sahuayo, Michoacán</p>
          <div className="admin-preview-progress"><span className="done">Solicitud enviada</span><span className="done">Técnico asignado</span><span className="current">En camino</span><span>Servicio completado</span></div>
          <div className="admin-preview-tech"><span>JR</span><div><strong>José Ramírez</strong><small>Plomero verificado · 8 años de experiencia</small></div><BadgeCheck size={17} /></div>
        </article>
        <article className="admin-preview-service-card compact"><div><strong>Instalación de lámpara</strong><small>Electricidad · Completado</small></div><span className="job-badge job-status-badge status-completado">Completado</span></article>
      </div>}
      {esCliente && pestana === 'agenda' && <div className="admin-preview-cards admin-preview-professionals">
        <article><span className="admin-preview-avatar">JR</span><strong>José Ramírez</strong><small>Plomería · Sahuayo</small><span className="admin-preview-rating">★ 4.9 · 8 años de experiencia</span><button type="button" disabled>Solicitar horario (demo)</button></article>
        <article><span className="admin-preview-avatar">AG</span><strong>Ana García</strong><small>Electricidad · Jiquilpan</small><span className="admin-preview-rating">★ 4.8 · 6 años de experiencia</span><button type="button" disabled>Solicitar horario (demo)</button></article>
      </div>}
      {esCliente && pestana === 'perfil' && <div className="admin-preview-profile-card"><span className="admin-preview-avatar large">ML</span><div><strong>Mariana López</strong><small>mariana.demo@example.com</small><small><MapPin size={13} /> Sahuayo, Michoacán</small></div><button type="button" disabled>Editar perfil (demo)</button></div>}
      {!esCliente && pestana === 'disponibles' && <div className="admin-preview-cards">
        {[
          ['Instalación de ventilador de techo', 'Electricidad · Hoy mismo · 3.2 km', '$850–$1,200 MXN'],
          ['Fuga debajo del fregadero', 'Plomería · Normal · 5.8 km', '$500–$900 MXN'],
          ['Revisión de centro de carga', 'Electricidad · Emergencia · 7.1 km', 'Cotización en sitio']
        ].map(([title, detail, estimate]) => <article className="admin-preview-job-card" key={title}><div className="admin-preview-card-top"><span className="job-badge">Solicitud cercana</span><span className="job-badge job-badge-normal">{detail.split(' · ')[1]}</span></div><h3>{title}</h3><p><MapPin size={14} />{detail.split(' · ')[0]} · {detail.split(' · ')[2]}</p><div className="admin-preview-job-footer"><strong>{estimate}</strong><span>Publicado hace 18 min</span></div><button type="button" disabled>Aceptar trabajo (demo)</button></article>)}
      </div>}
      {!esCliente && pestana === 'activos' && <div className="admin-preview-service-card admin-tech-active-job"><div className="admin-preview-card-top"><span className="job-badge">Reparaciones</span><span className="job-badge job-status-badge status-en_proceso">En proceso</span></div><h3>Reparación de puerta y marco</h3><p>Cliente: Laura M. · Jiquilpan · Hoy, 11:30 a. m.</p><div className="admin-preview-job-facts"><span><MapPin size={14} /> A 12 min de tu zona</span><span><Phone size={14} /> Contacto disponible al aceptar</span><span><Clock3 size={14} /> Tiempo estimado: 2 horas</span></div><div className="admin-preview-timeline"><span className="done">Aceptado</span><span className="done">En camino</span><span className="current">En proceso</span><span>Completado</span></div><button type="button" disabled>Actualizar trabajo (demo)</button></div>}
      {!esCliente && pestana === 'agenda' && <div className="admin-tech-schedule-layout">
        <article className="admin-tech-detail-card"><div className="admin-tech-detail-heading"><span className="admin-tech-detail-icon"><CalendarDays size={17} /></span><div><h3>Horario semanal</h3><p>Disponibilidad publicada para clientes</p></div><span className="admin-tech-online"><i /> Activo</span></div>
          <div className="admin-tech-week">{[['Lunes', '08:00 – 18:00', true], ['Martes', '08:00 – 18:00', true], ['Miércoles', '08:00 – 18:00', true], ['Jueves', '08:00 – 18:00', true], ['Viernes', '08:00 – 16:00', true], ['Sábado', '09:00 – 14:00', true], ['Domingo', 'Día libre', false]].map(([day, hours, active]) => <div key={day}><span>{day}</span><strong className={active ? '' : 'off'}>{hours}</strong></div>)}</div>
        </article>
        <article className="admin-tech-detail-card"><div className="admin-tech-detail-heading"><span className="admin-tech-detail-icon"><MapPinned size={17} /></span><div><h3>Zona de cobertura</h3><p>Área aproximada de atención</p></div></div><div className="admin-tech-map-placeholder"><span className="admin-tech-map-radius"><i /></span><span className="admin-tech-map-label"><MapPin size={14} /> Sahuayo, Mich.</span></div><div className="admin-tech-coverage-stats"><span>Radio de atención<strong>15 km</strong></span><span>Tiempo promedio<strong>35 min</strong></span></div></article>
      </div>}
      {!esCliente && pestana === 'perfil' && <div className="admin-tech-profile-layout">
        <div className="admin-tech-profile-main">
          <article className="admin-tech-detail-card"><div className="admin-tech-detail-heading"><span className="admin-tech-detail-icon"><UserRound size={17} /></span><div><h3>Acerca del profesional</h3><p>Presentación y enfoque de trabajo</p></div></div><p className="admin-tech-about">Electricista certificado con experiencia en instalaciones residenciales y comerciales. Me especializo en diagnósticos seguros, soluciones duraderas y atención puntual. Trabajo con materiales de calidad y explico cada alternativa antes de comenzar.</p></article>
          <article className="admin-tech-detail-card"><div className="admin-tech-detail-heading"><span className="admin-tech-detail-icon"><BriefcaseBusiness size={17} /></span><div><h3>Experiencia laboral</h3><p>Trayectoria profesional verificada</p></div></div>
            <div className="admin-tech-experience"><span className="admin-tech-exp-icon"><Wrench size={15} /></span><div><strong>Técnico electricista independiente</strong><small>Servicios Rodríguez · 2019 – Actualidad</small><p>Instalaciones, mantenimiento preventivo, diagnóstico de fallas y atención a clientes residenciales.</p></div></div>
            <div className="admin-tech-experience"><span className="admin-tech-exp-icon"><Wrench size={15} /></span><div><strong>Auxiliar de instalaciones eléctricas</strong><small>Constructora del Valle · 2015 – 2019</small><p>Montaje de cableado, luminarias, tableros y pruebas de seguridad en obra.</p></div></div>
          </article>
          <article className="admin-tech-detail-card"><div className="admin-tech-detail-heading"><span className="admin-tech-detail-icon"><BadgeCheck size={17} /></span><div><h3>Especialidades y certificaciones</h3><p>Capacidades destacadas</p></div></div><div className="admin-tech-preview-skills"><span>Instalación eléctrica residencial</span><span>Tableros y centros de carga</span><span>Iluminación LED</span><span>Mantenimiento preventivo</span></div><ul className="admin-tech-certifications"><li><CheckCircle2 size={15} /> Instalaciones eléctricas de baja tensión</li><li><CheckCircle2 size={15} /> Seguridad en trabajos eléctricos</li><li><CheckCircle2 size={15} /> NOM-001-SEDE · fundamentos</li></ul></article>
        </div>
        <aside className="admin-tech-profile-aside">
          <article className="admin-tech-detail-card"><h3>Resumen profesional</h3><div className="admin-tech-facts"><span>Experiencia<strong>9 años</strong></span><span>Servicios completados<strong>126</strong></span><span>Calificación<strong><Star size={14} /> 4.9 / 5</strong></span><span>Tarifa base<strong>$450 MXN</strong></span></div></article>
          <article className="admin-tech-detail-card"><h3>Reseñas recientes</h3><div className="admin-tech-review"><strong>“Muy profesional y puntual.”</strong><span>★★★★★ · María G.</span><small>Instalación de lámparas · hace 2 semanas</small></div><div className="admin-tech-review"><strong>“Explicó claramente la solución.”</strong><span>★★★★★ · Roberto L.</span><small>Revisión de centro de carga · hace 1 mes</small></div></article>
          <article className="admin-tech-detail-card admin-tech-contact"><h3>Contacto y atención</h3><p><MapPin size={14} /> Sahuayo y localidades cercanas</p><p><Clock3 size={14} /> Respuesta promedio: 12 min</p><button type="button" disabled>Contactar técnico (demo)</button></article>
        </aside>
      </div>}
      <p className="admin-preview-footer"><ShieldCheck size={14} /> Esta vista es independiente del sistema real: no consulta ni modifica cuentas, solicitudes o perfiles.</p>
    </section>
  );
}

function mensajeModeracion(accion) {
  return {
    aprobar: 'Técnico verificado y acción auditada.',
    revocar: 'Verificación retirada y acción auditada.',
    suspender: 'Cuenta suspendida y acción auditada.',
    banear: 'Cuenta baneada permanentemente y acción auditada.',
    reactivar: 'Cuenta reactivada y acción auditada.',
    cambiar_rol: 'Rol actualizado. El usuario deberá iniciar sesión nuevamente.'
  }[accion] || 'Acción completada.';
}

function ExecutiveSummary({ resumen, trabajos, usuarios, onIrAModulo, onAbrirSolicitud, onAprobarTecnico }) {
  const solicitudesActuales = Number(resumen?.solicitudes_30d || 0);
  const solicitudesPrevias = Number(resumen?.solicitudes_30d_prev || 0);
  const completadas = Number(resumen?.completadas || 0);
  const total = Number(resumen?.total_solicitudes || 0);
  const tasaResolucion = total ? (completadas / total) * 100 : 0;
  const invitadas = trabajos.filter((trabajo) => !trabajo.cliente_id).length;
  const registradas = trabajos.length - invitadas;
  const ultimosSieteDias = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const dia = new Date(hoy);
      dia.setDate(hoy.getDate() - (6 - index));
      const cantidad = trabajos.filter((trabajo) => {
        if (!trabajo.creado_en) return false;
        const fecha = new Date(trabajo.creado_en);
        return fecha.getFullYear() === dia.getFullYear() &&
          fecha.getMonth() === dia.getMonth() &&
          fecha.getDate() === dia.getDate();
      }).length;
      return {
        label: dia.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''),
        date: dia.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
        cantidad
      };
    });
  }, [trabajos]);
  const maximoDiario = Math.max(1, ...ultimosSieteDias.map((dia) => dia.cantidad));
  const categorias = CATEGORIAS.map((categoria) => ({
    categoria,
    cantidad: trabajos.filter((trabajo) => trabajo.categoria === categoria).length
  })).sort((a, b) => b.cantidad - a.cantidad);
  const urgencias = [
    { key: 'normal', label: 'Normal', color: 'normal' },
    { key: 'hoy_mismo', label: 'Hoy mismo', color: 'today' },
    { key: 'emergencia_24_7', label: 'Emergencia 24/7', color: 'emergency' }
  ].map((item) => ({
    ...item,
    cantidad: trabajos.filter((trabajo) => (trabajo.detalles_tecnicos?.urgencia || 'normal') === item.key).length
  }));
  const maximoCategoria = Math.max(1, ...categorias.map((item) => item.cantidad));
  const variacion = solicitudesPrevias === 0
    ? (solicitudesActuales ? 100 : 0)
    : ((solicitudesActuales - solicitudesPrevias) / solicitudesPrevias) * 100;
  const actividad = resumen?.actividad_reciente || [];

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro">
        <div><span className="section-eyebrow">Vista de negocio</span><h2>Resumen ejecutivo</h2><p>Indicadores operativos y actividad reciente de FixNow.</p></div>
        <span className="admin-live-pill"><span />Actualización automática cada 15 s</span>
      </div>
      <div className="admin-kpi-grid">
        <Kpi icon={Activity} label="Solicitudes totales" value={resumen?.total_solicitudes} caption={`${solicitudesActuales} en los últimos 30 días`} />
        <Kpi icon={Clock3} label="Pendientes" value={resumen?.pendientes} caption="Esperando asignación" tone="amber" />
        <Kpi icon={Wrench} label="En curso" value={resumen?.en_curso} caption="Aceptadas o en atención" tone="blue" />
        <Kpi icon={CheckCircle2} label="Tasa de resolución" value={`${tasaResolucion.toFixed(1)}%`} caption={`${completadas} trabajos completados`} tone="green" />
        <Kpi icon={Users} label="Técnicos verificados" value={resumen?.tecnicos_activos} caption={`${resumen?.tecnicos_pendientes ?? 0} pendientes de revisión`} tone="violet" />
        <Kpi icon={UserRound} label="Solicitudes por canal" value={trabajos.length} caption={`${invitadas} invitadas · ${registradas} de clientes registrados`} />
      </div>
      <div className="admin-analytics-grid">
        <article className="admin-analytics-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Últimos 30 días</span><h3>Solicitudes recibidas</h3></div><Activity size={18} /></div>
          <div className="admin-comparison-values"><strong>{solicitudesActuales}</strong><span>vs. {solicitudesPrevias} en los 30 días anteriores</span></div>
          <div className={variacion >= 0 ? 'admin-trend positive' : 'admin-trend negative'}>
            {variacion >= 0 ? '▲' : '▼'} {Math.abs(variacion).toFixed(1)}% comparado con el periodo anterior
          </div>
          <div className="admin-mini-bars" aria-label={`Solicitudes actuales ${solicitudesActuales}; previas ${solicitudesPrevias}`}>
            <span style={{ height: `${Math.min(100, Math.max(8, solicitudesPrevias ? solicitudesPrevias / Math.max(solicitudesActuales, solicitudesPrevias) * 100 : 8))}%` }} />
            <span style={{ height: `${Math.min(100, Math.max(8, solicitudesActuales ? solicitudesActuales / Math.max(solicitudesActuales, solicitudesPrevias) * 100 : 8))}%` }} />
          </div>
          <div className="admin-bars-labels"><span>Periodo anterior</span><span>Últimos 30 días</span></div>
        </article>
        <article className="admin-analytics-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Eficiencia operativa</span><h3>Conversión a trabajo aceptado</h3></div><CheckCircle2 size={18} /></div>
          <div className="admin-conversion-value">{Number(resumen?.conversion_30d || 0).toFixed(1)}<small>%</small></div>
          <p>Periodo anterior: {Number(resumen?.conversion_30d_prev || 0).toFixed(1)}%</p>
          <div className="admin-progress-track"><span style={{ width: `${Math.min(100, Number(resumen?.conversion_30d || 0))}%` }} /></div>
        </article>
        <article className="admin-analytics-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Tiempo de respuesta</span><h3>Promedio hasta aceptar</h3></div><Clock3 size={18} /></div>
          <div className="admin-conversion-value">{Number(resumen?.minutos_promedio_aceptacion || 0).toFixed(0)}<small> min</small></div>
          <p>Calculado desde solicitudes aceptadas con marca de tiempo registrada.</p>
        </article>
        <article className="admin-analytics-card admin-weekly-chart">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Últimos 7 días</span><h3>Solicitudes recibidas</h3></div><Activity size={18} /></div>
          <div className="admin-weekly-bars" role="img" aria-label="Solicitudes diarias durante los últimos siete días">
            {ultimosSieteDias.map((dia) => (
              <div className="admin-weekly-bar-column" key={dia.date} title={`${dia.cantidad} solicitudes · ${dia.date}`}>
                <strong>{dia.cantidad || ''}</strong>
                <span style={{ height: `${Math.max(4, (dia.cantidad / maximoDiario) * 100)}%` }} />
                <small>{dia.label}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="admin-analytics-card admin-distribution-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Distribución</span><h3>Por categoría</h3></div><ListFilter size={18} /></div>
          <div className="admin-distribution-list">
            {categorias.map((item) => (
              <div className="admin-distribution-row" key={item.categoria}>
                <span>{item.categoria.replaceAll('_', ' ')}</span><div><i style={{ width: `${(item.cantidad / maximoCategoria) * 100}%` }} /></div><strong>{item.cantidad}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="admin-analytics-card admin-urgency-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Prioridad</span><h3>Por urgencia</h3></div><AlertTriangle size={18} /></div>
          <div className="admin-urgency-list">
            {urgencias.map((item) => (
              <div className={`admin-urgency-item ${item.color}`} key={item.key}><span>{item.label}</span><strong>{item.cantidad}</strong></div>
            ))}
          </div>
        </article>
      </div>
      <div className="admin-dashboard-bottom">
        <section className="admin-recent-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Seguimiento</span><h3>Actividad reciente</h3></div><button type="button" onClick={() => onIrAModulo('solicitudes')}>Ver solicitudes</button></div>
          {actividad.length === 0 && <p className="admin-empty">Aún no hay actividad registrada.</p>}
          <div className="admin-activity-list">
            {actividad.map((item) => (
              <article key={item.id} className="admin-activity-item">
                <span className={`admin-activity-dot state-${item.estado}`} />
                <span><strong>{item.titulo}</strong><small>{item.categoria} · {item.localidad} · {mostrarFecha(item.creado_en, true)}</small></span>
                <span className={`job-badge status-${item.estado}`}>{ESTADOS[item.estado] || item.estado}</span>
              </article>
            ))}
          </div>
        </section>
        <aside className="admin-alert-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Atención requerida</span><h3>Cola prioritaria</h3></div><AlertTriangle size={18} /></div>
          {trabajos.filter((trabajo) => trabajo.estado === 'solicitado' && ['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia)).slice(0, 4).map((trabajo) => (
            <button type="button" className="admin-priority-item" key={trabajo.id} onClick={() => onAbrirSolicitud(trabajo)}>
              <span><strong>{mostrarUrgencia(trabajo)}</strong><small>{trabajo.titulo} · {trabajo.localidad || 'Zona sin especificar'}</small></span><ArrowLeft size={15} />
            </button>
          ))}
          {trabajos.filter((trabajo) => trabajo.estado === 'solicitado' && ['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia)).length === 0 && <p>No hay solicitudes urgentes sin asignar.</p>}
          {usuarios.filter((item) => item.rol === 'tecnico' && !item.verificado && item.estado_cuenta === 'activo').slice(0, 3).map((tecnico) => (
            <div className="admin-priority-item admin-priority-technician" key={tecnico.user_id}>
              <span><strong>{tecnico.nombre || 'Técnico pendiente'}</strong><small>{tecnico.titular || tecnico.localidad || 'Revisión de perfil'}</small></span>
              <button type="button" onClick={() => onAprobarTecnico(tecnico)}>Aprobar</button>
            </div>
          ))}
          <button type="button" className="panel-action-button panel-primary-action" onClick={() => onIrAModulo('usuarios')}>Revisar técnicos</button>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, caption, tone = 'default' }) {
  return (
    <article className={`admin-kpi-card tone-${tone}`}>
      <span className="admin-kpi-icon"><Icon size={18} /></span>
      <span className="admin-kpi-label">{label}</span>
      <strong>{value ?? '—'}</strong>
      <small>{caption}</small>
    </article>
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function descargarCSV(trabajos) {
  const columnas = [
    ['folio', (item) => item.detalles_tecnicos?.folio_solicitud || item.id],
    ['estado', (item) => ESTADOS[item.estado] || item.estado],
    ['categoria', (item) => item.categoria],
    ['subtipo', (item) => item.subtipo],
    ['urgencia', mostrarUrgencia],
    ['titulo', (item) => item.titulo],
    ['cliente', (item) => item.nombre_contacto],
    ['telefono', (item) => item.telefono_contacto],
    ['zona', (item) => item.localidad],
    ['direccion', (item) => item.direccion],
    ['tecnico_id', (item) => item.tecnico_id],
    ['creado_en', (item) => item.creado_en]
  ];
  const contenido = [
    columnas.map(([titulo]) => csvCell(titulo)).join(','),
    ...trabajos.map((item) => columnas.map(([, obtener]) => csvCell(obtener(item))).join(','))
  ].join('\r\n');
  const archivo = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `fixnow-solicitudes-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

function RequestsModule({ trabajos, tecnicos, seleccionada, onAbrir, onCerrarDetalle, onGuardar }) {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [urgencia, setUrgencia] = useState('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [accion, setAccion] = useState('');
  const [modoVista, setModoVista] = useState('tabla');

  const filtrados = useMemo(() => trabajos.filter((trabajo) => {
    const texto = [
      trabajo.detalles_tecnicos?.folio_solicitud,
      trabajo.id,
      trabajo.nombre_contacto,
      trabajo.telefono_contacto,
      trabajo.titulo,
      trabajo.localidad
    ].filter(Boolean).join(' ').toLowerCase();
    const fecha = trabajo.creado_en?.slice(0, 10);
    return (!busqueda || texto.includes(busqueda.trim().toLowerCase())) &&
      (estado === 'todos' || trabajo.estado === estado) &&
      (categoria === 'todas' || trabajo.categoria === categoria) &&
      (urgencia === 'todas' || (trabajo.detalles_tecnicos?.urgencia || 'normal') === urgencia) &&
      (!desde || fecha >= desde) &&
      (!hasta || fecha <= hasta);
  }), [busqueda, categoria, desde, hasta, estado, trabajos, urgencia]);

  const guardar = async (trabajo, cambios) => {
    setAccion('saving');
    try {
      await onGuardar(trabajo, cambios);
      onCerrarDetalle();
    } catch (saveError) {
      setAccion(saveError.message || 'error');
    } finally {
      if (accion === 'saving') setAccion('');
    }
  };

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Operaciones</span><h2>Gestión de solicitudes</h2><p>Busca, inspecciona, reasigna y actualiza trabajos.</p></div><span className="admin-result-count">{filtrados.length} de {trabajos.length}</span></div>
      <div className="admin-filter-toolbar">
        <label className="admin-search-field"><Search size={16} /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por folio, cliente, teléfono o zona" /></label>
        <label><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value)}><option value="todos">Todos</option>{Object.entries(ESTADOS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label><span>Categoría</span><select value={categoria} onChange={(event) => setCategoria(event.target.value)}><option value="todas">Todas</option>{CATEGORIAS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Urgencia</span><select value={urgencia} onChange={(event) => setUrgencia(event.target.value)}><option value="todas">Todas</option><option value="normal">Normal</option><option value="hoy_mismo">Hoy mismo</option><option value="emergencia_24_7">Emergencia 24/7</option></select></label>
        <label><span>Desde</span><input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label>
      </div>
      <div className="admin-request-tools">
        <div className="admin-view-switch" role="group" aria-label="Vista de solicitudes">
          <button type="button" className={modoVista === 'tabla' ? 'active' : ''} onClick={() => setModoVista('tabla')}><Table2 size={15} />Tabla</button>
          <button type="button" className={modoVista === 'kanban' ? 'active' : ''} onClick={() => setModoVista('kanban')}><Columns3 size={15} />Tablero</button>
        </div>
        <button type="button" className="panel-action-button" onClick={() => descargarCSV(filtrados)} disabled={!filtrados.length}><Download size={15} />Exportar CSV</button>
      </div>
      {filtrados.length === 0 && <p className="panel-message">No hay solicitudes que coincidan con los filtros.</p>}
      {modoVista === 'tabla' && filtrados.length > 0 && (
        <div className="admin-request-table-wrap">
          <table className="admin-request-table">
            <thead><tr><th>Solicitud</th><th>Cliente</th><th>Estado</th><th>Urgencia</th><th>Zona</th><th>Fecha</th><th /></tr></thead>
            <tbody>{filtrados.map((trabajo) => (
              <tr key={trabajo.id} onClick={() => onAbrir(trabajo)}>
                <td><strong>{trabajo.titulo}</strong><small>{trabajo.detalles_tecnicos?.folio_solicitud || trabajo.id}</small></td>
                <td>{trabajo.nombre_contacto || 'Cliente'}<small>{trabajo.telefono_contacto || 'Sin teléfono'}</small></td>
                <td><span className={`job-badge status-${trabajo.estado}`}>{ESTADOS[trabajo.estado] || trabajo.estado}</span></td>
                <td><span className={`job-badge ${['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia) ? 'job-badge-urgent' : 'job-badge-normal'}`}>{mostrarUrgencia(trabajo)}</span></td>
                <td>{trabajo.localidad || '—'}</td>
                <td>{mostrarFecha(trabajo.creado_en, true)}</td>
                <td><button type="button" className="icon-button" aria-label={`Inspeccionar ${trabajo.titulo}`} onClick={(event) => { event.stopPropagation(); onAbrir(trabajo); }}><ArrowLeft size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {modoVista === 'kanban' && filtrados.length > 0 && (
        <div className="admin-kanban">
          {Object.entries(ESTADOS).map(([estadoKey, estadoLabel]) => {
            const columna = filtrados.filter((item) => item.estado === estadoKey);
            return (
              <section className="admin-kanban-column" key={estadoKey}>
                <header><span>{estadoLabel}</span><strong>{columna.length}</strong></header>
                {columna.map((trabajo) => (
                  <button type="button" className="admin-kanban-card" key={trabajo.id} onClick={() => onAbrir(trabajo)}>
                    <span className="admin-kanban-card-meta">{trabajo.categoria} · {mostrarFecha(trabajo.creado_en)}</span>
                    <strong>{trabajo.titulo}</strong>
                    <span>{trabajo.nombre_contacto || 'Cliente'} · {trabajo.localidad || 'Zona no indicada'}</span>
                    <span className={`job-badge ${['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia) ? 'job-badge-urgent' : 'job-badge-normal'}`}>{mostrarUrgencia(trabajo)}</span>
                  </button>
                ))}
                {columna.length === 0 && <p className="admin-empty">Sin solicitudes</p>}
              </section>
            );
          })}
        </div>
      )}
      {seleccionada && (
        <RequestDetail
          key={seleccionada.id}
          solicitud={seleccionada}
          tecnicos={tecnicos}
          accion={accion}
          setAccion={setAccion}
          onGuardar={guardar}
          onCerrar={onCerrarDetalle}
        />
      )}
    </div>
  );
}

function RequestDetail({ solicitud, tecnicos, accion, setAccion, onGuardar, onCerrar }) {
  const [estado, setEstado] = useState(solicitud.estado);
  const [tecnicoId, setTecnicoId] = useState(solicitud.tecnico_id || '');
  const [motivoCancelacion, setMotivoCancelacion] = useState(solicitud.motivo_cancelacion || '');
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const tecnicoAsignado = tecnicos.find((item) => item.user_id === solicitud.tecnico_id);
  const esCancelacion = estado === 'cancelado';
  const guardar = async (event) => {
    event.preventDefault();
    setError('');
    if (esCancelacion && motivoCancelacion.trim().length < 3) {
      setError('El motivo de cancelación es obligatorio.');
      return;
    }
    try {
      await onGuardar(solicitud, { estado, tecnicoId, motivoCancelacion });
    } catch (saveError) {
      setError(`No se pudo guardar: ${saveError.message}`);
      setAccion('');
    }
  };

  return (
    <div className="admin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar(); }}>
      <section className="admin-detail-modal admin-request-drawer" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header><div><span className="section-eyebrow">Folio {solicitud.detalles_tecnicos?.folio_solicitud || solicitud.id}</span><h2 id="request-detail-title">{solicitud.titulo}</h2></div><button type="button" className="icon-button" aria-label="Cerrar detalle" onClick={onCerrar}><X size={19} /></button></header>
        <div className="admin-detail-grid">
          <DetailItem label="Estado">{ESTADOS[solicitud.estado] || solicitud.estado}</DetailItem>
          <DetailItem label="Categoría">{solicitud.categoria} · {solicitud.subtipo}</DetailItem>
          <DetailItem label="Urgencia">{mostrarUrgencia(solicitud)}</DetailItem>
          <DetailItem label="Fecha de solicitud">{mostrarFecha(solicitud.creado_en, true)}</DetailItem>
          <DetailItem label="Cliente">{solicitud.nombre_contacto || '—'} · {solicitud.telefono_contacto || '—'}</DetailItem>
          <DetailItem label="Contacto rápido" wide>
            <div className="admin-contact-actions">
              <button type="button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(solicitud.telefono_contacto || '');
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 1800);
                } catch (copyError) {
                  setError(`No se pudo copiar el teléfono: ${copyError.message}`);
                }
              }} disabled={!solicitud.telefono_contacto}><Copy size={14} />{copiado ? 'Copiado' : 'Copiar teléfono'}</button>
              {solicitud.telefono_contacto && <a href={`https://wa.me/${solicitud.telefono_contacto.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
            </div>
          </DetailItem>
          <DetailItem label="Técnico asignado" wide>{tecnicoAsignado ? `${tecnicoAsignado.nombre} · ${tecnicoAsignado.localidad || 'Zona no indicada'}` : solicitud.tecnico_id || 'Sin asignar'}</DetailItem>
          <DetailItem label="Zona">{solicitud.localidad}</DetailItem>
          <DetailItem label="Dirección">{solicitud.direccion || '—'}</DetailItem>
          <DetailItem label="Referencias">{solicitud.referencias_domicilio || '—'}</DetailItem>
          <DetailItem label="Fecha solicitada">{solicitud.detalles_tecnicos?.fecha_solicitada || '—'}</DetailItem>
          <DetailItem label="Presupuesto estimado">{solicitud.detalles_tecnicos?.presupuesto_estimado || '—'}</DetailItem>
          <DetailItem label="Descripción" wide>{solicitud.descripcion || '—'}</DetailItem>
          <DetailItem label="Respuestas técnicas" wide><pre>{JSON.stringify(solicitud.detalles_tecnicos || {}, null, 2)}</pre></DetailItem>
          {solicitud.motivo_cancelacion && <DetailItem label="Motivo de cancelación" wide>{solicitud.motivo_cancelacion}</DetailItem>}
        </div>
        <section className="admin-detail-subsection">
          <h3>Registro de solicitud</h3>
          <article><strong>Solicitud recibida</strong><span>{mostrarFecha(solicitud.creado_en, true)} · Estado actual: {ESTADOS[solicitud.estado] || solicitud.estado}</span></article>
          <p className="admin-empty">El esquema actual no expone un historial de cambios de estado ni notas internas para esta solicitud.</p>
        </section>
        <form className="admin-detail-controls" onSubmit={guardar}>
          <label><span>Estado de solicitud</span><select value={estado} onChange={(event) => { const value = event.target.value; setEstado(value); if (['solicitado', 'cancelado'].includes(value)) setTecnicoId(''); }}>{Object.entries(ESTADOS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label><span>Técnico asignado</span><select value={tecnicoId} disabled={['solicitado', 'cancelado'].includes(estado)} onChange={(event) => setTecnicoId(event.target.value)}><option value="">Sin asignar</option>{tecnicos.map((tecnico) => <option key={tecnico.user_id} value={tecnico.user_id}>{tecnico.nombre} · {tecnico.localidad}</option>)}</select></label>
          {esCancelacion && <label className="admin-field-wide"><span>Motivo de cancelación (obligatorio)</span><textarea rows={2} minLength={3} maxLength={500} required value={motivoCancelacion} onChange={(event) => setMotivoCancelacion(event.target.value)} /></label>}
          {error && <p role="alert" className="panel-message panel-error admin-field-wide">{error}</p>}
          {typeof accion === 'string' && accion !== 'saving' && accion && <p role="alert" className="panel-message panel-error admin-field-wide">{accion}</p>}
          <div className="admin-modal-actions admin-field-wide"><button type="button" className="panel-action-button" onClick={onCerrar}>Cerrar</button><button type="submit" className="panel-action-button panel-primary-action" disabled={accion === 'saving'}>{accion === 'saving' ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </form>
      </section>
    </div>
  );
}

function DetailItem({ label, wide = false, children }) {
  return <div className={wide ? 'admin-detail-item wide' : 'admin-detail-item'}><span>{label}</span><div className="admin-detail-value">{children}</div></div>;
}

function UsersModule({
  usuarios,
  sessionToken,
  onAccion,
  usuarioInicial,
  onUsuarioInicialProcesado,
  onActualizado,
  onEnviarMensaje
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [orden, setOrden] = useState('nombre');
  const [seleccionado, setSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [accionUsuario, setAccionUsuario] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(false);

  const filtrados = useMemo(() => usuarios.filter((item) => {
    const coincideTexto = [item.nombre, item.correo, item.telefono, item.localidad, item.titular, ...(item.habilidades || []), item.user_id]
      .filter(Boolean).join(' ').toLowerCase().includes(busqueda.trim().toLowerCase());
    const coincideFiltro = filtro === 'todos' ||
      (filtro === 'clientes' && item.rol === 'cliente') ||
      (filtro === 'verificados' && item.rol === 'tecnico' && item.verificado && item.estado_cuenta === 'activo') ||
      (filtro === 'pendientes' && item.rol === 'tecnico' && !item.verificado && item.estado_cuenta === 'activo') ||
      (filtro === 'restringidos' && ['suspendido', 'baneado'].includes(item.estado_cuenta));
    return coincideTexto && coincideFiltro;
  }).sort((a, b) => orden === 'trabajos'
    ? Number(b.trabajos_total || 0) - Number(a.trabajos_total || 0)
    : String(a.nombre || a.correo || '').localeCompare(String(b.nombre || b.correo || ''), 'es')), [busqueda, filtro, orden, usuarios]);

  const abrirDetalle = useCallback(async (usuarioObjetivo) => {
    setSeleccionado(usuarioObjetivo);
    setDetalle(null);
    setCargandoDetalle(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.rpc('admin_control_detalle_usuario', {
        p_session_token: sessionToken,
        p_user_id: usuarioObjetivo.user_id
      });
      if (queryError) throw queryError;
      setDetalle(data?.[0] || null);
    } catch (loadError) {
      setError(`No se pudo cargar la ficha: ${loadError.message}`);
    } finally {
      setCargandoDetalle(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!usuarioInicial) return;
    const timer = window.setTimeout(() => {
      abrirDetalle(usuarioInicial);
      onUsuarioInicialProcesado?.(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [usuarioInicial, abrirDetalle, onUsuarioInicialProcesado]);

  const ejecutar = async (accion, opciones) => {
    if (!accionUsuario) return;
    setProcesando(true);
    setError('');
    try {
      await onAccion(accionUsuario, accion, opciones);
      setAccionUsuario(null);
      setSeleccionado(null);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setProcesando(false);
    }
  };

  const guardarEdicionUsuario = async (cambios) => {
    if (!detalle?.perfil) return;
    setProcesando(true);
    setError('');
    try {
      const { error: updateError } = await supabase.rpc('admin_control_editar_usuario', {
        p_session_token: sessionToken,
        p_user_id: detalle.perfil.user_id,
        p_nombre: cambios.nombre,
        p_telefono: cambios.telefono,
        p_localidad: cambios.localidad,
        p_titular: cambios.titular,
        p_rol: cambios.rol,
        p_restablecer_avatar: cambios.restablecerAvatar
      });
      if (updateError) throw updateError;
      setEditorAbierto(false);
      setAviso('Datos del usuario actualizados y cambio registrado en auditoría.');
      await onActualizado?.();
      await abrirDetalle(seleccionado);
    } catch (saveError) {
      setError(`No se pudo editar el usuario: ${saveError.message}`);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Directorio y confianza</span><h2>Gestión de usuarios</h2><p>Perfiles, experiencia, historial y moderación desde un solo lugar.</p></div><span className="admin-result-count">{filtrados.length} usuarios</span></div>
    {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      <div className="admin-user-tabs" role="tablist" aria-label="Filtrar usuarios">
        {[
          ['todos', 'Todos'],
          ['pendientes', 'Pendientes'],
          ['verificados', 'Técnicos activos'],
          ['clientes', 'Clientes'],
          ['restringidos', 'Suspendidos / baneados']
        ].map(([key, label]) => (
          <button type="button" role="tab" aria-selected={filtro === key} className={filtro === key ? 'active' : ''} key={key} onClick={() => setFiltro(key)}>{label}</button>
        ))}
      </div>
      <div className="admin-user-toolbar">
        <label className="admin-search-field"><Search size={16} /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, correo, titular o zona" /></label>
        <label><span>Ordenar por</span><select value={orden} onChange={(event) => setOrden(event.target.value)}><option value="nombre">Nombre</option><option value="trabajos">Más trabajos</option></select></label>
      </div>
      <div className="admin-user-list">
        {filtrados.length === 0 && <p className="panel-message">No hay usuarios que coincidan con el filtro.</p>}
        {filtrados.map((item) => (
          <article key={item.user_id} className="admin-user-row">
            <span className="admin-user-avatar">{(item.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
            <div className="admin-user-main"><strong>{item.nombre || 'Sin nombre'}</strong><span>{item.correo} · {item.telefono || 'Sin teléfono'}</span><small>{item.rol === 'tecnico' ? item.titular || 'Técnico' : item.rol === 'moderador' ? 'Moderador' : 'Cliente'} · {item.localidad || 'Zona no indicada'} · {item.trabajos_total} trabajos</small></div>
            <div className="admin-user-badges">
              <span className={`job-badge ${item.rol === 'tecnico' ? item.verificado ? 'job-badge-normal' : 'job-badge-urgent' : ''}`}>{item.rol === 'tecnico' ? item.verificado ? 'Verificado' : 'Pendiente' : item.rol === 'moderador' ? 'Moderador' : 'Cliente'}</span>
              {item.estado_cuenta !== 'activo' && <span className={`job-badge ${item.estado_cuenta === 'baneado' ? 'job-badge-urgent' : 'job-status-badge'}`}>{item.estado_cuenta === 'baneado' ? 'Baneado' : 'Suspendido'}</span>}
            </div>
            <button type="button" className="panel-action-button" onClick={() => abrirDetalle(item)}>Abrir ficha</button>
            <div className="admin-user-actions">
            {item.rol === 'tecnico' && <button type="button" title={item.verificado ? 'Revocar verificación' : 'Aprobar técnico'} onClick={() => setAccionUsuario({ ...item, accionInicial: item.verificado ? 'revocar' : 'aprobar' })}>{item.verificado ? <XCircle size={16} /> : <BadgeCheck size={16} />}</button>}
              <button type="button" title="Suspender cuenta" onClick={() => setAccionUsuario({ ...item, accionInicial: 'suspender' })}><Clock3 size={16} /></button>
              <button type="button" title="Banear cuenta" onClick={() => setAccionUsuario({ ...item, accionInicial: 'banear' })}><Ban size={16} /></button>
            {item.estado_cuenta !== 'activo' && <button type="button" title="Reactivar cuenta" onClick={() => setAccionUsuario({ ...item, accionInicial: 'reactivar' })}><CheckCircle2 size={16} /></button>}
            </div>
          </article>
        ))}
      </div>
      {seleccionado && (
        <UserDetailModal
          user={seleccionado}
          detalle={detalle}
          cargando={cargandoDetalle}
          error={error}
          onClose={() => { setSeleccionado(null); setDetalle(null); setError(''); }}
          onModerate={() => setAccionUsuario(seleccionado)}
          onEdit={() => setEditorAbierto(true)}
          onEnviarMensaje={() => onEnviarMensaje?.(seleccionado)}
        />
      )}
      {editorAbierto && detalle?.perfil && (
        <EditUserModal
          perfil={detalle.perfil}
          procesando={procesando}
          error={error}
          onClose={() => { setEditorAbierto(false); setError(''); }}
          onSave={guardarEdicionUsuario}
        />
      )}
      {accionUsuario && (
        <ModerationModal
          usuarioObjetivo={accionUsuario}
          procesando={procesando}
          error={error}
          onClose={() => { setAccionUsuario(null); setError(''); }}
          onApply={ejecutar}
        />
      )}
    </div>
  );
}

function UserDetailModal({ user, detalle, cargando, error, onClose, onModerate, onEdit, onEnviarMensaje }) {
  const perfil = detalle?.perfil;
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-detail-modal" role="dialog" aria-modal="true" aria-labelledby="user-detail-title">
        <header><div><span className="section-eyebrow">Ficha de usuario</span><h2 id="user-detail-title">{user.nombre || user.correo}</h2></div><button type="button" className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X size={19} /></button></header>
        {cargando && <p className="panel-message">Cargando perfil e historial...</p>}
        {error && <p role="alert" className="panel-message panel-error">{error}</p>}
        {perfil && (
          <>
            <div className="admin-detail-grid">
              <DetailItem label="Correo">{perfil.correo || '—'}</DetailItem><DetailItem label="Teléfono">{perfil.telefono || '—'}</DetailItem>
              <DetailItem label="Rol">{perfil.rol}</DetailItem><DetailItem label="Estado">{perfil.estado_cuenta}</DetailItem>
              <DetailItem label="Zona">{perfil.localidad || '—'}</DetailItem><DetailItem label="Registro">{mostrarFecha(perfil.creado_en, true)}</DetailItem>
              {perfil.rol === 'tecnico' && <><DetailItem label="Titular">{perfil.titular || '—'}</DetailItem><DetailItem label="Experiencia">{perfil.anios_experiencia ?? '—'} años</DetailItem><DetailItem label="Tarifa base">{perfil.tarifa_base ? `$${perfil.tarifa_base} MXN` : '—'}</DetailItem><DetailItem label="Verificación">{perfil.verificado ? 'Verificado' : 'Pendiente'}</DetailItem><DetailItem label="Acerca de mí" wide>{perfil.acerca_de || '—'}</DetailItem><DetailItem label="Habilidades" wide>{(perfil.habilidades || []).join(', ') || '—'}</DetailItem></>}
              {perfil.motivo_sancion && <DetailItem label="Motivo/duración" wide>{perfil.motivo_sancion}{perfil.suspension_hasta ? ` · Hasta ${mostrarFecha(perfil.suspension_hasta, true)}` : ''}</DetailItem>}
            </div>
            {detalle.experiencias?.length > 0 && <section className="admin-detail-subsection"><h3>Experiencia laboral</h3>{detalle.experiencias.map((item) => <article key={item.id}><strong>{item.puesto}</strong><span>{item.empresa || 'Trabajo independiente'} · {mostrarFecha(item.fecha_inicio)} — {item.actual ? 'Actualidad' : mostrarFecha(item.fecha_fin)}</span>{item.descripcion && <p>{item.descripcion}</p>}</article>)}</section>}
            <section className="admin-detail-subsection"><h3>Historial de trabajos</h3>{(detalle.trabajos || []).length === 0 && <p className="admin-empty">Sin trabajos en el historial.</p>}{(detalle.trabajos || []).map((item) => <article key={item.id}><strong>{item.titulo} · {ESTADOS[item.estado] || item.estado}</strong><span>{item.categoria} · {item.rol_usuario} · {item.localidad} · {mostrarFecha(item.creado_en)}</span></article>)}</section>
            <div className="admin-modal-actions">
              <button type="button" className="panel-action-button" onClick={onClose}>Cerrar</button>
              <button type="button" className="panel-action-button" onClick={onEdit}><UserCog size={15} />Editar usuario</button>
              <button type="button" className="panel-action-button" onClick={onEnviarMensaje}><MessageCircle size={15} />Enviar mensaje</button>
              <button type="button" className="panel-action-button panel-primary-action" onClick={onModerate}>Moderar usuario</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function EditUserModal({ perfil, procesando, error, onClose, onSave }) {
  const [nombre, setNombre] = useState(perfil.nombre || '');
  const [telefono, setTelefono] = useState(perfil.telefono || '');
  const [localidad, setLocalidad] = useState(perfil.localidad || '');
  const [titular, setTitular] = useState(perfil.titular || '');
  const [rol, setRol] = useState(perfil.rol || 'cliente');
  const [restablecerAvatar, setRestablecerAvatar] = useState(false);

  const guardar = (event) => {
    event.preventDefault();
    onSave({
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      localidad: localidad.trim(),
      titular: titular.trim(),
      rol,
      restablecerAvatar
    });
  };

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-detail-modal admin-moderation-modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
        <header><div><span className="section-eyebrow">Edición administrativa</span><h2 id="edit-user-title">{perfil.correo || perfil.nombre}</h2></div><button type="button" className="icon-button" aria-label="Cerrar editor" onClick={onClose}><X size={19} /></button></header>
        <form className="admin-moderation-form" onSubmit={guardar}>
          <label><span>Nombre completo</span><input required maxLength={120} value={nombre} onChange={(event) => setNombre(event.target.value)} /></label>
          <label><span>Teléfono / WhatsApp</span><input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={telefono} onChange={(event) => setTelefono(event.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
          <label><span>Ciudad / zona</span><input maxLength={120} value={localidad} onChange={(event) => setLocalidad(event.target.value)} /></label>
          <label><span>Titular profesional</span><input maxLength={160} value={titular} onChange={(event) => setTitular(event.target.value)} /></label>
          <label><span>Rol</span><select value={rol} onChange={(event) => setRol(event.target.value)}><option value="cliente">Cliente</option><option value="tecnico">Trabajador / Técnico</option><option value="moderador">Moderador (sin permisos hasta asignarlos)</option></select></label>
          <label className="admin-inline-check"><input type="checkbox" checked={restablecerAvatar} onChange={(event) => setRestablecerAvatar(event.target.checked)} /><span>Restablecer foto de perfil</span></label>
          {error && <p role="alert" className="panel-message panel-error">{error}</p>}
          <div className="admin-modal-actions"><button type="button" className="panel-action-button" onClick={onClose}>Cancelar</button><button type="submit" className="panel-action-button panel-primary-action" disabled={procesando}>{procesando ? 'Guardando...' : 'Guardar usuario'}</button></div>
        </form>
      </section>
    </div>
  );
}

function ModerationModal({ usuarioObjetivo, procesando, error, onClose, onApply }) {
  const [accion, setAccion] = useState(usuarioObjetivo.accionInicial || 'suspender');
  const [duracion, setDuracion] = useState('7');
  const [personalizada, setPersonalizada] = useState('');
  const [motivo, setMotivo] = useState('');
  const [rol, setRol] = useState(usuarioObjetivo.rol);
  const tech = usuarioObjetivo.rol === 'tecnico';

  const ejecutar = (event) => {
    event.preventDefault();
    let hasta = null;
    if (accion === 'suspender') {
      if (duracion === 'custom') {
        hasta = new Date(personalizada).toISOString();
      } else {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + Number(duracion));
        hasta = fecha.toISOString();
      }
    }
    onApply(accion, { motivo, hasta, rol });
  };

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-detail-modal admin-moderation-modal" role="dialog" aria-modal="true" aria-labelledby="moderation-title">
        <header><div><span className="section-eyebrow">Moderación de cuenta</span><h2 id="moderation-title">{usuarioObjetivo.nombre || usuarioObjetivo.correo}</h2></div><button type="button" className="icon-button" aria-label="Cerrar moderación" onClick={onClose}><X size={19} /></button></header>
        <form className="admin-moderation-form" onSubmit={ejecutar}>
          <label><span>Acción</span><select value={accion} onChange={(event) => setAccion(event.target.value)}><option value="suspender">Suspender temporalmente</option><option value="banear">Banear permanentemente</option><option value="reactivar">Reactivar cuenta</option>{tech && <><option value="aprobar">Aprobar / verificar técnico</option><option value="revocar">Revocar verificación</option></>}<option value="cambiar_rol">Cambiar rol</option></select></label>
          {accion === 'suspender' && <label><span>Duración de suspensión</span><select value={duracion} onChange={(event) => setDuracion(event.target.value)}><option value="3">3 días</option><option value="7">7 días</option><option value="30">30 días</option><option value="custom">Personalizada</option></select></label>}
          {accion === 'suspender' && duracion === 'custom' && <label><span>Fin de suspensión</span><input type="datetime-local" required value={personalizada} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setPersonalizada(event.target.value)} /></label>}
          {['suspender', 'banear'].includes(accion) && <label><span>Motivo obligatorio</span><textarea required minLength={3} maxLength={500} rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Explica el motivo de la medida." /></label>}
          {accion === 'cambiar_rol' && <label><span>Nuevo rol</span><select value={rol} onChange={(event) => setRol(event.target.value)}><option value="cliente">Cliente</option><option value="tecnico">Trabajador / Técnico</option></select></label>}
          {accion === 'reactivar' && <p className="panel-message">Se quitará la sanción vigente y la cuenta volverá a estar activa.</p>}
          {accion === 'aprobar' && <p className="panel-message">El trabajador podrá acceder a las solicitudes disponibles si su cuenta está activa.</p>}
          {error && <p role="alert" className="panel-message panel-error">{error}</p>}
          <div className="admin-modal-actions"><button type="button" className="panel-action-button" onClick={onClose}>Cancelar</button><button type="submit" className="panel-action-button panel-primary-action" disabled={procesando}>{procesando ? 'Aplicando...' : 'Confirmar acción'}</button></div>
        </form>
      </section>
    </div>
  );
}

function ModeratorsModule({ sessionToken }) {
  const [correo, setCorreo] = useState('');
  const [permisos, setPermisos] = useState({
    puede_aprobar_tecnicos: false,
    puede_gestionar_solicitudes: false,
    puede_responder_soporte: false
  });
  const [moderadores, setModeradores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const { data, error: queryError } = await supabase.rpc('admin_control_listar_moderadores', {
      p_session_token: sessionToken
    });
    if (queryError) throw queryError;
    setModeradores(data || []);
  }, [sessionToken]);

  useEffect(() => {
    let montado = true;
    const timer = window.setTimeout(() => {
      cargar()
        .catch((loadError) => { if (montado) setError(`No se pudieron cargar los moderadores: ${loadError.message}`); })
        .finally(() => { if (montado) setCargando(false); });
    }, 0);
    return () => {
      montado = false;
      window.clearTimeout(timer);
    };
  }, [cargar]);

  const guardar = async (event) => {
    event.preventDefault();
    setProcesando(true);
    setError('');
    setAviso('');
    try {
      const { error: saveError } = await supabase.rpc('admin_control_configurar_moderador', {
        p_session_token: sessionToken,
        p_correo: correo.trim(),
        p_permisos: permisos
      });
      if (saveError) throw saveError;
      setCorreo('');
      setAviso('Permisos guardados. La cuenta recibirá acceso de moderación al iniciar sesión.');
      await cargar();
    } catch (saveError) {
      setError(`No se pudieron guardar los permisos: ${saveError.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const revocar = async (moderador) => {
    setProcesando(true);
    setError('');
    setAviso('');
    try {
      const { error: revokeError } = await supabase.rpc('admin_control_revocar_moderador', {
        p_session_token: sessionToken,
        p_user_id: moderador.user_id
      });
      if (revokeError) throw revokeError;
      setAviso(`Acceso de moderación revocado para ${moderador.correo}.`);
      await cargar();
    } catch (revokeError) {
      setError(`No se pudo revocar el acceso: ${revokeError.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const opcionesPermiso = [
    ['puede_aprobar_tecnicos', 'Puede aprobar técnicos'],
    ['puede_gestionar_solicitudes', 'Puede consultar y cancelar solicitudes'],
    ['puede_responder_soporte', 'Puede responder chats de soporte']
  ];

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Acceso delegado</span><h2>Gestión de moderadores</h2><p>Los permisos se validan en cada RPC. Los moderadores no pueden acceder al CMS ni administrar cuentas o sesiones principales.</p></div><span className="admin-result-count">{moderadores.length} activos</span></div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      <form className="moderator-admin-form" onSubmit={guardar}>
        <label><span>Correo de una cuenta FixNow registrada</span><input type="email" required value={correo} onChange={(event) => setCorreo(event.target.value)} placeholder="persona@ejemplo.com" /></label>
        <div className="moderator-admin-permissions">
          {opcionesPermiso.map(([key, label]) => (
            <label className="admin-inline-check" key={key}><input type="checkbox" checked={permisos[key]} onChange={(event) => setPermisos((actual) => ({ ...actual, [key]: event.target.checked }))} /><span>{label}</span></label>
          ))}
        </div>
        <button type="submit" className="panel-action-button panel-primary-action" disabled={procesando}><UserCog size={15} />{procesando ? 'Guardando...' : 'Guardar permisos'}</button>
      </form>
      <div className="moderator-record-list">
        {cargando && <p className="admin-empty">Cargando moderadores...</p>}
        {!cargando && moderadores.length === 0 && <p className="admin-empty">Aún no hay moderadores asignados.</p>}
        {moderadores.map((moderador) => (
          <article className="moderator-record" key={moderador.user_id}>
            <span className="admin-user-avatar">{(moderador.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
            <span><strong>{moderador.nombre || moderador.correo}</strong><small>{moderador.correo}</small><small>{opcionesPermiso.filter(([key]) => moderador[key]).map(([, label]) => label.replace('Puede ', '')).join(' · ') || 'Sin permisos asignados'}</small></span>
            <button type="button" className="panel-action-button" disabled={procesando} onClick={() => revocar(moderador)}>Revocar acceso</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function SupportInbox({
  sessionToken,
  usuarioAdminId,
  usuarios,
  trabajos,
  usuarioInicial,
  onUsuarioInicialProcesado,
  onUnreadCount,
  onAbrirUsuario
}) {
  const [conversaciones, setConversaciones] = useState([]);
  const [filtroRol, setFiltroRol] = useState('todos');
  const [seleccionada, setSeleccionada] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [cuerpo, setCuerpo] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const iniciarChatRef = useRef(null);

  const cargarConversaciones = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_control_listar_conversaciones', {
      p_session_token: sessionToken,
      p_rol: filtroRol === 'todos' ? null : filtroRol
    });
    if (rpcError) throw rpcError;
    setConversaciones(data || []);
  }, [filtroRol, sessionToken]);

  const cargarMensajes = useCallback(async (conversacion = seleccionada) => {
    if (!conversacion) return;
    const { data, error: rpcError } = await supabase.rpc('admin_control_listar_mensajes', {
      p_session_token: sessionToken,
      p_conversacion_id: conversacion.conversacion_id
    });
    if (rpcError) throw rpcError;
    setMensajes(data || []);
  }, [seleccionada, sessionToken]);

  useEffect(() => {
    onUnreadCount?.(conversaciones.reduce((total, conversacion) => total + Number(conversacion.mensajes_no_leidos || 0), 0));
  }, [conversaciones, onUnreadCount]);

  useEffect(() => {
    let montado = true;
    const cargaInicial = window.setTimeout(() => {
      cargarConversaciones()
        .catch((loadError) => { if (montado) setError(`No se pudo cargar la bandeja: ${loadError.message}`); })
        .finally(() => { if (montado) setCargando(false); });
    }, 0);
    return () => {
      montado = false;
      window.clearTimeout(cargaInicial);
    };
  }, [cargarConversaciones]);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      cargarConversaciones().catch((loadError) => setError(`No se actualizó la bandeja: ${loadError.message}`));
      if (seleccionada) {
        cargarMensajes().catch((loadError) => setError(`No se actualizaron los mensajes: ${loadError.message}`));
      }
    }, 5000);
    return () => window.clearInterval(intervalo);
  }, [cargarConversaciones, cargarMensajes, seleccionada]);

  const seleccionar = useCallback(async (conversacion) => {
    setSeleccionada(conversacion);
    setMensajes([]);
    setError('');
    try {
      const { error: readError } = await supabase.rpc('admin_control_marcar_leidos', {
        p_session_token: sessionToken,
        p_conversacion_id: conversacion.conversacion_id
      });
      if (readError) throw readError;
      await cargarMensajes(conversacion);
      await cargarConversaciones();
    } catch (loadError) {
      setError(`No se pudo abrir la conversación: ${loadError.message}`);
    }
  }, [cargarConversaciones, cargarMensajes, sessionToken]);

  const iniciarChatUsuario = useCallback(async (usuarioId) => {
    const existente = conversaciones.find((item) => item.usuario_id === usuarioId);
    if (existente) {
      await seleccionar(existente);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc('admin_control_iniciar_conversacion', {
      p_session_token: sessionToken,
      p_usuario_id: usuarioId
    });
    if (rpcError) throw rpcError;
    const user = usuarios.find((item) => item.user_id === usuarioId);
    const conversacion = {
      conversacion_id: data,
      usuario_id: usuarioId,
      nombre: user?.nombre || user?.correo || 'Usuario',
      correo: user?.correo || '',
      rol: user?.rol || 'cliente',
      mensajes_no_leidos: 0
    };
    await cargarConversaciones();
    await seleccionar(conversacion);
  }, [cargarConversaciones, conversaciones, seleccionar, sessionToken, usuarios]);

  useEffect(() => {
    iniciarChatRef.current = iniciarChatUsuario;
  }, [iniciarChatUsuario]);

  useEffect(() => {
    const usuarioId = usuarioInicial?.user_id;
    if (!usuarioId) return undefined;
    let montado = true;
    const timer = window.setTimeout(() => {
      Promise.resolve(iniciarChatRef.current?.(usuarioId))
        .catch((startError) => { if (montado) setError(`No se pudo abrir el chat: ${startError.message}`); })
        .finally(() => { if (montado) onUsuarioInicialProcesado?.(null); });
    }, 0);
    return () => {
      montado = false;
      window.clearTimeout(timer);
    };
  }, [usuarioInicial?.user_id, onUsuarioInicialProcesado]);

  const iniciarConversacion = async (event) => {
    event.preventDefault();
    if (!nuevoUsuario) return;
    setError('');
    try {
      await iniciarChatUsuario(nuevoUsuario);
      setNuevoUsuario('');
    } catch (startError) {
      setError(`No se pudo iniciar el chat: ${startError.message}`);
    }
  };

  const enviar = async (event) => {
    event.preventDefault();
    const texto = cuerpo.trim();
    if (!texto || !seleccionada) return;
    setEnviando(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('admin_control_enviar_mensaje', {
        p_session_token: sessionToken,
        p_usuario_id: seleccionada.usuario_id,
        p_cuerpo: texto
      });
      if (rpcError) throw rpcError;
      setCuerpo('');
      await Promise.all([cargarMensajes(), cargarConversaciones()]);
    } catch (sendError) {
      setError(`No se pudo enviar el mensaje: ${sendError.message}`);
    } finally {
      setEnviando(false);
    }
  };
  const usuarioActual = seleccionada
    ? usuarios.find((item) => item.user_id === seleccionada.usuario_id)
    : null;
  const trabajosActivosUsuario = usuarioActual
    ? trabajos.filter((trabajo) =>
      !['completado', 'cancelado'].includes(trabajo.estado) &&
      (usuarioActual.rol === 'tecnico'
        ? trabajo.tecnico_id === usuarioActual.user_id
        : trabajo.cliente_id === usuarioActual.user_id)
    ).length
    : 0;
  const respuestasRapidas = [
    ['Solicitud recibida', 'Hola, recibimos tu mensaje. ¿En qué podemos ayudarte?'],
    ...(usuarioActual?.rol === 'tecnico' && usuarioActual.verificado
      ? [['Técnico aprobado', '¡Tu perfil de técnico ha sido aprobado! Ya puedes acceder a las solicitudes disponibles desde tu panel.']]
      : []),
    ...(usuarioActual?.rol === 'tecnico' && !usuarioActual.verificado
      ? [['Completar experiencia', '¿Podrías completar la sección de experiencia laboral de tu perfil profesional para que podamos revisarlo?']]
      : []),
    ...(trabajosActivosUsuario > 0
      ? [['Seguimiento de servicio', 'Hola, ¿cómo va tu servicio? Si necesitas apoyo, responde a este mensaje y te ayudamos.']]
      : [])
  ];

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Atención directa</span><h2>Mensajería y soporte</h2><p>Conversaciones privadas entre administración y cada cuenta.</p></div><span className="admin-live-pill"><span />Actualización cada 5 s</span></div>
      <form className="admin-new-chat" onSubmit={iniciarConversacion}>
        <label><span>Iniciar conversación</span><select value={nuevoUsuario} onChange={(event) => setNuevoUsuario(event.target.value)}><option value="">Selecciona un cliente o técnico</option>{usuarios.map((item) => <option key={item.user_id} value={item.user_id}>{item.nombre || item.correo} · {item.rol}</option>)}</select></label>
        <button type="submit" className="panel-action-button panel-primary-action" disabled={!nuevoUsuario}><MessageCircle size={15} />Abrir chat</button>
      </form>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      <div className="admin-inbox">
        <aside className="admin-inbox-list">
          <div className="admin-inbox-toolbar"><strong>Bandeja <span>{conversaciones.length}</span></strong><select aria-label="Filtrar conversaciones" value={filtroRol} onChange={(event) => setFiltroRol(event.target.value)}><option value="todos">Todos</option><option value="tecnico">Técnicos</option><option value="cliente">Clientes</option></select></div>
          {cargando && <p className="admin-empty">Cargando chats...</p>}
          {!cargando && conversaciones.length === 0 && <p className="admin-empty">Aún no hay conversaciones. Puedes iniciar una desde el selector.</p>}
          {conversaciones.map((conversacion) => (
            <button type="button" key={conversacion.conversacion_id} className={seleccionada?.conversacion_id === conversacion.conversacion_id ? 'admin-conversation active' : 'admin-conversation'} onClick={() => seleccionar(conversacion)}>
              <span className="admin-user-avatar">{(conversacion.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
              <span className="admin-conversation-copy"><strong>{conversacion.nombre}</strong><small>{conversacion.rol} · {conversacion.ultimo_mensaje || 'Conversación iniciada'}</small></span>
              {Number(conversacion.mensajes_no_leidos) > 0 && <span className="admin-unread-count">{conversacion.mensajes_no_leidos}</span>}
            </button>
          ))}
        </aside>
        <section className="admin-inbox-thread">
          {!seleccionada && <div className="admin-thread-empty"><MessageCircle size={28} /><strong>Selecciona una conversación</strong><span>Los mensajes y datos se mantienen privados por cuenta.</span></div>}
          {seleccionada && <>
            <header><span className="admin-user-avatar">{(seleccionada.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span><span><strong>{seleccionada.nombre}</strong><small>{seleccionada.correo} · {seleccionada.rol}</small></span></header>
            <div className="admin-thread-messages">
              {mensajes.map((mensaje) => (
                <article key={mensaje.id} className={mensaje.remitente_id === usuarioAdminId ? 'admin-thread-message own' : 'admin-thread-message'}>
                  <strong>{mensaje.remitente_nombre}</strong><p>{mensaje.cuerpo}</p><time>{mostrarFecha(mensaje.creado_en, true)}</time>
                </article>
              ))}
              {mensajes.length === 0 && <p className="admin-empty">Envía el primer mensaje de soporte.</p>}
            </div>
            <div className="admin-quick-replies" aria-label="Respuestas rápidas">
              {respuestasRapidas.map(([label, texto]) => <button type="button" key={label} onClick={() => setCuerpo(texto)}>{label}</button>)}
            </div>
            <form className="admin-thread-compose" onSubmit={enviar}><textarea value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} rows={2} maxLength={5000} placeholder="Responder al usuario..." required /><button type="submit" aria-label="Enviar respuesta" disabled={enviando || !cuerpo.trim()}><Send size={17} /></button></form>
          </>}
        </section>
        <aside className="admin-thread-context">
          {!seleccionada && <p className="admin-empty">La ficha contextual aparecerá al seleccionar una conversación.</p>}
          {seleccionada && (() => {
            const user = usuarioActual;
            return (
              <>
                <span className="section-eyebrow">Ficha contextual</span>
                <span className="admin-context-avatar">{(seleccionada.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
                <strong>{seleccionada.nombre}</strong>
                <span>{seleccionada.correo || 'Sin correo'}</span>
                <div className="admin-context-data"><span>Rol</span><strong>{user?.rol || seleccionada.rol}</strong></div>
                <div className="admin-context-data"><span>Estado</span><strong>{user?.estado_cuenta || 'activo'}</strong></div>
                <div className="admin-context-data"><span>Trabajos activos</span><strong>{trabajosActivosUsuario}</strong></div>
                {user && <button type="button" className="panel-action-button" onClick={() => onAbrirUsuario?.(user)}>Abrir ficha de usuario</button>}
              </>
            );
          })()}
        </aside>
      </div>
    </div>
  );
}

function SiteEditor({ usuarioId, sessionToken, initialConfig, onPublished }) {
  const [config, setConfig] = useState(() => normalizeSiteConfig(initialConfig));
  const [pestana, setPestana] = useState('marca');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cambios, setCambios] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const actualizar = (campo, valor) => {
    setConfig((actual) => ({ ...actual, [campo]: valor }));
    setCambios(true);
    setAviso('');
  };
  const subirLogo = async (event) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    setSubiendoLogo(true);
    setError('');
    setAviso('');
    try {
      const logoUrl = await subirLogoSitio(usuarioId, archivo);
      actualizar('logoUrl', logoUrl);
      setAviso('Logo cargado. Publícalo para mostrarlo en el sitio.');
    } catch (uploadError) {
      setError(`No se pudo subir el logo: ${uploadError.message}`);
    } finally {
      setSubiendoLogo(false);
    }
  };
  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_control_guardar_configuracion', {
        p_session_token: sessionToken,
        p_configuracion: config
      });
      if (rpcError) throw rpcError;
      const publicada = normalizeSiteConfig(data);
      setConfig(publicada);
      setCambios(false);
      setAviso('Cambios publicados en la página principal.');
      onPublished?.(publicada);
    } catch (saveError) {
      setError(`No se pudo publicar la configuración: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };
  const selected = new Set(config.featuredCategories);
  const categorias = [
    ['electricidad', 'Electricidad'],
    ['instalacion', 'Instalación nueva'],
    ['plomeria', 'Plomería'],
    ['reparaciones', 'Reparaciones'],
    ['cerrajeria', 'Cerrajería'],
    ['electrodomesticos', 'Electrodomésticos']
  ];

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Contenido dinámico</span><h2>Presentación de la página</h2><p>Edita y publica la identidad y los bloques de la página inicial.</p></div><span className="admin-draft-label">{cambios ? 'Borrador sin publicar' : 'Publicado'}</span></div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      <div className="admin-cms-tabs" role="tablist" aria-label="Secciones de presentación">
        {[
          ['marca', 'Marca y Hero'],
          ['titulares', 'Títulos de secciones'],
          ['banner', 'Banner de avisos'],
          ['contacto', 'Contacto y Footer'],
          ['preview', 'Vista previa rápida']
        ].map(([id, label]) => <button type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'active' : ''} key={id} onClick={() => setPestana(id)}>{label}</button>)}
      </div>
      <div className="admin-cms-layout">
        <form className="admin-cms-form" onSubmit={guardar}>
          {pestana === 'marca' && <section className="admin-cms-group"><h3><Settings size={16} />Marca y hero</h3>
            <label><span>Nombre de marca</span><input required maxLength={80} value={config.brandName} onChange={(event) => actualizar('brandName', event.target.value)} /></label>
            <label><span>Eslogan del navbar</span><input maxLength={160} value={config.tagline} onChange={(event) => actualizar('tagline', event.target.value)} /></label>
            <div className="admin-logo-editor">
              <div className="admin-logo-preview">{config.logoUrl ? <img src={config.logoUrl} alt="Vista previa del logo" /> : <Wrench size={24} />}</div>
              <div className="admin-logo-controls">
                <strong>Logo del sitio</strong>
                <small>JPG, PNG o WebP · máximo 2 MB. También puedes usar una URL HTTPS.</small>
                <label className="panel-action-button admin-logo-upload">
                  <ImagePlus size={15} />{subiendoLogo ? 'Subiendo...' : 'Subir logo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={subiendoLogo} onChange={subirLogo} />
                </label>
                {config.logoUrl && <button type="button" className="admin-text-button" onClick={() => actualizar('logoUrl', '')}>Restablecer ícono FixNow</button>}
              </div>
            </div>
            <label><span>URL del logo (opcional)</span><input type="url" maxLength={1000} value={config.logoUrl} onChange={(event) => actualizar('logoUrl', event.target.value)} placeholder="https://..." /></label>
            <label><span>Título principal</span><textarea required rows={2} maxLength={240} value={config.heroTitle} onChange={(event) => actualizar('heroTitle', event.target.value)} /></label>
            <label><span>Subtítulo</span><textarea rows={3} maxLength={1000} value={config.heroSubtitle} onChange={(event) => actualizar('heroSubtitle', event.target.value)} /></label>
            <label><span>Botón principal</span><input required maxLength={100} value={config.primaryAction} onChange={(event) => actualizar('primaryAction', event.target.value)} /></label>
            <label><span>Botón secundario</span><input maxLength={100} value={config.secondaryAction} onChange={(event) => actualizar('secondaryAction', event.target.value)} /></label>
            <label><span>Color principal</span><span className="admin-color-input"><input type="color" value={config.primaryColor} onChange={(event) => actualizar('primaryColor', event.target.value)} /><code>{config.primaryColor}</code></span></label>
            <div className="admin-cms-toggles">{[['showHowItWorks', 'Cómo funciona'], ['showTechnicians', 'Directorio de técnicos'], ['showFaq', 'Preguntas frecuentes']].map(([key, label]) => <label className="admin-inline-check" key={key}><input type="checkbox" checked={config[key]} onChange={(event) => actualizar(key, event.target.checked)} /><span>{label}</span></label>)}</div>
            <div className="admin-cms-categories">{categorias.map(([key, label]) => <label className="admin-inline-check" key={key}><input type="checkbox" checked={selected.has(key)} onChange={(event) => actualizar('featuredCategories', event.target.checked ? [...config.featuredCategories, key] : config.featuredCategories.filter((item) => item !== key))} /><span>{label}</span></label>)}</div>
          </section>}
          {pestana === 'titulares' && <section className="admin-cms-group"><h3><LayoutDashboard size={16} />Títulos de la página de inicio</h3>
            <p className="admin-cms-help">Personaliza los encabezados que verán tus visitantes en cada sección principal.</p>
            <label><span>Sección de servicios</span><input required maxLength={100} value={config.servicesTitle} onChange={(event) => actualizar('servicesTitle', event.target.value)} /></label>
            <label><span>Cómo funciona</span><input required maxLength={100} value={config.howItWorksTitle} onChange={(event) => actualizar('howItWorksTitle', event.target.value)} /></label>
            <label><span>Técnicos destacados</span><input required maxLength={100} value={config.techniciansTitle} onChange={(event) => actualizar('techniciansTitle', event.target.value)} /></label>
            <label><span>Preguntas frecuentes</span><input required maxLength={100} value={config.faqTitle} onChange={(event) => actualizar('faqTitle', event.target.value)} /></label>
          </section>}
          {pestana === 'banner' && <section className="admin-cms-group"><h3><Paintbrush size={16} />Banner de avisos</h3>
            <label className="admin-inline-check"><input type="checkbox" checked={config.bannerEnabled} onChange={(event) => actualizar('bannerEnabled', event.target.checked)} /><span>Mostrar banner promocional</span></label>
            <label><span>Texto del banner</span><input maxLength={300} value={config.bannerText} onChange={(event) => actualizar('bannerText', event.target.value)} /></label>
            <p className="admin-empty">El banner se muestra en la cabecera pública mientras esté habilitado.</p>
          </section>}
          {pestana === 'contacto' && <section className="admin-cms-group"><h3><MessageCircle size={16} />Contacto y Footer</h3>
            <label><span>Teléfono / WhatsApp oficial</span><input type="tel" maxLength={30} value={config.supportPhone} onChange={(event) => actualizar('supportPhone', event.target.value)} placeholder="3541234567" /></label>
            <label><span>Texto del footer</span><textarea rows={2} maxLength={300} value={config.footerText} onChange={(event) => actualizar('footerText', event.target.value)} /></label>
          </section>}
          <button type="submit" className="panel-action-button panel-primary-action admin-publish-button" disabled={guardando || !cambios}><Check size={16} />{guardando ? 'Publicando...' : 'Guardar y publicar cambios'}</button>
        </form>
        <aside className={`admin-live-preview${pestana === 'preview' ? ' preview-focused' : ''}`} style={{ '--brand-primary': config.primaryColor }}>
          <span className="section-eyebrow">Vista previa en vivo</span>
          {config.bannerEnabled && config.bannerText && <div className="preview-banner">{config.bannerText}</div>}
          <div className="preview-navbar">{config.logoUrl && <img className="preview-logo" src={config.logoUrl} alt="" />}<strong>{config.brandName}</strong><span>{config.tagline}</span></div>
          <div className="preview-hero"><span>FixNow para tu hogar</span><h3>{config.heroTitle}</h3><p>{config.heroSubtitle}</p><button type="button">{config.primaryAction}</button></div>
          <div className="preview-page-headings"><span>{config.servicesTitle}</span><span>{config.howItWorksTitle}</span><span>{config.techniciansTitle}</span><span>{config.faqTitle}</span></div>
          <div className="preview-section-chips">{config.featuredCategories.map((key) => <span key={key}>{categorias.find(([id]) => id === key)?.[1] || key}</span>)}</div>
          <footer>{config.footerText}{config.supportPhone && <span> · {config.supportPhone}</span>}</footer>
        </aside>
      </div>
    </div>
  );
}

function PlatformRules({ sessionToken, initialConfig, onPublished }) {
  const [config, setConfig] = useState(() => normalizeSiteConfig(initialConfig));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cambios, setCambios] = useState(false);
  const actualizar = (campo, valor) => {
    setConfig((actual) => ({ ...actual, [campo]: valor }));
    setCambios(true);
    setAviso('');
  };
  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_control_guardar_configuracion', {
        p_session_token: sessionToken,
        p_configuracion: config
      });
      if (rpcError) throw rpcError;
      const publicada = normalizeSiteConfig(data);
      setConfig(publicada);
      setCambios(false);
      setAviso('Reglas y avisos publicados para la página pública.');
      onPublished?.(publicada);
    } catch (saveError) {
      setError(`No se pudieron guardar las reglas: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro">
        <div><span className="section-eyebrow">Operación de plataforma</span><h2>Configuración y reglas</h2><p>Controla disponibilidad y avisos de servicio desde la configuración publicada del sitio.</p></div>
        <span className="admin-draft-label">{cambios ? 'Borrador sin publicar' : 'Publicado'}</span>
      </div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      <form className="admin-rules-form" onSubmit={guardar}>
        <section className="admin-rules-card">
          <div className="admin-rules-icon"><Users size={19} /></div>
          <div><h3>Solicitudes de invitados</h3><p>Permite que personas sin cuenta envíen solicitudes. Desactivarlo dirige al visitante al inicio de sesión.</p></div>
          <label className="admin-switch"><input type="checkbox" checked={config.allowGuestRequests} onChange={(event) => actualizar('allowGuestRequests', event.target.checked)} /><span /></label>
        </section>
        <section className="admin-rules-card">
          <div className="admin-rules-icon warning"><Settings size={19} /></div>
          <div className="admin-rules-copy"><h3>Modo mantenimiento</h3><p>Deshabilita nuevas solicitudes desde la web pública y muestra un mensaje a los visitantes.</p>
            <label className="admin-switch"><input type="checkbox" checked={config.maintenanceMode} onChange={(event) => actualizar('maintenanceMode', event.target.checked)} /><span /></label>
            {config.maintenanceMode && <label className="admin-rule-message"><span>Mensaje de mantenimiento</span><textarea rows={3} maxLength={300} value={config.maintenanceMessage} onChange={(event) => actualizar('maintenanceMessage', event.target.value)} required /></label>}
          </div>
        </section>
        <section className="admin-rules-card">
          <div className="admin-rules-icon"><AlertTriangle size={19} /></div>
          <div className="admin-rules-copy"><h3>Aviso de alta demanda</h3><p>Informa antes de solicitar cuando el equipo esté atendiendo un volumen elevado.</p>
            <label className="admin-switch"><input type="checkbox" checked={config.highDemandEnabled} onChange={(event) => actualizar('highDemandEnabled', event.target.checked)} /><span /></label>
            {config.highDemandEnabled && <label className="admin-rule-message"><span>Mensaje de alta demanda</span><textarea rows={3} maxLength={300} value={config.highDemandMessage} onChange={(event) => actualizar('highDemandMessage', event.target.value)} required /></label>}
          </div>
        </section>
        <div className="admin-rules-note"><ShieldCheck size={17} />Estas preferencias se guardan en la configuración JSON existente; no requieren cambios de esquema ni de políticas RLS.</div>
        <button type="submit" className="panel-action-button panel-primary-action admin-publish-button" disabled={guardando || !cambios}><Check size={16} />{guardando ? 'Guardando...' : 'Guardar y publicar reglas'}</button>
      </form>
    </div>
  );
}

function ZonesModule({ trabajos }) {
  const zonas = useMemo(() => {
    const agrupadas = new Map();
    trabajos.forEach((trabajo) => {
      const zona = trabajo.localidad?.trim() || 'Zona no especificada';
      const actual = agrupadas.get(zona) || { nombre: zona, solicitudes: 0, urgentes: 0, categorias: new Set() };
      actual.solicitudes += 1;
      actual.urgentes += ['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia) ? 1 : 0;
      if (trabajo.categoria) actual.categorias.add(trabajo.categoria);
      agrupadas.set(zona, actual);
    });
    return [...agrupadas.values()].sort((a, b) => b.solicitudes - a.solicitudes);
  }, [trabajos]);
  const totalUrgentes = trabajos.filter((trabajo) => ['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia)).length;
  const totalCategorias = new Set(trabajos.map((trabajo) => trabajo.categoria).filter(Boolean)).size;

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Cobertura operativa</span><h2>Mapa, zonas y categorías</h2><p>Distribución de solicitudes por localidad, urgencia y tipo de servicio.</p></div><span className="admin-result-count">{zonas.length} zonas</span></div>
      <div className="admin-zone-kpis">
        <Kpi icon={MapPinned} label="Zonas con actividad" value={zonas.length} caption="Localidades presentes en solicitudes" />
        <Kpi icon={AlertTriangle} label="Solicitudes urgentes" value={totalUrgentes} caption="Hoy mismo o emergencia 24/7" tone="amber" />
        <Kpi icon={Wrench} label="Categorías activas" value={totalCategorias} caption="Servicios con solicitudes registradas" tone="blue" />
      </div>
      <div className="admin-zone-grid">
        <section className="admin-zone-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Cobertura</span><h3>Solicitudes por zona</h3></div><MapPinned size={18} /></div>
          {zonas.length === 0 && <p className="admin-empty">Aún no hay localidades en solicitudes.</p>}
          {zonas.slice(0, 12).map((zona) => (
            <div className="admin-zone-row" key={zona.nombre}>
              <span><strong>{zona.nombre}</strong><small>{[...zona.categorias].slice(0, 3).join(' · ') || 'Sin categoría'}</small></span>
              <span className="admin-zone-urgent">{zona.urgentes} urgentes</span><strong>{zona.solicitudes}</strong>
            </div>
          ))}
          <p className="admin-zone-disclaimer">El esquema actual no almacena coordenadas geográficas; la cobertura se presenta por localidad y no como mapa de precisión.</p>
        </section>
        <section className="admin-zone-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Demanda</span><h3>Servicios solicitados</h3></div><ListFilter size={18} /></div>
          {CATEGORIAS.map((categoria) => {
            const cantidad = trabajos.filter((trabajo) => trabajo.categoria === categoria).length;
            const porcentaje = trabajos.length ? (cantidad / trabajos.length) * 100 : 0;
            return (
              <div className="admin-zone-category" key={categoria}>
                <div><span>{categoria.replaceAll('_', ' ')}</span><strong>{cantidad}</strong></div>
                <div className="admin-progress-track"><span style={{ width: `${porcentaje}%` }} /></div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function RewardsAdminModule({ sessionToken }) {
  const recompensaVacia = {
    id: null,
    nombre: '',
    descripcion: '',
    meta_trabajos: 10,
    premio: '',
    activa: true
  };
  const [recompensas, setRecompensas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [formulario, setFormulario] = useState(recompensaVacia);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [recompensasResult, transferenciasResult] = await Promise.all([
        supabase.rpc('admin_listar_recompensas', { p_session_token: sessionToken }),
        supabase.rpc('admin_listar_transferencias_pendientes', { p_session_token: sessionToken })
      ]);
      const fallido = [recompensasResult, transferenciasResult].find((resultado) => resultado.error);
      if (fallido?.error) throw fallido.error;
      setRecompensas(recompensasResult.data || []);
      setTransferencias(transferenciasResult.data || []);
    } catch (loadError) {
      setError(`No se pudieron cargar recompensas y saldos: ${loadError.message}`);
    } finally {
      setCargando(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    const timer = window.setTimeout(cargar, 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { error: saveError } = await supabase.rpc('admin_guardar_recompensa', {
        p_session_token: sessionToken,
        p_id: formulario.id,
        p_nombre: formulario.nombre,
        p_descripcion: formulario.descripcion,
        p_meta_trabajos: Number(formulario.meta_trabajos),
        p_premio: formulario.premio,
        p_activa: formulario.activa
      });
      if (saveError) throw saveError;
      setFormulario(recompensaVacia);
      setAviso('Recompensa publicada y acción registrada en auditoría.');
      await cargar();
    } catch (saveError) {
      setError(`No se pudo guardar la recompensa: ${saveError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (recompensa) => {
    if (!window.confirm(`¿Eliminar la recompensa "${recompensa.nombre}"?`)) return;
    setError('');
    setAviso('');
    try {
      const { error: deleteError } = await supabase.rpc('admin_eliminar_recompensa', {
        p_session_token: sessionToken,
        p_id: recompensa.id
      });
      if (deleteError) throw deleteError;
      setAviso('Recompensa eliminada y acción registrada en auditoría.');
      await cargar();
    } catch (deleteError) {
      setError(`No se pudo eliminar la recompensa: ${deleteError.message}`);
    }
  };

  const liquidar = async (transferencia) => {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { error: settleError } = await supabase.rpc('admin_liquidar_transferencia', {
        p_session_token: sessionToken,
        p_ganancia_id: transferencia.ganancia_id
      });
      if (settleError) throw settleError;
      setAviso(`Transferencia de $${Number(transferencia.monto).toLocaleString('es-MX')} marcada como liquidada y auditada.`);
      await cargar();
    } catch (settleError) {
      setError(`No se pudo liquidar la transferencia: ${settleError.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const editar = (recompensa) => {
    setFormulario({ ...recompensa });
    setAviso('');
  };

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro">
        <div><span className="section-eyebrow">Reconocimiento y pagos registrados</span><h2>Ganancias y recompensas</h2><p>Publica metas para técnicos y revisa transferencias que aún no has confirmado como liquidadas.</p></div>
        <div className="admin-module-intro-actions"><span className="admin-result-count">{recompensas.length} recompensas · {transferencias.length} saldos</span><button type="button" className="panel-action-button" onClick={cargar} disabled={cargando}><RefreshCw size={15} />Actualizar</button></div>
      </div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}
      {cargando && <p className="panel-message">Cargando recompensas y transferencias…</p>}
      <div className="admin-rewards-layout">
        <section className="admin-reward-editor admin-zone-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Programa de reconocimiento</span><h3>{formulario.id ? 'Editar recompensa' : 'Crear recompensa'}</h3></div><Gift size={18} /></div>
          <form onSubmit={guardar}>
            <label>Nombre<input required maxLength={100} value={formulario.nombre} onChange={(event) => setFormulario((actual) => ({ ...actual, nombre: event.target.value }))} placeholder="Ej. Técnico destacado" /></label>
            <label>Descripción<textarea maxLength={500} rows={3} value={formulario.descripcion} onChange={(event) => setFormulario((actual) => ({ ...actual, descripcion: event.target.value }))} placeholder="Explica cómo puede conseguirla" /></label>
            <label>Meta de trabajos completados<input required type="number" min="1" max="100000" value={formulario.meta_trabajos} onChange={(event) => setFormulario((actual) => ({ ...actual, meta_trabajos: event.target.value }))} /></label>
            <label>Premio o reconocimiento<input maxLength={120} value={formulario.premio} onChange={(event) => setFormulario((actual) => ({ ...actual, premio: event.target.value }))} placeholder="Ej. Insignia Oro o bono externo" /></label>
            <label className="admin-reward-active"><input type="checkbox" checked={formulario.activa} onChange={(event) => setFormulario((actual) => ({ ...actual, activa: event.target.checked }))} />Publicar para técnicos</label>
            <div className="admin-reward-form-actions">
              <button type="submit" className="panel-action-button panel-primary-action" disabled={guardando}><Gift size={15} />{guardando ? 'Guardando…' : formulario.id ? 'Guardar cambios' : 'Publicar recompensa'}</button>
              {formulario.id && <button type="button" className="panel-action-button" disabled={guardando} onClick={() => setFormulario(recompensaVacia)}>Cancelar edición</button>}
            </div>
          </form>
        </section>
        <section className="admin-reward-list admin-zone-card">
          <div className="admin-card-heading"><div><span className="section-eyebrow">Catálogo</span><h3>Recompensas disponibles</h3></div><Gift size={18} /></div>
          {recompensas.length === 0 && !cargando && <p className="admin-empty">Aún no has creado recompensas.</p>}
          {recompensas.map((recompensa) => (
            <article className="admin-reward-row" key={recompensa.id}>
              <span className="admin-reward-row-icon"><Gift size={17} /></span>
              <div><strong>{recompensa.nombre}</strong><small>{recompensa.meta_trabajos} trabajos · {recompensa.activa ? 'Publicada' : 'Pausada'}</small><p>{recompensa.descripcion || recompensa.premio || 'Sin descripción'}</p></div>
              <div className="admin-reward-row-actions"><button type="button" onClick={() => editar(recompensa)}>Editar</button><button type="button" className="danger" onClick={() => eliminar(recompensa)}>Eliminar</button></div>
            </article>
          ))}
        </section>
      </div>
      <section className="admin-payouts-card admin-zone-card">
        <div className="admin-card-heading"><div><span className="section-eyebrow">Saldo por liquidar</span><h3>Transferencias pendientes</h3></div><Banknote size={18} /></div>
        <p className="admin-payouts-disclaimer">Marca una transferencia como liquidada solo después de comprobarla fuera de FixNow. La plataforma no procesa movimientos bancarios.</p>
        {transferencias.length === 0 && !cargando && <p className="admin-empty">No hay transferencias pendientes.</p>}
        {transferencias.map((transferencia) => (
          <article className="admin-payout-row" key={transferencia.ganancia_id}>
            <div><strong>{transferencia.tecnico_nombre}</strong><small>{transferencia.titulo} · Folio {transferencia.folio || transferencia.trabajo_id}</small><small>{mostrarFecha(transferencia.creado_en, true)}</small></div>
            <strong>${Number(transferencia.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</strong>
            <button type="button" className="panel-action-button panel-primary-action" disabled={guardando} onClick={() => liquidar(transferencia)}>Marcar liquidada</button>
          </article>
        ))}
      </section>
    </div>
  );
}

function AuditModule({ sessionToken }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_control_listar_auditoria', {
      p_session_token: sessionToken,
      p_limite: 150
    });
    if (rpcError) throw rpcError;
    setRegistros(data || []);
  }, [sessionToken]);

  useEffect(() => {
    let montado = true;
    const cargaInicial = window.setTimeout(() => {
      cargar()
        .catch((loadError) => { if (montado) setError(`No se pudo cargar la bitácora: ${loadError.message}`); })
        .finally(() => { if (montado) setCargando(false); });
    }, 0);
    const intervalo = window.setInterval(() => cargar().catch((loadError) => setError(`No se actualizó la bitácora: ${loadError.message}`)), 15000);
    return () => { montado = false; window.clearTimeout(cargaInicial); window.clearInterval(intervalo); };
  }, [cargar]);

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Trazabilidad</span><h2>Auditoría y seguridad</h2><p>Registro de moderación, cambios de solicitudes, publicaciones y sesiones administrativas.</p></div></div>
      <div className="admin-security-status"><span className="admin-security-icon"><ShieldCheck size={21} /></span><span><strong>Sesión única activa en este dispositivo</strong><small>La sesión administrativa se valida automáticamente; las aperturas y cierres quedan en la bitácora.</small></span><span className="admin-session-light" /></div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {cargando && <p className="panel-message">Cargando bitácora...</p>}
      {!cargando && registros.length === 0 && <p className="panel-message">Todavía no hay acciones administrativas registradas.</p>}
      <div className="admin-audit-list">
        {registros.map((registro) => (
          <article key={registro.id} className="admin-audit-row">
            <span className="admin-audit-icon"><FileClock size={17} /></span>
            <div><strong>{registro.accion.replaceAll('_', ' ')}</strong><span>{registro.actor_correo || 'Sistema'} · objetivo {registro.objetivo_id || '—'}</span>{Object.keys(registro.detalles || {}).length > 0 && <small>{JSON.stringify(registro.detalles)}</small>}</div>
            <time>{mostrarFecha(registro.creado_en, true)}</time>
          </article>
        ))}
      </div>
    </div>
  );
}
