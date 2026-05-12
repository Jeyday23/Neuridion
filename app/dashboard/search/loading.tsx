import { Skeleton } from '@/app/components/ui/Skeleton'

export default function SearchLoading() {
  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="w-10 h-10 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-4 w-72 ml-14" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-md border border-zinc-200 p-8">
          <Skeleton className="h-6 w-40 mb-6" />
          {i === 1 ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-16 rounded" />
              ))}
            </div>
          ) : (
            <Skeleton className="h-10 w-full max-w-md rounded" />
          )}
        </div>
      ))}
    </div>
  )
}
