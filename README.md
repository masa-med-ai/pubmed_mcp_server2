# PubMed MCP Server v2.0.1

A local **Model Context Protocol (MCP)** server that exposes the NCBI PubMed / PubMed Central / iCite APIs to MCP-compatible clients (Claude Desktop, MCP Inspector, etc.) over **stdio**.

This version (`2.0.0`) is a complete rewrite of the tool layer to provide **feature parity with the remote OAuth-protected sibling project [`pubmed-mcp-remote-Oauth-`](https://github.com/masa061580/pubmed-mcp-remote-Oauth-)** — all 10 tools are identical in name, schema, and behavior. The local build simply drops OAuth and runs on stdio so it can be wired into Claude Desktop without authentication.

---

## 🐛 What's new in v2.0.1

Patch release — bug fix and a safeguard for consortium papers.

- **Fixed a hang on papers with huge collaborator lists.** Fetching articles such as PMID `25176015` (the PARADIGM-HF trial, with 12 authors plus **1,184 `<Investigator>` collaborators**) could peg a CPU core for minutes and freeze the MCP server. The author-parsing regex suffered **catastrophic backtracking (ReDoS)** on the group-author element that has no `<LastName>`/`<ForeName>`. Author parsing is now scoped to the `<AuthorList>` block and processes each `<Author>` element in isolation — the same article now parses in ~4 ms and correctly returns 12 authors (plus the `<CollectiveName>` group author), excluding the 1,184 investigators.
- **Long author lists are capped.** When an article lists **more than 30 authors**, `fetch`, `fetch_batch`, and `search` (full mode) now return the **first 10 names followed by `"et al."`** to keep the JSON compact. Articles with 30 or fewer authors are returned in full, unchanged.

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

## 🔑 Getting an NCBI API key (optional but recommended)

Without a key, NCBI limits you to **3 requests/sec**. With a free personal key, the limit goes up to **10 requests/sec** — noticeable when running `batch_process` or large `search` paginations.

1. Create / sign in to an NCBI account: <https://account.ncbi.nlm.nih.gov/>
2. Open **Account settings** (top-right menu → *Account settings*) → scroll to **API Key Management** at the bottom of the page.
   - Direct link: <https://account.ncbi.nlm.nih.gov/settings/> (look for "API Key Management")
3. Click **Create an API Key**. A 36-character hex string is generated immediately.
4. Copy that string and put it in the `NCBI_API_KEY` env var in your `claude_desktop_config.json` (see the Claude Desktop section below).

The key is tied to your NCBI account; revoke or rotate it any time from the same page. Don't commit it to git or share it — it's effectively your identity on the E-utilities API.

> 📚 Official policy: <https://support.nlm.nih.gov/kbArticle/?pn=KA-05317>

---

## 🚀 Installation

The server is published on npm as [`pubmed_mcp_server2`](https://www.npmjs.com/package/pubmed_mcp_server2). For Claude Desktop you don't need to install anything manually — `npx -y pubmed_mcp_server2` will fetch and run it.

If you'd rather build from source (development):

```bash
git clone https://github.com/masa061580/pubmed_mcp_server2.git
cd pubmed_mcp_server2
npm install
npm run build      # produces dist/index.js
```

### Smoke test (optional)

```bash
# From a clone:
( echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  sleep 1
) | node dist/index.js

# Or directly from npm:
npx -y pubmed_mcp_server2
```

The server should list all 10 tools.

---

## 🖥️ Claude Desktop configuration

Edit (create if missing):

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

### Recommended (via npm)

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "npx",
      "args": ["-y", "pubmed_mcp_server2"],
      "env": {
        "NCBI_API_KEY": ""
      }
    }
  }
}
```

### Alternative (from a local clone)

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
- Set `NCBI_API_KEY` to your key, or remove the env block entirely if you don't have one. With a key the rate limit goes from 3 req/s → 10 req/s.
- **Windows users**: if `npx` is not on PATH inside Claude Desktop, use the full path to `npx.cmd` (e.g. `C:\\Program Files\\nodejs\\npx.cmd`).
- **macOS + nvm**: if Claude Desktop can't find `npx`, replace `"command": "npx"` with the absolute path (e.g. `/Users/you/.nvm/versions/node/v20.x.x/bin/npx`). Claude Desktop's PATH may not include nvm shims.
- For the local-clone variant, use the **absolute path** to `dist/index.js` and run `npm run build` first.
- **Fully quit and relaunch** Claude Desktop after editing (Cmd+Q on macOS).

### Logs

```bash
tail -f "$HOME/Library/Logs/Claude/mcp-server-pubmed.log"
```

---

## 🛠️ MCP Inspector

```bash
# Run the published package directly:
npx @modelcontextprotocol/inspector npx -y pubmed_mcp_server2

# Or inspect a local build:
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
