import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Wrench,
  AlertTriangle,
  BadgeCheck,
  UserCheck,
  LogOut,
  Zap,
  Droplets,
  Plug,
  Hammer,
  Sparkles,
  KeyRound,
  Refrigerator,
  ShieldCheck,
  Clock3,
  CircleCheck,
  LayoutDashboard,
  Menu,
  X,
  Fan,
  House,
  Search,
  ArrowRight,
  Star,
  UserRound
} from 'lucide-react';
import './App.css';
import { supabase } from './lib/supabaseClient';
import { formatSupabaseError } from './lib/formatSupabaseError';
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig } from './lib/siteConfig';

const SolicitarReparacion = lazy(() => import('./components/SolicitarReparacion'));
const AuthPortal = lazy(() => import('./components/AuthPortal'));
const TrabajosTecnico = lazy(() => import('./components/TrabajosTecnico'));
const MisSolicitudes = lazy(() => import('./components/MisSolicitudes'));
const PanelAdministrador = lazy(() => import('./components/AdminControlCenter'));
const PanelModerador = lazy(() => import('./components/ModeratorPanel'));
const DirectorioTecnicos = lazy(() => import('./components/DirectorioTecnicos'));
const PerfilTrabajador = lazy(() => import('./components/PerfilTrabajador'));
const SupportChat = lazy(() => import('./components/SupportChat'));

const SERVICIOS_DESTACADOS = [
  {
    titulo: 'Electricidad',
    detalle: 'Cortos, apagones, pastillas y cableado',
    icono: Zap,
    categoria: 'electricidad',
    subtipo: 'falla_general',
    acento: '#60a5fa',
    fondoIcono: 'rgba(59, 130, 246, 0.16)',
    bordeIcono: 'rgba(96, 165, 250, 0.35)'
  },
  {
    titulo: 'Instalación nueva',
    detalle: 'Luz o toma desde cero en hogar o terreno',
    icono: Plug,
    categoria: 'electricidad',
    subtipo: 'instalacion_sin_toma',
    acento: '#fbbf24',
    fondoIcono: 'rgba(251, 191, 36, 0.15)',
    bordeIcono: 'rgba(251, 191, 36, 0.35)'
  },
  {
    titulo: 'Plomería',
    detalle: 'Fugas, tuberías, llaves, tinacos y drenaje',
    icono: Droplets,
    categoria: 'plomeria',
    subtipo: 'fuga_tuberia',
    acento: '#38bdf8',
    fondoIcono: 'rgba(56, 189, 248, 0.15)',
    bordeIcono: 'rgba(56, 189, 248, 0.35)'
  },
  {
    titulo: 'Reparaciones',
    detalle: 'Ajustes, montajes y mejoras del hogar',
    icono: Hammer,
    categoria: 'reparaciones',
    subtipo: 'reparacion_general',
    acento: '#34d399',
    fondoIcono: 'rgba(52, 211, 153, 0.15)',
    bordeIcono: 'rgba(52, 211, 153, 0.35)'
  },
  {
    titulo: 'Cerrajería',
    detalle: 'Chapas, cerraduras y accesos',
    icono: KeyRound,
    categoria: 'cerrajeria',
    subtipo: 'cerradura',
    acento: '#c4b5fd',
    fondoIcono: 'rgba(167, 139, 250, 0.15)',
    bordeIcono: 'rgba(196, 181, 253, 0.35)'
  },
  {
    titulo: 'Electrodomésticos',
    detalle: 'Diagnóstico y reparación en casa',
    icono: Refrigerator,
    categoria: 'electrodomesticos',
    subtipo: 'diagnostico',
    acento: '#fb923c',
    fondoIcono: 'rgba(251, 146, 60, 0.15)',
    bordeIcono: 'rgba(251, 146, 60, 0.35)'
  },
  {
    titulo: 'Aire acondicionado',
    detalle: 'Instalación, limpieza y diagnóstico de equipos',
    icono: Fan,
    categoria: 'electrodomesticos',
    subtipo: 'diagnostico',
    acento: '#0ea5e9',
    fondoIcono: 'rgba(14, 165, 233, 0.12)',
    bordeIcono: 'rgba(14, 165, 233, 0.28)'
  },
  {
    titulo: 'Mantenimiento del hogar',
    detalle: 'Ajustes, montaje y mantenimiento preventivo',
    icono: House,
    categoria: 'reparaciones',
    subtipo: 'reparacion_general',
    acento: '#10b981',
    fondoIcono: 'rgba(16, 185, 129, 0.12)',
    bordeIcono: 'rgba(16, 185, 129, 0.28)'
  }
];

export default function App() {
  const [vista, setVista] = useState('inicio');
  const [seleccionServicio, setSeleccionServicio] = useState(null);
  const [servicioRapido, setServicioRapido] = useState('');
  const [filtroServicios, setFiltroServicios] = useState('');
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [audienciaPasos, setAudienciaPasos] = useState('cliente');
  const [perfilTecnicoId, setPerfilTecnicoId] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState({
    usuarioId: null,
    rol: '',
    nombre: '',
    estadoCuenta: 'activo',
    suspensionHasta: null,
    motivoSancion: '',
    errorEstadoCuenta: '',
    error: ''
  });
  const [configuracionSitio, setConfiguracionSitio] = useState(DEFAULT_SITE_CONFIG);
  const [errorConfiguracion, setErrorConfiguracion] = useState('');
  const [avisoSesion, setAvisoSesion] = useState('');
  const [adminAccess, setAdminAccess] = useState({
    usuarioId: null,
    isAdmin: false,
    checking: false,
    token: null,
    error: ''
  });
  const [moderatorAccess, setModeratorAccess] = useState({
    usuarioId: null,
    permisos: null,
    checking: false,
    error: ''
  });
  const cerrandoPorConflicto = useRef(false);
  const inicioAdminEnCurso = useRef({ usuarioId: null, promesa: null });
  const destinoNavegacion = useRef(null);
  const [estadoAprobacion, setEstadoAprobacion] = useState({
    usuarioId: null,
    aprobado: false,
    error: ''
  });

  useEffect(() => {
    const cargarSesion = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSesion(data?.session || null);
    };

    cargarSesion().catch((error) => {
      setAvisoSesion(`No se pudo recuperar la sesión: ${error.message}`);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSesion(nuevaSesion || null);
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const usuario = sesion?.user || null;
  const usuarioId = usuario?.id || null;
  const rolUsuario = perfilUsuario.usuarioId === usuarioId ? perfilUsuario.rol : '';
  const tecnicoSolicitante = rolUsuario === 'tecnico';
  const esModerador = rolUsuario === 'moderador';

  useEffect(() => {
    if (!usuarioId) return undefined;
    let montado = true;
    const cargarPerfil = async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('rol, nombre')
        .eq('user_id', usuarioId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se encontró el perfil de esta cuenta.');

      if (!montado) return;
      setPerfilUsuario({
        usuarioId,
        rol: data.rol || '',
        nombre: data.nombre || '',
        estadoCuenta: 'activo',
        suspensionHasta: null,
        motivoSancion: '',
        errorEstadoCuenta: '',
        error: ''
      });
    };

    cargarPerfil().catch((error) => {
      if (montado) {
        setPerfilUsuario({
          usuarioId,
          rol: '',
          nombre: '',
          estadoCuenta: 'activo',
          suspensionHasta: null,
          motivoSancion: '',
          errorEstadoCuenta: '',
          error: formatSupabaseError(error)
        });
      }
    });

    return () => {
      montado = false;
    };
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId || perfilUsuario.usuarioId !== usuarioId) return undefined;
    let montado = true;
    const cargarEstadoCuenta = async () => {
      const { data, error } = await supabase.rpc('mi_estado_cuenta');
      if (error) throw error;
      const estado = data?.[0] || {};
      if (!montado) return;
      setPerfilUsuario((actual) => actual.usuarioId === usuarioId
        ? {
            ...actual,
            estadoCuenta: estado.estado_cuenta || 'activo',
            suspensionHasta: estado.suspension_hasta || null,
            motivoSancion: estado.motivo_sancion || '',
            errorEstadoCuenta: ''
          }
        : actual
      );
    };
    const revisar = () => {
      cargarEstadoCuenta().catch((error) => {
        if (montado) {
          setPerfilUsuario((actual) => actual.usuarioId === usuarioId
            ? { ...actual, errorEstadoCuenta: formatSupabaseError(error) }
            : actual
          );
        }
      });
    };
    revisar();
    const intervalo = window.setInterval(revisar, 10000);
    return () => {
      montado = false;
      window.clearInterval(intervalo);
    };
  }, [perfilUsuario.usuarioId, usuarioId]);

  useEffect(() => {
    let montado = true;
    supabase
      .from('configuracion_sitio')
      .select('configuracion')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!montado) return;
        if (error) throw error;
        if (data?.configuracion) setConfiguracionSitio(normalizeSiteConfig(data.configuracion));
      })
      .catch((error) => {
        if (montado) setErrorConfiguracion(formatSupabaseError(error));
      });
    return () => { montado = false; };
  }, []);

  useEffect(() => {
    if (!usuarioId || !tecnicoSolicitante) {
      setEstadoAprobacion({ usuarioId: null, aprobado: false, error: '' });
      return undefined;
    }

    let montado = true;
    supabase
      .rpc('es_tecnico_aprobado')
      .then(({ data, error }) => {
        if (!montado) return;
        setEstadoAprobacion({
        usuarioId,
          aprobado: !error && data === true,
          error: error?.message || ''
        });
      })
      .catch((error) => {
        if (!montado) return;
        setEstadoAprobacion({
          usuarioId,
          aprobado: false,
          error: error.message
        });
      });

    return () => {
      montado = false;
    };
  }, [usuarioId, tecnicoSolicitante]);

  useEffect(() => {
    if (!usuarioId || !esModerador) {
      setModeratorAccess({ usuarioId: null, permisos: null, checking: false, error: '' });
      return undefined;
    }

    let montado = true;
    setModeratorAccess({ usuarioId, permisos: null, checking: true, error: '' });
    supabase.rpc('moderador_mis_permisos')
      .then(({ data, error }) => {
        if (!montado) return;
        if (error) throw error;
        setModeratorAccess({ usuarioId, permisos: data, checking: false, error: '' });
        setVista('moderador');
      })
      .catch((error) => {
        if (montado) {
          setModeratorAccess({ usuarioId, permisos: null, checking: false, error: error.message });
        }
      });

    return () => { montado = false; };
  }, [esModerador, usuarioId]);

  useEffect(() => {
    if (!usuarioId) {
      inicioAdminEnCurso.current = { usuarioId: null, promesa: null };
      setAdminAccess({
        usuarioId: null,
        isAdmin: false,
        checking: false,
        token: null,
        error: ''
      });
      return undefined;
    }

    let montado = true;
    setAdminAccess({
      usuarioId,
      isAdmin: false,
      checking: true,
      token: null,
      error: ''
    });

    const crearSesionAdmin = async () => {
      const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_administrador');
      if (errorAdmin) throw errorAdmin;
      if (!esAdmin) return { isAdmin: false, token: null };

      const { data: token, error: errorSesion } = await supabase.rpc('admin_iniciar_sesion');
      if (errorSesion) throw errorSesion;
      if (typeof token !== 'string' || !token) {
        throw new Error('Supabase no devolvió un token válido para la sesión administrativa.');
      }

      return { isAdmin: true, token };
    };

    if (inicioAdminEnCurso.current.usuarioId !== usuarioId) {
      inicioAdminEnCurso.current = {
        usuarioId,
        promesa: crearSesionAdmin()
      };
    }

    inicioAdminEnCurso.current.promesa
      .then(({ isAdmin, token }) => {
        if (!montado) return;
        if (isAdmin) {
          cerrandoPorConflicto.current = false;
        }
        setAdminAccess({
          usuarioId,
          isAdmin,
          checking: false,
          token: token || null,
          error: ''
        });
        if (isAdmin) setVista('admin');
      })
      .catch((error) => {
        if (!montado) return;
        setAdminAccess({
          usuarioId,
          isAdmin: false,
          checking: false,
          token: null,
          error: error.message
        });
      });

    return () => {
      montado = false;
    };
  }, [usuarioId]);

  useEffect(() => {
    if (!adminAccess.isAdmin || !adminAccess.token || !usuarioId) return undefined;
    let validando = false;
    let montado = true;

    const cerrarSesionDesplazada = async (mensaje) => {
      if (cerrandoPorConflicto.current) return;
      cerrandoPorConflicto.current = true;
      setAdminAccess({
        usuarioId,
        isAdmin: false,
        checking: false,
        token: null,
        error: ''
      });
      setAvisoSesion(mensaje);
      setVista('auth-admin');
      await supabase.auth.signOut();
    };

    const validarSesion = async () => {
      if (validando || !montado) return;
      validando = true;
      try {
        const { data: vigente, error } = await supabase.rpc('admin_validar_sesion', {
          p_session_token: adminAccess.token
        });
        if (error) throw error;
        if (vigente !== true) {
          const { data: sigueSiendoAdmin, error: errorAdmin } = await supabase.rpc('es_administrador');
          if (errorAdmin) throw errorAdmin;
          await cerrarSesionDesplazada(
            sigueSiendoAdmin
              ? 'Sesión iniciada en otro dispositivo. Por seguridad, esta sesión administrativa se cerró.'
              : 'El acceso administrativo fue revocado. Esta sesión se cerró.'
          );
        }
      } catch (error) {
        if (montado) {
          setAdminAccess((actual) => ({
            ...actual,
            error: `No se pudo validar la sesión administrativa: ${error.message}`
          }));
        }
      } finally {
        validando = false;
      }
    };

    const intervalo = window.setInterval(validarSesion, 5000);
    const alVolver = () => {
      if (document.visibilityState === 'visible') validarSesion();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      montado = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [adminAccess.isAdmin, adminAccess.token, usuarioId]);

  useEffect(() => {
    if (vista !== 'inicio' || !destinoNavegacion.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(destinoNavegacion.current)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      destinoNavegacion.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [vista]);

  const handleCerrarSesion = async () => {
    setAvisoSesion('');
    try {
      let errorCierreAdmin = null;
      if (adminAccess.token) {
        const { error } = await supabase.rpc('admin_cerrar_sesion', {
          p_session_token: adminAccess.token
        });
        errorCierreAdmin = error;
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSesion(null);
      setVista('inicio');
      if (errorCierreAdmin) {
        setAvisoSesion(`Se cerró la sesión, pero no se pudo liberar el token administrativo: ${errorCierreAdmin.message}`);
      }
    } catch (error) {
      setAvisoSesion(`No se pudo cerrar la sesión: ${error.message}`);
    }
  };

  const nombreUsuario = perfilUsuario.usuarioId === usuarioId
    ? perfilUsuario.nombre || usuario?.email || ''
    : usuario?.email || '';
  const esAdminActivo = adminAccess.usuarioId === usuarioId && adminAccess.isAdmin;
  const tecnicoAprobado =
    tecnicoSolicitante &&
    estadoAprobacion.usuarioId === usuario?.id &&
    estadoAprobacion.aprobado;
  const cuentaRestringida = Boolean(
    usuario &&
    perfilUsuario.usuarioId === usuarioId &&
    (perfilUsuario.estadoCuenta !== 'activo' || perfilUsuario.errorEstadoCuenta) &&
    !esAdminActivo
  );
  const configurarPublicacion = (configuracion) => {
    setConfiguracionSitio(normalizeSiteConfig(configuracion));
    setErrorConfiguracion('');
  };

  const navegarA = (id) => (evento) => {
    evento.preventDefault();
    setMenuMovilAbierto(false);
    if (vista === 'inicio') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    destinoNavegacion.current = id;
    setVista('inicio');
  };

  const solicitarServicio = (servicio = null) => {
    if (configuracionSitio.maintenanceMode) {
      setAvisoSesion(configuracionSitio.maintenanceMessage || 'Estamos realizando mejoras. Vuelve a intentarlo en unos minutos.');
      return;
    }
    if (!usuario && !configuracionSitio.allowGuestRequests) {
      setAvisoSesion('Por el momento, inicia sesión o crea una cuenta para solicitar un servicio.');
      setVista('auth');
      return;
    }
    setSeleccionServicio(servicio ? { ...servicio } : null);
    setMenuMovilAbierto(false);
    setVista('solicitar');
  };

  const solicitarConTecnico = (tecnico, fecha, hora, localidad) => {
    const categoriaPorEspecialidad = {
      Electricidad: 'electricidad',
      Plomería: 'plomeria',
      Cerrajería: 'cerrajeria',
      Electrodomésticos: 'electrodomesticos',
      Instalación: 'electricidad',
      Reparaciones: 'reparaciones',
      Mantenimiento: 'reparaciones'
    };
    const especialidad = (tecnico.habilidades || []).find((item) => categoriaPorEspecialidad[item]);
    solicitarServicio({
      categoria: categoriaPorEspecialidad[especialidad] || 'reparaciones',
      fecha,
      hora,
      localidad,
      tecnicoId: tecnico.user_id,
      tecnicoNombre: tecnico.nombre
    });
  };

  return (
    <div
      className={`app-shell${vista === 'inicio' ? ' landing-theme' : ''}${vista === 'solicitar' ? ' request-theme' : ''}${vista === 'admin' ? ' admin-shell' : ''}${vista === 'moderador' ? ' moderator-shell' : ''}`}
      style={{
        '--brand-primary': configuracionSitio.primaryColor,
        minHeight: '100vh',
        background: vista === 'inicio'
          ? 'linear-gradient(180deg, #f8fafc 0%, #ffffff 48%, #f8fafc 100%)'
          : 'radial-gradient(circle at 50% -10%, #17284a 0%, #0b1120 48%, #060911 100%)',
        color: vista === 'inicio' ? '#0f172a' : '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: ['admin', 'moderador'].includes(vista) ? '0' : 'clamp(12px, 3vw, 24px) clamp(12px, 3vw, 18px) 40px clamp(12px, 3vw, 18px)',
        boxSizing: 'border-box'
      }}
    >
      {!['admin', 'moderador'].includes(vista) && <header className="app-navbar">
        {configuracionSitio.bannerEnabled && configuracionSitio.bannerText && (
          <div className="site-promo-banner"><Sparkles size={15} />{configuracionSitio.bannerText}</div>
        )}
        <div className="navbar-inner">
          <button
            className="brand-lockup"
            type="button"
            onClick={navegarA('inicio')}
            aria-label={`${configuracionSitio.brandName}, volver al inicio`}
          >
            <span className="brand-mark">{configuracionSitio.logoUrl
              ? <img src={configuracionSitio.logoUrl} alt="" />
              : <Wrench size={20} />}</span>
            <span>
              <span className="brand-name">{configuracionSitio.brandName}</span>
              <span className="brand-subtitle">{configuracionSitio.tagline}</span>
            </span>
          </button>

          <nav className={`nav-links${menuMovilAbierto ? ' mobile-open' : ''}`} aria-label="Navegación principal">
            <a href="#servicios" onClick={navegarA('servicios')}>Servicios</a>
            {configuracionSitio.showHowItWorks && <a href="#como-funciona" onClick={navegarA('como-funciona')}>Cómo funciona</a>}
            {configuracionSitio.showTechnicians && <a href="#tecnicos" onClick={navegarA('tecnicos')}>Técnicos verificados</a>}
            {configuracionSitio.showFaq && <a href="#preguntas" onClick={navegarA('preguntas')}>Preguntas frecuentes</a>}
          </nav>

          <div className="nav-actions">
            {usuario ? (
              <>
                <span className="nav-user-label">
                  {nombreUsuario}
                  {esAdminActivo
                    ? ' · Administrador'
                    : esModerador
                      ? ' · Moderador'
                    : cuentaRestringida
                      ? ` · Cuenta ${perfilUsuario.estadoCuenta}`
                      : tecnicoAprobado
                        ? ' · Técnico aprobado'
                        : rolUsuario === 'tecnico'
                          ? ' · Técnico pendiente de aprobación'
                          : rolUsuario
                            ? ` · ${rolUsuario}`
                            : ''}
                </span>
                {adminAccess.checking || perfilUsuario.usuarioId !== usuarioId ? (
                  <span className="nav-user-label">Verificando cuenta…</span>
                ) : esModerador && moderatorAccess.checking ? (
                  <span className="nav-user-label">Verificando permisos…</span>
                ) : (
                  <button
                    type="button"
                    className="panel-nav-button"
                    onClick={() => setVista(cuentaRestringida ? 'cuenta-bloqueada' : esAdminActivo ? 'admin' : esModerador ? 'moderador' : rolUsuario === 'tecnico' ? 'tecnico' : 'cliente')}
                  >
                    <LayoutDashboard size={15} />Mi Panel
                  </button>
                )}
                <button type="button" className="nav-logout-button" onClick={handleCerrarSesion}>
                  <LogOut size={15} /><span>Salir</span>
                </button>
              </>
            ) : (
              <button className="nav-login-button" type="button" onClick={() => setVista('auth')}>
                <UserCheck size={16} /><span>Iniciar sesión</span>
              </button>
            )}
            <button type="button" className="nav-service-button" onClick={() => solicitarServicio()}>
              Pedir servicio<ArrowRight size={16} />
            </button>
          </div>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuMovilAbierto}
            onClick={() => setMenuMovilAbierto((abierto) => !abierto)}
          >
            {menuMovilAbierto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>}

      <main className="app-main">
        {errorConfiguracion && vista === 'inicio' && (
          <p role="status" className="site-config-fallback">
            No se pudo cargar la presentación guardada; mostramos el contenido predeterminado.
          </p>
        )}
        {avisoSesion && (
          <p
            role="alert"
            style={{
              margin: '0 0 16px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #ef4444',
              background: '#450a0a',
              color: '#fecaca'
            }}
          >
            {avisoSesion}
          </p>
        )}
        {adminAccess.error && usuario && (
          <p role="alert" className="panel-message panel-error">
            No se pudo validar el acceso administrativo: {adminAccess.error}
          </p>
        )}
        {perfilUsuario.usuarioId === usuarioId && perfilUsuario.error && (
          <p role="alert" className="panel-message panel-error">
            No se pudo cargar el perfil de la cuenta: {perfilUsuario.error}
          </p>
        )}
        {perfilUsuario.usuarioId === usuarioId && perfilUsuario.errorEstadoCuenta && (
          <p role="status" className="panel-message">
            No se pudo comprobar si la cuenta tiene restricciones. La consulta de estado requiere la migración del centro de control.
          </p>
        )}
        {cuentaRestringida && (
          <section className="account-restriction-panel" role="alert">
            <span className="account-restriction-icon"><ShieldCheck size={24} /></span>
            <span className="section-eyebrow">Acceso limitado</span>
            <h2>{perfilUsuario.errorEstadoCuenta
              ? 'No se pudo verificar el estado de la cuenta'
              : perfilUsuario.estadoCuenta === 'baneado'
                ? 'Cuenta baneada'
                : 'Cuenta suspendida temporalmente'}</h2>
            {perfilUsuario.errorEstadoCuenta && <p>Por seguridad, las acciones de cuenta están pausadas. Vuelve a intentarlo en unos segundos.</p>}
            {perfilUsuario.motivoSancion && <p><strong>Motivo:</strong> {perfilUsuario.motivoSancion}</p>}
            {perfilUsuario.suspensionHasta && <p>La suspensión termina: <strong>{new Date(perfilUsuario.suspensionHasta).toLocaleString('es-MX')}</strong></p>}
            {!perfilUsuario.errorEstadoCuenta && <p>No puedes enviar solicitudes ni aceptar trabajos mientras esta medida esté activa.</p>}
            <p>Puedes usar el chat de soporte para solicitar ayuda.</p>
          </section>
        )}
        {tecnicoSolicitante &&
          estadoAprobacion.usuarioId === usuario?.id &&
          estadoAprobacion.error && (
            <p
              role="alert"
              style={{
                margin: '0 0 16px',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #ef4444',
                background: '#450a0a',
                color: '#fecaca'
              }}
            >
              No se pudo verificar la aprobación de técnico: {estadoAprobacion.error}
            </p>
          )}

        {vista === 'inicio' && (
          <section className="home-content" id="inicio">
            {(configuracionSitio.maintenanceMode || configuracionSitio.highDemandEnabled) && (
              <div className={configuracionSitio.maintenanceMode ? 'site-operational-banner maintenance' : 'site-operational-banner'} role="status">
                <AlertTriangle size={16} />
                <span>{configuracionSitio.maintenanceMode
                  ? configuracionSitio.maintenanceMessage
                  : configuracionSitio.highDemandMessage}</span>
              </div>
            )}
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-kicker"><span className="status-pulse" />Asistencia rápida y técnicos verificados en tu zona</span>
                <h1>{configuracionSitio.heroTitle}</h1>
                <p>{configuracionSitio.heroSubtitle}</p>
                <div className="hero-quick-action">
                  <label className="quick-service-select">
                    <Wrench size={17} />
                    <select value={servicioRapido} onChange={(event) => setServicioRapido(event.target.value)} aria-label="Selecciona un servicio">
                      <option value="">¿Qué servicio necesitas?</option>
                      {SERVICIOS_DESTACADOS.map((item) => <option key={item.titulo} value={item.titulo}>{item.titulo}</option>)}
                    </select>
                  </label>
                  <button
                    className="hero-primary-button"
                    type="button"
                    onClick={() => solicitarServicio(SERVICIOS_DESTACADOS.find((item) => item.titulo === servicioRapido) || null)}
                  >
                    {configuracionSitio.primaryAction}<ArrowRight size={18} />
                  </button>
                </div>
                <div className="hero-secondary-row">
                  <span>¿Eres técnico?</span>
                  <button type="button" className="text-action" onClick={() => setVista('auth')}>
                    {configuracionSitio.secondaryAction}<ArrowRight size={15} />
                  </button>
                </div>
                <div className="trust-row" aria-label="Beneficios">
                  <span className="trust-item"><ShieldCheck size={17} />Técnicos verificados</span>
                  <span className="trust-item"><Clock3 size={17} />Respuesta en minutos</span>
                  <span className="trust-item"><CircleCheck size={17} />Sin registro obligatorio</span>
                </div>
              </div>
              <div className="hero-visual" aria-label="Ejemplo de seguimiento de una solicitud">
                <div className="visual-orbit orbit-one" />
                <div className="visual-orbit orbit-two" />
                <div className="visual-main-card">
                  <div className="visual-card-top"><span className="visual-live-dot" />Vista de ejemplo <span>Ahora</span></div>
                  <div className="visual-service-line"><span className="visual-icon"><Zap size={21} /></span><div><strong>Reparación eléctrica</strong><small>Falla en instalación · Zona centro</small></div></div>
                  <div className="visual-progress"><span /><span /><span /></div>
                  <div className="visual-technician">
                    <div className="visual-avatar"><UserRound size={20} /></div>
                    <div><strong>Técnico verificado</strong><small><Star size={12} fill="currentColor" /> 4.9 · En camino</small></div>
                    <BadgeCheck size={19} />
                  </div>
                </div>
                <div className="visual-float visual-float-top"><ShieldCheck size={17} /><span><strong>Perfiles verificados</strong><small>Atención confiable</small></span></div>
                <div className="visual-float visual-float-bottom"><Clock3 size={17} /><span><strong>Respuesta rápida</strong><small>Coordina directamente</small></span></div>
              </div>
            </section>

            <section className="services-section" id="servicios">
              <div className="section-heading">
                <span className="section-eyebrow">Soluciones para tu hogar</span>
                <h2>{configuracionSitio.servicesTitle}</h2>
                <p>Encuentra el servicio adecuado y solicita ayuda en unos pocos pasos.</p>
              </div>
              <label className="service-search">
                <Search size={18} />
                <input value={filtroServicios} onChange={(event) => setFiltroServicios(event.target.value)} placeholder="Buscar electricidad, plomería..." />
              </label>
              <div className="service-grid">
                {SERVICIOS_DESTACADOS.filter((item) =>
                  configuracionSitio.featuredCategories.includes(item.subtipo === 'instalacion_sin_toma' ? 'instalacion' : item.categoria) &&
                  `${item.titulo} ${item.detalle}`.toLowerCase().includes(filtroServicios.trim().toLowerCase())
                ).map((item) => {
                  const Icono = item.icono;
                  return (
                    <button className="service-card" key={item.titulo} type="button" onClick={() => solicitarServicio(item)} aria-label={`Solicitar servicio de ${item.titulo}`}>
                      <span className="service-icon" style={{ background: item.fondoIcono, borderColor: item.bordeIcono }}><Icono size={20} color={item.acento} /></span>
                      <strong>{item.titulo}</strong>
                      <span>{item.detalle}</span>
                      <span className="service-card-action">Solicitar <ArrowRight size={15} /></span>
                    </button>
                  );
                })}
                {SERVICIOS_DESTACADOS.filter((item) =>
                  configuracionSitio.featuredCategories.includes(item.subtipo === 'instalacion_sin_toma' ? 'instalacion' : item.categoria) &&
                  `${item.titulo} ${item.detalle}`.toLowerCase().includes(filtroServicios.trim().toLowerCase())
                ).length === 0 && <p className="service-empty">No encontramos servicios para “{filtroServicios}”. Prueba con otra búsqueda.</p>}
              </div>
            </section>

            {configuracionSitio.showHowItWorks && <section className="how-section" id="como-funciona">
              <div className="section-heading">
                <span className="section-eyebrow">Simple y transparente</span>
                <h2>{configuracionSitio.howItWorksTitle}</h2>
                <p>Una experiencia sencilla, tanto si necesitas ayuda como si ofreces tus servicios.</p>
              </div>
              <div className="audience-tabs" role="tablist" aria-label="Cómo funciona">
                <button type="button" role="tab" aria-selected={audienciaPasos === 'cliente'} className={audienciaPasos === 'cliente' ? 'active' : ''} onClick={() => setAudienciaPasos('cliente')}>Necesito un servicio</button>
                <button type="button" role="tab" aria-selected={audienciaPasos === 'tecnico'} className={audienciaPasos === 'tecnico' ? 'active' : ''} onClick={() => setAudienciaPasos('tecnico')}>Soy técnico / trabajador</button>
              </div>
              <div className="steps-grid">
                {(audienciaPasos === 'cliente'
                  ? [
                    ['01', 'Describe tu necesidad', 'Cuéntanos qué sucede y comparte tu zona, sin necesidad de registrarte.'],
                    ['02', 'Un técnico acepta tu solicitud', 'Un profesional verificado revisa la información y acepta el trabajo.'],
                    ['03', 'Coordina y da seguimiento', 'Recibe atención, conoce el estado y mantén el contacto con tu técnico.']
                  ]
                  : [
                    ['01', 'Crea tu perfil profesional', 'Comparte tus especialidades, experiencia y zona de cobertura.'],
                    ['02', 'Completa la verificación', 'El equipo FixNow revisará tu perfil antes de habilitar trabajos.'],
                    ['03', 'Acepta trabajos cercanos', 'Consulta solicitudes disponibles y administra tus servicios desde tu panel.']
                  ]).map(([numero, titulo, descripcion]) => (
                  <article className="step-card" key={numero}>
                    <span className="step-number">{numero}</span>
                    <h3>{titulo}</h3>
                    <p>{descripcion}</p>
                  </article>
                ))}
              </div>
              {audienciaPasos === 'tecnico' && <button type="button" className="steps-cta" onClick={() => setVista('auth')}>Crear perfil de trabajador <ArrowRight size={16} /></button>}
            </section>}

            {configuracionSitio.showTechnicians && <Suspense fallback={<p className="panel-message">Cargando directorio de técnicos...</p>}>
              <DirectorioTecnicos
                excluirUsuarioId={usuarioId}
                titulo={configuracionSitio.techniciansTitle}
                onRegistro={() => setVista('auth')}
                onVerPerfil={(id) => {
                  setPerfilTecnicoId(id);
                  setVista('perfil-tecnico');
                }}
              />
            </Suspense>}

            {configuracionSitio.showFaq && <section className="faq-section" id="preguntas">
              <div className="section-heading">
                <span className="section-eyebrow">Resolvemos tus dudas</span>
                <h2>{configuracionSitio.faqTitle}</h2>
              </div>
              <div className="faq-list">
                <details>
                  <summary>¿Necesito crear una cuenta para solicitar un servicio?</summary>
                  <p>No. Puedes enviar una solicitud como invitado con tus datos de contacto. Si tienes cuenta, también puedes registrarla a tu perfil.</p>
                </details>
                <details>
                  <summary>¿Cómo se comparten mi dirección y teléfono?</summary>
                  <p>Los datos de domicilio y contacto solo se muestran al técnico aprobado que acepta tu trabajo.</p>
                </details>
                <details>
                  <summary>¿La solicitud tiene algún compromiso?</summary>
                  <p>Enviar tu solicitud no implica contratar un servicio; coordina directamente los detalles y el presupuesto con el profesional.</p>
                </details>
              </div>
            </section>}

            <div
              className="ad-slot"
              style={{
                padding: '14px',
                border: '1px dashed rgba(148, 163, 184, 0.28)',
                borderRadius: '14px',
                textAlign: 'center',
                background: 'rgba(15, 23, 42, 0.5)'
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#64748b',
                  marginBottom: '3px'
                }}
              >
                Publicidad
              </div>
              <div style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                Espacio reservado para anuncio (Google AdSense)
              </div>
            </div>
          </section>
        )}

        {!cuentaRestringida && vista === 'solicitar' && (
          <Suspense fallback={<p className="panel-message">Preparando solicitud...</p>}>
            <SolicitarReparacion
              key={`${seleccionServicio?.categoria || 'inicio'}:${seleccionServicio?.subtipo || 'default'}:${seleccionServicio?.fecha || ''}:${seleccionServicio?.hora || ''}:${seleccionServicio?.tecnicoId || ''}`}
              usuario={usuario}
              initialSelection={seleccionServicio}
              onVolver={() => setVista('inicio')}
            />
          </Suspense>
        )}

        {vista === 'auth' && (
          <Suspense fallback={<p className="panel-message">Preparando acceso...</p>}>
            <AuthPortal
              className="auth-panel"
              onVolver={() => setVista('inicio')}
              onAuthSuccess={() => setVista('inicio')}
            />
          </Suspense>
        )}

        {vista === 'auth-admin' && (
          <Suspense fallback={<p className="panel-message">Preparando acceso administrativo...</p>}>
            <AuthPortal
              className="auth-panel"
              adminOnly
              onVolver={() => setVista('inicio')}
              onAuthSuccess={() => setVista('inicio')}
            />
          </Suspense>
        )}

        {vista === 'perfil-tecnico' && perfilTecnicoId && (
          <Suspense fallback={<p className="panel-message">Cargando perfil profesional...</p>}>
            <PerfilTrabajador
              key={perfilTecnicoId}
              usuario={usuario}
              trabajadorId={perfilTecnicoId}
              verificadoOverride
              onVolver={() => setVista(
                !usuario ? 'inicio' : esAdminActivo ? 'admin' : rolUsuario === 'tecnico' ? 'tecnico' : rolUsuario === 'cliente' ? 'cliente' : 'inicio'
              )}
            />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'tecnico' && rolUsuario === 'tecnico' && (
          <Suspense fallback={<p className="panel-message">Cargando panel técnico...</p>}>
            <TrabajosTecnico usuario={usuario} onVolver={() => setVista('inicio')} aprobado={tecnicoAprobado} />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'cliente' && usuario && rolUsuario === 'cliente' && (
          <Suspense fallback={<p className="panel-message">Cargando tus solicitudes...</p>}>
            <MisSolicitudes
              usuario={usuario}
              onVolver={() => setVista('inicio')}
              onNuevaSolicitud={() => solicitarServicio()}
              onSolicitarConTecnico={solicitarConTecnico}
              onVerPerfilTecnico={(id) => {
                setPerfilTecnicoId(id);
                setVista('perfil-tecnico');
              }}
            />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'moderador' && usuario && esModerador && moderatorAccess.usuarioId === usuarioId && moderatorAccess.permisos && (
          <Suspense fallback={<p className="panel-message">Cargando centro de moderación...</p>}>
            <PanelModerador
              usuario={usuario}
              permisos={moderatorAccess.permisos}
              onCerrarSesion={handleCerrarSesion}
            />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'moderador' && moderatorAccess.error && (
          <section className="panel-message panel-error" role="alert">
            No se pudo validar el acceso de moderación: {moderatorAccess.error}
          </section>
        )}

        {!cuentaRestringida && vista === 'admin' && esAdminActivo && (
          <Suspense fallback={<p className="panel-message">Cargando panel de administración...</p>}>
            <PanelAdministrador
              usuario={usuario}
              sessionToken={adminAccess.token}
              onVolver={() => setVista('inicio')}
              onCerrarSesion={handleCerrarSesion}
              configuracionSitio={configuracionSitio}
              onConfiguracionPublicada={configurarPublicacion}
              onRecargar={() => {
                supabase.rpc('es_tecnico_aprobado').then(({ data, error }) => {
                  if (usuario?.id && rolUsuario === 'tecnico') {
                    setEstadoAprobacion({
                      usuarioId: usuario.id,
                      aprobado: !error && data === true,
                      error: error?.message || ''
                    });
                  }
                });
              }}
            />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'admin' && usuario && !esAdminActivo && !adminAccess.checking && (
          <section className="panel-message panel-error" role="alert">
            Esta cuenta no tiene acceso administrativo.
          </section>
        )}

      </main>

      {usuario && ['cliente', 'tecnico'].includes(rolUsuario) && (
        <Suspense fallback={null}>
          <SupportChat usuario={usuario} nombre={nombreUsuario} rol={rolUsuario === 'tecnico' ? 'Técnico' : 'Cliente'} />
        </Suspense>
      )}

      {vista !== 'admin' && <footer className="app-footer">
        <div className="footer-column footer-brand-column">
          <div className="footer-brand">
            <span className="brand-mark">{configuracionSitio.logoUrl
              ? <img src={configuracionSitio.logoUrl} alt="" />
              : <Wrench size={18} />}</span>
            <div>
              <strong>{configuracionSitio.brandName}</strong>
              <span>{configuracionSitio.tagline}</span>
            </div>
          </div>
          <p>{configuracionSitio.footerText}</p>
        </div>
        <div className="footer-column">
          <strong className="footer-column-title">Explora</strong>
          <nav className="footer-links" aria-label="Navegación del pie de página">
            <a href="#inicio" onClick={navegarA('inicio')}>Inicio</a>
            <a href="#servicios" onClick={navegarA('servicios')}>Servicios</a>
            {configuracionSitio.showHowItWorks && <a href="#como-funciona" onClick={navegarA('como-funciona')}>Cómo funciona</a>}
            {configuracionSitio.showTechnicians && <a href="#tecnicos" onClick={navegarA('tecnicos')}>Técnicos verificados</a>}
            {configuracionSitio.showFaq && <a href="#preguntas" onClick={navegarA('preguntas')}>Preguntas frecuentes</a>}
          </nav>
        </div>
        <div className="footer-column">
          <strong className="footer-column-title">Para profesionales</strong>
          <button type="button" className="footer-action-link" onClick={() => setVista('auth')}>Ofrece tus servicios <ArrowRight size={14} /></button>
          <button type="button" className="footer-admin-link" onClick={() => setVista(esAdminActivo ? 'admin' : 'auth-admin')}>Portal administrativo</button>
        </div>
        <div className="footer-column">
          <strong className="footer-column-title">Contacto y soporte</strong>
          {configuracionSitio.supportPhone
            ? <a className="footer-support-link" href={`https://wa.me/${configuracionSitio.supportPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp: {configuracionSitio.supportPhone}</a>
            : <span className="footer-muted">Estamos aquí para ayudarte.</span>}
        </div>
        <span className="footer-copyright">© {new Date().getFullYear()} {configuracionSitio.brandName}. {configuracionSitio.footerText}</span>
      </footer>}
    </div>
  );
}