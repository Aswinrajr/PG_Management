# 00 — Start here

This pack holds everything needed to build Roomora with Claude Code in VS Code, from an empty folder to production. Web app first, then mobile.

## 1. Set up your machine (one time)

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 22 LTS | `node -v` |
| pnpm | latest | `npm i -g pnpm` then `pnpm -v` |
| Git | any recent | `git --version` |
| VS Code | 1.98 or newer | Help → About |
| MongoDB | Atlas free cluster **or** local Docker | see below |
| Redis | local Docker or Upstash free | see below |
| Docker Desktop | optional, easiest for Mongo + Redis | `docker -v` |

Local databases with Docker (the repo will include this as `docker-compose.yml` after Task 0.1):

```
docker run -d --name roomora-mongo -p 27017:27017 mongo:7
docker run -d --name roomora-redis -p 6379:6379 redis:7
```

## 2. Connect Claude to VS Code

1. In VS Code press `Ctrl+Shift+X`, search **"Claude Code"** (publisher: Anthropic) and click **Install**.
2. Open any file. Click the **Spark icon** (top-right of the editor) to open the Claude panel.
3. Sign in with your **Claude account** (Pro / Max / Team plan) when the browser opens.
4. Open this project folder (`File → Open Folder → roomora`). Claude Code reads `CLAUDE.md` automatically every session, so it knows the stack and rules.

Tips:
- Type `@` in the Claude panel to reference a file, e.g. `@docs/04-API-SPEC.md`.
- Ask for a plan first on big tasks, review it, then say "go ahead".
- Claude shows diffs before applying them. Read them, accept or reject.
- Run `claude` in the VS Code terminal if you prefer the command-line version.

Note: this chat on claude.ai and Claude Code in VS Code are separate conversations. They don't share memory. The `CLAUDE.md` file and the `/docs` folder carry the context between them. If you change a decision, update the doc so every future session follows it.

## 3. Create the repo

```
mkdir roomora && cd roomora
git init
# copy this whole pack (CLAUDE.md, README.md, docs/) into the folder
git add . && git commit -m "docs: project specification pack"
code .
```

## 4. Build, one task at a time

Open `docs/07-BUILD-PLAN-WEB.md`. Each task has a **prompt** you paste into the Claude panel, e.g.

> Do Task 0.1 from @docs/07-BUILD-PLAN-WEB.md. Read the referenced docs first, show me a plan, then implement.

After each task:
1. Run the app and click through what was built.
2. `pnpm lint && pnpm typecheck && pnpm test` must pass.
3. Commit: `git commit -am "feat: task 1.2 owner signup"`.
4. Move to the next task.

Don't ask for "build the whole app" in one prompt. Small tasks give much better code.

## 5. Phases

| Phase | What | Docs |
| --- | --- | --- |
| 0 | Repo, tooling, design system, app shell | 02, 05, 07 |
| 1 | Auth, organizations, properties/rooms/beds, residents, billing — **web** | 01, 03, 04, 06, 07 |
| 2 | Complaints, notices, food, resident portal, Super Admin console, GST | 01, 06, 07 |
| 3 | Launch: tests, security, deploy | 10 |
| 4 | Mobile app (Expo) reusing `packages/types` + `api-client` | 08 |
| 5 | 3D building and room planner | 09 |

## 6. Brand assets

`docs/brand/` contains the Roomora logo and app icon (SVG + PNG). `docs/brand/tokens.json` holds the design tokens; Task 0.3 copies it into `packages/ui-tokens`.
