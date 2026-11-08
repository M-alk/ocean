// Pictures from the clipboard (screenshots, copied images): give them a readable name and a smaller file.

const MAX_SIDE = 2560; // wider than this is more than a note column ever shows, even on Retina
const SHRINK_FROM = 300_000; // bytes; small images are kept exactly as they are

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

/** Clipboard images all arrive as "image.png"; those are screenshots or copied pictures. */
export const isUnnamed = (file) => !file.name || /^image\.(png|jpe?g|gif|webp|tiff?|bmp|avif)$/i.test(file.name);

/** Re-encode a big PNG/BMP/TIFF as WebP (sharp text, much smaller), scaled down if it is huge. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
  // Keep the original if this browser can't write WebP or it didn't save much.
  return blob && blob.type === 'image/webp' && blob.size < file.size * 0.7 ? blob : null;
}

/** The file to save for a pasted or dropped image. */
export async function prepareImage(file) {
  const base = isUnnamed(file) ? `Pasted image ${stamp()}` : file.name.replace(/\.[^.]+$/, '');
  let blob = file;
  if (/^image\/(png|bmp|tiff)$/.test(file.type) && file.size > SHRINK_FROM) blob = (await shrink(file).catch(() => null)) || file;
  if (blob === file && !isUnnamed(file)) return file;
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '') || 'png';
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

/** Read an image from the clipboard on demand (for the "/" menu). Returns null when there is none. */
export async function readClipboardImage() {
  // The Mac app reads the clipboard itself: no permission prompt.
  if (window.oceanDesktop?.clipboardImage) {
    const img = await window.oceanDesktop.clipboardImage();
    return img ? new File([img.bytes], `image.${img.type.split('/')[1]}`, { type: img.type }) : null;
  }
  if (!navigator.clipboard?.read) throw new Error("This browser can't read the clipboard. Click in the note and press ⌘V instead.");
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error('Allow clipboard access, or click in the note and press ⌘V.');
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return new File([await item.getType(type)], `image.${type.split('/')[1]}`, { type });
  }
  return null;
}
