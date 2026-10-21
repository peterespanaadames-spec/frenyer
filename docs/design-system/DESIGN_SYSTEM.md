# Design System — Fundamentos

> Tokens, base, layout, tipografía, responsive y accesibilidad.
> Implementación: `src/styles/tokens.css` y `src/styles/globals.css`.

---

## 1. Principios

1. **Claridad sobre decoración.** La densidad de información manda; el color no compite con los
   datos.
2. **Una sola fuente de verdad visual:** los tokens. Ningún hex suelto en el CSS de una pantalla.
3. **Jerarquía por contraste, no por tamaño.** `--text` para lo principal, `--muted` para lo
   secundario, `--border` para separar.
4. **Consistencia de estados.** Un mismo concepto se ve igual en todos los módulos: `.card`
   siempre es una tarjeta, `.badge` siempre es una etiqueta.
5. **Densidad de herramienta profesional.** El ERP se usa horas seguidas: compactación antes que
   Marketing.

---

## 2. Tokens

### 2.1 Marca (acento violeta)

| Token | Valor | Uso |
|---|---|---|
| `--brand-50` | `#f4f1ff` | Fondo sutil de marcas/realces |
| `--brand-100` | `#e9e2ff` | Fondo de hover en superficies de marca |
| `--brand-500` | `#8b78e8` | **Acento principal.** Botón primario, iconos activos, foco |
| `--brand-600` | `#7562d5` | Hover del botón primario |
| `--brand-700` | `#5d4bb8` | Texto de marca con contraste suficiente sobre `--surface` |

### 2.2 Superficies

| Token | Valor | Uso |
|---|---|---|
| `--canvas` | `#f5f6fa` | Fondo de la aplicación (gris frío muy claro) |
| `--surface` | `#fff` | Tarjetas, modales, tablas, menús |
| `--sidebar` | `#f8f8fb` | Fondo de la barra lateral |

### 2.3 Texto y bordes

| Token | Valor | Uso |
|---|---|---|
| `--text` | `#171923` | Texto principal |
| `--muted` | `#6b7280` | Texto secundario, etiquetas, placeholders |
| `--border` | `#e8eaf0` | Bordes de 1 px de tarjetas, tablas, campos |

### 2.4 Estados

| Token | Valor | Uso |
|---|---|---|
| `--success` | `#28a879` | Confirmado, pagado, en stock |
| `--warning` | `#e5a52b` | Pendiente, por vencer, stock bajo |
| `--danger` | `#e36f6f` | Error, anulado, deuda vencida |
| `--info` | `#48bbd0` | Informativo, en proceso |

### 2.5 Radios y sombras

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `8px` | Botones, campos, badges |
| `--radius-md` | `12px` | Elementos intermedios |
| `--radius-lg` | `16px` | **Tarjetas**, modales, paneles grandes |
| `--shadow-card` | `0 2px 8px rgba(28,32,48,.04)` | Elevación discreta de tarjetas |

> ⚠ **No hay tokens de espaciado, tipografía ni z-index.** Si un módulo nuevo necesita
> espaciado consistente, propón añadir `--space-1` … `--space-8` al `tokens.css` en vez de
> seguir con valores sueltos.

---

## 3. Layout del shell

```
┌──────────┬────────────────────────────────────────────┐
│          │  .topbar  (sticky, 68 px, translúcido)    │
│ .sidebar ├────────────────────────────────────────────┤
│ 224 px   │                                            │
│ sticky   │  .content                                  │
│          │  padding: 28px                             │
│          │  max-width: 1500px                        │
│          │  margin: auto                              │
│          │                                            │
│          │                              .alma-fab     │
└──────────┴────────────────────────────────────────────┘
```

| Clase | Propiedades | Referencia |
|---|---|---|
| `.app` | `min-height: 100vh` | `globals.css:2` |
| `.shell` | `display: grid; grid-template-columns: 224px 1fr` | `globals.css:2` |
| `.main` | `min-width: 0` (evita desbordes con tablas) | `globals.css:2` |
| `.content` | `padding: 28px; max-width: 1500px; margin: auto` | `globals.css:2` |
| `.topbar` | `position: sticky; top: 0; height: 68px; backdrop-filter: blur(...)` | `globals.css:2` |
| `.topbar-title` | Nombre del negocio | `globals.css:2` |
| `.page-head` / `h1` / `p` | Bloque de título de página | `globals.css:2` |
| `.actions` | Fila de acciones de la página (`display: flex`) | `globals.css:2` |

### 3.1 Grid de contenido

| Clase | Columnas | Uso |
|---|---|---|
| `.grid` | Rejilla base con `gap` | Contenedor |
| `.grid-1` | 1 | Una columna |
| `.grid-2` | 2 | Dos tarjetas |
| `.grid-3` | 3 | Tres tarjetas |
| `.grid-4` | 4 | Fila de KPIs (4 tarjetas) |

> En móvil, todas las rejillas colapsan a una columna.

---

## 4. Tipografía

**Familia:** sans serif moderna del sistema.

**Escala** (tamaños fijados por clase, no por token):

| Contexto | Clase | Tamaño | Peso |
|---|---|---|---|
| Título de página | `.page-head h1` | ~24 px | 700 |
| Título de sección | `.section-head h3` | ~15 px | 600 |
| Etiqueta / caption | `.kpi-label`, `.small` | 11–12 px | 500–600, con `letter-spacing` en mayúsculas |
| Valor de KPI | `.kpi-value` | ~26 px | 700 |
| Texto de cuerpo | por defecto | 13–14 px | 400 |
| Texto secundario | `.muted` | 13 px | 400, color `--muted` |
| Botón | `.btn` | 13 px | 500 |

### 4.1 Formato de importes

| Tipo | Función | Separador de miles | Decimales | Prefijo |
|---|---|---|---|---|
| Dólares | `formatUSD(amount)` | `en-US` → `1,234.56` | 2 | `USD ` |
| Bolívares | `formatVES(amount)` | `es-VE` → `1.234,56` | 2 | `Bs. ` |

**Regla:** el prefijo va **dentro** de la función, no en la plantilla. `formatVES(1234.5)` →
`"Bs. 1.234,50"`.

---

## 5. Superficies

### 5.1 Tarjeta

```html
<section class="card">
  <div class="section-head"><h3>Ventas de la semana</h3></div>
  …
</section>
```

| Propiedad | Valor |
|---|---|
| Fondo | `var(--surface)` |
| Borde | `1px solid var(--border)` |
| Radio | `var(--radius-lg)` (16 px) |
| Sombra | `var(--shadow-card)` |
| Relleno | 18–20 px |

> ⚠ **No existen** `.card-head`, `.card-body` ni `.card-title`. Las tarjetas se componen con
> `.section-head` (+ `h3`) y, si hace falta, un `div` con relleno explícito.

### 5.2 Botones

| Clase | Aspecto | Uso |
|---|---|---|
| `.btn` | Base: 40 px de alto, radio 9 px, borde 1 px, fuente 13 px | Todos |
| `.btn.primary` | Relleno violeta (`--brand-500` → `--brand-600` en hover) | Acción principal de la pantalla |
| `.btn.ghost` | Transparente, solo borde | Acción secundaria o terciaria |

> ⚠ **No existe `.btn.secondary`**, aunque el componente `Button` tenga
> `variant='secondary'` como valor por defecto. El resultado es que los botones "secondary"
> salen con el aspecto base (`.btn` sin relleno), no con un aspecto de botón secundario.
> Hay que elegir conscientemente entre `primary` y `ghost`.

> ⚠ **`.select` no tiene regla.** Los `<select>` nativos salen sin estilo. Usa `.input` sobre
> el `select` si quieres la misma caja.

### 5.3 Campos de formulario

| Clase | Uso |
|---|---|
| `.input` | Base de todos los campos de texto |
| `.field` | Contenedor de un campo (etiqueta + control) |
| `.field.full` | Campo a ancho completo dentro de un `.form-grid` |
| `.form-grid` | Rejilla de formulario |
| `.search` | Campo de búsqueda con icono a la izquierda (el `> svg` es absoluto; el input lleva `padding-left: 36px`) |

### 5.4 Tablas

| Clase | Uso |
|---|---|
| `.table` | Base de la tabla |
| `.table th` | Cabecera |
| `.table td` | Celda |

Combinada con `.table-scroll` cuando el ancho de columnas no cabe.

### 5.5 Badges

```html
<span class="badge success">Pagado</span>
```

| Variante | Significado |
|---|---|
| `.badge.brand` | Neutral/acento (por defecto) |
| `.badge.success` | Confirmado, pagado |
| `.badge.warning` | Pendiente, por vencer |
| `.badge.danger` | Error, anulado, vencido |

### 5.6 KPI

```html
<article class="card">
  <span class="kpi-label">Ventas (7 días)</span>
  <strong class="kpi-value">$ 12.480,00</strong>
</article>
```

| Clase | Uso |
|---|---|
| `.kpi-label` | Etiqueta en mayúsculas, 11 px, `--muted` |
| `.kpi-value` | Valor grande, 26 px, peso 700 |
| `.positive` / `.negative` | Variación (verde / rojo) |

> ℹ️ Existe un componente `Kpi` (`src/components/data-display/Kpi.tsx`) con props
> `{ label, value, change }`, pero **no tiene importadores**. El panel construye las tarjetas a
> mano. Ver [KNOWN_ISSUES P-21](../operations/KNOWN_ISSUES.md#p-21).

### 5.7 Estados vacíos y avisos

| Clase | Uso |
|---|---|
| `.empty` | Contenedor del estado vacío (usado con `<EmptyState>`) |
| `.notice` | Aviso informativo |
| `.muted` | Texto secundario |
| `.spaced` | `margin-top: 14px` |
| `.small` | 12 px |
| `.relative` | `position: relative` |

### 5.8 Barra lateral

| Clase | Uso |
|---|---|
| `.sidebar` | Contenedor; `position: sticky`, `overflow: auto`, scrollbar propia |
| `.brand` / `.brand span` | Logotipo; la `y` del nombre en violeta |
| `.sidebar-nav` | Contenedor de la navegación |
| `.nav-section` | Etiqueta de sección en mayúsculas, 11 px |
| `.sidebar-parent` | Botón de sección (con `ChevronDown` en `.sidebar-chevron`) |
| `.sidebar-parent.active` | La sección tiene una ruta activa |
| `.sidebar-chevron` | Icono de acordeón; `.open` lo rota 180° |
| `.sidebar-children-container` | Contenedor de los hijos |
| `.sidebar-child` | Enlace hijo; `.active` lo resalta |
| `.active-config` / `.config-link` | Enlace de Configuración |
| `.mobile-menu` | Botón de menú (visible ≤ 640 px) |
| `.mobile-sidebar-backdrop` | Velo oscuro del cajón móvil |

### 5.9 Botón flotante de Alma

| Clase | Propiedades |
|---|---|
| `.alma-fab` | Círculo de 56 px, `position: fixed`, abajo/derecha 24 px, `z-index: 99`, fondo `--brand-500`. `:hover` → `translateY(-2px)` |

### 5.10 Chat de Alma (preparado, sin uso)

`.alma-chat`, `.alma-title`, `.bubble`, `.assistant`, `.hint`, `.chat-input`, `.suggestion`.

> La página de Alma es un stub; este CSS está listo para cuando se implemente el chat.

---

## 6. Familia de tienda (heredada, sin uso)

`globals.css:551-1093` define ~40 clases `.store-*` (`.store-header-wrap`, `.store-catalog-grid`,
`.store-product-card`, `.cart-drawer*`, `.kanban-board`…).

> ⚠ **No se usan.** `ShopPage.tsx` define su propio CSS con espacio de nombres `cr-*` en un
> bloque `<style>` en línea (`:847-1830`). El CSS `.store-*` es residuo de una versión anterior.
> Ver [KNOWN_ISSUES P-21](../operations/KNOWN_ISSUES.md#p-21).

---

## 7. Familia de autenticación — dos generaciones en conflicto ⚠

| | Familia "panel" | Familia "card" |
|---|---|---|
| Ubicación | `globals.css:159-405` | `globals.css:1095-1440` |
| Usada por | `LoginPage.tsx` | `ProtectedRoute.tsx`, `AuthCallback.tsx` |
| Input | `.auth-input-wrap` | `.auth-input` + `.auth-input-icon` |
| Altura | 42 px | 48 px |
| Estructura | grid | flex |

**Clases duplicadas** (la segunda definición gana): `.auth-page`, `.auth-form`, `.auth-field`,
`.auth-subtitle`, `.auth-footer`.

`LoginPage` **mezcla ambas**: usa `.auth-input-wrap` (panel) y `.auth-input-icon` (card) en los
mismos campos (`LoginPage.tsx:230, 246, 310, 326, 341, 369`).

> Hay que **unificar** la familia antes de seguir construyendo pantallas de autenticación.
> Ver [KNOWN_ISSUES P-19](../operations/KNOWN_ISSUES.md#p-19).

### 7.1 Clases de la familia "panel"

`.auth-page`, `.auth-panel`, `.auth-brand`, `.auth-brand-mark`, `.auth-brand-period`,
`.auth-subtitle`, `.auth-form`, `.auth-field`, `.auth-input-wrap` (+ `input`, `::placeholder`,
`:disabled`, `:focus-within`), `.auth-password-toggle`, `.auth-text-button`, `.auth-forgot`,
`.auth-captcha`, `.auth-captcha-note`, `.auth-submit` (+ `:hover:not(:disabled)`, `:disabled`),
`.auth-message` (`.error`, `.success`), `.auth-switch`, `.auth-back`, `.auth-signout`,
`.auth-status`, `.auth-footer`.

### 7.2 Clases de la familia "card"

`.auth-back-link`, `.auth-container`, `.auth-header`, `.auth-logo-icon`, `.auth-title`,
`.auth-subtitle`, `.auth-card`, `.auth-social-btn` (+ `:hover`, `:disabled`), `.auth-divider`,
`.auth-field` (+ `label`), `.auth-input-wrapper`, `.auth-input-icon`, `.auth-input`
(+ `.has-toggle`, `:focus`), `.auth-toggle-visibility`, `.auth-submit-btn`, `.auth-alert-error`,
`.auth-alert-success`, `.auth-db-banner`, `.auth-db-banner-copy`, `.auth-db-btn`, `.auth-footer`,
`.auth-footer-btn`, `.auth-loading-screen`, `.auth-loading-card`.

---

## 8. Configuración

| Clase | Uso |
|---|---|
| `.config-tabs` | Contenedor de las pestañas de Configuración |
| `.config-tab-btn` | Botón de pestaña; `.active` la seleccionada |
| `.rate-display-card` | Tarjeta oscura con degradado violeta para la tasa BCV |
| `.rate-badge` | Etiqueta de estado de la tasa; `.active` la vigente |
| `.switch-container` / `.switch-track` / `.switch-thumb` | Interruptor; `.active` el encendido |
| `.associated-user-card` | Tarjeta de usuario asociado |
| `.upload-slot` | Zona de carga de imagen |
| `.preview-box` | Vista previa; `> img` la imagen |

---

## 9. Responsive

| Punto de corte | Qué cambia |
|---|---|
| **≤ 640 px** | `.mobile-menu` se muestra (`.mobile-menu { display: flex }`). `.sidebar.mobile-open` pasa a cajón fijo: `position: fixed; width: min(280px, 85vw); height: 100dvh; z-index: 31`. `.mobile-sidebar-backdrop` se muestra a `z-index: 30` con `rgba(15,23,42,.35)` |
| **> 640 px** | Sidebar fijo de 224 px en el grid. Sin cajón ni velo |

Reglas adicionales:

- Toda tabla ancha va dentro de un contenedor con `overflow-x: auto`.
- Toda rejilla `.grid-2/3/4` colapsa a una columna en móvil.
- `.content` mantiene `max-width: 1500px` para que el contenido no se estire en pantallas
  grandes.
- `height: 100dvh` (no `100vh`) en el cajón móvil, para respetar las barras del navegador en
  Android.

---

## 10. Accesibilidad

| Regla | Aplicación |
|---|---|
| Etiqueta asociada | Cada campo tiene `<label>` o `aria-label` |
| Botón de solo icono | Requiere `aria-label` (ej. el toggle de contraseña, el chevron del acordeón) |
| Foco visible | No eliminar el `outline` sin sustituirlo por un `:focus-visible` equivalente |
| Contraste | Texto principal `--text` sobre `--surface`; texto secundario `--muted` solo para información no crítica |
| No solo color | Los estados se comunican con etiqueta de texto además del color del badge |
| Objetivos táctiles | Mínimo 40 px de alto en controles (la base de `.btn` ya lo cumple) |
| Títulos | Un solo `h1` por pantalla (`.page-head h1`) |
| Listas | Usar `<ul>`/`<ol>` con `role="list"` cuando el estilo quita los marcadores |

---

## 11. Anti-patrones

| ❌ No hacer | ✅ Hacer |
|---|---|
| `className="flex items-center gap-2"` | Usar las clases semánticas existentes o **añadir** una al Design System |
| `style={{ color: '#8b78e8' }}` | `var(--brand-500)` |
| `className="animate-spin"` | Añadir el `@keyframes spin` al CSS (hoy no existe) |
| Crear un `card-head`/`card-body` ad hoc | Componer con `.section-head` |
| Introducir un color nuevo como hex | Añadir un token a `tokens.css` |
| Romper el layout en móvil | Aplicar las reglas del punto de corte de 640 px |
| Un modal sin estado de carga | Estados completos: carga, vacío, error y éxito |

---

## 12. Referencias de código

| Elemento | Archivo |
|---|---|
| Tokens | `src/styles/tokens.css` |
| Clases globales | `src/styles/globals.css` |
| Shell del ERP | `src/layouts/DashboardLayout.tsx` |
| Navegación | `src/components/ui/Sidebar.tsx` |
| Layout de referencia | `src/pages/Dashboard.tsx` |
| Botones y tarjetas | `src/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx` |
