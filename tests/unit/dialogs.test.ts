import { Alert } from 'react-native';

import { requestConfirmation as requestNativeConfirmation } from '@/platform/dialogs/dialogs';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs.web';

describe('web dialogs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'alert');
    Reflect.deleteProperty(globalThis, 'confirm');
  });

  it('runs the confirmed action only when accepted', () => {
    const confirm = jest.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, 'confirm', { configurable: true, value: confirm });
    const onConfirm = jest.fn();
    requestConfirmation({ title: 'Title', message: 'Message', confirmLabel: 'Continue', onConfirm });
    expect(confirm).toHaveBeenCalledWith('Title\n\nMessage');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not run the action when browser confirmation is cancelled', () => {
    Object.defineProperty(globalThis, 'confirm', { configurable: true, value: jest.fn().mockReturnValue(false) });
    const onConfirm = jest.fn();

    requestConfirmation({ title: 'Delete?', message: 'Cannot be undone.', confirmLabel: 'Delete', onConfirm });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a browser message', () => {
    const alert = jest.fn();
    Object.defineProperty(globalThis, 'alert', { configurable: true, value: alert });
    showMessage('Saved', 'Complete');
    expect(alert).toHaveBeenCalledWith('Saved\n\nComplete');
  });
});

describe('native dialogs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('marks a destructive confirmation and waits for the confirm action', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onConfirm = jest.fn();

    requestNativeConfirmation({
      title: 'Delete note?',
      message: 'Cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm,
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Delete note?',
      'Cannot be undone.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive', onPress: onConfirm }),
      ]),
    );
  });
});
