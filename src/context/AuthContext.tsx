import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  permissions?: string[];
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: string;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper para generar iniciales
  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'US';
  };

  // Cargar perfil extendido desde /api/users o metadata de Supabase
  const resolveProfile = async (currentUser: User | null): Promise<UserProfile | null> => {
    if (!currentUser) return null;

    const email = currentUser.email || '';
    const metadataName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name;
    const metadataRole = currentUser.user_metadata?.role || 'cliente';

    let resolvedName = metadataName || email.split('@')[0] || 'Usuario';
    let resolvedRole = metadataRole;
    let resolvedPermissions: string[] = ['compras'];

    // Intentar consultar `/api/users` para obtener roles del ERP si existen
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const matched = json.data.find(
            (u: any) => u.email && u.email.toLowerCase() === email.toLowerCase()
          );
          if (matched) {
            resolvedName = matched.name || resolvedName;
            resolvedRole = matched.role || resolvedRole;
            resolvedPermissions = matched.permissions || ['ventas', 'inventario', 'finanzas'];
          }
        }
      }
    } catch {
      // Fallback a metadata si el servidor no responde
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

    // Sincronizar en localStorage para compatibilidad con componentes existentes
    if (typeof window !== 'undefined') {
      localStorage.setItem('frenyer_active_user', JSON.stringify(newProfile));
      localStorage.setItem('frenyer_user_role', resolvedRole);
      localStorage.setItem('frenyer_user_permissions', JSON.stringify(resolvedPermissions));
      window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: newProfile }));
    }

    return newProfile;
  };

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Obtener sesión inicial
    const bootstrapSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        const p = await resolveProfile(initialSession.user);
        if (isMounted) {
          setProfile(p);
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };

    // Suscripción a cambios de autenticación
    const subscribeToAuthChanges = () => {
      subscription?.unsubscribe();
      const { data } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          const p = await resolveProfile(newSession.user);
          if (isMounted) setProfile(p);
        } else {
          setProfile(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('frenyer_active_user');
            localStorage.removeItem('frenyer_user_role');
            localStorage.removeItem('frenyer_user_permissions');
          }
        }
        setIsLoading(false);
      });
      subscription = data.subscription;
    };

    void bootstrapSession();
    subscribeToAuthChanges();

    // Al reconectar Supabase desde el modal, el cliente se recrea: hay que
    // releer la sesión y volver a suscribirse al nuevo cliente.
    const handleSupabaseReconfigured = () => {
      void bootstrapSession();
      subscribeToAuthChanges();
    };
    window.addEventListener('frenyer:supabase-configured', handleSupabaseReconfigured);

    return () => {
      isMounted = false;
      window.removeEventListener('frenyer:supabase-configured', handleSupabaseReconfigured);
      subscription?.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (!res.error && res.data.user) {
      const p = await resolveProfile(res.data.user);
      setProfile(p);
    }
    return { error: res.error };
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    const res = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'cliente'
        }
      }
    });
    return { error: res.error };
  };

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const res = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    return { error: res.error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignorar si la sesión ya expiró
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('frenyer_active_user');
        localStorage.removeItem('frenyer_user_role');
        localStorage.removeItem('frenyer_user_permissions');
        window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: null }));
      }
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
