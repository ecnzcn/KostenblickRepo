import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HashRouter } from 'react-router-dom'
import { App } from './App'

function renderApp() {
  return render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
}

describe('App', () => {
  it('renders the dashboard on the home route by default', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Kostenblick' })).toBeInTheDocument()
  })

  it('renders all items in the bottom navigation', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' })
    for (const label of ['Home', 'Statistik', 'Abrechnungen', 'Verträge', 'Mehr']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('renders all items in the desktop sidebar navigation', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Seitennavigation' })
    for (const label of ['Home', 'Statistik', 'Abrechnungen', 'Verträge', 'Mehr']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })
})
