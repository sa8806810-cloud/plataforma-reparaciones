import { useEffect, useState } from 'react';
import {
  Wrench,
  UserCheck,
  LogOut,
  Zap,
  Droplets,
  Plug,
  Hammer,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import SolicitarReparacion from './components/SolicitarReparacion';
import AuthPortal from './components/AuthPortal';

const SERVICIOS_DESTACADOS = [
  {
    titulo: 'Electricidad',
    detalle: 'Cortos, apagones, pastillas y cableado',
    icono: Zap,
    acento: '#60a5fa',
    fondoIcono: 'rgba(59, 130, 246, 0.16)',
    bordeIcono: 'rgba(96, 165, 250, 0.35)'
  },
  {
    titulo: 'Instalación nueva',
    detalle: 'Luz o toma desde cero en hogar o terreno',
    icono: Plug,
    acento: '#fbbf24',
    fondoIcono: 'rgba(251, 191, 36, 0.15)',
    bordeIcono: 'rgba(251, 191, 36, 0.35)'
  },
  {
    titulo: 'Plomería',
    detalle: 'Fugas, tuberías, llaves, tinacos y drenaje',
    icono: Droplets,
    acento: '#38bdf8',
    fondoIcono: 'rgba(56, 189, 248, 0.15)',
    bordeIcono: 'rgba(56, 189, 248, 0.35)'
  },
  {
    titulo: 'Reparaciones',
    detalle: 'Ajustes, montajes y mejoras del hogar',
    icono: Hammer,
    acento: '#34d399',
    fondoIcono: 'rgba(52, 211, 153, 0.15)',
    bordeIcono: 'rgba(52, 211, 153, 0.35)'
  }
];

export default function App() {
  const [vista, setVista] = useState('inicio');
  const [sesion, setSesion] = useState(null);

  useEffect(() => {
    const cargarSesion = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSesion(data?.session || null);
      } catch {
        setSesion(null);
      }
    };

    cargarSesion().catch(() => {
      setSesion(null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSesion(nuevaSesion || null);
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
    setSesion(null);
    setVista('inicio');
  };

  const usuario = sesion?.user || null;
  const nombreUsuario = usuario?.user_metadata?.nombre || usuario?.email || '';
  const rolUsuario = usuario?.user_metadata?.rol || '';

  return (
    <div
      style={{
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
        style={{
          maxWidth: '760px',
          margin: '0 auto 20px auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: '18px',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(148, 163, 184, 0.16)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4)'
        }}
      >
        <button
          type="button"
          onClick={() => setVista('inicio')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: 'none',
            color: '#f8fafc',
            padding: '4px 6px',
            borderRadius: '12px',
            cursor: 'pointer'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(37, 99, 235, 0.14))',
              border: '1px solid rgba(96, 165, 250, 0.45)'
            }}
          >
            <Wrench size={20} color="#60a5fa" />
          </span>
          <span style={{ fontWeight: 700, fontSize: '1.08rem', letterSpacing: '-0.015em' }}>
            Servicios y Reparaciones
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {usuario ? (
            <>
              <span
                style={{
                  fontSize: '0.88rem',
                  color: '#e2e8f0',
                  background: '#1e293b',
                  padding: '7px 11px',
                  borderRadius: '10px',
                  border: '1px solid #334155'
                }}
              >
                {nombreUsuario} {rolUsuario ? `· ${rolUsuario}` : ''}
              </span>
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

      <main style={{ maxWidth: '760px', margin: '0 auto' }}>
        {vista === 'inicio' && (
          <section style={{ display: 'grid', gap: '18px' }}>
            <div
              style={{
                background:
                  'linear-gradient(180deg, rgba(17, 26, 46, 0.96) 0%, rgba(13, 20, 36, 0.96) 100%)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: '24px',
                padding: 'clamp(20px, 5vw, 32px) clamp(16px, 4vw, 28px)',
                display: 'grid',
                gap: '20px',
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span
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

              <div style={{ display: 'grid', gap: '10px', textAlign: 'center', maxWidth: '580px', margin: '0 auto' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 'clamp(1.55rem, 5vw, 2.2rem)',
                    lineHeight: 1.18,
                    letterSpacing: '-0.025em'
                  }}
                >
                  Reparaciones e instalaciones a tu medida
                </h1>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: 'clamp(0.95rem, 2.5vw, 1.04rem)', lineHeight: 1.55 }}>
                  Elige el servicio que necesitas, selecciona fecha en el calendario y comparte tu
                  ubicación en segundos desde tu celular o computadora.
                </p>
              </div>

              <div style={{ display: 'grid', gap: '12px', maxWidth: '540px', width: '100%', margin: '0 auto' }}>
                <button
                  type="button"
                  onClick={() => setVista('solicitar')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minHeight: '52px',
                    padding: '15px 20px',
                    borderRadius: '15px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    cursor: 'pointer',
                    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.4)'
                  }}
                >
                  <span>Solicitar reparación o instalación</span>
                  <ChevronRight size={21} />
                </button>

                <button
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
                  <span>Acceso y registro de cuenta</span>
                  <ChevronRight size={19} color="#94a3b8" />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '10px',
                  marginTop: '4px'
                }}
              >
                {SERVICIOS_DESTACADOS.map((item) => {
                  const Icono = item.icono;
                  return (
                    <button
                      key={item.titulo}
                      type="button"
                      onClick={() => setVista('solicitar')}
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
                      <span
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

            <div
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

        {vista === 'solicitar' && (
          <SolicitarReparacion usuarioId={usuario?.id || null} onVolver={() => setVista('inicio')} />
        )}

        {vista === 'auth' && (
          <AuthPortal
            onVolver={() => setVista('inicio')}
            onAuthSuccess={() => setVista('inicio')}
          />
        )}
      </main>
    </div>
  );
}