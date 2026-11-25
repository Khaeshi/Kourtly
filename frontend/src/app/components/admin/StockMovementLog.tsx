'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { getItemStockMovements } from '@/lib/api';
import type { CatalogItem, StockMovement } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';

interface StockMovementLogProps {
  item: CatalogItem;
  offline: boolean;
  onClose: () => void;
}

const movementLabels: Record<StockMovement['type'], string> = {
  opening: 'Tracking started',
  restock: 'Restock',
  adjustment: 'Adjustment',
  sale: 'Sale',
  void: 'Sale voided',
  count: 'Stock count',
};

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function StockMovementLog({ item, offline, onClose }: StockMovementLogProps) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') onCloseRef.current();
  };

  useEffect(() => {
    if (offline) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    getItemStockMovements(item._id)
      .then(result => {
        if (active) setMovements(result.movements);
      })
      .catch(requestError => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Could not load stock movements.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [item._id, offline]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-movement-title"
        onKeyDown={handleDialogKeyDown}
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-5">
          <div>
            <h2 id="stock-movement-title" className="text-lg font-semibold text-gray-900">Stock movement history</h2>
            <p className="mt-1 text-sm text-gray-500">{item.name}</p>
          </div>
          <Button v="ghost" size="sm" onClick={onClose} aria-label="Close stock movement history">Close</Button>
        </div>

        {offline ? (
          <p role="status" className="p-5 text-sm font-medium text-amber-900">Not available offline</p>
        ) : loading ? (
          <p role="status" className="p-5 text-sm text-gray-500">Loading movements...</p>
        ) : error ? (
          <p role="alert" className="p-5 text-sm text-red-700">{error}</p>
        ) : movements.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No stock movements yet.</p>
        ) : (
          <ul className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto">
            {movements.map(movement => (
              <li key={movement._id} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_auto] sm:gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{movementLabels[movement.type]}</p>
                  <p className="mt-1 text-sm text-gray-600">{movement.note}</p>
                  <time className="mt-1 block text-xs text-gray-400" dateTime={movement.createdAt}>
                    {new Date(movement.createdAt).toLocaleString()}
                  </time>
                </div>
                <div className="text-sm sm:text-right">
                  <p className="font-mono font-semibold text-gray-800">
                    Change {formatDelta(movement.quantityDelta)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Balance after: {movement.balanceAfter}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
