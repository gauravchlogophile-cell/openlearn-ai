# Sky's voice

Asked for on 16 October 2026: "give Sky a voice of its own", and Sky's sounds were silent.

## What was wrong with the sound

A browser will not play sound until the person has touched the page, and Safari requires the audio
context to be resumed inside the tap. Sky's chime was created after the fact (when a lesson
finished), stayed suspended and was dropped. It was also off by default, a setting few would find,
and quiet. Now: the context is unlocked on the first tap or key press anywhere (`unlockAudio()` in
`src/lib/sky-fx.js`), sound is on by default at a level audible on a phone speaker, and a speaker
button in Sky's header turns all of it off in one tap. On an iPhone the silent switch on the side
still silences it; Sky's settings say so.

## What "its own voice" means today

Three layers (`src/lib/sky-voice.js`), best first:

1. **A recorded voice**, if `/sky/voice/index.json` maps a line id to an audio file. None exists yet.
2. **A voice the reader picks** from their device's voices, with a "Hear Sky" button.
3. **A character voice** when nothing is picked: the brightest natural English voice on the device,
   lifted slightly in pitch and pace, opened by Sky's two-note chirp.

This is honest but not final. A device voice is still the device's; a network voice may ignore
pitch. Sky sounds the same everywhere only with a recording.

## Recording Sky

To give Sky one real voice on every device, record these lines (a friendly adult voice, warm,
unhurried; no exclamation, in keeping with Sky's tone), export AAC `.m4a` (plays on every iPhone),
and list them in `public/sky/voice/index.json` as `{ "lesson": "/sky/voice/lesson.m4a", ... }`.
The ids are the cheer kinds in `src/lib/sky-fx.js` (`lesson`, `quiz`, `cards`, `level`, `badge`,
`streak`, `star`, `open`). The text for each is the first line of `CHEERS[id]`:

- open: "Good to see you. Small steps count."
- lesson: "Lesson done. Nicely finished."
- quiz: "Quiz finished. Well done for sticking with it."
- cards: "Cards reviewed. Going back over things is what makes them stay."
- level: "You reached a new level."
- badge: "You earned a badge."
- streak: "Your streak just grew."
- star: "You caught a star."

Sky speaks them when the recording exists, and falls back to a device voice for any line without one.
The narrator is named and consents, as in `narration.md`.

## Rules that do not change

Sky never talks over a lesson being read aloud. It speaks only after the reader has switched
sound on (default on, one tap off). Spoken lines are the same calm lines that appear as text, so
nothing is only in audio.
