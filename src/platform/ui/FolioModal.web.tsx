import type { CSSProperties } from 'react';
import { useEffect } from 'react';

import { colors } from '@/theme/tokens';
import type { FolioModalProps } from './FolioModal.types';

const overlayStyle: CSSProperties = {
  backgroundColor: colors.paper,
  display: 'flex',
  flexDirection: 'column',
  inset: 0,
  overflow: 'hidden',
  position: 'fixed',
  zIndex: 1000,
};

export function FolioModal({ children, onRequestClose, visible }: FolioModalProps) {
  useEffect(() => {
    if (!visible) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onRequestClose, visible]);

  if (!visible) return null;
  return <div aria-modal="true" role="dialog" style={overlayStyle}>{children}</div>;
}
