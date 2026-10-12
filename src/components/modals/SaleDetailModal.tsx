import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Building2, 
  User, 
  Phone, 
  CreditCard, 
  Calendar, 
  ShoppingBag, 
  Printer, 
  ExternalLink, 
  FileText, 
  CheckCircle2 
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { formatUSD, formatVES } from '../../lib/currency';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

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

interface SaleDetail {
  id: string;
  doc_type: string;
  doc_number: string;
  created_at: string;
  customer_name: string;
  customer_doc: string;
  customer_phone: string;
  status: string;
  exchange_rate: number;
  total_usd: number;
  total_ves: number;
  items: SaleItemDetail[];
  payments: PaymentRecordDetail[];
}

export function SaleDetailModal({ isOpen, onClose, saleId }: { isOpen: boolean; onClose: () => void; saleId: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<SaleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Escuchar tecla ESC para cerrar modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !saleId) return;

    let isMounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      try {
        // 1. Intentar buscar en tabla 'sales'
        const { data: saleData } = await supabase
          .from('sales')
          .select('*')
          .eq('id', saleId)
          .maybeSingle();

        if (saleData && isMounted) {
          // A. Obtener datos del cliente desde tabla 'customers' si existe customer_id
          let customerName = 'Consumidor Final';
          let customerDoc = 'N/A';
          let customerPhone = 'N/A';

          if (saleData.customer_id) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('name, doc_number, doc_type, phone')
              .eq('id', saleData.customer_id)
              .maybeSingle();

            if (customerData) {
              customerName = customerData.name || customerName;
              customerDoc = customerData.doc_number ? `${customerData.doc_type ? customerData.doc_type + ' ' : ''}${customerData.doc_number}` : 'N/A';
              customerPhone = customerData.phone || 'N/A';
            }
          }

          // B. Obtener artículos vendidos desde 'sale_items'
          const { data: itemsData } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', saleId);

          const items: SaleItemDetail[] = (itemsData || []).map((it: any) => ({
            id: it.id,
            name: it.name || 'Producto sin nombre',
            quantity: Number(it.quantity) || 1,
            unit_price_usd: Number(it.unit_price_usd) || 0,
            total_usd: Number(it.total_usd) || ((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0))
          }));

          // C. Obtener pagos y cuentas bancarias desde 'payments' y 'bank_accounts'
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('*')
            .eq('sale_id', saleId);

          // Cargar cuentas bancarias para asociar nombre del banco
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

          // Si no hay pagos registrados en 'payments', crear un registro representativo
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
            status: saleData.status || 'COMPLETADA',
            exchange_rate: Number(saleData.exchange_rate) || 1,
            total_usd: Number(saleData.total_usd) || 0,
            total_ves: Number(saleData.total_ves) || (Number(saleData.total_usd || 0) * Number(saleData.exchange_rate || 1)),
            items,
            payments
          });
          setIsLoading(false);
          return;
        }

        // 2. Si no es de 'sales', buscar en /api/orders o datos locales de pedidos web
        const ordersRes = await fetch('/api/orders');
        if (ordersRes.ok) {
          const json = await ordersRes.json();
          if (json.success && Array.isArray(json.data)) {
            const foundOrder = json.data.find((o: any) => o.id === saleId || o.order_number === saleId);
            if (foundOrder && isMounted) {
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
                status: foundOrder.delivery_status || foundOrder.status || 'COMPLETADO',
                exchange_rate: Number(foundOrder.exchange_rate) || 1,
                total_usd: Number(foundOrder.total_usd) || 0,
                total_ves: Number(foundOrder.total_ves) || (Number(foundOrder.total_usd || 0) * Number(foundOrder.exchange_rate || 1)),
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

        if (isMounted) {
          setData(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error fetching sale detail:', err);
        if (isMounted) {
          setData(null);
          setIsLoading(false);
        }
      }
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, saleId]);

  if (!isOpen) return null;

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

  const handleOpenFullScreen = () => {
    onClose();
    if (data?.id) {
      navigate(`/ventas-flash/reporte/${data.id}`);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-detail-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-3xl my-auto bg-white border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera de la Ventana Modal */}
        <div className="p-4 md:p-5 border-b border-border bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="sale-detail-modal-title" className="text-lg md:text-xl font-bold text-text">
                  Comprobante #{displayDocNum}
                </h2>
                <Badge tone={docInfo.tone}>{docInfo.label}</Badge>
              </div>
              <p className="text-xs text-muted">
                {data ? new Date(data.created_at).toLocaleString() : '—'} • Canal: {data?.doc_type === 'PEDIDO_WEB' ? 'Tienda Virtual' : 'Caja POS / Mostrador'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              onClick={() => window.print()}
              title="Imprimir Comprobante"
              className="hidden sm:inline-flex"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleOpenFullScreen}
              title="Abrir en pantalla completa externa"
              className="hidden sm:inline-flex"
            >
              <ExternalLink className="w-4 h-4" /> Pantalla Completa
            </Button>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="p-1 h-9 w-9 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5 text-muted" />
            </Button>
          </div>
        </div>

        {/* Contenido del Formulario */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-5 bg-[#f8f9fb]">
          {isLoading ? (
            <div className="py-20 text-center bg-white rounded-xl border border-border">
              <div className="inline-block w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs text-muted font-medium">Cargando datos del comprobante...</p>
            </div>
          ) : data ? (
            <>
              {/* Sección 1: Ficha de Identificación del Comprobante y Cliente */}
              <Card>
                <div className="section-head">
                  <h3>Datos del Comprobante y Cliente</h3>
                  <span className={`badge ${data.status === 'COMPLETADA' || data.status === 'ENTREGADO' || data.status === 'PAGADO' ? 'success' : 'warning'}`}>
                    {data.status}
                  </span>
                </div>

                <div className="grid grid-3 gap-3">
                  <div>
                    <div className="kpi-label">Nombre o Razón Social</div>
                    <div className="font-bold text-sm text-text mt-0.5">{data.customer_name}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Cédula / RIF</div>
                    <div className="font-semibold text-sm text-text mt-0.5">{data.customer_doc}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Teléfono / Contacto</div>
                    <div className="font-semibold text-sm text-text mt-0.5">{data.customer_phone}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Tipo de Comprobante</div>
                    <div className="font-semibold text-sm text-text mt-0.5">{docInfo.label}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Tasa Oficial BCV</div>
                    <div className="font-semibold text-sm text-text mt-0.5">
                      {data.exchange_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES/$
                    </div>
                  </div>
                  <div>
                    <div className="kpi-label">Estado de la Transacción</div>
                    <div className="font-semibold text-sm text-text mt-0.5">
                      {data.status}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Sección 2: Detalle de Ítems / Productos */}
              <Card>
                <div className="section-head">
                  <h3>Artículos y Productos Facturados</h3>
                  <span className="badge brand">{data.items.length} productos</span>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Descripción del Producto</th>
                        <th className="num">Cantidad</th>
                        <th className="num">Precio Unit. ($)</th>
                        <th className="num">Total ($)</th>
                        <th className="num">Total (VES)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="empty">
                            No se encontraron artículos individuales registrados en esta venta.
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

              {/* Sección 3: Formas de Pago y Cuentas Bancarias */}
              <Card>
                <div className="section-head">
                  <h3>Destino y Cuentas Bancarias Acreditadas</h3>
                  <span className="badge warning">Tesorería</span>
                </div>

                <div className="space-y-2.5">
                  {data.payments.map((p, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-[#fafbfc]"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
                          style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}
                        >
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-text">{p.bank_name || p.method}</div>
                          <div className="text-[11px] text-muted">
                            {p.account_number ? `N° Cuenta: ${p.account_number} • ` : ''}Abonado vía {p.method}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xs text-text">
                          {p.amount_ves > 0 ? `Bs. ${p.amount_ves.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatUSD(p.amount_usd)}
                        </div>
                        <div className="text-[11px] text-muted">
                          Equivalente: {formatUSD(p.amount_usd)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Sección 4: Liquidación Financiera Bimonetaria */}
              <Card>
                <div className="section-head">
                  <h3>Liquidación Financiera Bimonetaria</h3>
                  <span className="badge success">Consolidado</span>
                </div>

                <div className="space-y-2 text-xs max-w-sm ml-auto">
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted">Subtotal en Divisas:</span>
                    <span className="font-semibold text-text">{formatUSD(data.total_usd)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted">Tasa de Cambio Oficial BCV:</span>
                    <span className="font-semibold text-text">{data.exchange_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES/$</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2">
                    <span className="font-bold text-sm text-text">Total Liquidado:</span>
                    <div className="text-right">
                      <div className="font-black text-xl text-text">{formatUSD(data.total_usd)}</div>
                      <div className="text-xs text-muted font-semibold">
                        Bs. {data.total_ves.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card className="empty">
              <p className="font-bold text-danger">No se encontró información para el comprobante #{saleId.slice(0, 8)}.</p>
              <p className="text-xs text-muted mt-1">Verifica que el registro exista en la base de datos de ventas o pedidos.</p>
            </Card>
          )}
        </div>

        {/* Pie del Formulario con Acciones Canónicas */}
        <div className="p-4 border-t border-border bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted">
            {data ? `Identificador interno: ${data.id.slice(0, 12)}...` : ''}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="secondary" onClick={onClose} className="px-4">
              Cerrar
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => {
                onClose();
                navigate(`/ventas-flash/reporte/${saleId}`);
              }}
              className="px-4"
              title="Abrir en pantalla o formulario completo"
            >
              <ExternalLink className="w-4 h-4" /> Formulario Completo
            </Button>
            <Button 
              variant="primary" 
              onClick={() => window.print()}
              className="px-4"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
