import type { Request } from "express";

export function inferBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const forwardedHost = req.header("x-forwarded-host");

  const proto = (forwardedProto || req.protocol || "http").split(",")[0].trim();
  const host = (forwardedHost || req.get("host") || "localhost:3080").split(",")[0].trim();

  return `${proto}://${host}`;
}

export function buildOpenApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "CallCase Agent API",
      version: "1.0.0",
      description:
        "Discover shared accounts across Gong and Grain, then generate attribution-backed case studies with transcript markdown outputs.",
    },
    servers: [
      {
        url: baseUrl,
      },
    ],
    paths: {
      "/api/story-types": {
        get: {
          operationId: "listStoryTypes",
          summary: "List available story types",
          responses: {
            "200": {
              description: "Story types",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      storyTypes: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/StoryType",
                        },
                      },
                    },
                    required: ["storyTypes"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/accounts/discover": {
        post: {
          operationId: "discoverSharedAccounts",
          summary: "Discover deduped account menu shared by Gong and Grain",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DiscoverRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Shared account options",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accounts: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/SharedAccount",
                        },
                      },
                      counts: {
                        type: "object",
                        properties: {
                          gongAccounts: { type: "integer" },
                          grainAccounts: { type: "integer" },
                          sharedAccounts: { type: "integer" },
                        },
                        required: ["gongAccounts", "grainAccounts", "sharedAccounts"],
                      },
                    },
                    required: ["accounts", "counts"],
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ErrorResponse" },
            "500": { $ref: "#/components/responses/ErrorResponse" },
          },
        },
      },
      "/api/accounts/export-markdown": {
        post: {
          operationId: "exportAccountCorpus",
          summary:
            "Export merged markdown of all deduped calls for one selected shared account into Downloads before story generation",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ExportRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Corpus export output",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ExportCorpusResult",
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ErrorResponse" },
            "500": { $ref: "#/components/responses/ErrorResponse" },
          },
        },
      },
      "/api/stories/build": {
        post: {
          operationId: "buildCaseStudyStory",
          summary: "Build one story type for the selected shared account and write markdown outputs",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BuildRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Story build output",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accountName: { type: "string" },
                      accountId: { type: "string" },
                      storyType: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                        },
                        required: ["id", "name"],
                      },
                      callsFetched: { type: "integer" },
                      callsAfterDedupe: { type: "integer" },
                      duplicatesRemoved: { type: "integer" },
                      markdownDownloadsPath: { type: "string" },
                      storyDownloadsPath: { type: "string" },
                      quotesCsvDownloadsPath: { type: "string" },
                      storyMarkdown: { type: "string" },
                      quotesExtracted: { type: "integer" },
                      claimsExtracted: { type: "integer" },
                      quoteCsvRows: { type: "integer" },
                    },
                    required: [
                      "accountName",
                      "accountId",
                      "storyType",
                      "callsFetched",
                      "callsAfterDedupe",
                      "duplicatesRemoved",
                      "markdownDownloadsPath",
                      "storyDownloadsPath",
                      "quotesCsvDownloadsPath",
                      "storyMarkdown",
                      "quotesExtracted",
                      "claimsExtracted",
                      "quoteCsvRows",
                    ],
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ErrorResponse" },
            "500": { $ref: "#/components/responses/ErrorResponse" },
          },
        },
      },
    },
    components: {
      schemas: {
        StoryType: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            stage: { type: "string" },
            focus: { type: "string" },
            spec: { $ref: "#/components/schemas/StoryTypeSpec" },
          },
          required: ["id", "name", "stage", "focus", "spec"],
        },
        StoryTypeSpec: {
          type: "object",
          properties: {
            objective: { type: "string" },
            narrativeAngle: { type: "string" },
            backendPromptTemplate: { type: "string" },
            primaryAudience: {
              type: "array",
              items: { type: "string" },
            },
            requiredEvidenceSignals: {
              type: "array",
              items: { type: "string" },
            },
            quantitativePriority: {
              type: "array",
              items: { type: "string" },
            },
            requiredSections: {
              type: "array",
              items: { type: "string" },
            },
            dataGapQuestions: {
              type: "array",
              items: { type: "string" },
            },
            reusableMessagingOutputs: {
              type: "array",
              items: { type: "string" },
            },
            forbiddenMoves: {
              type: "array",
              items: { type: "string" },
            },
            minimumQuoteCount: { type: "integer" },
            minimumClaimCount: { type: "integer" },
          },
          required: [
            "objective",
            "narrativeAngle",
            "backendPromptTemplate",
            "primaryAudience",
            "requiredEvidenceSignals",
            "quantitativePriority",
            "requiredSections",
            "dataGapQuestions",
            "reusableMessagingOutputs",
            "forbiddenMoves",
            "minimumQuoteCount",
            "minimumClaimCount",
          ],
        },
        DiscoverRequest: {
          type: "object",
          properties: {
            openaiApiKey: { type: "string", description: "Optional for LLM-assisted account matching." },
            openaiModel: { type: "string", default: "gpt-4o" },
            gongBaseUrl: { type: "string", default: "https://api.gong.io" },
            gongAccessToken: { type: "string" },
            gongAccessKey: { type: "string" },
            gongAccessKeySecret: { type: "string" },
            grainBaseUrl: { type: "string", default: "https://grain.com/_/public-api" },
            grainApiToken: { type: "string" },
            internalEmailDomains: { type: "string" },
            fromDate: { type: "string", description: "YYYY-MM-DD or ISO datetime" },
            toDate: { type: "string", description: "YYYY-MM-DD or ISO datetime" },
            maxCalls: { type: "integer", minimum: 1, maximum: 5000 },
          },
          required: ["grainApiToken"],
        },
        SharedAccount: {
          type: "object",
          properties: {
            id: { type: "string" },
            displayName: { type: "string" },
            gongName: { type: "string" },
            grainName: { type: "string" },
            gongCallCount: { type: "integer" },
            grainCallCount: { type: "integer" },
            confidence: { type: "number" },
            matchReason: { type: "string", enum: ["exact", "heuristic", "llm"] },
          },
          required: [
            "id",
            "displayName",
            "gongName",
            "grainName",
            "gongCallCount",
            "grainCallCount",
            "confidence",
            "matchReason",
          ],
        },
        BuildRequest: {
          allOf: [
            {
              $ref: "#/components/schemas/DiscoverRequest",
            },
            {
              type: "object",
              properties: {
                openaiApiKey: { type: "string" },
                storyTypeId: { type: "string" },
                selectedAccount: { $ref: "#/components/schemas/SharedAccountSelection" },
              },
              required: ["openaiApiKey", "storyTypeId", "selectedAccount"],
            },
          ],
        },
        ExportRequest: {
          allOf: [
            {
              $ref: "#/components/schemas/DiscoverRequest",
            },
            {
              type: "object",
              properties: {
                selectedAccount: { $ref: "#/components/schemas/SharedAccountSelection" },
              },
              required: ["selectedAccount"],
            },
          ],
        },
        ExportCorpusResult: {
          type: "object",
          properties: {
            accountName: { type: "string" },
            accountId: { type: "string" },
            callsFetched: { type: "integer" },
            callsAfterDedupe: { type: "integer" },
            duplicatesRemoved: { type: "integer" },
            markdownDownloadsPath: { type: "string" },
            output: {
              type: "object",
              properties: {
                callFiles: { type: "array", items: { type: "string" } },
                mergedFile: { type: "string" },
                dedupeReport: { type: "string" },
              },
              required: ["callFiles", "mergedFile", "dedupeReport"],
            },
            storyTypeOptions: {
              type: "array",
              items: { $ref: "#/components/schemas/StoryType" },
            },
          },
          required: [
            "accountName",
            "accountId",
            "callsFetched",
            "callsAfterDedupe",
            "duplicatesRemoved",
            "markdownDownloadsPath",
            "output",
            "storyTypeOptions",
          ],
        },
        SharedAccountSelection: {
          type: "object",
          properties: {
            id: { type: "string" },
            displayName: { type: "string" },
            gongName: { type: "string" },
            grainName: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["id", "displayName", "gongName", "grainName"],
        },
        ErrorBody: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
      },
      responses: {
        ErrorResponse: {
          description: "Error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorBody",
              },
            },
          },
        },
      },
    },
  };
}

export function buildAiPluginManifest(baseUrl: string) {
  return {
    schema_version: "v1",
    name_for_human: "CallCase Agent",
    name_for_model: "callcase_agent",
    description_for_human:
      "Generate transcript-backed B2B case studies from Gong + Grain account call recordings.",
    description_for_model:
      "Use this tool to discover accounts shared across Gong and Grain and generate evidence-backed case-study markdown with direct quote attribution and quantitative claims.",
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${baseUrl}/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${baseUrl}/icon.svg`,
    contact_email: "admin@localhost.localdomain",
    legal_info_url: `${baseUrl}`,
  };
}
