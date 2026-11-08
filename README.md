# MinimalPairs Listening

An offline ear-training game for English learners who want to hear the difference between words such as *ship* and *sheep*. Listen to A and B and then a different word, X. Pick the example with the same vowel. The game reveals the words and replays the correct match.

## Play

Use Node.js 22.18 or later and a local English voice. macOS provides the `say` command. Linux users need eSpeak installed as `espeak`. From a terminal in the repository, run:

```sh
npm start
```

Type A or B after the three words. Press Enter to hear the round again or Q to quit. A session contains six rounds. No package installation, account, network service, microphone, or credentials are needed. Answers stay in memory until the session ends.

## Development

The TypeScript engine builds cross-word listening rounds, schedules mistake revisits and supports two-choice word identification. The JavaScript terminal demo uses the bundled English word pairs and the system voice. Run `npm test` to check round selection, word matching and voice assignment.

The engine and its relevant Git history were extracted from the original MinimalPairs project. The standalone demo and sample fixtures were added for this release. The production web service and paid recordings are outside this project.

Planned work includes additional vowel contrasts, a local word-bank importer with validation, keyboard-accessible browser playback, and testing across local voices and devices. Code in this repository is licensed under MPL 2.0.
