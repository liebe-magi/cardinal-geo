import type { Question, QuadDirection } from '../types/game';

export interface PresentationSnapshot {
  presented_target_code: string | null;
  presented_origin_code: string | null;
  presented_correct_ns: 'N' | 'S' | null;
  presented_correct_ew: 'E' | 'W' | null;
}

export function snapshotPresentation(question: Question): PresentationSnapshot {
  return {
    presented_target_code: question.cityA.countryCode,
    presented_origin_code: question.cityB.countryCode,
    presented_correct_ns: question.correctDirection.ns,
    presented_correct_ew: question.correctDirection.ew,
  };
}

export function readPresentation(row: Partial<PresentationSnapshot>): {
  cityACode: string;
  cityBCode: string;
  correctDirection: QuadDirection;
} | null {
  if (
    !row.presented_target_code ||
    !row.presented_origin_code ||
    !row.presented_correct_ns ||
    !row.presented_correct_ew
  )
    return null;
  return {
    cityACode: row.presented_target_code,
    cityBCode: row.presented_origin_code,
    correctDirection: { ns: row.presented_correct_ns, ew: row.presented_correct_ew },
  };
}
