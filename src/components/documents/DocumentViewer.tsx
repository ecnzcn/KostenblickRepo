import { useEffect, useMemo } from 'react'

interface DocumentViewerProps {
  blob: Blob
  mimeType: string
  filename: string
}

/** Renders a document's bytes inline - a PDF via the browser's own viewer
 * (iOS Safari included) and an image as a responsive <img>. No PDF library
 * is added since the browser already handles this well enough for V1. */
export function DocumentViewer({ blob, mimeType, filename }: DocumentViewerProps) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])

  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  if (mimeType === 'application/pdf') {
    return <iframe src={url} title={filename} className="h-[70vh] w-full rounded-xl border border-neutral-200" />
  }

  return <img src={url} alt={filename} className="max-w-full rounded-xl border border-neutral-200" />
}
