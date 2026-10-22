import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { refreshSupabaseStatus } from '../lib/supabase/client';

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  permissions?: string[];
  avatarUrl?: string;
}

/**
 * Usuario autenticado. La credencial de Supabase vive en el servidor: el
 * navegador solo conoce la cookie de sesion y los datos publicos del perfil.
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    role?: string;
    avatar_url?: string;
  };
}

export interface AuthSession {
  user: AuthUser;
  mode?: 'supabase' | 'local';
}

export interface AuthErrorLike {
  message: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  profile: UserProfile | null;
  role: string;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthErrorLike | null }>;
  signUpWithEmail: (email: string, password: string, fullName: string, role?: string) => Promise<{ error: AuthErrorLike | null }>;
  signInWithAccessKey: (accessKey: string, email?: string) => Promise<{ error: AuthErrorLike | null }>;
  signInWithGoogle: () => Promise<{ error: AuthErrorLike | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'US';
}

function clearLocalIdentity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('frenyer_active_user');
  localStorage.removeItem('frenyer_user_role');
  localStorage.removeItem('frenyer_user_permissions');
  window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: null }));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveProfile = useCallback(async (currentUser: AuthUser | null, sessionRole?: string): Promise<UserProfile | null> => {
    if (!currentUser) return null;

    const email = currentUser.email || '';
    const metadataName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name;
    const metadataRole = currentUser.user_metadata?.role || sessionRole || 'cliente';

    let resolvedName = metadataName || email.split('@')[0] || 'Usuario';
    let resolvedRole = metadataRole;
    let resolvedPermissions: string[] = ['compras'];

    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const matched = json.data.find((u: any) => u.email && u.email.toLowerCase() === email.toLowerCase());
          if (matched) {
            resolvedName = matched.name || resolvedName;
            resolvedRole = matched.role || resolvedRole;
            resolvedPermissions = matched.permissions || ['ventas', 'inventario', 'finanzas'];
          }
        }
      }
    } catch {
      // Sin datos del ERP se conserva el rol de la sesion.
    }

    const newProfile: UserProfile = {
      id: currentUser.id,
      name: resolvedName,
      email,
      role: resolvedRole,
      initials: getInitials(resolvedName),
      permissions: resolvedPermissions,
      avatarUrl: currentUser.user_metadata?.avatar_url
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('frenyer_active_user', JSON.stringify(newProfile));
      localStorage.setItem('frenyer_user_role', resolvedRole);
      localStorage.setItem('frenyer_user_permissions', JSON.stringify(resolvedPermissions));
      window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: newProfile }));
    }

    return newProfile;
  }, []);

  const applySession = useCallback(async (data: any) => {
    const currentUser: AuthUser = {
      id: data?.user?.id || data?.user?.email || 'usuario',
      email: data?.user?.email || '',
      name: data?.user?.name || undefined,
      user_metadata: {
        full_name: data?.user?.name || undefined,
        role: data?.role || undefined
      }
    };

    setUser(currentUser);
    setSession({ user: currentUser, mode: data?.mode });
    const p = await resolveProfile(currentUser, data?.role);
    setProfile(p);
  }, [resolveProfile]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      void refreshSupabaseStatus();
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json?.data) {
            await applySession(json.data);
            if (isMounted) setIsLoading(false);
            return;
          }
        }
      } catch {
        // Sin sesion: se continua en modo publico.
      }

      if (!isMounted) return;
      setUser(null);
      setSession(null);
      setProfile(null);
      setIsLoading(false);
    };

    void bootstrapSession();

    const handleAuthChanged = () => {
      void bootstrapSession();
    };
    window.addEventListener('frenyer:auth-changed', handleAuthChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('frenyer:auth-changed', handleAuthChanged);
    };
  }, [applySession]);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        return { error: { message: json?.error || 'No se pudo iniciar sesión.' } };
      }

      await applySession(json.data);
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed'));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message || 'Error de conexión con el servidor.' } };
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string, role?: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, fullName, role })
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        return { error: { message: json?.error || 'No se pudo completar el registro.' } };
      }

      if (json.requiresEmailConfirmation) {
        return { error: null };
      }

      const assignedRole = json.data?.role || role || 'cliente';
      await applySession({
        user: { email, name: fullName, id: json.data?.user?.id },
        role: assignedRole,
        organizationId: json.data?.organizationId
      });
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed'));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message || 'Error de conexión con el servidor.' } };
    }
  };

  const signInWithAccessKey = async (accessKey: string, email?: string) => {
    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accessKey, email })
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        return { error: { message: json?.error || 'Clave de acceso incorrecta.' } };
      }

      await applySession(json.data);
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed'));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message || 'Error de conexión con el servidor.' } };
    }
  };

  const signInWithGoogle = async () => {
    try {
      // El servidor gestiona el intercambio con Google: el navegador no ve tokens.
      window.location.href = '/api/auth/google';
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message || 'No se pudo iniciar sesión con Google.' } };
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignorar si el servidor no responde
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      clearLocalIdentity();
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed'));
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await resolveProfile(user);
      setProfile(p);
    }
  };

  const value = useMemo(() => ({
    user,
    session,
    profile,
    role: profile?.role || 'cliente',
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithAccessKey,
    signInWithGoogle,
    signOut,
    refreshProfile
  }), [user, session, profile, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
