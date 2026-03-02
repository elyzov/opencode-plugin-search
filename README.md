# OpenCode Search Plugin

This plugin enhances OpenCode with advanced code search capabilities, including structural AST-based search using [ast-grep](https://ast-grep.github.io/) for sophisticated code analysis, linting, and rewriting.

## Features

- **Advanced code search**: Structural AST-based search capabilities
- **Pattern-based search**: Find code using simple AST patterns
- **Rule-based search**: Use YAML rules for complex structural queries
- **Syntax tree debugging**: Dump AST/CST to understand code structure
- **Rule testing**: Test YAML rules against code snippets
- **Web search**: Search the web using Google and DuckDuckGo engines
- **Webpage fetching**: Fetch webpages and convert to LLM-optimized markdown
- **Content extraction**: Extract and convert webpage content for LLM consumption

## Installation

Add this plugin to your OpenCode configuration:

```json
{
  "plugins": ["opencode-plugin-search"]
}
```

Ensure `ast-grep` is installed and available in your PATH (or via devbox) for AST-based search functionality.

## Legal Disclaimer

### General Disclaimer
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### ⚠️ Web Search Usage Restrictions

**Important**: This plugin's web search functionality:
- Uses browser automation to scrape Google and DuckDuckGo search results
- **Likely violates** both services' Terms of Service
- May result in IP blocking, CAPTCHAs, or legal action
- Should be used **only for personal, non-commercial purposes**
- Does **not** implement automatic rate limiting - users should implement their own if needed
- Users assume **all legal responsibility** for any consequences of use

**Consider using official APIs instead:**
- [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) (requires API key, may have costs)
- [DuckDuckGo Instant Answer API](https://duckduckgo.com/api)

**Note**: The DuckDuckGo implementation uses browser automation, not their public API. The author provides this plugin "as is" and accepts no responsibility for any issues arising from its use.

### System Requirements

#### Google Search (Browser Required)
The Google search feature requires a Chrome/Chromium browser. The plugin supports multiple browser configurations:

**Option 1: System Chrome/Chromium (Recommended if available)**
- Install Chrome or Chromium on your system
- No additional configuration needed - plugin will auto-detect common paths
- On Ubuntu/Debian: `sudo apt-get install chromium-browser`

**Option 2: Remote Browser via Debugging Protocol**
- Run Chrome with remote debugging: `chrome --remote-debugging-port=9222`
- Use `browserWSEndpoint: "http://localhost:9222"` in Google search options
- Works with Docker containers or remote browsers

**Option 3: LightPanda (Headless Chrome in Docker)**
- Lightweight Chrome with minimal dependencies
- Run: `docker run -p 9222:9222 ghcr.io/lightpanda-io/lightpanda:latest`
- Then use `browserWSEndpoint: "http://localhost:9222"`

**Option 4: Custom Browser Path**
- Specify exact browser location: `executablePath: "/usr/bin/chromium"`

#### DuckDuckGo Search - Browser Required
- DuckDuckGo search uses browser automation (not their public API) and requires Chrome/Chromium
- May have fewer CAPTCHA challenges than Google search

#### Webpage Fetching - No Browser Required
- The webpage fetching feature uses native Node.js `fetch` API
- No browser installation or configuration needed
- Works out of the box with HTTP/HTTPS requests

#### Missing System Libraries (for Google Search only)
If you encounter library errors (e.g., `libglib2.0.so.0: cannot open shared object file`) when using Google search, install dependencies:

```bash
# Ubuntu/Debian minimal set
sudo apt-get update && sudo apt-get install -y \
  libglib2.0-0 \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2
```

## Browser Configuration

Browser configuration for Google search can be provided through configuration files. This allows users to set up their browser once, and the LLM doesn't need to know about system-specific paths.

### Configuration Files

The plugin looks for configuration in the following locations (in order of priority):

1. **Project config**: `.opencode-search.json` in your project directory
2. **User config**: `~/.opencode/plugin-search.json` in your home directory

If no configuration is found, the plugin will attempt to auto-detect common browser paths.

### Configuration Format

**User/Project config file** (`plugin-search.json` or `.opencode-search.json`):
```json
{
  "browser": {
    "executablePath": "/usr/bin/chromium",
    "browserWSEndpoint": "http://localhost:9222",
    "args": ["--no-sandbox", "--disable-dev-shm-usage"],
    "headless": true,
    "timeout": 30000
  },
  "searchEngines": {
    "google": {
      "enabled": true,
      "weight": 0.6,
      "options": {
        "safe_search": true
      }
    },
    "duckduckgo": {
      "enabled": true,
      "weight": 0.4,
      "options": {
        "safe_search": true
      }
    }
  }
}
```

**Configuration options**:

**Browser options**:
- `executablePath` (string): Browser executable path (e.g., "/usr/bin/chromium", "google-chrome-stable")
- `browserWSEndpoint` (string): Remote debugging URL (e.g., "http://localhost:9222")
- `browserLaunchCommand` (string): Command to launch browser (e.g., "lightpanda serve --port 9222")
- `args` (array of strings): Additional arguments for browser launch
- `headless` (boolean): Run browser in headless mode (default: true)
- `timeout` (number): Timeout for browser operations in milliseconds (default: 30000)

**Search engine options** (under `searchEngines`):
- `google.enabled` (boolean): Whether Google search is enabled (default: true)
- `google.weight` (number): Weight for distributing results (default: 1). Weights are normalized across enabled engines, so absolute values don't matter.
- `google.options.safe_search` (boolean): Enable safe search filtering (default: false)
- `google.options.use_saved_state` (boolean): Reuse browser session (experimental, default: false)

- `duckduckgo.enabled` (boolean): Whether DuckDuckGo search is enabled (default: true)
- `duckduckgo.weight` (number): Weight for distributing results (default: 1). Weights are normalized across enabled engines, so absolute values don't matter.
- `duckduckgo.options.safe_search` (boolean): Enable safe search filtering (default: false)

**Minimal config** (auto-detect browser):
```json
{
  "browser": {}
}
```

**Using Docker/LightPanda**:
```json
{
  "browser": {
    "browserWSEndpoint": "http://localhost:9222"
  }
}
```

**Custom browser path**:
```json
{
  "browser": {
    "executablePath": "/usr/bin/chromium",
    "headless": true
  }
}
```

### Tool Arguments vs Configuration

#### Web Search (Google/DuckDuckGo)
- **Tool arguments** (provided by LLM): `query`, `limit`, `timeout`, `locale`, `fetch_content`, `max_content_length`
- **User configuration** (provided via config files): Search engine configuration (`searchEngines.google`, `searchEngines.duckduckgo`) with `enabled`, `weight`, and `options` (e.g., `safe_search`, `use_saved_state`). Browser configuration (`executablePath`, `browserWSEndpoint`, `browserLaunchCommand`, `args`, `headless`, `timeout`).

The LLM only needs to specify search parameters, not system-specific browser paths or engine selection. Search engine and browser configuration is handled through config files.

#### Webpage Fetching
- **Tool arguments** (provided by LLM): `urls`, `timeout`, `optimize_for_llm`, `max_content_length`, `include_summary`
- **User configuration**: None required - uses native Node.js `fetch`

Webpage fetching requires no browser configuration and works out of the box.

## Usage

The plugin provides the following tools:

### Code Search Tools (powered by ast-grep)
Advanced code search capabilities for structural analysis and pattern matching.

### `codebase_find`

Search code in the project using AST patterns for structural matching.

**Arguments**:
- `pattern` (string): The ast-grep pattern (e.g., `"console.log($ARG)"`)
- `language` (string, optional): Programming language (default: auto-detect)
- `max_results` (number, optional): Maximum matches to return
- `output_format` (string, optional): `"text"` (human-readable) or `"json"`

**Example**:
```json
{
  "pattern": "function $NAME($$$)",
  "language": "javascript",
  "max_results": 5
}
```

### `codebase_find_by_rule`

Search code using structured AST rules for advanced structural queries.

**Arguments**:
- `rule` (object): The ast-grep rule definition as a structured object with required `id`, `language`, and `rule` fields
- `max_results` (number, optional): Maximum matches to return
- `output_format` (string, optional): `"text"` or `"json"`

**Example**:
```json
{
  "rule": {
    "id": "find-async-functions",
    "language": "javascript",
    "rule": {
      "kind": "function_declaration",
      "has": {
        "pattern": "await $EXPR",
        "stopBy": "end"
      }
    }
  },
  "max_results": 10
}
```

### `codebase_dump_syntax`

Analyze code structure by dumping syntax trees for debugging and understanding.

**Arguments**:
- `code` (string): The code to analyze
- `language` (string): Programming language
- `format` (string, optional): `"cst"` (concrete syntax tree), `"ast"` (abstract syntax tree), or `"pattern"` (pattern interpretation)

**Example**:
```json
{
  "code": "async function example() { await fetch(); }",
  "language": "javascript",
  "format": "cst"
}
```

### `codebase_test_rule`

Test and validate structured AST rules against code snippets to ensure correct matching.

**Arguments**:
- `code` (string): The code to test
- `rule` (object): The ast-grep rule definition as a structured object with required `id`, `language`, and `rule` fields

**Example**:
```json
{
  "code": "async function test() { await fetch(); }",
  "rule": {
    "id": "test",
    "language": "javascript",
    "rule": {
      "kind": "function_declaration",
      "has": {
        "pattern": "await $EXPR",
        "stopBy": "end"
      }
    }
  }
}
```

### Web Search & Fetching Tools
Tools for searching the web and fetching webpage content.

### `research_web`

Search the web for technical information, documentation, and best practices using configured search engines (Google and/or DuckDuckGo). Search engines are configured via plugin configuration file. This simplifies LLM usage while allowing users to configure engines once. Results are combined based on configured engine weights and optionally fetched with content extraction.

**Arguments**:
- `query` (string): The search query
- `limit` (number, optional): Maximum total results across all engines (default: 10, max: 50). Results are distributed among enabled engines based on configured weights.
- `timeout` (number, optional): Timeout in milliseconds for the entire search operation (default: 30000, max: 120000)
- `locale` (string, optional): Locale for search results (e.g., "en-US", "fr-FR")
- `fetch_content` (boolean, optional): Fetch and convert webpage content to markdown (default: false)
- `max_content_length` (number, optional): Maximum content length in characters when fetching content (default: 10000, max: 50000)

**Example - Basic search**:
```json
{
  "query": "how to implement binary search in JavaScript",
  "limit": 5,
  "timeout": 10000,
  "locale": "en-US"
}
```

**Example - Search with content fetching**:
```json
{
  "query": "latest React documentation",
  "fetch_content": true,
  "max_content_length": 5000,
  "limit": 3
}
```

**Notes**:
- Google search requires a Chrome/Chromium browser (see System Requirements above). Browser configuration is handled via configuration files - see Configuration section.
- DuckDuckGo search also uses browser automation and requires Chrome/Chromium.
- Content fetching uses native Node.js `fetch` and requires no browser.
- When `fetch_content: true`, duplicate URLs from different search engines are automatically deduplicated before fetching to avoid redundant requests.
- Fetching content can significantly increase response time depending on website performance and size. Consider setting `timeout` appropriately.

### `fetch_webpages`

Fetch webpages and convert them to LLM-optimized markdown. Useful for reading detailed documentation, articles, blog posts, or technical content during development research. Uses the [mdream](https://github.com/harlan-zw/mdream) library for efficient HTML-to-markdown conversion optimized for LLM token usage.

**Arguments**:
- `urls` (array of strings): URLs to fetch (1-10 URLs)
- `timeout` (number, optional): Timeout in milliseconds per request (default: 30000, max: 120000)
- `optimize_for_llm` (boolean, optional): Use LLM-optimized markdown conversion (default: true)
- `max_content_length` (number, optional): Maximum content length in characters (default: 10000, max: 50000)
- `include_summary` (boolean, optional): Include a summary of fetch results (default: true)

**Example**:
```json
{
  "urls": [
    "https://example.com/docs/getting-started",
    "https://example.com/api-reference",
    "https://example.com/tutorial"
  ],
  "timeout": 15000,
  "optimize_for_llm": true,
  "max_content_length": 8000,
  "include_summary": true
}
```

**Output includes**:
- Success/failure status for each URL
- Page title and content length
- Fetch time and compression ratio
- HTTP status code
- Markdown content preview
- Optional summary of all results

**Features**:
- **Parallel fetching**: All URLs fetched concurrently for maximum speed
- **LLM optimization**: Uses mdream's minimal preset for token-efficient markdown
- **Error handling**: Gracefully handles invalid URLs, timeouts, and HTTP errors
- **Content truncation**: Automatically truncates content to specified limits
- **Metadata tracking**: Provides detailed metrics about fetch performance

## Rule Structure

The rule object follows the ast-grep rule configuration interface:

```typescript
interface RuleObject {
  pattern?: string | Pattern
  kind?: string
  regex?: string
  inside?: RuleObject & Relation
  has?: RuleObject & Relation
  follows?: RuleObject & Relation
  precedes?: RuleObject & Relation
  all?: RuleObject[]
  any?: RuleObject[]
  not?: RuleObject
  matches?: string
}
```

See [ast-grep rule documentation](https://ast-grep.github.io/guide/rule-config.html) for detailed examples.

## Configuration

The plugin automatically looks for `sgconfig.yaml` in the project root to support custom languages and rule directories for ast-grep search functionality. See [ast-grep documentation](https://ast-grep.github.io/advanced/custom-language.html) for configuration details.

## Future Plans

See [ROADMAP.md](ROADMAP.md) for detailed plans about upcoming features including:

- **Pre-configured rule library** - Ready-to-use templates for common patterns
- **Batch query optimization** - Multiple patterns in single calls
- **Context-aware search** - Richer results with surrounding code context
- **Semantic search enhancement** - Component usage tracking and dependency analysis
- **Performance optimizations** - Parallel execution and smart caching

## Development

```bash
# Install dependencies
bun install

# Build plugin
bun run build

# Type checking
bun run typecheck

# Run tests
bun run test
```

## License

MIT
