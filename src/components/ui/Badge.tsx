import type { ReactNode } from 'react';

export function Badge({
  children,
  tone = 'brand',
  className = ''
}: {
  children: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'dark' | 'accent';
  className?: string;
}) {
  return <span className={`badge ${tone} ${className}`.trim()}>{children}</span>;
}
