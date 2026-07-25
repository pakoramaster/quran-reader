import { Alert } from 'react-native';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function showMessage(title: string, message: string): void {
  Alert.alert(title, message);
}

export function requestConfirmation({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ConfirmationOptions): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
