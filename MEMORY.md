# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase con respaldo local resiliente).
- **Tienda Online (`/` -> `ShopPage.tsx`)**:
  - Identidad corporativa: Logo CR + `Compu` (azul marino) `Repuestos` (rojo carmesí) · `Flores` (azul marino) `Inversiones` (rojo carmesí).
  - Banners duales: **Flores Inversiones CompuFuturo** (laptops ocupando el contenedor, botón pastilla azul «Copias y Materiales») y **Acelera Motor Partes** (fondo oscuro con imagen generada de moto deportiva de alto rendimiento, botón pastilla rojo «Comprar Repuestos»).
  - Clasificación de categorías: Regla estricta para **Materiales y Copias** (oficina, copias, impresión, librería, papelería y tecnología) y **Repuestos de Motos** (repuestos de moto, techos, amortiguadores y accesorios para motos).
  - Catálogo de productos: Tarjetas con bordes redondeados, calificación de 5 estrellas, precios bimonetarios (**USD y VES** a tasa BCV) y botones de acción rápida.
  - Servicios Expresos Entrega local con WhatsApp, botón flotante y barra de navegación inferior móvil.
- **Tasas de Cambio / Bimonetariedad**: Tasa predeterminada en **877.90** (`DEFAULT_EXCHANGE_RATE`, servidor y respaldos) con soporte oficial BCV y tasa futura.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Bloqueo anti-doble-clic y prevención de duplicados con indicador de procesamiento.
- **Compras (`/inventarios/compras`)**: Inserción sincronizada con stock de productos y egresos bancarios.
- **Inventario - Reporte Diario (`/inventarios/reporte-diario`)**: Botón exportar unificado (Excel, CSV, Imprimir/PDF con vista previa).
- **Finanzas - Salud del Negocio y PyG**: Indicadores de capital, balance real bimonetario y exportación completa.
- **Gestión de Usuarios y RBAC (`/configuracion` -> Usuarios Asociados)**: Roles y permisos granulares con persistencia dual.
- **Dashboard Operativo (`/dashboard`)**: Utilidad mensual real deduciendo costos por venta y gastos de `expenses`, Top 5 productos y alertas a 21 días.
- **Estado**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.
