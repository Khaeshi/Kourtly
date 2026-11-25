import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductPanel from '@/app/components/admin/ProductPanel';
import type { CatalogItem } from '@/lib/api';

const trackedItem: CatalogItem = {
  _id: 'item-1',
  name: 'Grip tape',
  price: 2,
  category: 'equipment',
  isActive: true,
  isSplittable: false,
  trackStock: true,
  stockOnHand: 7,
};

function renderPanel(offline: boolean) {
  return render(
    <ProductPanel
      items={[trackedItem]}
      targetName="Queue player"
      qty={{}}
      onQty={jest.fn()}
      onAdd={jest.fn()}
      addingId={null}
      offline={offline}
    />,
  );
}

describe('ProductPanel stock display', () => {
  test('shows in-stock quantity in quick add and the product drawer while online', async () => {
    renderPanel(false);

    expect(screen.getAllByText('In stock')).not.toHaveLength(0);
    expect(screen.getAllByText('7')).not.toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Browse all products' }));
    expect(screen.getAllByText('In stock')).toHaveLength(2);
  });

  test('hides stock values from quick add and the drawer offline', async () => {
    renderPanel(true);

    expect(screen.queryByText('In stock')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Browse all products' }));
    expect(screen.queryByText('In stock')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  test('does not show stock for fees or services', () => {
    render(
      <ProductPanel
        items={[
          { ...trackedItem, _id: 'fee-1', name: 'Court fee', category: 'court fee' },
          { ...trackedItem, _id: 'service-1', name: 'Stringing', category: 'service' },
        ]}
        targetName="Queue player"
        qty={{}}
        onQty={jest.fn()}
        onAdd={jest.fn()}
        addingId={null}
        offline={false}
      />,
    );

    expect(screen.queryByText('In stock')).not.toBeInTheDocument();
  });
});
