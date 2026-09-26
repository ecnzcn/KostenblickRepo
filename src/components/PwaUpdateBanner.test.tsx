import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PwaUpdateBanner } from './PwaUpdateBanner'

describe('PwaUpdateBanner', () => {
  it('renders nothing when no update is available', () => {
    const { container } = render(
      <PwaUpdateBanner needRefresh={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the update hint with both actions when an update is available', () => {
    render(<PwaUpdateBanner needRefresh={true} onUpdate={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Neue Version verfügbar')).toBeInTheDocument()
    expect(screen.getByText('Kostenblick kann aktualisiert werden.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Später' })).toBeInTheDocument()
  })

  it('calls onDismiss and only onDismiss when "Später" is clicked', () => {
    const onUpdate = vi.fn()
    const onDismiss = vi.fn()
    render(<PwaUpdateBanner needRefresh={true} onUpdate={onUpdate} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Später' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('calls onUpdate and switches to a distinct "updating" state when "Jetzt aktualisieren" is clicked', async () => {
    let resolveUpdate: () => void = () => undefined
    const onUpdate = vi.fn(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
    render(<PwaUpdateBanner needRefresh={true} onUpdate={onUpdate} onDismiss={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    // Distinct from "update available" - the user can tell an update is
    // actually in progress, not just offered.
    expect(await screen.findByText('Kostenblick wird aktualisiert …')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wird aktualisiert …' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Später' })).toBeDisabled()

    resolveUpdate()
  })

  it('never renders two hints at once - a single needRefresh=true only ever shows one', () => {
    render(<PwaUpdateBanner needRefresh={true} onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getAllByText('Neue Version verfügbar')).toHaveLength(1)
  })
})
