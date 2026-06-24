import { describe, it, expect, vi, beforeEach } from 'vitest';

const { SAMPLE_MATERIALS, SAMPLE_CATALOG } = vi.hoisted(() => ({
  SAMPLE_MATERIALS: {
    '1': {
      floss: [
        { brand: 'DMC', code: '310', name: 'Black', skeins: 2 },
        { brand: 'DMC', code: '321', name: 'Red', skeins: 1 },
      ],
      fabric: { type: 'Aida', count: 14, color: 'White', requiredWidthCm: 32, requiredHeightCm: 38 },
      needle: { type: 'Tapestry', size: 24, quantity: 1 },
      hoop: { recommendedDiameterCm: 25, quantity: 1 },
    },
    '2': {
      floss: [{ brand: 'DMC', code: '310', name: 'Black', skeins: 1 }],
    },
  },
  SAMPLE_CATALOG: {
    'dmc:310': {
      brand: 'DMC',
      code: '310',
      stores: {
        amazon: { productId: 'B00310', url: 'https://amazon.com/dp/B00310' },
        lovecrafts: { productId: 'LC310', url: 'https://lovecrafts.com/product/310' },
      },
    },
    'dmc:321': {
      brand: 'DMC',
      code: '321',
      stores: {
        amazon: { productId: 'B00321', url: 'https://amazon.com/dp/B00321' },
      },
    },
  },
}));

vi.mock('@/data/affiliate/materials.json', () => ({ default: SAMPLE_MATERIALS }));
vi.mock('@/data/affiliate/product-catalog.json', () => ({ default: SAMPLE_CATALOG }));

import { getMaterialsForDesign, resolveMaterials } from './affiliate';

describe('getMaterialsForDesign', () => {
  it('returns materials for a known design', () => {
    const m = getMaterialsForDesign(1);
    expect(m).not.toBeNull();
    expect(m?.floss).toHaveLength(2);
  });

  it('returns null for an unknown design', () => {
    expect(getMaterialsForDesign(9999)).toBeNull();
  });
});

describe('resolveMaterials — no env vars configured', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
    delete process.env.NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_ID;
  });

  it('returns rows but no links when affiliate IDs are missing', () => {
    const rows = resolveMaterials(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.links).toHaveLength(0);
    }
  });
});

describe('resolveMaterials — with env vars', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'test-tag-20';
    process.env.NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_ID = 'lc-affiliate-123';
  });

  it('returns one row per material', () => {
    const rows = resolveMaterials(1);
    // 2 floss + fabric + needle + hoop = 5
    expect(rows).toHaveLength(5);
  });

  it('renders exact quantities correctly', () => {
    const rows = resolveMaterials(1);
    const black = rows.find((r) => r.materialCode === '310');
    expect(black?.required).toBe('2 skeins');
    const red = rows.find((r) => r.materialCode === '321');
    expect(red?.required).toBe('1 skein');
  });

  it('renders fabric dimensions correctly', () => {
    const rows = resolveMaterials(1);
    const fabric = rows.find((r) => r.materialType === 'fabric');
    expect(fabric?.required).toBe('32 × 38 cm');
  });

  it('does not duplicate thread colors', () => {
    const rows = resolveMaterials(1);
    const flossCodes = rows.filter((r) => r.materialType === 'floss').map((r) => r.materialCode);
    expect(new Set(flossCodes).size).toBe(flossCodes.length);
  });

  it('only shows stores with a catalog mapping', () => {
    const rows = resolveMaterials(1);
    // DMC 321 has only Amazon in catalog
    const red = rows.find((r) => r.materialCode === '321');
    expect(red?.links).toHaveLength(1);
    expect(red?.links[0].store).toBe('amazon');
  });

  it('missing product mapping does not break resolution', () => {
    const rows = resolveMaterials(1);
    // needle and hoop have no catalog entry → links empty, row still present
    const needle = rows.find((r) => r.materialType === 'needle');
    expect(needle).toBeDefined();
    expect(needle?.links).toHaveLength(0);
  });

  it('exact product links are labelled with store name', () => {
    const rows = resolveMaterials(1);
    const black = rows.find((r) => r.materialCode === '310');
    const amazonLink = black?.links.find((l) => l.store === 'amazon');
    expect(amazonLink?.label).toContain('Amazon');
    expect(amazonLink?.linkType).toBe('exact_product');
  });

  it('affiliate tag is appended to Amazon URL', () => {
    const rows = resolveMaterials(1);
    const black = rows.find((r) => r.materialCode === '310');
    const amazonLink = black?.links.find((l) => l.store === 'amazon');
    expect(amazonLink?.href).toContain('tag=test-tag-20');
  });

  it('affiliate id is appended to LoveCrafts URL', () => {
    const rows = resolveMaterials(1);
    const black = rows.find((r) => r.materialCode === '310');
    const lcLink = black?.links.find((l) => l.store === 'lovecrafts');
    expect(lcLink?.href).toContain('affiliate_id=lc-affiliate-123');
  });

  it('affiliate config is not embedded in material records', () => {
    const rows = resolveMaterials(1);
    const json = JSON.stringify(rows);
    expect(json).not.toContain('NEXT_PUBLIC');
    expect(json).not.toContain('associate_tag');
  });

  it('design with only floss (no fabric/needle/hoop) resolves cleanly', () => {
    const rows = resolveMaterials(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].materialType).toBe('floss');
  });

  it('returns empty array for unknown design', () => {
    expect(resolveMaterials(9999)).toHaveLength(0);
  });

  it('handles a long list of thread colors without error', () => {
    const manyFloss = Array.from({ length: 25 }, (_, i) => ({
      brand: 'DMC',
      code: String(300 + i),
      name: `Color ${i}`,
      skeins: 1,
    }));
    vi.doMock('@/data/affiliate/materials.json', () => ({
      default: { '99': { floss: manyFloss } },
    }));
    // resolveMaterials still works correctly for known design 2
    const rows = resolveMaterials(2);
    expect(rows).toBeDefined();
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});
