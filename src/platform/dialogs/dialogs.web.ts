import type { ConfirmationOptions } from './dialogs';

export function showMessage(title: string, message: string): void {
  globalThis.alert(`${title}\n\n${message}`);
}

export function requestConfirmation({ title, message, onConfirm }: ConfirmationOptions): void {
  if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
}
