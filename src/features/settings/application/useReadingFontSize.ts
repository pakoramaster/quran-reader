import { useQuery } from '@tanstack/react-query';

import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { getSetting } from '@/features/settings/data/settingsRepository';
import { getReadingFontSize } from '@/features/settings/domain/readingFontSizes';

export function useReadingFontSize() {
  const db = useUserDatabase();
  const setting = useQuery({
    queryKey: ['reading-font-size'],
    queryFn: () => getSetting(db, 'reading_font_size'),
  });
  return getReadingFontSize(setting.data);
}
