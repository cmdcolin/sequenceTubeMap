/** Serializes the SVG element with the given id and triggers a file download. */
export function downloadSvgById(id: string, filename: string) {
  const el = document.getElementById(id)
  if (!el) return
  const data = new XMLSerializer().serializeToString(el)
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
