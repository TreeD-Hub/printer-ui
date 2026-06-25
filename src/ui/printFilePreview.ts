import type { PrinterFilePreview, PrinterFilePreviewImage } from '@treed/printer-logic'

export function getPreferredPreviewImage(preview: PrinterFilePreview | undefined): PrinterFilePreviewImage | null {
  return preview?.large ?? preview?.small ?? null
}

export function getPreviewSrcSet(preview: PrinterFilePreview | undefined): string | undefined {
  const sources = [preview?.small, preview?.large]
    .filter((item): item is PrinterFilePreviewImage => item !== undefined)
    .map((item) => `${item.src} ${item.width}w`)

  return sources.length > 1 ? sources.join(', ') : undefined
}
