export interface FlossRequirement {
  brand: string;
  code: string;
  name?: string;
  skeins: number;
  strands?: number;
  metersRequired?: number;
  notes?: string;
}

export interface FabricRequirement {
  type: string;
  count: number;
  color: string;
  requiredWidthCm: number;
  requiredHeightCm: number;
  notes?: string;
}

export interface NeedleRequirement {
  type: string;
  size: number;
  quantity: number;
}

export interface HoopRequirement {
  recommendedDiameterCm: number;
  quantity: number;
}

export interface PatternMaterials {
  floss?: FlossRequirement[];
  fabric?: FabricRequirement;
  needle?: NeedleRequirement;
  hoop?: HoopRequirement;
}

export interface StoreProduct {
  productId: string;
  url: string;
}

export interface CatalogEntry {
  brand: string;
  code: string;
  stores: {
    amazon?: StoreProduct;
    lovecrafts?: StoreProduct;
  };
}

export type ProductCatalog = Record<string, CatalogEntry>;
export type MaterialsData = Record<string, PatternMaterials>;

export type LinkType = 'exact_product' | 'store_search' | 'general_store';
export type MaterialType = 'floss' | 'fabric' | 'needle' | 'hoop' | 'frame' | 'organizer' | 'general_supply';

export interface ResolvedMaterialLink {
  store: 'amazon' | 'lovecrafts';
  href: string;
  label: string;
  linkType: LinkType;
  productId?: string;
}

export interface ResolvedMaterial {
  label: string;
  required: string;
  materialType: MaterialType;
  materialBrand?: string;
  materialCode?: string;
  materialName?: string;
  links: ResolvedMaterialLink[];
}
