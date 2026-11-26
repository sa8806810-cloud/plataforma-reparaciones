import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Banknote, Clock3, Gift, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const moneda = (valor) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
}).format(Number(valor) || 0);

function mostrarFecha(fecha) {
  return new Date(fecha).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function CentroGanancias({ actualizarKey = 0 }) {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.rpc('tecnico_obtener_centro_ganancias');
      if (queryError) throw queryError;
      setResumen(data);
    } catch (loadError) {
      setError(`No se pudo cargar el centro de ganancias: ${loadError.message}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let intervalo;
    const timer = window.setTimeout(() => {
      cargar();
      intervalo = window.setInterval(() => cargar(false), 30000);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (intervalo) window.clearInterval(intervalo);
    };
  }, [actualizarKey, cargar]);

  const ultimoTrabajo = resumen?.ultimo_trabajo;
  const indicadores = [
    { etiqueta: 'Ganancia último trabajo', valor: moneda(ultimoTrabajo?.monto), detalle: ultimoTrabajo?.titulo || 'Sin trabajos registrados', icono: Banknote },
    { etiqueta: 'Ganancias totales', valor: moneda(resumen?.ganancias_total), detalle: 'Trabajos completados', icono: TrendingUp },
    { etiqueta: 'Efectivo recibido', valor: moneda(resumen?.efectivo_total), detalle: 'Cobros registrados en efectivo', icono: Banknote },
    { etiqueta: 'Saldo por liquidar', valor: moneda(resumen?.saldo_pendiente), detalle: 'Transferencias pendientes de validar', icono: Wallet },
    { etiqueta: 'En línea hoy', valor: `${Number(resumen?.horas_online_hoy || 0).toFixed(2)} h`, detalle: 'Tiempo con disponibilidad activa', icono: Clock3 },
    { etiqueta: 'Distancia registrada hoy', valor: `${Number(resumen?.distancia_km_hoy || 0).toFixed(2)} km`, detalle: 'GPS compartido durante trabajos', icono: TrendingUp },
    { etiqueta: 'Ganancia por hora hoy', valor: moneda(resumen?.ganancias_hora_hoy), detalle: `${moneda(resumen?.ganancias_hoy)} generado hoy`, icono: Clock3 },
    { etiqueta: 'Ganancias por transferencia', valor: moneda(resumen?.transferencias_total), detalle: 'Total registrado', icono: Wallet }
  ];

  return (
    <section className="earnings-dashboard" aria-label="Ganancias y recompensas">
      <div className="earnings-heading">
        <div><span className="section-eyebrow">Rendimiento del negocio</span><h2>Ganancias y recompensas</h2><p>Resumen basado en trabajos completados y pagos registrados, sin comisión de plataforma.</p></div>
        <button type="button" className="panel-action-button" onClick={cargar} disabled={cargando} aria-label="Actualizar ganancias">
          <RefreshCw size={15} />{cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {error && <p role="alert" className="panel-message panel-error">{error}</p>}
      {cargando && !resumen && <p className="panel-message">Cargando tus indicadores financieros…</p>}
      {resumen && (
        <>
          <div className="earnings-metric-grid">
            {indicadores.map(({ etiqueta, valor, detalle, icono: Icon }) => (
              <article className="earnings-metric" key={etiqueta}>
                <span className="earnings-metric-icon"><Icon size={16} /></span>
                <span className="earnings-metric-label">{etiqueta}</span>
                <strong>{valor}</strong>
                <small>{detalle}</small>
              </article>
            ))}
          </div>
          <button type="button" className="panel-action-button panel-primary-action earnings-center-button" aria-expanded={abierto} onClick={() => setAbierto((actual) => !actual)}>
            <TrendingUp size={16} />{abierto ? 'Ocultar centro de ganancias' : 'Ver centro de ganancias'}
          </button>
          {abierto && (
            <div className="earnings-transactions">
              <div className="earnings-subheading"><div><strong>Movimientos recientes</strong><small>Los registros se generan al completar un trabajo.</small></div></div>
              {(resumen.movimientos || []).length === 0
                ? <p className="panel-message">Aún no tienes ganancias registradas. Al terminar un trabajo, ingresa el monto cobrado y el método de pago.</p>
                : <div className="earnings-table-wrap"><table className="earnings-table">
                  <thead><tr><th>Trabajo</th><th>Fecha</th><th>Método</th><th>Monto</th><th>Liquidación</th></tr></thead>
                  <tbody>{resumen.movimientos.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <td><strong>{movimiento.titulo || 'Servicio FixNow'}</strong></td>
                      <td>{mostrarFecha(movimiento.creado_en)}</td>
                      <td>{movimiento.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                      <td>{moneda(movimiento.monto)}</td>
                      <td>{movimiento.metodo_pago === 'efectivo' ? 'Recibido' : movimiento.liquidado_en ? 'Liquidada' : 'Pendiente'}</td>
                    </tr>
                  ))}</tbody>
                </table></div>}
              <p className="earnings-disclaimer">“Saldo por liquidar” suma transferencias registradas que el administrador aún no ha marcado como liquidadas. FixNow no procesa ni confirma el movimiento bancario.</p>
            </div>
          )}
          <section className="technician-rewards">
            <div className="earnings-subheading"><div><span className="section-eyebrow">Programa profesional</span><strong>Recompensas</strong><small>Avanza con cada trabajo completado.</small></div><Gift size={19} /></div>
            {(resumen.recompensas || []).length === 0
              ? <p className="panel-message">El administrador publicará aquí las próximas recompensas.</p>
              : <div className="technician-reward-grid">{resumen.recompensas.map((recompensa) => {
                const progreso = Number(recompensa.progreso || 0);
                const meta = Number(recompensa.meta_trabajos || 1);
                const porcentaje = Math.min(100, (progreso / meta) * 100);
                return (
                  <article className="technician-reward-card" key={recompensa.id}>
                    <div className="technician-reward-icon">{recompensa.completada ? <BadgeCheck size={18} /> : <Gift size={18} />}</div>
                    <div className="technician-reward-copy"><strong>{recompensa.nombre}</strong><p>{recompensa.descripcion}</p>{recompensa.premio && <span className="technician-reward-prize">{recompensa.premio}</span>}</div>
                    <span className={recompensa.completada ? 'technician-reward-status earned' : 'technician-reward-status'}>{recompensa.completada ? 'Meta alcanzada' : `${progreso} / ${meta} trabajos`}</span>
                    <div className="technician-reward-progress"><span style={{ width: `${porcentaje}%` }} /></div>
                  </article>
                );
              })}</div>}
          </section>
        </>
      )}
    </section>
  );
}
