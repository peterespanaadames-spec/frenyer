import { supabase } from './client';

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
  doc_type: 'FACTURA' | 'NOTA' | 'ESPERA';
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
  created_at?: string;
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

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function fetchCustomersFromSupabase(): Promise<DbCustomer[]> {
  // 1. Try server proxy
  try {
    const res = await fetch('/api/customers');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
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
    const res = await fetch('/api/customers', {
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

let cachedOrgId: string | null = null;

export async function getActiveOrgId(): Promise<string | null> {
  if (cachedOrgId) return cachedOrgId;
  try {
    const { data } = await supabase.from('organizations').select('id').limit(1);
    if (data && data.length > 0 && data[0].id) {
      cachedOrgId = data[0].id;
      return cachedOrgId;
    }
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// PRODUCTS / INVENTORY
// ---------------------------------------------------------------------------

export async function fetchProductsFromSupabase(): Promise<DbProduct[]> {
  // 1. Try local server proxy (immune to iframe CORS and ad-blockers)
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
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

export async function createProductInSupabase(product: DbProduct): Promise<{ success: boolean; data?: DbProduct; error?: string }> {
  // 1. Try local server proxy first
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true, data: json.data };
      } else if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client fallback
  try {
    const orgId = await getActiveOrgId();
    const payload: any = { ...product };
    if (orgId && !payload.organization_id) {
      payload.organization_id = orgId;
    }

    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();

    if (error) {
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
  // 1. Try server proxy
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
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
      .update(updates)
      .eq('sku', sku);

    if (error) {
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
    const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
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
    const res = await fetch(`/api/products/${encodeURIComponent(sku)}/stock`, {
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
    // Sanitize sale object to strictly match sales table schema in database
    const cleanSale = {
      organization_id: sale.organization_id || '00000000-0000-0000-0000-000000000001',
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
      return { success: false, error: saleError?.message };
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
        console.warn('Error inserting sale items:', itemsError.message);
      }
    }

    // 3. Insert Payments
    if (payments.length > 0) {
      const paymentsToInsert = payments.map(p => ({
        sale_id: saleId,
        method: p.method,
        amount_usd: p.amount_usd,
        amount_ves: p.amount_ves,
        exchange_rate: p.exchange_rate
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) {
        console.warn('Error inserting sale payments:', paymentsError.message);
      }
    }

    // 4. Deduct Stocks
    for (const item of items) {
      const { data: currentProd } = await supabase
        .from('products')
        .select('stock')
        .eq('sku', item.sku)
        .single();

      if (currentProd) {
        const nextStock = Math.max(0, (Number(currentProd.stock) || 0) - item.quantity);
        await supabase
          .from('products')
          .update({ stock: nextStock })
          .eq('sku', item.sku);
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

