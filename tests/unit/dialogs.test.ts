import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs.web';

describe('web dialogs', () => {
  afterEach(() => {
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

  it('shows a browser message', () => {
    const alert = jest.fn();
    Object.defineProperty(globalThis, 'alert', { configurable: true, value: alert });
    showMessage('Saved', 'Complete');
    expect(alert).toHaveBeenCalledWith('Saved\n\nComplete');
  });
});
