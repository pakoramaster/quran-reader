export function throwIfDownloadAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;

  const error = new Error('Download cancelled.');
  error.name = 'AbortError';
  throw error;
}
