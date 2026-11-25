import type { ReactNode } from 'react';

export function AdminHeader({ title, right, eyebrow = 'Management' }: { title: string; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <p className="ad-eyebrow">{eyebrow}</p>
        <h1 className="ad-h1">{title}</h1>
      </div>
      {right}
    </div>
  );
}
