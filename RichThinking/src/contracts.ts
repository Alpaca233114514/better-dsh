/** Narrow structural faces of the public DSH 0.2.1-alpha.2 services we consume.
 * Kept local so installing the plugin does not pull another DSH/React runtime.
 * See docs/investigation.md for the exact upstream definitions and contract tests.
 */
import type { ComponentType } from 'react'
export interface Observable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
export interface ConfigSnapshot<T> {
  status: string
  value?: T
  writable: boolean
  revision?: number
}
export interface ConfigForm<T> extends Observable<ConfigSnapshot<T>> {
  mutate(ops: { op: 'set'; path: string[]; value: unknown }[], expectedRevision?: number): Promise<boolean>
}
export interface ClientContext {
  effect(callback: () => (() => void)): unknown
  configForms: { get<T>(id: string): ConfigForm<T> }
  slots: {
    inject(name: string, callback: () => unknown): unknown
    register(options: { name: string; id?: string; key?: string }, component: ComponentType): () => void
  }
}
export interface HostContext {
  fiber: unknown
  inject(names: string[], callback: (ctx: {
    effect(callback: () => (() => void)): unknown
    settings: { configure(options: { auto: boolean }, owner: unknown): () => void }
  }) => void): unknown
}
