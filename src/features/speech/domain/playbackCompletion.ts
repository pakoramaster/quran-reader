export interface PlaybackCompletionTracker {
  armedSourceId: number;
  completedSourceId: number;
  currentSourceId: number;
  progressedSourceId: number;
  resetSourceId: number;
  startedAt: number;
}

export function createPlaybackCompletionTracker(): PlaybackCompletionTracker {
  return { armedSourceId: 0, completedSourceId: 0, currentSourceId: 0, progressedSourceId: 0, resetSourceId: 0, startedAt: 0 };
}

export function beginPlaybackSource(tracker: PlaybackCompletionTracker): void {
  tracker.currentSourceId += 1;
  tracker.armedSourceId = 0;
  tracker.progressedSourceId = 0;
  tracker.resetSourceId = 0;
  tracker.startedAt = 0;
}

interface PlaybackStatusSnapshot {
  currentTime: number;
  didJustFinish: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  playbackState: string;
  playing: boolean;
}

const SOURCE_START_WINDOW_SECONDS = 0.5;
const SOURCE_PROGRESS_SECONDS = 0.08;

export function observePlaybackStatus(tracker: PlaybackCompletionTracker, status: PlaybackStatusSnapshot): 'completed' | 'playing' | null {
  if (status.didJustFinish) {
    if (tracker.armedSourceId !== tracker.currentSourceId || tracker.progressedSourceId !== tracker.currentSourceId || tracker.completedSourceId === tracker.currentSourceId) return null;
    tracker.completedSourceId = tracker.currentSourceId;
    return 'completed';
  }

  // Android's replace() prepares the next Media3 source asynchronously. Status
  // events from the previous source can still arrive during that handoff, so do
  // not arm completion until the replacement has exposed its reset timeline.
  if (!status.isLoaded || status.isBuffering || status.playbackState === 'idle' || status.currentTime <= SOURCE_START_WINDOW_SECONDS) {
    tracker.resetSourceId = tracker.currentSourceId;
  }

  if (
    tracker.resetSourceId === tracker.currentSourceId &&
    tracker.armedSourceId !== tracker.currentSourceId &&
    status.isLoaded &&
    status.playing &&
    status.currentTime <= SOURCE_START_WINDOW_SECONDS
  ) {
    tracker.armedSourceId = tracker.currentSourceId;
    tracker.startedAt = status.currentTime;
    return 'playing';
  }

  if (tracker.armedSourceId === tracker.currentSourceId && status.playing) {
    if (status.currentTime >= tracker.startedAt + SOURCE_PROGRESS_SECONDS) tracker.progressedSourceId = tracker.currentSourceId;
    return 'playing';
  }
  return null;
}
