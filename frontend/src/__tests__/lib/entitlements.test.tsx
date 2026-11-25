import { render, screen } from '@testing-library/react';
import { CapabilityGate, CapabilitiesProvider } from '@/lib/entitlements';

const mockUsePathname = jest.fn();
const mockProxyFetch = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/lib/api', () => ({
  proxyFetch: (...args: unknown[]) => mockProxyFetch(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/admin/count-stock');
});

describe('Count Stock entitlement', () => {
  test('requires the item_tabs module for direct route access', async () => {
    mockProxyFetch.mockResolvedValue({
      tier: 'basic',
      currentTier: 'basic',
      modules: { booking: true, queue: true, item_tabs: false },
    });

    render(
      <CapabilitiesProvider>
        <CapabilityGate><p>Count Stock content</p></CapabilityGate>
      </CapabilitiesProvider>,
    );

    expect(await screen.findByText('This tool is not in your current tier.')).toBeInTheDocument();
    expect(screen.queryByText('Count Stock content')).not.toBeInTheDocument();
  });

  test('renders the page when item_tabs is enabled', async () => {
    mockProxyFetch.mockResolvedValue({
      tier: 'standard',
      currentTier: 'standard',
      modules: { booking: true, queue: true, item_tabs: true },
    });

    render(
      <CapabilitiesProvider>
        <CapabilityGate><p>Count Stock content</p></CapabilityGate>
      </CapabilitiesProvider>,
    );

    expect(await screen.findByText('Count Stock content')).toBeInTheDocument();
  });
});
