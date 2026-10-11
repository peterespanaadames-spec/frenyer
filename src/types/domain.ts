export type Currency = 'USD' | 'VES';
export type SaleStatus = 'Pagada' | 'Pendiente' | 'Anulada';

export type DeliveryStatus =
  | 'RECIBIDO'
  | 'PREPARADO'
  | 'LISTO_PARA_ENTREGAR'
  | 'EN_CAMINO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type PaymentStatus = 'PENDIENTE' | 'PAGADO' | 'REEMBOLSADO';

export type DeliveryMethod = 'RETIRO' | 'DOMICILIO';

export type PaymentMethod =
  | 'PAGO_MOVIL'
  | 'TRANSFERENCIA'
  | 'EFECTIVO_USD'
  | 'PUNTO_VENTA'
  | 'ZELLE';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand?: string;
  description?: string;
  priceUsd: number;
  costUsd?: number;
  stock: number;
  minStock?: number;
  status: 'Activo' | 'Bajo stock' | 'Agotado';
  image_url?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  status: 'Activo' | 'Moroso';
}

export interface OrderActivityLog {
  timestamp: string;
  action: string;
  description: string;
  user: string;
}

export interface DbOrderItem {
  id?: string;
  order_id?: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  total_ves: number;
}

export interface DbOrder {
  id: string;
  organization_id?: string;
  branch_id?: string | null;
  branch_name?: string;
  order_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_doc?: string;
  delivery_method: DeliveryMethod;
  delivery_address?: string;
  delivery_instructions?: string;
  delivery_status: DeliveryStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference?: string | null;
  currency: Currency;
  exchange_rate: number;
  is_future_rate?: boolean;
  subtotal_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  activity_history: OrderActivityLog[];
  items: DbOrderItem[];
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface PublicBusinessConfig {
  businessName: string;
  rif: string;
  phone: string;
  email: string;
  address: string;
  whatsapp?: string;
  slogan: string;
  logo?: string | null;
  favicon?: string | null;
  bcvRate: number;
  bcvRateDate?: string;
  branches: Array<{ id: string; name: string; address?: string }>;
}

