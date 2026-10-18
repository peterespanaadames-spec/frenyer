import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Printer, 
  FileDown, 
  CreditCard, 
  ShoppingBag, 
  User, 
  Calendar, 
  CheckCircle2, 
  RefreshCcw 
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatUSD, formatVES, getActiveExchangeRate } from '../../../lib/currency';
import { getBusinessProfile } from '../../../lib/businessProfile';
import { supabase } from '../../../lib/supabase/client';

interface SaleItemDetail {
  id: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
}

interface PaymentRecordDetail {
  method: string;
  amount_usd: number;
  amount_ves: number;
  bank_name?: string;
  account_number?: string;
}

interface SaleFullDetail {
  id: string;
  doc_type: string;
  doc_number: string;
  created_at: string;
  customer_name: string;
  customer_doc: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  exchange_rate: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  items: SaleItemDetail[];
  payments: PaymentRecordDetail[];
}

interface SaleDetailPageProps {
  saleId?: string;
  onBack?: () => void;
}

export function SaleDetailPage({ saleId: propSaleId, onBack }: SaleDetailPageProps) {
  const navigate = useNavigate();
  const { id: paramSaleId } = useParams<{ id: string }>();
  const activeId = propSaleId || paramSaleId;

  const [data, setData] = useState<SaleFullDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.length > 1 ? navigate(-1) : navigate('/ventas-flash/reporte');
    }
  };

  const loadSaleData = async () => {
    if (!activeId) return;
    setIsLoading(true);
    try {
      // 1. Consultar tabla 'sales' por id o por doc_number
      let { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', activeId)
        .maybeSingle();

      if (!saleData) {
        const { data: byDoc } = await supabase
          .from('sales')
          .select('*')
          .eq('doc_number', activeId)
          .maybeSingle();
        if (byDoc) saleData = byDoc;
      }

      if (saleData) {
        // Datos del cliente
        let customerName = 'Consumidor Final';
        let customerDoc = 'N/A';
        let customerPhone = 'N/A';
        let customerEmail = 'N/A';

        if (saleData.customer_id) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('name, doc_number, doc_type, phone, email')
            .eq('id', saleData.customer_id)
            .maybeSingle();

          if (customerData) {
            customerName = customerData.name || customerName;
            customerDoc = customerData.doc_number ? `${customerData.doc_type ? customerData.doc_type + ' ' : ''}${customerData.doc_number}` : 'N/A';
            customerPhone = customerData.phone || 'N/A';
            customerEmail = customerData.email || 'N/A';
          }
        }

        // Artículos de la venta
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', activeId);

        const items: SaleItemDetail[] = (itemsData || []).map((it: any) => ({
          id: it.id,
          name: it.name || 'Producto sin nombre',
          quantity: Number(it.quantity) || 1,
          unit_price_usd: Number(it.unit_price_usd) || 0,
          total_usd: Number(it.total_usd) || ((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0))
        }));

        // Pagos y Cuentas Bancarias
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('sale_id', activeId);

        const { data: bankAccounts } = await supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number, currency');

        const bankMap = new Map((bankAccounts || []).map((b: any) => [b.id, b]));

        const payments: PaymentRecordDetail[] = (paymentsData || []).map((p: any) => {
          const bank = p.bank_account_id ? bankMap.get(p.bank_account_id) : null;
          return {
            method: p.method || 'Efectivo',
            amount_usd: Number(p.amount_usd) || 0,
            amount_ves: Number(p.amount_ves) || 0,
            bank_name: bank ? bank.bank_name : (p.method?.includes('Banesco') ? 'Banesco' : p.method?.includes('Venezuela') ? 'Banco de Venezuela' : p.method?.includes('Efectivo') ? 'Caja Efectivo' : undefined),
            account_number: bank?.account_number
          };
        });

        if (payments.length === 0) {
          payments.push({
            method: saleData.payment_type || 'Contado',
            amount_usd: Number(saleData.total_usd) || 0,
            amount_ves: Number(saleData.total_ves) || (Number(saleData.total_usd || 0) * Number(saleData.exchange_rate || 1))
          });
        }

        setData({
          id: saleData.id,
          doc_type: saleData.doc_type || 'FACTURA',
          doc_number: saleData.doc_number || saleData.id.slice(0, 8),
          created_at: saleData.created_at,
          customer_name: customerName,
          customer_doc: customerDoc,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          status: saleData.status || 'COMPLETADA',
          exchange_rate: Number(saleData.exchange_rate) || 1,
          total_usd: Number(saleData.total_usd) || 0,
          total_ves: Number(saleData.total_ves) || (Number(saleData.total_usd || 0) * Number(saleData.exchange_rate || 1)),
          notes: saleData.notes || '',
          items,
          payments
        });
        setIsLoading(false);
        return;
      }

      // 2. Si no es de sales, consultar /api/orders (pedidos web)
      const ordersRes = await fetch('/api/orders');
      if (ordersRes.ok) {
        const json = await ordersRes.json();
        if (json.success && Array.isArray(json.data)) {
          const foundOrder = json.data.find((o: any) => o.id === activeId || o.order_number === activeId);
          if (foundOrder) {
            const items: SaleItemDetail[] = (foundOrder.items || []).map((it: any, idx: number) => ({
              id: it.id || `ord-item-${idx}`,
              name: it.name || 'Producto',
              quantity: Number(it.quantity) || 1,
              unit_price_usd: Number(it.unit_price_usd) || 0,
              total_usd: Number(it.total_usd) || ((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0))
            }));

            setData({
              id: foundOrder.id,
              doc_type: 'PEDIDO_WEB',
              doc_number: foundOrder.order_number || foundOrder.id.slice(0, 8),
              created_at: foundOrder.created_at,
              customer_name: foundOrder.customer_name || 'Cliente Web',
              customer_doc: foundOrder.customer_doc || 'N/A',
              customer_phone: foundOrder.customer_phone || 'N/A',
              customer_email: foundOrder.customer_email || 'N/A',
              status: foundOrder.delivery_status || foundOrder.status || 'ENTREGADO',
              exchange_rate: Number(foundOrder.exchange_rate) || 1,
              total_usd: Number(foundOrder.total_usd) || 0,
              total_ves: Number(foundOrder.total_ves) || (Number(foundOrder.total_usd || 0) * Number(foundOrder.exchange_rate || 1)),
              notes: foundOrder.notes || '',
              items,
              payments: [
                {
                  method: foundOrder.payment_method || 'Pago Móvil',
                  amount_usd: Number(foundOrder.total_usd) || 0,
                  amount_ves: Number(foundOrder.total_ves) || 0
                }
              ]
            });
            setIsLoading(false);
            return;
          }
        }
      }

      setData(null);
      setIsLoading(false);
    } catch (err) {
      console.error('Error cargando detalle de venta:', err);
      setData(null);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSaleData();
  }, [activeId]);

  const getDocTypeFormatted = (type: string) => {
    switch (type.toUpperCase()) {
      case 'FACTURA':
        return { label: 'FACTURA', prefix: 'FACT-', tone: 'success' as const };
      case 'NOTA':
        return { label: 'NOTA DE ENTREGA', prefix: 'NE-', tone: 'warning' as const };
      case 'PEDIDO':
      case 'PEDIDO_WEB':
      case 'PEDIDO ONLINE':
        return { label: 'PEDIDO WEB', prefix: 'PED-', tone: 'brand' as const };
      default:
        return { label: type, prefix: '#', tone: 'brand' as const };
    }
  };

  const docInfo = data ? getDocTypeFormatted(data.doc_type) : { label: 'VENTA', prefix: '#', tone: 'brand' as const };
  const displayDocNum = data ? (data.doc_number.startsWith('FACT-') || data.doc_number.startsWith('NE-') || data.doc_number.startsWith('PED-') || data.doc_number.startsWith('#') ? data.doc_number : `${docInfo.prefix}${data.doc_number}`) : '';

  return (
    <div className="content">
      {/* Botón Volver y Cabecera de Página */}
      <div className="page-head flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Button variant="primary" onClick={handleBack} className="mb-3">
            <ArrowLeft className="w-4 h-4" /> Volver al Reporte
          </Button>
          <h1>Comprobante y Detalle de Pago #{displayDocNum}</h1>
          <p>
            {data ? new Date(data.created_at).toLocaleString() : '—'} • Registrado por {data?.doc_type === 'PEDIDO_WEB' ? 'Tienda Online (Web)' : 'Caja POS / Mostrador'}
          </p>
        </div>
        <div className="actions flex gap-2">
          <Button variant="secondary" onClick={loadSaleData}>
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Imprimir Comprobante
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center">
          <div className="inline-block w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="muted small">Cargando información completa del comprobante...</p>
        </Card>
      ) : data ? (
        <div className="space-y-6">
          {/* Membrete del Negocio Registrado */}
          {(() => {
            const business = getBusinessProfile();
            return (
              <div style={{ background: '#4b5563', color: '#ffffff', padding: '16px 20px', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{business.businessName}</div>
                  <div style={{ fontSize: 12, color: '#e5e7eb', marginTop: 2 }}>
                    RIF: {business.rif} | Tel: {business.phone}{business.address ? ` | Dirección: ${business.address}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{docInfo.label} #{displayDocNum}</div>
                  <div style={{ fontSize: 11, color: '#d1d5db' }}>{data.created_at ? new Date(data.created_at).toLocaleString() : ''}</div>
                </div>
              </div>
            );
          })()}

          {/* Ficha 1: Información General y Datos Fiscales */}
          <Card>
            <div className="section-head mb-4">
              <h3>Datos del Comprobante y Cliente</h3>
              <Badge tone={docInfo.tone}>{docInfo.label}</Badge>
            </div>

            <div className="grid grid-3 gap-4">
              <div>
                <div className="kpi-label">Nombre o Razón Social</div>
                <div className="font-bold text-base mt-1">{data.customer_name}</div>
              </div>
              <div>
                <div className="kpi-label">Identificación / RIF</div>
                <div className="font-semibold text-base mt-1">{data.customer_doc}</div>
              </div>
              <div>
                <div className="kpi-label">Teléfono de Contacto</div>
                <div className="font-semibold text-base mt-1">{data.customer_phone}</div>
              </div>
              <div>
                <div className="kpi-label">Tipo de Comprobante</div>
                <div className="font-semibold text-base mt-1">{docInfo.label}</div>
              </div>
              <div>
                <div className="kpi-label">Tasa Oficial Aplicada</div>
                <div className="font-semibold text-base mt-1">
                  {data.exchange_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES/$
                </div>
              </div>
              <div>
                <div className="kpi-label">Estado de la Operación</div>
                <div className="mt-1">
                  <Badge tone={data.status === 'COMPLETADA' || data.status === 'ENTREGADO' || data.status === 'PAGADO' ? 'success' : 'warning'}>
                    {data.status}
                  </Badge>
                </div>
              </div>
            </div>

            {data.notes && (
              <div className="mt-4 pt-3 border-t border-border">
                <span className="small muted font-bold">Observaciones / Notas:</span>
                <p className="small text-text mt-0.5">{data.notes}</p>
              </div>
            )}
          </Card>

          {/* Ficha 2: Artículos y Productos Facturados */}
          <Card>
            <div className="section-head mb-4">
              <h3>Artículos y Productos Vendidos</h3>
              <span className="badge brand">{data.items.length} productos</span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Descripción del Producto</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Precio Unitario ($)</th>
                    <th className="num">Total ($)</th>
                    <th className="num">Total (VES)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No hay productos detallados registrados en este comprobante.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="font-semibold">{it.name}</td>
                        <td className="num font-bold">{it.quantity}</td>
                        <td className="num">{formatUSD(it.unit_price_usd)}</td>
                        <td className="num font-bold">{formatUSD(it.total_usd)}</td>
                        <td className="num muted">{formatVES(it.total_usd * data.exchange_rate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Ficha 3: Formas de Pago y Cuentas Bancarias Acreditadas */}
          <Card>
            <div className="section-head mb-4">
              <h3>Destino y Cuentas Bancarias Acreditadas</h3>
              <span className="badge warning">Tesorería</span>
            </div>

            <div className="space-y-3">
              {data.payments.map((p, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border"
                  style={{ background: '#fafbfc' }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                      style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}
                    >
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{p.bank_name || p.method}</div>
                      <div className="small muted">
                        {p.account_number ? `N° Cuenta: ${p.account_number} • ` : ''}Abonado vía {p.method}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-base">
                      {p.amount_ves > 0 ? `Bs. ${p.amount_ves.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatUSD(p.amount_usd)}
                    </div>
                    <div className="small muted">
                      Equivalente: {formatUSD(p.amount_usd)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Ficha 4: Liquidación y Totales del Comprobante */}
          <Card>
            <div className="section-head mb-4">
              <h3>Liquidación Financiera Bimonetaria</h3>
              <span className="badge success">Consolidado</span>
            </div>

            <div className="space-y-2 text-sm max-w-md ml-auto">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="muted">Subtotal en Divisas:</span>
                <span className="font-semibold">{formatUSD(data.total_usd)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="muted">Tasa de Conversión BCV:</span>
                <span className="font-semibold">{data.exchange_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES/$</span>
              </div>
              <div className="flex justify-between items-baseline pt-2">
                <span className="font-bold text-base">Total a Pagar:</span>
                <div className="text-right">
                  <div className="font-black text-2xl text-text">{formatUSD(data.total_usd)}</div>
                  <div className="small muted font-semibold">
                    Bs. {data.total_ves.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="empty">
          <p className="font-bold">No se encontró información para el comprobante #{activeId}.</p>
          <Button variant="primary" onClick={handleBack} className="mt-4">
            <ArrowLeft className="w-4 h-4" /> Volver al Reporte
          </Button>
        </Card>
      )}
    </div>
  );
}
