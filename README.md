# powerbi-desktop-mcp

[![npm version](https://img.shields.io/npm/v/powerbi-desktop-mcp.svg)](https://www.npmjs.com/package/powerbi-desktop-mcp)
[![npm downloads](https://img.shields.io/npm/dm/powerbi-desktop-mcp.svg)](https://www.npmjs.com/package/powerbi-desktop-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI tool to automatically download, install and configure the **Power BI Desktop MCP Server** for Claude Desktop and Claude Code.

**npm Package**: https://www.npmjs.com/package/powerbi-desktop-mcp

## Install

```bash
npm install -g powerbi-desktop-mcp
```

Or run directly without installing:

```bash
npx powerbi-desktop-mcp install
```

## Commands

### Install
Downloads the MCP server and interactively configures Claude Desktop and/or Claude Code:
```bash
# If installed globally
powerbi-desktop-mcp install

# Or run with npx (no installation required)
npx powerbi-desktop-mcp install
```

During installation, you'll be prompted to:
- **Configure Claude Desktop automatically?** - Adds the MCP server to Claude Desktop's config
- **Configure Claude Code automatically?** - Adds the MCP server to Claude Code's config

You can choose to configure one, both, or neither (for manual configuration later).

Options:
```
-d, --dir <path>          Install directory (default: C:\MCPServers\PowerBIModelingMCP)
-v, --mcp-version <ver>   MCP version to install (default: 0.4.0)
-s, --skip-confirmation   Skip confirmation prompts in MCP server
```

**Note:** If reinstalling, please close Claude Desktop and Claude Code (VS Code) first to avoid file locking issues.

### Status
Check if the MCP is installed and configured:
```bash
# If installed globally
powerbi-desktop-mcp status

# Or run with npx
npx powerbi-desktop-mcp status
```

### Uninstall
Remove the MCP server and clean up Claude configs:
```bash
# If installed globally
powerbi-desktop-mcp uninstall

# Or run with npx
npx powerbi-desktop-mcp uninstall
```

### Extract DAX
Extract DAX measures and calculated columns from Power BI models.

**Prerequisite:** Power BI Desktop must be running with your file open before running this command.

```bash
# Extract all DAX from an open Power BI Desktop file
powerbi-desktop-mcp extract-dax --file "SalesReport"

# Extract from Fabric workspace
powerbi-desktop-mcp extract-dax --workspace "Sales Workspace" --model "Sales Model"

# Extract only measures, save to a specific path
powerbi-desktop-mcp extract-dax --file "SalesReport" --type measures --output ./measures.dax

# Extract only calculated columns
powerbi-desktop-mcp extract-dax --file "SalesReport" --type columns

# Output to stdout
powerbi-desktop-mcp extract-dax --file "SalesReport" --output stdout
```

Options:
```
-f, --file <name>           Power BI Desktop window title (partial match, case-insensitive)
-w, --workspace <name>      Fabric workspace name
-m, --model <name>          Semantic model name (required with --workspace)
-o, --output <path>         Output file path (prompted interactively if not specified)
-t, --type <type>           Extract type: all, measures, columns (default: all)
-d, --install-dir <path>    MCP server install directory
```

**Note:** Either `--file` OR both `--workspace` and `--model` must be specified.

**How `--file` matching works:** The value is matched as a case-insensitive substring against the window title of all running Power BI Desktop instances. For example, `--file "Sales"` will match a window titled `SalesReport - Power BI Desktop`. If no match is found, the error message lists all available window titles so you can pick the right one.

### Translate DAX to Qlik Sense
Translate DAX measures and calculated columns from a Power BI model to Qlik Sense QVS format, powered by Claude AI. Useful for migrating from Power BI to Qlik Sense.

**Prerequisites:**
- Power BI Desktop must be running with your file open
- An [Anthropic API key](https://console.anthropic.com) set as `ANTHROPIC_API_KEY`

```bash
# Translate all DAX from an open Power BI Desktop file
powerbi-desktop-mcp translate-dax --file "SalesReport"

# Translate and save to a specific path
powerbi-desktop-mcp translate-dax --file "SalesReport" --output ./sales-qlik.qvs

# Translate from a Fabric workspace
powerbi-desktop-mcp translate-dax --workspace "Sales Workspace" --model "Sales Model"
```

Options:
```
-f, --file <name>         Power BI Desktop window title (partial match, case-insensitive)
-w, --workspace <name>    Fabric workspace name
-m, --model <name>        Semantic model name (required with --workspace)
-o, --output <path>       Output .qvs file path (prompted interactively if not specified)
-d, --install-dir <path>  MCP server install directory
```

**Setting the API key:**
```powershell
# PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-..."

# bash/zsh
export ANTHROPIC_API_KEY="sk-ant-..."

# CMD
set ANTHROPIC_API_KEY=sk-ant-...
```

**Output format:** The generated `.qvs` file contains two sections:
- **Qlik Sense Expressions** — DAX measures translated to Set Analysis expressions (for use in charts and KPIs)
- **QVS Load Script** — DAX calculated columns translated to LOAD statement fields

Example output:
```qvs
// ============================================================
// QLIK SENSE EXPRESSIONS  (translated from Power BI DAX)
// ============================================================

// [Total Sales]  (Table: Sales)
// DAX:  SUM(Sales[Amount])
Sum(Amount)

// [% of Total]  (Table: Sales)
// DAX:  DIVIDE(SUM(Sales[Amount]), CALCULATE(SUM(Sales[Amount]), ALL(Sales)), 0)
// NOTE: ALL() translated using TOTAL keyword
If(Sum(TOTAL Amount)=0, 0, Sum(Amount)/Sum(TOTAL Amount))


// ============================================================
// QVS LOAD SCRIPT  (calculated columns)
// ============================================================

LOAD
    *,
    // [Profit Margin]  (Table: Sales)
    // DAX:  [Profit]/[Revenue]
    Profit/Revenue AS [Profit Margin]
FROM [your-data-source] (qvd);
```

> **Note:** Complex DAX patterns (e.g. `CALCULATE` with multiple filters, time-intelligence functions) are translated as closely as possible. Always review the output before using it in production — the AI will add `// NOTE:` comments on lines that may need manual adjustment.

## Requirements

- Windows (win32-x64)
- Node.js >= 18
- Power BI Desktop (must be open when using the MCP)

## What it does

1. Downloads `powerbi-modeling-mcp.exe` from VS Code Marketplace
2. Extracts it to the install directory
3. **Asks if you want to configure Claude Desktop** - Registers it in `%APPDATA%\Claude\claude_desktop_config.json`
4. **Asks if you want to configure Claude Code** - Registers it in `%USERPROFILE%\.claude.json`

You have full control over which Claude applications get configured during installation.

## Usage after install

1. Open Power BI Desktop with your model
2. Restart Claude Desktop or Claude Code
3. Say: **Connect to [your-file-name] in Power BI Desktop**

## ⚙️ MCP Server Settings

The MCP server supports several command line options and environment variables that can be configured during installation:

### Command Line Options

| Command line option | Default | Description |
|-------------------|---------|-------------|
| `--start` | | Starts the MCP server; necessary for server registration with MCP client. |
| `--readwrite` | Yes | Enabled by default, enables write operations with confirmation prompt before applying an edit to your semantic model (once per database). |
| `--readonly` | | Safe mode, prevents any write operations to your semantic model. |
| `--skipconfirmation` | | Automatically approves all write operations without confirmation prompts. Only use skip confirmation mode when you're confident about the operations being performed and have appropriate backups of your semantic model. |
| `--compatibility` | PowerBI | By default, it is optimized for Power BI semantic models. Change the setting to `Full` if you want to run this MCP server against Analysis Services databases. |

### Environment Variables

| Environment variable name | Default | Description |
|--------------------------|---------|-------------|
| `PBI_MODELING_MCP_ACCESS_TOKEN` | | When configured, the MCP Server uses the specified access token instead of prompting for authentication when connecting to a semantic model in a Fabric workspace. This is useful in scenarios where the application handles authentication itself. |

### How to Configure

These settings are automatically configured by this installer with sensible defaults. The `--skipconfirmation` flag can be set during installation using the `-s` option:

```bash
npx powerbi-desktop-mcp install -s
```

To manually modify these settings after installation, edit the Claude configuration files:
- **Claude Desktop**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Code**: `%USERPROFILE%\.claude.json`

Example configuration:
```json
{
  "mcpServers": {
    "powerbi-desktop-mcp": {
      "type": "stdio",
      "command": "C:\\MCPServers\\PowerBIModelingMCP\\extension\\server\\powerbi-modeling-mcp.exe",
      "args": ["--start", "--skipconfirmation"],
      "env": {
        "PBI_MODELING_MCP_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

## About

This CLI tool automates the installation and configuration of the **Power BI Modeling MCP Server** developed by Microsoft. The MCP server brings Power BI semantic modeling capabilities to AI agents, enabling natural language interactions with Power BI Desktop and Fabric semantic models.

### Official MCP Server

The underlying Power BI Modeling MCP Server is developed and maintained by Microsoft:

- **GitHub Repository**: [microsoft/powerbi-modeling-mcp](https://github.com/microsoft/powerbi-modeling-mcp)
- **VS Code Extension**: [Power BI Modeling MCP](https://marketplace.visualstudio.com/items?itemName=analysis-services.powerbi-modeling-mcp)
- **License**: MIT

### What the MCP Server Does

- 🔄 **Build and modify semantic models** with natural language
- ⚡ **Execute bulk operations** at scale across hundreds of objects
- ✅ **Apply modeling best practices** to your Power BI models
- 🤖 **Enable agentic workflows** with TMDL and Power BI Project files
- 🔍 **Query and validate DAX** against your semantic models

For complete documentation, capabilities, and examples, visit the [official repository](https://github.com/microsoft/powerbi-modeling-mcp).

### What This CLI Does

This `powerbi-desktop-mcp` package simplifies the installation process by:
1. Automatically downloading the MCP server from VS Code Marketplace
2. Extracting and setting up the executable
3. Providing interactive prompts to configure Claude Desktop and/or Claude Code
4. Managing installation, status checks, and uninstallation

## Contributing

Issues and feature requests for the MCP server itself should be directed to the [official Microsoft repository](https://github.com/microsoft/powerbi-modeling-mcp/issues).
