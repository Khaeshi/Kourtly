// app/(admin)/admin/items/loading.tsx
export default function ItemsLoading() {
    return (
      <div className="w-full font-sans animate-pulse">
        <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between">
          <div>
            <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-28 bg-gray-200 rounded" />
          </div>
          <div className="h-8 w-24 bg-gray-100 rounded" />
        </div>
        {/* Category filter tabs */}
        <div className="flex gap-1.5 mb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-7 w-16 bg-gray-100 rounded-md" />
          ))}
        </div>
        {/* Item groups */}
        {[...Array(2)].map((_, g) => (
          <div key={g} className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50">
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4 border-b border-gray-50">
                <div className="flex-1 h-4 bg-gray-100 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-8 bg-gray-100 rounded" />
                <div className="flex gap-1 ml-auto">
                  <div className="h-6 w-10 bg-gray-100 rounded" />
                  <div className="h-6 w-10 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }