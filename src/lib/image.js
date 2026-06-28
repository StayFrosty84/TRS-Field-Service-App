// Image helpers for the Bill of Sale PDF. `fitDimensions` is pure (unit-tested);
// `compressForPdf` is browser-only (canvas) and verified via the sample PDF.

// Clamp the longer edge to `maxEdge`, preserving aspect ratio. Never upscales.
export function fitDimensions(w, h, maxEdge) {
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { w: Math.round(w), h: Math.round(h), scale: 1 };
  const scale = maxEdge / longEdge;
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}

// Downscale + JPEG-recompress a photo blob for embedding in the PDF.
// Resolves null if the image can't be decoded so the caller can fall back to the original.
export function compressForPdf(blob, { maxEdge = 1600, quality = 0.72 } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
