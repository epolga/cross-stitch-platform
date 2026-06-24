import type {
  PatternMaterials,
  ProductCatalog,
  ResolvedMaterial,
  ResolvedMaterialLink,
  MaterialType,
} from '@/app/types/affiliate';
import materialsJson from '@/data/affiliate/materials.json';
import catalogJson from '@/data/affiliate/product-catalog.json';

const materialsData = materialsJson as Record<string, PatternMaterials>;
const productCatalog = catalogJson as ProductCatalog;

export function getMaterialsForDesign(designId: number): PatternMaterials | null {
  return materialsData[String(designId)] ?? null;
}

function appendParam(baseUrl: string, key: string, value: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(key, value);
  return url.toString();
}

function buildStoreLinks(
  materialKey: string,
  displayLabel: string,
): ResolvedMaterialLink[] {
  const entry = productCatalog[materialKey];
  if (!entry) return [];

  const amazonTag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
  const lovecraftsId = process.env.NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_ID;
  const links: ResolvedMaterialLink[] = [];

  if (amazonTag && entry.stores.amazon) {
    links.push({
      store: 'amazon',
      href: appendParam(entry.stores.amazon.url, 'tag', amazonTag),
      label: `Buy ${displayLabel} on Amazon`,
      linkType: 'exact_product',
      productId: entry.stores.amazon.productId,
    });
  }

  if (lovecraftsId && entry.stores.lovecrafts) {
    links.push({
      store: 'lovecrafts',
      href: appendParam(entry.stores.lovecrafts.url, 'affiliate_id', lovecraftsId),
      label: `Buy ${displayLabel} on LoveCrafts`,
      linkType: 'exact_product',
      productId: entry.stores.lovecrafts.productId,
    });
  }

  return links;
}

export function resolveMaterials(designId: number): ResolvedMaterial[] {
  const materials = getMaterialsForDesign(designId);
  if (!materials) return [];

  const resolved: ResolvedMaterial[] = [];

  for (const floss of materials.floss ?? []) {
    const displayName = floss.name
      ? `${floss.brand} ${floss.code} ${floss.name}`
      : `${floss.brand} ${floss.code}`;
    const required = `${floss.skeins} skein${floss.skeins !== 1 ? 's' : ''}`;
    const materialKey = `${floss.brand.toLowerCase()}:${floss.code}`;

    resolved.push({
      label: displayName,
      required,
      materialType: 'floss' as MaterialType,
      materialBrand: floss.brand,
      materialCode: floss.code,
      materialName: floss.name,
      links: buildStoreLinks(materialKey, displayName),
    });
  }

  if (materials.fabric) {
    const f = materials.fabric;
    const displayName = `${f.color} ${f.type} ${f.count} ct`;
    const required = `${f.requiredWidthCm} × ${f.requiredHeightCm} cm`;
    const materialKey = `fabric:${f.type.toLowerCase()}-${f.count}ct`;

    resolved.push({
      label: displayName,
      required,
      materialType: 'fabric' as MaterialType,
      links: buildStoreLinks(materialKey, displayName),
    });
  }

  if (materials.needle) {
    const n = materials.needle;
    const displayName = `${n.type} needle No. ${n.size}`;
    const required = String(n.quantity);
    const materialKey = `needle:${n.type.toLowerCase()}-${n.size}`;

    resolved.push({
      label: displayName,
      required,
      materialType: 'needle' as MaterialType,
      links: buildStoreLinks(materialKey, displayName),
    });
  }

  if (materials.hoop) {
    const h = materials.hoop;
    const displayName = `${h.recommendedDiameterCm} cm hoop`;
    const required = String(h.quantity);
    const materialKey = `hoop:${h.recommendedDiameterCm}cm`;

    resolved.push({
      label: displayName,
      required,
      materialType: 'hoop' as MaterialType,
      links: buildStoreLinks(materialKey, displayName),
    });
  }

  return resolved;
}
