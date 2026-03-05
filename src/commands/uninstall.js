import fs from "fs";
import chalk from "chalk";
import { banner, step, ok, warn, fail } from "../utils/logger.js";
import {
  CLAUDE_DESKTOP_CONFIG,
  CLAUDE_CODE_CONFIG,
  loadConfig,
  saveConfig,
  removeMcpEntry,
  removeTranslatorMcpEntry
} from "../utils/config.js";

export async function uninstall(options) {
  banner();

  const installDir = options.dir;
  let wasConfiguredInDesktop = false;
  let wasConfiguredInCode = false;

  // ── Remove from Claude Desktop ───────────────────────────────
  step("Removing from Claude Desktop config...");
  let desktopConfig = loadConfig(CLAUDE_DESKTOP_CONFIG);
  if (desktopConfig?.mcpServers?.["powerbi-desktop-mcp"]) {
    desktopConfig = removeMcpEntry(desktopConfig);
    desktopConfig = removeTranslatorMcpEntry(desktopConfig);
    saveConfig(CLAUDE_DESKTOP_CONFIG, desktopConfig);
    ok("Removed from Claude Desktop");
    wasConfiguredInDesktop = true;
  } else {
    warn("Not found in Claude Desktop config");
  }

  // ── Remove from Claude Code ──────────────────────────────────
  step("Removing from Claude Code config...");
  let codeConfig = loadConfig(CLAUDE_CODE_CONFIG);
  if (codeConfig?.mcpServers?.["powerbi-desktop-mcp"]) {
    codeConfig = removeMcpEntry(codeConfig);
    codeConfig = removeTranslatorMcpEntry(codeConfig);
    saveConfig(CLAUDE_CODE_CONFIG, codeConfig);
    ok("Removed from Claude Code");
    wasConfiguredInCode = true;
  } else {
    warn("Not found in Claude Code config");
  }

  // ── Remove install dir ───────────────────────────────────────
  step(`Removing install directory: ${installDir}`);
  if (fs.existsSync(installDir)) {
    try {
      fs.rmSync(installDir, { recursive: true, force: true });
      ok("Directory removed");
    } catch (e) {
      if (e.code === "EPERM" || e.code === "EBUSY") {
        fail("Cannot remove installation directory - MCP server is currently in use");
        console.log("");
        console.log(chalk.yellow("  The MCP server is being used by one or more applications."));
        console.log(chalk.yellow("  Please close the following and try again:"));
        console.log("");
        
        if (wasConfiguredInDesktop) {
          console.log(chalk.cyan("  • Claude Desktop"));
          console.log(chalk.gray("    Close the application completely (check system tray)"));
        }
        
        if (wasConfiguredInCode) {
          console.log(chalk.cyan("  • Claude Code (VS Code)"));
          console.log(chalk.gray("    Close VS Code or disable the Claude Code extension"));
        }
        
        if (!wasConfiguredInDesktop && !wasConfiguredInCode) {
          console.log(chalk.cyan("  • Any application using the MCP server"));
        }
        
        console.log("");
        console.log(chalk.yellow("  After closing these applications, run:"));
        console.log(chalk.white(`  npx powerbi-desktop-mcp uninstall`));
        console.log("");
        
        // Show what was successfully removed
        if (wasConfiguredInDesktop || wasConfiguredInCode) {
          console.log(chalk.green("  ✔ Configuration files were cleaned up successfully"));
          console.log(chalk.yellow("  ⚠ Installation directory could not be removed"));
        }
        
        console.log("");
        process.exit(1);
      }
      throw e;
    }
  } else {
    warn("Install directory not found — skipping");
  }

  console.log("");
  console.log(chalk.green("╔══════════════════════════════════════════════╗"));
  console.log(chalk.green("║          Uninstall Complete!                 ║"));
  console.log(chalk.green("╚══════════════════════════════════════════════╝"));
  console.log("");
  
  if (wasConfiguredInDesktop || wasConfiguredInCode) {
    console.log(chalk.cyan("  What was removed:"));
    if (wasConfiguredInDesktop) {
      console.log(chalk.white("  • Claude Desktop configuration"));
    }
    if (wasConfiguredInCode) {
      console.log(chalk.white("  • Claude Code configuration"));
    }
    console.log(chalk.white(`  • Installation directory: ${installDir}`));
    console.log("");
  }
}
