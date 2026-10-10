import { Skeleton } from '@/app/components/ui/Skeleton'

export default function ReviewInboxLoading() {
  return (
    <div className="p-8" role="status" aria-label="Loading review inbox">
      <div className="mb-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading review inbox</span>
    </div>
  )
}
