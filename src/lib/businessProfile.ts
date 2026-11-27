import { authenticatedFetch } from './supabase/api';

export interface BusinessProfile {
  businessName: string;
  slogan: string;
  rif: string;
  email: string;
  address: string;
  phone: string;
  whatsapp: string;
  logo: string | null;
  favicon: string | null;
}

export function slugify(text: string): string {
  if (!text) return 'tienda-demo';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function getStoreSlug(activeOrgSlug?: string | null): string {
  if (activeOrgSlug && activeOrgSlug !== 'demostras' && activeOrgSlug !== 'tienda-demo') {
    return activeOrgSlug;
  }
  const bp = getBusinessProfile();
  if (bp.businessName && bp.businessName !== 'Frenyer') {
    return slugify(bp.businessName);
  }
  return 'tienda-demo';
}

export async function refreshBusinessProfileFromServer(): Promise<BusinessProfile> {
  try {
    const res = await authenticatedFetch('/api/business-profile');
    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.data) {
        return saveBusinessProfile(json.data);
      }
    }
  } catch {
    // ignore
  }
  return getBusinessProfile();
}

export function getBusinessProfile(): BusinessProfile {
  try {
    const raw = localStorage.getItem('frenyer_business_profile');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {
    businessName: 'Frenyer',
    slogan: 'Gestión empresarial inteligente',
    rif: 'J-123456789',
    email: 'contacto@frenyer.com',
    address: 'Altamira de Caceres',
    phone: '+58 212 555 1212',
    whatsapp: '+584120000000',
    logo: null,
    favicon: null
  };
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