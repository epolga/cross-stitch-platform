import * as fs from "node:fs";
import * as path from "node:path";

const PLATFORM_DOCS_REPO_NAME = "cross-stitch-platform-docs";
const CONFIG_FILE_NAME = "platform-config.json";

interface PlatformConfig {
  pinterestTokenPath?: string;
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function locateConfigFile(): string {
  const envOverride = process.env.PLATFORM_CONFIG_PATH;
  if (envOverride && envOverride.trim() !== "") {
    if (!fs.existsSync(envOverride)) {
      throw new Error(
        `PLATFORM_CONFIG_PATH points to a file that does not exist: ${envOverride}`
      );
    }
    return path.resolve(envOverride);
  }

  let current = path.resolve(__dirname);
  while (true) {
    const candidate = path.join(current, PLATFORM_DOCS_REPO_NAME, CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(
    `Could not locate ${CONFIG_FILE_NAME}. Set PLATFORM_CONFIG_PATH or place the ` +
      `${PLATFORM_DOCS_REPO_NAME} repo alongside the calling project.`
  );
}

let cachedConfig: { configPath: string; data: PlatformConfig } | null = null;

function loadConfig(): { configPath: string; data: PlatformConfig } {
  if (cachedConfig) return cachedConfig;

  const configPath = locateConfigFile();
  const raw = fs.readFileSync(configPath, "utf8");
  let data: PlatformConfig;
  try {
    data = JSON.parse(stripJsonComments(raw)) as PlatformConfig;
  } catch (err) {
    throw new Error(
      `Failed to parse platform-config.json at ${configPath}: ${(err as Error).message}`
    );
  }
  cachedConfig = { configPath, data };
  return cachedConfig;
}

export function resolvePinterestTokenPath(): string {
  const { configPath, data } = loadConfig();
  const tokenPath = data.pinterestTokenPath;

  if (!tokenPath || tokenPath.trim() === "") {
    throw new Error(`pinterestTokenPath is not set in ${configPath}`);
  }

  if (path.isAbsolute(tokenPath)) {
    return path.resolve(tokenPath);
  }

  const workspaceRoot = path.dirname(path.dirname(configPath));
  return path.resolve(workspaceRoot, tokenPath);
}
