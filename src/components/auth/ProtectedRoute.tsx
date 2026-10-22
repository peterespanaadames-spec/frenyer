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

  // Si no hay usuario autenticado, redirigir al login guardando la ruta de origen
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = (role || 'cliente').toLowerCase();
  const internalRoles = ['gerente', 'administrador', 'cajero', 'admin', 'ventas', 'inventario', 'almacenista', 'contador', 'superadmin', 'soporte'];
  const isInternal = internalRoles.includes(userRole);

  if (!isInternal) {
    return <Navigate to="/" replace />;
  }

  // Si se definen roles permitidos específicos y el usuario interno no lo cumple
  if (allowedRoles && allowedRoles.length > 0) {
    const isAllowed = allowedRoles.some((r) => r.toLowerCase() === userRole);
    if (!isAllowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
