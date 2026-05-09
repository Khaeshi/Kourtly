// app/(admin)/admin/billing/loading.tsx
export default function BillingLoading() {
    return (
      <div className="w-full font-sans animate-pulse">
        <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between">
          <div>
            <div className="h-2.5 w-16 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
          </div>
          <div className="h-8 w-28 bg-gray-100 rounded" />
        </div>
        {/* View toggle skeleton */}
        <div className="flex gap-1.5 mb-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-7 w-28 bg-gray-100 rounded-md" />
          ))}
        </div>
        {/* Tab cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <div className="h-4 w-8 bg-gray-100 rounded" />
                <div className="h-4 flex-1 bg-gray-100 rounded" />
                <div className="h-4 w-12 bg-gray-100 rounded" />
              </div>
              <div className="h-3 w-full bg-gray-50 rounded" />
              <div className="h-3 w-2/3 bg-gray-50 rounded" />
              <div className="h-7 w-full bg-gray-100 rounded mt-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }