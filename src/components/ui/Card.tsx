import type { ReactNode, CSSProperties, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'standard' | 'selectable' | 'featured' | 'banner';
  isSelected?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({
  children,
  variant = 'standard',
  isSelected = false,
  className = '',
  style,
  ...rest
}: CardProps) {
  const variantClass = variant === 'featured' || variant === 'banner'
    ? 'card-featured'
    : variant === 'selectable'
    ? `card-selectable ${isSelected ? 'selected' : ''}`
    : '';

  return (
    <div className={`card ${variantClass} ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  );
}
