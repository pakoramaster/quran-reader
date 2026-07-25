import type { PropsWithChildren } from 'react';

export interface FolioModalProps extends PropsWithChildren {
  onRequestClose: () => void;
  visible: boolean;
}
