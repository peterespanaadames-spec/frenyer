# AGENTS.md — Frenyer

Sistema de gestión empresarial bimonetario (ERP/POS) de alto rendimiento optimizado para el comercio, con control de ventas, inventarios, cuentas, finanzas y el asistente inteligente corporativo Alma. Diseñado para ofrecer una experiencia fluida e integrada en un modelo multi-tenant.

## Stack y estructura

### Tecnologías clave
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS (importado vía `@import` en `globals.css`).
- **Enrutamiento**: React Router DOM (v6 con `createBrowserRouter`).
- **Gráficos**: Recharts para visualización de KPI y balances.
- **Iconos**: Lucide React.
- **Backend / Persistencia**: Supabase (PostgreSQL con seguridad RLS obligatoria).

### Estructura de carpetas importante
- `/src/app/router/index.tsx` - Árbol central de enrutamiento y registro de módulos.
- `/src/layouts/DashboardLayout.tsx` - AppShell principal que distribuye el menú lateral y la cabecera.
- `/src/components/ui/` - Componentes globales de diseño reutilizables (Sidebar, Button, Card, Badge).
- `/src/modules/` - Módulos de dominio desacoplados:
  - `sales/` - Punto de venta (POS), facturación, pedidos, cotizaciones e informes de venta.
  - `inventory/` - Control de catálogo de productos, compras internas y kárdex de movimientos.
  - `finance/` - Flujos de caja, cuentas bancarias, ingresos, egresos (gastos) y estado de pérdidas y ganancias.
  - `accounts-receivable/` - Gestión de cuentas por cobrar y obligaciones por pagar.
  - `customers/` - CRM de clientes, proveedores y campañas de marketing.
  - `alma/` - Centro de operaciones y chat del asistente inteligente Alma.
- `/supabase/migrations/` - Esquema de base de datos SQL con tablas de organizaciones, sucursales y triggers.
- `/docs/` - Guías de diseño, arquitectura, seguridad y requisitos funcionales.

## Comandos

Ejecuta los siguientes comandos exactos para el desarrollo y verificación del proyecto:

```bash
# Iniciar el servidor de desarrollo en el puerto 3000 (disponible en 0.0.0.0)
npm run dev

# Compilar la aplicación y verificar tipos TypeScript
npm run build

# Ejecutar el validador de sintaxis y código (ESLint)
npm run lint

# Ejecutar pruebas unitarias
npm run test
```

## Convenciones

### Estilo y estructura de código
- **Idioma**: El código fuente, variables, nombres de funciones y rutas deben estar escritos en **inglés** (utilizando `camelCase`). Los textos de la interfaz de usuario, etiquetas, mensajes de error y comentarios explicativos deben estar estrictamente en **español**.
- **Componentes**: React funcionales con tipado estricto en TypeScript. Props explícitas y desestructuradas.
- **Estética visual**: Seguir la guía de `/docs/design-system/DESIGN_SYSTEM.md`. Canvas de color gris frío muy claro, tarjetas blancas con bordes de `1px solid var(--border)`, radios de borde redondos (`var(--radius-lg)` de 16px) y acento violeta (`var(--brand-500)`). No introducir clases CSS huérfanas o estilos en línea sin justificación.
- **Referencia de diseño**: El archivo de referencia para layouts modulares es `/src/pages/Dashboard.tsx` y el menú de navegación es `/src/components/ui/Sidebar.tsx`.

## Reglas de dominio / trampas conocidas

- **Bimonetariedad estricta**: Frenyer opera simultáneamente en USD y VES. Toda operación financiera, flujo de caja o cuenta bancaria debe calcular y registrar el tipo de cambio de referencia vigente en el momento de la transacción para mantener un historial de auditoría consistente.
- **Seguridad RLS (Row Level Security)**: Las consultas a la base de datos deben realizarse siempre filtrando bajo el contexto del inquilino (organización y sucursal activa). Nunca expongas datos globales sin validación de membresía previa.
- **Sin SQL arbitrario para Alma**: El copiloto inteligente Alma interactúa con bases de datos mediante herramientas estrictas y funciones autorizadas expuestas en el servidor. Nunca debes permitir la ejecución o concatenación de SQL directo desde el cliente.
- **Redondeo monetario**: Aplica siempre redondeo a dos decimales exactos en cálculos matemáticos de importes, impuestos (IVA, IGTF) y márgenes para evitar descuadres de centavos en balances consolidados.

## Forma de trabajar

- **Planificación previa**: Antes de escribir o modificar código, define mentalmente el impacto en las rutas y en el sistema de diseño.
- **Tamaño de los cambios**: Realiza modificaciones incrementales enfocadas en un solo módulo a la vez. No mezcles refactorizaciones visuales amplias con cambios en la lógica de datos.
- **Resumen final**: Al concluir tus tareas, proporciona un reporte claro de los archivos creados/modificados, el estado de la compilación y los flujos de negocio garantizados. No utilices jerga técnica interna de la IA.
## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones
tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su
porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de
dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Límites

- ✅ **Siempre**:
  - Asegura que la aplicación sea 100% responsiva (móviles, tablets y pantallas de escritorio).
  - actualizar `MEMORY.md` al terminar cada tarea.
  - Mantén sincronizada la metadata del sistema (`metadata.json` e `index.html`).
  - Ejecuta `npm run dev` en el puerto `3000` con host `0.0.0.0` para que el preview del entorno sea accesible.
- ⚠ **Pregunta antes**:
  - Instalar nuevas dependencias en `package.json`.
  - Crear nuevas migraciones en Supabase que alteren tablas estructurales core.
  - Modificar el flujo de autorización de usuarios (perfiles/membresías).
- 🚫 **Nunca**:
  - Rompas o bypasses las políticas de RLS en PostgreSQL.
  - Expongas secretos, contraseñas de servicio o API keys en el código de cliente.
  - Reemplaces de forma abrupta el Design System unificado por librerías visuales ajenas sin previo acuerdo con el equipo de diseño.

## Verificación

Antes de dar un cambio por finalizado, asegúrate de:
1. Ejecutar `compile_applet` localmente y comprobar que no hay errores de sintaxis o de compilación TypeScript.
2. Ejecutar `lint_applet` y asegurar la salida limpia de ESLint.
3. Probar de manera interactiva que los acordeones del menú lateral (`Sidebar`) se comportan de manera responsiva y despliegan correctamente cada una de las subrutas asignadas.
