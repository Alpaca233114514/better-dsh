import { z } from 'zod';
import { storedSchema, routeSchema, childSchema, type Stored } from './contracts';

export const modeRecord = z.object({ enabled: z.boolean(), route: routeSchema.nullable() }).strict();
export const managedRecord = z.object({ effort: z.string().min(1) }).strict();

export function initialState(inheritedEventCount = 0): Stored {
  return { inheritedEventCount, revision: -1, enabled: false, route: null, managed: false, effort: null, children: [] };
}

export function fold(state: Stored, event: { seq: number; type: string; data: unknown }): Stored {
  // 分支不继承原会话的代理所有权与模式。 Forks start with their own mode and child ownership.
  if (event.seq < state.inheritedEventCount) return state;
  if (event.type === 'plugin:ultra/mode') {
    const value = modeRecord.safeParse(event.data);
    return value.success ? { ...state, ...value.data, revision: event.seq } : state;
  }
  if (event.type === 'plugin:ultra/managed') {
    const value = managedRecord.safeParse(event.data);
    return value.success ? { ...state, managed: true, effort: value.data.effort, revision: event.seq } : state;
  }
  if (event.type === 'plugin:ultra/child') {
    const value = childSchema.safeParse(event.data);
    if (!value.success) return state;
    const previous = state.children.find(c => c.id === value.data.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(value.data)) return state;
    return { ...state, revision: event.seq, children: previous ? state.children.map(c => c.id === value.data.id ? value.data : c) : [...state.children, value.data] };
  }
  if (event.type === 'model/selection' && state.enabled) return { ...state, revision: event.seq, enabled: false, route: null };
  return state;
}

export const projection = {
  key: 'dshUltra', stateVersion: 1, stateSchema: storedSchema,
  init: (_header: unknown, inheritedEventCount: number) => initialState(inheritedEventCount), apply: fold,
  wire: { viewSchema: storedSchema, view: (state: Stored) => state },
};
