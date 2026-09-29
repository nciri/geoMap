export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Some browsers start the download after click() returns; revoking now can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
