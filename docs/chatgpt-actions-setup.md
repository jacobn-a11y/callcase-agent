# ChatGPT Actions Setup

1. Start local API:

```bash
npm run web
```

2. Expose it publicly over HTTPS:

```bash
cloudflared tunnel --url http://localhost:3080
```

3. In ChatGPT, create/edit a Custom GPT.
4. Add an Action and import this schema URL:

```text
https://<public-domain>/openapi.json
```

5. Test these operations in order:
   - `listStoryTypes`
   - `discoverSharedAccounts`
   - `exportAccountCorpus`
   - `buildCaseStudyStory`

Reference endpoints:

- OpenAPI: `/openapi.json`
- Plugin manifest: `/.well-known/ai-plugin.json`
