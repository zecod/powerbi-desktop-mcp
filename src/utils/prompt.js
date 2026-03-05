import readline from "readline";
import chalk from "chalk";

/**
 * Ask user a yes/no question
 * @param {string} question - The question to ask
 * @param {boolean} defaultYes - Default answer if user presses enter (true = yes, false = no)
 * @returns {Promise<boolean>}
 */
export function askYesNo(question, defaultYes = true) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    const prompt = `${chalk.cyan("?")} ${question} ${chalk.gray(hint)} `;

    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      
      // Empty answer uses default
      if (normalized === "") {
        resolve(defaultYes);
      } 
      // Accept y, yes, Y, YES, Yes, etc.
      else if (normalized === "y" || normalized === "yes") {
        resolve(true);
      }
      // Accept n, no, N, NO, No, etc.
      else if (normalized === "n" || normalized === "no") {
        resolve(false);
      }
      // Invalid input, use default
      else {
        resolve(defaultYes);
      }
    });
  });
}

/**
 * Ask user for text input with an optional default
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Value to use if user enters nothing or spaces
 * @returns {Promise<string>}
 */
export function askInput(question, defaultValue = "") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const hint = defaultValue ? chalk.gray(`(default: ${defaultValue})`) : "";
    const prompt = `${chalk.cyan("?")} ${question} ${hint} `;

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

/**
 * Ask user to select from multiple options
 * @param {string} question - The question to ask
 * @param {string[]} options - Array of options
 * @param {number} defaultIndex - Default option index (0-based)
 * @returns {Promise<number>} - Selected option index
 */
export function askSelect(question, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`${chalk.cyan("?")} ${question}`);
    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? chalk.green(">") : " ";
      console.log(`  ${marker} ${i + 1}. ${opt}`);
    });

    const prompt = chalk.gray(`Enter choice [1-${options.length}] (default: ${defaultIndex + 1}): `);

    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim();
      if (normalized === "") {
        resolve(defaultIndex);
      } else {
        const num = parseInt(normalized, 10);
        if (num >= 1 && num <= options.length) {
          resolve(num - 1);
        } else {
          resolve(defaultIndex);
        }
      }
    });
  });
}
