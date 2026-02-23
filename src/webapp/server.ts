import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodError } from "zod";

import { BuildRequestSchema, DiscoverRequestSchema, ExportRequestSchema } from "../services/contracts.js";
import {
  asErrorMessage,
  buildStory,
  discoverSharedAccounts,
  exportAccountCorpus,
  listStoryTypes,
} from "../services/caseflow.js";
import { buildAiPluginManifest, buildOpenApiDocument, inferBaseUrl } from "./openapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "public");

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "callcase-webapp" });
});

app.get("/api/story-types", (_req, res) => {
  res.json({ storyTypes: listStoryTypes() });
});

app.post("/api/accounts/discover", async (req, res) => {
  const parsed = DiscoverRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    const result = await discoverSharedAccounts(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
});

app.post("/api/accounts/export-markdown", async (req, res) => {
  const parsed = ExportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    const result = await exportAccountCorpus(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
});

app.post("/api/stories/build", async (req, res) => {
  const parsed = BuildRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    const result = await buildStory(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
});

app.get("/openapi.json", (req, res) => {
  const baseUrl = inferBaseUrl(req);
  res.json(buildOpenApiDocument(baseUrl));
});

app.get("/.well-known/ai-plugin.json", (req, res) => {
  const baseUrl = inferBaseUrl(req);
  res.json(buildAiPluginManifest(baseUrl));
});

app.use((_req, res) => {
  res.sendFile(path.resolve(publicDir, "index.html"));
});

const PORT = Number(process.env.PORT ?? 3080);
app.listen(PORT, () => {
  console.log(`CallCase webapp running at http://localhost:${PORT}`);
});

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}
