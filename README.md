# Agent Evolve

A website chat agent that evolves its own harness toward a goal. A coach agent reads the chat agent's conversations (classified by Jev and indexed in MongoDB Atlas), proposes one typed change at a time to the agent's config (rules, tools, state, context, widgets, instructions), tests it on practice customers, and keeps it only if the goal improves without breaking guardrails. Every version lives in Atlas.

Built entirely during the MongoDB **Harness Engineering & Model Wrangling** hackathon (NYC, 2026-09-26). Problem statement: **Recursive Harnessing**.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Run
```bash
cp .env.example .env.local   # fill in MONGODB_URI, OPENROUTER_API_KEY
npx -y pnpm@9 install
npx -y pnpm@9 seed           # pricing, slots, knowledge, personas, v1 config
npx -y pnpm@9 simulate       # practice conversations on the active config
npx -y pnpm@9 label          # Jev labels + summaries + embeddings
npx -y pnpm@9 evolve         # coach → test → keep/rollback loop
npx -y pnpm@9 dev            # web app on http://localhost:3000
```

## Layout
- `apps/web`: Next.js App Router + Tailwind + shadcn/ui (chat, replay, versions, coach pages)
- `packages/core`: config schema, runtime, tools, Jev helpers, Atlas store, simulator, coach, evaluator, scripts
