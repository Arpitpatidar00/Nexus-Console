import type { Diagram } from './diagram';
import { renderSvg, resolvePalette } from './diagramSvg';

/** The diagram in the current theme's colours, as a standalone SVG file. */
export function diagramSvgFile(d: Diagram, title: string): string {
  const css = getComputedStyle(document.documentElement);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderSvg(
    d,
    resolvePalette((v) => css.getPropertyValue(v)),
    { title },
  )}`;
}

/** Rasterise an SVG file to PNG (2× where it fits under ~60 MP), as base64. */
export async function svgToPngBase64(svg: string, width: number, height: number): Promise<string> {
  const scale = Math.min(2, Math.sqrt(60e6 / Math.max(1, width * height)));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas to draw the PNG on.');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
