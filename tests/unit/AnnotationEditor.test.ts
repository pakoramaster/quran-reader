import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AnnotationEditor } from '@/features/annotations/ui/AnnotationEditor';
import { spacing } from '@/theme/tokens';
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
  it('ignores parent refreshes when its editor props have not changed', async () => {
    let verseKeyReads = 0;
    const ayah = new Proxy(makeAyah(), {
      get(target, property, receiver) {
        if (property === 'verseKey') verseKeyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const props = {
      ayah,
      visible: true,
      saving: false,
      onClose: jest.fn(),
      onSave: jest.fn(),
    };
    const result = await render(React.createElement(AnnotationEditor, props));
    const readsAfterMount = verseKeyReads;

    await result.rerender(React.createElement(AnnotationEditor, props));

    expect(verseKeyReads).toBe(readsAfterMount);
  });

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

  it('keeps the actions inside safe, keyboard-scrollable modal content', async () => {
    const { result } = await renderEditor();
    const safeArea = result.getByTestId('annotation-editor-safe-area');
    const scrollView = result.getByTestId('annotation-editor-scroll');
    const actions = result.getByTestId('annotation-editor-actions');
    const actionStyle = StyleSheet.flatten(actions.props.style);

    expect(safeArea.props.edges).toEqual({
      bottom: 'additive',
      left: 'additive',
      right: 'additive',
      top: 'off',
    });
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(actionStyle.marginTop).toBe(spacing.lg);
    expect(actionStyle.marginTop).not.toBe('auto');
  });
});
