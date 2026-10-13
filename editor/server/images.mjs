import sharp from 'sharp';
import { fail } from './validation.mjs';
export async function cleanPortrait(bytes) {
  try {
    const image = sharp(bytes, { limitInputPixels: 16000000, animated: false });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format) ||
      (meta.pages || 1) !== 1
    )
      fail('Use a static JPEG, PNG or WebP portrait.');
    return await image
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (error) {
    if (error.status) throw error;
    fail(
      'Portrait could not be decoded. Use a static JPEG, PNG or WebP under 16 million pixels.',
    );
  }
}
