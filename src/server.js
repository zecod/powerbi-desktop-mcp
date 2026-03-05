#!/usr/bin/env node

/**
 * powerbi-dax-translator MCP Server
 *
 * Exposes an `extract_dax` tool that Claude Desktop / Claude Code can call.
 * Claude receives the raw DAX and translates it natively — no API key required.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PowerBIMCPClient, getMCPServerPath } from "./utils/mcpClient.js";

const server = new Server(
  { name: "powerbi-dax-translator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "extract_dax",
      description:
        "Extract all DAX measures and calculated columns from an open Power BI Desktop file or Fabric workspace. " +
        "Returns the raw DAX expressions so you can translate them to the target format requested by the user " +
        "(e.g. Qlik Sense QVS, Tableau calculated fields, LookML, etc.). No API key is required — you perform the translation yourself.",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "Power BI Desktop window title (partial match, case-insensitive). Use this when the file is open in Power BI Desktop."
          },
          workspace: {
            type: "string",
            description: "Fabric workspace name. Use together with 'model' to connect to a cloud dataset."
          },
          model: {
            type: "string",
            description: "Fabric semantic model name. Required when using 'workspace'."
          },
          install_dir: {
            type: "string",
            description: "MCP server install directory. Defaults to C:\\MCPServers\\PowerBIModelingMCP."
          }
        },
        required: []
      }
    }
  ]
}));

// ── Tool handler ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "extract_dax") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { file, workspace, model, install_dir } = request.params.arguments ?? {};
  const mcpServerPath = getMCPServerPath(install_dir || null);

  const client = new PowerBIMCPClient(mcpServerPath);

  try {
    await client.start();

    // Connect to the data source
    if (file) {
      await client.connectToPowerBIDesktop(file);
    } else if (workspace && model) {
      await client.connectToFabric(workspace, model);
    } else {
      return {
        content: [{
          type: "text",
          text: "Please provide either 'file' (Power BI Desktop window title) or both 'workspace' and 'model' (Fabric)."
        }],
        isError: true
      };
    }

    // Extract measures
    const measures = await client.listMeasures();
    // Extract calculated columns
    const calcColumnGroups = await client.listCalculatedColumns();

    await client.stop();

    // Build the response text
    const modelName = file || `${workspace}/${model}`;
    const lines = [];

    lines.push(`DAX extracted from Power BI model: "${modelName}"`);
    lines.push(`Measures: ${measures.length}, Calculated columns: ${calcColumnGroups.reduce((n, g) => n + g.columns.length, 0)}`);
    lines.push("");

    if (measures.length > 0) {
      lines.push("## MEASURES");
      lines.push("");
      for (const m of measures) {
        lines.push(`### ${m.name} (Table: ${m.tableName})`);
        if (m.description) lines.push(`Description: ${m.description}`);
        if (m.formatString) lines.push(`Format: ${m.formatString}`);
        lines.push("```dax");
        lines.push(m.expression || "");
        lines.push("```");
        lines.push("");
      }
    }

    if (calcColumnGroups.length > 0) {
      lines.push("## CALCULATED COLUMNS");
      lines.push("");
      for (const group of calcColumnGroups) {
        for (const col of group.columns) {
          lines.push(`### ${col.name || col.Name} (Table: ${group.name})`);
          if (col.description || col.Description) lines.push(`Description: ${col.description || col.Description}`);
          lines.push("```dax");
          lines.push(col.expression || col.Expression || "");
          lines.push("```");
          lines.push("");
        }
      }
    }

    if (measures.length === 0 && calcColumnGroups.length === 0) {
      lines.push("No measures or calculated columns found in this model.");
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };

  } catch (error) {
    try { await client.stop(); } catch {}
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
