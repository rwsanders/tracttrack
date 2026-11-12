import type { MineralReport, Parcel, StateConfig, TaxReport } from '../../shared/types.ts';

/**
 * Everything that differs from state to state lives behind this interface.
 * Adding a state means writing one provider and registering it; flood, soils,
 * elevation and wetlands come from national sources and need no per-state work.
 */
export interface StateProvider {
  config: StateConfig;
  /** Parcels covering a point, smallest first. Empty when nothing is mapped there. */
  parcelsAt(lngLat: [number, number]): Promise<Parcel[]>;
  /** Property tax estimate. Omit when the state has no usable rate data yet. */
  taxes?(parcel: Parcel): Promise<TaxReport>;
  /** Oil, gas and pipeline activity. Omit when the state has no usable source yet. */
  minerals?(parcel: Parcel): Promise<MineralReport>;
}
