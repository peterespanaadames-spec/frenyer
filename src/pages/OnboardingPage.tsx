import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch } from '../lib/supabase/api';
import { Building2, Banknote, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { activeOrganizationId, userOrganizations, setActiveOrganization, role } = useAuth();
  const [step, setStep] = useState<'welcome' | 'org' | 'branch' | 'rate' | 'done'>('welcome');
  const [loading, setLoading] = useState(false);
  const [branchName, setBranchName] = useState('Sucursal Principal');
  const [rate, setRate] = useState('');

  const activeOrg = userOrganizations.find((o) => o.isActive) || userOrganizations[0];

  useEffect(() => {
    if (userOrganizations.length === 0 && !loading) {
      navigate('/dashboard');
    }
  }, [userOrganizations.length, navigate, loading]);

  const handleOrgSelect = async (orgId: string) => {
    await setActiveOrganization(orgId);
    setStep('branch');
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      await authenticatedFetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName, organization_id: activeOrg?.id })
      });
      if (rate) {
        await authenticatedFetch('/api/bcv/rates/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rate: parseFloat(rate), valueDate: new Date().toISOString().split('T')[0] })
        });
      }
      setStep('done');
    } catch {
      setStep('done');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    navigate('/dashboard');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 40, maxWidth: 480, width: '90vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        {step === 'welcome' && (
          <>
            <div style={{ width: 48, height: 48, background: '#eef2ff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Building2 size={24} color="#4f46e5" />
            </div>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#111827' }}>¡Bienvenido a Frenyer!</h2>
            <p style={{ margin: '0 0 24px', color: '#475569', lineHeight: 1.5 }}>Configuremos tu organización para comenzar a operar.</p>
            <button onClick={() => setStep('org')} style={{ width: '100%', padding: '12px 16px', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Continuar <ArrowRight size={18} style={{ marginLeft: 8 }} /></button>
          </>
        )}
        {step === 'org' && userOrganizations.length > 0 && (
          <>
            <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#111827' }}>Selecciona tu organización</h2>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14 }}>Operarás bajo esta empresa.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {userOrganizations.map((org) => (
                <button key={org.id} onClick={() => handleOrgSelect(org.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: `1px solid ${org.id === activeOrganizationId ? '#4f46e5' : '#e2e8f0'}`, borderRadius: 10, background: org.id === activeOrganizationId ? '#eef2ff' : '#ffffff', color: '#111827', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600 }}>{org.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{org.role}</span>
                  {org.id === activeOrganizationId && <CheckCircle size={18} color="#4f46e5" />}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('welcome')} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', color: '#475569', fontSize: 13, cursor: 'pointer' }}>Atrás</button>
              <button onClick={() => setStep('branch')} disabled={loading} style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>Continuar</button>
            </div>
          </>
        )}
        {step === 'branch' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#111827' }}>Sucursal principal</h2>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14 }}>Define el nombre de tu primera sucursal.</p>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>Nombre de la sucursal</label>
              <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Sucursal Principal" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('org')} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', color: '#475569', fontSize: 13, cursor: 'pointer' }}>Atrás</button>
              <button onClick={() => setStep('rate')} disabled={loading} style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>Siguiente</button>
            </div>
          </>
        )}
        {step === 'rate' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#111827' }}>Tasa de cambio USD/VES</h2>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14 }}>Ingresa el tipo de cambio vigente.</p>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>1 USD = Bs.</label>
              <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} step="0.01" placeholder="Ej: 36.50" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('branch')} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', color: '#475569', fontSize: 13, cursor: 'pointer' }}>Atrás</button>
              <button onClick={handleNext} disabled={loading} style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? <Loader2 size={16} style={{ marginRight: 6 }} /> : ''}Finalizar</button>
            </div>
          </>
        )}
        {step === 'done' && (
          <>
            <div style={{ width: 48, height: 48, background: '#dcfce7', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <CheckCircle size={24} color="#16a34a" />
            </div>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#111827' }}>¡Todo listo!</h2>
            <p style={{ margin: '0 0 24px', color: '#475569', lineHeight: 1.5 }}>Tu organización está configurada.</p>
            <button onClick={handleFinish} style={{ width: '100%', padding: '12px 16px', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Ir al panel <ArrowRight size={18} style={{ marginLeft: 8 }} /></button>
          </>
        )}
      </div>
    </div>
  );
}