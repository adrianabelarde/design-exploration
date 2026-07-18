# Design Explorations

A collection of tactile, motion-rich browser experiments built with React, TypeScript, and Vite.

The current explorations are:

- Etch A Sketch — a physically inspired drawing interface
- Polar Express — an interactive ticket-punching scene
- View-Master — a tactile reel viewer
- Codex Event presentation — a working presentation at `#/talk`

Live presentation: [Steering AI With Design Taste](https://steering-ai-with-design-taste.vercel.app/#/talk/1)

Presenter resources:

- [Full script](https://steering-ai-with-design-taste.vercel.app/#/talk-script)
- [Cheat sheet](https://steering-ai-with-design-taste.vercel.app/#/talk-cheat-sheet)

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` for a production build and `npm run lint` for lint checks.

## Workspace skills

Codex discovers the local design and motion skills in `.agents/skills`. Claude-compatible copies remain in `.claude/skills`.

The collection, sourced from [emilkowalski/skills](https://github.com/emilkowalski/skills), includes:

- `emil-design-eng`
- `review-animations`
- `improve-animations`
- `find-animation-opportunities`
- `animation-vocabulary`
- `apple-design`
