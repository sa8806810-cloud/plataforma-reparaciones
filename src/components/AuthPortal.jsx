import { useState } from 'react';
import { ArrowLeft, User, Wrench, Mail, Lock, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { LOCALIDADES_REGION } from '../lib/formulariosConfig';

export default function AuthPortal({ onVolver, onAuthSuccess }) {
  const [modo, setModo] = useState('login');
  const [rol, setRol] = useState('cliente');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [localidad, setLocalidad] = useState(LOCALIDADES_REGION[0]);
  const [oficio, setOficio] = useState('Electricidad');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');

  let textoBotonSubmit = 'Entrar a mi cuenta';
  if (cargando) {
    textoBotonSubmit = 'Procesando...';
  } else if (modo === 'registro') {
    textoBotonSubmit = rol === 'tecnico' ? 'Registrarme como Técnico' : 'Registrarme como Cliente';
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);
    setAviso('');

    try {
      if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre,
              telefono,
              rol,
              localidad,
              oficio: rol === 'tecnico' ? oficio : null
            }
          }
        });

        if (error) {
          setAviso(`No se pudo registrar: ${error.message}`);
          return;
        }

        if (data?.session) {
          setAviso(
            rol === 'tecnico'
              ? 'Cuenta creada. Tu perfil de técnico requiere aprobación del administrador.'
              : '¡Cuenta creada correctamente!'
          );
          onAuthSuccess?.(data.user);
        } else {
          setAviso(
            'Cuenta creada. Revisa tu correo para confirmar la dirección; después podrás iniciar sesión.'
          );
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setAviso(`Error al entrar: ${error.message}`);
        return;
      }
      setAviso('¡Sesión iniciada correctamente!');
      onAuthSuccess?.(data.user);
    } catch (error) {
      setAviso(`No se pudo completar la operación: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  const estiloInput = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #374151',
    background: '#0f172a',
    color: '#f8fafc',
    fontSize: '1rem',
    boxSizing: 'border-box'
  };

  return (
    <section style={{ maxWidth: '520px', margin: '0 auto', display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={onVolver}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #374151',
            background: '#1f2937',
            color: '#f9fafb',
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} />
          <span>Regresar</span>
        </button>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
          {modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setModo('login')}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #2563eb',
            background: modo === 'login' ? '#2563eb' : '#111827',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Ya tengo cuenta
        </button>
        <button
          type="button"
          onClick={() => setModo('registro')}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #2563eb',
            background: modo === 'registro' ? '#2563eb' : '#111827',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Registrarme
        </button>
      </div>

      {modo === 'registro' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setRol('cliente')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              border: rol === 'cliente' ? '2px solid #22c55e' : '1px solid #374151',
              background: rol === 'cliente' ? '#052e16' : '#111827',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <User size={18} />
            <span>Soy Cliente</span>
          </button>
          <button
            type="button"
            onClick={() => setRol('tecnico')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              border: rol === 'tecnico' ? '2px solid #f59e0b' : '1px solid #374151',
              background: rol === 'tecnico' ? '#451a03' : '#111827',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <Wrench size={18} />
            <span>Soy Técnico</span>
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: '14px',
          background: '#111827',
          padding: '20px',
          borderRadius: '14px',
          border: '1px solid #1f2937'
        }}
      >
        {modo === 'registro' && (
          <>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span>Nombre completo</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Luis Martínez"
                required
                style={estiloInput}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px' }}>
              <span>Teléfono / WhatsApp (10 dígitos)</span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Ej. 3541234567"
                inputMode="numeric"
                pattern="[0-9]{10}"
                title="Ingresa un teléfono de 10 dígitos."
                required
                style={estiloInput}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} /> Localidad principal
              </span>
              <select
                value={localidad}
                onChange={(e) => setLocalidad(e.target.value)}
                style={estiloInput}
              >
                {LOCALIDADES_REGION.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>

            {rol === 'tecnico' && (
              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Especialidad principal</span>
                <select
                  value={oficio}
                  onChange={(e) => setOficio(e.target.value)}
                  style={estiloInput}
                >
                  <option value="Electricidad">Electricidad e instalaciones</option>
                  <option value="Plomería">Plomería y tuberías</option>
                  <option value="Electrodomésticos">Electrodomésticos</option>
                  <option value="Multiservicios">Varios oficios</option>
                </select>
              </label>
            )}
          </>
        )}

        <label style={{ display: 'grid', gap: '6px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Mail size={16} /> Correo electrónico
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            required
            style={estiloInput}
          />
        </label>

        <label style={{ display: 'grid', gap: '6px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={16} /> Contraseña
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            required
            style={estiloInput}
          />
        </label>

        <button
          type="submit"
          disabled={cargando}
          style={{
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: modo === 'login' ? '#2563eb' : '#16a34a',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          {textoBotonSubmit}
        </button>

        {aviso && (
        <p role="status" style={{ margin: 0, padding: '10px', borderRadius: '8px', background: '#1e293b' }}>
            {aviso}
          </p>
        )}
      </form>
    </section>
  );
}