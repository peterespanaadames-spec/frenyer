# Plan de Implementación: Carrito estilo Amazon, Autenticación de Clientes y Gestión de Usuarios Internos

## 1. Resumen de Objetivos
- **Experiencia de Tienda Estilo Amazon**:
  - Autenticación de clientes (Registro e Inicio de Sesión por correo y contraseña).
  - Bloqueo en el proceso de compra (`Checkout` / Finalizar Pedido): exige inicio de sesión o registro automático antes de procesar el pedido.
  - Perfil de cliente: Historial de compras ("Mis Pedidos"), Lista de Deseos guardada en Supabase y gestión de direcciones.
- **Separación Estricta Clientes vs Usuarios Internos**:
  - Los clientes de la tienda online (`shop_customers`) están completamente separados de los usuarios internos del ERP (`users` / `user_profiles` con roles RBAC).
- **Gestión Avanzada de Usuarios Internos**:
  - Módulo administrativo de usuarios asociados con opción de agregar, editar, asignar y cambiar contraseñas sincronizadas con Supabase y control de permisos por roles.

## 2. Cambios en Base de Datos (Supabase Migrations)
- Crear tabla `shop_customers` (id, email, password_hash, full_name, phone, address, created_at).
- Crear tabla `customer_wishlist` (id, customer_id, product_id, created_at).
- Crear tabla `customer_orders` (id, customer_id, items jsonb, total_usd, total_ves, status, shipping_address, created_at).
- Asegurar políticas RLS y tablas de usuarios internos con soporte de actualización de contraseña y perfiles.

## 3. Cambios en la Interfaz y Lógica
- **`ShopPage.tsx`**:
  - Modal de autenticación de clientes (Login / Registro).
  - Panel de Mi Cuenta para el cliente (Mis pedidos anteriores, Lista de deseos sincronizada con Supabase).
  - Interrupción del flujo de pago si el cliente no ha iniciado sesión, solicitando registro o acceso al instante.
- **Módulo de Usuarios Internos (ERP)**:
  - Vista de gestión de asociados/usuarios internos con modal de creación y edición (incluyendo campo seguro para contraseña y asignación de rol).

## 4. Pruebas y Validación
- Compilación TypeScript (`compile_applet`).
- Verificación ESLint (`lint_applet`).
- Pruebas de flujo de compra y autenticación de clientes sin interferir con el acceso administrativo.
