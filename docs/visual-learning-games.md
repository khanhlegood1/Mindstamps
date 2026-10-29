# Visual action game versions

The shared LearningGamePanel (create / journal edit / Home edit) now offers a
fixed genre select: auto, action, the existing five educational styles, and
**custom description** as the last option. An explicit choice takes precedence
over automatic rotation. Auto never chooses custom because it requires input.

Action gameplay is a standalone, offline HTML/CSS/JS arcade: move the large
emoji character with arrows/A/D, touch buttons, or dragging. Collect falling
illustrated objects, avoid marked hazards, see educational feedback, win at ten
collectibles or lose after three hits. Pause/replay are supported. A memory
photo supplies the stage background; AI supplies themed emoji, labels, and
lessons, not arbitrary image URLs or code.

Custom descriptions are limited to 1000 characters, stored explicitly as
`version.spec.customDescription`, and displayed in every shared version row
and the exported HTML. They never become global dropdown entries. The current
custom mode adapts subject matter to the **same collect/dodge mechanic**, not an
arbitrary new engine. UI explicitly documents this limitation.

Reference reviewed: ai-doctor-admin3 BringAnyIdeaToLifePanel.jsx and its
api/_lib/bringAnyIdeaToLifeProxy.js system instruction: derive a visual,
functional interactive experience from source material, not static text.
Unlike that reference's raw code generation, this implementation retains the
existing JSON-spec architecture and sandbox allow-scripts (no same-origin).
No generated HTML is stored in Firestore. Existing styles, six-version cap,
delete confirmation, lazy player, fullscreen and HTML download remain intact.

Verification:
- `node --test tests/*.test.js`: version round-trip, injection escaping,
  VM-executed action runtime (movement, score, victory, damage, pause, replay),
  mocked Groq endpoint selection/custom metadata/input validation, legacy quiz.
- Changed-file ESLint and Vite production build.
- Not yet tested with real AI credentials or real browser touch input.

Manual QA: create one action and one custom version with a photo; save and
reload; open on Home, Journal, Play and signed-out globe; verify explicit custom
description and all game versions; test touch, keyboard, pause, fullscreen,
HTML download offline, and deletion of just one version.
