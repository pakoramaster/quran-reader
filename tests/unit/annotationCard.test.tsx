import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AnnotationCard } from '@/app/(tabs)/notes';
import type { AnnotatedAyah } from '@/types/domain';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const annotation: AnnotatedAyah = {
  translationId: 'translation-one',
  surahNumber: 2,
  ayahNumber: 255,
  verseKey: '2:255',
  noteText: 'A reflection',
  highlightColor: null,
  createdAt: 100,
  updatedAt: 200,
  translationTitle: 'Test translation',
  translationText: 'Test verse text',
  surahName: 'Surah 2',
};

describe('AnnotationCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps verse navigation separate from edit and delete actions', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const screen = await render(
      <AnnotationCard
        annotation={annotation}
        deleting={false}
        onDelete={onDelete}
        onEdit={onEdit}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Edit note for verse 2:255' }));
    expect(onEdit).toHaveBeenCalledWith(annotation);
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete note for verse 2:255' }));
    expect(onDelete).toHaveBeenCalledWith(annotation);
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Open verse 2:255' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahNumber]',
      params: { surahNumber: 2, ayah: 255 },
    });
  });

  it('disables deletion while that note is being removed', async () => {
    const onDelete = jest.fn();
    const screen = await render(
      <AnnotationCard
        annotation={annotation}
        deleting
        onDelete={onDelete}
        onEdit={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByText('Deleting\u2026'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Deleting\u2026')).toBeTruthy();
  });
});
