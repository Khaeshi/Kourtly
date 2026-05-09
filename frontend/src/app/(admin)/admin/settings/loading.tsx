// components/skeletons/SettingsSkeleton.tsx
export default function SettingsSkeleton() {
    return (
      <div className="max-w-[760px] font-sans space-y-6 animate-pulse">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4 pb-5 border-b border-gray-100">
          <div>
            <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-40 bg-gray-200 rounded" />
          </div>
          <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        </div>
  
        {/* Branding section */}
        <SectionSkeleton title rows={0}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
            <div>
              <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
              <div className="h-7 w-28 bg-gray-100 rounded-md" />
            </div>
          </div>
          <FieldSkeleton wide />
          <FieldSkeleton wide tall />
          <div>
            <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        </SectionSkeleton>
  
        {/* Sports & Courts */}
        <SectionSkeleton title rows={0}>
          <FieldSkeleton label="Sports Offered">
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-9 w-24 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </FieldSkeleton>
          <FieldSkeleton label="Number of Courts">
            <div className="flex gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-11 h-11 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </FieldSkeleton>
          <FieldSkeleton wide />
        </SectionSkeleton>
  
        {/* Location */}
        <SectionSkeleton title rows={0}>
          <FieldSkeleton wide />
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </SectionSkeleton>
  
        {/* Contact */}
        <SectionSkeleton title rows={0}>
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <FieldSkeleton wide />
        </SectionSkeleton>
  
        {/* Subscription */}
        <SectionSkeleton title rows={0}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-16 bg-gray-100 rounded mb-1" />
                <div className="h-4 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </SectionSkeleton>
      </div>
    );
  }
  
  // Small internal helpers — keeps the skeleton DRY
  function SectionSkeleton({
    title, rows = 3, children,
  }: {
    title?: boolean; rows?: number; children?: React.ReactNode;
  }) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {children}
          {[...Array(rows)].map((_, i) => (
            <FieldSkeleton key={i} wide={i % 2 === 0} />
          ))}
        </div>
      </div>
    );
  }
  
  function FieldSkeleton({
    wide, tall, label, children,
  }: {
    wide?: boolean; tall?: boolean; label?: string; children?: React.ReactNode;
  }) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-2.5 w-20 bg-gray-100 rounded" />
        {children ?? (
          <div className={`bg-gray-100 rounded-lg ${wide ? 'w-full' : 'w-48'} ${tall ? 'h-20' : 'h-9'}`} />
        )}
      </div>
    );
  }