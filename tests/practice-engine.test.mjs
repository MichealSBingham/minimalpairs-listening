import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignSessionVoices, buildSession, revisitMistake } from '../src/lib/practice-engine.ts';

const pairs = Array.from({ length: 5 }, (_, index) => ({ id: `pair-${index}`, kind: 'minimal', words: [{ text: `a${index}`, ipa: '', meaning: '' }, { text: `b${index}`, ipa: '', meaning: '' }] }));
function seeded(seed) { let state = seed; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }
const normalize = text => text.normalize('NFC').trim().toLowerCase();
function cellCounts(queue) {
  return queue.reduce((cells, question) => {
    const answer = question.order.indexOf(question.target);
    const key = `${question.referenceVoiceId}/${answer}/${question.target}`;
    cells[key] = (cells[key] || 0) + 1; return cells;
  }, {});
}

test('cross-word sessions balance targets and answers and use a different word for X', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const queue = buildSession(pairs, 12, seeded(seed));
    assert.equal(queue.length, 12);
    assert.equal(queue.filter(question => question.target === 0).length, 6);
    assert.equal(queue.filter(question => question.order[0] === question.target).length, 6);
    assert.equal(new Set(queue.slice(0, pairs.length).map(question => question.pair.id)).size, pairs.length);
    const counts = pairs.map(pair => queue.filter(question => question.pair.id === pair.id).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    for (const pair of pairs) {
      const appearances = queue.filter(question => question.pair.id === pair.id);
      assert.ok(Math.abs(appearances.filter(question => question.target === 0).length - appearances.filter(question => question.target === 1).length) <= 1);
    }
    for (let index = 1; index < queue.length; index++) assert.notEqual(queue[index].pair.id, queue[index - 1].pair.id);
    for (const question of queue) {
      assert.deepEqual([...question.order].sort(), [0, 1]);
      assert.notEqual(question.pair.id, question.testPair.id);
      assert.ok(question.pair.words.every(word => normalize(word.text) !== normalize(question.testPair.words[question.target].text)));
    }
  }
});

test('voice profile identity is balanced against correct A/B response and phoneme category', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const queue = assignSessionVoices(buildSession(pairs, 12, seeded(seed)), ['profile-one', 'profile-two'], seeded(seed + 400));
    for (const profile of ['profile-one', 'profile-two']) {
      assert.equal(queue.filter(question => question.referenceVoiceId === profile).length, 6);
      for (const side of [0, 1]) {
        assert.equal(queue.filter(question => question.referenceVoiceId === profile && question.order.indexOf(question.target) === side).length, 3);
        assert.equal(queue.filter(question => question.referenceVoiceId === profile && question.target === side).length, 3);
      }
    }
    for (const question of queue) assert.notEqual(question.referenceVoiceId, question.testVoiceId);
  }
});

test('repeated reference pairs do not force target-category alternation', () => {
  const observed = new Set();
  let repeatedSameCategory = false;
  for (let seed = 1; seed <= 50; seed++) {
    const queue = buildSession(pairs.slice(0, 2), 12, seeded(seed));
    const targets = queue.filter(question => question.pair.id === pairs[0].id).map(question => question.target);
    assert.equal(targets.filter(target => target === 0).length, 3);
    assert.equal(targets.filter(target => target === 1).length, 3);
    observed.add(targets.join(''));
    if (targets.some((target, index) => index > 0 && targets[index - 1] === target)) repeatedSameCategory = true;
  }
  assert.ok(repeatedSameCategory, 'An earlier target cannot determine the next by a mandatory flip');
  assert.ok(observed.size >= 5, 'Balanced per-pair target orders vary across sessions');
});

test('mistake review preserves completed rounds and all voice/category/answer cells', () => {
  const queue = assignSessionVoices(buildSession(pairs, 12, seeded(1)), ['one', 'two'], seeded(2));
  const original = JSON.stringify(queue);
  const next = revisitMistake(queue, 2, 3);
  assert.equal(next.length, 12);
  assert.deepEqual(next.slice(0, 5), queue.slice(0, 5));
  const expectedIndex = queue.findIndex((question, index) => index >= 5 && question.target === queue[2].target);
  assert.ok(expectedIndex >= 5);
  assert.equal(next[expectedIndex].pair.id, queue[2].pair.id);
  assert.equal(next[expectedIndex].testPair.id, queue[2].testPair.id);
  assert.equal(next[expectedIndex].target, queue[2].target);
  assert.deepEqual(cellCounts(next), cellCounts(queue));
  assert.equal(JSON.stringify(queue), original);
});

test('late mistakes never extend the session or overwrite completed work', () => {
  const queue = buildSession(pairs, 12, seeded(20));
  assert.deepEqual(revisitMistake(queue, 10, 3), queue);
  assert.deepEqual(revisitMistake(queue, -1, 3), queue);
});

test('insufficient content cannot silently fall back to same-word identification', () => {
  assert.deepEqual(buildSession([]), []);
  assert.deepEqual(buildSession(pairs, 0), []);
  assert.deepEqual(buildSession(pairs.slice(0, 1)), []);
  const sameWords = pairs.slice(0, 2).map((pair, index) => ({ ...pair, id: `same-${index}`, words: pairs[0].words }));
  assert.deepEqual(buildSession(sameWords), []);
  assert.equal(buildSession(pairs, 3).length, 3);
});

test('repeated spellings are excluded from X even with case, spacing or Unicode differences', () => {
  const overlapping = [
    { ...pairs[0], id: 'one', words: [{ text: 'Shared', ipa: '', meaning: '' }, { text: 'first', ipa: '', meaning: '' }] },
    { ...pairs[0], id: 'two', words: [{ text: ' shared ', ipa: '', meaning: '' }, { text: 'second', ipa: '', meaning: '' }] },
    { ...pairs[0], id: 'three', words: [{ text: 'third', ipa: '', meaning: '' }, { text: 'fourth', ipa: '', meaning: '' }] },
  ];
  for (const question of buildSession(overlapping, 12, seeded(12))) {
    const x = normalize(question.testPair.words[question.target].text);
    assert.ok(question.pair.words.every(word => normalize(word.text) !== x));
  }
});

test('all curated contrasts produce cross-word ABX with target position/trial group preserved', () => {
  const data = JSON.parse(readFileSync(new URL('../../content/curriculum.json', import.meta.url), 'utf8'));
  const languages = Array.isArray(data) ? data : data.languages;
  assert.equal(languages.length, 8);
  for (const language of languages) for (const contrast of language.contrasts) {
    for (let seed = 1; seed <= 12; seed++) {
      const queue = buildSession(contrast.pairs, 12, seeded(seed));
      assert.equal(queue.length, 12, `${language.id}/${contrast.id} needs distinct eligible X words`);
      for (const question of queue) {
        assert.equal(question.pair.abx?.trialGroup || 'all', question.testPair.abx?.trialGroup || 'all');
        assert.notEqual(question.pair.id, question.testPair.id);
        assert.ok(question.pair.words.every(word => normalize(word.text) !== normalize(question.testPair.words[question.target].text)));
        assert.deepEqual(question.pair.abx?.categoryByWordIndex, [0, 1]);
        assert.deepEqual(question.testPair.abx?.categoryByWordIndex, [0, 1]);
      }
    }
  }
});

test('no synthetic identity claims or extra voices are invented', () => {
  const queue = buildSession(pairs, 12, seeded(5));
  assert.ok(assignSessionVoices(queue, []).every(question => question.referenceVoiceId === undefined && question.testVoiceId === undefined));
  assert.ok(assignSessionVoices(queue, ['only']).every(question => question.referenceVoiceId === 'only' && question.testVoiceId === 'only'));
  const varied = assignSessionVoices(queue, ['a', 'b', 'c', 'd'], seeded(3));
  assert.equal(new Set(varied.map(question => question.referenceVoiceId)).size, 2);
  assert.ok(varied.every(question => ['a', 'b', 'c', 'd'].includes(question.referenceVoiceId)));
});
