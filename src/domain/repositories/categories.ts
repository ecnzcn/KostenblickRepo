import type { Category } from '../models/entities'
import { STORE_NAMES } from '../../database/schema'
import { IndexedDBSimpleRepository } from '../../database/repository'

export const categoryRepository = new IndexedDBSimpleRepository<Category, 'categories'>(STORE_NAMES.categories)
