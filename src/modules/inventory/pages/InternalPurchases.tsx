import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  Search,
  RefreshCw,
  Plus,
  FileText,
  ShoppingCart,
  Truck,
  Eye,
  Printer,
  Calendar,
  CreditCard,
  Building2,
  X,
  Package,
  CheckCircle2,
  Clock,
  Layers,
  DollarSign
} from 'lucide-react';
import { NewPurchaseModal } from '../../../components/modals/NewPurchaseModal';
import {
  fetchPurchasesFromSupabase,
  fetchSuppliersFromSupabase,
  type DbPurchase
} from '../../../lib/supabase/db';
import { getActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';

export function InternalPurchasesPage() {
  const [purchases, setPurchases] = useState<DbPurchase[]>([]);
  const [suppliersCount, setSuppliersCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'today'>('all');
  const [selectedPurchase, setSelectedPurchase] = useState<DbPurchase | null>(null);

  const activeRate = getActiveExchangeRate();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [purchasesData, suppliersData] = await Promise.all([
        fetchPurchasesFromSupabase(),
        fetchSuppliersFromSupabase()
      ]);
      setPurchases(purchasesData || []);
      setSuppliersCount(suppliersData?.length || 0);
    } catch (err) {
      console.error('Error cargando compras:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtrado de compras
  const filteredPurchases = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonthStr = todayStr.slice(0, 7);
    const term = searchTerm.trim().toLowerCase();

    return purchases.filter(p => {
      // Filtro de fecha
      if (dateFilter === 'today' && p.purchase_date !== todayStr) return false;
      if (dateFilter === 'month' && !p.purchase_date.startsWith(currentMonthStr)) return false;

      // Filtro de búsqueda
      if (!term) return true;
      const matchInvoice = p.invoice_number?.toLowerCase().includes(term);
      const matchDoc = p.doc_number?.toLowerCase().includes(term);
      const matchSupplier = p.suppliers?.name?.toLowerCase().includes(term);
      const matchRif = (p.suppliers?.doc_number || p.suppliers?.rif)?.toLowerCase().includes(term);
      const matchNotes = p.notes?.toLowerCase().includes(term);
      const matchItem = p.purchase_items?.some(it =>
        it.name.toLowerCase().includes(term) || it.sku.toLowerCase().includes(term)
      );

      return matchInvoice || matchDoc || matchSupplier || matchRif || matchNotes || matchItem;
    });
  }, [purchases, searchTerm, dateFilter]);

  // Métricas reales
  const kpiTotalUSD = useMemo(() => {
    return purchases.reduce((acc, p) => acc + (Number(p.total_usd) || 0), 0);
  }, [purchases]);

  const kpiTotalVES = useMemo(() => {
    return Math.round(kpiTotalUSD * activeRate * 100) / 100;
  }, [kpiTotalUSD, activeRate]);

  const kpiTotalUnits = useMemo(() => {
    return purchases.reduce((acc, p) => {
      const itemsUnits = p.purchase_items?.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || 0;
      return acc + itemsUnits;
    }, 0);
  }, [purchases]);

  const handlePrintVoucher = (purchase: DbPurchase) => {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      window.print();
      return;
    }

    const itemsRows = (purchase.purchase_items || []).map(it => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${it.sku}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${it.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${Number(it.unit_cost_usd).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${Number(it.total_usd).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">Bs. ${Number(it.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprobante de Compra - ${purchase.doc_number}</title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; padding: 30px; color: #0f172a; margin: 0; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #ede9fe; color: #6d28d9; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          th { background: #f8fafc; text-align: left; padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
          .totals { margin-left: auto; width: 300px; font-size: 14px; }
          .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
          .total-row.final { font-weight: 800; font-size: 16px; color: #0f172a; border-top: 2px solid #0f172a; border-bottom: none; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">COMPROBANTE DE COMPRA E INGRESO</h1>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Sistema Frenyer ERP • Control de Inventarios</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; font-weight: 800; color: #6d28d9;">${purchase.doc_number}</div>
            <div style="font-size: 12px; color: #64748b;">Factura N°: ${purchase.invoice_number}</div>
          </div>
        </div>

        <div class="grid">
          <div style="background: #f8fafc; padding: 14px; border-radius: 8px;">
            <strong style="color: #475569; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase;">Datos del Proveedor</strong>
            <div style="font-weight: 700; font-size: 15px;">${purchase.suppliers?.name || 'Proveedor General'}</div>
            <div>RIF / Documento: ${purchase.suppliers?.doc_number || purchase.suppliers?.rif || 'N/A'}</div>
            <div>Teléfono: ${purchase.suppliers?.phone || 'N/A'}</div>
          </div>
          <div style="background: #f8fafc; padding: 14px; border-radius: 8px;">
            <strong style="color: #475569; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase;">Detalles de la Operación</strong>
            <div>Fecha de emisión: <b>${purchase.purchase_date}</b></div>
            <div>Modalidad de pago: <span class="badge">${purchase.payment_type}</span></div>
            <div>Almacén destino: <b>${purchase.warehouse || 'Tienda Bella Vista'}</b></div>
            <div>Tasa de cambio: <b>Bs. ${Number(purchase.exchange_rate).toFixed(2)}/USD</b></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th style="text-align: center;">Cantidad</th>
              <th style="text-align: right;">Costo USD</th>
              <th style="text-align: right;">Total USD</th>
              <th style="text-align: right;">Total VES</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #94a3b8;">Sin ítems desglosados</td></tr>'}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${Number(purchase.subtotal_usd || purchase.total_usd).toFixed(2)}</span>
          </div>
          <div class="total-row final">
            <span>TOTAL DÓLARES:</span>
            <span>$${Number(purchase.total_usd).toFixed(2)} USD</span>
          </div>
          <div class="total-row" style="font-weight: 700; color: #0284c7; font-size: 15px;">
            <span>TOTAL BOLÍVARES:</span>
            <span>Bs. ${Number(purchase.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        ${purchase.notes ? `
          <div style="margin-top: 30px; padding: 12px; background: #fffbeb; border-radius: 8px; font-size: 12px; color: #92400e;">
            <strong>Observaciones:</strong> ${purchase.notes}
          </div>
        ` : ''}

        <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 16px;">
          Documento generado automáticamente por Frenyer ERP • Operación ingresada con incremento directo de stock.
        </div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  };

  return (
    <div className="content">
      {/* Header */}
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'var(--brand-50)',
            color: 'var(--brand-600)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 2px 8px rgba(109, 40, 217, 0.12)'
          }}>
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>
              COMPRAS E INGRESO DE INVENTARIO
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Registra facturas de proveedores, abastece el inventario con incremento de stock automático y actualiza costos en USD.
            </p>
          </div>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={loadData}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <Plus size={16} /> + COMPRAS
          </Button>
        </div>
      </div>

      {/* Modal de Registro de Compra */}
      <NewPurchaseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          loadData();
        }}
      />

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          {
            title: 'TOTAL COMPRADO (HISTÓRICO)',
            value: formatUSD(kpiTotalUSD),
            subtitle: `≈ ${formatVES(kpiTotalVES)}`,
            icon: DollarSign,
            color: '#6d28d9',
            bg: '#ede9fe'
          },
          {
            title: 'COMPRAS REALIZADAS',
            value: `${purchases.length} Facturas`,
            subtitle: purchases.length > 0 ? '✓ Transacciones validadas' : 'Sin transacciones registradas',
            icon: FileText,
            color: '#0284c7',
            bg: '#e0f2fe'
          },
          {
            title: 'UNIDADES INGRESADAS',
            value: `${kpiTotalUnits.toLocaleString('es-VE')} unidades`,
            subtitle: '↗ Incremento en inventario',
            icon: Package,
            color: '#059669',
            bg: '#d1fae5'
          },
          {
            title: 'PROVEEDORES REGISTRADOS',
            value: `${suppliersCount} Proveedores`,
            subtitle: 'Red de distribución activa',
            icon: Truck,
            color: '#d97706',
            bg: '#fef3c7'
          },
        ].map((kpi, idx) => (
          <Card key={idx} style={{ padding: '16px 18px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.title}
                </span>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                  {kpi.value}
                </div>
              </div>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: kpi.bg,
                color: kpi.color,
                display: 'grid',
                placeItems: 'center'
              }}>
                <kpi.icon size={19} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              {kpi.subtitle}
            </div>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          flex: '1 1 320px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#f8fafc',
          padding: '6px 12px',
          borderRadius: 10,
          border: '1px solid var(--border)'
        }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            className="input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', boxShadow: 'none', padding: 0, height: 'auto', fontSize: 13, background: 'transparent', width: '100%' }}
            placeholder="Buscar por N° Factura, proveedor, producto o fecha..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            variant={dateFilter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setDateFilter('all')}
            style={{ fontWeight: dateFilter === 'all' ? 700 : 500 }}
          >
            Todas
          </Button>
          <Button
            variant={dateFilter === 'month' ? 'secondary' : 'ghost'}
            onClick={() => setDateFilter('month')}
            style={{ fontWeight: dateFilter === 'month' ? 700 : 500 }}
          >
            Este Mes
          </Button>
          <Button
            variant={dateFilter === 'today' ? 'secondary' : 'ghost'}
            onClick={() => setDateFilter('today')}
            style={{ fontWeight: dateFilter === 'today' ? 700 : 500 }}
          >
            Hoy
          </Button>
        </div>
        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 'auto', fontWeight: 600 }}>
          Mostrando {filteredPurchases.length} de {purchases.length}
        </span>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={17} style={{ color: 'var(--brand-600)' }} />
            HISTORIAL DE COMPRAS RECIENTES ({filteredPurchases.length})
          </h2>
          <span style={{ fontSize: 12.5, color: '#0284c7', fontWeight: 600 }}>
            Tasa BCV del día: <b>{formatVES(activeRate)}/USD</b>
          </span>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>FACTURA Nº / CÓDIGO</th>
                <th>FECHA</th>
                <th>PROVEEDOR</th>
                <th>ÍTEMS INGRESADOS</th>
                <th style={{ textAlign: 'right' }}>TOTAL ($ USD)</th>
                <th style={{ textAlign: 'right' }}>TOTAL (BS.)</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'right' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <RefreshCw size={16} className="animate-spin" />
                      Cargando historial de compras...
                    </div>
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '50px 20px' }}>
                    <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 16, background: '#f1f5f9', color: '#64748b', display: 'grid', placeItems: 'center' }}>
                        <ShoppingCart size={24} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                        {searchTerm ? 'No se encontraron compras con el filtro indicado' : 'No hay compras registradas aún'}
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                        {searchTerm
                          ? 'Intenta buscar con otros términos o cambia el rango de fechas seleccionado.'
                          : 'Abastece tu inventario registrando tu primera compra de productos. El stock se sumará de forma automática.'}
                      </p>
                      {!searchTerm && (
                        <Button
                          variant="primary"
                          onClick={() => setIsModalOpen(true)}
                          style={{ marginTop: 8, fontWeight: 700 }}
                        >
                          <Plus size={15} /> REGISTRAR PRIMERA COMPRA
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPurchases.map(p => {
                  const itemCount = p.purchase_items?.length || 0;
                  const totalUnits = p.purchase_items?.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0) || 0;
                  const itemLabel = itemCount > 0
                    ? `${totalUnits} ${totalUnits === 1 ? 'ud.' : 'uds.'} (${itemCount} ${itemCount === 1 ? 'producto' : 'productos'})`
                    : '1 producto ingresado';

                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--brand-600)', fontSize: 13.5 }}>
                          # {p.invoice_number}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                          Ref: {p.doc_number}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {p.purchase_date}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {p.suppliers?.name || 'Proveedor General'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span>RIF: {p.suppliers?.doc_number || p.suppliers?.rif || 'N/A'}</span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 6,
                            background: p.payment_type === 'CREDITO' ? '#fef3c7' : '#e0f2fe',
                            color: p.payment_type === 'CREDITO' ? '#92400e' : '#0369a1',
                            fontWeight: 700
                          }}>
                            {p.payment_type === 'CREDITO' ? 'CRÉDITO / CXP' : 'CONTADO'}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5, color: '#334155' }}>
                        {itemLabel}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {formatUSD(Number(p.total_usd) || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>
                        {formatVES(Number(p.total_ves) || (Number(p.total_usd) * (Number(p.exchange_rate) || activeRate)))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge tone={p.status === 'COMPLETADA' ? 'success' : 'brand'}>
                          ✓ {p.status || 'COMPLETADA'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <Button
                            variant="ghost"
                            onClick={() => setSelectedPurchase(p)}
                            title="Ver desglose completo de la compra"
                            style={{ padding: '6px 8px', borderRadius: 8 }}
                          >
                            <Eye size={15} style={{ color: '#0284c7' }} />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handlePrintVoucher(p)}
                            title="Imprimir comprobante de ingreso"
                            style={{ padding: '6px 8px', borderRadius: 8 }}
                          >
                            <Printer size={15} style={{ color: '#475569' }} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Detalle de Compra */}
      {selectedPurchase && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 1400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            width: 'min(800px, 98vw)',
            maxHeight: '90vh',
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #094783 0%, #0d5ea6 100%)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#fff'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  COMPROBANTE: {selectedPurchase.doc_number}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' }}>
                  Factura N° {selectedPurchase.invoice_number} • Emitida el {selectedPurchase.purchase_date}
                </p>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1e293b'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {/* Información General */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Proveedor</span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                    {selectedPurchase.suppliers?.name || 'Proveedor General'}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>
                    RIF: {selectedPurchase.suppliers?.doc_number || selectedPurchase.suppliers?.rif || 'N/A'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Condición de Pago</span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                    {selectedPurchase.payment_type}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>
                    {selectedPurchase.payment_type === 'CREDITO'
                      ? `Vence: ${selectedPurchase.due_date || 'En 30 días'} (Registrada en CxP)`
                      : `Método: ${selectedPurchase.payment_method || 'Contado'}`}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Almacén y Tasa</span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                    {selectedPurchase.warehouse || 'Tienda Bella Vista'}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#0284c7' }}>
                    Tasa: {formatVES(Number(selectedPurchase.exchange_rate) || activeRate)}/USD
                  </div>
                </div>
              </div>

              {/* Tabla de ítems comprados */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th style={{ textAlign: 'center' }}>Cantidad</th>
                      <th style={{ textAlign: 'right' }}>Costo Unit. ($)</th>
                      <th style={{ textAlign: 'right' }}>Total ($ USD)</th>
                      <th style={{ textAlign: 'right' }}>Total (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPurchase.purchase_items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{it.sku}</td>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right' }}>${Number(it.unit_cost_usd).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>${Number(it.total_usd).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: '#0284c7' }}>
                          Bs. {Number(it.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumen Total */}
              <div style={{
                background: '#f8fafc',
                padding: '14px 18px',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Total de la Compra:</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {formatUSD(Number(selectedPurchase.total_usd) || 0)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Equivalente en Bolívares:</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0284c7' }}>
                    {formatVES(Number(selectedPurchase.total_ves) || (Number(selectedPurchase.total_usd) * (Number(selectedPurchase.exchange_rate) || activeRate)))}
                  </div>
                </div>
              </div>

              {selectedPurchase.notes && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>
                  Nota: {selectedPurchase.notes}
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fafafa'
            }}>
              <Button
                variant="secondary"
                onClick={() => handlePrintVoucher(selectedPurchase)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={15} /> Imprimir Comprobante
              </Button>
              <Button
                variant="primary"
                onClick={() => setSelectedPurchase(null)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
