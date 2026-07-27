import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { AnnotationEditor } from '@/features/annotations/ui/AnnotationEditor';
import type { HighlightColor, ReaderAyah } from '@/types/domain';

function makeAyah(noteText: string | null = null, highlightColor: HighlightColor | null = null): ReaderAyah {
  return {
    surahNumber: 1,
    ayahNumber: 1,
    verseKey: '1:1',
    textUthmani: 'Test ayah',
    translationText: 'In the name of Allah',
    annotation:
      noteText !== null || highlightColor !== null
        ? {
            translationId: 'test-translation',
            surahNumber: 1,
            ayahNumber: 1,
            noteText,
            highlightColor,
            createdAt: 1,
            updatedAt: 1,
          }
        : null,
  };
}

async function renderEditor(ayah: ReaderAyah = makeAyah()) {
  const onSave = jest.fn();
  const result = await render(
    React.createElement(AnnotationEditor, {
      ayah,
      visible: true,
      saving: false,
      onClose: jest.fn(),
      onSave,
    }),
  );

  return { result, onSave };
}

describe('AnnotationEditor', () => {
  it('defaults to no color and saves a null highlight', async () => {
    const { result, onSave } = await renderEditor();

    expect(result.getByLabelText('No highlight color').props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(result.getByText('Clear reflection'));

    expect(onSave).toHaveBeenCalledWith(null, null);
  });

  it('saves a selected highlight color', async () => {
    const { result, onSave } = await renderEditor();

    await fireEvent.press(result.getByLabelText('sage highlight'));
    expect(result.getByLabelText('sage highlight').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(result.getByText('Save reflection'));

    expect(onSave).toHaveBeenCalledWith(null, 'sage');
  });

  it('hydrates an existing note and highlight color', async () => {
    const { result, onSave } = await renderEditor(makeAyah('Remember this ayah', 'rose'));

    expect(result.getByLabelText('Note for verse 1:1').props.value).toBe('Remember this ayah');
    expect(result.getByLabelText('rose highlight').props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(result.getByText('Save reflection'));
    expect(onSave).toHaveBeenCalledWith('Remember this ayah', 'rose');
  });

  it('places the no-color control before the colored swatches', async () => {
    const { result } = await renderEditor();
    const swatches = result.getAllByRole('button').filter(({ props }) =>
      ['No highlight color', 'amber highlight', 'sage highlight', 'sky highlight', 'rose highlight'].includes(
        props.accessibilityLabel,
      ),
    );

    expect(swatches.map(({ props }) => props.accessibilityLabel)).toEqual([
      'No highlight color',
      'amber highlight',
      'sage highlight',
      'sky highlight',
      'rose highlight',
    ]);
  });
});
