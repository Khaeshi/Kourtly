import { API_BASE, APP_NAME } from '../../lib/config';

describe('config constants', () => {
  test('exports expected API base and app name', () => {
    expect(API_BASE).toBe('/api/proxy');
    expect(APP_NAME).toBe('PlayKou');
  });
});

