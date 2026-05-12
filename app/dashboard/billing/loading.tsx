import { Skeleton } from '@/app/components/ui/Skeleton'

export default function BillingLoading() {
  return (
    <div className="p-8 max-w-2xl">
      <Skeleton className="h-7 w-24 mb-6" />
      <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-full rounded-full mt-4" />
        <Skeleton className="h-10 w-40 rounded-lg mt-4" />
      </div>
    </div>
  )
}
