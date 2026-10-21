# Actualizaciones del Sistema - Reportes y Exportaciones

## Descripción de las Mejoras

Se ha estandarizado el formato de exportación (PDF y XLS) para todos los reportes del sistema.
Este documento es la referencia del estándar y del estado de su adopción por módulo.

## Cambios Realizados

- **Estándar de Estilo**: se ha definido un formato consistente con encabezados en color gris
  oscuro (`#4b5563`) y texto en blanco, con filas de datos en fondo blanco y texto oscuro para
  garantizar legibilidad.
- **Membrete Empresarial**: se creó una utilidad central (`src/lib/reportUtils.ts`) que recupera
  la información del negocio (Nombre, RIF, Teléfono) desde la configuración y la inserta
  automáticamente en todos los reportes generados.
- **Implementación**: se aplicó este estándar inicialmente en el módulo de Cuentas por Pagar
  (`AccountsPayable.tsx`).

## Estándar

### Encabezado

| Elemento | Especificación |
|---|---|
| Fondo | Gris oscuro `#4b5563` |
| Texto | **Blanco** |
| Contenido | Nombre del negocio · RIF · Teléfono · Dirección |
| Título | Nombre del reporte (opcional) |
| Subtítulo | Periodo o filtros aplicados (opcional) |
| Fecha de emisión | Última fila del encabezado |

### Datos

| Elemento | Especificación |
|---|---|
| Fondo de celda | Blanco o transparente |
| Texto | Oscuro (`var(--text)`) |
| Importes | Siempre con `formatUSD` / `formatVES` |

### Pie

`getReportFooterHtml(additionalText?)` genera el pie fiscal y **sustituye cualquier mención a
"Frenyer ERP"** por los datos reales del negocio.

## Utilidades — `src/lib/reportUtils.ts`

| Función | Uso |
|---|---|
| `getReportHeaderHtml(title?, subtitle?)` | Banner gris con los datos del negocio |
| `getReportFooterHtml(additionalText?)` | Pie fiscal |
| `buildExcelHeaderRows(reportTitle)` | 5 filas de encabezado (nombre / RIF+tel+dir / título / fecha de emisión / vacía) |
| `createWorksheetWithBusinessHeader(reportTitle, dataRows, { isAOA? })` | Hoja XLSX con el membrete; las filas JSON arrancan en `A6` |
| `buildXlsHtmlReport({ title, tableHtml })` | Documento HTML compatible con Excel para exportar `.xls` |

> ℹ️ `reportUtils.ts` importa **solo** `xlsx`. `jspdf` y `html2canvas` se importan
> **directamente** en los módulos que exportan a PDF.

## Librerías de exportación

| Librería | Dónde se importa |
|---|---|
| `xlsx` | `reportUtils.ts` + `Inventory.tsx`, `Movements.tsx`, `DailyInventoryReport.tsx`, `Orders.tsx`, `SalesReport.tsx`, `AccountsReport.tsx`, `Customers.tsx`, `Suppliers.tsx` |
| `jspdf` + `html2canvas` | **Directamente** en `CompanyHealth.tsx` y `ProfitLoss.tsx` |

### Patrón PDF

```ts
const canvas = await html2canvas(document.querySelector('.content') as HTMLElement);
const pdf = new jsPDF('p', 'mm', 'a4');
const imgData = canvas.toDataURL('image/png');
pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(),
  canvas.height * pdf.internal.pageSize.getWidth() / canvas.width);
pdf.save('reporte.pdf');
```

## Estado de la adopción

| Módulo | XLSX | PDF | Membrete |
|---|---|---|---|
| Cuentas por Pagar | ✅ | ✅ | ✅ |
| Cuentas por Cobrar | ✅ | ✅ | ✅ |
| Ventas — Reporte | ✅ | ✅ | ✅ |
| Ventas — Cotizaciones | ✅ (HTML) | ✅ (impresión) | ✅ |
| Inventario — Catálogo | ✅ | — | ✅ |
| Inventario — Kárdex | ✅ | ✅ | ✅ |
| Inventario — Reporte diario | ✅ | ✅ | ✅ |
| Pedidos | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ |
| Proveedores | ✅ | ✅ | ✅ |
| Salud del negocio | — | ✅ | Parcial (sin `reportUtils`) |
| Ganancias y pérdidas | — | ✅ | Parcial (sin `reportUtils`) |
| Compras internas | — | ✅ (voucher) | ✅ |

## Próximos Pasos

- [ ] Aplicar el estándar a los módulos restantes de forma progresiva.
- [ ] **Extraer el patrón PDF a `reportUtils.ts`** como `exportPdf(element, filename)` para
      eliminar la duplicación entre `CompanyHealth.tsx` y `ProfitLoss.tsx`.
- [ ] Usar el patrón extraído en `SalesReport.tsx` y `AccountsReport.tsx`, que hoy construyen su
      PDF por su cuenta.
- [ ] Consolidar el HTML imprimible de `quoteDocument.ts` (395 líneas) en el mismo estándar.
- [ ] Unificar la forma de obtener el perfil del negocio: hoy algunos módulos leen
      `getBusinessProfile()` y otros leen `localStorage` directamente.

## Deuda técnica

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | El patrón PDF está duplicado en dos módulos | `CompanyHealth.tsx`, `ProfitLoss.tsx` | 🟡 |
| 2 | `SalesReport.tsx` y `AccountsReport.tsx` construyen su propio PDF | ambos | 🟡 |
| 3 | `quoteDocument.ts` tiene su propio CSS de impresión (`@page { size: letter }`) | `quoteDocument.ts` | ⚪ |
| 4 | El membrete no se aplica en los PDF de salud y ganancias | `CompanyHealth.tsx`, `ProfitLoss.tsx` | 🟡 |
| 5 | Los reportes que leen de Supabase desde el navegador **no muestran datos** | varios | 🔴 |

## Referencias

- [Design System — exportación de reportes](design-system/COMPONENTS_AND_PATTERNS.md#9-exportación-de-reportes)
- [Reglas de negocio §13.1 (estándar de exportación)](architecture/BUSINESS_RULES.md#131-estándar-de-exportación-de-reportes)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
