import type { EntityMap, EntityType, PersistedEntity, SyncableEntity } from '../models/entities'

export interface Repository<T extends PersistedEntity> {
  getById(id: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: string): Promise<void>
}

export interface SyncableRepository<T extends SyncableEntity> extends Repository<T> {
  getAllIncludingDeleted(): Promise<T[]>
}

export type SyncableEntityType = Exclude<EntityType, 'categories'>

export type RepositoryMap = {
  [K in SyncableEntityType]: SyncableRepository<EntityMap[K]>
}
