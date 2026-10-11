export interface BusinessProfile {
  businessName: string;
  rif: string;
  email: string;
  address: string;
  phone: string;
  whatsapp: string;
  logo: string | null;
  favicon: string | null;
}

const DEFAULT_PROFILE: BusinessProfile = {
  businessName: 'Frenyer, C.A.',
  rif: 'J-123456789',
  email: 'contacto@frenyer.com',
  address: 'Av. Francisco de Miranda, Centro Financiero, Caracas',
  phone: '+58 212 555 1212',
  whatsapp: '+584120000000',
  logo: null,
  favicon: null
};

export function getBusinessProfile(): BusinessProfile {
  try {
    const raw = localStorage.getItem('frenyer_business_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PROFILE;
}

export function saveBusinessProfile(profile: Partial<BusinessProfile>): BusinessProfile {
  const current = getBusinessProfile();
  const updated = { ...current, ...profile };
  try {
    localStorage.setItem('frenyer_business_profile', JSON.stringify(updated));
    if (updated.favicon) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = updated.favicon;
    }
    window.dispatchEvent(new CustomEvent('frenyer:business-profile-updated', { detail: updated }));
  } catch (e) {
    console.error('Error saving business profile:', e);
  }
  return updated;
}
