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
5. Immediately call `prepare_account_corpus` for the selected account so merged markdown is written to Downloads before story selection.
6. Show story choices grouped by stage/category and ask for `storyTypeId`.

## Quality checks

- If zero shared accounts are returned, explain why and suggest filter/credential fixes.
- Avoid selecting an account automatically unless user asks for default behavior.
- If user gives a fuzzy account name, use `accountDisplayName` and rely on backend fuzzy matching; only ask clarifying questions when confidence is too low.
