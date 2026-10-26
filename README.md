# Mindstamps

A cozy, journal-style memory map: write down a memory with its story, photo or
Street View, and the place it happened, then replay your collection as a
location-guessing game.

Built with React 19 + Vite, Tailwind CSS v4, Firebase (Auth/Firestore),
Mapbox/Google Maps and Groq/Gemini serverless AI endpoints.

## Features

- **Journal memories** — title, story, photo (or live Street View) and a pinned
  map location, saved to Firestore.
- **Guessing game** — flip through your memories and guess where each one
  happened on the map; score by distance.
- **Video link + AI learning spec** — paste a YouTube link and generate a
  learning-page spec from its captions (`api/video-to-learning.js`).
- **🎮 Educational game generator** — from a memory's video link, title, story
  and photo, AI builds a self-contained quiz game that explains the video's
  lesson through the lens of your own memory. You can play it immediately in an
  embedded iframe, re-generate it, or download the single-file HTML. The JSON
  game spec is stored on the memory (Firestore field `learningGame`); the HTML
  is rendered client-side on every play, so nothing large is persisted.

## AI architecture

`api/learning-game.js` (and `api/video-to-learning.js`) run as Vercel
Serverless Functions and keep all AI keys server-side:

1. If a YouTube link is present, its captions are fetched for free
   (`api/_lib/youtubeTranscript.js`, no AI key needed).
2. **Groq is tried first** (free tier): a vision model when a photo is attached,
   otherwise a text model — both answer with a strict JSON game spec.
3. **Gemini is the fallback** when Groq fails or the video has no captions; it
   can watch the YouTube video and read the photo directly (multimodal).

The client never calls Groq/Gemini directly.

## Environment variables

Copy `.env.example` and fill in the values. Client-side variables are prefixed
with `VITE_`; the AI keys are server-only and must never use that prefix.

| Variable | Where | Required |
| --- | --- | --- |
| `VITE_FIREBASE_*` | client | yes |
| `VITE_MAPBOX_TOKEN` | client | yes |
| `VITE_GOOGLE_MAPS_API_KEY` | client | optional (Street View) |
| `GROQ_API_KEY` | server | one of the two AI keys |
| `GEMINI_API_KEY` | server | fallback when Groq is unavailable |

Set the two AI keys in **Vercel → Settings → Environment Variables** and
redeploy. Both serverless functions are configured with `maxDuration: 120` in
`vercel.json` because video analysis can take a while.

## Local development

```bash
npm install
npm run dev
```

Note: the `/api/*` endpoints are Vercel Serverless Functions — plain
`vite dev` does not execute them, so the AI buttons need `vercel dev` (or a
deployed Vercel preview) to work. Everything else runs normally under Vite.

## Other scripts

- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run preview` — preview the production build
