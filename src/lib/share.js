// Hands a file to the phone's native share sheet (so the user can pick Mail and the
// file is attached). Falls back to a normal download on browsers that can't share files
// (most desktops). Returns 'shared' | 'downloaded' | 'cancelled'.
export async function shareFile(blob, filename, { title, text } = {}) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Fall through to download on any other share failure.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
