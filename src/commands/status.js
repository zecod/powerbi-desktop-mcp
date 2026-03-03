import fs from "fs";
import chalk from "chalk";
import { banner, info, ok, warn } from "../utils/logger.js";
import {
  CLAUDE_DESKTOP_CONFIG,
  CLAUDE_CODE_CONFIG,
  loadConfig
} from "../utils/config.js";

export async function status() {
  banner();

  console.log(chalk.cyan("► Claude Desktop"));
  const desktop = loadConfig(CLAUDE_DESKTOP_CONFIG);
  if (desktop?.mcpServers?.["powerbi-desktop-mcp"]) {
    ok("Configured");
    const entry = desktop.mcpServers["powerbi-desktop-mcp"];
    info(`  command : ${entry.command}`);
    info(`  args    : ${entry.args.join(", ")}`);
    const exeExists = fs.existsSync(entry.command);
    exeExists ? ok("EXE exists on disk") : warn("EXE not found on disk!");
  } else {
    warn("Not configured");
  }

  console.log("");
  console.log(chalk.cyan("► Claude Code"));
  const code = loadConfig(CLAUDE_CODE_CONFIG);
  if (code?.mcpServers?.["powerbi-desktop-mcp"]) {
    ok("Configured");
    const entry = code.mcpServers["powerbi-desktop-mcp"];
    info(`  command : ${entry.command}`);
    info(`  args    : ${entry.args.join(", ")}`);
    const exeExists = fs.existsSync(entry.command);
    exeExists ? ok("EXE exists on disk") : warn("EXE not found on disk!");
  } else {
    warn("Not configured");
  }

  console.log("");
}
