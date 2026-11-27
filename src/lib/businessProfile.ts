import { authenticatedFetch } from './supabase/api';

export interface BusinessProfile {
  organizationId?: string;
  slug?: string;
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

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  businessName: 'Shop Frenyer',
  slogan: 'Tienda Online Oficial',
  rif: 'J-00000000-1',
  email: 'frenyer@correo.com',
  address: 'Barinas',
  phone: '+584120000000',
  whatsapp: '+58412000000',
  logo: null,
  favicon: null
};

export function slugify(text: string): string {
  if (!text) return 'shop-frenyer';
  const clean = text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'shop-frenyer';
}

export function getStoreSlug(activeOrgSlug?: string | null): string {
  if (activeOrgSlug && activeOrgSlug !== 'demostras' && activeOrgSlug !== 'tienda-demo') {
    return activeOrgSlug;
  }
  const bp = getBusinessProfile();
  if (bp.slug && bp.slug !== 'demostras' && bp.slug !== 'tienda-demo') {
    return bp.slug;
  }
  if (bp.businessName && bp.businessName.trim() !== '') {
    return slugify(bp.businessName);
  }
  return 'shop-frenyer';
}

function resolveOrgKey(organizationId?: string | null): string {
  if (organizationId && organizationId.trim()) return organizationId.trim();
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('frenyer_org_id');
    if (stored && stored.trim()) return stored.trim();
  }
  return 'default';
}

function getStorageKey(organizationId?: string | null): string {
  return `frenyer_business_profile_${resolveOrgKey(organizationId)}`;
}

/** Rellena únicamente los campos de texto vacíos con los valores de ejemplo por defecto. */
export function withBusinessDefaults(profile?: Partial<BusinessProfile> | null): BusinessProfile {
  const source = profile || {};
  return {
    organizationId: source.organizationId,
    slug: source.slug,
    businessName: source.businessName?.trim() || DEFAULT_BUSINESS_PROFILE.businessName,
    slogan: source.slogan?.trim() || DEFAULT_BUSINESS_PROFILE.slogan,
    rif: source.rif?.trim() || DEFAULT_BUSINESS_PROFILE.rif,
    email: source.email?.trim() || DEFAULT_BUSINESS_PROFILE.email,
    address: source.address?.trim() || DEFAULT_BUSINESS_PROFILE.address,
    phone: source.phone?.trim() || DEFAULT_BUSINESS_PROFILE.phone,
    whatsapp: source.whatsapp?.trim() || DEFAULT_BUSINESS_PROFILE.whatsapp,
    logo: source.logo ?? null,
    favicon: source.favicon ?? null
  };
}

/** Aplica el título y favicon del negocio activo al documento del navegador. */
export function applyBrandingToDocument(
  profile: { businessName?: string; favicon?: string | null },
  customTitle?: string
): void {
  if (typeof document === 'undefined') return;
  const targetTitle =
    customTitle ||
    (profile.businessName?.trim()
      ? `${profile.businessName.trim()} — Frenyer ERP`
      : 'Frenyer — Sistema de Gestión Comercial Bimonetario');
  document.title = targetTitle;

  const iconHref = profile.favicon?.trim() || '/favicon.svg';
  const relSelectors = ["link[rel='icon']", "link[rel='shortcut icon']", "link[rel='apple-touch-icon']"];
  let updatedAny = false;

  relSelectors.forEach((selector) => {
    const link = document.querySelector(selector) as HTMLLinkElement | null;
    if (link) {
      link.href = iconHref;
      updatedAny = true;
    }
  });

  if (!updatedAny) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = iconHref;
    document.head.appendChild(link);
  }
}

export async function uploadBusinessAsset(kind: 'logo' | 'favicon', file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });

  const res = await authenticatedFetch('/api/business-profile/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      fileName: file.name,
      mimeType: file.type,
      dataBase64
    })
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json?.data?.url) {
    throw new Error(json?.error || 'No se pudo subir el archivo al almacenamiento del negocio.');
  }
  return String(json.data.url);
}

export async function refreshBusinessProfileFromServer(organizationId?: string | null): Promise<BusinessProfile> {
  try {
    const res = await authenticatedFetch('/api/business-profile');
    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.data) {
        const merged = withBusinessDefaults(json.data);
        return saveBusinessProfile(merged, organizationId || json.data.organizationId);
      }
    }
  } catch {
    // ignore
  }
  return getBusinessProfile(organizationId);
}

export function getBusinessProfile(organizationId?: string | null): BusinessProfile {
  try {
    if (typeof window !== 'undefined') {
      const scopedRaw = localStorage.getItem(getStorageKey(organizationId));
      if (scopedRaw) {
        return withBusinessDefaults(JSON.parse(scopedRaw));
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_BUSINESS_PROFILE };
}

export function saveBusinessProfile(
  profile: Partial<BusinessProfile>,
  organizationId?: string | null
): BusinessProfile {
  const orgKey = organizationId || profile.organizationId;
  const current = getBusinessProfile(orgKey);
  const updated = withBusinessDefaults({ ...current, ...profile });
  if ('logo' in profile) {
    updated.logo = profile.logo ?? null;
  }
  if ('favicon' in profile) {
    updated.favicon = profile.favicon ?? null;
  }
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(orgKey), JSON.stringify(updated));
      applyBrandingToDocument(updated);
      window.dispatchEvent(new CustomEvent('frenyer:business-profile-updated', { detail: updated }));
    }
  } catch (e) {
    console.error('Error saving business profile:', e);
  }
  return updated;
}