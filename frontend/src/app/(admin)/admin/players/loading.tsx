// app/(admin)/admin/players/loading.tsx
export default function PlayersLoading() {
    return (
      <div className="w-full font-sans animate-pulse">
        <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between">
          <div>
            <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-20 bg-gray-200 rounded" />
          </div>
          <div className="h-8 w-28 bg-gray-100 rounded" />
        </div>
        {/* Filters skeleton */}
        <div className="flex gap-2 mb-5">
          <div className="h-8 w-44 bg-gray-100 rounded-md" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-16 bg-gray-100 rounded-md" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-2.5 w-16 bg-gray-100 rounded" />
            ))}
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4 border-b border-gray-50">
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-100 rounded mb-1" />
                <div className="h-2.5 w-16 bg-gray-50 rounded" />
              </div>
              <div className="h-5 w-8 bg-gray-100 rounded" />
              <div className="h-3 w-12 bg-gray-100 rounded" />
              <div className="h-3 w-8 bg-gray-100 rounded" />
              <div className="flex gap-1 ml-auto">
                <div className="h-6 w-10 bg-gray-100 rounded" />
                <div className="h-6 w-14 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }