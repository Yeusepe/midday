# AI providers

`@midday/ai` supplies language and embedding models for Creator Payments.

## OpenCode Go

Configure these server-side variables on the API, worker, and dashboard services
that should use Go:

```dotenv
MIDDAY_AI_PROVIDER=opencode-go
OPENCODE_API_KEY=<your OpenCode key>
MIDDAY_AI_MODEL=deepseek-v4-flash
MIDDAY_AI_SMALL_MODEL=deepseek-v4-flash
MIDDAY_AI_NANO_MODEL=deepseek-v4-flash
```

The three model variables are optional; DeepSeek V4 Flash is the default for all
purposes. Remove or replace previous model overrides when switching providers.
This adapter uses `https://opencode.ai/zen/go/v1/chat/completions`; select a model
listed for **Chat Completions** in the [Go endpoint documentation](https://opencode.ai/docs/go/#endpoints).
Models requiring Messages or Responses need their corresponding adapter.

Requests authenticate with the server-side key and identify the client as
`creator-payments/1.0`. Each request carries `x-opencode-session`:

- Dashboard conversations use a hash of the team, user, and AI SDK conversation
  ID. The API requires the standard transport's `id` field.
- Chat replies and title generation share that ID, including follow-up turns.
- Bot conversations use a hash of the platform, team, user, and thread ID.
- Each insight generation shares one ID across its title, summary, actions, and story.
- Standalone operations get their own ID, retained by the model across retries.

Keep embeddings on the existing provider; Go does not replace the tool-search
embedding service. If switching from Google, explicitly preserve it:

```dotenv
MIDDAY_AI_EMBEDDING_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=<existing Google key>
```

For OpenAI embeddings, use `MIDDAY_AI_EMBEDDING_PROVIDER=openai` and retain
`OPENAI_API_KEY`. Do not substitute the OpenCode key for an embedding key.
OpenAI/Google built-in web search is not attached to Go models. Connected MCP
tools remain available.

If no working embedding API is available, set `MIDDAY_TOOL_SEARCH=keyword` on
the API service. This uses toolpick's built-in BM25/TF-IDF search without external
embedding requests. Tool names, descriptions, and related-tool selection remain
available; semantic matching of paraphrases is less precise.

The health probe checks Go's models endpoint; it does not prove inference quota
or model access. Before deployment, run `bun test packages/ai/src/index.test.ts`.
After deployment, verify a streamed reply, a title, a tool call, and a follow-up
in the same chat. Confirm Go's usage history groups the conversation under one
session. Revert `MIDDAY_AI_PROVIDER` and model overrides to roll back.

See [Go's client requirements](https://opencode.ai/docs/go/#where-can-i-use-it)
for OpenCode's current usage expectations.
