import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface AstGrepMatch {
  file: string;
  range: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
  text: string;
  language: string;
  [key: string]: unknown;
}

export interface RunAstGrepOptions {
  args: string[];
  input?: string;
  directory?: string;
}

export async function runAstGrep({ args, input, directory }: RunAstGrepOptions): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const fullArgs = ["ast-grep", ...args];
  const cmd = fullArgs[0];
  const cmdArgs = fullArgs.slice(1);

  // @ts-ignore
  const child = spawn(cmd, cmdArgs, {
    stdio: ["pipe", "pipe", "pipe"] as const,
  }) as any;

  if (input) {
    child.stdin.write(input);
    child.stdin.end();
  }

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode: number) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });
  });
}

export function formatMatchesAsText(matches: AstGrepMatch[]): string {
  if (!matches.length) {
    return "";
  }

  const outputBlocks = [];
  for (const m of matches) {
    const filePath = m.file;
    const startLine = m.range.start.line + 1;
    const endLine = m.range.end.line + 1;
    const matchText = m.text.trimEnd();

    const header = startLine === endLine
      ? `${filePath}:${startLine}`
      : `${filePath}:${startLine}-${endLine}`;

    outputBlocks.push(`${header}\n${matchText}`);
  }

  return outputBlocks.join("\n\n");
}

export function getSupportedLanguages(): string[] {
  // Base languages supported by ast-grep
  const languages = [
    "bash", "c", "cpp", "csharp", "css", "elixir", "go", "haskell", "html",
    "java", "javascript", "json", "jsx", "kotlin", "lua", "nix", "php",
    "python", "ruby", "rust", "scala", "solidity", "swift", "tsx",
    "typescript", "yaml",
  ];

  // TODO: Load custom languages from sgconfig.yaml if present
  return languages.sort();
}

function getConfigPath(directory?: string): string | undefined {
  if (!directory) return undefined;
  const configPath = `${directory}/sgconfig.yaml`;
  // TODO: check file exists
  return configPath;
}

export async function executeAstGrep(
  command: "run" | "scan",
  args: string[],
  options?: { input?: string; directory?: string; config?: string }
): Promise<{ matches: AstGrepMatch[]; stdout: string; stderr: string }> {
  const allArgs = [];
  const config = options?.config ?? getConfigPath(options?.directory);
  if (config) {
    allArgs.push("--config", config);
  }
  allArgs.push(...args);

  const { stdout, stderr, exitCode } = await runAstGrep({
    args: [command, ...allArgs],
    input: options?.input,
    directory: options?.directory,
  });

  // ast-grep returns exit code 1 when no matches are found, but this is not an error.
  // Only raise an exception for actual errors (exit code != 0 and != 1)
  // or when exit code is 1 but stdout doesn't look like valid JSON output
  if (exitCode !== 0) {
    if (exitCode === 1) {
      const stdoutStripped = stdout.trim();
      // Valid "no matches" cases: empty JSON array or valid JSON with matches
      if (stdoutStripped === "" || stdoutStripped === "[]" || stdoutStripped.startsWith("[")) {
        return { matches: [], stdout, stderr };
      }
      // If --json flag is not present, empty stdout is also valid "no matches"
      if (!args.includes("--json") && stdoutStripped === "") {
        return { matches: [], stdout, stderr };
      }
    }
    // For all other non-zero exit codes, raise an error
    const stderrMsg = stderr.trim() || "(no error output)";
    throw new Error(`ast-grep failed with exit code ${exitCode}: ${stderrMsg}`);
  }

  // Parse JSON output if --json flag present
  if (args.includes("--json")) {
    try {
      const matches = JSON.parse(stdout.trim() || "[]") as AstGrepMatch[];
      return { matches, stdout, stderr };
    } catch (err) {
      throw new Error(`Failed to parse ast-grep JSON output: ${err}`);
    }
  }

  // For non-JSON output, return empty matches
  return { matches: [], stdout, stderr };
}