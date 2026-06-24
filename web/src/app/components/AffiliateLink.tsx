'use client';

import type { LinkType, MaterialType } from '@/app/types/affiliate';

interface Props {
  href: string;
  label: string;
  store: 'amazon' | 'lovecrafts';
  linkType: LinkType;
  designId: number;
  designCaption: string;
  materialType: MaterialType;
  materialBrand?: string;
  materialCode?: string;
  materialName?: string;
  quantity?: string;
  productId?: string;
}

export default function AffiliateLink({
  href,
  label,
  store,
  linkType,
  designId,
  designCaption,
  materialType,
  materialBrand,
  materialCode,
  materialName,
  quantity,
  productId,
}: Props) {
  function handleClick() {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'affiliate_material_click', {
        store,
        design_id: String(designId),
        design_name: designCaption,
        page_path: window.location.pathname,
        material_type: materialType,
        ...(materialBrand && { material_brand: materialBrand }),
        ...(materialCode && { material_code: materialCode }),
        ...(materialName && { material_name: materialName }),
        ...(quantity && { quantity }),
        ...(productId && { product_id: productId }),
        link_type: linkType,
        link_url: href,
      });
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      onClick={handleClick}
      className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
    >
      {label}
    </a>
  );
}
