import { type ChildProcess, spawn } from 'node:child_process';
import type { Browser as PuppeteerBrowser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

export interface BrowserConfig {
  /**
   * Browser executable path (e.g., '/usr/bin/chromium', 'google-chrome-stable')
   * If not provided, will attempt to find common browser paths
   */
  executablePath?: string;

  /**
   * Remote debugging URL (e.g., 'http://localhost:9222')
   * If provided, will connect to existing browser instance
   */
  browserWSEndpoint?: string;

  /**
   * Command to launch browser (e.g., 'lightpanda serve --port 9222')
   * Used when no existing browser is available
   */
  browserLaunchCommand?: string;

  /**
   * Additional arguments for browser launch
   */
  args?: string[];

  /**
   * Run browser in headless mode (default: true)
   */
  headless?: boolean;

  /**
   * Timeout for browser operations in milliseconds
   */
  timeout?: number;
}

/**
 * Parse port and host from command line arguments
 */
function parseCommandArgs(args: string[]): { port: number; host: string } {
  let port = 9222; // default Chrome DevTools port
  let host = '127.0.0.1'; // default host

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--port' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        const portValue = parseInt(nextArg, 10);
        if (!Number.isNaN(portValue)) {
          port = portValue;
        }
      }
    } else if (arg === '--host' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        host = nextArg;
      }
    } else if (arg.startsWith('--port=')) {
      const portValue = parseInt(arg.slice(7), 10);
      if (!Number.isNaN(portValue)) {
        port = portValue;
      }
    } else if (arg.startsWith('--host=')) {
      host = arg.slice(7);
    }
  }

  return { port, host };
}

/**
 * Detect browser type from command or executable path
 */
function detectBrowserType(command: string, args: string[]): 'lightpanda' | 'chrome' | 'unknown' {
  const fullCommand = command.toLowerCase();
  if (fullCommand.includes('lightpanda')) {
    return 'lightpanda';
  }

  // Check args for lightpanda too (might be in path)
  const joinedArgs = args.join(' ').toLowerCase();
  if (joinedArgs.includes('lightpanda')) {
    return 'lightpanda';
  }

  // Check for chrome/chromium in command
  if (fullCommand.includes('chrome') || fullCommand.includes('chromium')) {
    return 'chrome';
  }

  return 'unknown';
}

/**
 * Get WebSocket endpoint based on browser type, host, and port
 */
function getWSEndpoint(browserType: 'lightpanda' | 'chrome' | 'unknown', host: string, port: number): string {
  if (browserType === 'lightpanda') {
    return `ws://${host}:${port}`;
  }

  // Default to Chrome DevTools Protocol format
  return `ws://${host}:${port}/devtools/browser`;
}

/**
 * Spawn a browser process using a command and wait for it to be ready
 */
async function spawnBrowserProcess(
  command: string,
  args: string[] = [],
  timeout = 30000,
): Promise<{ childProcess: ChildProcess; wsEndpoint: string }> {
  // Parse port and host from command arguments
  const { port, host } = parseCommandArgs(args);
  const browserType = detectBrowserType(command, args);
  const wsEndpoint = getWSEndpoint(browserType, host, port);

  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stdoutData = '';
    let stderrData = '';
    let timeoutId: NodeJS.Timeout;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      childProcess.stdout?.removeAllListeners();
      childProcess.stderr?.removeAllListeners();
    };

    // Set timeout for browser startup
    timeoutId = setTimeout(() => {
      cleanup();
      childProcess.kill('SIGKILL');
      reject(new Error(`Browser startup timeout after ${timeout}ms`));
    }, timeout);
    timeoutId.unref();

    // For LightPanda, we don't need to parse stdout for WS endpoint
    // because we already constructed it from command line args
    if (browserType === 'lightpanda') {
      // Give LightPanda a moment to start up
      setTimeout(() => {
        cleanup();
        resolve({
          childProcess,
          wsEndpoint,
        });
      }, 2000);
      return;
    }

    // For Chrome/Chromium, try to extract WebSocket endpoint from stdout
    // as it might print a different endpoint
    childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutData += data.toString();

      // Try to extract WebSocket endpoint from stdout
      const wsMatch = stdoutData.match(/ws:\/\/[^\s]+/);
      if (wsMatch) {
        cleanup();
        resolve({
          childProcess,
          wsEndpoint: wsMatch[0],
        });
      }
    });

    // Collect stderr for error reporting
    childProcess.stderr?.on('data', (data: Buffer) => {
      stderrData += data.toString();
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      cleanup();
      if (code !== 0 || signal) {
        reject(new Error(`Browser process exited with code ${code}, signal ${signal}\n` + `stderr: ${stderrData}`));
      }
    });

    // Handle process error
    childProcess.on('error', (error) => {
      cleanup();
      reject(new Error(`Failed to spawn browser process: ${error.message}`));
    });

    // If no WebSocket endpoint found in stdout after a short delay,
    // use the constructed endpoint based on command line args
    setTimeout(() => {
      if (!stdoutData.includes('ws://')) {
        cleanup();
        resolve({
          childProcess,
          wsEndpoint,
        });
      }
    }, 2000);
  });
}

/**
 * Common browser executable paths to try
 */
const COMMON_BROWSER_PATHS = [
  // System Chrome/Chromium
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/local/bin/chrome',
  // macOS paths
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Windows paths (if running in WSL or similar)
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files/Chromium/Application/chrome.exe',
];

/**
 * Find a browser executable by checking common paths
 */
async function findBrowserExecutable(): Promise<string | undefined> {
  for (const path of COMMON_BROWSER_PATHS) {
    try {
      const { access } = await import('node:fs/promises');
      await access(path);
      return path;
    } catch {
      // Path doesn't exist or isn't accessible, continue to next
    }
  }
  return undefined;
}

/**
 * Browser class that encapsulates all browser interactions
 */
export class Browser {
  private browser: PuppeteerBrowser | null = null;
  private childProcess: ChildProcess | null = null;
  private options: BrowserConfig;
  private isClosed = false;
  private _needsCleanup = false;

  private constructor(config: BrowserConfig) {
    this.options = config;
  }

  /**
   * Launch or connect to a browser based on options
   */
  static async launch(config: BrowserConfig = {}): Promise<Browser> {
    const instance = new Browser(config);
    await instance.initialize();
    return instance;
  }

  /**
   * Get the underlying puppeteer browser instance
   */
  getPuppeteerBrowser(): PuppeteerBrowser {
    if (this.isClosed) {
      throw new Error('Browser has been closed');
    }
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    return this.browser;
  }

  /**
   * Get the browser WebSocket endpoint if available
   */
  getWSEndpoint(): string | undefined {
    return this.options.browserWSEndpoint;
  }

  /**
   * Get the process ID if available
   */
  getPid(): number | undefined {
    return this.childProcess?.pid;
  }

  /**
   * Create a new page from the browser
   */
  async newPage() {
    const browser = this.getPuppeteerBrowser();
    return browser.newPage();
  }

  /**
   * Get browser version
   */
  async version(): Promise<string> {
    const browser = this.getPuppeteerBrowser();
    return browser.version();
  }

  /**
   * Get browser user agent
   */
  async userAgent(): Promise<string> {
    const browser = this.getPuppeteerBrowser();
    return browser.userAgent();
  }

  /**
   * Check if browser is still connected
   */
  isConnected(): boolean {
    return (!this.isClosed && this.browser?.isConnected()) || false;
  }

  /**
   * Universal cleanup method that handles different cleanup scenarios
   */
  async cleanup(): Promise<void> {
    if (!this._needsCleanup) {
      return;
    }

    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    try {
      // Close puppeteer browser connection
      if (this.browser?.isConnected()) {
        await this.browser.close();
      }
    } catch (error) {
      console.warn('Error closing puppeteer browser:', error);
    }

    // Clean up child process if we spawned it
    if (this.childProcess && !this.childProcess.killed) {
      try {
        // Try graceful shutdown first
        this.childProcess.kill('SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        if (this.childProcess.exitCode === null) {
          this.childProcess.kill('SIGKILL');
        }
      } catch (error) {
        console.warn('Error killing child process:', error);
      }
    }
  }

  private async initialize(): Promise<void> {
    const {
      executablePath,
      browserWSEndpoint,
      browserLaunchCommand,
      args = [],
      headless = true,
      timeout = 30000,
    } = this.options;

    // Try to connect to existing browser first
    if (browserWSEndpoint) {
      try {
        this.browser = await puppeteer.connect({
          browserWSEndpoint,
          defaultViewport: null,
        });
        console.log(`Connected to existing browser at ${browserWSEndpoint}`);
        this._needsCleanup = false;
        return;
      } catch (error) {
        throw new Error(
          `Failed to connect to browser at ${browserWSEndpoint}: ${error instanceof Error ? error.message : String(error)}\n` +
            'Make sure the browser is running with remote debugging enabled (--remote-debugging-port=9222)',
        );
      }
    }

    // If we have a custom launch command, use it to spawn the browser
    if (browserLaunchCommand) {
      console.log(`Launching browser with command: ${browserLaunchCommand}`);

      try {
        // Parse the command and arguments
        const parts = browserLaunchCommand.split(/\s+/);
        if (parts.length === 0) {
          throw new Error('Browser launch command is empty');
        }
        const command = parts[0] as string; // parts[0] exists since we checked length > 0
        const cmdArgs = parts.slice(1);
        const additionalArgs = args || [];

        // Spawn the browser process
        const { childProcess, wsEndpoint } = await spawnBrowserProcess(
          command,
          [...cmdArgs, ...additionalArgs] as string[],
          timeout,
        );

        this.childProcess = childProcess;
        console.log(`Browser process spawned with PID ${childProcess.pid}, connecting to ${wsEndpoint}`);

        // Connect to the spawned browser
        this.browser = await puppeteer.connect({
          browserWSEndpoint: wsEndpoint,
          defaultViewport: null,
        });

        this._needsCleanup = true;
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        throw new Error(
          `Failed to launch browser with command "${browserLaunchCommand}": ${errorMsg}\n` +
            'Make sure the command is correct and the browser supports remote debugging.',
        );
      }
    }

    // Determine executable path for direct launch
    let finalExecutablePath = executablePath;
    if (!finalExecutablePath) {
      finalExecutablePath = await findBrowserExecutable();
      if (!finalExecutablePath) {
        throw new Error(
          'No browser executable found. Please install a browser or specify one of:\n' +
            '1. Install Chrome/Chromium on your system\n' +
            '2. Use `browserWSEndpoint` to connect to an existing browser\n' +
            '3. Use `browserLaunchCommand` with a containerized browser\n' +
            '4. Use `executablePath` to specify browser location\n' +
            '\nCommon browsers:\n' +
            '- Chrome: https://www.google.com/chrome/\n' +
            '- Chromium: sudo apt-get install chromium-browser\n' +
            '- LightPanda (Docker): docker run -p 9222:9222 ghcr.io/lightpanda-io/lightpanda:latest\n',
        );
      }
    }

    // At this point, finalExecutablePath is guaranteed to be a string
    const executable = finalExecutablePath;

    // Launch browser directly with puppeteer
    try {
      this.browser = await puppeteer.launch({
        executablePath: executable,
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...args,
        ],
        timeout,
      });

      console.log(`Launched browser: ${executable}`);
      this._needsCleanup = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Provide helpful error messages for common issues
      if (errorMsg.includes('Failed to launch')) {
        throw new Error(
          `Failed to launch browser at ${executable}:\n` +
            `${errorMsg}\n\n` +
            'Possible solutions:\n' +
            '1. Install missing system libraries (Ubuntu/Debian):\n' +
            '   sudo apt-get update && sudo apt-get install -y libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2\n' +
            '2. Use a different browser path (executablePath option)\n' +
            '3. Connect to existing browser (browserWSEndpoint option)\n' +
            '4. Use Docker with pre-installed browser (see README)',
        );
      }

      throw error;
    }
  }
}

/**
 * Backward compatibility: export getBrowser as a function that returns Browser instance
 */
export async function getBrowser(config: BrowserConfig = {}): Promise<Browser> {
  return Browser.launch(config);
}
