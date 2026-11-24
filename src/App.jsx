import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Wrench,
  UserCheck,
  LogOut,
  Zap,
  Droplets,
  Plug,
  Hammer,
  ChevronRight,
  Sparkles,
  KeyRound,
  Refrigerator,
  ShieldCheck,
  Clock3,
  CircleCheck,
  LayoutDashboard
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
  }
];

export default function App() {
  const [vista, setVista] = useState('inicio');
  const [seleccionServicio, setSeleccionServicio] = useState(null);
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
    if (vista === 'inicio') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    destinoNavegacion.current = id;
    setVista('inicio');
  };

  const solicitarServicio = (servicio = null) => {
    setSeleccionServicio(
      servicio ? { categoria: servicio.categoria, subtipo: servicio.subtipo } : null
    );
    setVista('solicitar');
  };

  return (
    <div
      className="app-shell"
      style={{
        '--brand-primary': configuracionSitio.primaryColor,
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 50% -10%, #17284a 0%, #0b1120 48%, #060911 100%)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 'clamp(12px, 3vw, 24px) clamp(12px, 3vw, 18px) 40px clamp(12px, 3vw, 18px)',
        boxSizing: 'border-box'
      }}
    >
      <header
        className="app-navbar"
      >
        <button
          className="brand-lockup"
          type="button"
          onClick={navegarA('inicio')}
          aria-label={`${configuracionSitio.brandName}, volver al inicio`}
        >
          <span className="brand-mark">
            <Wrench size={20} color="#60a5fa" />
          </span>
          <span>
            <span className="brand-name">{configuracionSitio.brandName}</span>
            <span className="brand-subtitle">{configuracionSitio.tagline}</span>
          </span>
        </button>

        <nav className="nav-links" aria-label="Navegación principal">
          <a href="#inicio" onClick={navegarA('inicio')}>Inicio</a>
          <a href="#servicios" onClick={navegarA('servicios')}>Servicios</a>
          {configuracionSitio.showHowItWorks && <a href="#como-funciona" onClick={navegarA('como-funciona')}>Cómo funciona</a>}
          {configuracionSitio.showTechnicians && <a href="#tecnicos" onClick={navegarA('tecnicos')}>Técnicos</a>}
          {configuracionSitio.showFaq && <a href="#preguntas" onClick={navegarA('preguntas')}>Preguntas frecuentes</a>}
        </nav>

        <div className="nav-actions">
          {usuario ? (
            <>
              <span
                className="nav-user-label"
              >
                {nombreUsuario}
                {esAdminActivo
                  ? ' · Administrador'
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
              ) : (
                <button
                  type="button"
                  className="panel-nav-button"
                  onClick={() => setVista(cuentaRestringida ? 'cuenta-bloqueada' : esAdminActivo ? 'admin' : rolUsuario === 'tecnico' ? 'tecnico' : 'cliente')}
                >
                  <LayoutDashboard size={15} />
                  Mi Panel
                </button>
              )}
              <button
                type="button"
                onClick={handleCerrarSesion}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '38px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={15} />
                <span>Salir</span>
              </button>
            </>
          ) : (
            <button
              className="nav-login-button"
              type="button"
              onClick={() => setVista('auth')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                minHeight: '40px',
                padding: '9px 15px',
                borderRadius: '12px',
                border: '1px solid rgba(96, 165, 250, 0.5)',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.92rem',
                cursor: 'pointer',
                boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)'
              }}
            >
              <UserCheck size={16} />
              <span>Entrar / Registrarse</span>
            </button>
          )}
        </div>
      </header>

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
            {configuracionSitio.bannerEnabled && configuracionSitio.bannerText && (
              <div className="site-promo-banner"><Sparkles size={16} />{configuracionSitio.bannerText}</div>
            )}
            <div
              className="hero-panel"
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span
                  className="hero-kicker"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#93c5fd',
                    background: 'rgba(37, 99, 235, 0.16)',
                    border: '1px solid rgba(96, 165, 250, 0.32)',
                    padding: '6px 12px',
                    borderRadius: '999px'
                  }}
                >
                  <Sparkles size={14} /> Solicitudes rápidas con ubicación y calendario
                </span>
              </div>

              <div className="hero-copy">
                <h1>
                  {configuracionSitio.heroTitle}
                </h1>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: 'clamp(0.95rem, 2.5vw, 1.04rem)', lineHeight: 1.55 }}>
                  {configuracionSitio.heroSubtitle}
                </p>
              </div>

              <div className="hero-actions" style={{ display: 'grid', gap: '12px', maxWidth: '540px', width: '100%', margin: '0 auto' }}>
                <button
                  className="hero-primary-button"
                  type="button"
                  onClick={() => solicitarServicio()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minHeight: '52px',
                    padding: '15px 20px',
                    borderRadius: '15px',
                    border: 'none',
                    background: `linear-gradient(135deg, ${configuracionSitio.primaryColor} 0%, ${configuracionSitio.primaryColor} 100%)`,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    cursor: 'pointer',
                    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.4)'
                  }}
                >
                  <span>{configuracionSitio.primaryAction}</span>
                  <ChevronRight size={21} />
                </button>

                <button
                  className="hero-secondary-button"
                  type="button"
                  onClick={() => setVista('auth')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minHeight: '48px',
                    padding: '13px 20px',
                    borderRadius: '15px',
                    border: '1px solid #334155',
                    background: 'rgba(24, 34, 52, 0.9)',
                    color: '#f1f5f9',
                    fontWeight: 600,
                    fontSize: '0.98rem',
                    cursor: 'pointer'
                  }}
                >
                  <span>{configuracionSitio.secondaryAction}</span>
                  <ChevronRight size={19} color="#94a3b8" />
                </button>
              </div>

              <div className="trust-row" aria-label="Beneficios">
                <span className="trust-item"><ShieldCheck size={16} /> Técnicos verificados</span>
                <span className="trust-item"><Clock3 size={16} /> Respuesta rápida</span>
                <span className="trust-item"><CircleCheck size={16} /> Atención garantizada</span>
              </div>

              <div className="section-heading" id="servicios">
                <span className="section-eyebrow">Servicios para tu hogar</span>
                <h2>¿Qué necesitas resolver?</h2>
                <p>Elige una categoría para iniciar tu solicitud con el servicio preseleccionado.</p>
              </div>

              <div
                className="service-grid"
              >
                {SERVICIOS_DESTACADOS.filter((item) =>
                  configuracionSitio.featuredCategories.includes(
                    item.subtipo === 'instalacion_sin_toma' ? 'instalacion' : item.categoria
                  )
                ).map((item) => {
                  const Icono = item.icono;
                  return (
                    <button
                      className="service-card"
                      key={item.titulo}
                      type="button"
                      onClick={() => solicitarServicio(item)}
                      aria-label={`Solicitar servicio de ${item.titulo}`}
                      style={{
                        display: 'grid',
                        gap: '6px',
                        textAlign: 'left',
                        padding: '14px',
                        borderRadius: '16px',
                        border: '1px solid rgba(148, 163, 184, 0.14)',
                        background: 'rgba(11, 18, 32, 0.78)',
                        color: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      <span className="service-icon"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '34px',
                          height: '34px',
                          borderRadius: '10px',
                          background: item.fondoIcono,
                          border: `1px solid ${item.bordeIcono}`
                        }}
                      >
                        <Icono size={17} color={item.acento} />
                      </span>
                      <strong style={{ fontSize: '0.94rem' }}>{item.titulo}</strong>
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.35 }}>
                        {item.detalle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {configuracionSitio.showHowItWorks && <section className="how-section" id="como-funciona">
              <div className="section-heading">
                <span className="section-eyebrow">Simple y transparente</span>
                <h2>Cómo funciona FixNow</h2>
                <p>Del primer mensaje a la solución, te acompañamos en cada paso.</p>
              </div>
              <div className="steps-grid">
                <article className="step-card">
                  <span className="step-number">01</span>
                  <h3>Cuéntanos qué necesitas</h3>
                  <p>Describe el problema, elige tu zona y dinos cuándo te conviene recibir atención.</p>
                </article>
                <article className="step-card">
                  <span className="step-number">02</span>
                  <h3>Un profesional acepta</h3>
                  <p>Un técnico aprobado de tu zona revisa los detalles y acepta el trabajo.</p>
                </article>
                <article className="step-card">
                  <span className="step-number">03</span>
                  <h3>Recibe atención confiable</h3>
                  <p>Te contacta para coordinar la visita y resolver tu necesidad con claridad.</p>
                </article>
              </div>
            </section>}

            {configuracionSitio.showTechnicians && <Suspense fallback={<p className="panel-message">Cargando directorio de técnicos...</p>}>
              <DirectorioTecnicos
                excluirUsuarioId={usuarioId}
                onVerPerfil={(id) => {
                  setPerfilTecnicoId(id);
                  setVista('perfil-tecnico');
                }}
              />
            </Suspense>}

            {configuracionSitio.showFaq && <section className="faq-section" id="preguntas">
              <div className="section-heading">
                <span className="section-eyebrow">Resolvemos tus dudas</span>
                <h2>Preguntas frecuentes</h2>
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
              key={`${seleccionServicio?.categoria || 'inicio'}:${seleccionServicio?.subtipo || 'default'}`}
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

        {!cuentaRestringida && vista === 'tecnico' && tecnicoAprobado && (
          <Suspense fallback={<p className="panel-message">Cargando panel técnico...</p>}>
            <TrabajosTecnico usuario={usuario} onVolver={() => setVista('inicio')} />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'cliente' && usuario && rolUsuario === 'cliente' && (
          <Suspense fallback={<p className="panel-message">Cargando tus solicitudes...</p>}>
            <MisSolicitudes
              usuario={usuario}
              onVolver={() => setVista('inicio')}
              onNuevaSolicitud={() => solicitarServicio()}
              onVerPerfilTecnico={(id) => {
                setPerfilTecnicoId(id);
                setVista('perfil-tecnico');
              }}
            />
          </Suspense>
        )}

        {!cuentaRestringida && vista === 'admin' && esAdminActivo && (
          <Suspense fallback={<p className="panel-message">Cargando panel de administración...</p>}>
            <PanelAdministrador
              usuario={usuario}
              sessionToken={adminAccess.token}
              onVolver={() => setVista('inicio')}
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

        {!cuentaRestringida && vista === 'tecnico' && rolUsuario === 'tecnico' && !tecnicoAprobado && (
          <section
            role="status"
            className="pending-technician"
          >
            {estadoAprobacion.error
              ? 'No se pudo consultar la aprobación. Intenta actualizar la página o contacta al administrador.'
              : <>
                  <ShieldCheck size={28} />
                  <h2>Cuenta en revisión</h2>
                  <p>El administrador revisará tu perfil. Te avisaremos cuando puedas recibir trabajos.</p>
                </>}
          </section>
        )}
      </main>

      {usuario && ['cliente', 'tecnico'].includes(rolUsuario) && (
        <Suspense fallback={null}>
          <SupportChat usuario={usuario} nombre={nombreUsuario} rol={rolUsuario === 'tecnico' ? 'Técnico' : 'Cliente'} />
        </Suspense>
      )}

      <footer className="app-footer">
        <div className="footer-brand">
          <span className="brand-mark"><Wrench size={18} /></span>
          <div>
            <strong>{configuracionSitio.brandName}</strong>
            <span>{configuracionSitio.tagline}</span>
          </div>
        </div>
        <nav className="footer-links" aria-label="Navegación del pie de página">
          <a href="#inicio" onClick={navegarA('inicio')}>Inicio</a>
          <a href="#servicios" onClick={navegarA('servicios')}>Servicios</a>
          {configuracionSitio.showHowItWorks && <a href="#como-funciona" onClick={navegarA('como-funciona')}>Cómo funciona</a>}
          {configuracionSitio.showTechnicians && <a href="#tecnicos" onClick={navegarA('tecnicos')}>Técnicos verificados</a>}
          {configuracionSitio.showFaq && <a href="#preguntas" onClick={navegarA('preguntas')}>Preguntas frecuentes</a>}
          <button
            type="button"
            className="footer-admin-link"
            onClick={() => setVista(esAdminActivo ? 'admin' : 'auth-admin')}
          >
            Portal administrativo
          </button>
        </nav>
        {configuracionSitio.supportPhone && <a className="footer-support-link" href={`https://wa.me/${configuracionSitio.supportPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp: {configuracionSitio.supportPhone}</a>}
        <span className="footer-copyright">© {new Date().getFullYear()} {configuracionSitio.brandName}. {configuracionSitio.footerText}</span>
      </footer>
    </div>
  );
}