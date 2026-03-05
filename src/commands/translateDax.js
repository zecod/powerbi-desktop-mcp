import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import ora from "ora";
import chalk from "chalk";
import { banner, step, ok, warn, fail, info } from "../utils/logger.js";
import { askInput } from "../utils/prompt.js";
import { PowerBIMCPClient, getMCPServerPath } from "../utils/mcpClient.js";

const MODEL = "claude-sonnet-4-6";

function buildPrompt(measures, calcColumnGroups, modelName) {
  const measureList = measures.map(m =>
    `  - Name: "${m.name}", Table: "${m.tableName}", DAX: ${m.expression}`
  ).join("\n");

  const columnList = calcColumnGroups.flatMap(g =>
    g.columns.map(c =>
      `  - Table: "${g.name}", Column: "${c.name || c.Name}", DAX: ${c.expression || c.Expression}`
    )
  ).join("\n");

  return `You are an expert in migrating Power BI semantic models to Qlik Sense.
Translate the following DAX measures and calculated columns to their Qlik Sense equivalents.

Model name: ${modelName}

## DAX MEASURES
${measureList || "  (none)"}

## DAX CALCULATED COLUMNS
${columnList || "  (none)"}

## Translation rules
- DAX measures → Qlik Set Analysis expressions (for use in charts/KPIs, not load script)
- DAX calculated columns → QVS LOAD script field expressions
- Preserve the semantic intent as closely as possible
- If a construct has no direct Qlik equivalent, provide the closest approximation and add a "notes" explaining what needs manual review
- Use Qlik field names without table qualifiers (Qlik uses a flat namespace)
- DAX DIVIDE(a, b, 0) → If(b=0, 0, a/b) in Qlik
- DAX CALCULATE(expr, filter) → Qlik Set Analysis: expr with {<Field={value}>}
- DAX ALL(Table) → Qlik TOTAL keyword or {1} set modifier
- DAX ALLEXCEPT(Table, col) → Qlik {<$::col>} or manual review note

## Required output format (strict JSON, no markdown):
{
  "measures": [
    {
      "name": "measure name",
      "tableName": "table name",
      "dax": "original DAX",
      "qlikExpression": "translated Qlik expression",
      "notes": "any caveats or empty string"
    }
  ],
  "calculatedColumns": [
    {
      "tableName": "table name",
      "name": "column name",
      "dax": "original DAX",
      "qvsField": "expression AS [Column Name]",
      "notes": "any caveats or empty string"
    }
  ]
}`;
}

function renderQvs(translation, modelName) {
  const lines = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push(`// ${"=".repeat(60)}`);
  lines.push(`// QLIK SENSE EXPRESSIONS  (translated from Power BI DAX)`);
  lines.push(`// Model: ${modelName}  •  Generated: ${now}`);
  lines.push(`// ${"=".repeat(60)}`);
  lines.push("");

  if (translation.measures && translation.measures.length > 0) {
    for (const m of translation.measures) {
      lines.push(`// [${m.name}]  (Table: ${m.tableName})`);
      lines.push(`// DAX:  ${m.dax}`);
      if (m.notes) lines.push(`// NOTE: ${m.notes}`);
      lines.push(m.qlikExpression);
      lines.push("");
    }
  } else {
    lines.push("// (no measures)");
    lines.push("");
  }

  if (translation.calculatedColumns && translation.calculatedColumns.length > 0) {
    lines.push("");
    lines.push(`// ${"=".repeat(60)}`);
    lines.push(`// QVS LOAD SCRIPT  (calculated columns)`);
    lines.push(`// ${"=".repeat(60)}`);
    lines.push("");
    lines.push("LOAD");
    lines.push("    *,");

    const cols = translation.calculatedColumns;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      lines.push(`    // [${c.name}]  (Table: ${c.tableName})`);
      lines.push(`    // DAX:  ${c.dax}`);
      if (c.notes) lines.push(`    // NOTE: ${c.notes}`);
      const comma = i < cols.length - 1 ? "," : "";
      lines.push(`    ${c.qvsField}${comma}`);
      lines.push("");
    }

    lines.push("FROM [your-data-source] (qvd);");
    lines.push("");
  }

  return lines.join("\n");
}

export async function translateDax(options) {
  banner();

  const { file, workspace, model, output, installDir } = options;
  const mcpServerPath = getMCPServerPath(installDir);

  if (!fs.existsSync(mcpServerPath)) {
    fail("MCP server not found. Please run 'powerbi-desktop-mcp install' first.");
    process.exit(1);
  }

  // ── Extract DAX from Power BI ────────────────────────────
  const spinner = ora({ text: "Starting MCP server...", stream: process.stdout }).start();
  const client = new PowerBIMCPClient(mcpServerPath);

  let measures = [];
  let calcColumnGroups = [];
  let modelName = file || model || "unknown";

  try {
    await client.start();
    spinner.succeed("MCP server started");

    step("Connecting to Power BI model...");
    if (file) {
      await client.connectToPowerBIDesktop(file);
      ok(`Connected to Power BI Desktop: ${file}`);
    } else if (workspace && model) {
      await client.connectToFabric(workspace, model);
      ok(`Connected to Fabric: ${workspace}/${model}`);
    } else {
      fail("Please specify either --file or both --workspace and --model");
      await client.stop();
      process.exit(1);
    }

    step("Extracting DAX...");
    const extractSpinner = ora({ text: "Fetching measures...", stream: process.stdout }).start();
    measures = await client.listMeasures();
    extractSpinner.text = "Fetching calculated columns...";
    calcColumnGroups = await client.listCalculatedColumns();
    extractSpinner.succeed(`Extracted ${measures.length} measures, ${calcColumnGroups.reduce((n, g) => n + g.columns.length, 0)} calculated columns`);

    await client.stop();
  } catch (error) {
    spinner.fail("Extraction failed");
    fail(error.message);
    await client.stop();
    process.exit(1);
  }

  if (measures.length === 0 && calcColumnGroups.length === 0) {
    warn("Nothing to translate — no measures or calculated columns found.");
    process.exit(0);
  }

  // ── Check API key ─────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("");
    fail("ANTHROPIC_API_KEY is not set.");
    info("Get your key at: https://console.anthropic.com");
    info("Then set it in your terminal before running:");
    info("  bash/zsh:   export ANTHROPIC_API_KEY=sk-ant-...");
    info("  PowerShell: $env:ANTHROPIC_API_KEY=\"sk-ant-...\"");
    info("  CMD:        set ANTHROPIC_API_KEY=sk-ant-...");
    info("Or inline:  ANTHROPIC_API_KEY=sk-ant-... node src/index.js translate-dax ...");
    console.log("");
    process.exit(1);
  }

  // ── Translate via Claude API ──────────────────────────────
  const translateSpinner = ora({ text: "Translating DAX to Qlik Sense QVS (Claude API)...", stream: process.stdout }).start();

  let translation;
  try {
    const anthropic = new Anthropic({ apiKey });
    const prompt = buildPrompt(measures, calcColumnGroups, modelName);

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    });

    const raw = message.content[0].text.trim();
    // Strip markdown code fences if present
    const json = raw.startsWith("```") ? raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "") : raw;
    translation = JSON.parse(json);
    translateSpinner.succeed(`Translated ${translation.measures?.length ?? 0} measures, ${translation.calculatedColumns?.length ?? 0} calculated columns`);
  } catch (error) {
    translateSpinner.fail("Translation failed");
    fail(error.message);
    process.exit(1);
  }

  // ── Determine output path ─────────────────────────────────
  let outputPath;
  if (output) {
    outputPath = output;
  } else {
    const name = await askInput("Output file name", "qlik-migration");
    const safeName = name.endsWith(".qvs") ? name : `${name}.qvs`;
    outputPath = path.join(process.cwd(), safeName);
  }

  // ── Write QVS file ────────────────────────────────────────
  const qvsContent = renderQvs(translation, modelName);
  fs.writeFileSync(outputPath, qvsContent, "utf8");
  ok(`QVS exported to: ${outputPath}`);

  console.log("");
  console.log(chalk.green("╔══════════════════════════════════════════════╗"));
  console.log(chalk.green("║       DAX → QVS Translation Complete!        ║"));
  console.log(chalk.green("╚══════════════════════════════════════════════╝"));
  console.log("");
  info(`Model    : ${modelName}`);
  info(`Measures : ${translation.measures?.length ?? 0}`);
  info(`Columns  : ${translation.calculatedColumns?.length ?? 0}`);
  info(`Output   : ${outputPath}`);
  console.log("");
  console.log(chalk.yellow("  Review the output file before using in Qlik Sense."));
  console.log(chalk.yellow("  Complex DAX patterns may require manual adjustments."));
  console.log("");
}
