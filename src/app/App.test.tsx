import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'

function renderApp() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  )
}

describe('App', () => {
  it('renders the home page by default', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('renders all bottom navigation items', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' })
    for (const label of ['Home', 'Statistik', 'Abrechnungen', 'Verträge', 'Mehr']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(nav).toBeInTheDocument()
  })
})
