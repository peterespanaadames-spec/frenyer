import { Database } from 'lucide-react';
import { Card } from './Card';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card className="empty">
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Database size={28} aria-hidden="true" style={{ marginBottom: 8, color: 'var(--muted)' }} />
        <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
        <p className="muted" style={{ margin: 0 }}>{description}</p>
      </div>
    </Card>
  );
}
