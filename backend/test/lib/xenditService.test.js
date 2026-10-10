import {
  getXenditMode,
  isValidXenditWebhookUrl,
  parseManagedAccountList,
} from '../../src/services/xenditService.js';

describe('Xendit account and configuration helpers', () => {
  test('parses only one case-insensitive Managed account match', () => {
    const account = { id: 'account-1', email: 'Owner@Example.com', type: 'MANAGED', status: 'INVITED' };
    expect(parseManagedAccountList({ data: [account], has_more: false }, 'owner@example.com')).toEqual(account);
    expect(parseManagedAccountList({ data: [], has_more: false }, 'owner@example.com')).toBeNull();
  });

  test('fails closed on malformed, paginated, or ambiguous account lists', () => {
    expect(() => parseManagedAccountList({ data: {}, has_more: false }, 'owner@example.com')).toThrow();
    expect(() => parseManagedAccountList({ data: [], has_more: true }, 'owner@example.com')).toThrow();
    expect(() => parseManagedAccountList({
      has_more: false,
      data: [
        { id: 'account-1', email: 'owner@example.com', type: 'MANAGED' },
        { id: 'account-2', email: 'OWNER@example.com', type: 'MANAGED' },
      ],
    }, 'owner@example.com')).toThrow();
  });

  test('derives mode from supported Xendit secret-key prefixes', () => {
    expect(getXenditMode('xnd_development_example')).toBe('development');
    expect(getXenditMode('xnd_production_example')).toBe('production');
    expect(getXenditMode('')).toBeNull();
    expect(() => getXenditMode('invalid-key')).toThrow(/unsupported prefix/i);
  });

  test('accepts only the public HTTPS invoice-webhook URL without an explicit port', () => {
    expect(isValidXenditWebhookUrl('https://api.example.com/api/payments/xendit/webhook')).toBe(true);
    expect(isValidXenditWebhookUrl('http://api.example.com/api/payments/xendit/webhook')).toBe(false);
    expect(isValidXenditWebhookUrl('https://api.example.com:443/api/payments/xendit/webhook')).toBe(false);
    expect(isValidXenditWebhookUrl('https://localhost/api/payments/xendit/webhook')).toBe(false);
    expect(isValidXenditWebhookUrl('https://api.example.com/other')).toBe(false);
  });
});
