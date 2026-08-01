import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { colors } from '@/theme/tokens';

interface CompactVolumeControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function CompactVolumeControl({ value, onChange }: CompactVolumeControlProps) {
  const [visualValue] = useState(() => new Animated.Value(value));
  const [trackWidth, setTrackWidth] = useState(112);
  const trackRef = useRef<View>(null);
  const geometryRef = useRef({ left: 0, width: 112 });
  const draggingRef = useRef(false);
  const latestValueRef = useRef(value);
  const lastNotificationRef = useRef(0);

  useEffect(() => {
    if (draggingRef.current) return;
    latestValueRef.current = value;
    visualValue.setValue(value);
  }, [value, visualValue]);

  const notifyWhileDragging = useCallback((next: number) => {
    const now = Date.now();
    if (now - lastNotificationRef.current < 60) return;
    lastNotificationRef.current = now;
    onChange(next);
  }, [onChange]);
  const setFromPageX = useCallback((pageX: number) => {
    const { left, width } = geometryRef.current;
    if (width <= 0) return;
    const next = Math.max(0, Math.min(1, (pageX - left) / width));
    latestValueRef.current = next;
    visualValue.setValue(next);
    notifyWhileDragging(next);
  }, [notifyWhileDragging, visualValue]);
  const measureTrack = useCallback((pageX?: number) => {
    trackRef.current?.measureInWindow((left, _top, width) => {
      geometryRef.current = { left, width };
      setTrackWidth(width);
      if (pageX !== undefined) setFromPageX(pageX);
    });
  }, [setFromPageX]);
  const beginGesture = (event: GestureResponderEvent) => {
    draggingRef.current = true;
    lastNotificationRef.current = 0;
    measureTrack(event.nativeEvent.pageX);
  };
  const moveGesture = (event: GestureResponderEvent) => setFromPageX(event.nativeEvent.pageX);
  const finishGesture = () => {
    draggingRef.current = false;
    onChange(latestValueRef.current);
  };
  const adjust = (amount: number) => {
    const next = Math.max(0, Math.min(1, value + amount));
    latestValueRef.current = next;
    visualValue.setValue(next);
    onChange(next);
  };
  const fillWidth = Animated.multiply(visualValue, trackWidth);
  const thumbOffset = Animated.add(fillWidth, -7);

  return (
    <View style={styles.container}>
      <Ionicons color={colors.emerald} name={value === 0 ? 'volume-mute' : value < 0.5 ? 'volume-low' : 'volume-high'} size={18} />
      <View
        accessibilityActions={[{ name: 'decrement' }, { name: 'increment' }]}
        accessibilityLabel="Playback volume"
        accessibilityRole="adjustable"
        accessibilityValue={{ max: 100, min: 0, now: Math.round(value * 100), text: `${Math.round(value * 100)} percent` }}
        onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
        onLayout={() => measureTrack()}
        onMoveShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderGrant={beginGesture}
        onResponderMove={moveGesture}
        onResponderRelease={finishGesture}
        onResponderTerminate={finishGesture}
        onResponderTerminationRequest={() => false}
        onStartShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        ref={trackRef}
        style={styles.touchTrack}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.trackFill, { width: fillWidth }]} />
        </View>
        <Animated.View pointerEvents="none" style={[styles.thumb, { transform: [{ translateX: thumbOffset }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexDirection: 'row', gap: 6, width: 136 },
  touchTrack: { height: 34, justifyContent: 'center', position: 'relative', width: 112 },
  track: { backgroundColor: colors.border, borderRadius: 3, height: 5, overflow: 'hidden' },
  trackFill: { backgroundColor: colors.emerald, height: '100%' },
  thumb: { backgroundColor: colors.emerald, borderRadius: 7, height: 14, marginLeft: -7, position: 'absolute', top: 10, width: 14 },
});
