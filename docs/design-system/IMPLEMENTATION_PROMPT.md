# Prompt de implementación — Frenyer

> Instrucciones para construir nuevas pantallas y módulos siguiendo el Design System.
> Este documento es la referencia rápida; el detalle está en
> [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) y [COMPONENTS_AND_PATTERNS.md](COMPONENTS_AND_PATTERNS.md).

---

## Reglas no negociables

1. **Reutiliza tokens y componentes.** Ningún hex suelto, ninguna clase inventada, ninguna
   duplicación de un componente que ya existe en `src/components/ui/`.
2. **Toda pantalla debe ser responsive y accesible.**
3. **No crees excepciones visuales sin justificación.** Si un patrón no existe, **añádelo al
   Design System** y documéntalo.
4. **Las acciones críticas deben funcionar realmente y persistir en el backend** cuando
   corresponda. Ningún botón de ejemplo.

---

## 1. Antes de escribir código

| Pregunta | Por qué importa |
|---|---|
| ¿Existe ya un componente que haga esto? | `src/components/ui/` tiene `Button`, `Card`, `Badge`, `EmptyState` |
| ¿Existe ya una clase CSS para esto? | `globals.css` tiene ~150 clases semánticas |
| ¿De dónde vienen los datos? | **Siempre `/api/*`**, nunca el cliente Supabase del navegador |
| ¿Qué endpoint necesito? | [API.md](../architecture/API.md) tiene las 87 rutas |
| ¿Es una entidad nueva en la base de datos? | [DATABASE.md](../architecture/DATABASE.md) — y **preguntar antes** de alterar tablas core |
| ¿A qué ruta va? | `src/app/router/index.tsx` **y** `src/components/ui/Sidebar.tsx` (si no, queda inalcanzable) |

---

## 2. Estructura de una pantalla

```tsx
// src/modules/<dominio>/pages/<Pagina>.tsx
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatUSD, formatVES } from '@/lib/currency';

export default function MiPagina() {
  const [rows, setRows] = useState<MiFila[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/mi-recurso', { credentials: 'include' });
        const json = await res.json();
        if (!cancelled) setRows(json.success ? json.data : []);
      } catch {
        if (!cancelled) setError('No se pudo cargar la información');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <div className="muted">Cargando…</div>;
  if (error) return <div className="auth-message error">{error}</div>;
  if (rows.length === 0) {
    return <EmptyState title="Sin registros" description="Aún no hay información para mostrar." />;
  }

  return (
    <>
      <div className="page-head">
        <h1>Mi módulo</h1>
        <p>Descripción breve del propósito de la pantalla.</p>
      </div>
      <div className="actions">…</div>
      <div className="grid grid-4">…</div>
      <Card>…</Card>
    </>
  );
}
```

**Convenciones del proyecto** (de `AGENTS.md`):

- Identificadores, variables, funciones y rutas en **inglés** (`camelCase`).
- Textos de interfaz, etiquetas y mensajes en **español**.
- Tipado estricto en TypeScript; props explícitas y desestructuradas.
- React funcional.

---

## 3. Reglas de datos

| Regla | Detalle |
|---|---|
| **Siempre `/api/*`** | `fetch(url, { credentials: 'include' })`. El cliente Supabase del navegador está **inerte** |
| **Lee `success`** | Varias rutas responden `{ success: false }` con **HTTP 200** |
| **Sesión** | `credentials: 'include'` en toda llamada; el token viaja en la cookie httpOnly |
| **Importes** | `formatUSD` / `formatVES` de `src/lib/currency.ts`. Nunca `toFixed` suelto |
| **Tasa** | `getActiveExchangeRate()` para conversiones en cliente |
| **Contexto de organización** | El servidor lo resuelve; el cliente no lo envía a mano |
| **Cancelación** | `cancelled` en el `useEffect` para evitar(setState) tras desmontar |

---

## 4. Reglas de UI

### 4.1 Clases

| Necesito | Uso |
|---|---|
| Contenedor de página | `<div className="content">` (ya lo pone `DashboardLayout`) |
| Título de página | `<div className="page-head"><h1>…</h1><p>…</p></div>` |
| Fila de acciones | `<div className="actions">…</div>` |
| Tarjeta | `<Card>` o `<section className="card">` |
| Título dentro de una tarjeta | `<div className="section-head"><h3>…</h3></div>` |
| Botón | `<Button variant="primary" \| "ghost">` |
| Etiqueta de estado | `<Badge tone="brand" \| "success" \| "warning" \| "danger">` |
| Estado vacío | `<EmptyState title="…" description="…" />` |
| Rejilla | `<div className="grid grid-2">` |
| Campo | `<label className="field"><span>…</span><input className="input" /></label>` |
| Formulario | `<form className="form-grid">` |
| Barra de herramientas | `<div className="toolbar">` |
| Búsqueda | `<div className="search"><Search/><input className="input"/></div>` |
| Tabla | `<div className="table-scroll"><table className="table">` |
| KPI | `<article className="card"><span className="kpi-label">…</span><strong className="kpi-value">…</strong></article>` |
| Texto secundario | `<span className="muted">` |
| Aviso | `<div className="notice">` |

### 4.2 Prohibido

- Utilidades de Tailwind (`flex`, `items-center`, `gap-2`, `text-sm`, `animate-spin`…) — **no
  están instaladas**.
- Valores hex fuera de `tokens.css`.
- Estilos en línea para algo que debería ser una clase.
- `key={index}` en listas.
- `any` sin justificación.

---

## 5. Responsive

| Punto de corte | Regla |
|---|---|
| ≤ 640 px | Rejillas a 1 columna; sidebar en cajón; tablas con scroll horizontal; formularios a 1 columna; botones con `flex-wrap` |
| > 640 px | Rejillas de 2/3/4 columnas; sidebar fijo de 224 px |

**Checklist responsive de una pantalla nueva:**

- [ ] Se ve bien a 360 px de ancho.
- [ ] Las tablas anchas no desbordan (contenedor con `overflow-x: auto`).
- [ ] Los modales no superan el ancho de la pantalla.
- [ ] Los botones de acción se envuelven en varias filas si no caben.
- [ ] Ningún texto se corta sin opción de ampliar.

---

## 6. Accesibilidad

- Cada campo con `<label>` (o `aria-label`).
- Botones de solo icono con `aria-label`.
- Foco visible; no eliminar el `outline` sin sustituto.
- Contraste AA: `--text` sobre `--surface`; `--muted` solo para información secundaria.
- Los estados se comunican con **texto**, no solo con color.
- `role="dialog"` + `aria-modal="true"` en los modales.
- Cierre con `Escape` en los modales.
- Un solo `h1` por pantalla.

---

## 7. Estados obligatorios

Toda vista de datos debe cubrir:

| Estado | Implementación |
|---|---|
| **Cargando** | Texto "Cargando…" o esqueleto; botones deshabilitados durante el envío |
| **Vacío** | `<EmptyState>` con un mensaje que explique **qué hacer a continuación** |
| **Error** | Mensaje legible + opción de reintentar; nunca una excepción cruda |
| **Éxito** | Confirmación breve tras guardar; refrescar los datos afectados |
| **Envío en curso** | Botón `disabled` + texto de estado ("Guardando…") |

---

## 8. Reglas de negocio que no se deben romper

| Regla | Dónde |
|---|---|
| **Bimonetario estricto**: todo importe guarda USD, VES y la tasa aplicada | [BUSINESS_RULES §1](../architecture/BUSINESS_RULES.md#1-principio-bimonetario) |
| **Redondeo a 2 decimales** en importes; 4 en tasas | [BUSINESS_RULES §2](../architecture/BUSINESS_RULES.md#2-redondeo-monetario) |
| **Instantánea de tasa** en el momento de la transacción | [BUSINESS_RULES §1.2](../architecture/BUSINESS_RULES.md#12-instantánea-de-tasa) |
| **El stock nunca queda negativo** | [BUSINESS_RULES §6.3](../architecture/BUSINESS_RULES.md#63-reglas-de-stock) |
| **El navegador nunca recibe claves de Supabase** | [SECURITY §2](../architecture/SECURITY.md#2-capa-1--credenciales) |
| **Todo bajo el contexto de la organización** | [SECURITY §5](../architecture/SECURITY.md#5-capa-4--aislamiento-en-base-de-datos) |
| **Alma no ejecuta SQL arbitrario** | [BUSINESS_RULES §12](../architecture/BUSINESS_RULES.md#12-alma--herramientas-autorizadas) |

---

## 9. Checklist de entrega

1. [ ] `npm run build` sin errores de TypeScript.
2. [ ] `npm run lint` sin errores.
3. [ ] Todos los colores vienen de `tokens.css`.
4. [ ] Ninguna utilidad de Tailwind.
5. [ ] Estados de carga, vacío, error y éxito cubiertos.
6. [ ] Responsive a 360 / 768 / 1440 px.
7. [ ] Accesibilidad: etiquetas, foco, contraste, `role` en los modales.
8. [ ] Los datos vienen de `/api/*` y se leen con `success`.
9. [ ] Los importes se formatean con `formatUSD` / `formatVES`.
10. [ ] La ruta está en el router **y** en el sidebar.
11. [ ] Si se tocó la base de datos, hay una migración **nueva y aditiva**.
12. [ ] La documentación del módulo está actualizada.
13. [ ] `MEMORY.md` refleja el estado actual.

---

## 10. Recursos

| Documento | Contenido |
|---|---|
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tokens, layout, clases, responsive, accesibilidad |
| [COMPONENTS_AND_PATTERNS.md](COMPONENTS_AND_PATTERNS.md) | Catálogo de componentes y patrones de código |
| [API.md](../architecture/API.md) | Referencia de los endpoints |
| [DATABASE.md](../architecture/DATABASE.md) | Esquema, RLS, funciones |
| [BUSINESS_RULES.md](../architecture/BUSINESS_RULES.md) | Bimonetariedad, tasas, estados |
| [KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md) | Defectos a no reintroducir |
