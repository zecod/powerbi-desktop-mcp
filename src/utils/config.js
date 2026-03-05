import fs from "fs";
import path from "path";
import os from "os";

// Detect if running in WSL and resolve to Windows paths
function getWindowsHome() {
  // If running in WSL, USERPROFILE points to Windows home
  if (process.env.USERPROFILE) return process.env.USERPROFILE;
  // Fallback for native Windows
  return os.homedir();
}

function getAppData() {
  if (process.env.APPDATA) return process.env.APPDATA;
  return path.join(getWindowsHome(), "AppData", "Roaming");
}

// Claude Desktop config path
export const CLAUDE_DESKTOP_CONFIG = path.join(
  getAppData(), "Claude", "claude_desktop_config.json"
);

// Claude Code config path
export const CLAUDE_CODE_CONFIG = path.join(
  getWindowsHome(), ".claude.json"
);

export function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(configPath, config) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function addMcpEntry(config, exePath, skipConfirmation = false) {
  if (!config.mcpServers) config.mcpServers = {};
  const args = ["--start"];
  if (skipConfirmation) args.push("--skipconfirmation");
  config.mcpServers["powerbi-desktop-mcp"] = {
    type: "stdio",
    command: exePath,
    args,
    env: {}
  };
  return config;
}

export function removeMcpEntry(config) {
  if (config.mcpServers) {
    delete config.mcpServers["powerbi-desktop-mcp"];
  }
  return config;
}

export function addTranslatorMcpEntry(config) {
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers["powerbi-dax-translator"] = {
    type: "stdio",
    command: process.execPath,
    args: [process.argv[1], "serve"],
    env: {}
  };
  return config;
}

export function removeTranslatorMcpEntry(config) {
  if (config.mcpServers) {
    delete config.mcpServers["powerbi-dax-translator"];
  }
  return config;
}
