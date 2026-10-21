# Documentación — Frenyer ERP

> **Frenyer** es un ERP/POS bimonetario (USD + VES) para comercio, con control de ventas,
> inventarios, cuentas, finanzas y el asistente inteligente corporativo Alma.
> Monolito modular multi-tenant sobre React 19, Vite, Express 5, TypeScript y Supabase.
>
> Documentación verificada contra el código fuente en la **revisión de octubre 2026**.

---

## Empezar por aquí

| Si quieres… | Lee |
|---|---|
| Entender cómo funciona el sistema | [Arquitectura](architecture/OVERVIEW.md) |
| Levantar el proyecto | [Instalación y operación](operations/SETUP.md) |
| Saber qué está roto antes de tocar nada | [Problemas conocidos](operations/KNOWN_ISSUES.md) |
| Construir una pantalla nueva | [Prompt de implementación](design-system/IMPLEMENTATION_PROMPT.md) |
| Añadir un endpoint | [Referencia de API](architecture/API.md) |
| Cambiar la base de datos | [Base de datos](architecture/DATABASE.md) |
| Entender las reglas de dinero | [Reglas de negocio](architecture/BUSINESS_RULES.md) |

---

## 1. Arquitectura

| Documento | Contenido |
|---|---|
| [OVERVIEW.md](architecture/OVERVIEW.md) | Stack, capas, estructura del repositorio, servidor, cliente, navegación, modelo de datos |
| [API.md](architecture/API.md) | Las **87 rutas** del servidor: método, ruta, autenticación, descripción y respuesta |
| [SECURITY.md](architecture/SECURITY.md) | Credenciales, autenticación, cookies, rate limit, roles, RLS, auditoría, checklist de producción |
| [DATABASE.md](architecture/DATABASE.md) | Las **30 tablas**, funciones, triggers, políticas RLS, deriva de esquema |
| [BUSINESS_RULES.md](architecture/BUSINESS_RULES.md) | Bimonetariedad, redondeo, tipos de cambio, documentos, impuestos, inventario, tesorería, autorización |

## 2. Operación

| Documento | Contenido |
|---|---|
| [SETUP.md](operations/SETUP.md) | Requisitos, variables de entorno, migraciones, scripts, modos de operación, despliegue |
| [TROUBLESHOOTING.md](operations/TROUBLESHOOTING.md) | Diagnóstico por síntoma, con comandos concretos |
| [KNOWN_ISSUES.md](operations/KNOWN_ISSUES.md) | **30 defectos priorizados** con ubicación, síntoma y corrección |

## 3. Design System

| Documento | Contenido |
|---|---|
| [README.md](design-system/README.md) | Índice y reglas de oro |
| [DESIGN_SYSTEM.md](design-system/DESIGN_SYSTEM.md) | Tokens, layout, tipografía, clases, responsive, accesibilidad |
| [COMPONENTS_AND_PATTERNS.md](design-system/COMPONENTS_AND_PATTERNS.md) | Catálogo de componentes y patrones de código |
| [IMPLEMENTATION_PROMPT.md](design-system/IMPLEMENTATION_PROMPT.md) | Checklist para construir pantallas nuevas |

## 4. Producto

| Documento | Contenido |
|---|---|
| [REQUIREMENTS.md](product/REQUIREMENTS.md) | 19 requisitos funcionales + 10 no funcionales + pendientes de aprobación |
| [MODULES.md](product/MODULES.md) | Inventario de módulos, su alcance, su estado y sus dependencias |
| [ROADMAP.md](product/ROADMAP.md) | Madurez, iteraciones de trabajo, hitos y decisiones de arquitectura |

## 5. Módulos

| Documento | Módulo | Ruta principal |
|---|---|---|
| [dashboard.md](dashboard.md) | Panel de indicadores | `/dashboard` |
| [sales.md](sales.md) | Ventas, POS, pedidos, cotizaciones, reportes | `/ventas-flash/*` |
| [inventory.md](inventory.md) | Catálogo, compras internas, kárdex, reporte diario | `/inventarios/*` |
| [finance_accounts.md](finance_accounts.md) | Cuentas bancarias, CxC, CxP, reporte de cuentas | `/cuentas/*` |
| [finance_general.md](finance_general.md) | Gastos, salud del negocio, ganancias y pérdidas | `/gastos`, `/finanzas/*` |
| [contacts.md](contacts.md) | Clientes y proveedores | `/contactos/*` |
| [configuration.md](configuration.md) | Negocio, almacén, usuarios asociados, auditoría | `/configuracion` |
| [shop.md](shop.md) | Tienda online pública | `/` |
| [report_system_updates.md](report_system_updates.md) | Estándar de exportación de reportes | transversal |

---

## 6. Estado en números

| Métrica | Valor |
|---|---|
| Rutas del servidor | **87** (88 rutas concretas) |
| Rutas de la aplicación | **34** |
| Tablas en el esquema `public` | **30** |
| Archivos de migración | **22** (+ 1 huérfano en `workspace/`) |
| Módulos de dominio | **7** (+ Configuración y Panel) |
| Componentes UI compartidos | **5** (+ 4 modales) |
| Líneas de `server.ts` | **6 613** |
| Líneas de `src/lib/supabase/db.ts` | **3 922** |
| Línea más larga del cliente | `ShopPage.tsx`, 4 044 |
| Defectos registrados | **30** (4 bloqueantes, 10 altos, 14 medios, 3 bajos) |
| Cobertura de pruebas | **0** |

## 7. Los cuatro hallazgos críticos

> Antes de modificar nada, lee esto.

| # | Hallazgo | Detalle |
|---|---|---|
| 1 | **El arranque en producción falla** | `app.get('*')` es inválido en Express 5 → `PathError` y el proceso muere ([P-01](operations/KNOWN_ISSUES.md#p-01)) |
| 2 | **Las ventas no se persisten** | `db.ts` importa la constante `false` como `isSupabaseConfigured`, así que 10 módulos llaman a un cliente Supabase inerte ([P-02](operations/KNOWN_ISSUES.md#p-02)) |
| 3 | **13 de 30 tablas están abiertas a `anon`** | El lockdown de `0009` fue revertido a medias por migraciones posteriores ([P-04](operations/KNOWN_ISSUES.md#p-04)) |
| 4 | **6 endpoints públicos por error** | Creación de usuarios, toggle de estado, kárdex, ajustes de stock y dos endpoints de diagnóstico ([P-03](operations/KNOWN_ISSUES.md#p-03)) |

---

## 8. Convenciones del proyecto

摘自 `AGENTS.md` — resumen operativo:

- **Idioma**: identificadores, variables, funciones y rutas en **inglés** (camelCase). Textos de
  interfaz, etiquetas, mensajes y comentarios en **español**.
- **Estilos**: clases semánticas de `src/styles/globals.css` + tokens de `src/styles/tokens.css`.
  **No hay Tailwind en el proyecto.**
- **Datos**: siempre vía `/api/*`. El cliente Supabase del navegador es **inerte**.
- **Credenciales**: nunca con prefijo `VITE_`. La URL real es
  `https://knyqrwpaksawuxoqcayu.supabase.co`.
- **Roles**: `profiles.role` solo admite `gerente | administrador | cajero | cliente`. Traducir
  siempre con `toProfileRole()`.
- **Redondeo**: 2 decimales para importes, 4 para tasas.
- **Verificación**: `npm run build` y `npm run lint` antes de dar un cambio por terminado.

## 9. Comandos

```bash
npm install       # Instalar dependencias
npm run dev       # Servidor Express + Vite en 0.0.0.0:3000
npm run build     # Verificar tipos + generar dist/
npm run lint      # ESLint
npm run test      # Vitest
```

> ⚠ `npm run lint` siempre pasa (la configuración no define reglas) y `npm run test` no ejecuta
> nada (no hay archivos de prueba). Ver [P-10](operations/KNOWN_ISSUES.md#p-10).

---

## 10. Mantenimiento de esta documentación

| Al cambiar… | Actualiza… |
|---|---|
| Una ruta del servidor | [API.md](architecture/API.md) |
| Una tabla, función o política | [DATABASE.md](architecture/DATABASE.md) |
| Una regla de negocio | [BUSINESS_RULES.md](architecture/BUSINESS_RULES.md) |
| El modelo de autenticación | [SECURITY.md](architecture/SECURITY.md) |
| Un componente o clase CSS | [design-system/](design-system/README.md) |
| Un módulo | El documento del módulo + [MODULES.md](product/MODULES.md) |
| Un defecto | [KNOWN_ISSUES.md](operations/KNOWN_ISSUES.md) |
| El estado del proyecto | [MEMORY.md](../MEMORY.md) |
