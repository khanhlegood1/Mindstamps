# Memory social actions (#home)

- Only the original owner sees Edit and can update/delete their memory.
- Each signed-in user has at most one reaction (`like` or `love`) per memory.
  Clicking the active reaction removes it; choosing the other switches it.
- Share uses the OS share sheet when available, clipboard otherwise, and a
  selectable URL if clipboard access fails. Links use `#home?memory=<id>`;
  signed-out visitors sign in before the Home detail opens.
- Fork saves a new owned copy; Remix saves a copy and opens its editor.
  Both copy all game versions and credit the immediate source memory/owner.
  Copies remain in the journal even if remix editing is cancelled.
- Reaction counts use a realtime subcollection listener, not editable counters
  on the source memory. This loads all reactions; large-scale feeds would need
  server-maintained aggregate counts.

## Deployment

Deploy **both** the frontend and `firestore.rules`. Vercel only builds the
frontend. With Firebase CLI authenticated to the correct project, run:

```sh
firebase deploy --only firestore:rules --project <your-project-id>
```

Without the new rules, reaction writes/reads are denied. Do not replace these
rules with globally open writes.

## Verification

```sh
node --test tests/memorySocial.test.js
npm run build
```

Manual test with two accounts after rules deployment:
1. A creates a memory with multiple games. B opens it on Home: no Edit.
2. B toggles Like, then Love, then Love again: counts switch and clear; refresh
   and confirm persistence. A sees the same counts.
3. B shares the URL; open it in another tab, sign in if needed, verify the exact
   memory opens (also test changing between two share links).
4. B forks: new owned copy, source credit, all games playable; A's original is
   unchanged. Copy is available in B's journal.
5. B remixes: edit opens on the copy; save edits and verify original unchanged.
6. Verify Firestore rejects B updating A's memory (including an attempted
   userId takeover), B deleting A's memory, or B writing A's reaction.

Automated helper tests and build do not substitute for Firebase rules emulator
or live two-account tests; those require a configured Firebase environment.
