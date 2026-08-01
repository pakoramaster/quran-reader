import { beginPlaybackSource, createPlaybackCompletionTracker, observePlaybackStatus } from '@/features/speech/domain/playbackCompletion';

function status(overrides: Partial<Parameters<typeof observePlaybackStatus>[1]> = {}): Parameters<typeof observePlaybackStatus>[1] {
  return {
    currentTime: 0,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: true,
    playbackState: 'ready',
    playing: false,
    ...overrides,
  };
}

describe('speech playback completion tracking', () => {
  it('ignores a stale completion after replacing the audio source', () => {
    const tracker = createPlaybackCompletionTracker();
    beginPlaybackSource(tracker);
    expect(observePlaybackStatus(tracker, status({ playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 0.25, playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 2, didJustFinish: true }))).toBe('completed');

    beginPlaybackSource(tracker);
    expect(observePlaybackStatus(tracker, status({ currentTime: 2, didJustFinish: true }))).toBeNull();
  });

  it('advances once after the replacement source has actually played', () => {
    const tracker = createPlaybackCompletionTracker();
    beginPlaybackSource(tracker);
    expect(observePlaybackStatus(tracker, status({ isBuffering: true, isLoaded: false, playbackState: 'buffering', playing: true }))).toBeNull();
    expect(observePlaybackStatus(tracker, status({ playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 0.25, playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 2, didJustFinish: true, playbackState: 'ended' }))).toBe('completed');
    expect(observePlaybackStatus(tracker, status({ currentTime: 2, didJustFinish: true, playbackState: 'ended' }))).toBeNull();
  });

  it('does not arm the next verse from late statuses on the previous timeline', () => {
    const tracker = createPlaybackCompletionTracker();
    beginPlaybackSource(tracker);

    expect(observePlaybackStatus(tracker, status({ currentTime: 2.7, playing: true }))).toBeNull();
    expect(observePlaybackStatus(tracker, status({ currentTime: 3, didJustFinish: true, playbackState: 'ended' }))).toBeNull();

    expect(observePlaybackStatus(tracker, status({ isBuffering: true, isLoaded: false, playbackState: 'buffering', playing: true }))).toBeNull();
    expect(observePlaybackStatus(tracker, status({ currentTime: 0.02, playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 0.3, playing: true }))).toBe('playing');
    expect(observePlaybackStatus(tracker, status({ currentTime: 2.4, didJustFinish: true, playbackState: 'ended' }))).toBe('completed');
  });
});
