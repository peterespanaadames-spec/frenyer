import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { Menu, Sparkles, RefreshCw, Edit3, AlertCircle, ArrowUpRight, Check, X, Store, LogOut } from 'lucide-react';
import { Sidebar } from '../components/ui/Sidebar';
import { MobileHeader } from '../components/mobile/MobileHeader';
import { MobileBottomNav } from '../components/mobile/MobileBottomNav';
import { MobileMoreSheet } from '../components/mobile/MobileMoreSheet';
import { ManualBcvRateModal } from '../components/modals/ManualBcvRateModal';
import { OrganizationSelector } from '../components/ui/OrganizationSelector';
import { getActiveExchangeRate, setActiveExchangeRate, isFutureExchangeRate } from '../lib/currency';
import { getBusinessProfile, BusinessProfile, refreshBusinessProfileFromServer } from '../lib/businessProfile';
import { useAuth } from '../context/AuthContext';
import { InactivityLock } from '../components/auth/InactivityLock';
import { isInternalRole, defaultPermissionsForRole } from '../lib/auth/roles';
import { withSessionInit } from '../lib/supabase/api';

export function DashboardLayout() {
  const navigate = useNavigate();
  const [bcvRate, setBcvRate] = useState(() => getActiveExchangeRate());
  const [isFuture, setIsFuture] = useState(() => isFutureExchangeRate());
  const [rateSource, setRateSource] = useState(() => localStorage.getItem('frenyer_bcv_rate_source') || 'BCV');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  const { signOut, profile: authProfile, userOrganizations, activeOrganizationId } = useAuth();

  // Business Profile State (Nombre del negocio, RIF, etc.)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(() => getBusinessProfile());

  useEffect(() => {
    const handleProfileSync = () => {
      setBusinessProfile(getBusinessProfile());
    };
    window.addEventListener('frenyer:business-profile-updated', handleProfileSync);
    window.addEventListener('storage', handleProfileSync);
    return () => {
      window.removeEventListener('frenyer:business-profile-updated', handleProfileSync);
      window.removeEventListener('storage', handleProfileSync);
    };
  }, []);

  useEffect(() => {
    refreshBusinessProfileFromServer().then((p) => setBusinessProfile(p)).catch(() => {});
  }, []);

  // Estado de la sesion activa: solo se usa para el guard de rol
  useEffect(() => {
    const guardRole = async () => {
      // Si el perfil de autenticación en contexto ya es un rol interno, conceder paso y sincronizar
      if (authProfile?.role && isInternalRole(authProfile.role)) {
        localStorage.setItem('frenyer_user_role', authProfile.role);
        return;
      }

      // La sesión vive en el servidor: se consulta por HTTP con credenciales
      let sessionUser: { email?: string; name?: string; id?: string; user_metadata?: { role?: string } } | null = null;
      let sessionRole = '';
      let sessionPermissions: string[] | null = null;
      try {
        const sessionRes = await fetch('/api/auth/session', withSessionInit());
        if (sessionRes.ok) {
          const sessionJson = await sessionRes.json();
          sessionUser = sessionJson?.data?.user || null;
          sessionRole = (sessionJson?.data?.role || '').toLowerCase();
          if (Array.isArray(sessionJson?.data?.permissions) && sessionJson.data.permissions.length > 0) {
            sessionPermissions = sessionJson.data.permissions;
          }
        }
      } catch {
        return;
      }

      if (sessionRole && isInternalRole(sessionRole)) {
        localStorage.setItem('frenyer_user_role', sessionRole);
      } else if (sessionRole === 'cliente') {
        localStorage.setItem('frenyer_user_role', 'cliente');
        navigate('/', { replace: true });
        return;
      }

      if (sessionUser) {
        const metaRole = (sessionUser.user_metadata?.role || '').toLowerCase();
        if (metaRole === 'cliente' || metaRole === 'customer') {
          if (!isInternalRole(sessionRole)) {
            localStorage.setItem('frenyer_user_role', 'cliente');
            navigate('/', { replace: true });
            return;
          }
        }

        const effectiveName = sessionUser.name || sessionUser.email?.split('@')[0] || 'Usuario';
        const effectiveRole = sessionRole || 'Admin';
        const effectivePermissions = sessionPermissions || defaultPermissionsForRole(effectiveRole);
        const names = effectiveName.trim().split(/\s+/);
        const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();
        const config = {
          id: sessionUser.id,
          name: effectiveName,
          email: sessionUser.email || '',
          role: effectiveRole,
          title: 'Personal Asociado',
          active: true,
          initials,
          permissions: effectivePermissions
        };
        localStorage.setItem('frenyer_active_user', JSON.stringify(config));
        localStorage.setItem('frenyer_user_permissions', JSON.stringify(config.permissions));
        localStorage.setItem('frenyer_user_role', config.role);
      }
    };
    guardRole();
  }, [navigate, signOut, authProfile]);

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
    return () => {
      window.removeEventListener('frenyer:rate-changed', handleRateEvent);
    };
  }, []);

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
        <MobileHeader />
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
          <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {businessProfile.logo ? (
              <img src={businessProfile.logo} alt={businessProfile.businessName} style={{ maxHeight: 28, maxWidth: 120, objectFit: 'contain' }} />
            ) : (
              businessProfile.businessName || 'Frenyer'
            )}
          </div>

          {/* Right Header Area with BCV Pill & Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

            {/* Live BCV Exchange Rate Pill (Cashea Yellow Highlight Pill) */}
            <div
              onClick={() => setIsManualModalOpen(true)}
              title="Haga clic para modificar la tasa de cambio"
              className="topbar-bcv-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#FFF275',
                border: '1px solid #FDF06F',
                borderRadius: 9999,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 800,
                color: '#1F2937',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FDF06F';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFF275';
              }}
            >
              Bs. {bcvRate.toFixed(2)}
            </div>

            <button
              type="button"
              onClick={() => {
                const activeOrg = userOrganizations.find(o => o.isActive) || userOrganizations.find(o => o.id === activeOrganizationId) || userOrganizations[0];
                const slug = activeOrg?.slug || 'demostras';
                navigate(`/tienda/${slug}`);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 9999,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#111827',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Abrir Tienda Online (Catálogo público)"
            >
              <Store size={14} color="#111827" strokeWidth={2.4} />{' '}
              <span className="topbar-store-label">Tienda Online</span>
            </button>

            {/* Selector de organización activa (solo usuarios con acceso a varias organizaciones) */}
            <OrganizationSelector />

            {/* Botón Cerrar Sesión */}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/', { replace: true });
              }}
              title="Cerrar sesión"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 9999,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#4B5563',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#DC2626';
                e.currentTarget.style.borderColor = '#FCA5A5';
                e.currentTarget.style.background = '#FEF2F2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#4B5563';
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              <LogOut size={15} />
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
                  background: '#2563EB',
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
                  boxShadow: '0 2px 6px rgba(45, 46, 50,0.3)'
                }}
              >
                <Check size={14} /> Actualizar tasa
              </button>
            </div>
          </div>
        )}

        <Outlet />

        <MobileBottomNav onMore={() => setIsMoreSheetOpen(true)} />
        <MobileMoreSheet
          open={isMoreSheetOpen}
          onClose={() => setIsMoreSheetOpen(false)}
          permissions={(() => {
            try {
              const s = localStorage.getItem('frenyer_user_permissions');
              if (s) {
                const p = JSON.parse(s);
                if (Array.isArray(p)) return p;
              }
            } catch {}
            return ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'];
          })()}
        />

        {/* Alma Copilot: oculto temporalmente (el módulo y la ruta /alma siguen disponibles) */}
        {false && (
          <button
            className="alma-fab"
            onClick={() => navigate('/alma')}
            title="Preguntar a Alma AI"
          >
            <Sparkles size={24} />
          </button>
        )}
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
      {/* Bloqueo por inactividad (60 s) */}
      <InactivityLock />
    </div>
  );
}
