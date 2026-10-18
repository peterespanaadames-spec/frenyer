import * as XLSX from 'xlsx';
import { getBusinessProfile, BusinessProfile } from './businessProfile';

/**
 * Retorna el banner estándar para encabezados de reportes HTML / PDF
 * cumpliendo con la Regla de Oro: Nombre del Negocio, RIF, Teléfono y Dirección.
 */
export const getReportHeaderHtml = (title?: string, subtitle?: string): string => {
  const business: BusinessProfile = getBusinessProfile();
  return `
    <div class="header-banner" style="background-color: #4b5563; color: #ffffff; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 4px; font-size: 18px; color: #ffffff; font-weight: 800;">${business.businessName}</h2>
      <p style="margin: 0 0 2px; font-size: 12px; color: #e5e7eb;">
        RIF: ${business.rif} | Tel: ${business.phone}${business.address ? ` | Dirección: ${business.address}` : ''}
      </p>
      ${title ? `<h3 style="margin: 8px 0 0; font-size: 14px; color: #ffffff; font-weight: 700; border-top: 1px solid rgba(255,255,255,0.25); padding-top: 6px;">${title}</h3>` : ''}
      ${subtitle ? `<p style="margin: 2px 0 0; font-size: 11px; color: #d1d5db;">${subtitle}</p>` : ''}
    </div>
  `;
};

/**
 * Retorna el pie de página oficial para documentos generados
 * sustituyendo cualquier mención de "Frenyer ERP" por los datos fiscales del negocio.
 */
export const getReportFooterHtml = (additionalText?: string): string => {
  const business: BusinessProfile = getBusinessProfile();
  return `
    <div class="footer" style="margin-top: 24px; font-size: 10px; color: #6b7280; text-align: right; border-top: 1px solid #e5e7eb; padding-top: 8px;">
      <span>${business.businessName} &bull; RIF: ${business.rif} &bull; Tel: ${business.phone}${business.address ? ` &bull; ${business.address}` : ''}</span>
      ${additionalText ? `<br/><span style="color: #9ca3af;">${additionalText}</span>` : ''}
    </div>
  `;
};

/**
 * Construye filas de encabezado de Excel con el perfil del negocio
 */
export function buildExcelHeaderRows(reportTitle: string): any[][] {
  const b = getBusinessProfile();
  return [
    [b.businessName],
    [`RIF: ${b.rif} | Teléfono: ${b.phone}${b.address ? ` | Dirección: ${b.address}` : ''}`],
    [reportTitle],
    [`Fecha de Emisión: ${new Date().toLocaleString('es-VE')}`],
    [] // Fila en blanco de separación
  ];
}

/**
 * Genera una hoja de cálculo XLSX de SheetJS que incluye el encabezado fiscal
 * del negocio registrado antes de la tabla de datos.
 */
export function createWorksheetWithBusinessHeader(
  reportTitle: string,
  dataRows: Record<string, any>[] | any[][],
  options?: { isAOA?: boolean }
): XLSX.WorkSheet {
  const headerRows = buildExcelHeaderRows(reportTitle);

  if (options?.isAOA && Array.isArray(dataRows)) {
    return XLSX.utils.aoa_to_sheet([...headerRows, ...(dataRows as any[][])]);
  }

  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  if (Array.isArray(dataRows) && dataRows.length > 0) {
    XLSX.utils.sheet_add_json(ws, dataRows as Record<string, any>[], { origin: 'A6' });
  }
  return ws;
}

/**
 * Genera un documento HTML completo para exportación .XLS con el membrete fiscal del negocio
 */
export function buildXlsHtmlReport(options: {
  title: string;
  tableHtml: string;
}): string {
  const business = getBusinessProfile();
  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; }
        .header-banner { background-color: #4b5563; color: #ffffff; padding: 14px; margin-bottom: 15px; }
        table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
        th { background-color: #4b5563; color: #ffffff; font-weight: bold; border: 1px solid #d1d5db; padding: 10px; text-align: left; }
        td { background-color: #ffffff; color: #111827; border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
        tr:nth-child(even) td { background-color: #f9fafb; }
      </style>
    </head>
    <body>
      <div class="header-banner">
        <h2 style="margin: 0 0 4px; color: #ffffff;">${business.businessName}</h2>
        <p style="margin: 0 0 6px; font-size: 12px; color: #e5e7eb;">RIF: ${business.rif} | Tel: ${business.phone}${business.address ? ` | Dirección: ${business.address}` : ''}</p>
        <h3 style="margin: 0; color: #ffffff;">${options.title}</h3>
      </div>
      ${options.tableHtml}
    </body>
    </html>
  `;
}
