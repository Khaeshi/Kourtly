'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  adjustItemStock,
  restockItem,
  startItemStockTracking,
  stopItemStockTracking,
  updateItem,
} from '@/lib/api';
import type { CatalogItem } from '@/lib/api';
import { createIdempotentAction, type IdempotentAction } from '@/lib/idempotency';
import { Button } from '@/app/components/ui/Button';

const MAX_STOCK_QUANTITY = 10_000;
const fieldClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

export type StockActionKind = 'start' | 'restock' | 'adjust' | 'stop' | 'threshold';

interface StockActionModalProps {
  item: CatalogItem;
  action: StockActionKind;
  offline: boolean;
  onClose: () => void;
  onSuccess: (item: CatalogItem) => void;
}

const titleByAction: Record<StockActionKind, string> = {
  start: 'Start stock tracking',
  restock: 'Restock item',
  adjust: 'Adjust stock',
  stop: 'Stop stock tracking',
  threshold: 'Set low-stock threshold',
};

const successByAction: Record<StockActionKind, string> = {
  start: 'Stock tracking started.',
  restock: 'Stock restocked.',
  adjust: 'Stock adjusted.',
  stop: 'Stock tracking stopped.',
  threshold: 'Low-stock threshold updated.',
};

function getStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error &&
      typeof error.status === 'number') return error.status;
  return null;
}

function getErrorMessage(action: StockActionKind, error: unknown): string {
  if (getStatus(error) === 409) {
    if (action === 'start') return 'Stock tracking is already enabled for this item.';
    if (action === 'restock' || action === 'adjust') {
      return 'Stock tracking is not enabled or stock changed. Refresh and try again.';
    }
    if (action === 'stop') return 'Stock tracking is not enabled for this item.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not save this stock change.';
}

export function StockActionModal({
  item,
  action,
  offline,
  onClose,
  onSuccess,
}: StockActionModalProps) {
  const [quantity, setQuantity] = useState(action === 'start' ? '0' : '');
  const [threshold, setThreshold] = useState(String(item.lowStockThreshold ?? 0));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const actionRef = useRef<IdempotentAction<CatalogItem> | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
    ));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const resetAction = () => {
    actionRef.current = null;
    setRetryAvailable(false);
    setError('');
  };

  const makeRequest = (idempotencyKey: string): Promise<CatalogItem> => {
    if (action === 'start') {
      return startItemStockTracking(item._id, {
        openingQuantity: Number(quantity),
        lowStockThreshold: Number(threshold),
        note: note.trim(),
        idempotencyKey,
      }).then(result => result.item);
    }
    if (action === 'restock') {
      return restockItem(item._id, {
        quantity: Number(quantity),
        note: note.trim(),
        idempotencyKey,
      }).then(result => result.item);
    }
    if (action === 'adjust') {
      return adjustItemStock(item._id, {
        quantityDelta: Number(quantity),
        note: note.trim(),
        idempotencyKey,
      }).then(result => result.item);
    }
    if (action === 'stop') {
      return stopItemStockTracking(item._id, {
        note: note.trim(),
        idempotencyKey,
      }).then(result => result.item);
    }
    return Promise.reject(new Error('Threshold updates do not use stock movement requests.'));
  };

  const validate = (): string | null => {
    if (action === 'threshold') {
      const value = Number(threshold);
      return Number.isInteger(value) && value >= 0 && value <= MAX_STOCK_QUANTITY
        ? null
        : `Enter a whole number from 0 to ${MAX_STOCK_QUANTITY}.`;
    }
    if (action === 'start' || action === 'restock' || action === 'adjust') {
      const value = Number(quantity);
      if (!Number.isInteger(value)) return 'Enter a whole number quantity.';
      if (action === 'start' && (value < 0 || value > MAX_STOCK_QUANTITY)) {
        return `Opening quantity must be from 0 to ${MAX_STOCK_QUANTITY}.`;
      }
      if (action === 'restock' && (value < 1 || value > MAX_STOCK_QUANTITY)) {
        return `Restock quantity must be from 1 to ${MAX_STOCK_QUANTITY}.`;
      }
      if (action === 'adjust' &&
          (value === 0 || Math.abs(value) > MAX_STOCK_QUANTITY ||
            (item.stockOnHand ?? 0) + value < 0 ||
            (item.stockOnHand ?? 0) + value > MAX_STOCK_QUANTITY)) {
        return 'Adjustment must be non-zero and keep stock between 0 and 10,000.';
      }
    }
    if (!note.trim()) return 'A note is required.';
    if (note.trim().length > 500) return 'Note must be 500 characters or fewer.';
    return null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (offline) {
      setError('Not available offline');
      return;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    setRetryAvailable(false);
    setSaving(true);
    if (action === 'threshold') {
      try {
        const updatedItem = await updateItem(item._id, { lowStockThreshold: Number(threshold) });
        setSuccess(successByAction[action]);
        onSuccess(updatedItem);
      } catch (requestError) {
        setError(getErrorMessage(action, requestError));
      } finally {
        setSaving(false);
      }
      return;
    }
    const currentAction = createIdempotentAction(makeRequest);
    actionRef.current = currentAction;
    try {
      const updatedItem = await currentAction.run();
      setSuccess(successByAction[action]);
      onSuccess(updatedItem);
    } catch (requestError) {
      setError(getErrorMessage(action, requestError));
      setRetryAvailable(currentAction.canRetry());
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    const currentAction = actionRef.current;
    if (offline || !currentAction || !currentAction.canRetry()) return;
    setError('');
    setRetryAvailable(false);
    setSaving(true);
    try {
      const updatedItem = await currentAction.retry();
      setSuccess(successByAction[action]);
      onSuccess(updatedItem);
    } catch (requestError) {
      setError(getErrorMessage(action, requestError));
      setRetryAvailable(currentAction.canRetry());
    } finally {
      setSaving(false);
    }
  };

  const updateQuantity = (value: string) => {
    resetAction();
    setQuantity(value);
  };

  const updateThreshold = (value: string) => {
    resetAction();
    setThreshold(value);
  };

  const updateNote = (value: string) => {
    resetAction();
    setNote(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-action-title"
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="stock-action-title" className="text-lg font-semibold text-gray-900">
              {titleByAction[action]}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{item.name}</p>
          </div>
          <Button v="ghost" size="sm" onClick={onClose} aria-label="Close stock action">Close</Button>
        </div>

        {offline ? (
          <div className="rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-900" role="status">
            Not available offline
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {action === 'start' && (
              <>
                <div>
                  <label className={labelClass} htmlFor="stock-opening-quantity">Opening quantity</label>
                  <input id="stock-opening-quantity" className={fieldClass} type="number" min="0"
                    max={MAX_STOCK_QUANTITY} step="1" value={quantity}
                    onChange={event => updateQuantity(event.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="stock-start-threshold">Low-stock threshold</label>
                  <input id="stock-start-threshold" className={fieldClass} type="number" min="0"
                    max={MAX_STOCK_QUANTITY} step="1" value={threshold}
                    onChange={event => updateThreshold(event.target.value)} />
                </div>
              </>
            )}

            {action === 'restock' && (
              <div>
                <label className={labelClass} htmlFor="stock-restock-quantity">Quantity</label>
                <input id="stock-restock-quantity" className={fieldClass} type="number" min="1"
                  max={MAX_STOCK_QUANTITY} step="1" value={quantity}
                  onChange={event => updateQuantity(event.target.value)} />
              </div>
            )}

            {action === 'adjust' && (
              <>
                <p className="text-sm text-gray-600">On hand: {item.stockOnHand ?? 0}</p>
                <div>
                  <label className={labelClass} htmlFor="stock-adjust-quantity">Quantity change</label>
                  <input id="stock-adjust-quantity" className={fieldClass} type="number"
                    min={-(item.stockOnHand ?? 0)} max={MAX_STOCK_QUANTITY} step="1"
                    value={quantity} onChange={event => updateQuantity(event.target.value)} />
                </div>
              </>
            )}

            {action === 'threshold' && (
              <div>
                <label className={labelClass} htmlFor="stock-threshold">Low-stock threshold</label>
                <input id="stock-threshold" className={fieldClass} type="number" min="0"
                  max={MAX_STOCK_QUANTITY} step="1" value={threshold}
                  onChange={event => updateThreshold(event.target.value)} />
              </div>
            )}

            {action !== 'threshold' && (
              <div>
                <label className={labelClass} htmlFor="stock-action-note">Note (required)</label>
                <textarea id="stock-action-note" className={fieldClass} rows={3} maxLength={500}
                  required value={note} onChange={event => updateNote(event.target.value)} />
                <p className="mt-1 text-right text-xs text-gray-400">{note.length}/500</p>
              </div>
            )}

            {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
            {success && <p role="status" className="text-sm font-medium text-green-700">{success}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {retryAvailable && (
                <Button type="button" v="warning" onClick={retry} loading={saving}
                  disabled={offline}>Retry</Button>
              )}
              {success ? (
                <Button type="button" v="primary" onClick={onClose}>Done</Button>
              ) : (
                <Button type="submit" v="primary" loading={saving} disabled={saving}>
                  {titleByAction[action]}
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
