#!/usr/bin/env node

/**
 * PubMed MCP Server (local / stdio transport)
 *
 * Exposes 10 tools — feature-parity with the remote OAuth-protected server:
 *   search, fetch, fetch_batch, get_full_text, count,
 *   find_similar_articles, export_to_ris, get_citation_counts,
 *   convert_ids, batch_process
 *
 * NCBI_API_KEY (optional) is read from the environment to raise the NCBI
 * rate limit from 3 req/s to 10 req/s.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "pubmed-mcp-server",
  version: "2.0.3",
});

registerTools(server, process.env.NCBI_API_KEY);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PubMed MCP Server v2.0.3 (stdio) is running...");
  console.error(
    "Tools: search, fetch, fetch_batch, get_full_text, count, " +
      "find_similar_articles, export_to_ris, get_citation_counts, " +
      "convert_ids, batch_process"
  );
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
