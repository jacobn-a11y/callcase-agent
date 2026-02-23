# Build Story With Attribution

Use this skill when generating a case study for one selected account.

## Procedure

1. Confirm selected account object (`displayName`, `gongName`, `grainName`) and `storyTypeId`.
2. Call `build_story_for_account`.
3. Return:
   - generated story markdown
   - downloads file paths
   - dedupe counts
   - quotes/claims extraction totals

## Attribution standard

- Quote summaries must retain speaker + source call + timestamp when available.
- Financial claims must be traceable to explicit evidence quotes.
- If evidence is weak, highlight gaps and confidence limits.
