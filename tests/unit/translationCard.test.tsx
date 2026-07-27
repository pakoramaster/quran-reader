import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  requestTranslationDeleteConfirmation,
  TranslationCard,
} from '@/app/(tabs)/translations';
import { requestConfirmation } from '@/platform/dialogs/dialogs';
import type { InstalledTranslation } from '@/types/domain';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/platform/dialogs/dialogs', () => ({
  requestConfirmation: jest.fn(),
  showMessage: jest.fn(),
}));

const translation: InstalledTranslation = {
  id: 'test-translation',
  title: 'Test Translation',
  language: 'en',
  translator: 'Test Translator',
  sourceName: 'Test Source',
  sourceUrl: null,
  licenseName: 'Test License',
  licenseUrl: null,
  contentSha256: 'abc123',
  importedAt: 100,
  updatedAt: 200,
  verseCount: 6_236,
};

describe('TranslationCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps navigation separate from select and delete actions and passes the translation', async () => {
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    const screen = await render(
      <TranslationCard
        active={false}
        deleting={false}
        onDelete={onDelete}
        onSelect={onSelect}
        selecting={false}
        translation={translation}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Set active' }));
    expect(onSelect).toHaveBeenCalledWith(translation);
    expect(onDelete).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: `Delete translation ${translation.title}` }));
    expect(onDelete).toHaveBeenCalledWith(translation);
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: `Open translation ${translation.title}` }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/translations/[translationId]',
      params: { translationId: translation.id },
    });
  });

  it('keeps Delete available for the active translation and disables it while pending', async () => {
    const onDelete = jest.fn();
    const screen = await render(
      <TranslationCard
        active
        deleting={false}
        onDelete={onDelete}
        onSelect={jest.fn()}
        selecting={false}
        translation={translation}
      />,
    );

    expect(screen.getByText('Shown in the reader')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set active' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: `Delete translation ${translation.title}` }));
    expect(onDelete).toHaveBeenCalledWith(translation);

    await screen.rerender(
      <TranslationCard
        active
        deleting
        onDelete={onDelete}
        onSelect={jest.fn()}
        selecting={false}
        translation={translation}
      />,
    );

    expect(screen.getByText('Deleting\u2026')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: `Delete translation ${translation.title}` }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('requestTranslationDeleteConfirmation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests a destructive warning and defers deletion until confirmation', () => {
    const onConfirm = jest.fn();
    const confirmation = jest.mocked(requestConfirmation);

    requestTranslationDeleteConfirmation(translation, onConfirm);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(confirmation).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Delete translation?',
      message: expect.stringMatching(/Test Translation.*notes and highlights.*permanently deleted/i),
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm,
    }));

    confirmation.mock.calls[0]![0].onConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
