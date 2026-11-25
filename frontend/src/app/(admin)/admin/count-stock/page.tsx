'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/app/components/ui/Button';
import { countItemStock, getAllItems, getLatestStockCount } from '@/lib/api';
import type { CatalogItem, StockCountSummary } from '@/lib/api';
import { useConnectivity } from '@/lib/connectivity';
import { createIdempotentAction, type IdempotentAction } from '@/lib/idempotency';

const MAX_STOCK_QUANTITY = 10_000;
const MAX_COUNT_ITEMS = 200;

interface CountValue {
  countedQuantity: string;
  note: string;
}

function isCountableItem(item: CatalogItem): boolean {
  return item.trackStock === true && !/\b(fee|fees|service|services)\b/i.test(item.category);
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error &&
      typeof error.status === 'number') return error.status;
  return null;
}

function getDifference(value: number | null): string {
  if (value === null) return '-';
  return value > 0 ? `+${value}` : String(value);
}

export function validateStockCountEntries(
  entries: Array<{ name: string; countedQuantity: string; note: string }>,
): string {
  if (entries.length > MAX_COUNT_ITEMS) {
    return `A count can include no more than ${MAX_COUNT_ITEMS} items.`;
  }
  const invalidQuantity = entries.find(entry => {
    const counted = Number(entry.countedQuantity);
    return !Number.isSafeInteger(counted) || counted < 0 || counted > MAX_STOCK_QUANTITY;
  });
  if (invalidQuantity) {
    return `${invalidQuantity.name}: enter a whole number from 0 to ${MAX_STOCK_QUANTITY}.`;
  }
  const invalidNote = entries.find(entry => entry.note.trim().length > 500);
  if (invalidNote) return `${invalidNote.name}: note must be 500 characters or fewer.`;
  return '';
}

export default function CountStockPage() {
  const { status } = useConnectivity();
  const [browserOnline, setBrowserOnline] = useState(true);
  const offline = status !== 'online' || !browserOnline;
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [summary, setSummary] = useState<StockCountSummary | null>(null);
  const [values, setValues] = useState<Record<string, CountValue>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const actionRef = useRef<IdempotentAction<StockCountSummary> | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const updateBrowserStatus = () => setBrowserOnline(navigator.onLine);
    updateBrowserStatus();
    window.addEventListener('online', updateBrowserStatus);
    window.addEventListener('offline', updateBrowserStatus);
    return () => {
      window.removeEventListener('online', updateBrowserStatus);
      window.removeEventListener('offline', updateBrowserStatus);
    };
  }, []);

  const load = useCallback(async () => {
    if (offlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const [catalog, latest] = await Promise.all([getAllItems(), getLatestStockCount()]);
      if (requestId !== requestSequence.current) return;
      setItems(catalog.filter(isCountableItem));
      setSummary(latest);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setLoadError(error instanceof Error ? error.message : 'Could not load stock count.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      requestSequence.current += 1;
      setItems([]);
      setSummary(null);
      setValues({});
      setLoadError('');
      setLoading(false);
      return;
    }
    void load();
  }, [offline, load]);

  const resetAction = () => {
    actionRef.current = null;
    setRetryAvailable(false);
    setSubmitError('');
  };

  const changeValue = (itemId: string, field: keyof CountValue, value: string) => {
    resetAction();
    setValues(current => {
      const previous = current[itemId] ?? { countedQuantity: '', note: '' };
      return {
        ...current,
        [itemId]: { ...previous, [field]: value },
      };
    });
  };

  const enteredItems = items.filter(item => (values[item._id]?.countedQuantity ?? '').trim() !== '');
  const validationMessage = validateStockCountEntries(enteredItems.map(item => ({
    name: item.name,
    countedQuantity: values[item._id].countedQuantity,
    note: values[item._id].note,
  })));

  const executeCount = async (action: IdempotentAction<StockCountSummary>, retry: boolean) => {
    if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setSubmitError('Not available offline');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    setRetryAvailable(false);
    try {
      const result = retry ? await action.retry() : await action.run();
      actionRef.current = null;
      setSummary(result);
      setItems(current => current.map(item => {
        const counted = result.items.find(entry => entry.itemId === item._id);
        return counted ? { ...item, stockOnHand: counted.countedQuantity } : item;
      }));
      setValues({});
    } catch (error) {
      setSubmitError(getErrorStatus(error) === 409
        ? 'Stock changed. Refresh the list and retry the count.'
        : error instanceof Error ? error.message : 'Could not save this stock count.');
      setRetryAvailable(action.canRetry());
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setSubmitError('Not available offline');
      return;
    }
    if (validationMessage) {
      setSubmitError(validationMessage);
      return;
    }
    if (enteredItems.length === 0) {
      setSubmitError('Enter a counted quantity for at least one item.');
      return;
    }

    const requestItems = enteredItems.map(item => ({
      itemId: item._id,
      countedQuantity: Number(values[item._id].countedQuantity),
      ...(values[item._id].note.trim() ? { note: values[item._id].note.trim() } : {}),
    }));
    const action = createIdempotentAction(idempotencyKey =>
      countItemStock({ idempotencyKey, items: requestItems }),
    );
    actionRef.current = action;
    await executeCount(action, false);
  };

  const handleRetry = () => {
    const action = actionRef.current;
    if (action && action.canRetry()) void executeCount(action, true);
  };

  if (offline) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Count Stock</h1>
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Not available offline
        </p>
        <Button v="primary" disabled>Save count</Button>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Sales today', value: summary?.salesToday },
    { label: 'Units sold today', value: summary?.unitsSoldToday },
    { label: 'Items matching', value: summary?.itemsMatched },
    { label: 'Items short', value: summary?.itemsShort },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 border-b border-gray-200 pb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Inventory</p>
        <h1 className="text-2xl font-bold text-gray-900">Count Stock</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter counts for the items you checked. Unentered items will not be changed.
        </p>
      </header>

      {loading ? (
        <p role="status" className="rounded-lg bg-white p-12 text-center text-sm text-gray-500">Loading stock items...</p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          <p>Could not load the stock count: {loadError}</p>
          <Button v="ghost" size="sm" className="mt-3" onClick={() => void load()}>Retry loading</Button>
        </div>
      ) : (
        <>
          <section aria-label="Latest count summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryCards.map(card => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-gray-900">{card.value ?? '-'}</p>
              </div>
            ))}
          </section>

          {items.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
              No tracked items to count. Start tracking an item from the Items page first.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <h2 className="font-semibold text-gray-900">Counted items</h2>
                <p className="text-xs text-gray-500">
                  {enteredItems.length} of {MAX_COUNT_ITEMS} maximum in this count
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="px-4 py-3">Item</th>
                      <th scope="col" className="px-4 py-3">Expected</th>
                      <th scope="col" className="px-4 py-3">Counted</th>
                      <th scope="col" className="px-4 py-3">Difference</th>
                      <th scope="col" className="px-4 py-3">Note (optional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const countedText = values[item._id]?.countedQuantity ?? '';
                      const counted = countedText.trim() ? Number(countedText) : null;
                      const expected = item.stockOnHand;
                      const difference = counted !== null && Number.isSafeInteger(counted) &&
                        typeof expected === 'number' ? counted - expected : null;
                      return (
                        <tr key={item._id} className="border-b border-gray-100 align-middle last:border-0">
                          <th scope="row" className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</th>
                          <td className="px-4 py-3 font-mono text-sm text-gray-700">
                            {typeof expected === 'number' ? expected : 'Unavailable'}
                          </td>
                          <td className="px-4 py-3">
                            <label className="sr-only" htmlFor={`counted-${item._id}`}>
                              Counted quantity for {item.name}
                            </label>
                            <input
                              id={`counted-${item._id}`}
                              className="w-24 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                              type="number"
                              min="0"
                              max={MAX_STOCK_QUANTITY}
                              step="1"
                              inputMode="numeric"
                              value={countedText}
                              disabled={submitting || typeof expected !== 'number'}
                              aria-invalid={!!countedText && (
                                !Number.isSafeInteger(Number(countedText)) ||
                                Number(countedText) < 0 ||
                                Number(countedText) > MAX_STOCK_QUANTITY
                              )}
                              onChange={event => changeValue(item._id, 'countedQuantity', event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-gray-700">
                            {getDifference(difference)}
                          </td>
                          <td className="px-4 py-3">
                            <label className="sr-only" htmlFor={`note-${item._id}`}>Note for {item.name}</label>
                            <input
                              id={`note-${item._id}`}
                              className="w-48 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                              type="text"
                              maxLength={500}
                              disabled={submitting}
                              value={values[item._id]?.note ?? ''}
                              onChange={event => changeValue(item._id, 'note', event.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4">
                <div>
                  {validationMessage && <p role="alert" className="text-sm text-red-700">{validationMessage}</p>}
                  {submitError && <p role="alert" className="text-sm text-red-700">{submitError}</p>}
                  {!submitError && !validationMessage && enteredItems.length === 0 && (
                    <p className="text-sm text-gray-500">Enter at least one counted quantity.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {retryAvailable && (
                    <Button type="button" v="warning" onClick={handleRetry} loading={submitting}>
                      Retry count
                    </Button>
                  )}
                  <Button
                    type="submit"
                    v="primary"
                    loading={submitting}
                    disabled={offline || submitting || enteredItems.length === 0 || !!validationMessage}
                  >
                    Save count
                  </Button>
                </div>
              </div>
            </form>
          )}

          {summary && summary.items.length > 0 && (
            <section aria-label="Latest count details" className="mt-6 rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="font-semibold text-gray-900">Latest count details</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="px-4 py-3">Item</th>
                      <th scope="col" className="px-4 py-3">Expected</th>
                      <th scope="col" className="px-4 py-3">Counted</th>
                      <th scope="col" className="px-4 py-3">Difference</th>
                      <th scope="col" className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.items.map(item => (
                      <tr key={item.itemId} className="border-b border-gray-100 last:border-0">
                        <th scope="row" className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</th>
                        <td className="px-4 py-3 font-mono text-sm">{item.expectedQuantity}</td>
                        <td className="px-4 py-3 font-mono text-sm">{item.countedQuantity}</td>
                        <td className="px-4 py-3 font-mono text-sm">{getDifference(item.difference)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
