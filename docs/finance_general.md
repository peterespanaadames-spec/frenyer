# Finanzas Generales

## Descripción
Módulo para el control de gastos operativos, análisis de salud de la empresa y estado de resultados (ganancias/pérdidas).

## Estructura Actual
- Ubicación: `src/modules/finance/pages/`
- Componentes clave: `Expenses.tsx`, `CompanyHealth.tsx`, `ProfitLoss.tsx`.

## Funcionalidades Clave
- Registro detallado de gastos.
- Indicadores financieros bimonetarios.

## Guía de Reestructuración / Mantenimiento
- Los reportes financieros deben realizar consultas agregadas eficientes a las tablas de ventas, compras y pagos.
- Evitar lógica de cálculo pesada directamente en la UI; pre-calcular en el backend o `tanstack/react-query`.
