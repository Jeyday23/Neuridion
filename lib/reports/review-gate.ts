export function isReportApproved(reviewStatus: string | null | undefined): boolean {
  return reviewStatus === 'approved'
}

/**
 * Artifacts older than the current format lack content later releases made
 * mandatory: v1 had no final human adjudication; v2 had no reviewer/approver
 * attribution, input-currency or previous-cycle sections. Regenerate them.
 */
export function isCurrentReportArtifact(path: string | null | undefined): boolean {
  return typeof path === 'string' && /\/\d+_v3_report\.(html|pdf|xlsx|docx)$/.test(path)
}

export function isReportReleaseAuthorized(
  reviewStatus: string | null | undefined,
  reviewedBy: string | null | undefined,
  reviewedAt: string | null | undefined,
): boolean {
  return reviewStatus === 'approved'
    && Boolean(reviewedBy)
    && Boolean(reviewedAt)
    && !Number.isNaN(Date.parse(reviewedAt!))
}
