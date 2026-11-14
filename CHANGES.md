# Debate Buddy (adapted from YOGI)

Debate Buddy keeps the local server, launchers, storage approach and the Core, Glass and Marigold interfaces, and replaces the general assistant with a debate-only product. The original local Codex integration described in earlier notes has since been removed; AI now uses Vercel AI Gateway.

## What changed
- **Identity:** renamed throughout (pages, launchers, docs, config, storage keys, engine instructions). The face, wake word, plugins, skills, chess, image tools, email, uploads and general chat were removed.
- **Navigation:** Debate, Research, Practice, Topics, Progress, History, Settings. The band that held the face is now a "brief" showing the topic, format, side or country, level, round or committee activity, and the speaking timer.
- **Formats:** For / Against (side required; the AI argues the other side for N rounds), Group Discussion (2 to 5 named participants with consistent views, moderated), and MUN (committee, country, delegates, activities from opening statements to closing and vote).
- **Difficulty:** Beginner, Intermediate and Advanced change vocabulary, argument depth, rebuttal strength, pace, coaching and, for MUN, procedural realism. The setup screen lists what changes.
- **Practice controls:** start, pause, continue, hints (MUN: point, response or motion), let others speak, move committee, end and review. Sessions survive refreshes.
- **Research:** a sectioned workspace for any format with evidence labels (Verified, Sourced, Analysis, Background), a search counter, a source list, a research plan and a printable revision sheet. Without the engine, an offline template with search queries and search links is built instead and labelled as such.
- **Offline mode:** the launcher and server start without an AI connection. A solo drill with self-assessment works offline.
- **Cross-platform:** macOS opens the browser with `open -a`; Node is found in Homebrew, nvm and Volta locations; Edge is a fallback browser; time zone comes from the browser instead of a fixed Indian time zone; Windows scripts keep CRLF line endings.

## Main files
`debate-coach.mjs` (formats, difficulty, prompts), `server.mjs`, `ai.mjs`, `launcher.mjs`, `runtime-locator.mjs`, `public/index.html`, `public/app.js`, `public/debate.css`, `public/topics.js`, `public/research-offline.js`, `public/voice.js`.

## Second round
- **Face restored** (dot matrix, orb or illustrated, per interface) at the top of the brief. It speaks each AI turn aloud and becomes the speaker's country flag for MUN delegates. Each speaker has their own browser voice and pitch. Press the face or a bubble's play button to replay.
- **Bubbles per speaker:** every participant or delegation gets its own colour for the session, with a flag avatar for countries. The bubble being read is highlighted.
- **Speaking clock** no longer runs while the other side is writing or speaking. It starts when narration ends or when you start typing, and pauses when the tab is hidden.
- **Research workspace redesigned:** a plain-language brief (new prompt) shown in tabs: Overview with an "In short" summary, Arguments side by side, Plan & sources with source cards, Cheat sheet. Evidence labels read "Checked", "Source", "Our take" and "Verify".
- **Ask a question:** a chat box under every research brief answers follow-up questions about the topic, with suggested starters. Questions and answers are saved with the brief.
- **History redesigned:** cards grouped by day with a plain description (what it is, how far it got, score) and a clear Continue / Open / See review button, plus search.

## Phone access
- **Settings > Use on your phone** opens a second, key-protected listener on the local network and shows a QR code. The phone needs only a browser; the key is stored in `work/phone.json`, kept in an HttpOnly cookie on the phone, and can be replaced with "New link". Phone access survives restarts until turned off.
- Phones cannot change computer settings (phone access, ElevenLabs key).
- Works over plain http: IDs no longer need `crypto.randomUUID`, dictation hides itself where the browser blocks the microphone, and the app can be added to the home screen (web manifest and icons).
- Phone layout tightened so the conversation gets most of the screen.

- **Updates:** the launcher now notices when an older server from the same folder is still running, stops it and starts the new one, so new features (like phone access) appear without a manual restart.

## Phone round two
- **Phone layout:** app-style header, a bottom tab bar (Debate, Research, Practice, History, Settings; Topics and Progress are linked from Debate and History), one-column screens, a sticky "Set up practice / Prepare research" bar, scrollable category chips, a slim speaker strip in Practice (face, speaker and clock), compact controls and composer, and 16 px inputs so iOS does not zoom. All three looks are covered.
- **Voice on phones:** speech and audio are unlocked on the first tap (phones block sound that a tap did not start), one audio element is reused for ElevenLabs clips, device voices are preferred, and blocked speech now shows a message instead of failing silently.

## Build step 1: first screen
- **Difficulty on the first screen:** the Debate screen now has a "Choose a difficulty" control (Beginner, Intermediate, Advanced) under the format cards, with a one-line note on what the level changes. It is the same setting as the one in Practice setup, so the two always match, and the chosen level shows in the brief and in the "Ready" line.
- **Phone fix:** the category chip row no longer makes the whole Debate screen scroll sideways on narrow screens; only the chips scroll.
- Files changed: `public/index.html`, `public/app.js`, `public/debate.css`, this file and `SHA256SUMS.txt`. Nothing was deleted.

## Build step 2: Git safety and Supabase connection
- **Ignore rules:** `.gitignore` keeps `.env` (and `.env.txt`, `env`, `env.txt`), `work/`, `workspace/`, `.runtime/` and `node_modules/` out of Git. `.env.example` stays tracked and must only ever hold empty placeholders. `.gitattributes` keeps the Windows launchers on CRLF and the macOS/Linux ones on LF.
- **Supabase connection (server side only):** new `supabase.mjs` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `.env`, and `server.mjs` exposes `/api/supabase`, which reports only whether the project is reachable. The key is never sent to the browser. Secret (service role) keys are refused. Settings shows the status with a "Check connection" button.
- **Not done yet:** nothing is read from or written to Supabase. Sessions and settings are still saved in the browser only.
- Files added: `.gitignore`, `.gitattributes`, `supabase.mjs`. Files changed: `server.mjs`, `server.bundle.mjs` (rebuilt), `public/index.html`, `public/app.js`, `.env.example`, `package.json`, `START HERE.txt`, this file and `SHA256SUMS.txt`.

## Build step 3: accounts, cloud sync and shared topics
- **Packages:** `@supabase/supabase-js` and `@supabase/ssr` (in `package.json`). They are bundled into `server.bundle.mjs`, so running the app still needs no `npm install`.
- **Client file:** `supabase-client.mjs` builds a server-side client per request with `@supabase/ssr`; the session is kept in HttpOnly cookies. There is deliberately no browser client and no Next.js middleware: this is not a Next.js app, and keeping Supabase on the server keeps the key and tokens out of frontend code.
- **Settings file:** `.env.local` (empty placeholders, ignored by Git) holds `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The `NEXT_PUBLIC_` names and a filled-in `.env` from the previous step are still read.
- **Database:** `supabase/schema.sql` creates `profiles`, `debate_sessions` and `shared_topics`, each with Row Level Security.
- **Sign-in:** Settings > Account and cloud sync (email and password; create account, sign in, sign out).
- **Sync:** `public/cloud.js` uploads changed sessions and research a few seconds after each save and pulls changes from other devices on start, on "Sync now" and when the tab is reopened. Deletions sync too. Progress is worked out from sessions, so it follows automatically.
- **Shared topics:** teacher accounts get an "Add a topic for your students" form on the Topics tab. Signed-in students see those topics first on the Debate screen and under "From your teacher".
- Files added: `supabase-client.mjs`, `cloud.mjs`, `public/cloud.js`, `supabase/schema.sql`, `.env.local`, `package-lock.json`. Files changed: `server.mjs`, `server.bundle.mjs`, `supabase.mjs`, `env-file.mjs`, `public/index.html`, `public/app.js`, `public/debate.css`, `.env.example`, `.gitignore`, `package.json`, `START HERE.txt`. Nothing was deleted.

## Build step 4: sign-in required, settings follow the account
- **Sign-in screen:** the app opens on a sign-in screen (`#authGate` in `public/index.html`) and the rest of the page is inert until someone signs in. Signing out brings it back. The sign-in form moved there from Settings.
- **Server check:** `/api/chat` and `/api/tts` now refuse requests without a signed-in session (`signInProblem` in `cloud.mjs`).
- **Settings sync:** `public/cloud.js` saves `preferences` (interface, theme, colours, background, cursor, voice), `setup` (difficulty and practice defaults) and small background photos to a new `user_settings` table, and loads them at sign-in.
- **Database:** `supabase/schema.sql` adds `user_settings` with Row Level Security (own row only). Run the file again in the SQL Editor.
- Files changed: `cloud.mjs`, `server.mjs`, `server.bundle.mjs`, `public/cloud.js`, `public/app.js`, `public/index.html`, `public/debate.css`, `supabase/schema.sql`, `START HERE.txt`. Nothing was deleted.

## Build step 5: Ask AI (Vercel AI SDK and AI Gateway)
- **Package:** `ai` (the Vercel AI SDK), bundled into `server.bundle.mjs`. The build script gained a small banner so the bundled packages load correctly.
- **Server:** `ai.mjs` sends one question to the Vercel AI Gateway with `generateText` and returns the answer. `server.mjs` exposes it as `POST /api/ask`, for signed-in people only, with a limit of 20 questions per person every 10 minutes. The key (`AI_GATEWAY_API_KEY` in `.env.local`) never reaches the browser.
- **Page:** a new "Ask AI" tab with a question box, an Ask button and the answer.
- **Rules given to the AI:** debate topics only; no invented sources, statistics or country positions; say what needs checking.
- **Small fixes:** the History page no longer says everything stays in the browser when you are signed in, and a background photo too large to sync is no longer removed when settings arrive from the account.
- Files added: `ai.mjs`. Files changed: `server.mjs`, `server.bundle.mjs`, `cloud.mjs`, `public/index.html`, `public/app.js`, `public/cloud.js`, `public/debate.css`, `.env.example`, `package.json`, `package-lock.json`, `START HERE.txt`. Nothing was deleted.

- **Step 5 follow-up:** the Ask AI page now tells a rejected key (401) apart from an account-level refusal (403) and shows the gateway's own reason for the latter.
