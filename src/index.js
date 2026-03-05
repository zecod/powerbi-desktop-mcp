#!/usr/bin/env node

import { program } from "commander";
import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";
import { status } from "./commands/status.js";
import { extractDax } from "./commands/extractDax.js";

program
  .name("powerbi-desktop-mcp")
  .description("Install and configure Power BI Desktop MCP for Claude")
  .version("1.0.0");

program
  .command("install")
  .description("Download, install and configure powerbi-modeling-mcp")
  .option("-d, --dir <path>", "Install directory", "C:\\MCPServers\\PowerBIModelingMCP")
  .option("-v, --mcp-version <version>", "MCP version to install", "0.4.0")
  .option("-s, --skip-confirmation", "Skip confirmation prompts in MCP server")
  .action(install);

program
  .command("uninstall")
  .description("Remove powerbi-modeling-mcp and clean up Claude configs")
  .option("-d, --dir <path>", "Install directory", "C:\\MCPServers\\PowerBIModelingMCP")
  .action(uninstall);

program
  .command("status")
  .description("Check installation status and Claude config")
  .action(status);

program
  .command("extract-dax")
  .description("Extract DAX code from Power BI models")
  .option("-f, --file <name>", "Power BI Desktop file name")
  .option("-w, --workspace <name>", "Fabric workspace name")
  .option("-m, --model <name>", "Semantic model name")
  .option("-o, --output <path>", "Output file path (default: ./dax-extract.dax)")
  .option("-t, --type <type>", "Extract type: all, measures, columns (default: all)", "all")
  .option("-d, --install-dir <path>", "MCP server install directory", "C:\\MCPServers\\PowerBIModelingMCP")
  .action(extractDax);

program.parse();
