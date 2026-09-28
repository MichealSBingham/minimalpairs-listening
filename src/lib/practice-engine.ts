import type { Pair } from './types';

export type WordIndex = 0 | 1;
export type PracticeQuestion = { pair: Pair; testPair: Pair; target: WordIndex; order: [WordIndex, WordIndex]; referenceVoiceId?: string; testVoiceId?: string };
type Random = () => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const normalize = (word: string) => word.normalize('NFC').trim().toLocaleLowerCase();
function testCandidates(pairs: readonly Pair[], reference: Pair, target: WordIndex): Pair[] {
  const references = new Set(reference.words.map(word => normalize(word.text)));
  return pairs.filter(pair => pair.id !== reference.id && (pair.abx?.trialGroup || 'all') === (reference.abx?.trialGroup || 'all') && !references.has(normalize(pair.words[target].text)));
}

/** Cross-word ABX: A/B are references; X is a new word in the target category. */
export function buildSession(pairs: readonly Pair[], length = 12, random: Random = Math.random): PracticeQuestion[] {
  if (!pairs.length || length <= 0) return [];
  const eligiblePairs = pairs.filter(pair => testCandidates(pairs, pair, 0).length && testCandidates(pairs, pair, 1).length);
  if (!eligiblePairs.length) return [];
  const count = Math.floor(length);
  const targetPositions = shuffle(Array.from({ length: count }, (_, index) => index % 2 as WordIndex), random);
  const selectedPairs: Pair[] = [];
  while (selectedPairs.length < count) {
    const cycle = shuffle(eligiblePairs, random);
    if (cycle.length > 1 && selectedPairs.at(-1)?.id === cycle[0].id) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    selectedPairs.push(...cycle.slice(0, count - selectedPairs.length));
  }
  const pairCounts = new Map<string, number>();
  selectedPairs.forEach(pair => pairCounts.set(pair.id, (pairCounts.get(pair.id) || 0) + 1));
  const oddPairIds = shuffle([...pairCounts].filter(([, occurrences]) => occurrences % 2).map(([id]) => id), random);
  const firstTargets = new Map<string, WordIndex>();
  oddPairIds.forEach((id, index) => firstTargets.set(id, index % 2 as WordIndex));
  const perPairTargets = new Map<string, WordIndex[]>();
  pairCounts.forEach((occurrences, id) => {
    const first = firstTargets.get(id) ?? (random() < 0.5 ? 0 : 1);
    perPairTargets.set(id, shuffle(Array.from({ length: occurrences }, (_, index) => ((first + index) % 2) as WordIndex), random));
  });
  const seen = new Map<string, number>();
  return selectedPairs.map((pair, index) => {
    const occurrence = seen.get(pair.id) || 0;
    const target = perPairTargets.get(pair.id)![occurrence];
    seen.set(pair.id, occurrence + 1);
    const order: [WordIndex, WordIndex] = targetPositions[index] === target ? [0, 1] : [1, 0];
    const candidates = testCandidates(pairs, pair, target);
    const testPair = candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
    return { pair, testPair, target, order };
  });
}

/** Two voice profiles are counterbalanced against category and correct A/B answer. */
export function assignSessionVoices(questions: readonly PracticeQuestion[], voiceIds: readonly string[], random: Random = Math.random): PracticeQuestion[] {
  const selected = shuffle([...new Set(voiceIds)], random).slice(0, 2);
  if (selected.length < 2) return questions.map(question => ({ ...question, referenceVoiceId: selected[0], testVoiceId: selected[0] }));
  const groups = [0, 1].map(answer => [0, 1].map(category => shuffle(questions.map((question, index) => ({ question, index })).filter(({ question }) => question.order.indexOf(question.target) === answer && question.target === category).map(({ index }) => index), random)));
  const answerTotals = groups.map(row => row[0].length + row[1].length);
  const categoryZeroTotal = groups[0][0].length + groups[1][0].length;
  const answerZeroHalf = Math.floor(answerTotals[0] / 2);
  const answerOneHalf = Math.floor(answerTotals[1] / 2);
  const categoryZeroHalf = Math.floor(categoryZeroTotal / 2);
  const feasible: number[] = [];
  for (let n = 0; n <= groups[0][0].length; n++) {
    const cells = [[n, answerZeroHalf - n], [categoryZeroHalf - n, answerOneHalf - categoryZeroHalf + n]];
    if (cells.every((row, a) => row.every((value, c) => value >= 0 && value <= groups[a][c].length))) feasible.push(n);
  }
  const chosen = feasible[Math.floor(random() * feasible.length)] ?? 0;
  const quotas = [[chosen, answerZeroHalf - chosen], [categoryZeroHalf - chosen, answerOneHalf - categoryZeroHalf + chosen]];
  const assignments = new Map<number, number>();
  groups.forEach((row, a) => row.forEach((indices, c) => indices.forEach((index, offset) => assignments.set(index, offset < quotas[a][c] ? 0 : 1))));
  return questions.map((question, index) => { const profile = assignments.get(index) || 0; return { ...question, referenceVoiceId: selected[profile], testVoiceId: selected[1 - profile] }; });
}

/** Revisit a mistake after two other rounds while retaining category/voice/answer balance. */
export function revisitMistake(questions: readonly PracticeQuestion[], answeredIndex: number, gap = 3): PracticeQuestion[] {
  const next = [...questions];
  if (answeredIndex < 0 || !questions[answeredIndex]) return next;
  const question = questions[answeredIndex];
  const reviewIndex = questions.findIndex((candidate, index) => index >= answeredIndex + Math.max(1, Math.floor(gap)) && candidate.target === question.target);
  if (reviewIndex < 0) return next;
  next[reviewIndex] = { ...questions[reviewIndex], pair: question.pair, testPair: question.testPair };
  return next;
}
