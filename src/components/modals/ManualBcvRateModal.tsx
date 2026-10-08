import { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase/client';
import { setActiveExchangeRate } from '../../lib/currency';
import { authenticatedFetch } from '../../lib/supabase/api';
import { getActiveOrgId } from '../../lib/supabase/db';

interface ManualBcvRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRate: number;
  onRateUpdated: (newRate: number, isFuture: boolean, source: string) => void;
}

export function ManualBcvRateModal({
  isOpen,
  onClose,
  currentRate,
  onRateUpdated
}: ManualBcvRateModalProps) {
  const [rateInput, setRateInput] = useState(currentRate.toString());
  const [hasFutureRate, setHasFutureRate] = useState(false);
  const [futureRateInput, setFutureRateInput] = useState('');
  const [valueDate, setValueDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [userRole, setUserRole] = useState('');
  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isCurrent = true;
    setIsCheckingRole(true);
    void (async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const organizationId = await getActiveOrgId();
        if (!userData.user || !organizationId) {
          if (isCurrent) setUserRole('');
          return;
        }
        const { data, error } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', organizationId)
          .eq('user_id', userData.user.id)
          .maybeSingle();
        if (error) throw error;
        if (isCurrent) setUserRole(data?.role || '');
      } catch (error) {
        if (isCurrent) {
          setUserRole('');
          setErrorMsg(error instanceof Error ? error.message : 'No se pudo validar el rol.');
        }
      } finally {
        if (isCurrent) setIsCheckingRole(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const canManageRate = ['admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner']
    .includes(userRole.trim().toLowerCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(rateInput);
    if (!num || num <= 0) {
      setErrorMsg('Ingresa una tasa numérica válida y positiva.');
      return;
    }

    const numFuture = hasFutureRate && futureRateInput.trim() ? parseFloat(futureRateInput) : null;
    if (hasFutureRate && (!numFuture || numFuture <= 0)) {
      setErrorMsg('Ingresa un valor positivo válido para la tasa futura.');
      return;
    }

    if (!canManageRate) {
      setErrorMsg('La actualización manual de tasas está estrictamente restringida a usuarios con rol de Administrador para evitar errores de rentabilidad.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Post to backend server
      const response = await authenticatedFetch('/api/bcv/rates/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate: num,
          futureRate: numFuture,
          valueDate,
          notes: notes.trim() || 'Ajuste manual de contingencia'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al registrar tasa manual');
      }

      const resData = await response.json();
      const certified = resData.certifiedRate;
      const effectiveSavedRate = certified.usdRate || (numFuture && numFuture > 0 ? numFuture : num);

      // 2. Persist in local storage
      setActiveExchangeRate(effectiveSavedRate);
      localStorage.setItem('frenyer_bcv_rate_date', valueDate);
      localStorage.setItem('frenyer_bcv_rate_source', 'MANUAL');
      localStorage.setItem('frenyer_bcv_is_future', certified.isFutureRate ? 'true' : 'false');

      // Notify UI components after the server has persisted the audit record.
      window.dispatchEvent(new CustomEvent('frenyer:rate-changed', {
        detail: {
          rate: effectiveSavedRate,
          isFutureRate: certified.isFutureRate,
          source: 'MANUAL'
        }
      }));

      onRateUpdated(effectiveSavedRate, certified.isFutureRate, 'MANUAL');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo comunicar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1200,
        padding: 16
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 0,
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
        }}
      >
        {/* Header (Amber Warning Style for Contingency) */}
        <div
          style={{
            background: '#991b1b',
            color: 'white',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={20} style={{ color: '#fca5a5' }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Intervención Manual de Tasa BCV
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Audit Warning */}
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 12,
              color: '#92400e',
              display: 'flex',
              gap: 10
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: '#d97706' }} />
            <div>
              <b style={{ display: 'block', marginBottom: 2 }}>Protocolo de Auditoría y Trazabilidad</b>
              Toda transacción realizada bajo esta tasa quedará vinculada permanentemente con la traza <code>tasa_manual</code> para la auditoría de costos y márgenes de rentabilidad.
            </div>
          </div>

          {errorMsg && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 10, borderRadius: 8, fontSize: 12 }}>
              {errorMsg}
            </div>
          )}

          {/* Role Check */}
          <div className="field">
            <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
              Rol de autorización
            </label>
            <div role="status" style={{ padding: 9, borderRadius: 6, background: canManageRate ? '#f5f3ff' : '#fef2f2', color: canManageRate ? '#5b21b6' : '#b91c1c', fontSize: 12 }}>
              {isCheckingRole ? 'Validando permisos…' : userRole || 'Sin rol autorizado'}
            </div>
          </div>

          {/* Rate & Date Grid */}
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                Tasa Actual USD/VES *
              </label>
              <input
                className="input"
                type="number"
                step="0.0001"
                min="0.0001"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="Ej: 871.37"
                required
              />
            </div>

            <div className="field">
              <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                Fecha Valor *
              </label>
              <input
                className="input"
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Toggle Tasa Futura */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: 12, color: '#0f172a', display: 'block' }}>¿Registrar Tasa Futura?</b>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Si existe una tasa futura, el sistema la grabará y aplicará de inmediato en ventas.
                </span>
              </div>
              <input
                type="checkbox"
                checked={hasFutureRate}
                onChange={(e) => setHasFutureRate(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-600)' }}
              />
            </div>

            {hasFutureRate && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Monto Tasa Futura (Bs. / USD) *
                </label>
                <input
                  className="input"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="Ej: 875.5000"
                  value={futureRateInput}
                  onChange={(e) => setFutureRateInput(e.target.value)}
                  required={hasFutureRate}
                  style={{ border: '2px solid #f59e0b', background: '#fffbeb', fontWeight: 700 }}
                />
              </div>
            )}
          </div>

          {/* Justification / Notes */}
          <div className="field">
            <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
              Motivo o Justificación del Override
            </label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Caída portal BCV / Feriado bancario no publicado"
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: '#fff',
                color: '#475569',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || isCheckingRole || !canManageRate}
              style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <CheckCircle size={16} /> {isSubmitting ? 'Guardando...' : 'Aplicar Tasa Manual'}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
