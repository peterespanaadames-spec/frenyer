import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, RefreshCcw, FileDown, Heart } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { supabase } from '../../../lib/supabase/client';

// Helper para calcular la salud
const calculateCompanyHealth = (data: { ingresos: number, gastos: number, utilidad: number, liquidez: number }) => {
    if (data.ingresos === 0) return { score: null, status: 'partial', message: 'Datos insuficientes para el diagnóstico.' };

    const rentabilidad = (data.utilidad / data.ingresos) * 100;
    const liquidezRatio = data.liquidez / (data.gastos || 1);
    
    let score = (rentabilidad * 0.6) + (Math.min(liquidezRatio * 50, 40));
    score = Math.min(Math.max(score, 0), 100);

    if (score >= 70) return { score: Math.round(score), status: 'healthy', message: 'El negocio mantiene una situación financiera favorable.' };
    if (score >= 40) return { score: Math.round(score), status: 'warning', message: 'Hay señales que conviene corregir antes de que afecten la liquidez.' };
    return { score: Math.round(score), status: 'critical', message: 'Los indicadores muestran un riesgo financiero elevado.' };
};

export const CompanyHealthPage = () => {
  const [period, setPeriod] = useState('month');
  const [isLoading, setIsLoading] = useState(true);
  const [healthData, setHealthData] = useState({
      ingresos: 0,
      gastos: 0,
      utilidad: 0,
      liquidez: 0
  });

  const fetchData = async () => {
      setIsLoading(true);
      try {
          // 1. Ingresos
          const { data: salesData, error: salesError } = await supabase
              .from('sales')
              .select('total_usd')
              .eq('status', 'COMPLETADA');
          
          const ingresos = salesData?.reduce((sum, item) => sum + Number(item.total_usd), 0) || 0;

          // 2. Gastos
          const { data: expensesData, error: expensesError } = await supabase
              .from('expenses')
              .select('amount');
          
          const gastos = expensesData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

          // 3. Liquidez (en tiempo real desde bank_accounts)
          const { data: bankData, error: bankError } = await supabase
              .from('bank_accounts')
              .select('balance, currency');

          // Obtener tasa de cambio vigente
          const { data: ratesData, error: ratesError } = await supabase
              .from('exchange_rates')
              .select('rate')
              .order('observed_at', { ascending: false })
              .limit(1);

          const exchangeRate = ratesData?.[0]?.rate || 1; // Default a 1 si no hay tasa

          const liquidez = bankData?.reduce((sum, item) => {
              const balance = Number(item.balance);
              if (item.currency === 'VES') {
                  return sum + (balance / exchangeRate);
              }
              return sum + balance;
          }, 0) || 0;

          const utilidad = ingresos - gastos;

          setHealthData({ ingresos, gastos, utilidad, liquidez });
      } catch (error) {
          console.error('Error fetching data:', error);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      fetchData();

      // Suscripción en tiempo real a bank_accounts para verificar saldos bancarios en tiempo real
      const subscription = supabase
          .channel('public:bank_accounts')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => {
              fetchData();
          })
          .subscribe();

      return () => {
          supabase.removeChannel(subscription);
      };
  }, [period]);

  const health = useMemo(() => calculateCompanyHealth(healthData), [healthData]);

  const getStatusConfig = (status: string) => {
      switch(status) {
          case 'healthy': return { color: 'text-green-600', bg: 'bg-green-50', iconColor: 'text-green-600', label: 'Negocio saludable' };
          case 'warning': return { color: 'text-amber-800', bg: 'bg-amber-50', iconColor: 'text-amber-800', label: 'Requiere atención' };
          case 'critical': return { color: 'text-red-600', bg: 'bg-red-50', iconColor: 'text-red-600', label: 'Salud crítica' };
          default: return { color: 'text-slate-600', bg: 'bg-slate-50', iconColor: 'text-slate-600', label: 'Diagnóstico parcial' };
      }
  };

  const config = getStatusConfig(health.status);

  const formatMoney = (amount: number) => {
      return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
 
  return (
    <div className="p-6 space-y-6 bg-canvas min-h-screen text-text">
      {/* Header */}
      <div className="page-head">
        <div>
            <h1 className="text-2xl font-bold">Salud de empresa</h1>
            <p className="text-sm text-muted">Panel de diagnóstico empresarial en tiempo real</p>
        </div>
        <div className="actions">
            <Button variant="secondary" onClick={fetchData}><RefreshCcw className="w-4 h-4" /> Actualizar</Button>
            <Button variant="secondary"><FileDown className="w-4 h-4" /> Exportar</Button>
        </div>
      </div>

      {/* Filters/Actions */}
      <div className="flex gap-2">
        {['month', 'quarter', 'year'].map(p => (
            <Button 
                key={p} 
                variant={period === p ? 'primary' : 'secondary'}
                onClick={() => setPeriod(p)}
            >
                {p === 'month' ? 'Este mes' : p === 'quarter' ? 'Este trimestre' : 'Este año'}
            </Button>
        ))}
      </div>

      {/* Main Content - Health Indicator */}
      <Card className="p-6">
        <div className="flex items-center gap-6">
            <h3 className={`text-xl font-bold ${config.color}`}>{config.label}</h3>
            
            <div className={`p-4 rounded-full ${config.bg}`}>
                <Heart className={`w-20 h-20 ${config.iconColor}`} fill="currentColor" />
            </div>
            
            <div className="flex-1">
                <div className="text-5xl font-bold">{health.score !== null ? `${health.score}/100` : '—'}</div>
                <p className="text-sm text-muted mt-1">{health.message}</p>
            </div>
        </div>
        
        {health.score !== null && (
            <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted">Índice de salud</span>
                    <span className="font-semibold">{health.score}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${config.color.replace('text-', 'bg-')} w-[${health.score}%]`} />
                </div>
            </div>
        )}
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-4">
            <Card>
                <div className="kpi-label">Ingresos</div>
                <div className="kpi-value">{isLoading ? '—' : formatMoney(healthData.ingresos)}</div>
                <div className="muted small">{isLoading ? 'Cargando datos...' : '+12.8% vs. anterior'}</div>
            </Card>
            <Card>
                <div className="kpi-label">Gastos</div>
                <div className="kpi-value">{isLoading ? '—' : formatMoney(healthData.gastos)}</div>
                <div className="muted small">{isLoading ? 'Cargando datos...' : 'Gastos operativos'}</div>
            </Card>
            <Card>
                <div className="kpi-label">Utilidad</div>
                <div className="kpi-value">{isLoading ? '—' : formatMoney(healthData.utilidad)}</div>
                <div className="muted small">{isLoading ? 'Cargando datos...' : 'Neto ajustado'}</div>
            </Card>
            <Card>
                <div className="kpi-label">Liquidez</div>
                <div className="kpi-value">{isLoading ? '—' : formatMoney(healthData.liquidez)}</div>
                <div className="muted small">{isLoading ? 'Cargando datos...' : 'Saldos bancarios en tiempo real'}</div>
            </Card>
      </div>
    </div>
  );
};

