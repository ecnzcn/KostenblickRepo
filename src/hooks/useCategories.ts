import { useEffect, useState } from 'react'
import type { Category } from '../domain/models/entities'
import { categoryRepository } from '../domain/repositories/categories'

/** Cost-side categories for bills, costs and contracts - income categories
 * (Gehalt, …) only exist for bank bookings. */
export function useCategories(): { categories: Category[]; loading: boolean } {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    categoryRepository.getAll().then((result) => {
      if (cancelled) return
      setCategories(result.filter((category) => category.type !== 'income'))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, loading }
}
