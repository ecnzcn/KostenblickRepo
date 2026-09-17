import { useEffect, useState } from 'react'
import type { Category } from '../domain/models/entities'
import { categoryRepository } from '../domain/repositories/categories'

export function useCategories(): { categories: Category[]; loading: boolean } {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    categoryRepository.getAll().then((result) => {
      if (cancelled) return
      setCategories(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, loading }
}
