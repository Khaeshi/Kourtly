import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemsPage from '@/app/(admin)/admin/items/page';
import { StockActionModal, type StockActionKind } from '@/app/components/admin/StockActionModal';
import { StockMovementLog } from '@/app/components/admin/StockMovementLog';
import * as api from '@/lib/api';
import { useConnectivity } from '@/lib/connectivity';
import type { CatalogItem, StockMovement } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getAllItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  startItemStockTracking: jest.fn(),
  restockItem: jest.fn(),
  adjustItemStock: jest.fn(),
  stopItemStockTracking: jest.fn(),
  getItemStockMovements: jest.fn(),
  OfflineUnavailableError: class OfflineUnavailableError extends Error {},
}));

jest.mock('@/lib/connectivity', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('@/hooks/useSocketEvent', () => ({
  useSocketEvent: jest.fn(),
}));

jest.mock('sileo', () => ({
  sileo: { promise: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedConnectivity = useConnectivity as jest.Mock;

const catalogItem: CatalogItem = {
  _id: 'item-1',
  name: 'Grip tape',
  price: 2,
  category: 'equipment',
  isActive: true,
  isSplittable: false,
  trackStock: true,
  stockOnHand: 2,
  lowStockThreshold: 3,
  isLowStock: true,
};

const movement: StockMovement = {
  _id: 'movement-1',
  itemId: catalogItem._id,
  type: 'restock',
  quantityDelta: 3,
  balanceAfter: 5,
  unitPrice: 2,
  note: 'New stock',
  actorId: 'staff-1',
  idempotencyKey: 'key-1',
  createdAt: '2026-01-01T10:00:00.000Z',
};

const actionButtons: Record<StockActionKind, string> = {
  start: 'Start stock tracking',
  restock: 'Restock item',
  adjust: 'Adjust stock',
  stop: 'Stop stock tracking',
  threshold: 'Set low-stock threshold',
};

const actionMocks: Record<StockActionKind, jest.Mock> = {
  start: mockedApi.startItemStockTracking as jest.Mock,
  restock: mockedApi.restockItem as jest.Mock,
  adjust: mockedApi.adjustItemStock as jest.Mock,
  stop: mockedApi.stopItemStockTracking as jest.Mock,
  threshold: mockedApi.updateItem as jest.Mock,
};

function setOnlineStatus(status: 'online' | 'offline' | 'degraded') {
  mockedConnectivity.mockReturnValue({
    status,
    ready: true,
    sessionExpired: false,
    oldestSnapshot: undefined,
  });
}

function renderStockAction(action: StockActionKind, offline = false) {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  render(
    <StockActionModal
      item={catalogItem}
      action={action}
      offline={offline}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  );
  return { onClose, onSuccess };
}

async function fillActionForm(action: StockActionKind) {
  if (action === 'restock') {
    await userEvent.type(screen.getByLabelText('Quantity'), '3');
  }
  if (action === 'adjust') {
    await userEvent.type(screen.getByLabelText('Quantity change'), '-1');
  }
  if (action !== 'threshold') {
    await userEvent.type(screen.getByLabelText('Note (required)'), 'Stock received');
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  setOnlineStatus('online');
  mockedApi.getAllItems.mockResolvedValue([]);
  mockedApi.getItemStockMovements.mockResolvedValue({
    movements: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  let keyNumber = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => `stock-action-${++keyNumber}`),
  });
});

describe('Items page stock section', () => {
  test('shows loading and empty catalog states', async () => {
    let resolveItems!: (items: CatalogItem[]) => void;
    mockedApi.getAllItems.mockReturnValue(new Promise(resolve => { resolveItems = resolve; }));

    render(<ItemsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await act(async () => resolveItems([]));
    expect(await screen.findByText('No items yet.')).toBeInTheDocument();
  });

  test('shows tracked balance and low-stock badge online, but omits controls for fees and services', async () => {
    mockedApi.getAllItems.mockResolvedValue([
      catalogItem,
      { ...catalogItem, _id: 'fee-1', name: 'Court fee', category: 'court fee', trackStock: false },
      { ...catalogItem, _id: 'service-1', name: 'Stringing service', category: 'services', trackStock: false },
    ]);

    render(<ItemsPage />);

    expect(await screen.findAllByText('On hand: 2')).not.toHaveLength(0);
    expect(screen.getAllByText('Low stock')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Start tracking' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Restock' })).toHaveLength(2);
  });

  test('keeps the catalog offline while hiding stock numbers and low-stock badges', async () => {
    setOnlineStatus('offline');
    mockedApi.getAllItems.mockResolvedValue([catalogItem]);

    render(<ItemsPage />);

    expect(await screen.findAllByText('Grip tape')).not.toHaveLength(0);
    expect(screen.getAllByText('Not available offline').length).toBeGreaterThan(0);
    expect(screen.queryByText('On hand: 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Low stock')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restock' })).not.toBeInTheDocument();
  });
});

describe('StockActionModal', () => {
  test.each(Object.keys(actionButtons) as StockActionKind[])(
    '%s action shows success and returns the updated item',
    async (action) => {
      const updatedItem = { ...catalogItem, stockOnHand: 5 };
      actionMocks[action].mockResolvedValue(
        action === 'threshold' ? updatedItem : { item: updatedItem, movement },
      );
      const { onSuccess } = renderStockAction(action);
      await fillActionForm(action);
      await userEvent.click(screen.getByRole('button', { name: actionButtons[action] }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        action === 'start' ? 'Stock tracking started.'
          : action === 'restock' ? 'Stock restocked.'
            : action === 'adjust' ? 'Stock adjusted.'
              : action === 'stop' ? 'Stock tracking stopped.'
                : 'Low-stock threshold updated.',
      );
      expect(onSuccess).toHaveBeenCalledWith(updatedItem);
    },
  );

  test.each(Object.keys(actionButtons) as StockActionKind[])(
    '%s action shows errors and retains entered values',
    async (action) => {
      actionMocks[action].mockRejectedValue(Object.assign(new Error('Invalid stock request.'), { status: 400 }));
      renderStockAction(action);
      await fillActionForm(action);
      await userEvent.click(screen.getByRole('button', { name: actionButtons[action] }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid stock request.');
      if (action !== 'threshold') {
        expect(screen.getByLabelText('Note (required)')).toHaveValue('Stock received');
      } else {
        expect(screen.getByLabelText('Low-stock threshold')).toHaveValue(3);
      }
    },
  );

  test.each([
    ['start', 'Stock tracking is already enabled for this item.'],
    ['restock', 'Stock tracking is not enabled or stock changed. Refresh and try again.'],
    ['adjust', 'Stock tracking is not enabled or stock changed. Refresh and try again.'],
  ] as const)('%s action maps 409 to its route-specific message', async (action, message) => {
    actionMocks[action].mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    renderStockAction(action);
    await fillActionForm(action);
    await userEvent.click(screen.getByRole('button', { name: actionButtons[action] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('retries a network failure with the same idempotency key and keeps the note', async () => {
    const updatedItem = { ...catalogItem, stockOnHand: 5 };
    mockedApi.restockItem
      .mockRejectedValueOnce(Object.assign(new Error('Network request failed.'), {
        cause: Object.assign(new Error('Failed to fetch'), { kind: 'network' }),
      }))
      .mockResolvedValueOnce({ item: updatedItem, movement });

    const { onSuccess } = renderStockAction('restock');
    await fillActionForm('restock');
    await userEvent.click(screen.getByRole('button', { name: actionButtons.restock }));
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Note (required)')).toHaveValue('Stock received');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockedApi.restockItem).toHaveBeenCalledTimes(2));
    const firstKey = mockedApi.restockItem.mock.calls[0][1].idempotencyKey;
    const retryKey = mockedApi.restockItem.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBe('stock-action-1');
    expect(retryKey).toBe(firstKey);
    expect(onSuccess).toHaveBeenCalledWith(updatedItem);
  });

  test('blocks stock actions and hides quantities offline', () => {
    renderStockAction('restock', true);

    expect(screen.getByRole('status')).toHaveTextContent('Not available offline');
    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
    expect(screen.queryByText(/On hand/)).not.toBeInTheDocument();
    expect(mockedApi.restockItem).not.toHaveBeenCalled();
  });
});

describe('StockMovementLog', () => {
  test('shows loading then empty history', async () => {
    let resolveMovements!: (result: { movements: StockMovement[]; pagination: { page: number; limit: number; total: number; totalPages: number } }) => void;
    mockedApi.getItemStockMovements.mockReturnValue(new Promise(resolve => { resolveMovements = resolve; }));

    render(<StockMovementLog item={catalogItem} offline={false} onClose={jest.fn()} />);
    expect(screen.getByText('Loading movements...')).toBeInTheDocument();

    await act(async () => resolveMovements({
      movements: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }));
    expect(await screen.findByText('No stock movements yet.')).toBeInTheDocument();
  });

  test('does not request or show movement balances offline', () => {
    render(<StockMovementLog item={catalogItem} offline onClose={jest.fn()} />);

    expect(screen.getByText('Not available offline')).toBeInTheDocument();
    expect(screen.queryByText(/Balance after/)).not.toBeInTheDocument();
    expect(mockedApi.getItemStockMovements).not.toHaveBeenCalled();
  });
});
