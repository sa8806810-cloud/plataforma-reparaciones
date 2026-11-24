import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  FileClock,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Paintbrush,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig } from '../lib/siteConfig';

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
  { id: 'resumen', etiqueta: 'Resumen ejecutivo', icono: LayoutDashboard },
  { id: 'solicitudes', etiqueta: 'Solicitudes', icono: Wrench },
  { id: 'usuarios', etiqueta: 'Usuarios', icono: Users },
  { id: 'soporte', etiqueta: 'Mensajería y soporte', icono: MessageCircle },
  { id: 'cms', etiqueta: 'Presentación web', icono: Paintbrush },
  { id: 'auditoria', etiqueta: 'Auditoría y seguridad', icono: FileClock }
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

  const cargarDatos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    setError('');
    try {
      const parametros = { p_session_token: sessionToken };
      const [resumenResult, trabajosResult, usuariosResult] = await Promise.all([
        supabase.rpc('admin_control_resumen', parametros),
        supabase.rpc('admin_listar_trabajos', parametros),
        supabase.rpc('admin_control_listar_usuarios', parametros)
      ]);
      const fallido = [resumenResult, trabajosResult, usuariosResult].find((resultado) => resultado.error);
      if (fallido?.error) throw fallido.error;

      setResumen(resumenResult.data?.[0] || null);
      setTrabajos(trabajosResult.data || []);
      setUsuarios(usuariosResult.data || []);
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

  const solicitudSeleccionada = trabajos.find((trabajo) => trabajo.id === modulo.solicitudId);
  const moduloActivo = typeof modulo === 'string' ? modulo : 'solicitudes';

  return (
    <section className="admin-console">
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
          <button type="button" className="panel-action-button" onClick={() => cargarDatos()} disabled={cargando}>
            <RefreshCw size={15} /> Actualizar
          </button>
          <button type="button" className="panel-action-button" onClick={onVolver}>
            <ArrowLeft size={15} /> Inicio
          </button>
        </div>
      </header>

      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {aviso && <p role="status" className="panel-message panel-success">{aviso}</p>}

      <div className="admin-console-layout">
        <aside className={sidebarAbierto ? 'admin-sidebar open' : 'admin-sidebar'}>
          <div className="admin-sidebar-brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span><strong>FixNow</strong><small>Control de plataforma</small></span></div>
          <nav aria-label="Módulos administrativos">
            {MODULOS.map(({ id, etiqueta, icono: Icon }) => (
              <button
                type="button"
                key={id}
                aria-current={moduloActivo === id ? 'page' : undefined}
                className={moduloActivo === id ? 'admin-sidebar-link active' : 'admin-sidebar-link'}
                onClick={() => {
                  setModulo(id);
                  setSidebarAbierto(false);
                  setError('');
                }}
              >
                <Icon size={17} /><span>{etiqueta}</span>
                {id === 'usuarios' && resumen?.tecnicos_pendientes > 0 && (
                  <span className="admin-sidebar-count">{resumen.tecnicos_pendientes}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="admin-sidebar-footer">
            <span className="admin-session-light" />
            <span><strong>Sesión única activa</strong><small>Este dispositivo</small></span>
          </div>
        </aside>
        {sidebarAbierto && <button className="admin-sidebar-scrim" type="button" aria-label="Cerrar navegación" onClick={() => setSidebarAbierto(false)} />}

        <main className="admin-console-main">
          {cargando && <p className="panel-message">Cargando datos de administración...</p>}
          {!cargando && moduloActivo === 'resumen' && (
            <ExecutiveSummary resumen={resumen} onIrAModulo={setModulo} />
          )}
          {!cargando && moduloActivo === 'solicitudes' && (
            <RequestsModule
              trabajos={trabajos}
              tecnicos={usuarios.filter((item) => item.rol === 'tecnico' && item.verificado && item.estado_cuenta === 'activo')}
              seleccionada={solicitudSeleccionada}
              onAbrir={(solicitud) => setModulo({ id: 'solicitudes', solicitudId: solicitud.id })}
              onCerrarDetalle={() => setModulo('solicitudes')}
              onGuardar={guardarSolicitud}
            />
          )}
          {!cargando && moduloActivo === 'usuarios' && (
            <UsersModule usuarios={usuarios} sessionToken={sessionToken} onAccion={ejecutarModeracion} />
          )}
          {moduloActivo === 'soporte' && (
            <SupportInbox sessionToken={sessionToken} usuarioAdminId={usuario.id} usuarios={usuarios} />
          )}
          {moduloActivo === 'cms' && (
            <SiteEditor
              sessionToken={sessionToken}
              initialConfig={configuracionSitio || DEFAULT_SITE_CONFIG}
              onPublished={onConfiguracionPublicada}
            />
          )}
          {moduloActivo === 'auditoria' && (
            <AuditModule sessionToken={sessionToken} />
          )}
        </main>
      </div>
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

function ExecutiveSummary({ resumen, onIrAModulo }) {
  const solicitudesActuales = Number(resumen?.solicitudes_30d || 0);
  const solicitudesPrevias = Number(resumen?.solicitudes_30d_prev || 0);
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
        <Kpi icon={CheckCircle2} label="Completadas" value={resumen?.completadas} caption="Trabajos concluidos" tone="green" />
        <Kpi icon={Users} label="Técnicos verificados" value={resumen?.tecnicos_activos} caption={`${resumen?.tecnicos_pendientes ?? 0} pendientes de revisión`} tone="violet" />
        <Kpi icon={UserRound} label="Clientes registrados" value={resumen?.clientes} caption={`${resumen?.trabajadores ?? 0} técnicos registrados`} />
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
          <div className="admin-card-heading"><div><span className="section-eyebrow">Atención requerida</span><h3>Alertas</h3></div><AlertTriangle size={18} /></div>
          <p><strong>{resumen?.tecnicos_pendientes ?? 0}</strong> técnicos esperan revisión.</p>
          <p><strong>{resumen?.pendientes ?? 0}</strong> solicitudes están pendientes de asignación.</p>
          <button type="button" className="panel-action-button panel-primary-action" onClick={() => onIrAModulo('usuarios')}>Revisar cuentas</button>
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

function RequestsModule({ trabajos, tecnicos, seleccionada, onAbrir, onCerrarDetalle, onGuardar }) {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [urgencia, setUrgencia] = useState('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [accion, setAccion] = useState('');

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
      <div className="admin-request-list">
        {filtrados.length === 0 && <p className="panel-message">No hay solicitudes que coincidan con los filtros.</p>}
        {filtrados.map((trabajo) => (
          <article className="admin-request-row" key={trabajo.id}>
            <div className="admin-request-main">
              <div className="job-badge-row"><span className="job-badge">{trabajo.categoria}</span><span className={`job-badge status-${trabajo.estado}`}>{ESTADOS[trabajo.estado] || trabajo.estado}</span><span className={`job-badge ${['hoy_mismo', 'emergencia_24_7'].includes(trabajo.detalles_tecnicos?.urgencia) ? 'job-badge-urgent' : 'job-badge-normal'}`}>{mostrarUrgencia(trabajo)}</span></div>
              <h3>{trabajo.titulo}</h3>
              <p>{trabajo.nombre_contacto || 'Cliente'} · {trabajo.telefono_contacto || 'Sin teléfono'} · {trabajo.localidad}</p>
              <small>Folio: {trabajo.detalles_tecnicos?.folio_solicitud || trabajo.id} · {mostrarFecha(trabajo.creado_en, true)}</small>
            </div>
            <button type="button" className="panel-action-button panel-primary-action" onClick={() => onAbrir(trabajo)}>Ver detalle y gestionar</button>
          </article>
        ))}
      </div>
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
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar(); }}>
      <section className="admin-detail-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header><div><span className="section-eyebrow">Folio {solicitud.detalles_tecnicos?.folio_solicitud || solicitud.id}</span><h2 id="request-detail-title">{solicitud.titulo}</h2></div><button type="button" className="icon-button" aria-label="Cerrar detalle" onClick={onCerrar}><X size={19} /></button></header>
        <div className="admin-detail-grid">
          <DetailItem label="Estado">{ESTADOS[solicitud.estado] || solicitud.estado}</DetailItem>
          <DetailItem label="Categoría">{solicitud.categoria} · {solicitud.subtipo}</DetailItem>
          <DetailItem label="Urgencia">{mostrarUrgencia(solicitud)}</DetailItem>
          <DetailItem label="Fecha de solicitud">{mostrarFecha(solicitud.creado_en, true)}</DetailItem>
          <DetailItem label="Cliente">{solicitud.nombre_contacto || '—'} · {solicitud.telefono_contacto || '—'}</DetailItem>
          <DetailItem label="Zona">{solicitud.localidad}</DetailItem>
          <DetailItem label="Dirección">{solicitud.direccion || '—'}</DetailItem>
          <DetailItem label="Referencias">{solicitud.referencias_domicilio || '—'}</DetailItem>
          <DetailItem label="Fecha solicitada">{solicitud.detalles_tecnicos?.fecha_solicitada || '—'}</DetailItem>
          <DetailItem label="Presupuesto estimado">{solicitud.detalles_tecnicos?.presupuesto_estimado || '—'}</DetailItem>
          <DetailItem label="Descripción" wide>{solicitud.descripcion || '—'}</DetailItem>
          <DetailItem label="Respuestas técnicas" wide><pre>{JSON.stringify(solicitud.detalles_tecnicos || {}, null, 2)}</pre></DetailItem>
          {solicitud.motivo_cancelacion && <DetailItem label="Motivo de cancelación" wide>{solicitud.motivo_cancelacion}</DetailItem>}
        </div>
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
  return <div className={wide ? 'admin-detail-item wide' : 'admin-detail-item'}><span>{label}</span><strong>{children}</strong></div>;
}

function UsersModule({ usuarios, sessionToken, onAccion }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [seleccionado, setSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState('');
  const [accionUsuario, setAccionUsuario] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const filtrados = useMemo(() => usuarios.filter((item) => {
    const coincideTexto = [item.nombre, item.correo, item.telefono, item.localidad, item.user_id]
      .filter(Boolean).join(' ').toLowerCase().includes(busqueda.trim().toLowerCase());
    const coincideFiltro = filtro === 'todos' ||
      (filtro === 'clientes' && item.rol === 'cliente') ||
      (filtro === 'verificados' && item.rol === 'tecnico' && item.verificado) ||
      (filtro === 'pendientes' && item.rol === 'tecnico' && !item.verificado) ||
      (filtro === 'suspendidos' && item.estado_cuenta === 'suspendido') ||
      (filtro === 'baneados' && item.estado_cuenta === 'baneado');
    return coincideTexto && coincideFiltro;
  }), [busqueda, filtro, usuarios]);

  const abrirDetalle = async (usuarioObjetivo) => {
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
  };

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

  return (
    <div className="admin-module-content">
      <div className="admin-module-intro"><div><span className="section-eyebrow">Directorio y confianza</span><h2>Gestión de usuarios</h2><p>Perfiles, experiencia, historial y moderación desde un solo lugar.</p></div><span className="admin-result-count">{filtrados.length} usuarios</span></div>
      <div className="admin-user-toolbar">
        <label className="admin-search-field"><Search size={16} /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, correo, teléfono o UUID" /></label>
        <label><span>Mostrar</span><select value={filtro} onChange={(event) => setFiltro(event.target.value)}><option value="todos">Todos</option><option value="clientes">Clientes</option><option value="verificados">Técnicos verificados</option><option value="pendientes">Técnicos pendientes</option><option value="suspendidos">Suspendidos</option><option value="baneados">Baneados</option></select></label>
      </div>
      <div className="admin-user-list">
        {filtrados.length === 0 && <p className="panel-message">No hay usuarios que coincidan con el filtro.</p>}
        {filtrados.map((item) => (
          <article key={item.user_id} className="admin-user-row">
            <span className="admin-user-avatar">{(item.nombre || 'FN').split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
            <div className="admin-user-main"><strong>{item.nombre || 'Sin nombre'}</strong><span>{item.correo} · {item.telefono || 'Sin teléfono'}</span><small>{item.rol === 'tecnico' ? item.titular || 'Técnico' : 'Cliente'} · {item.localidad || 'Zona no indicada'} · {item.trabajos_total} trabajos</small></div>
            <div className="admin-user-badges">
              <span className={`job-badge ${item.rol === 'tecnico' ? item.verificado ? 'job-badge-normal' : 'job-badge-urgent' : ''}`}>{item.rol === 'tecnico' ? item.verificado ? 'Verificado' : 'Pendiente' : 'Cliente'}</span>
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

function UserDetailModal({ user, detalle, cargando, error, onClose, onModerate }) {
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
            <div className="admin-modal-actions"><button type="button" className="panel-action-button" onClick={onClose}>Cerrar</button><button type="button" className="panel-action-button panel-primary-action" onClick={onModerate}>Moderar usuario</button></div>
          </>
        )}
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

function SupportInbox({ sessionToken, usuarioAdminId, usuarios }) {
  const [conversaciones, setConversaciones] = useState([]);
  const [filtroRol, setFiltroRol] = useState('todos');
  const [seleccionada, setSeleccionada] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [cuerpo, setCuerpo] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

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

  const seleccionar = async (conversacion) => {
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
  };

  const iniciarConversacion = async (event) => {
    event.preventDefault();
    if (!nuevoUsuario) return;
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_control_iniciar_conversacion', {
        p_session_token: sessionToken,
        p_usuario_id: nuevoUsuario
      });
      if (rpcError) throw rpcError;
      await cargarConversaciones();
      const user = usuarios.find((item) => item.user_id === nuevoUsuario);
      const conversacion = {
        conversacion_id: data,
        usuario_id: nuevoUsuario,
        nombre: user?.nombre || user?.correo || 'Usuario',
        correo: user?.correo || '',
        rol: user?.rol || 'cliente',
        mensajes_no_leidos: 0
      };
      setNuevoUsuario('');
      await seleccionar(conversacion);
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
            <form className="admin-thread-compose" onSubmit={enviar}><textarea value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} rows={2} maxLength={5000} placeholder="Responder al usuario..." required /><button type="submit" aria-label="Enviar respuesta" disabled={enviando || !cuerpo.trim()}><Send size={17} /></button></form>
          </>}
        </section>
      </div>
    </div>
  );
}

function SiteEditor({ sessionToken, initialConfig, onPublished }) {
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
      <div className="admin-cms-layout">
        <form className="admin-cms-form" onSubmit={guardar}>
          <section className="admin-cms-group"><h3><Settings size={16} />Marca y hero</h3>
            <label><span>Nombre de marca</span><input required maxLength={80} value={config.brandName} onChange={(event) => actualizar('brandName', event.target.value)} /></label>
            <label><span>Eslogan del navbar</span><input maxLength={160} value={config.tagline} onChange={(event) => actualizar('tagline', event.target.value)} /></label>
            <label><span>Título principal</span><textarea required rows={2} maxLength={240} value={config.heroTitle} onChange={(event) => actualizar('heroTitle', event.target.value)} /></label>
            <label><span>Subtítulo</span><textarea rows={3} maxLength={1000} value={config.heroSubtitle} onChange={(event) => actualizar('heroSubtitle', event.target.value)} /></label>
            <label><span>Botón principal</span><input required maxLength={100} value={config.primaryAction} onChange={(event) => actualizar('primaryAction', event.target.value)} /></label>
            <label><span>Botón secundario</span><input maxLength={100} value={config.secondaryAction} onChange={(event) => actualizar('secondaryAction', event.target.value)} /></label>
          </section>
          <section className="admin-cms-group"><h3><Paintbrush size={16} />Avisos, color y contacto</h3>
            <label className="admin-inline-check"><input type="checkbox" checked={config.bannerEnabled} onChange={(event) => actualizar('bannerEnabled', event.target.checked)} /><span>Mostrar banner promocional</span></label>
            <label><span>Texto del banner</span><input maxLength={300} value={config.bannerText} onChange={(event) => actualizar('bannerText', event.target.value)} /></label>
            <label><span>Color principal</span><span className="admin-color-input"><input type="color" value={config.primaryColor} onChange={(event) => actualizar('primaryColor', event.target.value)} /><code>{config.primaryColor}</code></span></label>
            <label><span>Teléfono / WhatsApp oficial</span><input type="tel" maxLength={30} value={config.supportPhone} onChange={(event) => actualizar('supportPhone', event.target.value)} placeholder="3541234567" /></label>
            <label><span>Texto del footer</span><textarea rows={2} maxLength={300} value={config.footerText} onChange={(event) => actualizar('footerText', event.target.value)} /></label>
          </section>
          <section className="admin-cms-group"><h3>Secciones y categorías</h3>
            <div className="admin-cms-toggles">{[['showHowItWorks', 'Cómo funciona'], ['showTechnicians', 'Directorio de técnicos'], ['showFaq', 'Preguntas frecuentes']].map(([key, label]) => <label className="admin-inline-check" key={key}><input type="checkbox" checked={config[key]} onChange={(event) => actualizar(key, event.target.checked)} /><span>{label}</span></label>)}</div>
            <div className="admin-cms-categories">{categorias.map(([key, label]) => <label className="admin-inline-check" key={key}><input type="checkbox" checked={selected.has(key)} onChange={(event) => actualizar('featuredCategories', event.target.checked ? [...config.featuredCategories, key] : config.featuredCategories.filter((item) => item !== key))} /><span>{label}</span></label>)}</div>
          </section>
          <button type="submit" className="panel-action-button panel-primary-action admin-publish-button" disabled={guardando || !cambios}><Check size={16} />{guardando ? 'Publicando...' : 'Guardar y publicar cambios'}</button>
        </form>
        <aside className="admin-live-preview" style={{ '--brand-primary': config.primaryColor }}>
          <span className="section-eyebrow">Vista previa en vivo</span>
          {config.bannerEnabled && config.bannerText && <div className="preview-banner">{config.bannerText}</div>}
          <div className="preview-navbar"><strong>{config.brandName}</strong><span>{config.tagline}</span></div>
          <div className="preview-hero"><span>FixNow para tu hogar</span><h3>{config.heroTitle}</h3><p>{config.heroSubtitle}</p><button type="button">{config.primaryAction}</button></div>
          <div className="preview-section-chips">{config.featuredCategories.map((key) => <span key={key}>{categorias.find(([id]) => id === key)?.[1] || key}</span>)}</div>
          <footer>{config.footerText}{config.supportPhone && <span> · {config.supportPhone}</span>}</footer>
        </aside>
      </div>
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
