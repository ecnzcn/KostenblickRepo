import { Link } from 'react-router-dom'
import type { Tip } from '../../../domain/usecases/finance/tips'

/** Phase 14H: rule-based tips from the month's real data. Renders nothing
 * without a tip - there is no generic filler text. */
export function TipCard({ tips }: { tips: Tip[] }) {
  if (tips.length === 0) return null
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-labelledby="tip-title">
      <h2 id="tip-title" className="flex items-center gap-2 text-base font-semibold text-emerald-900">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
        </svg>
        {tips.length === 1 ? 'Kostenblick-Tipp' : 'Kostenblick-Tipps'}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {tips.map((tip) => (
          <li key={tip.id} className="text-sm text-neutral-800">
            <p>{tip.text}</p>
            {tip.link ? (
              <Link to={tip.link.to} className="inline-flex min-h-11 items-center font-medium text-accent">
                {tip.link.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
