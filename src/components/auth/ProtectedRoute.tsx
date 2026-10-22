import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sparkles } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-card">
          <div className="auth-logo-icon">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="auth-title" style={{ fontSize: 18, marginBottom: 4 }}>Frenyer ERP</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-500)', display: 'inline-block' }} />
              <span>Verificando credenciales de acceso...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const internalRoles = [
    'gerente',
    'administrador',
    'admin',
    'cajero',
    'ventas',
    'inventario',
    'almacenista',
    'contador',
    'superadmin',
    'soporte',
    'director',
    'propietario',
    'asociado',
    'personal'
  ];

  // Verificar si hay sesión activa en contexto o en almacenamiento local
  let hasActiveUser = Boolean(user);
  let effectiveRole = (role || user?.user_metadata?.role || '').toLowerCase();

  try {
    const storedUser = localStorage.getItem('frenyer_active_user');
    let parsedStoredRole = '';
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      if (parsed?.email || parsed?.id) {
        hasActiveUser = true;
      }
      if (parsed?.role) {
        parsedStoredRole = String(parsed.role).toLowerCase();
      }
    }

    const storedRole = (localStorage.getItem('frenyer_user_role') || '').toLowerCase();

    // Prioridad: si el rol en contexto ya es un rol interno, prevalece siempre sobre un valor residual en localStorage
    if (!internalRoles.includes(effectiveRole)) {
      if (internalRoles.includes(parsedStoredRole)) {
        effectiveRole = parsedStoredRole;
      } else if (internalRoles.includes(storedRole)) {
        effectiveRole = storedRole;
      } else if (storedRole) {
        effectiveRole = storedRole;
      }
    }
  } catch {
    // Continuar con los datos de memoria
  }

  if (!hasActiveUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isInternal = internalRoles.includes(effectiveRole);

  if (!isInternal) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isAllowed = allowedRoles.some((r) => r.toLowerCase() === effectiveRole);
    if (!isAllowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
