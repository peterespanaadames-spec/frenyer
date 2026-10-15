# Plan de Implementación: Reporte Diario de Inventario en Frenyer ERP

Este plan detalla la integración del módulo de **Reporte Diario** dentro de la sección de **Inventario**, ubicado debajo de **Movimiento**, con soporte completo para filtrado por fechas, cálculo bimonetario (USD/VES), integración con la base de datos y exportación en formatos PDF y Excel.

---

## Decisiones Críticas y Preferencias del Usuario

> [!IMPORTANT]
> - **Filtros de fecha predeterminados**: Se incluirá la opción de mostrar **Todos** los registros de fecha, con selectores opcionales para filtrar por rangos personalizados (Día actual, Semana, Mes o Fechas personalizadas).
> - **Formatos de exportación**: Disponibilidad directa de botones para **Exportar PDF** y **Exportar Excel (CSV/XLS)**.

---

## 1. Resumen y Concepto General

- **Qué hace**: Permite visualizar de forma consolidada todos los movimientos de inventario del día (entradas, salidas, ajustes, transferencias) junto con su valoración monetaria en USD y VES (usando la tasa de cambio vigente del sistema), y exportarlos a PDF y Excel.
- **Audiencia / Persona**: Gerentes de inventario, administradores y personal de almacén de Frenyer.
- **Valor Principal**: Auditoría diaria precisa, control estricto de entradas y salidas de mercancía y disponibilidad de reportes formales listos para impresión o análisis gerencial.

---

## 2. Experiencia de Usuario y Diseño Visual

- **Flujo de Usuario**:
  1. El usuario accede al menú lateral **Inventario** -> **Reporte Diario** (ubicado justo debajo de *Movimientos*).
  2. Visualiza una cabecera limpia con el título del reporte, selector de fechas ("Todos" por defecto, o rangos específicos) y botones de acción rápida (**Exportar PDF**, **Exportar Excel**).
  3. Una tabla resumen muestra las métricas clave del día/periodo: Total Entradas (unidades y valor), Total Salidas (unidades y valor), y Neto de Variación.
  4. La tabla de detalle lista cada transacción de inventario con: Fecha/Hora, Producto, Tipo de Movimiento (Entrada, Salida, Ajuste), Cantidad, Costo Unitario (USD/VES), Total (USD/VES) y Almacén/Sucursal.
- **Identidad Visual**:
  - Estética corporativa de Frenyer ERP: fondo gris frío claro (`#F8FAFC`), tarjetas blancas con bordes de 1px (`border border-slate-200`), tipografía limpia sans-serif (`Plus Jakarta Sans` / `Inter`), y acentos en color violeta/teal coherentes con el Design System.
  - Uso estricto de tabular numerals (`tabular-nums`) para importes monetarios y cantidades.

---

## 3. Decisiones Clave y Decisiones de Arquitectura

- **Integración con Base de Datos (`inventory_movements` / `inventory`)**:
  - Se conecta directamente con el backend existente que gestiona los movimientos de inventario (`/api/inventory-movements` o equivalente en `server.ts` / Supabase).
  - Consulta y consolida los movimientos aplicando los filtros de fecha seleccionados por el usuario.
- **Generación de Reportes (PDF y Excel)**:
  - **PDF**: Se implementará generación limpia utilizando librerías nativas del navegador (ej. `window.print()` estilizado con CSS de impresión `@media print` optimizado para PDF corporativo, o jsPDF si estuviera disponible).
  - **Excel**: Generación y descarga directa de archivo `.csv` / `.xlsx` formateado con codificación UTF-8 para compatibilidad absoluta en Excel.
- **Bimonetariedad**:
  - Todos los montos se muestran y calculan tanto en USD como en VES utilizando la tasa de cambio vigente del sistema configurada en Frenyer.

---

## 4. Arquitectura Técnica y Modelo de Datos *(Referencia Técnica)*

```
┌────────────────────────────────────────────────────────┐
│             Frontend: Inventory Daily Report           │
│  (src/modules/inventory/pages/DailyInventoryReport.tsx)│
└───────────────────────────┬────────────────────────────┘
                            │ GET /api/inventory-movements
                            ▼
┌────────────────────────────────────────────────────────┐
│             Backend API / Server (server.ts)           │
│        Supabase / Local JSON Fallback Store            │
└───────────────────────────┬────────────────────────────┘
                            │ Aggregation & Currency Conversion
                            ▼
┌────────────────────────────────────────────────────────┐
│           Export Modules (PDF Print & Excel CSV)       │
└────────────────────────────────────────────────────────┘
```

- **Rutas y Navegación**:
  - Actualización del enrutador en `/src/app/router/index.tsx` para registrar la ruta `/inventory/daily-report` (o subruta equivalente).
  - Actualización del menú lateral de inventario en `/src/components/ui/Sidebar.tsx` para incluir "Reporte Diario" debajo de "Movimientos".
- **Mapeo de Componentes**:
  - Componente de filtros de fecha y botones de exportación.
  - Tarjetas de resumen de KPIs (Entradas, Salidas, Balance).
  - Tabla de movimientos detallados con paginación y búsqueda rápida.
