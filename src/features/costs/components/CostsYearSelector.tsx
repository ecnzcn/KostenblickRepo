interface CostsYearSelectorProps {
  years: number[]
  selectedYear: number
  onChange: (year: number) => void
}

export function CostsYearSelector({ years, selectedYear, onChange }: CostsYearSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="costs-year" className="text-sm text-neutral-500">
        Jahr
      </label>
      <select
        id="costs-year"
        value={selectedYear}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-900"
      >
        {years.length === 0 ? <option value={selectedYear}>{selectedYear}</option> : null}
        {years
          .slice()
          .sort((a, b) => b - a)
          .map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
      </select>
    </div>
  )
}
