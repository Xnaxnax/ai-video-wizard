# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

This project uses **Next.js 16.2.4** — a version with breaking changes that may differ significantly from training data. Before writing any Next.js-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices; do not assume APIs from older versions work here.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run lint     # ESLint
```

No test suite is configured.

## Environment variables

| Variable | Purpose | Fallback |
|---|---|---|
| `OPENAI_API_KEY` | Script generation (gpt-4o / gpt-4o-mini) + legacy image fallback | Mock provider |
| `KIE_API_KEY` | Stage 1 image generation via kie.ai Nano Banana Pro (Gemini 3 Pro Image) | Falls back to OpenAI gpt-image-1.5 |
| `USEAPI_TOKEN` | Animation via useapi.net (Google Veo) | Mock provider |
| `USEAPI_EMAIL` | Required alongside USEAPI_TOKEN | — |
| `GOOGLE_FLOW_VOICE` | Voice for animations | `"zephyr"` |

Without `OPENAI_API_KEY` the app runs with mock providers that return placeholder data.

Image provider selection (`src/core/providers/index.ts`): if `KIE_API_KEY` is set, `KieNanoBananaProvider` is used (better character consistency, ~3x cheaper than gpt-image-1.5). Otherwise `OpenAIImageProvider` is used as fallback.

## Data persistence

**Prisma and PostgreSQL are not active** — despite being in `package.json`, all data goes through `src/lib/store.ts`, a singleton in-memory store that persists to `storage.json` in the project root. There is no database connection required to run the app.

## Architecture overview

### Wizard flow

The app is a multi-step video production wizard. The root page (`/`) forwards to `/projects/new`. The single route `src/app/projects/[id]/page.tsx` renders all steps and holds all client state in React (`useState`).

Project steps advance sequentially via `PATCH /api/projects/[id]` with `{ direction: "next" | "back" }`:

```
SCRIPT_GENERATION → IMAGE_GENERATION → ANIMATION_GENERATION → FINAL_STITCH → COMPLETED
```

Each step maps to a wizard component in `src/components/wizard/`.

### Provider pattern

`src/core/providers/index.ts` exposes factory functions (`getScriptProvider`, `getImageProvider`, `getAnimationProvider`, `getVoiceProvider`, `getMediaProvider`). Providers are selected at runtime based on env vars. All providers implement interfaces from `src/core/providers/interfaces.ts`.

### Image generation pipeline

The most complex path is `POST /api/scenes/[id]` with `target: "image"`. It runs these stages in order:

1. **Product profile** — analyzes `referenceImageUrl` once via `src/core/product-analyzer.ts` and caches it on the project.
2. **Character reference** — `src/core/character-master.ts` generates or reuses a stable character seed image.
3. **Physics plan** — `src/core/scene-physics.ts` plans human pose, ground contact, object positions.
4. **Scene action extract** — `src/core/scene-action-extractor.ts` extracts a literal scene contract (primary action, body pose, hand state, required objects, forbidden objects) from the scene script. This is the source of truth for the prompt.
5. **Prompt assembly** — `src/core/prompt-builder.ts` assembles the final prompt in a fixed A→J block order (base instruction, character lock, location lock, scene action, required objects, product lock, physics lock, forbidden objects, camera, negative constraints). GPT only generates block F (scene action); everything else is code-controlled.
6. **Prompt validation + repair** — `src/core/prompt-validator.ts` validates required elements; `repairPrompt` fixes issues before sending to the image API.
7. **Image generation** — `imageProvider.generateImage(prompt, productRef, characterSeedUrl)`.
8. **Quality check** — `src/core/quality-checker.ts` optionally regenerates with a repair prefix.
9. **Animation prompt** — generated from the scene script and image prompt.

### Animation polling

During `IMAGE_GENERATION` and `ANIMATION_GENERATION` steps, the client polls `GET /api/projects/[id]` every 5 seconds. The GET handler checks animation job status via `animationProvider.checkAnimationStatus` and, on completion, triggers an upscale job (`animationProvider.upscaleVideo`). Status flows: `PENDING → UPSCALE_PENDING → COMPLETED` (or `FAILED`).

### Scene regeneration targets

`POST /api/scenes/[id]` accepts a `target` field:

| target | effect |
|---|---|
| `script` | regenerate scene script |
| `imagePrompt` | regenerate image prompt only (legacy path) |
| `image` | full pipeline: physics → extract → prompt → image → quality check → animation prompt |
| `animationPrompt` | regenerate animation prompt |
| `animation` | submit animation job (sets status to PENDING) |
| `voiceoverScript` | regenerate voiceover text |
| `voice` | synthesize audio |

The `image` target also accepts `{ feedback: string }` to enter the user feedback path, which skips physics/extract and calls `scriptProvider.reviseImagePrompt` instead.
