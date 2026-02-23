# Claude Plugin Upload + Config

This repo ships a direct-upload ZIP for Claude:

- [callcase-agent-local-plugin.zip](https://github.com/jacobn-a11y/callcase-agent/raw/main/plugins/callcase-agent-local-plugin.zip)

## Upload steps

1. Open Claude plugin manager.
2. Choose **Upload local plugin**.
3. Select `callcase-agent-local-plugin.zip`.
4. Enable the plugin.

The ZIP is already in Claude plugin format. Do not unzip it for upload.

## Required config

The uploaded plugin runs this `.mcp.json`:

```json
{
  "mcpServers": {
    "callcase-agent": {
      "command": "${CLAUDE_PLUGIN_ROOT}/scripts/run-callcase-mcp.sh",
      "args": ["--repo", "${CALLCASE_REPO_PATH}"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}",
      "env": {
        "CALLCASE_REPO_PATH": "/Users/jacobnikolau/Documents/Codex/callcase-agent"
      }
    }
  }
}
```

If your local repo path is different, update `CALLCASE_REPO_PATH` in:

- `plugins/callcase-agent-local/.mcp.json`

Then rebuild ZIP:

```bash
npm run plugin:build
```

## Credential setup

Set credentials in repo `.env` (or pass as tool args):

- `OPENAI_API_KEY`
- `GONG_ACCESS_TOKEN` or (`GONG_ACCESS_KEY` + `GONG_ACCESS_KEY_SECRET`)
- `GRAIN_API_TOKEN`

## Expected plugin flow

1. `discover_shared_accounts`
2. `prepare_account_corpus`
3. user chooses a story type by category
4. `build_story_for_account` (story in chat + story markdown + quotes CSV in Downloads)
