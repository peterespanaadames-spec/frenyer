import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { refreshSupabaseStatus } from '../lib/supabase/client';
import { defaultPermissionsForRole } from '../lib/auth/roles';
import { setSessionHandle, withSessionInit } from '../lib/supabase/api';

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

interface AuthErrorLike {
  message: string;
}

export interface UserOrganization {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  profile: UserProfile | null;
  role: string;
  activeOrganizationId: string | null;
  userOrganizations: UserOrganization[];
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthErrorLike | null }>;
  signUpWithEmail: (email: string, password: string, fullName: string, role?: string) => Promise<{ error: AuthErrorLike | null }>;
  signInWithAccessKey: (accessKey: string, email?: string) => Promise<{ error: AuthErrorLike | null }>;
  signInWithGoogle: () => Promise<{ error: AuthErrorLike | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveOrganization: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'US';
}

function clearLocalIdentity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('frenyer_active_user');
  localStorage.removeItem('frenyer_user_role');
  localStorage.removeItem('frenyer_user_permissions');
  localStorage.removeItem('frenyer_org_id');
  window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: null }));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const authEpochRef = useRef(0);
  const isMountedRef = useRef(true);

  const apiPost = async (endpoint: string, body: object, errorMessage: string) => {
    const res = await fetch(
      endpoint,
      withSessionInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || errorMessage);
    return json;
  };

  const fetchUserOrganizations = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/auth/organizations', withSessionInit());
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setUserOrganizations(json.data);
        const active = json.data.find((o: UserOrganization) => o.isActive);
        setActiveOrganizationIdState(active ? active.id : (json.activeOrganizationId || null));
        if (typeof window !== 'undefined' && active) {
          localStorage.setItem('frenyer_org_id', active.id);
        }
      }
    } catch {
      // No bloquear el arranque si falla la carga de organizaciones.
    }
  }, [withSessionInit]);

  const resolveProfile = useCallback(async (
    currentUser: AuthUser | null,
    sessionRole?: string,
    serverProfile?: { name?: string; permissions?: string[] }
  ): Promise<UserProfile | null> => {
    if (!currentUser) return null;

    const email = currentUser.email || '';
    let resolvedName =
      serverProfile?.name ||
      currentUser.name ||
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      email.split('@')[0] ||
      'Usuario';
    let resolvedRole = currentUser.user_metadata?.role || sessionRole || 'cliente';
    let resolvedPermissions: string[] = Array.isArray(serverProfile?.permissions) && serverProfile.permissions.length > 0
      ? serverProfile.permissions
      : [];

    // Solo consultar /api/users si el servidor no envió permisos en la respuesta de sesión.
    if (resolvedPermissions.length === 0) {
      try {
        const res = await fetch('/api/users', withSessionInit());
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const matched = json.data.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
            if (matched) {
              resolvedName = matched.name || resolvedName;
              resolvedRole = matched.role || resolvedRole;
              resolvedPermissions = Array.isArray(matched.permissions) && matched.permissions.length > 0
                ? matched.permissions
                : defaultPermissionsForRole(resolvedRole);
            }
          }
        }
      } catch {
        // Sin datos del ERP se conserva el rol de la sesion.
      }
    }

    const newProfile: UserProfile = {
      id: currentUser.id,
      name: resolvedName,
      email,
      role: resolvedRole,
      initials: getInitials(resolvedName),
      permissions: resolvedPermissions.length > 0
        ? resolvedPermissions
        : defaultPermissionsForRole(resolvedRole),
      avatarUrl: currentUser.user_metadata?.avatar_url
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('frenyer_active_user', JSON.stringify(newProfile));
      localStorage.setItem('frenyer_user_role', resolvedRole);
      localStorage.setItem(
        'frenyer_user_permissions',
        JSON.stringify(newProfile.permissions)
      );
      window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: newProfile }));
    }

    return newProfile;
  }, []);

  const applySession = useCallback(async (data: any) => {
    authEpochRef.current += 1;
    const serverName = data?.user?.name || undefined;
    const currentUser: AuthUser = {
      id: data?.user?.id || data?.user?.email || 'usuario',
      email: data?.user?.email || '',
      name: serverName,
      user_metadata: {
        full_name: serverName,
        role: data?.role || undefined
      }
    };

    if (typeof window !== 'undefined' && data?.organizationId) {
      localStorage.setItem('frenyer_org_id', String(data.organizationId));
    }

    setUser(currentUser);
    setSession({ user: currentUser, mode: data?.mode });

    // Establecer organizacion activa desde la sesion del servidor
    const orgId = data?.activeOrganizationId || data?.organizationId || null;
    setActiveOrganizationIdState(orgId);
    if (typeof window !== 'undefined' && orgId) {
      localStorage.setItem('frenyer_org_id', orgId);
    }

    const p = await resolveProfile(currentUser, data?.role, {
      name: serverName,
      permissions: Array.isArray(data?.permissions) ? data.permissions : undefined
    });
    setProfile(p);

    // Cargar organizaciones del usuario para el selector
    void fetchUserOrganizations();
  }, [resolveProfile, fetchUserOrganizations]);

  const clearClientSession = useCallback(() => {
    authEpochRef.current += 1;
    setSessionHandle(null);
    setUser(null);
    setSession(null);
    setProfile(null);
    setActiveOrganizationIdState(null);
    setUserOrganizations([]);
    if (typeof window !== 'undefined' && localStorage.getItem('frenyer_active_user')) {
      clearLocalIdentity();
    }
  }, []);

  const bootstrapSessionCallback = useCallback(async () => {
    const epoch = ++authEpochRef.current;
    if (!isMountedRef.current) return;
    void refreshSupabaseStatus();
    try {
      const res = await fetch('/api/auth/session', withSessionInit());
      if (!isMountedRef.current || epoch !== authEpochRef.current) return;
      if (res.ok) {
        const json = await res.json();
        if (isMountedRef.current && epoch === authEpochRef.current && json?.data) {
          if (json.data.sessionId) {
            setSessionHandle(json.data.sessionId);
          }
          await applySession(json.data);
          if (isMountedRef.current) setIsLoading(false);
          return;
        }
      } else if (res.status === 401) {
        setSessionHandle(null);
      }
    } catch {
      // Sin sesion: se continua en modo publico.
    }

    if (!isMountedRef.current || epoch !== authEpochRef.current) return;

    // Sin sesion en servidor: limpiar identidad local residual.
    if (typeof window !== 'undefined' && localStorage.getItem('frenyer_active_user')) {
      clearLocalIdentity();
    }

    setUser(null);
    setSession(null);
    setProfile(null);
    setActiveOrganizationIdState(null);
    setUserOrganizations([]);
    setIsLoading(false);
  }, [applySession, clearLocalIdentity, withSessionInit]);

  useEffect(() => {
    isMountedRef.current = true;

    void bootstrapSessionCallback();

    const handleAuthChanged = (event: Event) => {
      const custom = event as CustomEvent<{ skipBootstrap?: boolean } | undefined>;
      if (custom?.detail?.skipBootstrap) return;
      void bootstrapSessionCallback();
    };
    const handleSessionInvalidated = () => {
      clearClientSession();
    };

    window.addEventListener('frenyer:auth-changed', handleAuthChanged);
    window.addEventListener('frenyer:session-invalidated', handleSessionInvalidated);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('frenyer:auth-changed', handleAuthChanged);
      window.removeEventListener('frenyer:session-invalidated', handleSessionInvalidated);
    };
  }, [bootstrapSessionCallback, clearClientSession]);

  // Verifica periodicamente y al recuperar foco si esta sesion fue cerrada
  // por un nuevo inicio de sesion en otro dispositivo o computador.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const epochAtStart = authEpochRef.current;

    const verifyActiveSession = async () => {
      if (!active || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      try {
        const res = await fetch(
          '/api/auth/session?heartbeat=1',
          withSessionInit({ headers: { 'X-Session-Check': 'heartbeat' } })
        );
        if (!active || epochAtStart !== authEpochRef.current) return;
        if (res.status === 401) {
          clearClientSession();
        }
      } catch {
        // Ignorar fallos transitorios de red.
      }
    };

    const intervalId = window.setInterval(() => {
      void verifyActiveSession();
    }, 20_000);

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void verifyActiveSession();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [user, clearClientSession]);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const json = await apiPost('/api/auth/login', { email, password }, 'No se pudo iniciar sesión.');
      setSessionHandle(json.data?.sessionId || null);
      await applySession(json.data);
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed', { detail: { skipBootstrap: true } }));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message } };
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string, role?: string) => {
    try {
      const json = await apiPost('/api/auth/register', { email, password, fullName, role }, 'No se pudo completar el registro.');
      if (json.requiresEmailConfirmation) return { error: null };

      setSessionHandle(json.data?.sessionId || null);
      await applySession({
        user: { email, name: fullName, id: json.data?.user?.id },
        role: json.data?.role || role || 'cliente',
        organizationId: json.data?.organizationId
      });
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed', { detail: { skipBootstrap: true } }));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message } };
    }
  };

  const signInWithAccessKey = async (accessKey: string, email?: string) => {
    try {
      const json = await apiPost('/api/auth/local-login', { accessKey, email }, 'Clave de acceso incorrecta.');
      setSessionHandle(json.data?.sessionId || null);
      await applySession(json.data);
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed', { detail: { skipBootstrap: true } }));
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message } };
    }
  };

  const signInWithGoogle = async () => {
    setSessionHandle(null);
    window.location.href = '/api/auth/google';
    return { error: null };
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', withSessionInit({ method: 'POST' }));
    } catch {
      // Ignorar si el servidor no responde
    } finally {
      clearClientSession();
      window.dispatchEvent(new CustomEvent('frenyer:auth-changed', { detail: { skipBootstrap: true } }));
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await resolveProfile(user);
      setProfile(p);
    }
  };

  const setActiveOrganization = useCallback(async (organizationId: string) => {
    try {
      const res = await fetch('/api/auth/organization/active', withSessionInit({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      }));
      if (!res.ok) throw new Error('No se pudo cambiar la organización');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error cambiando organización');

      // Actualizar estado local inmediatamente
      setActiveOrganizationIdState(organizationId);
      setUserOrganizations(prev => prev.map(org => ({ ...org, isActive: org.id === organizationId })));

      // Persistir en localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('frenyer_org_id', organizationId);
      }

      // Notificar a otros componentes
      window.dispatchEvent(new CustomEvent('frenyer:active-organization-changed', { detail: organizationId }));

      // Refrescar sesion para que el servidor use la nueva org en proximas peticiones
      await bootstrapSessionCallback();
    } catch (err: any) {
      throw new Error(err.message || 'No se pudo cambiar la organización activa.');
    }
  }, [bootstrapSessionCallback, withSessionInit]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    role: profile?.role || 'cliente',
    activeOrganizationId,
    userOrganizations,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithAccessKey,
    signInWithGoogle,
    signOut,
    refreshProfile,
    setActiveOrganization
  }), [user, session, profile, activeOrganizationId, userOrganizations, isLoading, bootstrapSessionCallback]);

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
