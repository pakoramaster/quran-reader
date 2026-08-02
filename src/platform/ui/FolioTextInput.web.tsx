import type { CSSProperties, FormEvent, PointerEvent } from 'react';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import type { FolioTextInputProps } from './FolioTextInput.types';
import { normalizeWebTextInputStyle } from './webTextInputStyle';

export function FolioTextInput({
  accessibilityLabel,
  autoFocus,
  maxLength,
  multiline = false,
  onChangeText,
  placeholder,
  placeholderTextColor,
  style,
  value,
}: FolioTextInputProps) {
  const elementRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) elementRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (elementRef.current && elementRef.current.value !== value) elementRef.current.value = value;
  }, [value]);

  const flattenedStyle = StyleSheet.flatten(style) as CSSProperties;
  const webStyle = normalizeWebTextInputStyle(flattenedStyle, multiline);
  const handleInput = (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChangeText(event.currentTarget.value);
  };
  const handlePointerDown = (event: PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // React Native Web's responder can retain the pointer after a modal closes or
    // its route unmounts. Keep it from claiming subsequent textarea presses and
    // explicitly restore DOM focus for Windows/Electron.
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
  };
  const commonProps = {
    'aria-label': accessibilityLabel,
    className: 'folio-platform-text-input',
    maxLength,
    onInput: handleInput,
    onPointerDown: handlePointerDown,
    placeholder,
    ref: elementRef,
    style: {
      ...webStyle,
      '--placeholder-color': placeholderTextColor,
    } as CSSProperties & Record<'--placeholder-color', string | undefined>,
  };

  return (
    <>
      <style>{'.folio-platform-text-input::placeholder { color: var(--placeholder-color); opacity: 1; }'}</style>
      {multiline
        ? <textarea {...commonProps} defaultValue={value} />
        : <input {...commonProps} defaultValue={value} type="text" />}
    </>
  );
}
