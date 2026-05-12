import { Skeleton } from '@/app/components/ui/Skeleton'

export default function ProfilesLoading() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-28 rounded" />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-20" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-7 w-12 rounded" />
              <Skeleton className="h-7 w-14 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
