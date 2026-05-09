// app/(admin)/admin/queue/loading.tsx
export default function QueueLoading() {
    return (
      <div className="w-full font-sans animate-pulse">
        <div className="mb-6 pb-5 border-b border-gray-100">
          <div className="h-2.5 w-16 bg-gray-100 rounded mb-2" />
          <div className="h-7 w-40 bg-gray-200 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="h-2.5 w-20 bg-gray-100 rounded" />
              {[...Array(3)].map((_, j) => (
                <div key={j} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="h-4 w-3/4 bg-gray-100 rounded" />
                  <div className="h-3 w-1/2 bg-gray-100 rounded" />
                  <div className="h-3 w-2/3 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }