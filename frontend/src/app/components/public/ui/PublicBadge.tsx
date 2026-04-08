import React from 'react';

interface PublicBadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function PublicBadge({ children, className = '' }: PublicBadgeProps) {
  return <span className={`public-chip ${className}`}>{children}</span>;
}
