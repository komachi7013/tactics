/** Alpha-derived display effect for independent props, never for characters or backgrounds. */
export interface OutlineAsset { key: string; width: number; height: number; originX: number; originY: number }
interface CanvasTexture { getContext(): CanvasRenderingContext2D; refresh(): unknown }
interface OutlineTextures {
  exists(key: string): boolean;
  get(key: string): { getSourceImage(): unknown };
  createCanvas(key: string, width: number, height: number): CanvasTexture | null;
  remove(key: string): unknown;
}
export interface ObjectOutline {
  key: string; width: number; height: number; originX: number; originY: number;
}

function dilateAlpha(mask: Uint8Array, width: number, height: number, radius: number, padding: number): Uint8Array {
  const outWidth = width + 2 * padding, outHeight = height + 2 * padding;
  const result = new Uint8Array(outWidth * outHeight), stride = width + 1;
  const prefix = new Uint32Array(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    prefix[y * stride + x + 1] = prefix[y * stride + x] + mask[y * width + x];
  // A circular dilation, using per-row sums rather than scanning every pixel in a disk.
  for (let dy = -radius; dy <= radius; dy++) {
    const rx = Math.floor(Math.sqrt(radius * radius - dy * dy));
    for (let y = 0; y < outHeight; y++) {
      const sy = y - padding + dy;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < outWidth; x++) {
        const index = y * outWidth + x;
        if (result[index]) continue;
        const left = Math.max(0, Math.min(width, x - padding - rx));
        const right = Math.max(0, Math.min(width, x - padding + rx + 1));
        if (prefix[sy * stride + right] > prefix[sy * stride + left]) result[index] = 1;
      }
    }
  }
  return result;
}

/** Outer pixels only: source RGB/alpha remain untouched in their own original texture. */
export function objectOutlinePixels(alpha: Uint8Array, width: number, height: number, outerRadius: number, innerRadius: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || alpha.length !== width * height)
    throw new Error('Invalid prop alpha dimensions');
  if (!Number.isInteger(outerRadius) || !Number.isInteger(innerRadius) || innerRadius < 1 || outerRadius < innerRadius || outerRadius > 64)
    throw new Error('Invalid prop outline radius');
  const padding = outerRadius + 1, outWidth = width + padding * 2, outHeight = height + padding * 2;
  // Ignore diffuse, low-alpha shadow/fringe; derive the edge from the visible prop itself.
  const mask = Uint8Array.from(alpha, value => value >= 96 ? 1 : 0);
  const outer = dilateAlpha(mask, width, height, outerRadius, padding);
  const inner = dilateAlpha(mask, width, height, innerRadius, padding);
  const pixels = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const index = y * outWidth + x, sx = x - padding, sy = y - padding;
    if (!outer[index] || sx >= 0 && sx < width && sy >= 0 && sy < height && mask[sy * width + sx]) continue;
    pixels.set(inner[index] ? [255, 255, 255, 255] : [12, 25, 27, 255], index * 4);
  }
  return { pixels, width: outWidth, height: outHeight, padding };
}

/** One cached canvas texture per source; resizing replaces it after the old board layer is gone. */
export class MapObjectOutlines {
  private entries = new Map<string, { key: string; radius: number; inner: number }>();
  prepare(textures: OutlineTextures, asset: OutlineAsset, scale: number): ObjectOutline | undefined {
    if (!textures.exists(asset.key) || !Number.isFinite(scale) || scale <= 0) return;
    const source = textures.get(asset.key).getSourceImage() as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const width = source?.naturalWidth || source?.width, height = source?.naturalHeight || source?.height;
    // An unloaded/invalid source is left intact and can be retried on the next draw.
    if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const ratio = Math.max(width / asset.width, height / asset.height) / scale;
    const radius = Math.max(2, Math.min(64, Math.ceil(2.7 * ratio)));
    const inner = Math.max(1, Math.min(radius - 1, Math.ceil(1.6 * ratio)));
    const prior = this.entries.get(asset.key);
    const key = `map-prop-outline-v2-${asset.key}-${radius}-${inner}`, padding = radius + 1;
    const geometry = { key, width: asset.width * (width + 2 * padding) / width * scale,
      height: asset.height * (height + 2 * padding) / height * scale,
      originX: (asset.originX * width + padding) / (width + 2 * padding),
      originY: (asset.originY * height + padding) / (height + 2 * padding) };
    // Display size depends on scale even when quantized source radii are unchanged.
    if (prior?.radius === radius && prior.inner === inner && textures.exists(prior.key)) return geometry;
    if (prior) { if (textures.exists(prior.key)) textures.remove(prior.key); this.entries.delete(asset.key); }
    if (textures.exists(key)) { this.entries.set(asset.key, { key, radius, inner }); return geometry; }
    const texture = textures.createCanvas(key, width + 2 * padding, height + 2 * padding);
    if (!texture) throw new Error('Prop outline canvas unavailable');
    try {
      const context = texture.getContext();
      context.drawImage(source, padding, padding, width, height);
      const data = context.getImageData(padding, padding, width, height).data;
      const alpha = Uint8Array.from({ length: width * height }, (_, i) => data[i * 4 + 3]);
      const outline = objectOutlinePixels(alpha, width, height, radius, inner);
      const output = context.createImageData(outline.width, outline.height); output.data.set(outline.pixels);
      context.putImageData(output, 0, 0); texture.refresh();
      this.entries.set(asset.key, { key, radius, inner });
      return geometry;
    } catch (error) { if (textures.exists(key)) textures.remove(key); throw error; }
  }
  clear(textures: OutlineTextures) {
    for (const row of this.entries.values()) if (textures.exists(row.key)) textures.remove(row.key);
    this.entries.clear();
  }
}
