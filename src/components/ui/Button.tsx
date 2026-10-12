import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  children,
  variant = 'secondary',
  className = '',
  ...p
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn ${variant} ${className}`.trim()} {...p}>
      {children}
    </button>
  );
}

