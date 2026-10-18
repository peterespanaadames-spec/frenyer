# Dashboard

## Descripción
El dashboard es el punto central de entrada a Frenyer ERP. Proporciona una visión general en tiempo real de los indicadores clave de desempeño (KPIs) del negocio.

## Estructura Actual
- Ubicación: `src/pages/Dashboard.tsx`
- Componentes: Utiliza componentes reutilizables de UI (`Card`, `Badge`) para mostrar resúmenes financieros y operativos.

## Funcionalidades Clave
- Visualización consolidada de métricas críticas.
- Acceso rápido a los módulos principales.

## Guía de Reestructuración / Mantenimiento
- Para añadir nuevos KPIs, se deben importar los servicios de datos necesarios (`src/lib/supabase/db.ts`) dentro de un `useEffect` y actualizar el estado local del componente.
- Seguir el Design System unificado (colores de acento, tipografía) definido en `/docs/design-system/DESIGN_SYSTEM.md`.
