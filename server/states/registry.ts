import type { StateCode } from '../../shared/types.ts';
import { texas } from './tx/index.ts';
import type { StateProvider } from './types.ts';

/** Register a new state here once its provider exists. */
const providers: StateProvider[] = [texas];

export function allProviders(): StateProvider[] {
  return providers;
}

export function providerByCode(code: string): StateProvider | undefined {
  return providers.find((p) => p.config.code === (code as StateCode));
}

/**
 * Picks the state for a point by bounding box. Boxes of neighboring states
 * overlap, so callers should fall through to the next candidate when a
 * provider finds no parcel.
 */
export function providersAt([lng, lat]: [number, number]): StateProvider[] {
  return providers.filter(({ config: { bounds } }) => lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]);
}
