# Discover And Select Accounts

Use this skill whenever the user has not yet selected a shared Gong+Grain account.

## Procedure

1. Call `discover_shared_accounts` with available credentials and optional date filters.
2. Sort candidate accounts by combined call count if needed.
3. Show a concise choice list:
   - display name
   - Gong count
   - Grain count
   - match reason and confidence
4. Ask user to select one account before story generation.

## Quality checks

- If zero shared accounts are returned, explain why and suggest filter/credential fixes.
- Avoid selecting an account automatically unless user asks for default behavior.
