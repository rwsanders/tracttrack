import type { OverlayLayer } from '../../shared/types.ts';
import { exportTiles } from '../lib/arcgis.ts';
import { NFHL_FLOOD_ZONES_LAYER } from './flood.ts';

/** Map overlays that cover the whole country and so apply to every state. */
export const nationalOverlays: OverlayLayer[] = [
  {
    id: 'flood',
    label: 'Flood zones',
    description: 'FEMA regulatory flood hazard areas',
    tiles: exportTiles('https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer', [NFHL_FLOOD_ZONES_LAYER]),
    minZoom: 10,
    defaultOn: false,
    opacity: 0.55,
    swatch: '#3b82c4',
    attribution: 'FEMA NFHL',
  },
  {
    id: 'wetlands',
    label: 'Wetlands',
    description: 'National Wetlands Inventory',
    tiles: exportTiles('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer', [0]),
    minZoom: 11,
    defaultOn: false,
    opacity: 0.6,
    swatch: '#2f9e7a',
    attribution: 'USFWS NWI',
  },
];
