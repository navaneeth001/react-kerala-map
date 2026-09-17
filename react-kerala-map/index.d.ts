import type * as L from 'leaflet';
import type { CSSProperties } from 'react';

export type LayerKey = 'districts' | 'assembly' | 'loksabha';

export type SelectionLevel =
  | 'top'
  | 'district'
  | 'assembly'
  | 'loksabha'
  | 'localBody'
  | 'ward';

export interface MapSelection {
  level: SelectionLevel;
  district: string | null;
  secCode: string | null;
  properties: Record<string, unknown> | null;
  localBodyInfo: Record<string, unknown> | null;
}

export interface DataPaths {
  districts?: string;
  loksabha?: string;
  assembly?: string;
  lsgiLookup?: string;
  /** Template path with a `{district}` placeholder. */
  localBodies?: string;
  /** Template path with a `{district}` placeholder. */
  wards?: string;
}

export type PopupType =
  | 'district'
  | 'assembly'
  | 'loksabha'
  | 'localBody'
  | 'ward';

export interface KeralaMapProps {
  /** Base URL that hosts the GeoJSON / lookup data. */
  dataBaseUrl?: string;
  /** Override individual file paths relative to dataBaseUrl. */
  dataPaths?: DataPaths;
  tileUrl?: string;
  tileAttribution?: string;
  initialLayer?: LayerKey;
  /** Which top-level layers to make available. */
  layers?: LayerKey[];
  showLayerControl?: boolean;
  showSearch?: boolean;
  showBrowseSidebar?: boolean;
  showBackButton?: boolean;
  /** Selection highlight colour (alliance colour coding is never applied). */
  highlightColor?: string;
  /**
   * Opt-in (default `false`): show the electoral result data the datasets
   * carry in the built-in popups — winning party and alliance, votes, margins,
   * turnout, constituency codes, reservation and, for local bodies, the
   * ward-wise front tally. Leaving it off keeps the map free of party /
   * alliance information.
   */
  showElectionResults?: boolean;
  /** Return HTML string / element, or null to fall back to the built-in popup. */
  popupRenderer?: (
    type: PopupType,
    properties: Record<string, unknown>,
    localBodyInfo: Record<string, unknown> | null
  ) => string | HTMLElement | null;
  mapOptions?: L.MapOptions;
  onSelectionChange?: (selection: MapSelection) => void;
  onReady?: (payload: {
    map: L.Map;
    lookup: Record<string, Record<string, unknown>>;
    districts: string[];
  }) => void;
  onError?: (error: Error) => void;
  browseSidebarTitle?: string;
  className?: string;
  style?: CSSProperties;
}

export interface KeralaMapRef {
  getMap(): L.Map | null;
  switchToLayer(layer: LayerKey): void;
  /** Resolves `false` when the district has no matching GeoJSON feature. */
  selectDistrict(district: string): Promise<boolean>;
  /**
   * Resolves `false` when the local body has no geometry in the district's
   * local-body GeoJSON (e.g. block / district panchayats).
   */
  selectLocalBody(secKeralaCode: string): Promise<boolean>;
  /** `sec_kerala_code`s with geometry for a district, or `null` if still loading. */
  getAvailableLocalBodyCodes(district: string): string[] | null;
  /** Classify a coordinate within the loaded district; `null` if outside or no data. */
  findDivisionForPointCode(lng: number, lat: number): string | null;
  /** Feature at a coordinate within the loaded district, or `null`. */
  findDivisionForPoint(lng: number, lat: number): GeoJSON.Feature | null;
  goBack(): void;
  search(query: string): void;
}

export declare const KeralaMap: import('react').ForwardRefExoticComponent<
  KeralaMapProps & import('react').RefAttributes<KeralaMapRef>
>;
export default KeralaMap;

export interface KeralaMapControllerOptions {
  dataBaseUrl?: string;
  dataPaths?: DataPaths;
  tileUrl?: string;
  tileAttribution?: string;
  layers?: LayerKey[];
  initialLayer?: LayerKey;
  showLayerControl?: boolean;
  showSearch?: boolean;
  highlightColor?: string;
  /** Opt-in electoral data in the built-in popups (default `false`). */
  showElectionResults?: boolean;
  popupRenderer?: KeralaMapProps['popupRenderer'];
  mapOptions?: L.MapOptions;
  onSelectionChange?: (selection: MapSelection) => void;
  onReady?: KeralaMapProps['onReady'];
  onError?: (error: Error) => void;
  /**
   * Called once a district's local-body GeoJSON has loaded, with the
   * `sec_kerala_code`s that actually have geometry. Kerala publishes no block /
   * district panchayat boundaries, so this lets custom UIs hide or disable
   * selections that cannot be drawn.
   */
  onLocalBodiesLoaded?: (district: string, availableSecKeralaCodes: string[]) => void;
}

export interface KeralaMapController {
  init(): Promise<void>;
  destroy(): void;
  updateOptions(partial: KeralaMapControllerOptions): void;
  getMap(): L.Map | null;
  getLookup(): Record<string, Record<string, unknown>>;
  getDistricts(): string[];
  getLocalBodyTypes(district: string): string[];
  getLocalBodies(
    district: string,
    type?: string
  ): Record<string, unknown>[];
  /** `sec_kerala_code`s with geometry for a district, or `null` if still loading. */
  getAvailableLocalBodyCodes(district: string): string[] | null;
  switchToLayer(layer: LayerKey): void;
  goBack(): void;
  search(query: string): void;
  selectDistrictByName(district: string): Promise<boolean>;
  selectLocalBodyByCode(secKeralaCode: string): Promise<boolean>;
  /** Classify a coordinate within the loaded district; `null` if outside or no data. */
  findDivisionForPointCode(lng: number, lat: number): string | null;
  /** Feature at a coordinate within the loaded district, or `null`. */
  findDivisionForPoint(lng: number, lat: number): GeoJSON.Feature | null;
}

export declare function createKeralaMapController(
  container: HTMLElement,
  options?: KeralaMapControllerOptions
): KeralaMapController;

export declare const DEFAULT_DATA_BASE_URL: string;
export declare const DEFAULT_DATA_PATHS: Required<DataPaths>;

export declare function fetchJson(url: string): Promise<unknown>;
export declare function fetchDataBundle(options: {
  dataBaseUrl?: string;
  dataPaths?: DataPaths;
}): Promise<{
  districts: unknown;
  loksabha: unknown;
  assembly: unknown;
  lsgiLookup: Record<string, Record<string, unknown>>;
}>;

export declare function toDistrictFileName(district: string): string;
export declare function joinUrl(base: string, path: string): string;

export declare function loadDistrictLocalBodies(
  district: string,
  dataBaseUrl?: string,
  dataPaths?: DataPaths
): Promise<GeoJSON.FeatureCollection>;

export declare function loadDistrictWards(
  district: string,
  dataBaseUrl?: string,
  dataPaths?: DataPaths
): Promise<GeoJSON.FeatureCollection>;

/**
 * A client-side point-in-division index over a district's GeoJSON.
 * Used to classify a lat/lng coordinate against local-body boundaries.
 */
export interface DivisionIndex {
  features: Array<{ feature: GeoJSON.Feature; bbox?: [number, number, number, number] }>;
  findDivisionForPoint(lng: number, lat: number): GeoJSON.Feature | null;
  findDivisionForPointCode(lng: number, lat: number): string | null;
  findDivisionIndex(lng: number, lat: number): number;
}

export declare function createDivisionIndex(
  source: GeoJSON.FeatureCollection | GeoJSON.Feature[],
  options?: { codeProperty?: string }
): DivisionIndex;

export declare function geometryBbox(
  geometry: GeoJSON.Geometry | null | undefined
): [number, number, number, number] | null;

export declare function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoJSON.Geometry | null | undefined
): boolean;

/** Options accepted by every built-in popup builder. */
export interface PopupOptions {
  /**
   * Opt-in (default `false`): add the "Election Results" block with the
   * electoral data of the datasets (party, alliance, votes, margins, tally).
   */
  showElectionResults?: boolean;
}

export declare function loksabhaPopupHtml(
  properties: Record<string, unknown>,
  options?: PopupOptions
): string;
export declare function assemblyPopupHtml(
  properties: Record<string, unknown>,
  options?: PopupOptions
): string;
export declare function localBodyPopupHtml(
  info: Record<string, unknown>,
  options?: PopupOptions
): string;
export declare function wardPopupHtml(
  properties: Record<string, unknown>,
  info?: Record<string, unknown> | null,
  options?: PopupOptions
): string;
