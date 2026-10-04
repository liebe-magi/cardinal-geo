import { expect, test } from 'bun:test';
import { cities } from '../src/cities';
import { calculateDirection, checkAnswer, normalizePair } from '../src/lib/quiz';
import { readPresentation, snapshotPresentation } from '../src/lib/presentation';

test('both presentation orders preserve full, partial and wrong answers independently of normalized pair', () => {
  const us = cities.find((c) => c.countryCode === 'US')!;
  const jp = cities.find((c) => c.countryCode === 'JP')!;
  for (const [cityA, cityB] of [
    [us, jp],
    [jp, us],
    [
      { ...us, lat: 0, lon: 0 },
      { ...jp, lat: 0, lon: 10 },
    ],
    [
      { ...jp, lat: 0, lon: 10 },
      { ...us, lat: 0, lon: 0 },
    ],
    [
      { ...us, lat: 10, lon: 0 },
      { ...jp, lat: 0, lon: 0 },
    ],
  ]) {
    const correctDirection = calculateDirection(cityA, cityB);
    const saved = readPresentation(snapshotPresentation({ cityA, cityB, correctDirection }))!;
    expect(saved.cityACode).toBe(cityA.countryCode);
    expect(saved.cityBCode).toBe(cityB.countryCode);
    expect(saved.correctDirection).toEqual(correctDirection);
    expect(normalizePair(cityA, cityB)).toEqual(normalizePair(cityB, cityA));
    for (const answer of [
      correctDirection,
      { ...correctDirection, ns: correctDirection.ns === 'N' ? 'S' : 'N' },
      { ns: correctDirection.ns === 'N' ? 'S' : 'N', ew: correctDirection.ew === 'E' ? 'W' : 'E' },
    ])
      expect(checkAnswer(answer, saved.correctDirection)).toEqual(
        checkAnswer(answer, correctDirection),
      );
  }
});

test('legacy and incomplete snapshots remain unknown even if the answer was correct', () => {
  expect(readPresentation({})).toBeNull();
  expect(readPresentation({ presented_target_code: 'JP' })).toBeNull();
});
