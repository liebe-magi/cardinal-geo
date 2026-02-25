import updatesJson from '../content/updates.json';

export type UpdateNote = {
  id: string;
  version: string;
  publishedAt: string;
  title: {
    ja: string;
    en: string;
  };
  summary: {
    ja: string;
    en: string;
  };
  changes: {
    ja: string[];
    en: string[];
  };
};

export const updateNotes: UpdateNote[] = updatesJson as UpdateNote[];

export function getSortedUpdateNotes(): UpdateNote[] {
  return [...updateNotes].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getLatestUpdateNote(): UpdateNote | null {
  const sorted = getSortedUpdateNotes();
  return sorted.length > 0 ? sorted[0] : null;
}
