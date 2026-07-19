import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import type { TranslationManifest } from '@/types/domain';
import type { ImportIssue } from '../domain/translationFormat';

export interface ImportSession {
  fileName: string;
  checksum: string;
  manifest: TranslationManifest;
  changedVerseCount: number | null;
  sourceFormat: 'quran-folio' | 'quran-db';
}

interface ImportSessionContextValue {
  session: ImportSession | null;
  issues: ImportIssue[];
  setSession: (session: ImportSession | null) => void;
  setIssues: (issues: ImportIssue[]) => void;
}

const ImportSessionContext = createContext<ImportSessionContextValue | null>(null);

export function ImportSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<ImportSession | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const value = useMemo(() => ({ session, issues, setSession, setIssues }), [issues, session]);
  return <ImportSessionContext.Provider value={value}>{children}</ImportSessionContext.Provider>;
}

export function useImportSession(): ImportSessionContextValue {
  const value = useContext(ImportSessionContext);
  if (!value) throw new Error('useImportSession must be used within ImportSessionProvider.');
  return value;
}
