/**
 * @jest-environment node
 */
import { GET } from '@/app/api/debug/route';
import { auth } from '@/auth';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

describe('GET /api/debug', () => {
  test('returns current session payload', async () => {
    const fakeSession = { user: { email: 'debug@test.com', role: 'admin' } };
    mockedAuth.mockResolvedValue(fakeSession as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session).toEqual(fakeSession);
  });
});

