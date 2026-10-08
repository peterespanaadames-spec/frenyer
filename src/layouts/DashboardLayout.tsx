import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { Menu, Sparkles, RefreshCw, Edit3, ShieldAlert, AlertCircle, ArrowUpRight, Check, X, LogOut } from 'lucide-react';
import { Sidebar } from '../components/ui/Sidebar';
import { ManualBcvRateModal } from '../components/modals/ManualBcvRateModal';
import { getActiveExchangeRate, setActiveExchangeRate, isFutureExchangeRate } from '../lib/currency';
import { isSupabaseConfigured, supabase } from '../lib/supabase/client';
import { getActiveOrgId } from '../lib/supabase/db';

export function DashboardLayout() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<'loading' | 'signedOut' | 'noOrganization' | 'authenticated'>('loading');
  const [authMessage, setAuthMessage] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [bcvRate, setBcvRate] = useState(() => getActiveExchangeRate());
  const [isFuture, setIsFuture] = useState(() => isFutureExchangeRate());
  const [rateSource, setRateSource] = useState(() => localStorage.getItem('frenyer_bcv_rate_source') || 'BCV');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Proposed Rate Notification Banner
  const [proposedRate, setProposedRate] = useState<{
    newRate: number;
    currentRate: number;
    difference: number;
    percentDiff: number;
    isFuture: boolean;
    valueDate: string;
    source: string;
  } | null>(null);

  // Fetch certified rate from backend server on load
  const fetchBackendRate = async (forceRefresh = false) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/bcv/rates${forceRefresh ? '?refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        // Si existe tasa futura, esa es la que se toma; de lo contrario la actual
        const chosenRate = data.isFutureApplied && data.futureRate
          ? Number(data.futureRate)
          : (Number(data.appliedRate) || Number(data.usdRate) || 872.3927);

        const activeCurrent = getActiveExchangeRate();
        const autoCheckPref = localStorage.getItem('frenyer_auto_update_bcv') !== 'false';

        // Check if there is a discrepancy with manual rate or stored rate
        if (Math.abs(chosenRate - activeCurrent) > 0.0001 && rateSource === 'MANUAL' && !forceRefresh) {
          // Si el usuario tenía fijada una tasa manual, proponer el cambio con el aviso sin sustituir silenciosamente
          const diff = chosenRate - activeCurrent;
          const pct = activeCurrent > 0 ? (diff / activeCurrent) * 100 : 0;
          setProposedRate({
            newRate: chosenRate,
            currentRate: activeCurrent,
            difference: diff,
            percentDiff: pct,
            isFuture: Boolean(data.isFutureApplied),
            valueDate: data.valueDate || 'Hoy',
            source: data.source
          });
        } else {
          setBcvRate(chosenRate);
          setIsFuture(Boolean(data.isFutureApplied));
          setRateSource(data.source);

          localStorage.setItem('frenyer_bcv_is_future', data.isFutureApplied ? 'true' : 'false');
          localStorage.setItem('frenyer_bcv_rate_source', data.source);
          if (data.valueDate) {
            localStorage.setItem('frenyer_bcv_rate_date', data.valueDate);
          }

          setActiveExchangeRate(chosenRate);
        }
      }
    } catch {
      // Silently fail as requested (no logs)
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyProposedRate = () => {
    if (!proposedRate) return;
    const { newRate, isFuture: isFut, source, valueDate } = proposedRate;
    setBcvRate(newRate);
    setIsFuture(isFut);
    setRateSource(source);

    localStorage.setItem('frenyer_bcv_is_future', isFut ? 'true' : 'false');
    localStorage.setItem('frenyer_bcv_rate_source', source);
    if (valueDate) localStorage.setItem('frenyer_bcv_rate_date', valueDate);

    setActiveExchangeRate(newRate);
    setProposedRate(null);
  };

  const handleKeepCurrentRate = () => {
    setProposedRate(null);
  };

  const checkAuthenticatedMembership = async () => {
    if (!isSupabaseConfigured) {
      setAuthMessage('Configure VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para iniciar sesión.');
      setAuthStatus('signedOut');
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAuthMessage(`No se pudo validar la sesión: ${error.message}`);
      setAuthStatus('signedOut');
      return;
    }
    if (!data.session) {
      setAuthMessage('');
      setAuthStatus('signedOut');
      return;
    }

    const organizationId = await getActiveOrgId();
    if (!organizationId) {
      setAuthMessage('La cuenta no pertenece a una organización autorizada.');
      setAuthStatus('noOrganization');
      return;
    }
    setAuthMessage('');
    setAuthStatus('authenticated');
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSigningIn(true);
    setAuthMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) {
        throw error;
      }
      setAuthPassword('');
      await checkAuthenticatedMembership();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
      setAuthStatus('signedOut');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthMessage(`No se pudo cerrar la sesión: ${error.message}`);
      return;
    }
    setAuthStatus('signedOut');
    setAuthMessage('');
  };

  useEffect(() => {
    void checkAuthenticatedMembership();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void checkAuthenticatedMembership();
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchBackendRate();

    const handleRateEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number; isFutureRate?: boolean; source?: string }>;
      if (customEvent.detail?.rate) {
        setBcvRate(customEvent.detail.rate);
      }
      if (typeof customEvent.detail?.isFutureRate === 'boolean') {
        setIsFuture(customEvent.detail.isFutureRate);
      }
      if (customEvent.detail?.source) {
        setRateSource(customEvent.detail.source);
      }
    };

    window.addEventListener('frenyer:rate-changed', handleRateEvent);
    return () => window.removeEventListener('frenyer:rate-changed', handleRateEvent);
  }, []);

  if (authStatus !== 'authenticated') {
    return (
      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: '#f8fafc'
      }}>
        <section className="card" style={{
          width: '100%',
          maxWidth: 420,
          padding: 28,
          borderRadius: 16,
          background: '#fff',
          border: '1px solid var(--border)'
        }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, color: '#0f172a' }}>Iniciar sesión</h1>
          <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>
            Acceda con un usuario miembro de una organización Frenyer.
          </p>
          {authStatus === 'loading' ? (
            <p role="status" style={{ color: '#64748b' }}>Verificando sesión...</p>
          ) : (
            <form onSubmit={handleSignIn} style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Correo electrónico
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  style={{ height: 42, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Contraseña
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  style={{ height: 42, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)' }}
                />
              </label>
              {authMessage && (
                <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{authMessage}</p>
              )}
              <button
                type="submit"
                disabled={isSigningIn}
                style={{ height: 42, border: 0, borderRadius: 9, background: '#7c3aed', color: '#fff', fontWeight: 700 }}
              >
                {isSigningIn ? 'Ingresando...' : 'Ingresar'}
              </button>
              {authStatus === 'noOrganization' && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{ height: 38, border: '1px solid var(--border)', borderRadius: 9, background: '#fff', color: '#475569' }}
                >
                  Cerrar sesión
                </button>
              )}
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main" style={{ position: 'relative' }}>
        <header className="topbar">
          <div className="mobile-menu">
            <Menu size={20} />
          </div>
          <div className="topbar-title">Frenyer · Gestión empresarial</div>

          {/* Right Header Area with BCV Pill & Actions */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            
            {/* Live BCV Exchange Rate Pill (Minimalist Amount Only - Click to modify) */}
            <div
              onClick={() => setIsManualModalOpen(true)}
              title="Haga clic para modificar la tasa de cambio"
              style={{
                display: 'flex',
                alignItems: 'center',
                background: rateSource === 'MANUAL' ? '#fef2f2' : '#f8fafc',
                border: rateSource === 'MANUAL' ? '1px solid #f87171' : '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 800,
                color: '#0f172a',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f1f5f9';
                e.currentTarget.style.borderColor = 'var(--brand-500)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = rateSource === 'MANUAL' ? '#fef2f2' : '#f8fafc';
                e.currentTarget.style.borderColor = rateSource === 'MANUAL' ? '#f87171' : 'var(--border)';
              }}
            >
              Bs. {bcvRate.toFixed(2)}
            </div>

            <span className="muted" style={{ fontSize: 12 }}>
              Sucursal Principal
            </span>
            <div className="avatar">FG</div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 7, color: '#475569', cursor: 'pointer' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Aviso de Actualización de Tasa Propuesta por BCV */}
        {proposedRate && (
          <div
            style={{
              margin: '12px 18px 0',
              padding: '12px 18px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #93c5fd',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              boxShadow: '0 2px 8px rgba(59,130,246,0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: '#3b82f6',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0
                }}
              >
                <AlertCircle size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13, color: '#1e3a8a' }}>
                    Nueva tasa oficial detectada en Banco Central de Venezuela
                  </b>
                  {proposedRate.isFuture && (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 800
                      }}
                    >
                      TASA FUTURA (16:00 / Fecha: {proposedRate.valueDate})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#334155', marginTop: 3 }}>
                  Tasa actual en uso: <b>Bs. {proposedRate.currentRate.toFixed(4)}</b> → Nueva tasa oficial:{' '}
                  <b style={{ color: '#1d4ed8' }}>Bs. {proposedRate.newRate.toFixed(4)}</b> (Variación:{' '}
                  <span style={{ fontWeight: 700, color: proposedRate.difference >= 0 ? '#15803d' : '#b91c1c' }}>
                    {proposedRate.difference >= 0 ? '+' : ''}{proposedRate.difference.toFixed(4)} (
                    {proposedRate.percentDiff >= 0 ? '+' : ''}{proposedRate.percentDiff.toFixed(2)}%)
                  </span>)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleKeepCurrentRate}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid #94a3b8',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Mantener actual
              </button>
              <button
                onClick={handleApplyProposedRate}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--brand-600)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(139,120,232,0.3)'
                }}
              >
                <Check size={14} /> Actualizar tasa
              </button>
            </div>
          </div>
        )}

        <Outlet />

        {/* Alma Floating AI Copilot Bubble */}
        <button
          className="alma-fab"
          onClick={() => navigate('/alma')}
          title="Preguntar a Alma AI"
        >
          <Sparkles size={24} />
        </button>
      </main>

      {/* Manual BCV Rate Modal */}
      <ManualBcvRateModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        currentRate={bcvRate}
        onRateUpdated={(newRate, future, src) => {
          setBcvRate(newRate);
          setIsFuture(future);
          setRateSource(src);
        }}
      />
    </div>
  );
}
