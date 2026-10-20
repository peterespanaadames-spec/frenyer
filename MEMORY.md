# MEMORY.md — FRENYER

## Estado actual
- **Base del Sistema**: Frenyer ERP bimonetario (React 19, Vite, Express, TypeScript, Supabase PostgreSQL). Proyecto Supabase: `knyqrwpaksawuxoqcayu`.
- **Servidor Activo**: Express + Vite funcionando en `http://localhost:3000` (`0.0.0.0`).
- **Autenticación con Supabase Auth (MVP Completo)**:
  - **Contexto Global (`AuthContext.tsx`)**: Integración con Supabase Auth (`signInWithEmail`, `signUpWithEmail`, `signInWithGoogle`, `signOut`), sesión persistente y mapeo de perfiles/roles.
  - **Guardián de Rutas (`ProtectedRoute.tsx`)**: Protección de rutas privadas del ERP (`/dashboard`, `/ventas`, etc.), pantalla de carga institucional y redirección automática al `/login` guardando el historial.
  - **Páginas de Login y Registro (`LoginPage.tsx`)**: Rutas `/login` y `/registro` estilizadas con el Design System de Frenyer (`tokens.css` y `globals.css`). Botón oficial de Google OAuth, alternador de visibilidad de contraseñas y cambio dinámico entre inicio de sesión y registro.
  - **Retorno OAuth (`AuthCallback.tsx`)**: Manejo de intercambio de tokens en `/auth/callback`.
  - **Enrutamiento (`router/index.tsx`)**: Separación clara entre Landing/Tienda pública (`/`), páginas de autenticación y panel administrativo privado.
- **Configuración de Supabase (parcial)**: la URL real ya está cableada en `client.ts` y `server.ts` (`DEFAULT_SUPABASE_URL`), y `.env.local` existe con la URL pre-sembrada. **Falta pegar la clave anon/publishable** (`VITE_SUPABASE_ANON_KEY`): el botón "Conectar Base de Datos Supabase" del login la guarda sola en `.env.local`.

## Decisiones técnicas recientes
- **Estilos Vanilla / Design System**: `LoginPage.tsx` y `ProtectedRoute.tsx` migrados a clases semánticas `.auth-*` en `globals.css` alineadas con `tokens.css` (canvas gris frío, acento violeta `var(--brand-500)`, tarjetas redondeadas `var(--radius-lg)`), descartando utilidades Tailwind no configuradas.
- **Dependencias de empaquetado**: Resuelta la instalación de binarios nativos para Windows x64 (`esbuild`, `@rolldown/binding-win32-x64-msvc`) y librerías auxiliares (`redux`, `reselect`, `react-redux`).
- **Reconexión en caliente de Supabase**: `AuthContext` escucha el evento `frenyer:supabase-configured` para releer la sesión y resuscribirse al cliente recreado; sin esto, el login seguía usando el cliente con la URL placeholder.

## Errores a evitar
- No usar clases Tailwind sin verificar su presencia en la configuración global; el proyecto utiliza CSS vainilla estructurado.
- Siempre manejar el fallback de importes monetarios bimonetarios redondeados a dos decimales.
- **Nunca reintroducir `https://your-project.supabase.co`**: rompe el OAuth de Google (redirige a un host inexistente) y el status de `/api/supabase/status`. La URL real es `https://knyqrwpaksawuxoqcayu.supabase.co`.
- `AuthScreen.tsx` es un componente huérfano (no está en el router). La pantalla real de login es `LoginPage.tsx`: cualquier función de conexión con Supabase debe montarse ahí.
- `tsx server.ts` no recarga en caliente: tras cambiar `.env.local` hay que reiniciar el proceso de dev.

