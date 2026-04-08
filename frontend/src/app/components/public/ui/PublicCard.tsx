import React from 'react';

interface PublicCardProps {
  children: React.ReactNode;
  className?: string;
}

export function PublicCard({ children, className = '' }: PublicCardProps) {
  return <div className={`public-card ${className}`}>{children}</div>;
}
