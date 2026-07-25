import type { StyleProp, TextStyle } from 'react-native';

export interface FolioTextInputProps {
  accessibilityLabel: string;
  autoFocus?: boolean;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: StyleProp<TextStyle>;
  textAlignVertical?: TextStyle['textAlignVertical'];
  value: string;
}
