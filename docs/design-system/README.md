# Design System — Frenyer

> **Fuente de verdad visual:** Modern Minimal SaaS.
> La implementación debe respetar los tokens, componentes, patrones, responsive y accesibilidad
> definidos para Frenyer.
>
> Implementación real: `src/styles/tokens.css` (21 variables) y `src/styles/globals.css`
> (1 440 líneas de clases semánticas).

---

## Documentos

| Documento | Contenido |
|---|---|
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tokens, base, layout, tipografía, responsive, accesibilidad |
| [COMPONENTS_AND_PATTERNS.md](COMPONENTS_AND_PATTERNS.md) | Catálogo de componentes, patrones y clases disponibles |
| [IMPLEMENTATION_PROMPT.md](IMPLEMENTATION_PROMPT.md) | Instrucciones de implementación para nuevas pantallas |

---

## Fundamentos

Canvas gris frío muy claro, superficies blancas, violeta como acento, bordes de 1 px, radios de
8–16 px, sombras discretas, sans serif moderna y espaciado en múltiplos de 4 px. Usa tokens
semánticos y estados completos.

---

## Advertencia importante

> ⚠ **No hay Tailwind en este proyecto.** No existe `tailwind.config.*` ni `postcss.config.*`, y
> `tailwindcss` no está en `package.json`.
>
> Todo el diseño se hace con **clases semánticas** definidas en `src/styles/globals.css`.
> Escribir `className="flex items-center gap-2 text-sm"` produce un elemento **sin estilo**.
>
> Hay seis archivos que ya usan utilidades de Tailwind por error
> (`AuthCallback.tsx`, `SaleDetailModal.tsx`, `ProtectedRoute.tsx`, `LoginPage.tsx`,
> `Suppliers.tsx`, `SalesKPIs.tsx`, `SalesTransactionsTable.tsx`). Esos son **errores**,
> no precedentes. Ver [KNOWN_ISSUES P-17](../operations/KNOWN_ISSUES.md#p-17).

---

## Tokens

Todos los colores, radios y sombras se consumen como variables CSS, nunca como valores hex
sueltos.

```css
/* src/styles/tokens.css */
:root {
  --brand-50:  #f4f1ff;
  --brand-100: #e9e2ff;
  --brand-500: #8b78e8;
  --brand-600: #7562d5;
  --brand-700: #5d4bb8;

  --canvas:    #f5f6fa;
  --surface:   #fff;
  --sidebar:   #f8f8fb;

  --text:      #171923;
  --muted:     #6b7280;
  --border:    #e8eaf0;

  --success:   #28a879;
  --warning:   #e5a52b;
  --danger:    #e36f6f;
  --info:      #48bbd0;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;

  --shadow-card: 0 2px 8px rgba(28,32,48,.04);
}
```

`globals.css` lo importa en la línea 1: `@import './tokens.css';`

> ⚠ **No hay tokens de espaciado, tipografía ni z-index.** El espaciado está en píxeles
> dentro de cada clase y los tamaños de fuente se fijan por clase. Si necesitas espaciado
> consistente, **añade tokens** antes de seguir extendiendo valores sueltos.

---

## Reglas de implementación

1. **Responsive obligatorio.** Toda pantalla debe funcionar en móvil (360 px), tablet (768 px) y
   escritorio (1440 px). El shell usa un grid de 2 columnas a partir de 640 px.
2. **Accesibilidad.** Etiquetas asociadas a sus campos, `aria-label` en botones de solo icono,
   foco visible, contraste AA sobre `--surface`.
3. **Sin excepciones visuales.** Si una pantalla necesita un estilo que no existe, **añade la
   clase al Design System** en vez de usar estilos en línea.
4. **Estados completos.** Cada acción tiene estado de carga, vacío, error y éxito.
5. **Acciones críticas reales.** Los botones principales deben persistir en el backend, no
   simular.
6. **Tokens siempre.** `var(--brand-500)`, `var(--radius-lg)`, `var(--border)`… nunca `#8b78e8`.

---

## Referencias

- Layout de referencia: `src/pages/Dashboard.tsx`
- Navegación de referencia: `src/components/ui/Sidebar.tsx`
- Shell de referencia: `src/layouts/DashboardLayout.tsx`
