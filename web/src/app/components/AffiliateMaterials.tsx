import { resolveMaterials } from '@/lib/affiliate';
import AffiliateLink from './AffiliateLink';

interface Props {
  designId: number;
  designCaption: string;
}

export default function AffiliateMaterials({ designId, designCaption }: Props) {
  const materials = resolveMaterials(designId);
  if (materials.length === 0) return null;

  return (
    <div className="text-left bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Materials for this pattern</h3>
      <p className="text-xs text-gray-500 mb-3">
        Buy the exact colors and quantities required to stitch this design.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Material</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Required</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Shop</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materials.map((m) => (
              <tr key={`${m.materialType}-${m.label}`}>
                <td className="py-2 pr-4 text-gray-800 text-xs">{m.label}</td>
                <td className="py-2 pr-4 text-gray-700 text-xs text-right">{m.required}</td>
                <td className="py-2">
                  {m.links.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {m.links.map((link) => (
                        <AffiliateLink
                          key={link.store}
                          href={link.href}
                          label={link.label}
                          store={link.store}
                          linkType={link.linkType}
                          designId={designId}
                          designCaption={designCaption}
                          materialType={m.materialType}
                          materialBrand={m.materialBrand}
                          materialCode={m.materialCode}
                          materialName={m.materialName}
                          quantity={m.required}
                          productId={link.productId}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">
        This page contains affiliate links. We may earn a small commission at no additional cost to you.
      </p>
    </div>
  );
}
