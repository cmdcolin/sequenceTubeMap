import { exportSvg } from './svgExport.ts'

/** Saves the SVG element with the given id as a standalone figure. */
export function downloadSvgById(id: string, filename: string) {
  const el = document.getElementById(id)
  if (el) {
    const { xml } = exportSvg(el)
    const url = URL.createObjectURL(
      new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
