## Design Document: Browser Resource Pooling

### 1. Overview & Goals

#### Primary Goals
- **Eliminate per-request browser startup**: Replace current "launch browser → search → close browser" cycle with persistent browser instances
- **Session-aware page reuse**: Maintain browser pages per (session, engine) pair across multiple search requests
- **Global resource sharing**: Allow browser instances to be shared across multiple OpenCode sessions/processes
- **Automatic cleanup**: Gracefully handle stale sessions, idle browsers, and process termination
- **Transparent API**: Maintain backward compatibility with existing `browser.ts` interface

#### Non-Goals
- **Cross-platform browser process management**: We'll handle browser crashes but won't implement a full browser daemon
- **Complex session migration**: Sessions are tied to the OpenCode session lifecycle
- **Real-time browser health monitoring**: Periodic checks rather than continuous monitoring

### 2. Architecture

#### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Plugin System                    │
└─────────────────┬───────────────────┬───────────────────────┘
                  │                   │
        ┌─────────▼─────────┐ ┌──────▼──────┐
        │   SearchWebTool   │ │ SessionHook │
        │   (tools.ts)      │ │(plugin.ts)  │
        └─────────┬─────────┘ └──────┬──────┘
                  │                   │
        ┌─────────▼───────────────────▼─────────┐
        │         BrowserManager (NEW)          │
        │  - Browser pooling by config          │
        │  - Session-page mapping               │
        │  - Cleanup scheduling                 │
        └─────────┬───────────────────┬─────────┘
                  │                   │
        ┌─────────▼─────────┐ ┌──────▼──────┐
        │    BrowserPool    │ │  Database   │
        │  (In-memory cache)│ │ (SQLite)    │
        └─────────┬─────────┘ └──────┬──────┘
                  │                   │
        ┌─────────▼───────────────────▼─────────┐
        │       Enhanced Browser (browser.ts)   │
        │  - Session-aware page management      │
        │  - Connection state tracking          │
        └───────────────────────────────────────┘
```

#### 2.2 Data Flow

1. **Plugin Initialization** → BrowserManager connects to SQLite DB, loads existing browser states
2. **Tool Execution** (`research_web`) → BrowserManager.getBrowser() with config + session context
3. **Session Events** (`session.deleted`) → BrowserManager.cleanupSession() removes all session pages
4. **Periodic Cleanup** → BrowserManager.cleanupIdleResources() runs on plugin init + timer

### 3. Database Schema

```sql
-- Store at: ~/.config/opencode/search/search.db3
CREATE TABLE browsers (
  id INTEGER PRIMARY KEY,
  
  -- Browser process info
  pid INTEGER,                    -- NULL for WS endpoint connections
  ws_endpoint TEXT,               -- WebSocket endpoint for Puppeteer.connect()
  
  -- Config tracking (NEW)
  config_file_path TEXT,          -- Absolute path to config file (NULL for defaults)
  config_file_mtime INTEGER,      -- Last modified timestamp of config file
  config_hash TEXT NOT NULL,      -- SHA256 hash of normalized browser config
  config_json TEXT NOT NULL,      -- Full browser config as JSON for reconstruction
  
  -- Lifecycle tracking
  launch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_connected BOOLEAN DEFAULT 1,
  
  CHECK(config_hash IS NOT NULL AND config_hash != '')
);

CREATE TABLE browser_pages (
  id INTEGER PRIMARY KEY,
  browser_id INTEGER REFERENCES browsers(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  engine TEXT NOT NULL,           -- 'google' or 'duckduckgo'
  target_id TEXT,                 -- Puppeteer target ID for page reattachment
  created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1,
  UNIQUE(session_id, engine)
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  agent TEXT,
  directory TEXT
);

-- Indexes for performance
CREATE INDEX idx_browsers_config_file ON browsers(config_file_path);
CREATE INDEX idx_browsers_config_hash ON browsers(config_hash);
CREATE INDEX idx_browsers_connected ON browsers(is_connected);
CREATE INDEX idx_pages_session_engine ON browser_pages(session_id, engine);
CREATE INDEX idx_pages_last_used ON browser_pages(last_used_time);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);
```

#### 3.1 Config Tracking & Change Detection

**Simplified Config Loading**: Load only a single config file (project `.opencode-search.json` takes precedence over user `~/.opencode/plugin-search.json`).

**Config Normalization & Hashing**:
```javascript
function normalizeBrowserConfig(config: BrowserConfig): NormalizedConfig {
  // Remove browserLaunchCommand (deprecated)
  return {
    executablePath: config.executablePath || 'auto-detect',
    browserWSEndpoint: config.browserWSEndpoint, // Different endpoint = different browser
    args: (config.args || []).sort(),           // Sort for consistency
    headless: config.headless ?? true,
    timeout: config.timeout,
  };
}

function getConfigHash(config: BrowserConfig): string {
  const normalized = normalizeBrowserConfig(config);
  return sha256(JSON.stringify(normalized, null, 0)); // SHA256 hash for config tracking
}
```

**Change Detection Triggers**:
1. **Config file modified**: Compare `config_file_mtime` with current file mtime
2. **Config values changed**: Compare `config_hash` with current config hash
3. **Browser disconnected**: Detect via `browser.isConnected()`, remove from DB

**Special Cases**:
- **`browserWSEndpoint` changes**: Different endpoint = different browser (handled by config hash)
- **Default config (no file)**: Only hash comparison, no file tracking
- **Config file deleted**: Treat as default config, close associated browsers

### **4. API Design**

#### **4.1 BrowserManager (NEW - `src/websearch/browser-manager.ts`)**
```typescript
interface BrowserManager {
  // Core lifecycle
  getBrowser(
    config: BrowserConfig,
    context: ToolContext
  ): Promise<EnhancedBrowser>;

  getPage(
    browser: EnhancedBrowser,
    sessionId: string,
    engine: 'google' | 'duckduckgo'
  ): Promise<Page>;

  // Session management
  registerSession(sessionId: string, metadata?: Record<string, unknown>): Promise<void>;
  cleanupSession(sessionId: string): Promise<void>;

  // Resource management
  cleanupIdleBrowsers(timeoutMs: number): Promise<number>;
  cleanupStalePages(timeoutMs: number): Promise<number>;

  // Health checking
  checkBrowserHealth(browserId: number): Promise<boolean>;
  reconnectBrowser(browserId: number): Promise<boolean>;

  // Statistics
  getStats(): BrowserManagerStats;
}

// Singleton pattern - one instance per plugin process
export const browserManager = new BrowserManager();
```

#### **4.2 EnhancedBrowser (extends existing `Browser` class)**
```typescript
class EnhancedBrowser extends Browser {
  // Add session-aware page management
  private sessionPages = new Map<string, Map<string, Page>>();

  // New methods
  getPageForSession(
    sessionId: string,
    engine: string
  ): Promise<Page | null>;

  releasePageForSession(
    sessionId: string,
    engine: string
  ): Promise<void>;

  // Override cleanup to return to pool instead of closing
  async cleanup(): Promise<void> {
    if (this._needsCleanup && !this.isClosed) {
      // Return to pool if managed by BrowserManager
      await browserManager.releaseBrowser(this);
    } else {
      await super.cleanup();
    }
  }
}
```

#### **4.3 Backward Compatibility Layer**
```typescript
// Updated getBrowser() function
export async function getBrowser(
  config: BrowserConfig = {}
): Promise<Browser> {
  // If pooling disabled or no session context, use old behavior
  if (!config.pooling?.enabled || !globalThis.currentToolContext) {
    return Browser.launch(config);
  }

  // Use BrowserManager with session context
  return browserManager.getBrowser(config, globalThis.currentToolContext);
}
```

### **5. Event Handling**

#### **5.1 Plugin Event Registration**
```typescript
// In plugin.ts
export const SearchPlugin: Plugin = async ({ directory }) => {
  const config = await loadConfig(directory);

  // Initialize BrowserManager
  await browserManager.initialize(config);

  return {
    tool: {
      // Existing tools...
      research_web: createResearchWebTool(directory, config),
      fetch_webpages: createFetchWebpagesTool(directory, config),
    },

    // NEW: Session event handlers
    'session.created': async ({ session }) => {
      await browserManager.registerSession(session.id, {
        agent: session.agent,
        directory: session.directory,
      });
    },

    'session.deleted': async ({ session }) => {
      await browserManager.cleanupSession(session.id);
    },

    'session.idle': async ({ session }) => {
      // Optional: preemptively clean up pages for idle sessions
      if (config.browser?.cleanup?.sessionIdleTimeout) {
        await browserManager.cleanupSession(session.id);
      }
    },
  };
};
```

#### **5.2 Tool Context Passing**
```typescript
// Updated tools.ts - pass context to browser calls
async execute(args, context: ToolContext) {
  // Store context globally for BrowserManager access
  globalThis.currentToolContext = context;

  try {
    const browserInstance = await getBrowser(config?.browser);
    // ... rest of search logic
  } finally {
    delete globalThis.currentToolContext;
  }
}
```

### **6. Configuration**

#### **6.1 Extended Configuration Schema**
```typescript
interface PluginConfig {
  browser?: BrowserConfig & {
    // Pooling configuration
    pooling?: {
      enabled: boolean;           // Default: true
      maxBrowsers: number;        // Max simultaneous browsers (default: 5)
      browserIdleTimeout: number; // Close browser after idle (ms, default: 12 hours = 43200000)
    };

    // Cleanup configuration
    cleanup?: {
      interval: number;           // Cleanup interval (ms, default: 5 minutes = 300000)
      sessionTimeout: number;     // Session idle timeout (ms, default: 6 hours = 21600000)
      // pageTimeout removed - pages are tied to session lifecycle
    };
  };

  // Existing searchEngines config remains unchanged
  searchEngines?: {
    google?: SearchEngineConfig;
    duckduckgo?: SearchEngineConfig;
  };
}
```

#### **6.2 Configuration File Example**
```json
{
  "browser": {
    "executablePath": "/usr/bin/chromium",
    "headless": true,
    "pooling": {
      "enabled": true,
      "maxBrowsers": 5,
      "browserIdleTimeout": 43200000
    },
    "cleanup": {
      "interval": 300000,
      "sessionTimeout": 21600000
    }
  }
}
```

### **7. Error Handling & Logging**

#### **7.1 Pino Logger Setup**
```typescript
// src/websearch/logger.ts
import pino from 'pino';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

const logDir = join(homedir(), '.config', 'opencode', 'search', 'logs');
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

export const logger = pino({
  level: process.env.OPENCODE_SEARCH_LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: {
          destination: join(logDir, 'search.log'),
          mkdir: true
        }
      },
      {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    ]
  }
});
```

**Log Rotation**: Logs are automatically rotated and retained for 7 days using `pino-roller` or similar mechanism.

#### **7.2 Error Recovery Strategies**
1. **Browser crash/disconnect**: Detect via `browser.isConnected()`, remove from DB, create new browser
2. **Page crash**: Detect via `page.isClosed()`, create new page, update DB
3. **SQLite corruption**: Backup DB file, recreate schema, log warning
4. **Process conflict**: Use SQLite file locking, retry with exponential backoff
5. **CAPTCHA detection**: Close affected page, create new page with different fingerprint

#### **7.3 Fallback Behavior**
```typescript
// Degrade gracefully when pooling fails
async function getBrowserWithFallback(config: BrowserConfig, context: ToolContext) {
  try {
    return await browserManager.getBrowser(config, context);
  } catch (error) {
    logger.warn({ error }, 'BrowserManager failed, falling back to per-request browser');
    return Browser.launch(config);
  }
}
```

### **8. Resource Cleanup Strategy**

#### **8.1 Cleanup Triggers**
1. **Plugin initialization**: Run full cleanup of stale resources
2. **Periodic timer**: Based on `cleanup.interval` config
3. **Session events**: `session.deleted`, `session.idle`
4. **Memory pressure**: Monitor RSS, trigger cleanup if > threshold

#### **8.2 Cleanup Algorithm**
```typescript
async function cleanupIdleResources() {
  // 1. Clean up sessions not active for > sessionTimeout (6 hours default)
  // This automatically cleans up all pages belonging to those sessions
  const staleSessions = await db.getStaleSessions(config.cleanup.sessionTimeout);
  for (const session of staleSessions) {
    await browserManager.cleanupSession(session.id);
  }

  // 2. Clean up orphaned pages (pages whose session no longer exists)
  const orphanedPages = await db.getOrphanedPages();
  for (const page of orphanedPages) {
    await browserManager.closePage(page.id);
  }

  // 3. Close browsers with no active pages AND idle > browserIdleTimeout (12 hours default)
  const idleBrowsers = await db.getIdleBrowsers(config.pooling.browserIdleTimeout);
  for (const browser of idleBrowsers) {
    await browserManager.closeBrowser(browser.id);
  }
}
```

#### **8.3 Process Termination Handling**
- **Browser process owner dies**: Other processes detect via `pid` check, clean up DB entry
- **Plugin process dies**: Next plugin initialization cleans up orphaned resources
- **System shutdown**: Rely on process termination signals, browsers auto-close

### **9. Implementation Plan**

#### **Phase 1: Foundation (Week 1)**
1. **Add dependencies**: `sqlite3`, `pino`, `pino-roller`, `uuid`
2. **Create database module**: `src/websearch/database.ts` with schema migrations
3. **Implement config normalization**: Utility for deterministic config keys
4. **Create logger**: Integrated Pino logger with file output

#### **Phase 2: Core BrowserManager (Week 2)**
1. **Implement BrowserManager class**: Core pooling logic
2. **Create EnhancedBrowser**: Session-aware page management
3. **Database integration**: CRUD operations for browsers/pages/sessions
4. **Basic cleanup**: Simple timeout-based resource cleanup

#### **Phase 3: Integration & Events (Week 3)**
1. **Update plugin.ts**: Add session event handlers
2. **Modify tools.ts**: Pass ToolContext to browser calls
3. **Backward compatibility**: Update `getBrowser()` function
4. **Configuration**: Extend config schema with pooling options

#### **Phase 4: Robustness & Testing (Week 4)**
1. **Error handling**: Comprehensive recovery strategies
2. **Logging**: Structured logging throughout
3. **Performance testing**: Benchmarks for pooling vs per-request
4. **Integration tests**: Multi-process, concurrent access scenarios

### **10. Testing Strategy**

#### **10.1 Unit Tests**
- **BrowserManager**: Config normalization, pooling logic, cleanup algorithms
- **Database module**: SQLite operations, concurrent access handling
- **EnhancedBrowser**: Page management, session affinity

#### **10.2 Integration Tests**
- **Multi-process scenario**: Multiple OpenCode sessions sharing browsers
- **Crash recovery**: Simulate browser crashes, verify recovery
- **Configuration changes**: Verify browser recreation when config changes
- **Memory limits**: Test maxBrowsers and maxPagesPerSession enforcement

#### **10.3 Performance Benchmarks**
```typescript
// Measure before/after improvements
const metrics = {
  perRequest: {
    browserStartup: '2-5s',
    pageCreation: '200-500ms',
    totalOverhead: '3-6s per search'
  },
  pooled: {
    browserStartup: '2-5s (first time only)',
    pageCreation: '200-500ms (first time per session)',
    subsequentSearches: '100-300ms'
  }
};
```

### **11. Rollout & Backward Compatibility**

#### **11.1 Feature Flags**
- **Pooling disabled by default**: Initially opt-in via config
- **Gradual rollout**: Enable by default after stability proven
- **Config migration**: Automatic migration of existing configs

#### **11.2 Backward Compatibility**
1. **API unchanged**: Existing `getBrowser()` and `Browser` class interface preserved (except `browserLaunchCommand` removed)
2. **Fallback mode**: If pooling fails, automatically revert to per-request behavior
3. **Configuration**: 
   - Pooling defaults to disabled for existing configs
   - Config merging dropped (single config file loaded)
   - `browserLaunchCommand` ignored if present in old configs

#### **11.3 Monitoring & Rollback**
- **Logging**: Detailed logs for debugging pooling issues
- **Metrics**: Track browser reuse rate, error rates, performance improvements
- **Rollback procedure**: Disable pooling via config if issues arise

### **12. Decisions Made & Remaining Questions**

#### **Decisions Made**:
1. **Config merging**: Dropped completely - load only single config file (project `.opencode-search.json` takes precedence)
2. **browserLaunchCommand**: Removed entirely from BrowserConfig interface
3. **Browser idle timeout**: 12 hours (43200000 ms) default
4. **Session timeout**: 6 hours (21600000 ms) default - pages tied to session lifecycle
5. **Memory limits**: `maxBrowsers: 5` default, `maxPagesPerSession` removed (single page per search engine per session)
6. **Log retention**: 7 days with rotation

#### **Remaining Questions**:
1. **Browser process ownership**: Should we implement a watchdog process for browser health, or rely on periodic checks?
2. **Configuration change handling**: How aggressive should browser recreation be when config files change?
3. **Error recovery thresholds**: How many consecutive failures before disabling pooling for a config?

### **13. Success Metrics**

1. **Performance**: 10x reduction in search latency for repeated requests
2. **Resource usage**: 90% reduction in browser process creation
3. **Reliability**: 99.9% successful search completion with pooling enabled
4. **Memory**: Stable memory usage across multiple concurrent sessions

---

**Next Steps**:
1. Review and approve this design document
2. Decide on open questions (timeouts, limits, ownership model)
3. Begin Phase 1 implementation (database + logger foundation)
