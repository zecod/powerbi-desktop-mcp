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
    // Create stdio transport
    const transport = new StdioClientTransport({
      command: this.exePath,
      args: ["--start", "--skipconfirmation"],
      env: process.env,
      stderr: "ignore"
    });

    // Create client
    this.client = new Client({
      name: "powerbi-desktop-mcp-cli",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    // Connect
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
        
        // The response is an object with a 'data' property containing the instances array
        if (parsed.data && Array.isArray(parsed.data)) {
          return parsed.data;
        }
        
        // Fallback to other formats
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed.Instances && Array.isArray(parsed.Instances)) {
          return parsed.Instances;
        }
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
    // First, list local instances to find the matching one
    const instances = await this.listLocalInstances();
    
    if (!instances || instances.length === 0) {
      throw new Error("No Power BI Desktop instances found. Make sure Power BI Desktop is running.");
    }
    
    // Find instance matching the file name (use parentWindowTitle)
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
    
    // Connect using the connection string (connectionName is auto-generated, cannot be supplied)
    const result = await this.callTool("connection_operations", {
      operation: "CONNECT",
      connectionString: matchingInstance.connectionString
    });

    // Extract auto-generated connection name from response
    if (result && result.content && result.content.length > 0) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        if (parsed.success && parsed.data) {
          // data is the auto-generated connection name string
          this.connectionName = typeof parsed.data === "string" ? parsed.data : parsed.data.connectionName || null;
        } else {
          this.connectionName = null;
        }
      } catch (e) {
        this.connectionName = null;
      }
    } else {
      this.connectionName = null;
    }
    
    return result;
  }

  /**
   * Connect to Fabric workspace
   */
  async connectToFabric(workspaceName, datasetName) {
    const result = await this.callTool("connection_operations", {
      operation: "CONNECTFABRIC",
      workspaceName: workspaceName,
      semanticModelName: datasetName
    });
    
    // Extract connection name from result
    if (result && result.content && result.content.length > 0) {
      const text = result.content[0].text;
      const match = text.match(/Connection '([^']+)'/);
      if (match) {
        this.connectionName = match[1];
      }
    }
    
    return result;
  }

  /**
   * List all measures
   */
  async listMeasures() {
    const result = await this.callTool("measure_operations", {
      operation: "LIST",
      connectionName: this.connectionName
    });

    if (!result || !result.content || result.content.length === 0) return [];

    let measures;
    try {
      const parsed = JSON.parse(result.content[0].text);
      measures = Array.isArray(parsed) ? parsed : (parsed.data || []);
    } catch (e) {
      return [];
    }

    // Fetch full details (including expression) for each measure
    const detailed = await Promise.all(measures.map(async (m) => {
      try {
        const det = await this.callTool("measure_operations", {
          operation: "GET",
          connectionName: this.connectionName,
          measureName: m.name || m.Name
        });
        if (det && det.content && det.content.length > 0) {
          const dp = JSON.parse(det.content[0].text);
          return dp.data || m;
        }
      } catch (e) { /* fall back to basic info */ }
      return m;
    }));

    return detailed;
  }

  /**
   * List all tables
   */
  async listTables() {
    const result = await this.callTool("table_operations", {
      operation: "LIST",
      connectionName: this.connectionName
    });

    if (result && result.content && result.content.length > 0) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : (parsed.data || []);
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * Get columns for a specific table
   */
  async listColumns(tableName) {
    return this.callTool("column_operations", {
      operation: "LIST",
      connectionName: this.connectionName,
      tableName: tableName
    });
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
