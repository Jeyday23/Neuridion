import { Skeleton } from '@/app/components/ui/Skeleton'

export default function RunDetailLoading() {
  return (
    <div className="p-8">
      <Skeleton className="h-7 w-64 mb-2" />
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="rounded-md border border-zinc-200 bg-white p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-32" /></div>
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-24" /></div>
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-20" /></div>
        </div>
      </div>
      <div className="flex gap-2 border-b border-zinc-200 mb-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}
