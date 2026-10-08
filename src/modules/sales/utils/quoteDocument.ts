import { formatUSD, formatVES } from '../../../lib/currency';

export interface QuoteDocumentData {
  docNumber: string;
  createdAt: string;
  expiresAt?: string;
  validityDays?: number;
  customerName: string;
  customerDoc?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  exchangeRate: number;
  rateSource?: string;
  notes?: string;
  items: Array<{
    sku?: string;
    name: string;
    quantity: number;
    unitPriceUSD: number;
    totalUSD: number;
    totalVES: number;
  }>;
  subtotalUSD: number;
  discountUSD?: number;
  taxUSD?: number;
  igtfUSD?: number;
  totalUSD: number;
  totalVES: number;
  status?: string;
}

/**
 * Genera el HTML formateado profesional de la cotización para impresión o archivo descargable
 */
export function buildQuoteHTML(data: QuoteDocumentData): string {
  const issueDate = data.createdAt ? new Date(data.createdAt).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('es-VE');
  const validUntil = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }) : `${data.validityDays || 7} días continuos`;

  const itemsRows = data.items.map((it, idx) => `
    <tr>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 12px;">${idx + 1}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; color: #475569; font-size: 12px;">${it.sku || '—'}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b; font-size: 13px;">${it.name}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600; font-size: 13px;">${it.quantity}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${formatUSD(it.unitPriceUSD, '$ ')}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">${formatUSD(it.totalUSD, '$ ')}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569; font-size: 12px;">${formatVES(it.totalVES)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cotización ${data.docNumber} - Frenyer ERP</title>
  <style>
    @page { size: letter; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .quote-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 32px;
      background: #fff;
    }
    @media print {
      body { padding: 0; }
      .quote-container { border: none; padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #8b78e8;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand h1 {
      margin: 0 0 4px;
      font-size: 26px;
      color: #1e1b4b;
      letter-spacing: -0.5px;
    }
    .brand span { color: #8b78e8; }
    .brand p { margin: 0; font-size: 12px; color: #64748b; }
    .doc-badge {
      text-align: right;
    }
    .doc-badge .tag {
      background: #f5f3ff;
      color: #6d28d9;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid #ddd6fe;
      display: inline-block;
      margin-bottom: 6px;
    }
    .doc-badge h2 {
      margin: 0;
      font-size: 22px;
      color: #0f172a;
      font-family: monospace;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
      background: #fafbfc;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      padding: 16px;
    }
    .info-block h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 800;
    }
    .info-block p {
      margin: 0 0 4px;
      font-size: 13px;
      color: #1e293b;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table th {
      background: #f8fafc;
      padding: 10px 8px;
      border-bottom: 2px solid #cbd5e1;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      font-weight: 700;
    }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 28px;
    }
    .totals-box {
      width: 320px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
      color: #475569;
    }
    .total-row.final {
      border-top: 2px solid #e2e8f0;
      padding-top: 10px;
      margin-top: 8px;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .total-ves-final {
      font-size: 13px;
      color: #64748b;
      text-align: right;
      font-weight: 600;
      margin-top: 4px;
    }
    .legal-notice {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 28px;
      font-size: 11px;
      color: #92400e;
      line-height: 1.5;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      padding-top: 20px;
    }
    .sign-box {
      border-top: 1px dashed #cbd5e1;
      padding-top: 8px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .action-bar {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .btn-print {
      background: #8b78e8;
      color: white;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-download {
      background: #0f172a;
      color: white;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="action-bar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-download" onclick="window.close()">Cerrar Vista</button>
  </div>

  <div class="quote-container">
    <div class="header">
      <div class="brand">
        <h1>FRENYER <span>ERP</span></h1>
        <p>Sistema Integral de Gestión Comercial & Bimonetaria</p>
      </div>
      <div class="doc-badge">
        <div class="tag">Presupuesto Proforma</div>
        <h2>N° COT-${data.docNumber}</h2>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-block">
        <h3>Datos del Cliente</h3>
        <p><b>Nombre / Razón Social:</b> ${data.customerName}</p>
        <p><b>C.I. / R.I.F.:</b> ${data.customerDoc || 'No especificado'}</p>
        ${data.customerPhone ? `<p><b>Teléfono:</b> ${data.customerPhone}</p>` : ''}
        ${data.customerEmail ? `<p><b>Correo:</b> ${data.customerEmail}</p>` : ''}
        ${data.customerAddress ? `<p><b>Dirección:</b> ${data.customerAddress}</p>` : ''}
      </div>

      <div class="info-block">
        <h3>Detalles de la Cotización</h3>
        <p><b>Fecha de Emisión:</b> ${issueDate}</p>
        <p><b>Vigencia:</b> ${validUntil}</p>
        <p><b>Tasa Oficial Ref. (BCV):</b> Bs. ${Number(data.exchangeRate).toFixed(4)} / USD</p>
        <p><b>Estado:</b> <span style="font-weight:700; color:#8b78e8;">${data.status || 'Creada'}</span></p>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px; text-align: center;">#</th>
          <th style="width: 100px; text-align: left;">SKU</th>
          <th style="text-align: left;">Descripción</th>
          <th style="width: 60px; text-align: center;">Cant.</th>
          <th style="width: 110px; text-align: right;">Precio Unit.</th>
          <th style="width: 120px; text-align: right;">Total USD</th>
          <th style="width: 130px; text-align: right;">Total VES</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="totals-area">
      <div class="totals-box">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${formatUSD(data.subtotalUSD, '$ ')}</span>
        </div>
        ${data.discountUSD && data.discountUSD > 0 ? `
        <div class="total-row" style="color:#dc2626;">
          <span>Descuento aplicado:</span>
          <span>-${formatUSD(data.discountUSD, '$ ')}</span>
        </div>` : ''}
        ${data.taxUSD && data.taxUSD > 0 ? `
        <div class="total-row">
          <span>I.V.A. (16%):</span>
          <span>${formatUSD(data.taxUSD, '$ ')}</span>
        </div>` : ''}
        ${data.igtfUSD && data.igtfUSD > 0 ? `
        <div class="total-row">
          <span>I.G.T.F. (3%):</span>
          <span>${formatUSD(data.igtfUSD, '$ ')}</span>
        </div>` : ''}
        <div class="total-row final">
          <span>TOTAL A PAGAR:</span>
          <span>${formatUSD(data.totalUSD, '$ ')}</span>
        </div>
        <div class="total-ves-final">
          Equivalente en Bolívares: <b>${formatVES(data.totalVES)}</b>
        </div>
      </div>
    </div>

    ${data.notes ? `
    <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #334155;">
      <b>Observaciones y condiciones:</b><br/>
      ${data.notes.replace(/\n/g, '<br/>')}
    </div>` : ''}

    <div class="legal-notice">
      <b>Términos y Condiciones:</b><br/>
      1. Los precios expresados en Bolívares (VES) son calculados con base en la tasa oficial publicada por el Banco Central de Venezuela (BCV) y se ajustarán a la tasa vigente a la fecha de pago.<br/>
      2. Esta cotización representa una estimación comercial y no reserva inventario físico hasta su facturación y confirmación de pago.<br/>
      3. Válida únicamente dentro del plazo de vigencia establecido en este documento.
    </div>

    <div class="signatures">
      <div class="sign-box">
        <b>Frenyer ERP — Departamento de Ventas</b><br/>
        Firma autorizada
      </div>
      <div class="sign-box">
        <b>${data.customerName}</b><br/>
        Aceptación conforme del cliente
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Abre ventana de impresión / Guardar como PDF
 */
export function printQuoteDocument(data: QuoteDocumentData): void {
  const html = buildQuoteHTML(data);
  const printWindow = window.open('', '_blank', 'width=900,height=800,menubar=no,toolbar=no,location=no');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Permitir cargar estilos y disparar impresión
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        // En caso de bloqueo de navegador
      }
    }, 400);
  }
}

/**
 * Descarga el archivo de cotización como documento HTML interactivo independiente
 */
export function downloadQuoteFile(data: QuoteDocumentData): void {
  const html = buildQuoteHTML(data);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeDoc = (data.docNumber || '0001').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeClient = (data.customerName || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  link.href = url;
  link.download = `Cotizacion_${safeDoc}_${safeClient}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
