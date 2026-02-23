# CallCase Agent Local Plugin

This plugin connects Claude to the local CallCase MCP server in this repo.

## What this plugin contains

- `.mcp.json` MCP server wiring
- `scripts/run-callcase-mcp.sh` launcher wrapper
- `agents/callcase-operator.md` operator profile
- `skills/` reusable workflow instructions

## Required setup

1. Install dependencies in the repository root:
   - `npm install`
2. Ensure `CALLCASE_REPO_PATH` in `.mcp.json` points to your local repo path.
3. Add credentials in repo `.env` or pass them in tool calls:
   - `OPENAI_API_KEY`
   - `GONG_ACCESS_TOKEN` or `GONG_ACCESS_KEY` + `GONG_ACCESS_KEY_SECRET`
   - `GRAIN_API_TOKEN`

## Runtime behavior

The launcher script starts:

- `npm run mcp --prefix <repo-path>`

This executes the TypeScript MCP server at `src/mcp/server.ts`.

Primary MCP sequence:

1. `discover_shared_accounts`
2. `prepare_account_corpus` (writes all-calls markdown to Downloads)
3. `list_story_types` (grouped options)
4. `build_story_for_account` (returns story markdown + writes story and quotes CSV to Downloads)
