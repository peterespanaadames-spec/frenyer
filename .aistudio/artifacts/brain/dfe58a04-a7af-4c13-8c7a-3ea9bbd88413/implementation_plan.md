# Authentication, Roles, and Permissions System Implementation Plan

This plan outlines the implementation of a comprehensive authentication, RBAC (Role-Based Access Control), and permissions system for the Frenyer ERP/POS platform, supporting public customer e-commerce access and secure internal administrative roles.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Choices from Clarification**:
>   1. Public registration creates Customer accounts with storefront e-commerce access only (no admin access).
>   2. Authentication access barriers require secure login for admin panels while keeping the e-commerce catalog public.
>   3. Session persistence uses client state combined with authenticated local storage and secure backend verification.

---

## 1. Overview & Core Concept

- **What It Does**: Establishes a secure dual-tier authentication and authorization architecture:
  1. **Public E-Commerce Storefront**: Open catalog browsing for store visitors, public registration and login for customers, cart management, and order placement.
  2. **Internal Enterprise ERP/POS Panel**: Secure login portal for employees and administrators with strict role-based access control (SUPERADMIN, ADMIN, INVENTORY, SALES, CASHIER, ACCOUNTANT, SUPPORT) and granular permission enforcement across sales, inventory, finance, accounts receivable, and Alma.
- **Target Audience / Persona**: External retail customers (e-commerce buyers) and internal staff/administrators (ERP/POS operators).
- **Key Value**: Secure separation of concerns, preventing unauthorized access to financial and administrative operations while delivering a smooth shopping and operating experience.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Customer Flow*: Visit public storefront -> Browse catalog -> Register/Login -> Add to Cart -> Checkout & View Orders.
  2. *Employee Flow*: Navigate to Admin Login (`/login`) -> Enter credentials -> Access Dashboard with sidebar options restricted based on assigned role/permissions -> Perform authorized operations.
  3. *Unauthorized Access Guard*: If a customer or unauthenticated user tries to access `/dashboard` or admin routes, they are automatically redirected to `/login` or storefront.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Professional enterprise SaaS meets polished retail e-commerce (clean cold gray canvas, slate cards with subtle 1px borders, brand violet accent `#7C3AED` / `--brand-500`).
  - *Typography*: Clean sans-serif UI typography (`Plus Jakarta Sans`), tabular numerals for financial and inventory tables (`tabular-nums font-mono`).
  - *Design System*: Consistent with Frenyer Design System (`/docs/design-system/DESIGN_SYSTEM.md`), Tailwind CSS, and Lucide React icons.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Dual Authentication Portals (Customer vs. Internal)
  - *Chosen Approach*: Separate entry points and views for customer storefront vs. admin login, preventing customer confusion and securing sensitive administrative paths.
  - *Why*: Clear separation of roles and UX contexts.
- **Decision 2**: RBAC & Granular Permissions
  - *Chosen Approach*: Role-based permissions mapped on backend API endpoints and checked on frontend route guards and sidebar rendering.
  - *Why*: Ensures server-side security (defense-in-depth) even if client UI is manipulated.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Authentication Store                 │
│         (React Context + LocalStorage Persistence)     │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│  Public Storefront    │        │  Admin ERP / POS      │
│  (Catalog, Cart,      │        │  (Dashboard, Sales,   │
│   Customer Orders)    │        │   Inventory, Finance) │
└───────────────────────┘        └───────────────────────┘
            │                                │
            └───────────────┬────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│               Supabase Auth & Database                 │
│         (Profiles, Roles, Permissions, RLS)            │
└────────────────────────────────────────────────────────┘
```

- **Data Models & State**:
  - `auth_users` / `profiles`: Stores user ID, email, full name, role (`SUPERADMIN`, `ADMIN`, `INVENTORY`, `SALES`, `CASHIER`, `ACCOUNTANT`, `SUPPORT`, `CUSTOMER`), and organization/branch bindings.
  - `permissions`: Granular permission strings (`dashboard.view`, `products.create`, `pos.access`, etc.).
- **Implementation Steps**:
  1. Create Authentication Context and Provider (`AuthContext.tsx`) managing current user, login, logout, registration, and role checks.
  2. Build Login and Registration UI components conforming to the design system.
  3. Implement Route Guards (`ProtectedRoute.tsx`, `AdminRoute.tsx`, `CustomerRoute.tsx`) in React Router (`src/app/router/index.tsx`).
  4. Update Sidebar and Dashboard Navigation to dynamically filter modules and menu items based on the logged-in user's role and permissions.
  5. Add backend middleware / verification in `server.ts` for protected API routes.
