# Componentes y patrones — Frenyer

> Catálogo de los componentes reutilizables y de los patrones de UI que el proyecto ya
> resuelve. Referencia: `src/components/`, `src/styles/globals.css`.
>
> **Toda pantalla nueva debe reutilizar estos componentes.** Si necesitas algo que no existe,
> **añádelo a la librería compartida** en vez de duplicar el marcado en el módulo.

---

## 1. Librería compartida — `src/components/ui/`

### 1.1 `Button`

`src/components/ui/Button.tsx` (18 líneas)

```ts
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}
```

Extiende `ButtonHTMLAttributes<HTMLButtonElement>`. Genera `className = \`btn ${variant} ${className}\``.

| Variante | Clase resultante | Efecto |
|---|---|---|
| `primary` | `btn primary` | Relleno violeta |
| `secondary` *(por defecto)* | `btn secondary` | ⚠ **No hay regla `.btn.secondary`** ⇒ aspecto de `.btn` base |
| `ghost` | `btn ghost` | Transparente con borde |

> ⚠ El valor por defecto `secondary` no tiene estilo propio. Para un botón de acción
> secundaria visible usa `variant="ghost"`. Ver
> [KNOWN_ISSUES P-17](../operations/KNOWN_ISSUES.md#p-17).

**Uso.**

```tsx
<Button variant="primary" onClick={handleSave}>Guardar</Button>
<Button variant="ghost" onClick={onCancel}>Cancelar</Button>
<Button disabled={isSaving}>Guardando…</Button>
```

### 1.2 `Card`

`src/components/ui/Card.tsx`

```ts
interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}
```

Genera `<section className={\`card ${className}\`}>`.

**Uso.**

```tsx
<Card className="kpi-card">
  <span className="kpi-label">Ventas (7 días)</span>
  <strong className="kpi-value">{formatUSD(total)}</strong>
</Card>
```

### 1.3 `Badge`

`src/components/ui/Badge.tsx`

```ts
interface BadgeProps {
  children: React.ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
}
```

Genera `<span className={\`badge ${tone}\`}>` con `tone` por defecto `brand`.

**Uso.** `<Badge tone="success">PAGADO</Badge>`

### 1.4 `EmptyState`

`src/components/ui/EmptyState.tsx` (19 líneas)

```ts
interface EmptyStateProps {
  title: string;
  description: string;
}
```

Renderiza un `<Card className="empty">` con un icono `Database` de 28 px en `var(--muted)`.

**Uso.**

```tsx
<EmptyState
  title="Sin movimientos registrados"
  description="Los movimientos de caja aparecerán aquí cuando se registren en la base de datos."
/>
```

### 1.5 `Sidebar`

`src/components/ui/Sidebar.tsx` (317 líneas)

```ts
interface SidebarProps {
  isMobileOpen?: boolean;   // por defecto false
  onNavigate?: () => void;   // se invoca al navegar (cierra el cajón móvil)
}
```

Estructura de secciones, permisos y comportamiento del acordeón:
[DESIGN_SYSTEM.md §5.8](DESIGN_SYSTEM.md#58-barra-lateral).

### 1.6 `Kpi` — *sin uso*

`src/components/data-display/Kpi.tsx` (1 línea minificada).

```ts
interface KpiProps {
  label: string;
  value: string;
  change: string;
}
```

Renderiza un `<Card>` con `.kpi-label`, `.kpi-value` y `.positive`.

> ⚠ **No tiene importadores.** El panel construye las tarjetas a mano. O se adopta este
> componente o se elimina. Ver [KNOWN_ISSUES P-21](../operations/KNOWN_ISSUES.md#p-21).

---

## 2. Modales — `src/components/modals/`

### 2.1 `ManualBcvRateModal`

`src/components/modals/ManualBcvRateModal.tsx` (341 líneas)

```ts
interface ManualBcvRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRate: number;
  onRateUpdated: (newRate: number, isFuture: boolean, source: string) => void;
}
```

Al abrirse, lee el rol de `GET /api/auth/session` + `getActiveOrgId()`.
**Roles autorizados:** `admin`, `administrador`, `superadmin`, `gerente`, `gerente general`,
`manager`, `owner`. Los demás ven un mensaje de bloqueo.

Permite fijar una **tasa futura** con `valueDate` y `notes`.
Flujo: `POST /api/bcv/rates/manual` → persiste `frenyer_bcv_rate_date`,
`frenyer_bcv_rate_source='MANUAL'`, `frenyer_bcv_is_future` → `setActiveExchangeRate()` →
evento `frenyer:rate-changed` → `onRateUpdated`.

### 2.2 `NewPurchaseModal`

`src/components/modals/NewPurchaseModal.tsx` (1 657 líneas)

```ts
interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}
```

**Asistente de 4 pasos:**

| Paso | Contenido |
|---|---|
| 1 | Proveedor + factura (selector de proveedor, nº de factura, fecha, almacén, notas, opción de actualizar costos) |
| 2 | Catálogo + cesta de productos |
| 3 | Pago (CONTADO/CREDITO, cuenta bancaria, instrumento, referencia, días de crédito y vencimiento) |
| 4 | Resumen y confirmación |

Incluye dos submodales: **Nuevo Proveedor** y **Nuevo Producto** (ambos escriben en la base de
datos).

### 2.3 `SaleDetailModal`

`src/components/modals/SaleDetailModal.tsx` (548 líneas)

```ts
interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
}
```

Lee `sales` → `customers` → `sale_items` → `payments`. Cierra con `Escape` (`:61-74`).
Permite imprimir y navegar a la página de detalle completa.

> ⚠ **Estilado por completo con utilidades de Tailwind**, que no están instaladas ⇒ se renderiza
> sin estilo. Ver [KNOWN_ISSUES P-17](../operations/KNOWN_ISSUES.md#p-17).

### 2.4 `SupabaseConnectionModal`

`src/components/modals/SupabaseConnectionModal.tsx` (362 líneas)

```ts
interface SupabaseConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;   // declarado pero no usado
}
```

**Panel de solo lectura.** Dos pestañas:

- **Conexión** — estado de `refreshSupabaseStatus()`.
- **Migraciones** — descarga `GET /api/supabase/migrations-bundle` y permite copiarlo.

> Ya **no** pide ni muestra credenciales. El nombre histórico es engañoso. Ver
> [SECURITY.md §2](../architecture/SECURITY.md).

---

## 3. Formularios

### 3.1 Patrón estándar

```tsx
<form className="form-grid" onSubmit={handleSubmit}>
  <label className="field">
    <span>Nombre del cliente</span>
    <input className="input" value={name} onChange={e => setName(e.target.value)} required />
  </label>

  <label className="field full">
    <span>Dirección</span>
    <input className="input" value={address} onChange={e => setAddress(e.target.value)} />
  </label>

  <div className="actions">
    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
    <Button variant="primary" type="submit" disabled={isSaving}>Guardar</Button>
  </div>
</form>
```

| Clase | Rol |
|---|---|
| `.form-grid` | Rejilla del formulario |
| `.field` | Campo con etiqueta |
| `.field.full` | Campo a ancho completo |
| `.input` | Control de texto |
| `.actions` | Fila de botones al pie |

### 3.2 Búsqueda

```tsx
<div className="search">
  <Search size={16} />
  <input className="input" placeholder="Buscar cliente…" value={query} onChange={…} />
</div>
```

El icono es un hijo directo de `.search` (posicionado en absoluto) y el input lleva
`padding-left: 36px`.

### 3.3 Estados de un formulario

| Estado | Cómo se expresa |
|---|---|
| Inicial | `.input` normal |
| Error de campo | `aria-invalid="true"` + `.auth-message.error` o una clase de error del módulo |
| Error general | `.auth-message.error` con el mensaje |
| Éxito | `.auth-message.success` |
| Cargando | Botón `disabled` + icono de spinner (⚠ el spinner no gira hoy, ver P-18) |
| Sin resultados | `<EmptyState title="…" description="…" />` |

---

## 4. Tablas

### 4.1 Patrón estándar

```tsx
<div className="table-scroll">
  <table className="table">
    <thead>
      <tr>
        <th>Documento</th>
        <th>Cliente</th>
        <th>Total USD</th>
        <th>Total Bs.</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id}>
          <td>{row.doc_number}</td>
          <td>{row.customer_name}</td>
          <td>{formatUSD(row.total_usd)}</td>
          <td>{formatVES(row.total_ves)}</td>
          <td><Badge tone={toneFor(row.status)}>{row.status}</Badge></td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### 4.2 Fila pulsable

```tsx
<tr onClick={() => openDetail(row.id)} style={{ cursor: 'pointer' }}>
```

> La clase `.table-row-clickable` no existe; el cursor se aplica en línea. **Propuesta:**
> añadirla al Design System.

### 4.3 Toolbar

```tsx
<div className="toolbar">
  <div className="search">…</div>
  <select className="input">…</select>
  <Button variant="primary" onClick={onCreate}>Nuevo</Button>
</div>
```

`.toolbar` es una fila flexible con `gap: 10px`.

---

## 5. KPIs

```tsx
<article className="card">
  <span className="kpi-label">Ventas (7 días)</span>
  <strong className="kpi-value">USD 12.480,00</strong>
  <span className="positive">+8,4 %</span>
</article>
```

En una rejilla:

```tsx
<div className="grid grid-4">…</div>
```

> ⚠ La etiqueta debe reflejar **el filtro real**. El panel dice "Ventas (7 días)" pero suma
> **todas** las ventas (`Dashboard.tsx:294` y `:96,117-124`). Ver
> [KNOWN_ISSUES P-22](../operations/KNOWN_ISSUES.md#p-22).

---

## 6. Modales y diálogos

### 6.1 Patrón

```tsx
{isOpen && (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <header className="modal-head">
        <h3>Título</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
      </header>
      <div className="modal-body">…</div>
      <footer className="modal-foot">…</footer>
    </div>
  </div>
)}
```

> ⚠ `.modal-backdrop`, `.modal`, `.modal-head`, `.modal-body` y `.modal-foot` **no existen** en
> `globals.css`. Los modales actuales definen su propio marcado con estilos en línea o con las
> clases `.auth-*`. **Antes de crear un modal nuevo, añade la familia al Design System** en vez
> de inventar nombres nuevos.

### 6.2 Reglas

- Cerrar con `Escape` (patrón de `SaleDetailModal`).
- Cerrar con clic en el fondo, **sin** cerrar con clic dentro.
- `aria-modal="true"` y `role="dialog"`.
- Bloquear el scroll del fondo mientras está abierto.

---

## 7. Acordeón (sidebar)

```tsx
<button className="sidebar-parent" onClick={() => toggleExpand(label)}>
  <Package size={18} />
  <span className="sidebar-parent-label">Inventarios</span>
  <ChevronDown size={16} className={`sidebar-chevron ${expanded[label] ? 'open' : ''}`} />
</button>
<div className="sidebar-children-container">
  {children.map(child => (
    <NavLink to={child.to} className={({ isActive }) => `sidebar-child ${isActive ? 'active' : ''}`}>
      <child.icon size={16} />
      {child.label}
    </NavLink>
  ))}
</div>
```

**Reglas del acordeón:**

- La clave de `expanded` es la **etiqueta** de la sección.
- Pulsar el padre **alterna** abrir/cerrar (cerrar devuelve `{}`).
- Un efecto abre automáticamente la sección que contiene la ruta activa.
- El padre recibe `.active-parent` si algún hijo está activo.

> ⚠ El resaltado del hijo usa **igualdad exacta** de ruta. Para rutas con parámetros
> (`/ventas-flash/reporte/:id`) hay que usar `startsWith`. Ver
> [KNOWN_ISSUES P-15](../operations/KNOWN_ISSUES.md#p-15) y la nota del Sidebar.

---

## 8. Responsive

| Elemento | Regla |
|---|---|
| Rejillas | `.grid-2/3/4` → 1 columna en ≤ 640 px |
| Tablas | Contenedor con `overflow-x: auto` |
| Sidebar | Cajón fijo con `min(280px, 85vw)` y velo a `z-index: 30` |
| Formularios | `.form-grid` → 1 columna; los campos conservan `full` |
| Modales | Ancho máximo `min(560px, 92vw)` |
| Botones de fila | `flex-wrap: wrap` para no desbordar |

---

## 9. Exportación de reportes

### 9.1 Patrón unificado

Todos los exportes (Excel y PDF) siguen el mismo estándar:

- **Encabezado** gris oscuro (`#4b5563`) con texto **blanco**.
- **Datos** en celdas blancas o transparentes con texto oscuro.
- **Membrete dinámico** con los datos del negocio.

### 9.2 Utilidades

`src/lib/reportUtils.ts`:

| Función | Uso |
|---|---|
| `getReportHeaderHtml(title?, subtitle?)` | Banner gris con los datos del negocio |
| `getReportFooterHtml(additionalText?)` | Pie fiscal que sustituye cualquier mención a "Frenyer ERP" |
| `buildExcelHeaderRows(reportTitle)` | 5 filas de encabezado (nombre / RIF+tel+dir / título / fecha / vacía) |
| `createWorksheetWithBusinessHeader(reportTitle, dataRows, { isAOA? })` | Hoja XLSX con el membrete (origen `A6` para filas JSON) |
| `buildXlsHtmlReport({ title, tableHtml })` | Documento HTML compatible con Excel para export `.xls` |

### 9.3 Librerías

| Librería | Dónde se importa |
|---|---|
| `xlsx` | `reportUtils.ts` + `Inventory.tsx`, `Movements.tsx`, `DailyInventoryReport.tsx`, `Orders.tsx`, `SalesReport.tsx`, `AccountsReport.tsx`, `Customers.tsx`, `Suppliers.tsx` |
| `jspdf` + `html2canvas` | **Directamente** en `CompanyHealth.tsx` y `ProfitLoss.tsx` |

**Patrón PDF** (usado por `CompanyHealth` y `ProfitLoss`):

```ts
const canvas = await html2canvas(document.querySelector('.content') as HTMLElement);
const pdf = new jsPDF('p', 'mm', 'a4');
const imgData = canvas.toDataURL('image/png');
pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), canvas.height * pdf.internal.pageSize.getWidth() / canvas.width);
pdf.save('reporte.pdf');
```

> 💡 **Propuesta:** extra este patrón a `reportUtils.ts` como `exportPdf(element, filename)` para
> que no se duplique en cada módulo.

---

## 10. Gráficos

`recharts` es la librería. **Solo `CompanyHealth.tsx` la usa** actualmente:
`ComposedChart`, `Bar`, `Line`, `PieChart`, `Pie`, `Cell`.

> ℹ️ `src/modules/sales/components/SalesCharts.tsx` es un **stub sin importadores**. Si se
> implementa, debe seguir el patrón de `CompanyHealth`.

**Reglas para gráficos:**

- Usar `var(--brand-500)`, `var(--success)`, `var(--warning)`, `var(--danger)` como colores de
  serie.
- Sin gradients innecesarios: el Design System es minimalista.
- Fondo del gráfico: `var(--surface)`; rejilla y ejes en `var(--border)`.
- Etiquetas de ejes en `var(--muted)`.

---

## 11. Estados de carga, vacío, error y éxito

| Situación | Componente / clase |
|---|---|
| Cargando | Botón `disabled` + icono; o `<EmptyState>` no aplica aquí |
| Sin datos | `<EmptyState title="…" description="…" />` |
| Error | `.auth-message.error` (autenticación) o `.notice` con tono de error |
| Éxito | `.auth-message.success` |
| Aviso informativo | `.notice` |

---

## 12. Checklist para una pantalla nueva

1. ¿Reutilizo `Button`, `Card`, `Badge`, `EmptyState`? ¿Necesito uno nuevo? → añádelo a
   `src/components/ui/`.
2. ¿Todos los colores salen de `tokens.css`?
3. ¿Hay estados de carga, vacío, error y éxito?
4. ¿La acción principal **persiste en el backend**?
5. ¿Los importes se formatean con `formatUSD` / `formatVES`?
6. ¿Es responsive a 360 px? ¿Las tablas tienen contenedor con scroll?
7. ¿Los estados de los datos dependen del **rol** y de los **permisos**?
8. ¿Los textos de la interfaz están en **español** y los identificadores en **inglés**?
9. ¿Evité las utilidades de Tailwind? (No existen en este proyecto.)
10. ¿Los estados vacíos usan `EmptyState` en vez de un div con texto suelto?
