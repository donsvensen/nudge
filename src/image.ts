const MAX_SIDE = 1600
const MAX_GIF_BYTES = 5 * 1024 * 1024

/** Shrinks a photo to a chat-friendly JPEG (respecting phone rotation). GIFs are sent as they are. */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF_BYTES) throw new Error('That GIF is too large (max 5 MB).')
    return file
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Could not process that image.')
  return blob
}
