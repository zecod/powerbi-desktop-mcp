import fs from "fs";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import { banner, step, ok, warn, fail, info } from "../utils/logger.js";
import { askInput } from "../utils/prompt.js";
import { PowerBIMCPClient, getMCPServerPath } from "../utils/mcpClient.js";

export async function extractDax(options) {
  banner();

  const { file, workspace, model, output, type } = options;
  const mcpServerPath = getMCPServerPath(options.installDir);

  // Validate MCP server exists
  if (!fs.existsSync(mcpServerPath)) {
    fail("MCP server not found. Please run 'powerbi-desktop-mcp install' first.");
    process.exit(1);
  }

  const spinner = ora({ text: "Starting MCP server...", stream: process.stdout }).start();
  const client = new PowerBIMCPClient(mcpServerPath);

  try {
    // Start the MCP server
    await client.start();
    spinner.succeed("MCP server started");

    // Connect to the model
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

    // Extract DAX based on type
    step("Extracting DAX...");
    const daxContent = [];

    // Extract measures
    if (!type || type === "all" || type === "measures") {
      info("Extracting measures...");
      const measures = await client.listMeasures();
      
      if (measures && measures.length > 0) {
        daxContent.push("-- ========================================");
        daxContent.push("-- MEASURES");
        daxContent.push("-- ========================================\n");
        
        for (const measure of measures) {
          daxContent.push(`-- Measure: ${measure.name || measure.Name}`);
          if (measure.description || measure.Description) {
            daxContent.push(`-- Description: ${measure.description || measure.Description}`);
          }
          const measureTable = measure.tableName || measure.table || measure.Table;
          if (measureTable) {
            daxContent.push(`-- Table: ${measureTable}`);
          }
          daxContent.push(measure.expression || measure.Expression || "");
          daxContent.push("");
        }
        ok(`Extracted ${measures.length} measures`);
      } else {
        warn("No measures found");
      }
    }

    // Extract calculated columns
    if (!type || type === "all" || type === "columns") {
      info("Extracting calculated columns...");
      const tableGroups = await client.listCalculatedColumns();
      let columnCount = 0;

      if (tableGroups && tableGroups.length > 0) {
        daxContent.push("-- ========================================");
        daxContent.push("-- CALCULATED COLUMNS");
        daxContent.push("-- ========================================\n");

        for (const group of tableGroups) {
          const tableName = group.name;
          daxContent.push(`-- Table: ${tableName}`);
          for (const col of group.columns) {
            daxContent.push(`-- Column: ${col.name || col.Name}`);
            if (col.description || col.Description) {
              daxContent.push(`-- Description: ${col.description || col.Description}`);
            }
            daxContent.push(col.expression || col.Expression || "");
            daxContent.push("");
            columnCount++;
          }
        }
        ok(`Extracted ${columnCount} calculated columns`);
      } else {
        warn("No calculated columns found");
      }
    }

    // Determine output path — prompt if not provided via --output
    let outputPath;
    if (output) {
      outputPath = output;
    } else {
      const name = await askInput("Output file name", "dax-extract");
      const safeName = name.endsWith(".dax") ? name : `${name}.dax`;
      outputPath = path.join(process.cwd(), safeName);
    }
    
    if (output === "stdout" || output === "-") {
      console.log("");
      console.log(daxContent.join("\n"));
    } else {
      fs.writeFileSync(outputPath, daxContent.join("\n"), "utf8");
      ok(`DAX exported to: ${outputPath}`);
    }

    // Stop the server
    await client.stop();

    console.log("");
    console.log(chalk.green("╔══════════════════════════════════════════════╗"));
    console.log(chalk.green("║         DAX Extraction Complete!             ║"));
    console.log(chalk.green("╚══════════════════════════════════════════════╝"));
    console.log("");

  } catch (error) {
    spinner.fail("Extraction failed");
    fail(error.message);
    await client.stop();
    process.exit(1);
  }
}
