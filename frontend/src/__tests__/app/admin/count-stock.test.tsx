import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CountStockPage, { validateStockCountEntries } from '@/app/(admin)/admin/count-stock/page';
import * as api from '@/lib/api';
import { useConnectivity } from '@/lib/connectivity';
import type { CatalogItem, StockCountSummary } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getAllItems: jest.fn(),
  getLatestStockCount: jest.fn(),
  countItemStock: jest.fn(),
}));

jest.mock('@/lib/connectivity', () => ({
  useConnectivity: jest.fn(),
}));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedConnectivity = useConnectivity as jest.Mock;

const trackedItem: CatalogItem = {
  _id: 'item-1',
  name: 'Shuttlecock tube',
  price: 25,
  category: 'equipment',
  isActive: true,
  isSplittable: false,
  trackStock: true,
  stockOnHand: 5,
  lowStockThreshold: 2,
  isLowStock: false,
};

const countResult: StockCountSummary = {
  countId: 'count-1',
  countedAt: '2026-01-01T10:00:00.000Z',
  timezone: 'Asia/Manila',
  salesToday: 4,
  unitsSoldToday: 8,
  itemsMatched: 0,
  itemsShort: 1,
  itemsOver: 0,
  items: [{
    itemId: trackedItem._id,
    name: trackedItem.name,
    expectedQuantity: 5,
    countedQuantity: 4,
    difference: -1,
    note: 'Shelf count',
  }],
};

function setOnlineStatus(status: 'online' | 'offline' | 'degraded') {
  mockedConnectivity.mockReturnValue({
    status,
    ready: true,
    sessionExpired: false,
    oldestSnapshot: undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setOnlineStatus('online');
  mockedApi.getAllItems.mockResolvedValue([trackedItem]);
  mockedApi.getLatestStockCount.mockResolvedValue(null);
  let keyNumber = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => `count-action-${++keyNumber}`),
  });
});

describe('Count Stock page', () => {
  test('shows loading and empty tracked-item states', async () => {
    let resolveItems!: (items: CatalogItem[]) => void;
    let resolveLatest!: (summary: StockCountSummary | null) => void;
    mockedApi.getAllItems.mockReturnValue(new Promise(resolve => { resolveItems = resolve; }));
    mockedApi.getLatestStockCount.mockReturnValue(new Promise(resolve => { resolveLatest = resolve; }));

    render(<CountStockPage />);
    expect(screen.getByText('Loading stock items...')).toBeInTheDocument();

    await act(async () => {
      resolveItems([{ ...trackedItem, trackStock: false }]);
      resolveLatest(null);
    });
    expect(await screen.findByText(/No tracked items to count/)).toBeInTheDocument();
  });

  test('shows expected quantity, calculates difference, and displays the saved summary', async () => {
    mockedApi.countItemStock.mockResolvedValue(countResult);
    render(<CountStockPage />);

    const quantity = await screen.findByLabelText('Counted quantity for Shuttlecock tube');
    expect(screen.getByText('5')).toBeInTheDocument();
    await userEvent.type(quantity, '4');
    await userEvent.type(screen.getByLabelText('Note for Shuttlecock tube'), 'Shelf count');
    expect(screen.getByText('-1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));

    expect(await screen.findByText('Latest count details')).toBeInTheDocument();
    expect(mockedApi.countItemStock).toHaveBeenCalledWith({
      idempotencyKey: 'count-action-1',
      items: [{ itemId: trackedItem._id, countedQuantity: 4, note: 'Shelf count' }],
    });
    const summary = screen.getByRole('region', { name: 'Latest count summary' });
    expect(within(summary).getByText('Sales today')).toBeInTheDocument();
    expect(within(summary).getByText('Units sold today')).toBeInTheDocument();
    expect(within(summary).getByText('Items matching')).toBeInTheDocument();
    expect(within(summary).getByText('Items short')).toBeInTheDocument();
    expect(within(summary).getByText('8')).toBeInTheDocument();
    expect(within(summary).getByText('1')).toBeInTheDocument();
  });

  test('maps 409 to stock changed and keeps counted values and notes', async () => {
    mockedApi.countItemStock.mockRejectedValue(
      Object.assign(new Error('Stock changed during the count.'), { status: 409 }),
    );
    render(<CountStockPage />);

    const quantity = await screen.findByLabelText('Counted quantity for Shuttlecock tube');
    await userEvent.type(quantity, '4');
    const note = screen.getByLabelText('Note for Shuttlecock tube');
    await userEvent.type(note, 'Shelf count');
    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Stock changed. Refresh the list and retry the count.',
    );
    expect(quantity).toHaveValue(4);
    expect(note).toHaveValue('Shelf count');
  });

  test('accepts counted quantity boundaries and rejects values above 10,000', async () => {
    render(<CountStockPage />);
    const quantity = await screen.findByLabelText('Counted quantity for Shuttlecock tube');
    const saveButton = screen.getByRole('button', { name: 'Save count' });

    fireEvent.change(quantity, { target: { value: '0' } });
    expect(saveButton).toBeEnabled();
    fireEvent.change(quantity, { target: { value: '10000' } });
    expect(saveButton).toBeEnabled();
    fireEvent.change(quantity, { target: { value: '10001' } });

    expect(screen.getByRole('alert')).toHaveTextContent('enter a whole number from 0 to 10000');
    expect(saveButton).toBeDisabled();
  });

  test('accepts 200 count entries and rejects 201', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      name: `Stock item ${index}`,
      countedQuantity: '0',
      note: '',
    }));

    expect(validateStockCountEntries(entries)).toBe('');
    expect(validateStockCountEntries([...entries, {
      name: 'Stock item 200',
      countedQuantity: '0',
      note: '',
    }])).toBe('A count can include no more than 200 items.');
  });

  test('retries network failure with the same key and retains the form', async () => {
    mockedApi.countItemStock
      .mockRejectedValueOnce(Object.assign(new Error('Network request failed.'), {
        cause: Object.assign(new Error('Failed to fetch'), { kind: 'network' }),
      }))
      .mockResolvedValueOnce(countResult);
    render(<CountStockPage />);

    const quantity = await screen.findByLabelText('Counted quantity for Shuttlecock tube');
    await userEvent.type(quantity, '4');
    const note = screen.getByLabelText('Note for Shuttlecock tube');
    await userEvent.type(note, 'Shelf count');
    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));
    expect(await screen.findByRole('button', { name: 'Retry count' })).toBeInTheDocument();
    expect(quantity).toHaveValue(4);
    expect(note).toHaveValue('Shelf count');

    await userEvent.click(screen.getByRole('button', { name: 'Retry count' }));

    expect(await screen.findByText('Latest count details')).toBeInTheDocument();
    expect(mockedApi.countItemStock).toHaveBeenCalledTimes(2);
    expect(mockedApi.countItemStock.mock.calls[0][0].idempotencyKey)
      .toBe(mockedApi.countItemStock.mock.calls[1][0].idempotencyKey);
  });

  test('shows no cached stock values and makes no requests offline', () => {
    setOnlineStatus('offline');
    render(<CountStockPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Not available offline');
    expect(screen.queryByText('Shuttlecock tube')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save count' })).toBeDisabled();
    expect(mockedApi.getAllItems).not.toHaveBeenCalled();
    expect(mockedApi.getLatestStockCount).not.toHaveBeenCalled();
    expect(mockedApi.countItemStock).not.toHaveBeenCalled();
  });
});
