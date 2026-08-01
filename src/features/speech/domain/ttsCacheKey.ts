export function buildTtsCacheKey(model: string, speakerId: number, speed: number, text: string): string {
  return JSON.stringify({ model, speakerId, speed, text, version: 2 });
}
