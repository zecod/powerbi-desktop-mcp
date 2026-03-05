#!/usr/bin/env node

/**
 * powerbi-desktop-mcp — Combined MCP Server
 *
 * Proxies all tools from Microsoft's powerbi-modeling-mcp.exe AND adds our
 * own `extract_dax` tool. Claude Desktop / Claude Code only needs one server entry.
 */

import fs from "fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PowerBIMCPClient, getMCPServerPath } from "./utils/mcpClient.js";

// ── Our custom tools ──────────────────────────────────────────────────────────

const CUSTOM_TOOLS = [
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
        }
      },
      required: []
    }
  }
];

// ── Main entry point ──────────────────────────────────────────────────────────

export async function startServer(installDir) {
  const mcpServerPath = getMCPServerPath(installDir || null);

  // ── Connect to Microsoft's EXE as a proxy client ─────────────────────────
  let proxyClient = null;
  let microsoftTools = [];

  if (fs.existsSync(mcpServerPath)) {
    try {
      const transport = new StdioClientTransport({
        command: mcpServerPath,
        args: ["--start"],
        env: process.env,
        stderr: "ignore"
      });
      proxyClient = new Client(
        { name: "powerbi-proxy", version: "1.0.0" },
        { capabilities: {} }
      );
      await proxyClient.connect(transport);
      const result = await proxyClient.listTools();
      microsoftTools = result.tools ?? [];
    } catch (err) {
      process.stderr.write(`Warning: Could not connect to powerbi-modeling-mcp.exe: ${err.message}\n`);
      proxyClient = null;
    }
  } else {
    process.stderr.write(`Warning: powerbi-modeling-mcp.exe not found at ${mcpServerPath}. Microsoft tools unavailable.\n`);
  }

  // ── Our MCP server ────────────────────────────────────────────────────────
  const server = new Server(
    { name: "powerbi-desktop-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...CUSTOM_TOOLS, ...microsoftTools]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "extract_dax") {
      return handleExtractDax(args, mcpServerPath);
    }

    if (proxyClient) {
      return await proxyClient.callTool({ name, arguments: args ?? {} });
    }

    return {
      content: [{ type: "text", text: `Tool '${name}' unavailable: powerbi-modeling-mcp.exe is not running.` }],
      isError: true
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ── extract_dax handler ───────────────────────────────────────────────────────

async function handleExtractDax({ file, workspace, model } = {}, mcpServerPath) {
  if (!file && !(workspace && model)) {
    return {
      content: [{ type: "text", text: "Please provide either 'file' (Power BI Desktop window title) or both 'workspace' and 'model' (Fabric)." }],
      isError: true
    };
  }

  const client = new PowerBIMCPClient(mcpServerPath);
  try {
    await client.start();

    if (file) {
      await client.connectToPowerBIDesktop(file);
    } else {
      await client.connectToFabric(workspace, model);
    }

    const measures = await client.listMeasures();
    const calcColumnGroups = await client.listCalculatedColumns();

    await client.stop();

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

    return { content: [{ type: "text", text: lines.join("\n") }] };

  } catch (error) {
    try { await client.stop(); } catch {}
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
}
