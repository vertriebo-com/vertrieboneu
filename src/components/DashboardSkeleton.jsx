import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-8 max-w-5xl mx-auto animate-pulse">

      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 rounded-xl" />
          <Skeleton className="h-4 w-44 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-8 rounded-xl mt-1" />
      </div>

      {/* Primary Action */}
      <Skeleton className="h-[88px] rounded-2xl w-full" />

      {/* KPI-Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="w-8 h-8 rounded-xl" />
            </div>
            <Skeleton className="h-7 w-10 rounded" />
          </div>
        ))}
      </div>

      {/* 2-Spalten Arbeitsbereich */}
      <div className="grid lg:grid-cols-2 gap-5">
        {[1, 2].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(j => (
                <div key={j} className="flex items-center gap-3 py-2">
                  <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                  <Skeleton className="w-16 h-5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <div className="p-4 grid grid-cols-3 md:grid-cols-6 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center p-3 rounded-xl border border-slate-200">
              <Skeleton className="w-2 h-2 rounded-full mb-2" />
              <Skeleton className="h-6 w-8 mb-1 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}