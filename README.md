# powerbi-desktop-mcp

[![npm version](https://img.shields.io/npm/v/powerbi-desktop-mcp.svg)](https://www.npmjs.com/package/powerbi-desktop-mcp)
[![npm downloads](https://img.shields.io/npm/dm/powerbi-desktop-mcp.svg)](https://www.npmjs.com/package/powerbi-desktop-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI tool to install, configure and extend the **Power BI Desktop MCP Server** for Claude Desktop and Claude Code.

Registers a **single combined MCP server** that gives Claude access to:
- All Microsoft Power BI modeling tools (connect, query, modify semantic models)
- `extract_dax` — extract all DAX measures and calculated columns from any open Power BI file
- CLI commands to extract and translate DAX from the terminal

**npm Package**: https://www.npmjs.com/package/powerbi-desktop-mcp

---

## Quick Start

```bash
npx powerbi-desktop-mcp install
```

This downloads Microsoft's MCP server, extracts it, and asks whether to configure Claude Desktop and/or Claude Code. After that, restart Claude and you're ready.

---

## CLI Commands

### `install`

Downloads `powerbi-modeling-mcp.exe` from the VS Code Marketplace and configures Claude.

```bash
npx powerbi-desktop-mcp install

# Custom install directory
npx powerbi-desktop-mcp install --dir "D:\MyMCPServers\PowerBI"

# Pin a specific version
npx powerbi-desktop-mcp install --mcp-version 0.4.0
```

During install you'll be asked:
```
  Configure Power BI MCP for Claude:
    Configure Claude Desktop? [Y/n]
    Configure Claude Code?    [Y/n]
```

Options:
```
-d, --dir <path>          Install directory (default: C:\MCPServers\PowerBIModelingMCP)
-v, --mcp-version <ver>   MCP version to install (default: 0.4.0)
```

> **Note:** Close Claude Desktop and Claude Code before reinstalling to avoid file-lock errors.

---

### `status`

Check whether the MCP server is installed and registered in Claude's config.

```bash
npx powerbi-desktop-mcp status
```

---

### `uninstall`

Remove the MCP server files and clean up Claude config entries.

```bash
npx powerbi-desktop-mcp uninstall
```

---

### `extract-dax`

Extract all DAX measures and calculated columns from a Power BI model and save them to a `.dax` file.

**Power BI Desktop must be running with your file open.**

```bash
# Extract from an open Power BI Desktop file
powerbi-desktop-mcp extract-dax --file "SalesReport"

# Extract from a Fabric workspace
powerbi-desktop-mcp extract-dax --workspace "Sales Workspace" --model "Sales Model"

# Save to a specific path
powerbi-desktop-mcp extract-dax --file "SalesReport" --output ./measures.dax

# Extract only measures or only calculated columns
powerbi-desktop-mcp extract-dax --file "SalesReport" --type measures
powerbi-desktop-mcp extract-dax --file "SalesReport" --type columns

# Print to stdout
powerbi-desktop-mcp extract-dax --file "SalesReport" --output stdout
```

Options:
```
-f, --file <name>           Power BI Desktop window title (partial, case-insensitive)
-w, --workspace <name>      Fabric workspace name
-m, --model <name>          Semantic model name (required with --workspace)
-o, --output <path>         Output file path (prompted if not specified)
-t, --type <type>           all | measures | columns  (default: all)
-d, --install-dir <path>    MCP server install directory
```

> Either `--file` OR both `--workspace` and `--model` must be provided.
>
> `--file` does a case-insensitive substring match on the Power BI Desktop window title. `--file "Sales"` will match `SalesReport - Power BI Desktop`. If no match is found, available window titles are listed.

---

### `translate-dax`

Extract DAX from a Power BI model and translate it to **Qlik Sense QVS** format using the Claude API. Useful for migrating from Power BI to Qlik Sense.

**Prerequisites:**
- Power BI Desktop must be running with your file open
- An [Anthropic API key](https://console.anthropic.com) set as `ANTHROPIC_API_KEY`

```bash
# Translate all DAX from an open file
powerbi-desktop-mcp translate-dax --file "SalesReport"

# Save to a specific path
powerbi-desktop-mcp translate-dax --file "SalesReport" --output ./sales-qlik.qvs

# Translate from a Fabric workspace
powerbi-desktop-mcp translate-dax --workspace "Sales Workspace" --model "Sales Model"
```

Options:
```
-f, --file <name>         Power BI Desktop window title (partial, case-insensitive)
-w, --workspace <name>    Fabric workspace name
-m, --model <name>        Semantic model name (required with --workspace)
-o, --output <path>       Output .qvs file path (prompted if not specified)
-d, --install-dir <path>  MCP server install directory
```

**Set the API key:**
```powershell
# PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-..."

# bash/zsh
export ANTHROPIC_API_KEY="sk-ant-..."

# CMD
set ANTHROPIC_API_KEY=sk-ant-...
```

**Output format** — the generated `.qvs` file has two sections:

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

> Complex DAX patterns are translated as closely as possible. The AI adds `// NOTE:` comments on lines that may need manual review. Always validate output before using it in production.

---

## Using with Claude Desktop / Claude Code

After install, Claude gets access to a single MCP server with everything built in:

| Tool | What Claude can do |
|------|-------------------|
| `connect_to_desktop` | Connect to an open Power BI Desktop file |
| `table_operations` | List, get and modify tables |
| `measure_operations` | List, get, create and update DAX measures |
| `column_operations` | List, get and modify columns |
| `relationship_operations` | Manage model relationships |
| `extract_dax` | Extract all DAX measures and calculated columns, ready to translate |
| *(+ all other Microsoft tools)* | Full modeling capabilities |

**Example prompts:**
- *"Connect to SalesReport in Power BI Desktop"*
- *"List all measures in the Sales table"*
- *"Extract all DAX from my model and translate it to Qlik Sense"*
- *"Create a new measure called Profit Margin = DIVIDE([Profit], [Revenue])"*

---

## Requirements

- Windows (win32-x64)
- Node.js >= 18
- Power BI Desktop (must be open when connecting)

---

## Manual Configuration

If you skipped automatic configuration during install, add the entry manually.

**Config file locations:**
- **Claude Desktop**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Code**: `%USERPROFILE%\.claude.json`

```json
{
  "mcpServers": {
    "powerbi-desktop-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["powerbi-desktop-mcp", "serve", "--install-dir", "C:\\MCPServers\\PowerBIModelingMCP"],
      "env": {}
    }
  }
}
```

> Adjust `--install-dir` if you used a custom install path.

---

## About

This package installs and wraps Microsoft's **Power BI Modeling MCP Server**, adding extra tools and CLI commands on top.

### Official MCP Server (by Microsoft)

- **GitHub**: [microsoft/powerbi-modeling-mcp](https://github.com/microsoft/powerbi-modeling-mcp)
- **VS Code Extension**: [Power BI Modeling MCP](https://marketplace.visualstudio.com/items?itemName=analysis-services.powerbi-modeling-mcp)
- **License**: MIT

### What Microsoft's server supports

- Build and modify semantic models with natural language
- Execute bulk operations across hundreds of objects
- Apply modeling best practices
- Enable agentic workflows with TMDL and Power BI Project files
- Query and validate DAX against your semantic models

### What this package adds

- Automatic download and installation of the MCP server
- One-step configuration for Claude Desktop and Claude Code
- `extract_dax` MCP tool — extracts all DAX in one call for Claude to translate
- `extract-dax` CLI — save DAX to a file from the terminal
- `translate-dax` CLI — translate DAX to Qlik Sense QVS via Claude API

---

## Contributing

Issues for the underlying MCP server: [microsoft/powerbi-modeling-mcp/issues](https://github.com/microsoft/powerbi-modeling-mcp/issues)
