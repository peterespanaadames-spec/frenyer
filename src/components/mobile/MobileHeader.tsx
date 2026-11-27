import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { BusinessProfile, getBusinessProfile } from '../../lib/businessProfile';
import { getActiveExchangeRate } from '../../lib/currency';
import { useAuth } from '../../context/AuthContext';

export function MobileHeader() {
  const navigate = useNavigate();
  const { activeOrganizationId } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(() => getBusinessProfile(activeOrganizationId));
  const rate = getActiveExchangeRate();

  useEffect(() => {
    setProfile(getBusinessProfile(activeOrganizationId));
    const handleUpdate = () => setProfile(getBusinessProfile(activeOrganizationId));
    window.addEventListener('frenyer:business-profile-updated', handleUpdate);
    return () => window.removeEventListener('frenyer:business-profile-updated', handleUpdate);
  }, [activeOrganizationId]);

  return (
    <header className="mobile-header">
      <div className="mobile-header__brand">
        {profile.logo ? (
          <img
            src={profile.logo}
            alt={profile.businessName}
            referrerPolicy="no-referrer"
            className="mobile-header__logo-img"
          />
        ) : (
          <span className="mobile-header__logo">{profile.businessName}</span>
        )}
      </div>
      <div className="mobile-header__center">
        <button type="button" className="mobile-header__rate" onClick={() => navigate('/cuentas/caja')} title="Tasa de cambio">
          Bs. {rate.toFixed(2)}
        </button>
      </div>
      <div className="mobile-header__actions">
        <button type="button" className="mobile-header__icon" aria-label="Notificaciones">
          <Bell size={16} />
        </button>
        <button type="button" className="mobile-header__avatar" aria-label="Perfil" onClick={() => navigate('/configuracion')}>
          <User size={16} />
        </button>
      </div>
    </header>
  );
}
