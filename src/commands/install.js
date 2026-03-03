import fs from "fs";
import path from "path";
import https from "https";
import os from "os";
import zlib from "zlib";
import AdmZip from "adm-zip";
import ora from "ora";
import chalk from "chalk";
import { banner, step, ok, warn, fail, info } from "../utils/logger.js";
import {
  CLAUDE_DESKTOP_CONFIG,
  CLAUDE_CODE_CONFIG,
  loadConfig,
  saveConfig,
  addMcpEntry
} from "../utils/config.js";
import { askYesNo } from "../utils/prompt.js";

const DOWNLOAD_URL = (version) =>
  `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/analysis-services/vsextensions/powerbi-modeling-mcp/${version}/vspackage?targetPlatform=win32-x64`;

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = (u) => {
      https.get(u, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(destPath);

        // Server sends gzip-encoded content — decompress on the fly
        const isGzipped = res.headers["content-encoding"] === "gzip";
        const stream = isGzipped ? res.pipe(zlib.createGunzip()) : res;

        stream.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
        stream.on("error", reject);
      }).on("error", reject);
    };
    request(url);
  });
}

function findExe(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      const found = findExe(full);
      if (found) return found;
    } else if (f.name === "powerbi-modeling-mcp.exe") {
      return full;
    }
  }
  return null;
}

export async function install(options) {
  banner();

  const installDir  = options.dir;
  const version     = options.mcpVersion;
  const skipConfirm = options.skipConfirmation || false;
  const tmpZip      = path.join(os.tmpdir(), "powerbi-modeling-mcp.zip");

  info(`Version  : ${version}`);
  info(`Install  : ${installDir}`);
  console.log("");

  // ── Download + decompress ────────────────────────────────────
  const spinner = ora("Downloading powerbi-modeling-mcp...").start();
  try {
    await download(DOWNLOAD_URL(version), tmpZip);
    spinner.succeed(`Downloaded v${version}`);
  } catch (e) {
    spinner.fail(`Download failed: ${e.message}`);
    process.exit(1);
  }

  // ── Verify zip header ────────────────────────────────────────
  const buf = Buffer.alloc(4);
  const fd = fs.openSync(tmpZip, "r");
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  if (buf[0] !== 0x50 || buf[1] !== 0x4B) {
    fail(`Unexpected file format. First bytes: ${buf.toString("hex")}`);
    process.exit(1);
  }

  // ── Extract ─────────────────────────────────────────────────
  step("Extracting...");
  if (fs.existsSync(installDir)) {
    warn("Removing old version...");
    try {
      fs.rmSync(installDir, { recursive: true, force: true });
    } catch (e) {
      if (e.code === "EPERM" || e.code === "EBUSY") {
        fail("Cannot remove old version - files are in use");
        console.log("");
        console.log(chalk.yellow("  Please close the following applications and try again:"));
        info("• Claude Desktop");
        info("• Claude Code (VS Code)");
        info("• Any other application using the MCP server");
        console.log("");
        console.log(chalk.cyan("  Then run the install command again."));
        console.log("");
        process.exit(1);
      }
      throw e;
    }
  }
  fs.mkdirSync(installDir, { recursive: true });
  try {
    new AdmZip(tmpZip).extractAllTo(installDir, true);
    ok(`Extracted to ${installDir}`);
  } catch (e) {
    fail(`Extraction failed: ${e.message}`);
    process.exit(1);
  }

  // ── Find exe ────────────────────────────────────────────────
  step("Locating powerbi-modeling-mcp.exe...");
  const exePath = findExe(installDir);
  if (!exePath) {
    fail("Could not find powerbi-modeling-mcp.exe");
    process.exit(1);
  }
  ok(`Found: ${exePath}`);

  // ── Ask user about Claude configuration ──────────────────────
  console.log("");
  const configureClaudeDesktop = await askYesNo("Configure Claude Desktop automatically?", true);
  const configureClaudeCode = await askYesNo("Configure Claude Code automatically?", true);
  console.log("");

  // ── Configure Claude Desktop ─────────────────────────────────
  if (configureClaudeDesktop) {
    step("Configuring Claude Desktop...");
    saveConfig(CLAUDE_DESKTOP_CONFIG, addMcpEntry(loadConfig(CLAUDE_DESKTOP_CONFIG), exePath, skipConfirm));
    ok(`Saved: ${CLAUDE_DESKTOP_CONFIG}`);
  } else {
    info("Skipped Claude Desktop configuration");
  }

  // ── Configure Claude Code ────────────────────────────────────
  if (configureClaudeCode) {
    step("Configuring Claude Code...");
    saveConfig(CLAUDE_CODE_CONFIG, addMcpEntry(loadConfig(CLAUDE_CODE_CONFIG), exePath, skipConfirm));
    ok(`Saved: ${CLAUDE_CODE_CONFIG}`);
  } else {
    info("Skipped Claude Code configuration");
  }

  // ── Cleanup ──────────────────────────────────────────────────
  fs.rmSync(tmpZip, { force: true });

  // ── Done ─────────────────────────────────────────────────────
  console.log("");
  console.log(chalk.green("╔══════════════════════════════════════════════╗"));
  console.log(chalk.green("║            Installation Complete!            ║"));
  console.log(chalk.green("╚══════════════════════════════════════════════╝"));
  console.log("");
  info(`EXE            : ${exePath}`);
  if (configureClaudeDesktop) {
    info(`Claude Desktop : ${CLAUDE_DESKTOP_CONFIG}`);
  }
  if (configureClaudeCode) {
    info(`Claude Code    : ${CLAUDE_CODE_CONFIG}`);
  }
  if (!configureClaudeDesktop && !configureClaudeCode) {
    console.log("");
    console.log(chalk.yellow("  Manual configuration required:"));
    info(`Add the MCP server to your Claude config manually.`);
    info(`EXE path: ${exePath}`);
  }
  console.log("");
  console.log(chalk.yellow("  Next steps:"));
  info("1. Open Power BI Desktop with your model");
  if (configureClaudeDesktop || configureClaudeCode) {
    info("2. Restart Claude Desktop or Claude Code");
  }
  info("3. Say: Connect to your-file-name in Power BI Desktop");
  console.log("");
}
