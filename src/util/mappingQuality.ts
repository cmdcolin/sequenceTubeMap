// Mapping quality as color and as opacity, over one domain. The renderer draws
// with these and the legend draws its key from them, so the two can't disagree.
import { interpolateRdYlGn } from 'd3'

export const MAX_MAPPING_QUALITY = 60

function fraction(quality: number | undefined): number {
  return Math.min(MAX_MAPPING_QUALITY, quality ?? 0) / MAX_MAPPING_QUALITY
}

export function mappingQualityColor(quality: number | undefined): string {
  return interpolateRdYlGn(fraction(quality))
}

export function mappingQualityAlpha(quality: number | undefined): number {
  return 0.1 + 0.9 * fraction(quality)
}
