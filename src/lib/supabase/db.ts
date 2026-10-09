import { supabase, isSupabaseConfigured } from './client';
import { authenticatedFetch } from './api';

export interface DbCustomer {
  id: string;
  organization_id?: string;
  code?: string;
  name: string;
  doc_type: string;
  doc_number: string;
  phone?: string;
  email?: string;
  credit_limit: number;
  address?: string;
  status: 'Activo' | 'Inactivo';
  orders_count: number;
  total_spent_usd: number;
  last_order_date?: string;
  created_at?: string;
}

export interface DbSupplier {
  id: string;
  organization_id?: string;
  code?: string;
  name: string;
  doc_type: string;
  doc_number: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  balance_usd: number;
  status: 'Activo' | 'Inactivo';
  created_at?: string;
}

export interface DbBranch {
  id?: string;
  organization_id?: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  status: 'Habilitada' | 'Deshabilitada';
  is_active: boolean;
  cash_registers?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DbProduct {
  id?: string;
  organization_id?: string;
  branch_id?: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  cost_usd: number;
  price_usd: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url?: string;
  status: string;
  created_at?: string;
}

export interface DbSale {
  id?: string;
  organization_id?: string;
  branch_id?: string;
  customer_id?: string;
  user_id?: string;
  doc_type: 'FACTURA' | 'NOTA' | 'ESPERA' | 'COTIZACION';
  doc_number: string;
  status: 'COMPLETADA' | 'EN_ESPERA' | 'ANULADA';
  payment_type: 'CONTADO' | 'CREDITO';
  exchange_rate: number;
  is_future_rate?: boolean;
  rate_source?: string;
  rate_value_date?: string;
  subtotal_usd: number;
  discount_usd: number;
  tax_usd: number;
  igtf_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  quote_status?: 'Creada' | 'Facturada' | 'Rechazada' | 'Pagada';
  expires_at?: string;
  converted_to_sale_id?: string;
  created_at?: string;
}

export interface DbQuoteItem {
  id?: string;
  sale_id: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  total_ves: number;
}

export interface DbQuote {
  id: string;
  organization_id?: string;
  customer_id?: string;
  user_id?: string;
  doc_number: string;
  status: string;
  payment_type: string;
  exchange_rate: number;
  subtotal_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  quote_status?: 'Creada' | 'Facturada' | 'Rechazada' | 'Pagada';
  expires_at?: string;
  converted_to_sale_id?: string;
  created_at?: string;
  customer?: { id?: string; name?: string; phone?: string; doc_type?: string; doc_number?: string; email?: string };
  customers?: { id?: string; name?: string; phone?: string; doc_type?: string; doc_number?: string; email?: string };
  items?: DbQuoteItem[];
  sale_items?: DbQuoteItem[];
  vendor_name?: string;
}

export interface DbSaleItem {
  id?: string;
  sale_id: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  total_ves: number;
}

export interface DbInventoryMovement {
  id: string;
  organization_id?: string;
  branch_id?: string;
  product_id?: string;
  sku: string;
  product_name: string;
  movement_type: 'ENTRADA' | 'SALIDA' | 'COMPRA' | 'VENTA' | 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA' | 'AJUSTE_CORRECCION' | 'DEVOLUCION' | string;
  doc_type: string;
  doc_number: string;
  entity_type?: string;
  entity_name?: string;
  quantity: number;
  unit_cost_usd: number;
  unit_price_usd: number;
  exchange_rate: number;
  total_usd: number;
  total_ves: number;
  previous_stock?: number;
  new_stock?: number;
  reason?: string;
  notes?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function fetchCustomersFromSupabase(): Promise<DbCustomer[]> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/customers');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  // 2. Direct Supabase client
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error querying Supabase customers:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching customers from Supabase:', err);
    return [];
  }
}

export async function createCustomerInSupabase(customer: Omit<DbCustomer, 'id' | 'created_at'>): Promise<DbCustomer | null> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customer)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const orgId = await getActiveOrgId();
    const payload: any = { ...customer };
    if (orgId && !payload.organization_id) {
      payload.organization_id = orgId;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating customer in Supabase:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Network error creating customer in Supabase:', err);
    return null;
  }
}

export async function updateCustomerInSupabase(id: string, updates: Partial<DbCustomer>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating customer in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error updating customer in Supabase:', err);
    return false;
  }
}

export async function deleteCustomerFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting customer from Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error deleting customer from Supabase:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SUPPLIERS
// ---------------------------------------------------------------------------

export async function fetchSuppliersFromSupabase(organizationId?: string): Promise<DbSupplier[]> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/suppliers');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const scopedOrganizationId = organizationId || await getActiveOrgId();
    if (!scopedOrganizationId) {
      return [];
    }

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', scopedOrganizationId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching suppliers from Supabase:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching suppliers from Supabase:', err);
    return [];
  }
}

export async function createSupplierInSupabase(
  supplier: Omit<DbSupplier, 'id' | 'created_at'> & { id?: string }
): Promise<DbSupplier | null> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return {
          ...json.data,
          address: supplier.address || json.data.address || ''
        };
      }
    }
  } catch {
    // Fall back
  }

  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const orgId = await getActiveOrgId();
    if (!orgId) {
      console.error('Cannot create supplier without an authenticated organization membership.');
      return null;
    }

    const payload: any = {
      organization_id: orgId,
      code: supplier.code || `PRV-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      name: supplier.name,
      doc_type: supplier.doc_type || 'RIF (J / G / V)',
      doc_number: supplier.doc_number || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      category: supplier.category || 'General',
      balance_usd: Number(supplier.balance_usd) || 0,
      status: supplier.status || 'Activo'
    };

    if (supplier.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplier.id)) {
      payload.id = supplier.id;
    }

    let currentPayload = { ...payload };
    let attempts = 0;
    while (attempts < 6) {
      attempts++;
      const { data, error } = await supabase
        .from('suppliers')
        .insert([currentPayload])
        .select()
        .single();

      if (!error && data) {
        return {
          ...data,
          address: supplier.address || data.address || ''
        };
      }

      if (error) {
        const match = error.message.match(/Could not find the '([^']+)' column of 'suppliers'/i);
        if (match && match[1] && match[1] in currentPayload) {
          console.warn(`Columna '${match[1]}' no disponible en 'suppliers' de Supabase; reintentando sin ella...`);
          delete currentPayload[match[1]];
          continue;
        }
        console.error('Error creating supplier in Supabase:', error.message);
        break;
      }
    }
  } catch (err) {
    console.error('Network error creating supplier in Supabase:', err);
  }

  return null;
}

export async function updateSupplierInSupabase(id: string, updates: Partial<DbSupplier>): Promise<boolean> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/suppliers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch {
    // Fall back
  }

  if (!isSupabaseConfigured) return false;

  try {
    let currentUpdates = { ...updates };
    let attempts = 0;
    while (attempts < 6) {
      attempts++;
      const { error } = await supabase
        .from('suppliers')
        .update(currentUpdates)
        .eq('id', id);

      if (!error) {
        return true;
      }

      const match = error.message.match(/Could not find the '([^']+)' column of 'suppliers'/i);
      if (match && match[1] && match[1] in currentUpdates) {
        console.warn(`Columna '${match[1]}' no disponible en 'suppliers' de Supabase; reintentando actualización sin ella...`);
        delete (currentUpdates as any)[match[1]];
        continue;
      }

      console.error('Error updating supplier in Supabase:', error.message);
      break;
    }
    return false;
  } catch (err) {
    console.error('Network error updating supplier in Supabase:', err);
    return false;
  }
}

export async function deleteSupplierFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting supplier from Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error deleting supplier from Supabase:', err);
    return false;
  }
}

export async function getActiveOrgId(): Promise<string | null> {
  // 1. Intentar sesión activa de Supabase Auth
  try {
    const { data: authData } = await supabase.auth.getSession();
    if (authData?.session?.user?.id) {
      const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', authData.session.user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (data && data.length > 0 && data[0].organization_id) {
        return data[0].organization_id;
      }
    }
  } catch (err) {
    console.warn('Error resolviendo membresía activa:', err);
  }

  // 2. Intentar leer organización almacenada en localStorage
  if (typeof window !== 'undefined') {
    const storedOrg = localStorage.getItem('frenyer_org_id');
    if (storedOrg) return storedOrg;
  }

  // 3. Fallback: consultar la primera organización registrada en Supabase
  if (isSupabaseConfigured) {
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);
      if (orgs && orgs.length > 0 && orgs[0].id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_org_id', orgs[0].id);
        }
        return orgs[0].id;
      }
    } catch {
      // ignore
    }

    // 3.B Fallback a través de productos existentes
    try {
      const { data: prods } = await supabase
        .from('products')
        .select('organization_id')
        .not('organization_id', 'is', null)
        .limit(1);
      if (prods && prods.length > 0 && prods[0].organization_id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_org_id', prods[0].organization_id);
        }
        return prods[0].organization_id;
      }
    } catch {
      // ignore
    }

    // 3.C Fallback a través de cuentas bancarias
    try {
      const { data: banks } = await supabase
        .from('bank_accounts')
        .select('organization_id')
        .not('organization_id', 'is', null)
        .limit(1);
      if (banks && banks.length > 0 && banks[0].organization_id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_org_id', banks[0].organization_id);
        }
        return banks[0].organization_id;
      }
    } catch {
      // ignore
    }
  }

  // 4. UUID por defecto para entornos demo/locales
  return '00000000-0000-0000-0000-000000000001';
}

// ---------------------------------------------------------------------------
// PRODUCTS / INVENTORY
// ---------------------------------------------------------------------------

export async function fetchProductsFromSupabase(): Promise<DbProduct[]> {
  // 1. Try local server proxy (immune to iframe CORS and ad-blockers)
  try {
    const res = await authenticatedFetch('/api/products');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  // 2. Direct Supabase client fallback
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error querying Supabase products:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching products from Supabase:', err);
    return [];
  }
}

export function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export async function createProductInSupabase(product: DbProduct): Promise<{ success: boolean; data?: DbProduct; error?: string }> {
  const sanitizedProduct = { ...product };
  if (sanitizedProduct.branch_id && !isValidUuid(sanitizedProduct.branch_id)) {
    delete sanitizedProduct.branch_id;
  }

  // 1. Try local server proxy first
  try {
    const res = await authenticatedFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitizedProduct)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true, data: json.data };
      } else if (json.error) {
        if (/uuid|branch_id|branches|foreign key/i.test(json.error) && sanitizedProduct.branch_id) {
          const retryProd = { ...sanitizedProduct };
          delete retryProd.branch_id;
          const retryRes = await authenticatedFetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryProd)
          });
          if (retryRes.ok) {
            const retryJson = await retryRes.json();
            if (retryJson.success) return { success: true, data: retryJson.data };
          }
        }
        return { success: false, error: json.error };
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client fallback
  try {
    const orgId = await getActiveOrgId();
    let payload: any = { ...sanitizedProduct };
    if (orgId && !payload.organization_id) {
      payload.organization_id = orgId;
    }
    if (payload.branch_id && !isValidUuid(payload.branch_id)) {
      delete payload.branch_id;
    }

    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if (/uuid|branch_id|branches|foreign key/i.test(error.message) && payload.branch_id) {
        const retryPayload = { ...payload };
        delete retryPayload.branch_id;
        const retryResult = await supabase
          .from('products')
          .insert([retryPayload])
          .select()
          .single();
        if (!retryResult.error && retryResult.data) {
          return { success: true, data: retryResult.data };
        }
      }
      console.error('Error inserting product in Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('Network error creating product in Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function updateProductInSupabase(sku: string, updates: Partial<DbProduct>): Promise<{ success: boolean; error?: string }> {
  const sanitizedUpdates = { ...updates };
  if (sanitizedUpdates.branch_id && !isValidUuid(sanitizedUpdates.branch_id)) {
    delete sanitizedUpdates.branch_id;
  }

  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitizedUpdates)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return { success: true };
      if (json.error) {
        if (/uuid|branch_id|branches|foreign key/i.test(json.error) && sanitizedUpdates.branch_id) {
          const retryUpdates = { ...sanitizedUpdates };
          delete retryUpdates.branch_id;
          const retryRes = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryUpdates)
          });
          if (retryRes.ok) {
            const retryJson = await retryRes.json();
            if (retryJson.success) return { success: true };
          }
        }
        return { success: false, error: json.error };
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    let payload: any = { ...sanitizedUpdates };
    if (payload.branch_id && !isValidUuid(payload.branch_id)) {
      delete payload.branch_id;
    }

    const { error } = await supabase
      .from('products')
      .update(payload)
      .eq('sku', sku);

    if (error) {
      if (/uuid|branch_id|branches|foreign key/i.test(error.message) && payload.branch_id) {
        const retryPayload = { ...payload };
        delete retryPayload.branch_id;
        const retryResult = await supabase
          .from('products')
          .update(retryPayload)
          .eq('sku', sku);
        if (!retryResult.error) {
          return { success: true };
        }
      }
      console.error('Error updating product in Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Network error updating product in Supabase:', err);
    return { success: false, error: err?.message || 'Error de red' };
  }
}

export async function deleteProductFromSupabase(sku: string): Promise<{ success: boolean; error?: string }> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return { success: true };
      if (json.error) return { success: false, error: json.error };
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('sku', sku);

    if (error) {
      console.error('Error deleting product from Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Network error deleting product from Supabase:', err);
    return { success: false, error: err?.message || 'Error de red' };
  }
}

export async function updateProductStockInSupabase(sku: string, newStock: number): Promise<boolean> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: newStock })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const { error } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('sku', sku);

    if (error) {
      console.error('Error updating product stock in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error updating stock in Supabase:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SALES & POS EMISSION
// ---------------------------------------------------------------------------

export async function recordSaleInSupabase(
  sale: DbSale,
  items: DbSaleItem[],
  payments: Array<{ method: string; amount_usd: number; amount_ves: number; exchange_rate: number }>
): Promise<{ success: boolean; saleId?: string; error?: string }> {
  try {
    const organizationId = sale.organization_id || await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para registrar la venta.' };
    }

    // Sanitize sale object to strictly match sales table schema in database
    const cleanSale = {
      organization_id: organizationId,
      branch_id: sale.branch_id || null,
      customer_id: sale.customer_id || null,
      user_id: sale.user_id || null,
      doc_type: sale.doc_type || 'FACTURA',
      doc_number: sale.doc_number,
      status: sale.status || 'COMPLETADA',
      payment_type: sale.payment_type || 'CONTADO',
      exchange_rate: sale.exchange_rate,
      subtotal_usd: sale.subtotal_usd || 0,
      discount_usd: sale.discount_usd || 0,
      tax_usd: sale.tax_usd || 0,
      igtf_usd: sale.igtf_usd || 0,
      total_usd: sale.total_usd || 0,
      total_ves: sale.total_ves || 0,
      notes: sale.notes || null,
      created_at: sale.created_at || new Date().toISOString()
    };

    // 1. Insert Sale record
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([cleanSale])
      .select()
      .single();

    if (saleError || !saleData) {
      console.error('Error inserting sale into Supabase:', saleError?.message);
      return { success: false, error: saleError?.message || 'Supabase no devolvió la venta registrada.' };
    }

    const saleId = saleData.id;

    // 2. Insert Sale Items (strictly match sale_items table columns)
    if (items.length > 0) {
      const itemsToInsert = items.map(it => ({
        sale_id: saleId,
        product_id: it.product_id || null,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity || 1,
        unit_price_usd: it.unit_price_usd,
        total_usd: it.total_usd,
        total_ves: it.total_ves
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting sale items:', itemsError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se guardaron sus productos: ${itemsError.message}` };
      }
    }

    // 3. Insert Payments
    if (payments.length > 0) {
      const isValidUuid = (val?: string | null) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

      const paymentsToInsert = payments.map(p => ({
        sale_id: saleId,
        method: p.method,
        amount_usd: p.amount_usd,
        amount_ves: p.amount_ves,
        exchange_rate: p.exchange_rate,
        bank_account_id: isValidUuid((p as any).bank_account_id) ? (p as any).bank_account_id : null
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) {
        console.error('Error inserting sale payments:', paymentsError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se guardaron sus pagos: ${paymentsError.message}` };
      }

      // Actualizar balances en cuentas bancarias registradas en tesorería
      for (const p of payments) {
        const bankId = (p as any).bank_account_id;
        if (isValidUuid(bankId)) {
          try {
            const { data: bAcc } = await supabase
              .from('bank_accounts')
              .select('id, balance, currency')
              .eq('id', bankId)
              .maybeSingle();
            if (bAcc) {
              const addAmount = bAcc.currency === 'VES' ? p.amount_ves : p.amount_usd;
              const newBal = (Number(bAcc.balance) || 0) + addAmount;
              await supabase
                .from('bank_accounts')
                .update({ balance: newBal })
                .eq('id', bankId);
            }
          } catch (e) {
            console.error('Error updating bank balance for sale payment:', e);
          }
        }
      }
    }

    // 4. Deduct Stocks & Register Inventory Movements in real-time
    for (const item of items) {
      const { data: currentProd, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('sku', item.sku)
        .single();

      if (productError) {
        console.error(`Error loading stock for ${item.sku}:`, productError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se pudo actualizar el inventario de ${item.sku}.` };
      }
      if (currentProd) {
        const prevStock = Number(currentProd.stock) || 0;
        const qtySold = Number(item.quantity) || 1;
        const nextStock = Math.max(0, prevStock - qtySold);

        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: nextStock })
          .eq('sku', item.sku);

        if (stockError) {
          console.error(`Error updating stock for ${item.sku}:`, stockError.message);
          return { success: false, saleId, error: `La venta se creó, pero no se pudo actualizar el inventario de ${item.sku}.` };
        }

        // Registrar trazabilidad en el kárdex de inventory_movements
        try {
          const itemTotalUsd = Number(item.total_usd) || (qtySold * (Number(item.unit_price_usd) || 0));
          const itemTotalVes = Number(item.total_ves) || (itemTotalUsd * (Number(cleanSale.exchange_rate) || 1));

          await supabase
            .from('inventory_movements')
            .insert([{
              organization_id: organizationId,
              branch_id: currentProd.branch_id || cleanSale.branch_id || null,
              product_id: currentProd.id || item.product_id || null,
              sku: item.sku,
              product_name: item.name || currentProd.name,
              movement_type: 'VENTA',
              doc_type: cleanSale.doc_type || 'FACTURA',
              doc_number: cleanSale.doc_number,
              entity_type: 'CLIENTE',
              entity_name: cleanSale.customer_id ? 'Cliente' : 'Cliente Mostrador',
              quantity: -Math.abs(qtySold),
              unit_cost_usd: Number(currentProd.cost_usd) || 0,
              unit_price_usd: Number(item.unit_price_usd) || Number(currentProd.price_usd) || 0,
              exchange_rate: cleanSale.exchange_rate,
              total_usd: itemTotalUsd,
              total_ves: itemTotalVes,
              previous_stock: prevStock,
              new_stock: nextStock,
              reason: `Venta POS (${cleanSale.doc_type || 'Factura'})`,
              notes: cleanSale.notes || null,
              created_at: cleanSale.created_at
            }]);
        } catch (movErr: any) {
          console.warn('Aviso registrando inventory_movement para venta:', movErr?.message);
        }
      }
    }

    // 5. If Crédito, insert into accounts_receivable
    if (sale.payment_type === 'CREDITO' && sale.customer_id) {
      await supabase
        .from('accounts_receivable')
        .insert([{
          customer_id: sale.customer_id,
          sale_id: saleId,
          doc_number: sale.doc_number,
          total_usd: sale.total_usd,
          balance_usd: sale.total_usd,
          status: 'PENDIENTE'
        }]);
    }

    return { success: true, saleId };
  } catch (err: any) {
    console.error('Network error executing sale in Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

// ---------------------------------------------------------------------------
// COTIZACIONES / PRESUPUESTOS (Almacenadas en la tabla sales con doc_type = 'COTIZACION')
// ---------------------------------------------------------------------------

export async function fetchQuotesFromSupabase(): Promise<DbQuote[]> {
  const localQuotes: DbQuote[] = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]')
    : [];

  // 1. Intentar proxy del servidor primero si está disponible
  try {
    const res = await authenticatedFetch('/api/quotes');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch {
    // Si falla el proxy, intentar cliente directo
  }

  if (!isSupabaseConfigured) {
    return localQuotes;
  }

  // 2. Cliente directo de Supabase: consulta sobre la tabla core 'sales'
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        organization_id,
        customer_id,
        doc_number,
        status,
        payment_type,
        exchange_rate,
        subtotal_usd,
        total_usd,
        total_ves,
        notes,
        quote_status,
        expires_at,
        converted_to_sale_id,
        created_at,
        customers (id, name, phone, doc_type, doc_number, email),
        sale_items (
          id,
          sku,
          name,
          quantity,
          unit_price_usd,
          total_usd,
          total_ves
        )
      `)
      .eq('doc_type', 'COTIZACION')
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback sin columnas extendidas si no existen
      const fallback = await supabase
        .from('sales')
        .select(`
          id,
          organization_id,
          customer_id,
          doc_number,
          status,
          payment_type,
          exchange_rate,
          subtotal_usd,
          total_usd,
          total_ves,
          notes,
          created_at,
          customers (id, name, phone, doc_type, doc_number, email),
          sale_items (
            id,
            sku,
            name,
            quantity,
            unit_price_usd,
            total_usd,
            total_ves
          )
        `)
        .eq('doc_type', 'COTIZACION')
        .order('created_at', { ascending: false });

      if (!fallback.error && fallback.data) {
        const enriched = (fallback.data as any[]).map(q => ({
          ...q,
          quote_status: q.status === 'CANCELADA' ? 'Rechazada' : 'Creada',
          expires_at: null,
          converted_to_sale_id: null,
          items: q.sale_items || []
        })) as DbQuote[];
        return enriched;
      }

      console.warn('Aviso al consultar cotizaciones en Supabase:', error.message);
      return localQuotes;
    }

    const dbQuotes = (data || []).map((q: any) => ({
      ...q,
      customer: q.customers || q.customer,
      items: q.sale_items || q.items || []
    })) as DbQuote[];

    // Si la base de datos tiene cotizaciones, devolverlas (unificando cualquier cotización local no persistida)
    if (dbQuotes.length > 0) {
      const dbIds = new Set(dbQuotes.map(q => q.id));
      const missingLocal = localQuotes.filter(lq => !dbIds.has(lq.id));
      return [...dbQuotes, ...missingLocal];
    }

    return localQuotes;
  } catch (err) {
    console.warn('Aviso de red consultando cotizaciones en Supabase:', err);
    return localQuotes;
  }
}

export async function createQuoteInSupabase(input: {
  customerId?: string;
  validityDays: number;
  notes: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>;
  exchangeRate: number;
  rateSource?: string;
  isFutureRate?: boolean;
  rateValueDate?: string;
}): Promise<{ success: boolean; quoteId?: string; docNumber?: string; error?: string }> {
  try {
    let organizationId = await getActiveOrgId();
    if (!organizationId) {
      organizationId = '00000000-0000-0000-0000-000000000001';
    }

    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity * it.unit_price_usd), 0);
    const totalVes = Math.round(subtotal * input.exchangeRate * 100) / 100;

    // Obtener siguiente correlativo de cotizaciones de la tabla 'sales'
    const { data: latestQuotes } = await supabase
      .from('sales')
      .select('doc_number')
      .eq('doc_type', 'COTIZACION')
      .order('created_at', { ascending: false })
      .limit(1);

    const nextNum = latestQuotes && latestQuotes[0] ? (parseInt(latestQuotes[0].doc_number, 10) || 0) + 1 : 1;
    const docNumber = String(nextNum).padStart(4, '0');
    const expiresAt = new Date(Date.now() + (Math.max(1, input.validityDays || 7)) * 86400000).toISOString();

    // Inserción en la tabla core 'sales' (únicamente columnas que existen en sales)
    const salePayload: Record<string, any> = {
      organization_id: organizationId,
      customer_id: input.customerId || null,
      doc_type: 'COTIZACION',
      doc_number: docNumber,
      status: 'COMPLETADA',
      payment_type: 'CONTADO',
      exchange_rate: input.exchangeRate,
      subtotal_usd: subtotal,
      discount_usd: 0,
      tax_usd: 0,
      igtf_usd: 0,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: input.notes ? input.notes.trim() : null,
      quote_status: 'Creada',
      expires_at: expiresAt
    };

    let insertSaleRes = await supabase
      .from('sales')
      .insert([salePayload])
      .select('id, doc_number, created_at')
      .single();

    // Si falló por las columnas opcionales quote_status o expires_at, reintentar sin ellas
    if (
      insertSaleRes.error &&
      (insertSaleRes.error.message.includes('quote_status') ||
       insertSaleRes.error.message.includes('expires_at') ||
       (insertSaleRes.error as any).code === '42703')
    ) {
      delete salePayload.quote_status;
      delete salePayload.expires_at;
      insertSaleRes = await supabase
        .from('sales')
        .insert([salePayload])
        .select('id, doc_number, created_at')
        .single();
    }

    if (insertSaleRes.error || !insertSaleRes.data) {
      console.warn('Aviso guardando cotización en Supabase:', insertSaleRes.error?.message);
      // Fallback seguro a almacenamiento local para garantizar persistencia y no perder datos
      const localId = `local_quote_${Date.now()}`;
      if (typeof window !== 'undefined') {
        const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
        localQuotes.unshift({
          id: localId,
          organization_id: organizationId,
          customer_id: input.customerId,
          doc_number: docNumber,
          status: 'COMPLETADA',
          payment_type: 'CONTADO',
          exchange_rate: input.exchangeRate,
          subtotal_usd: subtotal,
          total_usd: subtotal,
          total_ves: totalVes,
          notes: input.notes,
          quote_status: 'Creada',
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          items: input.items,
          sale_items: input.items.map(it => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unit_price_usd: it.unit_price_usd,
            total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
            total_ves: Math.round(it.quantity * it.unit_price_usd * input.exchangeRate * 100) / 100
          }))
        });
        localStorage.setItem('frenyer_local_quotes', JSON.stringify(localQuotes));
      }
      return { success: true, quoteId: localId, docNumber };
    }

    const quoteId = insertSaleRes.data.id;

    // Inserción de ítems en la tabla core 'sale_items'
    if (input.items && input.items.length > 0) {
      const itemsToInsert = input.items.map(it => ({
        sale_id: quoteId,
        sku: it.sku,
        name: it.name,
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit_price_usd: Number(it.unit_price_usd) || 0,
        total_usd: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0) * 100) / 100,
        total_ves: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0) * input.exchangeRate * 100) / 100
      }));

      await supabase.from('sale_items').insert(itemsToInsert);
    }

    // Guardar espejo en local
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      localQuotes.unshift({
        id: quoteId,
        organization_id: organizationId,
        customer_id: input.customerId,
        doc_number: docNumber,
        status: 'COMPLETADA',
        payment_type: 'CONTADO',
        exchange_rate: input.exchangeRate,
        subtotal_usd: subtotal,
        total_usd: subtotal,
        total_ves: totalVes,
        notes: input.notes,
        quote_status: 'Creada',
        expires_at: expiresAt,
        created_at: insertSaleRes.data.created_at || new Date().toISOString(),
        items: input.items,
        sale_items: input.items
      });
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(localQuotes.slice(0, 50)));
    }

    return { success: true, quoteId, docNumber };
  } catch (err: any) {
    console.error('Error creando cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function getNextInvoiceCorrelative(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('doc_number')
      .eq('doc_type', 'FACTURA')
      .order('created_at', { ascending: false });

    const numbers: number[] = [];
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row.doc_number) {
          const match = String(row.doc_number).match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num)) numbers.push(num);
          }
        }
      }
    }

    if (typeof window !== 'undefined') {
      const localSales = JSON.parse(localStorage.getItem('frenyer_local_sales') || '[]');
      for (const s of localSales) {
        if (s.doc_type === 'FACTURA' && s.doc_number) {
          const match = String(s.doc_number).match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num)) numbers.push(num);
          }
        }
      }
    }

    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return String(maxNum + 1).padStart(4, '0');
  } catch (err) {
    console.warn('Error calculando correlativo de factura:', err);
    return '0001';
  }
}

export interface ConvertQuoteOptions {
  quoteId: string;
  paymentType: 'CONTADO' | 'CREDITO';
  customDocNumber?: string;
  // Opciones de Contado (Tesorería / Cuentas Bancarias):
  bankAccountId?: string;
  paymentMethod?: string;
  paymentReference?: string;
  // Opciones de Crédito (Cuentas por Cobrar):
  dueDate?: string;
  creditNotes?: string;
}

export async function convertQuoteToInvoiceInSupabase(
  quoteIdOrOptions: string | ConvertQuoteOptions,
  legacyPaymentType?: 'CONTADO' | 'CREDITO'
): Promise<{
  success: boolean;
  invoiceId?: string;
  invoiceDocNumber?: string;
  totalUsd?: number;
  totalVes?: number;
  paymentType?: 'CONTADO' | 'CREDITO';
  bankAccountName?: string;
  paymentMethod?: string;
  dueDate?: string;
  removedItems?: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }>;
  error?: string;
}> {
  try {
    const options: ConvertQuoteOptions = typeof quoteIdOrOptions === 'string'
      ? { quoteId: quoteIdOrOptions, paymentType: legacyPaymentType || 'CONTADO' }
      : quoteIdOrOptions;

    const { quoteId, paymentType = 'CONTADO' } = options;
    const organizationId = await getActiveOrgId() || '00000000-0000-0000-0000-000000000001';

    // 1. Obtener la cotización con sus ítems y datos de cliente
    let quote: any = null;
    let rawItems: any[] = [];

    const { data: dbQuote, error: qErr } = await supabase
      .from('sales')
      .select('*, sale_items(*), customers(name, doc_number)')
      .eq('id', quoteId)
      .maybeSingle();

    if (!qErr && dbQuote) {
      quote = dbQuote;
      rawItems = dbQuote.sale_items || [];
    } else if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const foundLocal = localQuotes.find((q: any) => q.id === quoteId);
      if (foundLocal) {
        quote = foundLocal;
        rawItems = (foundLocal.sale_items || foundLocal.items || []).map((it: any) => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unit_price_usd: it.unitPriceUSD || it.unit_price_usd,
          total_usd: it.totalUSD || it.total_usd,
          total_ves: it.totalVES || it.total_ves
        }));
      }
    }

    if (!quote) {
      return { success: false, error: 'No se encontró la cotización a convertir.' };
    }

    // 2. Determinar correlativo de la factura (verificando secuencia del sistema)
    let invDocNumber = '';
    if (options.customDocNumber && options.customDocNumber.trim()) {
      const trimmed = options.customDocNumber.trim();
      invDocNumber = /^\d+$/.test(trimmed) ? trimmed.padStart(4, '0') : trimmed;
    } else {
      invDocNumber = await getNextInvoiceCorrelative();
    }

    // 3. Verificación de inventario y descuento de stock
    const removedItems: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }> = [];
    const keptItems: any[] = [];
    let runningTotalUsd = 0;

    for (const it of rawItems) {
      const qty = Number(it.quantity) || 1;
      const unitPrice = Number(it.unit_price_usd) || 0;
      const itemSku = it.sku;

      if (!itemSku) {
        keptItems.push(it);
        runningTotalUsd += Number(it.total_usd) || (qty * unitPrice);
        continue;
      }

      const { data: prod } = await supabase
        .from('products')
        .select('id, stock, name')
        .eq('sku', itemSku)
        .maybeSingle();

      const currentStock = prod ? Number(prod.stock) || 0 : null;
      if (currentStock !== null && currentStock <= 0) {
        removedItems.push({
          sku: itemSku,
          name: it.name || prod?.name || itemSku,
          quantity: qty,
          available: 0,
          reason: 'Sin existencia disponible en inventario'
        });
        continue;
      }

      // Si hay producto y existencia, rebajar stock
      if (prod && currentStock !== null && currentStock > 0) {
        const nextStock = Math.max(0, currentStock - qty);
        await supabase
          .from('products')
          .update({ stock: nextStock })
          .eq('sku', itemSku);
      }

      keptItems.push(it);
      runningTotalUsd += Number(it.total_usd) || (qty * unitPrice);
    }

    if (keptItems.length === 0 && rawItems.length > 0) {
      return {
        success: false,
        removedItems,
        error: 'Ningún ítem de la cotización cuenta con stock disponible para facturar.'
      };
    }

    const exchangeRate = Number(quote.exchange_rate) || 1;
    const finalTotalUsd = keptItems.length === rawItems.length
      ? (Number(quote.total_usd) || runningTotalUsd)
      : Math.round(runningTotalUsd * 100) / 100;
    const finalTotalVes = Math.round(finalTotalUsd * exchangeRate * 100) / 100;

    // 4. Crear registro de FACTURA en la tabla sales
    const invoicePayload = {
      organization_id: quote.organization_id || organizationId,
      customer_id: quote.customer_id,
      doc_type: 'FACTURA',
      doc_number: invDocNumber,
      status: 'COMPLETADA',
      payment_type: paymentType,
      exchange_rate: exchangeRate,
      subtotal_usd: finalTotalUsd,
      discount_usd: quote.discount_usd || 0,
      tax_usd: quote.tax_usd || 0,
      igtf_usd: quote.igtf_usd || 0,
      total_usd: finalTotalUsd,
      total_ves: finalTotalVes,
      notes: `Factura generada desde Cotización COT-${quote.doc_number}.${options.creditNotes ? ' ' + options.creditNotes : (quote.notes ? ' ' + quote.notes : '')}`,
      created_at: new Date().toISOString()
    };

    let newInvoiceId = '';
    const { data: newInvoice, error: invErr } = await supabase
      .from('sales')
      .insert([invoicePayload])
      .select('id, doc_number')
      .single();

    if (invErr || !newInvoice) {
      console.warn('Aviso insertando factura en Supabase:', invErr?.message);
      newInvoiceId = `local_inv_${Date.now()}`;
      if (typeof window !== 'undefined') {
        const localSales = JSON.parse(localStorage.getItem('frenyer_local_sales') || '[]');
        localSales.unshift({
          id: newInvoiceId,
          ...invoicePayload,
          sale_items: keptItems
        });
        localStorage.setItem('frenyer_local_sales', JSON.stringify(localSales));
      }
    } else {
      newInvoiceId = newInvoice.id;
    }

    // 5. Insertar ítems en sale_items
    if (keptItems.length > 0 && newInvoiceId) {
      const itemsPayload = keptItems.map((it: any) => ({
        sale_id: newInvoiceId,
        sku: it.sku || null,
        name: it.name || 'Producto',
        quantity: it.quantity || 1,
        unit_price_usd: it.unit_price_usd || it.unitPriceUSD || 0,
        total_usd: it.total_usd || it.totalUSD || 0,
        total_ves: it.total_ves || it.totalVES || 0
      }));
      await supabase.from('sale_items').insert(itemsPayload);
    }

    // 6. Marcar la cotización como 'Facturada' y enlazar la factura
    await supabase
      .from('sales')
      .update({
        quote_status: 'Facturada',
        converted_to_sale_id: newInvoiceId
      })
      .eq('id', quoteId);

    // Actualizar también en almacenamiento local si existe
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const updated = localQuotes.map((q: any) => {
        if (q.id === quoteId) {
          return {
            ...q,
            quote_status: 'Facturada',
            status: 'Facturada',
            converted_to_sale_id: newInvoiceId
          };
        }
        return q;
      });
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(updated));
    }

    // 7. REGISTROS FINANCIEROS (CUENTAS BANCARIAS O CUENTAS POR COBRAR)
    let selectedBankName = '';
    const customerDisplayName = quote.customers?.name || quote.customer?.name || 'Cliente';

    if (paymentType === 'CONTADO') {
      // 7.A CONTADO: Registrar en tabla payments y abonar a la cuenta bancaria / caja
      let bankAcc: any = null;
      if (options.bankAccountId) {
        const { data: bData } = await supabase
          .from('bank_accounts')
          .select('*')
          .eq('id', options.bankAccountId)
          .maybeSingle();
        if (bData) {
          bankAcc = bData;
          selectedBankName = bData.bank_name;
        }
      }

      const methodLabel = `${options.paymentMethod || 'Contado'}${selectedBankName ? ` (${selectedBankName})` : ''}`;

      // Insertar pago en tabla payments
      await supabase.from('payments').insert([{
        sale_id: newInvoiceId,
        bank_account_id: options.bankAccountId || null,
        method: methodLabel,
        amount_usd: finalTotalUsd,
        amount_ves: finalTotalVes,
        exchange_rate: exchangeRate,
        reference_number: options.paymentReference?.trim() || invDocNumber
      }]);

      // Si se vinculó una cuenta bancaria, registrar movimiento y actualizar su saldo
      if (options.bankAccountId && bankAcc) {
        const isVes = bankAcc.currency === 'VES';
        const depositAmount = isVes ? finalTotalVes : finalTotalUsd;

        // Intentar registrar movimiento formal a través de la API
        try {
          await authenticatedFetch('/api/bank-movements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bank_account_id: options.bankAccountId,
              type: 'ENTRADA',
              concept: `Cobro Factura ${invDocNumber} (Cotización COT-${quote.doc_number}) - ${customerDisplayName}`,
              reference: options.paymentReference?.trim() || invDocNumber,
              user_name: 'Facturación / Caja',
              rate: exchangeRate,
              commission: 0,
              amount: depositAmount
            })
          });
        } catch (movErr) {
          console.warn('Aviso registrando /api/bank-movements:', movErr);
        }

        // Actualizar directamente el saldo de la cuenta bancaria para garantizar inmediatez
        const currentBalance = Number(bankAcc.balance) || 0;
        const updatedBalance = Math.round((currentBalance + depositAmount) * 100) / 100;
        await supabase
          .from('bank_accounts')
          .update({ balance: updatedBalance })
          .eq('id', options.bankAccountId);
      }
    } else {
      // 7.B CRÉDITO: Registrar en tabla accounts_receivable (Cuentas por Cobrar)
      const dueDate = options.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      const cxcPayload = {
        organization_id: quote.organization_id || organizationId,
        customer_id: quote.customer_id,
        sale_id: newInvoiceId,
        doc_number: invDocNumber,
        total_usd: finalTotalUsd,
        balance_usd: finalTotalUsd,
        status: 'PENDIENTE',
        due_date: dueDate
      };

      const { error: cxcErr } = await supabase
        .from('accounts_receivable')
        .insert([cxcPayload]);

      if (cxcErr) {
        console.warn('Aviso insertando en accounts_receivable:', cxcErr.message);
      }

      // Si existe cache local de cuentas por cobrar, sincronizar
      if (typeof window !== 'undefined') {
        const localCxc = JSON.parse(localStorage.getItem('frenyer_local_cxc') || '[]');
        localCxc.unshift({
          id: `local_cxc_${Date.now()}`,
          ...cxcPayload,
          customer_name: customerDisplayName
        });
        localStorage.setItem('frenyer_local_cxc', JSON.stringify(localCxc));
      }
    }

    return {
      success: true,
      invoiceId: newInvoiceId,
      invoiceDocNumber: invDocNumber,
      totalUsd: finalTotalUsd,
      totalVes: finalTotalVes,
      paymentType,
      bankAccountName: selectedBankName || (options.paymentMethod || 'Contado'),
      paymentMethod: options.paymentMethod || 'Contado',
      dueDate: options.dueDate,
      removedItems
    };
  } catch (err: any) {
    console.error('Error convirtiendo cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function deleteQuoteFromSupabase(quoteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Eliminar ítems de la cotización
    await supabase.from('sale_items').delete().eq('sale_id', quoteId);

    // 2. Eliminar la cotización en sales
    const { error } = await supabase.from('sales').delete().eq('id', quoteId);

    // 3. Limpiar también de almacenamiento local si existe
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const filtered = localQuotes.filter((q: any) => q.id !== quoteId);
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(filtered));
    }

    if (error) {
      console.warn('Aviso eliminando cotización de Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error eliminando cotización:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

export async function updateQuoteInSupabase(
  quoteId: string,
  input: {
    customerId?: string;
    validityDays: number;
    notes?: string;
    items: Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>;
    exchangeRate: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity * it.unit_price_usd), 0);
    const totalVes = Math.round(subtotal * input.exchangeRate * 100) / 100;

    // Actualizar cabecera de la cotización en sales (sin columnas inexistentes como updated_at)
    const updateData: Record<string, any> = {
      customer_id: input.customerId || null,
      exchange_rate: input.exchangeRate,
      subtotal_usd: subtotal,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: input.notes || null
    };

    if (input.validityDays) {
      updateData.expires_at = new Date(Date.now() + input.validityDays * 86400000).toISOString();
    }

    const { error: saleErr } = await supabase
      .from('sales')
      .update(updateData)
      .eq('id', quoteId);

    if (saleErr) {
      console.warn('Aviso actualizando cotización en Supabase:', saleErr.message);
    }

    // Reemplazar ítems en sale_items
    await supabase.from('sale_items').delete().eq('sale_id', quoteId);

    const itemsToInsert = input.items.map(it => ({
      sale_id: quoteId,
      sku: it.sku,
      name: it.name,
      quantity: it.quantity,
      unit_price_usd: it.unit_price_usd,
      total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
      total_ves: Math.round(it.quantity * it.unit_price_usd * input.exchangeRate * 100) / 100
    }));

    if (itemsToInsert.length > 0) {
      await supabase.from('sale_items').insert(itemsToInsert);
    }

    // Actualizar en localStorage si existe
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const updated = localQuotes.map((q: any) => {
        if (q.id === quoteId) {
          return {
            ...q,
            customer_id: input.customerId,
            subtotal_usd: subtotal,
            total_usd: subtotal,
            total_ves: totalVes,
            notes: input.notes,
            items: input.items,
            sale_items: itemsToInsert
          };
        }
        return q;
      });
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(updated));
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error actualizando cotización:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

export async function rejectQuoteInSupabase(quoteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const organizationId = await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para rechazar la cotización.' };
    }

    const { error } = await supabase.rpc('reject_quote', { p_quote_id: quoteId });

    if (error) {
      if (error.message?.includes('reject_quote') || (error as any).code === '42883') {
        // Fallback directo a actualización de registro
        let upd = await supabase.from('sales').update({ quote_status: 'Rechazada' }).eq('id', quoteId);
        if (upd.error && (upd.error.message.includes('quote_status') || (upd.error as any).code === '42703')) {
          upd = await supabase.from('sales').update({ status: 'CANCELADA' }).eq('id', quoteId);
        }
        return { success: !upd.error, error: upd.error?.message };
      }
      console.warn('Aviso rechazando cotización:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error rechazando cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

// ---------------------------------------------------------------------------
// 5. GESTIÓN DIRECTA DE CUENTAS BANCARIAS Y MOVIMIENTOS
// ---------------------------------------------------------------------------

export async function fetchBankAccountsFromSupabase(): Promise<{ success: boolean; data: any[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('bank_name', { ascending: true });

    if (error) {
      return { success: false, data: [], error: error.message };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, data: [], error: err?.message };
  }
}

export async function createBankAccountInSupabase(account: {
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  balance: number;
  status?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert([{
        bank_name: account.bank_name,
        account_number: account.account_number,
        account_type: account.account_type,
        currency: account.currency,
        balance: account.balance,
        status: account.status || 'Activo'
      }])
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function updateBankAccountInSupabase(
  id: string,
  updates: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteBankAccountInSupabase(
  id: string,
  isPermanent: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    if (isPermanent) {
      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Soft delete: mover a inactivas
    const { error } = await supabase
      .from('bank_accounts')
      .update({ status: 'Inactivo' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// ---------------------------------------------------------------------------
// 9. COMPRAS E INGRESO DE INVENTARIO
// ---------------------------------------------------------------------------

export interface DbPurchaseItem {
  id?: string;
  purchase_id?: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_cost_usd: number;
  total_usd: number;
  total_ves: number;
}

export interface DbPurchase {
  id: string;
  organization_id?: string;
  supplier_id?: string;
  doc_number: string;
  invoice_number: string;
  purchase_date: string;
  warehouse: string;
  payment_type: 'CONTADO' | 'CREDITO';
  exchange_rate: number;
  subtotal_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  status: 'COMPLETADA' | 'ANULADA';
  bank_account_id?: string;
  payment_method?: string;
  payment_reference?: string;
  due_date?: string;
  payable_id?: string;
  created_at?: string;
  suppliers?: { id?: string; name?: string; doc_number?: string; phone?: string; rif?: string };
  purchase_items?: DbPurchaseItem[];
}

export async function fetchPurchasesFromSupabase(): Promise<DbPurchase[]> {
  const localPurchases: DbPurchase[] = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('frenyer_local_purchases') || '[]')
    : [];

  // 1. Intentar endpoint proxy del servidor
  try {
    const res = await authenticatedFetch('/api/purchases');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch {
    // Continuar con cliente directo
  }

  if (!isSupabaseConfigured) {
    return localPurchases;
  }

  // 2. Cliente directo Supabase
  try {
    const orgId = await getActiveOrgId();
    let query = supabase
      .from('purchases')
      .select('*, suppliers(id, name, doc_number, phone), purchase_items(*)')
      .order('created_at', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length > 0) {
      const dbIds = new Set(data.map((p: any) => p.id));
      const missingLocal = localPurchases.filter(lp => !dbIds.has(lp.id));
      return [...data, ...missingLocal] as DbPurchase[];
    }
  } catch (err) {
    console.warn('Aviso consultando compras en Supabase:', err);
  }

  return localPurchases;
}

export async function createPurchaseInSupabase(input: {
  supplierId?: string;
  supplierName?: string;
  supplierDoc?: string;
  invoiceNumber: string;
  purchaseDate: string;
  warehouse: string;
  paymentType: 'CONTADO' | 'CREDITO';
  exchangeRate: number;
  notes?: string;
  updateCosts: boolean;
  items: Array<{
    productId?: string;
    sku: string;
    name: string;
    quantity: number;
    unitCostUSD: number;
  }>;
  bankAccountId?: string;
  bankAccountName?: string;
  paymentMethod?: string;
  paymentReference?: string;
  dueDate?: string;
}): Promise<{ success: boolean; purchaseId?: string; docNumber?: string; error?: string }> {
  try {
    const orgId = (await getActiveOrgId()) || '00000000-0000-0000-0000-000000000001';
    const rate = Number(input.exchangeRate) || 1;

    // Calcular totales
    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity * it.unitCostUSD), 0);
    const totalUsd = Math.round(subtotal * 100) / 100;
    const totalVes = Math.round(totalUsd * rate * 100) / 100;

    // Obtener siguiente correlativo CMP-0000X
    let nextNum = 1;
    try {
      const { data: latest } = await supabase
        .from('purchases')
        .select('doc_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (latest && latest[0]?.doc_number) {
        const num = parseInt(latest[0].doc_number.replace(/\D/g, ''), 10);
        if (!isNaN(num)) nextNum = num + 1;
      }
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      const local = JSON.parse(localStorage.getItem('frenyer_local_purchases') || '[]');
      if (local.length >= nextNum) nextNum = local.length + 1;
    }

    const docNumber = `CMP-${String(nextNum).padStart(5, '0')}`;

    // 1. Intentar RPC en Supabase o llamada al endpoint
    const rpcPayload = {
      p_supplier_id: input.supplierId || null,
      p_invoice_number: input.invoiceNumber.trim() || docNumber,
      p_purchase_date: input.purchaseDate,
      p_warehouse: input.warehouse,
      p_payment_type: input.paymentType,
      p_exchange_rate: rate,
      p_notes: input.notes?.trim() || null,
      p_update_costs: input.updateCosts,
      p_items: input.items.map(it => ({
        sku: it.sku,
        name: it.name,
        quantity: it.quantity,
        unit_cost_usd: it.unitCostUSD
      })),
      p_bank_account_id: input.bankAccountId || null,
      p_payment_method: input.paymentMethod || null,
      p_payment_reference: input.paymentReference || null,
      p_due_date: input.dueDate || null
    };

    let createdPurchaseId = '';

    // Intento 1: Servidor /api/purchases
    try {
      const res = await authenticatedFetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcPayload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          createdPurchaseId = json.data.purchase_id || json.data.id;
        }
      }
    } catch {
      // Continuar con Supabase directo
    }

    // Intento 2: Supabase RPC directo
    if (!createdPurchaseId && isSupabaseConfigured) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('record_internal_purchase', {
          ...rpcPayload,
          p_organization_id: orgId
        });

        if (!rpcErr && rpcData) {
          createdPurchaseId = rpcData.purchase_id;
        }
      } catch {
        // Fallback a inserción directa
      }
    }

    // Intento 3: Inserción directa en tabla purchases si la tabla existe
    if (!createdPurchaseId && isSupabaseConfigured) {
      try {
        const { data: directPurchase, error: pErr } = await supabase
          .from('purchases')
          .insert([{
            organization_id: orgId,
            supplier_id: input.supplierId || null,
            doc_number: docNumber,
            invoice_number: input.invoiceNumber.trim() || docNumber,
            purchase_date: input.purchaseDate,
            warehouse: input.warehouse,
            payment_type: input.paymentType,
            exchange_rate: rate,
            subtotal_usd: totalUsd,
            total_usd: totalUsd,
            total_ves: totalVes,
            notes: input.notes?.trim() || null,
            status: 'COMPLETADA',
            bank_account_id: input.bankAccountId || null,
            payment_method: input.paymentMethod || null,
            payment_reference: input.paymentReference || null,
            due_date: input.dueDate || null
          }])
          .select()
          .single();

        if (!pErr && directPurchase) {
          createdPurchaseId = directPurchase.id;

          // Insertar ítems
          const pItems = input.items.map(it => ({
            purchase_id: createdPurchaseId,
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unit_cost_usd: it.unitCostUSD,
            total_usd: Math.round(it.quantity * it.unitCostUSD * 100) / 100,
            total_ves: Math.round(it.quantity * it.unitCostUSD * rate * 100) / 100
          }));
          await supabase.from('purchase_items').insert(pItems);
        }
      } catch {
        // ignore
      }
    }

    // Si aún no hay ID (modo local / sin tablas migradas aún en supabase)
    if (!createdPurchaseId) {
      createdPurchaseId = `pur_${Date.now()}`;
    }

    // Actualizar stock de productos en Supabase e inventario
    for (const it of input.items) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('id, stock, cost_usd')
          .eq('sku', it.sku)
          .maybeSingle();

        if (prod) {
          const newStock = Math.max(0, (Number(prod.stock) || 0) + it.quantity);
          const updatePayload: any = { stock: newStock };
          if (input.updateCosts && it.unitCostUSD > 0) {
            updatePayload.cost_usd = it.unitCostUSD;
          }
          await supabase.from('products').update(updatePayload).eq('sku', it.sku);
        }
      } catch (err) {
        console.warn('Aviso actualizando stock de producto:', err);
      }
    }

    // Si es Crédito, registrar en accounts_payable
    if (input.paymentType === 'CREDITO' && input.supplierId) {
      try {
        await supabase.from('accounts_payable').insert([{
          organization_id: orgId,
          supplier_id: input.supplierId,
          supplier_name: input.supplierName || 'Proveedor',
          doc_number: input.invoiceNumber.trim() || docNumber,
          concept: `Compra de inventario (${docNumber})`,
          origin: 'Compra Interna',
          total_usd: totalUsd,
          balance_usd: totalUsd,
          status: 'PENDIENTE',
          due_date: input.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          description: input.notes?.trim() || null
        }]);
      } catch (err) {
        console.warn('Aviso registrando cuenta por pagar:', err);
      }
    }

    // Si es Contado, actualizar saldo de cuenta bancaria y registrar movimiento
    if (input.paymentType === 'CONTADO' && input.bankAccountId) {
      try {
        const { data: bAcc } = await supabase
          .from('bank_accounts')
          .select('*')
          .eq('id', input.bankAccountId)
          .maybeSingle();

        if (bAcc) {
          const deductAmount = bAcc.currency === 'VES' ? totalVes : totalUsd;
          const newBal = Math.round((Number(bAcc.balance) - deductAmount) * 100) / 100;
          await supabase.from('bank_accounts').update({ balance: newBal }).eq('id', bAcc.id);

          await supabase.from('bank_movements').insert([{
            organization_id: orgId,
            bank_account_id: bAcc.id,
            type: 'SALIDA',
            concept: `Compra inventario - Factura: ${input.invoiceNumber.trim() || docNumber}`,
            reference: input.paymentReference?.trim() || docNumber,
            user_name: 'Sistema / Compras',
            rate,
            commission: 0,
            amount: deductAmount
          }]);
        }
      } catch (err) {
        console.warn('Aviso actualizando cuenta bancaria:', err);
      }
    }

    // Guardar espejo en localStorage
    if (typeof window !== 'undefined') {
      const local = JSON.parse(localStorage.getItem('frenyer_local_purchases') || '[]');
      const newPurchaseRecord: DbPurchase = {
        id: createdPurchaseId,
        organization_id: orgId,
        supplier_id: input.supplierId,
        doc_number: docNumber,
        invoice_number: input.invoiceNumber.trim() || docNumber,
        purchase_date: input.purchaseDate,
        warehouse: input.warehouse,
        payment_type: input.paymentType,
        exchange_rate: rate,
        subtotal_usd: totalUsd,
        total_usd: totalUsd,
        total_ves: totalVes,
        notes: input.notes?.trim(),
        status: 'COMPLETADA',
        bank_account_id: input.bankAccountId,
        payment_method: input.paymentMethod,
        payment_reference: input.paymentReference,
        due_date: input.dueDate,
        created_at: new Date().toISOString(),
        suppliers: {
          name: input.supplierName,
          doc_number: input.supplierDoc,
          rif: input.supplierDoc
        },
        purchase_items: input.items.map(it => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unit_cost_usd: it.unitCostUSD,
          total_usd: Math.round(it.quantity * it.unitCostUSD * 100) / 100,
          total_ves: Math.round(it.quantity * it.unitCostUSD * rate * 100) / 100
        }))
      };

      local.unshift(newPurchaseRecord);
      localStorage.setItem('frenyer_local_purchases', JSON.stringify(local));
    }

    return {
      success: true,
      purchaseId: createdPurchaseId,
      docNumber
    };
  } catch (err: any) {
    console.error('Error registrando compra en Supabase:', err);
    return { success: false, error: err?.message || 'Error registrando compra' };
  }
}

// ---------------------------------------------------------------------------
// 12. SEDES Y ALMACENES (BRANCHES)
// ---------------------------------------------------------------------------

export const DEFAULT_INITIAL_BRANCHES: DbBranch[] = [
  {
    id: 'a1b2c3d4-1111-4000-8000-000000000001',
    code: 'SP-01',
    name: 'Tienda Bella Vista',
    address: 'Carrera 6 entre calle 19 y 20 Barinitas',
    phone: '+58 412-5043857',
    status: 'Habilitada',
    is_active: true,
    cash_registers: 0,
    created_at: new Date().toISOString()
  },
  {
    id: 'a1b2c3d4-2222-4000-8000-000000000002',
    code: 'SUC-02',
    name: 'Almacén Agua Dulce',
    address: 'carrera 7',
    phone: '+584125043857',
    status: 'Habilitada',
    is_active: true,
    cash_registers: 0,
    created_at: new Date().toISOString()
  },
  {
    id: 'a1b2c3d4-3333-4000-8000-000000000003',
    code: 'SUC-03',
    name: 'Tienda Online - Almacén',
    address: 'carrera 7',
    phone: '+584125043857',
    status: 'Habilitada',
    is_active: true,
    cash_registers: 0,
    created_at: new Date().toISOString()
  },
  {
    id: 'a1b2c3d4-4444-4000-8000-000000000004',
    code: 'SUC-04',
    name: 'luis bella vista',
    address: 'calle 20',
    phone: '+584127894541',
    status: 'Habilitada',
    is_active: true,
    cash_registers: 0,
    created_at: new Date().toISOString()
  }
];

function syncBranchToLocalStorage(branch: DbBranch) {
  if (typeof window === 'undefined') return;
  const list: DbBranch[] = JSON.parse(localStorage.getItem('frenyer_local_branches') || 'null') || [...DEFAULT_INITIAL_BRANCHES];
  const idx = list.findIndex(b => b.id === branch.id || b.code === branch.code);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...branch };
  } else {
    list.push(branch);
  }
  localStorage.setItem('frenyer_local_branches', JSON.stringify(list));
}

function updateBranchInLocalStorage(id: string, updates: Partial<DbBranch>) {
  if (typeof window === 'undefined') return;
  const list: DbBranch[] = JSON.parse(localStorage.getItem('frenyer_local_branches') || 'null') || [...DEFAULT_INITIAL_BRANCHES];
  const updated = list.map(b => b.id === id ? { ...b, ...updates } : b);
  localStorage.setItem('frenyer_local_branches', JSON.stringify(updated));
}

function deleteBranchFromLocalStorage(id: string) {
  if (typeof window === 'undefined') return;
  const list: DbBranch[] = JSON.parse(localStorage.getItem('frenyer_local_branches') || 'null') || [...DEFAULT_INITIAL_BRANCHES];
  const updated = list.filter(b => b.id !== id);
  localStorage.setItem('frenyer_local_branches', JSON.stringify(updated));
}

export async function fetchBranchesFromSupabase(): Promise<DbBranch[]> {
  const rawLocal: DbBranch[] = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('frenyer_local_branches') || 'null') || DEFAULT_INITIAL_BRANCHES
    : DEFAULT_INITIAL_BRANCHES;

  // Sanitizar cualquier ID heredado que no sea UUID
  const localBranches = rawLocal.map((b, idx) => {
    if (!isValidUuid(b.id)) {
      const fallbackId = DEFAULT_INITIAL_BRANCHES[idx]?.id || 'a1b2c3d4-9999-4000-8000-00000000000' + (idx + 1);
      return { ...b, id: fallbackId };
    }
    return b;
  });

  if (typeof window !== 'undefined' && JSON.stringify(localBranches) !== JSON.stringify(rawLocal)) {
    localStorage.setItem('frenyer_local_branches', JSON.stringify(localBranches));
  }

  try {
    const res = await authenticatedFetch('/api/branches');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_local_branches', JSON.stringify(json.data));
        }
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (isSupabaseConfigured) {
    try {
      const orgId = await getActiveOrgId();
      if (orgId) {
        const { data, error } = await supabase
          .from('branches')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('frenyer_local_branches', JSON.stringify(data));
          }
          return data;
        }
      }
    } catch {
      // ignore
    }
  }

  return localBranches;
}

export async function createBranchInSupabase(branch: Partial<DbBranch>): Promise<{ success: boolean; data?: DbBranch; error?: string }> {
  const orgId = await getActiveOrgId();
  const payload: any = {
    ...branch,
    organization_id: orgId || branch.organization_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (payload.id && !isValidUuid(payload.id)) {
    delete payload.id;
  }

  try {
    const res = await authenticatedFetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        syncBranchToLocalStorage(json.data);
        return { success: true, data: json.data };
      }
    }
  } catch {
    // ignore
  }

  if (isSupabaseConfigured && orgId) {
    try {
      const { data, error } = await supabase
        .from('branches')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        syncBranchToLocalStorage(data);
        return { success: true, data };
      }
    } catch {
      // ignore
    }
  }

  // Fallback local con UUID válido
  const fallbackRecord: DbBranch = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'a1b2c3d4-5555-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0'),
    code: branch.code || 'SUC-01',
    name: branch.name || 'Nueva Sede',
    address: branch.address || '',
    phone: branch.phone || '',
    status: branch.status || 'Habilitada',
    is_active: branch.is_active !== undefined ? branch.is_active : true,
    cash_registers: branch.cash_registers || 0,
    created_at: new Date().toISOString(),
    organization_id: orgId || undefined
  };
  syncBranchToLocalStorage(fallbackRecord);
  return { success: true, data: fallbackRecord };
}

export async function updateBranchInSupabase(id: string, updates: Partial<DbBranch>): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authenticatedFetch(`/api/branches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        updateBranchInLocalStorage(id, updates);
        return { success: true };
      }
    }
  } catch {
    // ignore
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id);
      if (!error) {
        updateBranchInLocalStorage(id, updates);
        return { success: true };
      }
    } catch {
      // ignore
    }
  }

  updateBranchInLocalStorage(id, updates);
  return { success: true };
}

export async function deleteBranchFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authenticatedFetch(`/api/branches/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        deleteBranchFromLocalStorage(id);
        return { success: true };
      }
    }
  } catch {
    // ignore
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id);
      if (!error) {
        deleteBranchFromLocalStorage(id);
        return { success: true };
      }
    } catch {
      // ignore
    }
  }

  deleteBranchFromLocalStorage(id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// 14. GESTIÓN FINANCIERA DE GASTOS FIJOS Y VARIABLES (EXPENSES)
// ---------------------------------------------------------------------------

export type ExpenseType = 'FIJO' | 'VARIABLE';
export type ExpenseFrequency =
  | 'SEMANAL'
  | 'QUINCENAL'
  | 'MENSUAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';
export type ExpenseStatus = 'PENDIENTE' | 'PAGADO' | 'VENCIDO';

export interface DbExpenseCategory {
  id: string;
  organization_id?: string;
  name: string;
  is_default?: boolean;
  created_at?: string;
}

export interface DbExpense {
  id: string;
  organization_id?: string;
  branch_id?: string;
  name: string;
  description: string;
  category: string;
  type: ExpenseType;
  amount: number;
  currency: 'USD' | 'VES';
  exchange_rate: number;
  due_date: string;
  last_payment_date?: string | null;
  frequency?: ExpenseFrequency | null;
  status: ExpenseStatus;
  notes?: string | null;
  payment_account_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbExpensePayment {
  id: string;
  expense_id: string;
  organization_id?: string;
  amount: number;
  currency: 'USD' | 'VES';
  exchange_rate: number;
  paid_at: string;
  payment_method: string;
  bank_account_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
}

export const DEFAULT_INITIAL_EXPENSE_CATEGORIES: string[] = [
  'Alquiler',
  'Gas',
  'Electricidad / luz',
  'Agua',
  'Internet / teléfono',
  'Patente y permisos',
  'Sueldos y salarios',
  'Cotizaciones o cargas sociales',
  'Compra de mercadería / productos',
  'Materiales e insumos',
  'Limpieza',
  'Otros gastos'
];

function syncExpenseToLocalStorage(expense: DbExpense) {
  if (typeof window === 'undefined') return;
  const list: DbExpense[] = JSON.parse(localStorage.getItem('frenyer_local_expenses') || 'null') || [];
  const idx = list.findIndex(e => e.id === expense.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...expense };
  } else {
    list.unshift(expense);
  }
  localStorage.setItem('frenyer_local_expenses', JSON.stringify(list));
}

function updateExpenseInLocalStorage(id: string, updates: Partial<DbExpense>) {
  if (typeof window === 'undefined') return;
  const list: DbExpense[] = JSON.parse(localStorage.getItem('frenyer_local_expenses') || 'null') || [];
  const updated = list.map(e => e.id === id ? { ...e, ...updates } : e);
  localStorage.setItem('frenyer_local_expenses', JSON.stringify(updated));
}

function deleteExpenseFromLocalStorage(id: string) {
  if (typeof window === 'undefined') return;
  const list: DbExpense[] = JSON.parse(localStorage.getItem('frenyer_local_expenses') || 'null') || [];
  const updated = list.filter(e => e.id !== id);
  localStorage.setItem('frenyer_local_expenses', JSON.stringify(updated));
}

export async function fetchExpenseCategoriesFromSupabase(): Promise<string[]> {
  const localCats: string[] = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('frenyer_expense_categories') || 'null') || DEFAULT_INITIAL_EXPENSE_CATEGORIES
    : DEFAULT_INITIAL_EXPENSE_CATEGORIES;

  try {
    const res = await authenticatedFetch('/api/expense-categories');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const names = Array.from(new Set([...DEFAULT_INITIAL_EXPENSE_CATEGORIES, ...json.data.map((c: any) => c.name)]));
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_expense_categories', JSON.stringify(names));
        }
        return names;
      }
    }
  } catch {
    // fallback
  }

  if (isSupabaseConfigured) {
    try {
      const orgId = await getActiveOrgId();
      if (orgId) {
        const { data, error } = await supabase
          .from('expense_categories')
          .select('name')
          .eq('organization_id', orgId);
        if (!error && data && data.length > 0) {
          const names = Array.from(new Set([...DEFAULT_INITIAL_EXPENSE_CATEGORIES, ...data.map((c: any) => c.name)]));
          if (typeof window !== 'undefined') {
            localStorage.setItem('frenyer_expense_categories', JSON.stringify(names));
          }
          return names;
        }
      }
    } catch {
      // ignore
    }
  }

  return localCats;
}

export async function createExpenseCategoryInSupabase(name: string): Promise<{ success: boolean; name?: string; error?: string }> {
  const cleanName = name.trim();
  if (!cleanName) return { success: false, error: 'Nombre de categoría inválido' };

  try {
    const res = await authenticatedFetch('/api/expense-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        const current: string[] = typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('frenyer_expense_categories') || 'null') || DEFAULT_INITIAL_EXPENSE_CATEGORIES
          : DEFAULT_INITIAL_EXPENSE_CATEGORIES;
        if (!current.includes(cleanName)) {
          current.push(cleanName);
          localStorage.setItem('frenyer_expense_categories', JSON.stringify(current));
        }
        return { success: true, name: cleanName };
      }
    }
  } catch {
    // fallback
  }

  if (isSupabaseConfigured) {
    try {
      const orgId = await getActiveOrgId();
      if (orgId) {
        const { error } = await supabase
          .from('expense_categories')
          .insert([{ organization_id: orgId, name: cleanName }]);
        if (!error) {
          return { success: true, name: cleanName };
        }
      }
    } catch {
      // ignore
    }
  }

  // Local storage fallback
  if (typeof window !== 'undefined') {
    const current: string[] = JSON.parse(localStorage.getItem('frenyer_expense_categories') || 'null') || [...DEFAULT_INITIAL_EXPENSE_CATEGORIES];
    if (!current.includes(cleanName)) {
      current.push(cleanName);
      localStorage.setItem('frenyer_expense_categories', JSON.stringify(current));
    }
  }

  return { success: true, name: cleanName };
}

export async function fetchExpensesFromSupabase(): Promise<DbExpense[]> {
  try {
    const res = await authenticatedFetch('/api/expenses');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Aviso consultando /api/expenses:', err);
  }

  if (isSupabaseConfigured) {
    try {
      const orgId = await getActiveOrgId();
      if (orgId) {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('organization_id', orgId)
          .order('due_date', { ascending: true });
        if (!error && Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Aviso consultando gastos directamente en Supabase:', err);
    }
  }

  // Cero simulación: solo datos reales registrados en Supabase
  return [];
}

export async function createExpenseInSupabase(expense: Partial<DbExpense>): Promise<{ success: boolean; data?: DbExpense; error?: string }> {
  const orgId = await getActiveOrgId();
  const payload: any = {
    ...expense,
    organization_id: orgId || expense.organization_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const res = await authenticatedFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return { success: true, data: json.data };
      }
      if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch (err: any) {
    console.warn('Error en /api/expenses POST:', err);
  }

  if (isSupabaseConfigured && orgId) {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        return { success: true, data };
      }
      if (error) {
        if (/row-level security|RLS/i.test(error.message)) {
          return {
            success: false,
            error: 'Error RLS en Supabase: La política de seguridad (Row Level Security) de la tabla "expenses" bloqueó la inserción. Ejecuta el script SQL en el Editor de Supabase para otorgar permisos a anon y authenticated.'
          };
        }
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (/row-level security|RLS/i.test(msg)) {
        return {
          success: false,
          error: 'Error RLS en Supabase: La política de seguridad de la tabla "expenses" bloqueó la inserción.'
        };
      }
      return { success: false, error: msg || 'Error guardando gasto en Supabase' };
    }
  }

  return { success: false, error: 'No se pudo guardar el gasto en Supabase. Comprueba que la tabla expenses exista y la conexión esté activa.' };
}

export async function updateExpenseInSupabase(id: string, updates: Partial<DbExpense>): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authenticatedFetch(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true };
      }
      if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch (err) {
    console.warn('Error en /api/expenses PATCH:', err);
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (!error) {
        return { success: true };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  return { success: false, error: 'No se pudo actualizar el gasto en Supabase.' };
}

export async function deleteExpenseFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authenticatedFetch(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true };
      }
      if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch (err) {
    console.warn('Error en /api/expenses DELETE:', err);
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);
      if (!error) {
        return { success: true };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  return { success: false, error: 'No se pudo eliminar el gasto de Supabase.' };
}

export async function recordExpensePaymentInSupabase(
  id: string,
  paymentData: {
    amount: number;
    currency: 'USD' | 'VES';
    exchangeRate: number;
    paidAt?: string;
    paymentMethod?: string;
    bankAccountId?: string;
    reference?: string;
    notes?: string;
    nextDueDate?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authenticatedFetch(`/api/expenses/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true };
      }
      if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch (err) {
    console.warn('Error en /api/expenses/:id/pay:', err);
  }

  if (isSupabaseConfigured) {
    try {
      const orgId = await getActiveOrgId();
      const payDate = paymentData.paidAt || new Date().toISOString().slice(0, 10);
      const updates: any = {
        last_payment_date: payDate,
        updated_at: new Date().toISOString()
      };
      if (paymentData.nextDueDate) {
        updates.due_date = paymentData.nextDueDate;
        updates.status = 'PENDIENTE';
      } else {
        updates.status = 'PAGADO';
      }

      const { error: expError } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id);

      if (expError) {
        return { success: false, error: expError.message };
      }

      if (orgId) {
        await supabase.from('expense_payments').insert([{
          expense_id: id,
          organization_id: orgId,
          amount: paymentData.amount,
          currency: paymentData.currency,
          exchange_rate: paymentData.exchangeRate,
          paid_at: new Date().toISOString(),
          payment_method: paymentData.paymentMethod || 'Transferencia bancaria',
          bank_account_id: paymentData.bankAccountId || null,
          reference: paymentData.reference || null,
          notes: paymentData.notes || null
        }]);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  return { success: false, error: 'No se pudo registrar el pago en Supabase.' };
}

// ---------------------------------------------------------------------------
// INVENTORY MOVEMENTS AND ADJUSTMENTS
// ---------------------------------------------------------------------------

export async function fetchInventoryMovementsFromSupabase(): Promise<DbInventoryMovement[]> {
  // 1. Intentar endpoint proxy del servidor (unifica inventory_movements, sales y purchases reales)
  try {
    const res = await authenticatedFetch('/api/inventory/movements');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Aviso en /api/inventory/movements proxy:', err);
  }

  // 2. Cliente directo de Supabase
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const orgId = await getActiveOrgId();
    let query = supabase
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      return data as DbInventoryMovement[];
    }
  } catch (err) {
    console.warn('Aviso consultando inventory_movements direct:', err);
  }

  return [];
}

export async function recordInventoryAdjustmentInSupabase(adjustment: {
  sku: string;
  adjustment_type: 'ENTRADA' | 'SALIDA' | 'CORRECCION';
  quantity: number;
  reason: string;
  notes?: string;
  doc_number?: string;
  unit_cost_usd?: number;
  unit_price_usd?: number;
  exchange_rate?: number;
}): Promise<{ success: boolean; data?: DbInventoryMovement; error?: string }> {
  // 1. Intentar endpoint proxy del servidor
  try {
    const res = await authenticatedFetch('/api/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adjustment)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true, data: json.data };
      }
      return { success: false, error: json.error || 'Error registrando ajuste' };
    }
  } catch (err: any) {
    console.warn('Aviso en /api/inventory/adjustments proxy:', err);
  }

  // 2. Cliente directo Supabase
  if (isSupabaseConfigured) {
    try {
      const orgId = (await getActiveOrgId()) || '00000000-0000-0000-0000-000000000001';
      
      // Obtener producto
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('sku', adjustment.sku)
        .maybeSingle();

      if (prodErr || !prodData) {
        return { success: false, error: `Producto ${adjustment.sku} no encontrado en base de datos.` };
      }

      const prevStock = Number(prodData.stock) || 0;
      const numQty = Math.abs(Number(adjustment.quantity) || 0);
      let nextStock = prevStock;
      let netDelta = 0;
      let movType = 'AJUSTE_ENTRADA';

      if (adjustment.adjustment_type === 'ENTRADA') {
        nextStock = prevStock + numQty;
        netDelta = numQty;
        movType = 'AJUSTE_ENTRADA';
      } else if (adjustment.adjustment_type === 'SALIDA') {
        nextStock = Math.max(0, prevStock - numQty);
        netDelta = -numQty;
        movType = 'AJUSTE_SALIDA';
      } else {
        nextStock = Math.max(0, Number(adjustment.quantity) || 0);
        netDelta = nextStock - prevStock;
        movType = 'AJUSTE_CORRECCION';
      }

      // Actualizar stock
      const { error: updErr } = await supabase
        .from('products')
        .update({ stock: nextStock })
        .eq('sku', adjustment.sku);

      if (updErr) {
        return { success: false, error: `Error actualizando stock: ${updErr.message}` };
      }

      const rate = Number(adjustment.exchange_rate) || 1;
      const unitVal = Number(adjustment.unit_cost_usd) || Number(prodData.cost_usd) || Number(prodData.price_usd) || 0;
      const totalUsd = Math.round(Math.abs(netDelta) * unitVal * 100) / 100;
      const totalVes = Math.round(totalUsd * rate * 100) / 100;
      const docNum = adjustment.doc_number || `AJU-${String(Math.floor(1000 + Math.random() * 9000))}`;

      const movPayload = {
        organization_id: orgId,
        branch_id: prodData.branch_id || null,
        product_id: prodData.id || null,
        sku: prodData.sku,
        product_name: prodData.name,
        movement_type: movType,
        doc_type: 'AJUSTE',
        doc_number: docNum,
        entity_type: 'INTERNO',
        entity_name: 'Ajuste manual de stock',
        quantity: netDelta,
        unit_cost_usd: Number(prodData.cost_usd) || 0,
        unit_price_usd: Number(prodData.price_usd) || 0,
        exchange_rate: rate,
        total_usd: totalUsd,
        total_ves: totalVes,
        previous_stock: prevStock,
        new_stock: nextStock,
        reason: adjustment.reason || 'Ajuste manual de stock',
        notes: adjustment.notes || null,
        created_at: new Date().toISOString()
      };

      const { data: insertedData, error: insErr } = await supabase
        .from('inventory_movements')
        .insert([movPayload])
        .select()
        .single();

      if (insErr) {
        console.warn('Aviso insertando en inventory_movements:', insErr.message);
      }

      return {
        success: true,
        data: (insertedData || movPayload) as DbInventoryMovement
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error en ajuste de inventario.' };
    }
  }

  return { success: false, error: 'Supabase no está configurado.' };
}


