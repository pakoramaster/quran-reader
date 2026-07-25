import { Modal } from 'react-native';

import type { FolioModalProps } from './FolioModal.types';

export function FolioModal({ children, onRequestClose, visible }: FolioModalProps) {
  return (
    <Modal animationType="slide" onRequestClose={onRequestClose} presentationStyle="pageSheet" visible={visible}>
      {children}
    </Modal>
  );
}
