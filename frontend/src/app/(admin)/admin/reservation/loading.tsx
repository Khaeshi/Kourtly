
export default function ReservationSkeleton() {
    return (
      <div className="w-full font-sans animate-pulse">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-gray-100 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-36 bg-gray-200 rounded" />
          </div>
          <div className="flex gap-5">
            <div className="text-right">
              <div className="h-2.5 w-14 bg-gray-100 rounded mb-1" />
              <div className="h-7 w-8 bg-gray-100 rounded" />
            </div>
            <div className="text-right">
              <div className="h-2.5 w-14 bg-gray-100 rounded mb-1" />
              <div className="h-7 w-8 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
  
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="h-8 w-36 bg-gray-100 rounded-md" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-100 rounded-md" />
          ))}
        </div>
  
        {/* Date group */}
        <div className="flex items-center gap-3 mb-3">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="flex-1 h-px bg-gray-100" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
  
        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="hidden md:flex px-5 py-2.5 border-b border-gray-100 bg-gray-50 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-2.5 w-16 bg-gray-100 rounded" />
            ))}
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4 border-b border-gray-50">
              <div className="h-3 w-12 bg-gray-100 rounded" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-gray-100 rounded mb-1" />
                <div className="h-2.5 w-20 bg-gray-50 rounded" />
              </div>
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="h-3 w-6 bg-gray-100 rounded" />
              <div className="h-5 w-20 bg-gray-100 rounded-full" />
              <div className="flex gap-1.5 ml-auto">
                <div className="h-6 w-10 bg-gray-100 rounded" />
                <div className="h-6 w-6 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

