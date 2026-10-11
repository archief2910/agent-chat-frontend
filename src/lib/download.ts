export async function downloadFile(options: { baseUrl: string; token: string | null; url: string; name: string }): Promise<void> {
  const endpoint = `${options.baseUrl}/api/v1/assets/file?url=${encodeURIComponent(options.url)}`;
  const response = await fetch(endpoint, {
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
  });
  if (response.ok) {
    saveBlob(await response.blob(), options.name);
    return;
  }
  const direct = await fetch(options.url).catch(() => null);
  if (!direct?.ok) throw new Error("The file could not be downloaded.");
  saveBlob(await direct.blob(), options.name);
}

function saveBlob(blob: Blob, name: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
