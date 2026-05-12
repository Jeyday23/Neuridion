import { Skeleton } from '@/app/components/ui/Skeleton'

export default function ArchiveLoading() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
