# PubMed MCP Server v2.0.0

A local **Model Context Protocol (MCP)** server that exposes the NCBI PubMed / PubMed Central / iCite APIs to MCP-compatible clients (Claude Desktop, MCP Inspector, etc.) over **stdio**.

This version (`2.0.0`) is a complete rewrite of the tool layer to provide **feature parity with the remote OAuth-protected sibling project [`pubmed-mcp-remote-Oauth-`](https://github.com/masa061580/pubmed-mcp-remote-Oauth-)** — all 10 tools are identical in name, schema, and behavior. The local build simply drops OAuth and runs on stdio so it can be wired into Claude Desktop without authentication.

---

## ✨ What's new in v2.0.0

| | v1.0.2 (legacy) | **v2.0.0 (this release)** |
|---|---|---|
| Tools | 8 tools (`search_pubmed`, `get_full_abstract`, …) | **10 tools** with new schema (see below) |
| Output format | Markdown-formatted strings | Structured **JSON** for every tool (token-efficient, parser-friendly) |
| Search | Single sort, no filters | `output_mode` (minimal/compact/full), pagination, structured filters (date range, publication types, languages, humans-only, has-abstract, free full text) |
| Full text | Whole-article dump | Section-aware extraction (abstract / introduction / methods / results / discussion / conclusions / references) |
| Citations | `elink` only | **iCite** by default (counts include non-PubMed citations) + `elink` mode for citing-PMIDs |
| ID conversion | — | **New** `convert_ids` (PMID ↔ PMCID ↔ DOI) |
| Bulk fetch | — | **New** `fetch_batch` |
| Count-only query | — | **New** `count` tool for fast query refinement |
| HTML entities | Raw | Decoded via `he` |
| 429 handling | — | Exponential-backoff retry (1s/2s/4s) |
| Module structure | Single `pubmed-api.ts` | Split into `pubmed-client.ts` (transport) / `tools.ts` (MCP) / `ris-exporter.ts` |

**Breaking change**: tool names and response shapes have changed. If you were using v1.x, update your client prompts to the new names.

---

## 🔧 Tools (10)

All tools return JSON in `content[0].text`.

| # | Tool | Purpose |
|---|---|---|
| 1 | **`search`** | PubMed search with MeSH support, pagination (`retmax`/`retstart`), sort (`relevance`/`pub_date`/`first_author`), `output_mode` (minimal/compact/full), and structured `filters` |
| 2 | **`fetch`** | Single-PMID abstract (OpenAI MCP–compliant document shape) |
| 3 | **`fetch_batch`** | Multiple-PMID abstracts in one call; optional `include_abstract` flag |
| 4 | **`get_full_text`** | PMC full text via JATS XML; section filter `[abstract, introduction, methods, results, discussion, conclusions, references, all]`; max 20 PMCIDs |
| 5 | **`count`** | Result count only — fast query refinement |
| 6 | **`find_similar_articles`** | NCBI `elink pubmed_pubmed` similarity |
| 7 | **`export_to_ris`** | Compact RIS for EndNote/Zotero/Mendeley (citation manager auto-fetches full metadata via PMID) |
| 8 | **`get_citation_counts`** | iCite (default, counts only) or `elink` (PubMed-internal, with citing PMIDs) |
| 9 | **`convert_ids`** | PMID ↔ PMCID ↔ DOI via NCBI ID Converter API |
| 10 | **`batch_process`** | Run any subset of `[abstract, citations, similar, ris_export, full_text]` against the same PMID set with bounded concurrency |

For exact input/output schemas, run `tools/list` via MCP Inspector or check `src/tools.ts`.

---

## 📋 Prerequisites

- **Node.js ≥ 18** (uses global `fetch` and `AbortSignal.timeout`)
- npm
- *(optional)* an [NCBI API key](https://www.ncbi.nlm.nih.gov/account/settings/) — raises the rate limit from 3 req/s to 10 req/s

---

## 🚀 Install & build

```bash
git clone https://github.com/masa061580/pubmed_mcp_server2.git
cd pubmed_mcp_server2
npm install
npm run build
```

This produces `dist/index.js` — the executable entry point.

### Smoke test (optional)

```bash
( echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  sleep 1
) | node dist/index.js
```

The second response should list all 10 tools.

---

## 🖥️ Claude Desktop configuration

Edit (create if missing):

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/pubmed_mcp_server2/dist/index.js"
      ],
      "env": {
        "NCBI_API_KEY": ""
      }
    }
  }
}
```

Notes:
- Use the **absolute path** to `dist/index.js`.
- If you use `nvm`, set `"command"` to the absolute node binary (e.g. `/Users/you/.nvm/versions/node/v20.x.x/bin/node`) — Claude Desktop's PATH may not include nvm shims.
- Set `NCBI_API_KEY` to your key, or remove the env block entirely if you don't have one.
- **Fully quit and relaunch** Claude Desktop after editing (Cmd+Q on macOS).

### Logs

```bash
tail -f "$HOME/Library/Logs/Claude/mcp-server-pubmed.log"
```

---

## 🛠️ MCP Inspector

```bash
npx @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/dist/index.js
```

---

## 📦 Project structure

```
src/
├── index.ts          # stdio entry point — registers tools, connects transport
├── tools.ts          # 10 MCP tool definitions (zod schemas + handlers)
├── pubmed-client.ts  # NCBI E-utilities / iCite / ID-Converter client (XML parsing, 429 retry, timeouts)
└── ris-exporter.ts   # Minimal RIS format generator
```

The server is **stateless** — every request creates fresh state. Safe for concurrent invocations.

---

## 🤝 Sibling project

A remote, OAuth-protected variant deployed on Cloudflare Workers lives at:
👉 [masa061580/pubmed-mcp-remote-Oauth-](https://github.com/masa061580/pubmed-mcp-remote-Oauth-)

Both servers expose the **same 10 tools with identical schemas**, so client prompts/workflows are portable between them.

---

## 📚 NCBI Compliance

This server respects NCBI E-utilities guidelines:
- Sends `tool` and `email` parameters on every request
- Honors rate limits (3 req/s without key, 10 req/s with key)
- Uses POST for large ID lists (`efetch`)
- Retries 429 with exponential backoff (max 3 attempts)
- 30s `AbortSignal.timeout` on every fetch

Please supply your own `NCBI_API_KEY` for production use and update `email`/`tool` in `src/pubmed-client.ts` to identify your deployment.

---

## 📝 License

MIT — see [LICENSE](./LICENSE).
