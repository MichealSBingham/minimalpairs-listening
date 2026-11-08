import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { buildSession } from './src/lib/practice-engine.ts';
import { pairs } from './words.mjs';

const program = process.platform === 'darwin' ? 'say' : 'espeak';
function play(word) {
  const result = spawnSync(program, [word], {stdio:'inherit'});
  if (result.error || result.status !== 0) throw new Error('Playback failed. Check that '+program+' and a local English voice are installed.');
}
async function practice() {
  const terminal = createInterface({input:stdin,output:stdout});
  let correct = 0;
  try {
    const rounds = buildSession(pairs, 6);
    console.log('Which example shares the vowel in X? Listen to A, B and X.');
    for (const [index, round] of rounds.entries()) {
      const references = round.order.map(side => round.pair.words[side]);
      const target = round.testPair.words[round.target];
      let answer;
      do {
        for (const [label,word] of [['A',references[0]],['B',references[1]],['X',target]]) {
          console.log(label); play(word.text);
        }
        answer = (await terminal.question('Round '+(index+1)+' of 6. A or B? Enter to replay, Q to quit: ')).trim().toUpperCase();
        if (answer === 'Q') return;
      } while (!['A','B'].includes(answer));
      const side = round.order.indexOf(round.target);
      const hit = answer === ['A','B'][side];
      correct += Number(hit);
      console.log((hit?'Correct. ':'')+target.text+' shares its vowel with '+references[side].text+'.');
      play(target.text); play(references[side].text);
    }
    console.log(correct+' of '+rounds.length+' correct.');
  } finally {terminal.close();}
}
practice().catch(error=>{console.error(error.message);process.exitCode=1;});
