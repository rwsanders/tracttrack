import type { OverlayLayer } from '../../../shared/types.ts';
import { exportTiles } from '../../lib/arcgis.ts';
import { nationalOverlays } from '../../national/overlays.ts';
import type { StateProvider } from '../types.ts';
import { marketReport } from './market.ts';
import { mineralReport, RRC, RRC_LAYERS } from './minerals.ts';
import { parcelsAt, TX_PARCELS } from './parcels.ts';
import { taxReport } from './taxes.ts';

const overlays: OverlayLayer[] = [
  {
    id: 'parcels',
    label: 'Parcel lines',
    description: 'County appraisal district boundaries',
    tiles: exportTiles(TX_PARCELS, [0]),
    // Any lower and town lots merge into a solid block of line work.
    minZoom: 12.5,
    defaultOn: true,
    opacity: 1,
    swatch: '#d4af37',
    attribution: 'TxGIO StratMap',
  },
  {
    id: 'wells',
    label: 'Oil & gas wells',
    description: 'Railroad Commission well locations',
    tiles: exportTiles(RRC, [RRC_LAYERS.wellNumbers, RRC_LAYERS.wells, RRC_LAYERS.laterals]),
    minZoom: 11.5,
    defaultOn: false,
    opacity: 1,
    swatch: '#1f2937',
    attribution: 'RRC',
  },
  {
    id: 'pipelines',
    label: 'Pipelines',
    description: 'Permitted oil, gas and product lines',
    tiles: exportTiles(RRC, [RRC_LAYERS.pipelines, RRC_LAYERS.pipelinesSmallScale]),
    minZoom: 9,
    defaultOn: false,
    opacity: 0.9,
    swatch: '#c2410c',
    attribution: 'RRC',
  },
  {
    id: 'surveys',
    label: 'Original surveys',
    description: 'Texas land survey abstracts',
    tiles: exportTiles(RRC, [RRC_LAYERS.surveyAbstractLabels, RRC_LAYERS.surveyLabels, RRC_LAYERS.surveys]),
    minZoom: 11,
    defaultOn: false,
    opacity: 0.85,
    swatch: '#7c5cbf',
    attribution: 'RRC',
  },
  ...nationalOverlays,
];

export const texas: StateProvider = {
  config: {
    code: 'TX',
    name: 'Texas',
    bounds: [-106.65, 25.84, -93.51, 36.5],
    center: [-99.3, 31.3],
    zoom: 5.6,
    overlays,
    sections: ['market', 'taxes', 'minerals', 'flood', 'land'],
    sources: [
      { name: 'Texas Geographic Information Office (TxGIO) StratMap Land Parcels', url: 'https://geographic.texas.gov/' },
      { name: 'Railroad Commission of Texas', url: 'https://www.rrc.texas.gov/' },
      { name: 'Texas Comptroller of Public Accounts', url: 'https://comptroller.texas.gov/taxes/property-tax/' },
    ],
  },
  parcelsAt,
  market: marketReport,
  taxes: taxReport,
  minerals: mineralReport,
};
