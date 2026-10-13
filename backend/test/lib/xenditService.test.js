import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import {
  getXenditInvoice,
  getXenditMode,
  isValidXenditWebhookUrl,
  isSubAccountWebhookAuthorized,
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

  test('authorizes a sub-account callback by comparing the token SHA-256 hash', () => {
    const token = 'court-specific-callback-token';
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    expect(isSubAccountWebhookAuthorized(token, hash)).toBe(true);
    expect(isSubAccountWebhookAuthorized('wrong-token', hash)).toBe(false);
    expect(isSubAccountWebhookAuthorized(token, 'not-a-hash')).toBe(false);
  });

  test('reconfirms invoices with a sub-account header only when an account ID is supplied', async () => {
    const previousKey = process.env.XENDIT_SECRET_KEY;
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'invoice-1', status: 'PAID' }),
    });
    try {
      await getXenditInvoice('invoice/1', 'sub-account-1');
      expect(fetchSpy.mock.calls[0][0]).toContain('/v2/invoices/invoice%2F1');
      expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe('sub-account-1');

      await getXenditInvoice('master-invoice');
      expect(fetchSpy.mock.calls[1][1].headers).not.toHaveProperty('for-user-id');
    } finally {
      fetchSpy.mockRestore();
      if (previousKey === undefined) delete process.env.XENDIT_SECRET_KEY;
      else process.env.XENDIT_SECRET_KEY = previousKey;
    }
  });
});
