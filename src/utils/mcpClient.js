import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";

/**
 * MCP client for communicating with Power BI Modeling MCP Server
 * Uses the official @modelcontextprotocol/sdk
 */
export class PowerBIMCPClient {
  constructor(exePath) {
    this.exePath = exePath;
    this.client = null;
    this.connectionName = null;
  }

  /**
   * Start the MCP server and connect
   */
  async start() {
    const transport = new StdioClientTransport({
      command: this.exePath,
      args: ["--start", "--skipconfirmation"],
      env: process.env,
      stderr: "ignore"
    });

    this.client = new Client({
      name: "powerbi-desktop-mcp-cli",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    await this.client.connect(transport);
  }

  /**
   * List available tools
   */
  async listTools() {
    return this.client.listTools();
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName, args) {
    const result = await this.client.callTool({
      name: toolName,
      arguments: {
        request: args
      }
    });
    return result;
  }

  /**
   * List local Power BI Desktop instances
   */
  async listLocalInstances() {
    const result = await this.callTool("connection_operations", {
      operation: "LISTLOCALINSTANCES"
    });

    if (result && result.content && result.content.length > 0) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
        if (Array.isArray(parsed)) return parsed;
        if (parsed.Instances && Array.isArray(parsed.Instances)) return parsed.Instances;
        return [];
      } catch (e) {
        throw new Error("Failed to parse local instances");
      }
    }
    return [];
  }

  /**
   * Connect to Power BI Desktop by file name
   */
  async connectToPowerBIDesktop(fileName) {
    const instances = await this.listLocalInstances();

    if (!instances || instances.length === 0) {
      throw new Error("No Power BI Desktop instances found. Make sure Power BI Desktop is running.");
    }

    const matchingInstance = instances.find(inst =>
      inst.parentWindowTitle && inst.parentWindowTitle.toLowerCase().includes(fileName.toLowerCase())
    );

    if (!matchingInstance) {
      const available = instances.map(i => `"${i.parentWindowTitle || 'Unknown'}"`).join(", ");
      throw new Error(
        `"${fileName}" is not open in Power BI Desktop.\n\n` +
        `  Make sure the file is open, then retry.\n\n` +
        `  Currently open: ${available}`
      );
    }

    // CONNECT — connectionName is session-based in v0.4.0 (not returned in response)
    await this.callTool("connection_operations", {
      operation: "CONNECT",
      connectionString: matchingInstance.connectionString
    });

    return true;
  }

  /**
   * Connect to Fabric workspace
   */
  async connectToFabric(workspaceName, datasetName) {
    await this.callTool("connection_operations", {
      operation: "CONNECTFABRIC",
      workspaceName: workspaceName,
      semanticModelName: datasetName
    });

    return true;
  }

  /**
   * List all measures with their full details (including DAX expressions).
   * v0.4.0: LIST only returns {name}; GET requires References: [{Name, TableName}].
   * Strategy: LIST tables → for each table LIST its measures → batch GET all.
   */
  async listMeasures() {
    // Step 1: get all table names
    const tablesRes = await this.callTool("table_operations", {
      operation: "LIST",
      connectionName: this.connectionName
    });
    if (!tablesRes?.content?.length) return [];
    const tablesParsed = JSON.parse(tablesRes.content[0].text);
    const tables = Array.isArray(tablesParsed) ? tablesParsed : (tablesParsed.data || []);
    const tableNames = tables.map(t => t.name || t.Name).filter(Boolean);

    if (tableNames.length === 0) return [];

    // Step 2: for each table, list its measures to build {Name, TableName} pairs
    const allRefs = [];
    for (const tableName of tableNames) {
      const res = await this.callTool("measure_operations", {
        operation: "LIST",
        connectionName: this.connectionName,
        Filter: { TableNames: [tableName] }
      });
      if (!res?.content?.length) continue;
      const parsed = JSON.parse(res.content[0].text);
      const measures = Array.isArray(parsed) ? parsed : (parsed.data || []);
      for (const m of measures) {
        const name = m.name || m.Name;
        if (name) allRefs.push({ Name: name, TableName: tableName });
      }
    }

    if (allRefs.length === 0) return [];

    // Step 3: batch GET all measures to retrieve DAX expressions
    const getRes = await this.callTool("measure_operations", {
      operation: "GET",
      connectionName: this.connectionName,
      References: allRefs
    });
    if (!getRes?.content?.length) return [];
    const getParsed = JSON.parse(getRes.content[0].text);
    const results = getParsed.results || [];
    return results.filter(r => r.success).map(r => r.data || r);
  }

  /**
   * List calculated columns across all tables with their DAX expressions.
   * v0.4.0: LIST columns returns {tableName, columns:[{name,dataType}]};
   *         GET columns returns full details including columnType and expression.
   */
  async listCalculatedColumns() {
    // Step 1: LIST all columns across all tables
    const listRes = await this.callTool("column_operations", {
      operation: "LIST",
      connectionName: this.connectionName
    });
    if (!listRes?.content?.length) return [];
    const listParsed = JSON.parse(listRes.content[0].text);
    const tableGroups = Array.isArray(listParsed) ? listParsed : (listParsed.data || []);

    // Build References for all columns
    const allRefs = [];
    for (const group of tableGroups) {
      const tableName = group.tableName || group.TableName;
      const cols = group.columns || group.Columns || [];
      for (const col of cols) {
        const name = col.name || col.Name;
        if (tableName && name) allRefs.push({ TableName: tableName, Name: name });
      }
    }

    if (allRefs.length === 0) return [];

    // Step 2: batch GET all columns for full details
    const getRes = await this.callTool("column_operations", {
      operation: "GET",
      connectionName: this.connectionName,
      References: allRefs
    });
    if (!getRes?.content?.length) return [];
    const getParsed = JSON.parse(getRes.content[0].text);
    const results = getParsed.results || [];

    // Step 3: filter for calculated columns (those with a DAX expression)
    const tableMap = {};
    for (const r of results) {
      if (!r.success || !r.data) continue;
      const col = r.data;
      const isCalc =
        col.columnType === "Calculated" ||
        col.type === "calculated" ||
        col.Type === "Calculated";
      const expr = col.expression || col.Expression;
      if (isCalc && expr) {
        const tn = col.tableName || col.TableName;
        if (!tableMap[tn]) tableMap[tn] = { name: tn, columns: [] };
        tableMap[tn].columns.push(col);
      }
    }

    return Object.values(tableMap);
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

/**
 * Get the path to the installed MCP server executable
 */
export function getMCPServerPath(installDir = null) {
  const dir = installDir || path.join("C:\\", "MCPServers", "PowerBIModelingMCP");
  const exePath = path.join(dir, "extension", "server", "powerbi-modeling-mcp.exe");
  return exePath;
}
