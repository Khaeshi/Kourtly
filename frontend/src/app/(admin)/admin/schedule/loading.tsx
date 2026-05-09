// components/skeletons/ScheduleSkeleton.tsx
export default function ScheduleSkeleton() {
    return (
      <div className="w-full font-sans animate-pulse">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-gray-100">
          <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
          <div className="h-7 w-28 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-80 bg-gray-100 rounded" />
        </div>
  
        {/* Weekly defaults section */}
        <div className="mb-3">
          <div className="h-2.5 w-32 bg-gray-100 rounded mb-3" />
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <div className="h-4 w-36 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-48 bg-gray-100 rounded" />
            </div>
            {[...Array(7)].map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4 border-b border-gray-50 last:border-0">
                <div className="w-24 h-4 bg-gray-100 rounded shrink-0" />
                <div className="h-5 w-14 bg-gray-100 rounded-full" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 bg-gray-100 rounded-md" />
                  <div className="h-2.5 w-4 bg-gray-100 rounded" />
                  <div className="h-8 w-24 bg-gray-100 rounded-md" />
                </div>
                <div className="ml-auto h-6 w-36 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
  
        {/* Date blocks section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="h-2.5 w-40 bg-gray-100 rounded mb-1" />
              <div className="h-2.5 w-56 bg-gray-100 rounded" />
            </div>
            <div className="h-8 w-24 bg-gray-200 rounded-lg" />
          </div>
          <div className="py-10 border border-dashed border-gray-200 rounded-xl flex items-center justify-center">
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    );
  }