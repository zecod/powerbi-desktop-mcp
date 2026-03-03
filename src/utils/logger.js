import chalk from "chalk";

export function banner() {
  console.log("");
  console.log(chalk.magenta("╔══════════════════════════════════════════════╗"));
  console.log(chalk.magenta("║    Power BI Desktop MCP  –  Installer        ║"));
  console.log(chalk.magenta("╚══════════════════════════════════════════════╝"));
  console.log("");
}

export function step(msg)  { console.log(chalk.cyan(`\n► ${msg}`)); }
export function ok(msg)    { console.log(chalk.green(`  ✔ ${msg}`)); }
export function warn(msg)  { console.log(chalk.yellow(`  ⚠ ${msg}`)); }
export function fail(msg)  { console.log(chalk.red(`  ✘ ${msg}`)); }
export function info(msg)  { console.log(chalk.white(`  ${msg}`)); }
