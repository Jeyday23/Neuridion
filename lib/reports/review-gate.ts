export function isReportApproved(reviewStatus: string | null | undefined): boolean {
  return reviewStatus === 'approved'
}
