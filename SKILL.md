---
name: powerbi-desktop-mcp
description: Full control over Power BI semantic models from Claude — connect to open Power BI Desktop files or Fabric workspaces, extract DAX measures and calculated columns, and migrate Power BI models to Qlik Sense QVS format.
---

# Skill: powerbi-desktop-mcp

You have access to the **powerbi-desktop-mcp** MCP server. This server gives you full control over Power BI semantic models and enables Power BI → Qlik Sense migration workflows.

---

## What This MCP Does

`powerbi-desktop-mcp` is a combined MCP server that exposes:

1. **All Microsoft Power BI Modeling tools** — connect to open Power BI Desktop files or Fabric workspaces, and read/write semantic model objects (tables, measures, columns, relationships).
2. **`extract_dax`** — a custom tool that extracts every DAX measure and calculated column from a model in one call, formatted and ready for translation.

It is Windows-only and requires Power BI Desktop to be running with the target file open (for local files).

---

## Available MCP Tools

### Custom Tool — `extract_dax`

Extracts all DAX measures and calculated columns from an open Power BI Desktop file or a Fabric workspace model.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | string (optional) | Partial, case-insensitive match of the Power BI Desktop window title. Use when the file is open locally. |
| `workspace` | string (optional) | Fabric workspace name. Use for cloud datasets. |
| `model` | string (optional) | Fabric semantic model name. Required when `workspace` is used. |

**Rules:**
- Provide either `file` OR both `workspace` + `model`.
- `file` does a substring match — `"Sales"` matches `"SalesReport - Power BI Desktop"`.

**Example calls:**
```
extract_dax(file="SalesReport")
extract_dax(workspace="Finance Workspace", model="Budget Model")
```

**Output format** — returns a structured markdown block:
```
DAX extracted from Power BI model: "SalesReport"
Measures: 10, Calculated columns: 18

## MEASURES
### Total Revenue (Table: Sales)
Description: Total gross revenue before discounts
Format: $#,##0.00
```dax
SUM(Sales[Revenue])
```

## CALCULATED COLUMNS
### Profit Margin (Table: Sales)
```dax
DIVIDE([Profit], [Revenue], 0)
```
```

---

### Microsoft Power BI Modeling Tools (Proxied)

These are the native tools from Microsoft's `powerbi-modeling-mcp.exe`, exposed through the same server:

| Tool | Capabilities |
|------|-------------|
| `connection_operations` | `LISTLOCALINSTANCES` — list open Power BI Desktop files; `CONNECT` — connect to a local file; `CONNECTFABRIC` — connect to a Fabric workspace; `CONNECTTOPBIP` — connect to a PBIP project |
| `table_operations` | `LIST` all tables; `GET` table details |
| `measure_operations` | `LIST` measures; `GET` full DAX; `CREATE` new measures; `UPDATE` existing measures |
| `column_operations` | `LIST` columns; `GET` column details (including calculated column expressions) |
| `relationship_operations` | List and manage model relationships |
| `database_operations` | `CREATE` a new database (for PBIP workflows) |

---

## How to Connect to a Power BI File

Before using any modeling tool, connect to the model first:

1. **List open files:**
   ```
   connection_operations(operation="LISTLOCALINSTANCES")
   ```
2. **Connect to a file by title:**
   ```
   connection_operations(operation="CONNECT", windowTitle="SalesReport")
   ```
3. **Connect to Fabric:**
   ```
   connection_operations(operation="CONNECTFABRIC", workspaceName="Finance Workspace", modelName="Budget Model")
   ```

---

## Power BI → Qlik Sense Migration Workflow

When the user asks to translate a Power BI file, model, or DAX to Qlik (QVS), follow this workflow:

### Step 1 — Extract DAX

Use the `extract_dax` tool to pull all DAX from the model:

```
extract_dax(file="<window title>")
```

Or for Fabric:
```
extract_dax(workspace="<workspace>", model="<model>")
```

### Step 2 — Translate to QVS

Translate the extracted DAX to Qlik Sense QVS format using the rules below.

**DAX → QVS Translation Rules:**

| DAX Pattern | QVS Equivalent |
|-------------|---------------|
| `SUM(Table[Column])` | `Sum(Column)` |
| `AVERAGE(Table[Column])` | `Avg(Column)` |
| `COUNTROWS(Table)` | `Count(TOTAL 1)` |
| `DISTINCTCOUNT(Table[Column])` | `Count(DISTINCT Column)` |
| `DIVIDE(a, b, 0)` | `If(b = 0, 0, a / b)` |
| `CALCULATE(expr, filter)` | Qlik Set Analysis: `Sum({<Field={'value'}>} Column)` |
| `ALL(Table)` | `TOTAL` keyword or `{1}` set modifier |
| `ALLEXCEPT(Table, col)` | `{<$::col>}` or add manual review note |
| `YEAR([Date])` | `Year(Date)` |
| `MONTH([Date])` | `Month(Date)` |
| `FORMAT([Date], "MMMM")` | `Date(Date, 'MMMM')` |
| `IF(condition, a, b)` | `If(condition, a, b)` |
| `BLANK()` | `Null()` |
| `RELATED(Table[Column])` | Handled in LOAD script via key join |

**Output format — always produce two sections:**

```qvs
// ============================================================
// QLIK SENSE EXPRESSIONS  (translated from Power BI DAX)
// Model: <ModelName>  •  Generated: <Date>
// ============================================================

// [MeasureName]  (Table: TableName)
// DAX:  <original DAX>
// NOTE: <optional caveat if translation is approximate>
<qlik expression>


// ============================================================
// QVS LOAD SCRIPT  (calculated columns)
// ============================================================

LOAD
    *,
    // [ColumnName]  (Table: TableName)
    // DAX:  <original DAX>
    <qlik expression> AS [ColumnName]
FROM [your-data-source] (qvd);
```

**Rules for output:**
- Always preserve the original DAX as a comment (`// DAX: ...`).
- Add `// NOTE:` comments on any expression that may need manual review (e.g., `ALLEXCEPT`, complex `CALCULATE` with multiple filters, time intelligence).
- Measures go in the **QLIK SENSE EXPRESSIONS** section.
- Calculated columns go in the **QVS LOAD SCRIPT** section as `LOAD` fields.
- Ask the user for the output file path if they want to save to a `.qvs` file; otherwise display inline.

### Step 3 — Save the File (optional)

If the user wants the output saved, create a `.qvs` file with the translated content.

---

## Example Prompts and How to Handle Them

| User says | What to do |
|-----------|-----------|
| "Connect to my Power BI file SalesReport" | Call `connection_operations(CONNECT)` with matching title |
| "List all measures" | Call `measure_operations(LIST)` for each table |
| "Extract all DAX from my model" | Call `extract_dax(file=...)` |
| "Translate my Power BI file to Qlik" | Extract DAX with `extract_dax`, then translate using rules above |
| "Translate [filename].pbix to .qvs" | Extract DAX from the open file matching that name, translate to QVS |
| "Create a measure called Profit Margin" | Call `measure_operations(CREATE)` with the DAX expression |
| "Show me all tables in the model" | Call `table_operations(LIST)` |
| "What relationships exist in the model?" | Call `relationship_operations(LIST)` |
| "Migrate SalesReport from Power BI to Qlik" | Full migration workflow: connect → extract → translate → output QVS |

---

## Requirements & Constraints

- **Windows only** — this MCP only runs on Windows (win32-x64).
- **Power BI Desktop must be open** — for local files, the `.pbix` file must be open in Power BI Desktop before connecting.
- **Fabric credentials** — for Fabric workspace connections, the user must be authenticated in Power BI Desktop.
- **Translation is AI-assisted** — complex DAX patterns (multi-filter `CALCULATE`, time intelligence, `USERELATIONSHIP`) may need manual review. Always add `// NOTE:` comments on those.
- **No API key needed for `extract_dax`** — the extraction tool works without any API key. The `translate-dax` CLI command requires `ANTHROPIC_API_KEY`, but translation inside Claude does not.

---

## Installation Reference (for users asking how to set up)

```bash
npx powerbi-desktop-mcp install
```

This command:
1. Downloads `powerbi-modeling-mcp.exe` from the VS Code Marketplace.
2. Extracts it to `C:\MCPServers\PowerBIModelingMCP` (default).
3. Asks whether to configure Claude Desktop and/or Claude Code automatically.

Manual config entry (if needed):
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

- Claude Desktop config: `%APPDATA%\Claude\claude_desktop_config.json`
- Claude Code config: `%USERPROFILE%\.claude.json`
