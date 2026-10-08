import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { Menu, Sparkles, RefreshCw, Edit3, ShieldAlert, AlertCircle, ArrowUpRight, Check, X, LogOut, Database } from 'lucide-react';
import { Sidebar } from '../components/ui/Sidebar';
import { ManualBcvRateModal } from '../components/modals/ManualBcvRateModal';
import { SupabaseConnectionModal } from '../components/modals/SupabaseConnectionModal';
import { AuthScreen } from '../components/auth/AuthScreen';
import { getActiveExchangeRate, setActiveExchangeRate, isFutureExchangeRate } from '../lib/currency';
import { isSupabaseConfigured, supabase } from '../lib/supabase/client';
import { getActiveOrgId } from '../lib/supabase/db';

const isAuthenticationRequired = import.meta.env.VITE_AUTH_REQUIRED === 'true';

export function DashboardLayout() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<'loading' | 'signedOut' | 'noOrganization' | 'authenticated'>(
    isAuthenticationRequired ? 'loading' : 'authenticated'
  );
  const [authMessage, setAuthMessage] = useState('');
  const [bcvRate, setBcvRate] = useState(() => getActiveExchangeRate());
  const [isFuture, setIsFuture] = useState(() => isFutureExchangeRate());
  const [rateSource, setRateSource] = useState(() => localStorage.getItem('frenyer_bcv_rate_source') || 'BCV');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(() => isSupabaseConfigured);

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
      if (!res.ok) {
        throw new Error(`No se pudo consultar la tasa BCV (HTTP ${res.status}).`);
      }
      const data = await res.json();
      const chosenRate = data.isFutureApplied && data.futureRate
        ? Number(data.futureRate)
        : Number(data.appliedRate ?? data.usdRate);
      if (!Number.isFinite(chosenRate) || chosenRate <= 0) {
        throw new Error('El servicio BCV no devolvió una tasa válida.');
      }

      const activeCurrent = getActiveExchangeRate();

      if (Math.abs(chosenRate - activeCurrent) > 0.0001 && rateSource === 'MANUAL' && !forceRefresh) {
        const diff = chosenRate - activeCurrent;
        const pct = activeCurrent > 0 ? (diff / activeCurrent) * 100 : 0;
        setProposedRate({
          newRate: chosenRate,
          currentRate: activeCurrent,
          difference: diff,
          percentDiff: pct,
          isFuture: Boolean(data.isFutureApplied),
          valueDate: data.valueDate || '',
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
    } catch (error) {
      console.error('No se pudo actualizar la tasa BCV:', error);
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
    if (new URLSearchParams(window.location.search).get('auth') === 'recovery') {
      setAuthMessage('');
      setAuthStatus('signedOut');
      return;
    }
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
    if (!isAuthenticationRequired) return;
    void checkAuthenticatedMembership();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') return;
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
    const handleDbConfigured = () => {
      setIsDbReady(true);
      void checkAuthenticatedMembership();
    };
    window.addEventListener('frenyer:supabase-configured', handleDbConfigured);
    return () => {
      window.removeEventListener('frenyer:rate-changed', handleRateEvent);
      window.removeEventListener('frenyer:supabase-configured', handleDbConfigured);
    };
  }, []);

  if (isAuthenticationRequired && authStatus !== 'authenticated') {
    return <AuthScreen
      isLoading={authStatus === 'loading'}
      isConfigured={isSupabaseConfigured}
      message={authMessage}
      canSignOut={authStatus === 'noOrganization'}
      onAuthenticated={checkAuthenticatedMembership}
      onSignOut={handleSignOut}
    />;
  }

  return (
    <div className="shell">
      {isMobileMenuOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onNavigate={() => setIsMobileMenuOpen(false)}
      />
      <main className="main" style={{ position: 'relative' }}>
        {!isAuthenticationRequired && (
          <div role="status" style={{
            padding: '9px 16px',
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            color: '#92400e',
            fontSize: 12,
            textAlign: 'center'
          }}>
            Vista previa sin inicio de sesión. Las operaciones de Supabase siguen protegidas y pueden requerir una cuenta.
          </div>
        )}
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-title">Frenyer · Gestión empresarial</div>

          {/* Right Header Area with BCV Pill & Actions */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            
            {/* Supabase Status Pill */}
            <button
              type="button"
              onClick={() => setIsSupabaseModalOpen(true)}
              title={isDbReady ? 'Base de datos Supabase conectada. Haga clic para detalles.' : 'Haga clic para conectar la base de datos Supabase.'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: isDbReady ? '#ecfdf5' : '#fffbeb',
                border: isDbReady ? '1px solid #a7f3d0' : '1px solid #fde68a',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: isDbReady ? '#065f46' : '#92400e',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Database size={14} style={{ color: isDbReady ? '#059669' : '#d97706' }} />
              <span>{isDbReady ? 'Supabase' : 'Conectar BD'}</span>
            </button>

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
            {isAuthenticationRequired && <button
              type="button"
              onClick={handleSignOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 7, color: '#475569', cursor: 'pointer' }}
            >
              <LogOut size={16} />
            </button>}
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

      {/* Supabase Connection Modal */}
      <SupabaseConnectionModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConnected={() => {
          setIsDbReady(true);
          void checkAuthenticatedMembership();
        }}
      />
    </div>
  );
}
