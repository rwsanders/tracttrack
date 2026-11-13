import type { MarketReport, MineralReport, Parcel, StateConfig, TaxReport } from '../../shared/types.ts';

/**
 * Everything that differs from state to state lives behind this interface.
 * Adding a state means writing one provider and registering it; flood, soils,
 * elevation and wetlands come from national sources and need no per-state work.
 */
export interface StateProvider {
  config: StateConfig;
  /** Parcels covering a point, smallest first. Empty when nothing is mapped there. */
  parcelsAt(lngLat: [number, number]): Promise<Parcel[]>;
  /** Appraised value compared with similar parcels nearby. Omit when neighbors cannot be read. */
  market?(parcel: Parcel): Promise<MarketReport>;
  /** Property tax estimate. Omit when the state has no usable rate data yet. */
  taxes?(parcel: Parcel): Promise<TaxReport>;
  /** Oil, gas and pipeline activity. Omit when the state has no usable source yet. */
  minerals?(parcel: Parcel): Promise<MineralReport>;
}
