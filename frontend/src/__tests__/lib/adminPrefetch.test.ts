import {
  buildAdminPrefetchRequests,
  getReservationPrefetchWindow,
} from '@/lib/adminPrefetch';

describe('admin prefetch requests', () => {
  test('includes queue history and all items for the matching capabilities', () => {
    const urls = buildAdminPrefetchRequests({
      queue: true,
      itemTabs: true,
      booking: false,
    }, new Date(2026, 9, 6)).map(request => request.url);

    expect(urls).toContain('/queue/history');
    expect(urls).toContain('/items/all');
  });

  test('builds the reservation window from the device local calendar date', () => {
    const localToday = new Date(2026, 9, 6, 23, 30);

    expect(getReservationPrefetchWindow(localToday)).toEqual({
      dateFrom: '2026-09-29',
      dateTo: '2026-11-05',
    });
  });
});
