import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingPage from '@/app/(admin)/admin/billing/page';
import * as api from '@/lib/api';
import { useConnectivity } from '@/lib/connectivity';
import type { CatalogItem, ReservationTab, Tab } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getPlayers: jest.fn(),
  getItems: jest.fn(),
  getOpenTabs: jest.fn(),
  openTab: jest.fn(),
  addItemToTab: jest.fn(),
  removeItemFromTab: jest.fn(),
  payTab: jest.fn(),
  markUnpaid: jest.fn(),
  payUnpaid: jest.fn(),
  closeTab: jest.fn(),
  splitItem: jest.fn(),
  getTodayReservationTabs: jest.fn(),
  addItemToReservationTab: jest.fn(),
  removeItemFromReservationTab: jest.fn(),
  payReservationTab: jest.fn(),
  markReservationUnpaid: jest.fn(),
  payReservationUnpaid: jest.fn(),
  clearReservationTab: jest.fn(),
  collectReservationBalance: jest.fn(),
  getTabHistoryPaged: jest.fn(),
  getReservationTabHistoryPaged: jest.fn(),
  OfflineUnavailableError: class OfflineUnavailableError extends Error {},
}));

jest.mock('@/lib/connectivity', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('@/hooks/useSocketEvent', () => ({
  useSocketEvent: jest.fn(),
}));

jest.mock('sileo', () => ({
  sileo: {
    promise: jest.fn(promise => promise),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedConnectivity = useConnectivity as jest.Mock;

const product: CatalogItem = {
  _id: 'item-1',
  name: 'Grip tape',
  price: 2,
  category: 'equipment',
  isActive: true,
  isSplittable: false,
};

const queueTab: Tab = {
  _id: 'tab-1',
  player: { _id: 'player-1', name: 'Rally Player', level: 'A' },
  items: [],
  total: 0,
  status: 'open',
  sessionDate: '2026-01-01',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const reservationTab: ReservationTab = {
  _id: 'reservation-tab-1',
  reservation: 'reservation-1',
  guestName: 'Court Guest',
  court: 1,
  date: '2026-01-01',
  timeSlot: '10:00',
  duration: 1,
  items: [],
  total: 0,
  status: 'open',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedConnectivity.mockReturnValue({
    status: 'online',
    ready: true,
    sessionExpired: false,
    oldestSnapshot: undefined,
  });
  mockedApi.getPlayers.mockResolvedValue([]);
  mockedApi.getItems.mockResolvedValue([product]);
  mockedApi.getOpenTabs.mockResolvedValue([queueTab]);
  mockedApi.getTodayReservationTabs.mockResolvedValue([reservationTab]);
  let keyNumber = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => `billing-action-${++keyNumber}`),
  });
});

async function selectQueueTab() {
  await screen.findAllByText('Grip tape');
  await userEvent.click(screen.getByText('Rally Player'));
}

function quickAddButton() {
  return screen.getAllByRole('button', { name: 'Add' })[0];
}

describe('Billing idempotency and stock warnings', () => {
  test('two deliberate add clicks use separate keys and create two charges', async () => {
    const processedKeys = new Set<string>();
    let chargesCreated = 0;
    mockedApi.addItemToTab.mockImplementation(async (_tabId, payload) => {
      if (!processedKeys.has(payload.idempotencyKey!)) {
        processedKeys.add(payload.idempotencyKey!);
        chargesCreated += 1;
      }
      return queueTab;
    });

    render(<BillingPage />);
    await selectQueueTab();

    await userEvent.click(quickAddButton());
    await waitFor(() => expect(mockedApi.addItemToTab).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(quickAddButton()).toBeEnabled());

    await userEvent.click(quickAddButton());
    await waitFor(() => expect(mockedApi.addItemToTab).toHaveBeenCalledTimes(2));

    const firstKey = mockedApi.addItemToTab.mock.calls[0][1].idempotencyKey;
    const secondKey = mockedApi.addItemToTab.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBe('billing-action-1');
    expect(secondKey).toBe('billing-action-2');
    expect(chargesCreated).toBe(2);
  });

  test('a network retry reuses its key and applies the charge once', async () => {
    const processedKeys = new Set<string>();
    let chargesCreated = 0;
    mockedApi.addItemToTab.mockImplementation(async (_tabId, payload) => {
      const key = payload.idempotencyKey!;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        chargesCreated += 1;
        throw Object.assign(new Error('Network request failed.'), {
          cause: Object.assign(new Error('Failed to fetch'), { kind: 'network' }),
        });
      }
      return queueTab;
    });

    render(<BillingPage />);
    await selectQueueTab();
    await userEvent.click(quickAddButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockedApi.addItemToTab).toHaveBeenCalledTimes(2));
    expect(mockedApi.addItemToTab.mock.calls[1][1].idempotencyKey)
      .toBe(mockedApi.addItemToTab.mock.calls[0][1].idempotencyKey);
    expect(chargesCreated).toBe(1);
  });

  test('keeps an insufficient-stock warning visible until dismissed', async () => {
    mockedApi.addItemToTab.mockResolvedValue({
      ...queueTab,
      stockWarning: { itemId: product._id, shortfall: 2 },
    });

    render(<BillingPage />);
    await selectQueueTab();
    await userEvent.click(quickAddButton());

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Insufficient stock: Grip tape was short by 2 units.');
    expect(warning).toHaveTextContent('The charge was completed.');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss stock warning for Grip tape' }));
    expect(screen.queryByText(/Insufficient stock: Grip tape/)).not.toBeInTheDocument();
  });

  test('reservation add sends an idempotency key', async () => {
    mockedApi.addItemToReservationTab.mockResolvedValue(reservationTab);
    render(<BillingPage />);

    await userEvent.click(screen.getByRole('button', { name: /Reservations today/ }));
    await userEvent.click(await screen.findByText('Court Guest'));
    await userEvent.click(quickAddButton());

    await waitFor(() => expect(mockedApi.addItemToReservationTab).toHaveBeenCalledTimes(1));
    expect(mockedApi.addItemToReservationTab.mock.calls[0][1].idempotencyKey).toBe('billing-action-1');
  });

  test('split charge sends a key and reuses it on network retry', async () => {
    mockedApi.getItems.mockResolvedValue([{ ...product, isSplittable: true }]);
    mockedApi.splitItem
      .mockRejectedValueOnce(Object.assign(new Error('Network request failed.'), {
        cause: Object.assign(new Error('Failed to fetch'), { kind: 'network' }),
      }))
      .mockResolvedValueOnce([queueTab]);

    render(<BillingPage />);
    await selectQueueTab();
    await userEvent.click(screen.getAllByRole('button', { name: 'Charge' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Charge ₱2.00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockedApi.splitItem).toHaveBeenCalledTimes(2));
    expect(mockedApi.splitItem.mock.calls[1][0].idempotencyKey)
      .toBe(mockedApi.splitItem.mock.calls[0][0].idempotencyKey);
  });
});
