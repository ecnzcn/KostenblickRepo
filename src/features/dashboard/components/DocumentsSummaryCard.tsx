import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import type { DocumentsSummary } from '../dashboard.types'

interface DocumentsSummaryCardProps {
  summary: DocumentsSummary
}

export function DocumentsSummaryCard({ summary }: DocumentsSummaryCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Dokumente</h2>
      {summary.total === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine Dokumente vorhanden.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-lg font-semibold text-neutral-900">{summary.total} Dokumente</p>
          {summary.needsReview > 0 ? (
            <p className="text-sm text-amber-700">{summary.needsReview} benötigen Prüfung</p>
          ) : null}
        </div>
      )}
      <Link to={ROUTES.documents} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
        Alle Dokumente
      </Link>
    </section>
  )
}
