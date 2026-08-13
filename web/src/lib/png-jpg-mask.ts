import sharp from 'sharp';

// PNG → JPG + separate lossless alpha mask, shared between the site's own
// upload path (convert/route.ts's saveSourceCopy()) and ad-hoc manual
// conversions (scripts/png-to-jpg-with-mask.ts) — one implementation
// instead of two independently-maintained copies.
//
// JPG is far cheaper than PNG for the RGB data, but JPEG's lossy DCT
// compression blurs sharp edges — and a PNG's alpha channel drives real
// functional behavior in this codebase: pattern-converter.ts's
// ALPHA_THRESHOLD classification turns transparent pixels into empty
// stitches. A lossy mask would silently change which pixels count as
// transparent on a later re-conversion, so the alpha channel is kept
// lossless (PNG) while only the RGB gets the lossy/cheap treatment.
// Flattening onto white before JPEG-encoding matches compositeOntoWhite()
// in pattern-converter.ts exactly, so recombining this RGB with the mask
// on read (source-image/route.ts, or a fresh sharp().joinChannel() call)
// reproduces what convertImage() would have seen from the original PNG.
export async function splitPngForStorage(buffer: Buffer): Promise<{ rgbJpeg: Buffer; maskPng?: Buffer }> {
  const meta = await sharp(buffer).metadata();
  let maskPng: Buffer | undefined;
  if (meta.hasAlpha && meta.width && meta.height) {
    const alpha = await sharp(buffer).ensureAlpha().extractChannel(3).raw().toBuffer();
    const hasRealTransparency = alpha.some((v) => v !== 255);
    if (hasRealTransparency) {
      maskPng = await sharp(alpha, { raw: { width: meta.width, height: meta.height, channels: 1 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
    }
  }
  const rgbJpeg = await sharp(buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  return { rgbJpeg, maskPng };
}
