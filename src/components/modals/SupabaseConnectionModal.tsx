import { useState, useEffect } from 'react';
import { Database, CheckCircle, AlertCircle, RefreshCw, Copy, Check, ExternalLink, X, Shield, Key } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { updateSupabaseClient, isSupabaseConfigured, SUPABASE_URL } from '../../lib/supabase/client';

interface SupabaseConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function SupabaseConnectionModal({ isOpen, onClose, onConnected }: SupabaseConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<'conexion' | 'migraciones'>('conexion');
  const [url, setUrl] = useState(() => {
    if (SUPABASE_URL && !SUPABASE_URL.includes('your-project')) {
      return SUPABASE_URL;
    }
    return typeof window !== 'undefined' ? (localStorage.getItem('frenyer_supabase_url') || '') : '';
  });
  const [anonKey, setAnonKey] = useState(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('frenyer_supabase_anon_key') || '') : '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    configured: boolean;
    connected: boolean;
    url?: string;
    error?: string | null;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [migrationSql, setMigrationSql] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoadingSql, setIsLoadingSql] = useState(false);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/supabase/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
        if (data.url && !data.url.includes('your-project') && !url) {
          setUrl(data.url);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setFeedback(null);
    }
  }, [isOpen]);

  const loadMigrationSql = async () => {
    if (migrationSql) return;
    setIsLoadingSql(true);
    try {
      const res = await fetch('/api/supabase/migrations-bundle');
      if (res.ok) {
        const text = await res.text();
        setMigrationSql(text);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSql(false);
    }
  };

  const handleCopySql = () => {
    if (!migrationSql) return;
    navigator.clipboard.writeText(migrationSql);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();

    if (!cleanUrl || !cleanUrl.startsWith('https://')) {
      setFeedback({ type: 'error', message: 'Ingresa una URL válida de Supabase que empiece con https://' });
      return;
    }
    if (!cleanKey || cleanKey.length < 20) {
      setFeedback({ type: 'error', message: 'Ingresa una clave anónima (anon key) válida de Supabase.' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/supabase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, anonKey: cleanKey })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo conectar con Supabase.');
      }

      // Update browser client
      updateSupabaseClient(cleanUrl, cleanKey);
      await checkStatus();

      setFeedback({
        type: 'success',
        message: '¡Conexión exitosa! La base de datos Supabase ha sido conectada y sincronizada.'
      });

      if (onConnected) {
        onConnected();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al conectar con Supabase. Verifica tu URL y clave.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnectedNow = (serverStatus?.connected || isSupabaseConfigured) && !feedback?.type?.includes('error');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 2500,
        display: 'grid',
        placeItems: 'center',
        padding: 16
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafbfc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: isConnectedNow ? '#ecfdf5' : '#f5f3ff',
                color: isConnectedNow ? '#059669' : '#7c3aed',
                display: 'grid',
                placeItems: 'center',
                border: `1px solid ${isConnectedNow ? '#a7f3d0' : '#ddd6fe'}`
              }}
            >
              <Database size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                Conexión con Supabase
              </h2>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Base de datos PostgreSQL en tiempo real con seguridad RLS
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#fff' }}>
          <button
            onClick={() => setActiveTab('conexion')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'conexion' ? '2px solid var(--brand-500)' : '2px solid transparent',
              background: 'transparent',
              fontWeight: activeTab === 'conexion' ? 700 : 500,
              color: activeTab === 'conexion' ? 'var(--brand-700)' : '#64748b',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Configuración y Credenciales
          </button>
          <button
            onClick={() => {
              setActiveTab('migraciones');
              loadMigrationSql();
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'migraciones' ? '2px solid var(--brand-500)' : '2px solid transparent',
              background: 'transparent',
              fontWeight: activeTab === 'migraciones' ? 700 : 500,
              color: activeTab === 'migraciones' ? 'var(--brand-700)' : '#64748b',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Esquema SQL de Migraciones
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {activeTab === 'conexion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Status Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  background: isConnectedNow ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${isConnectedNow ? '#bbf7d0' : '#fde68a'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isConnectedNow ? (
                    <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                  ) : (
                    <AlertCircle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isConnectedNow ? '#15803d' : '#b45309' }}>
                      {isConnectedNow ? 'Base de datos conectada activamente' : 'Conexión a Supabase pendiente'}
                    </div>
                    <div style={{ fontSize: 11, color: isConnectedNow ? '#166534' : '#92400e', marginTop: 2 }}>
                      {isConnectedNow
                        ? `Conectado a ${serverStatus?.url || SUPABASE_URL}`
                        : 'Ingresa las credenciales de tu proyecto para acceder a tus tablas y guardar información.'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={checkStatus}
                  title="Comprobar conexión"
                  style={{
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <RefreshCw size={12} /> Comprobar
                </button>
              </div>

              {feedback && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: feedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: feedback.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${feedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  {feedback.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {feedback.message}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Project URL (URL del proyecto Supabase) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://xyzcompany.supabase.co"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      style={{ height: 40, fontSize: 13 }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Se encuentra en Supabase Dashboard → Project Settings → API → Project URL.
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Project API Anon Key (Clave pública anónima) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      value={anonKey}
                      onChange={(e) => setAnonKey(e.target.value)}
                      required
                      style={{ height: 40, fontSize: 13, fontFamily: 'monospace' }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Clave pública para el cliente (`anon` / `public`). No introduzcas `service_role`.
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    style={{ height: 40, fontSize: 13 }}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading}
                    style={{
                      height: 40,
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {isLoading ? <RefreshCw size={15} className="animate-spin" /> : <Key size={15} />}
                    {isLoading ? 'Conectando...' : 'Probar y Conectar Base de Datos'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'migraciones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                  Inicializar tablas en Supabase
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                  Si tu proyecto de Supabase es nuevo, copia este script SQL unificado y pégalo en{' '}
                  <b>SQL Editor</b> en tu consola de Supabase. Creará las tablas de Organizaciones, Clientes, Inventarios, Ventas Flash, Cuentas Bancarias, Cotizaciones y sus políticas RLS bimonetarias.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  Script SQL unificado (0001 - 0012)
                </span>
                <Button
                  onClick={handleCopySql}
                  disabled={!migrationSql || isLoadingSql}
                  variant="secondary"
                  style={{ height: 32, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isCopied ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                  {isCopied ? '¡Copiado!' : 'Copiar todo el SQL'}
                </Button>
              </div>

              <div
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  maxHeight: 280,
                  overflowY: 'auto',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {isLoadingSql ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                    Cargando esquema de migraciones...
                  </div>
                ) : migrationSql ? (
                  migrationSql.slice(0, 3000) + (migrationSql.length > 3000 ? '\n\n-- ... [Haz clic en "Copiar todo el SQL" para obtener el script completo]' : '')
                ) : (
                  'No se pudo cargar el script de migraciones.'
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
