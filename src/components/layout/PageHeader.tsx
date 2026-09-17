interface PageHeaderProps {
  title: string
  subtitle?: string
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="break-words text-3xl font-semibold tracking-tight text-neutral-900 lg:text-4xl">
        {title}
      </h1>
      {subtitle ? <p className="mt-1 break-words text-sm text-neutral-500">{subtitle}</p> : null}
    </header>
  )
}
