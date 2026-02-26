# OpenCode Search Plugin

This plugin enhances OpenCode with advanced code search capabilities, including structural AST-based search using [ast-grep](https://ast-grep.github.io/) for sophisticated code analysis, linting, and rewriting.

## Features

- **Advanced code search**: Structural AST-based search capabilities
- **Pattern-based search**: Find code using simple AST patterns
- **Rule-based search**: Use YAML rules for complex structural queries
- **Syntax tree debugging**: Dump AST/CST to understand code structure
- **Rule testing**: Test YAML rules against code snippets
- **Web search**: Search the web using Google and DuckDuckGo engines

## Installation

Add this plugin to your OpenCode configuration:

```json
{
  "plugins": ["opencode-plugin-search"]
}
```

Ensure `ast-grep` is installed and available in your PATH (or via devbox) for AST-based search functionality.

### System Requirements

The Google search feature requires a Chrome/Chromium browser. The plugin supports multiple browser configurations:

#### Option 1: System Chrome/Chromium (Recommended if available)
- Install Chrome or Chromium on your system
- No additional configuration needed - plugin will auto-detect common paths
- On Ubuntu/Debian: `sudo apt-get install chromium-browser`

#### Option 2: Remote Browser via Debugging Protocol
- Run Chrome with remote debugging: `chrome --remote-debugging-port=9222`
- Use `browser_ws_endpoint: "http://localhost:9222"` in Google search options
- Works with Docker containers or remote browsers

#### Option 3: LightPanda (Headless Chrome in Docker)
- Lightweight Chrome with minimal dependencies
- Run: `docker run -p 9222:9222 ghcr.io/lightpanda-io/lightpanda:latest`
- Then use `browser_ws_endpoint: "http://localhost:9222"`

#### Option 4: Custom Browser Path
- Specify exact browser location: `executable_path: "/usr/bin/chromium"`

#### DuckDuckGo - No Browser Required
- DuckDuckGo search uses their public API and has no external dependencies
- Recommended if you don't need Google-specific results

#### Missing System Libraries
If you encounter library errors (e.g., `libglib2.0.so.0: cannot open shared object file`), install dependencies:

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

## Usage

The plugin provides advanced search tools powered by ast-grep:

### `ast_grep_find`

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

### `ast_grep_find_by_rule`

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

### `ast_grep_dump_syntax`

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

### `ast_grep_test_rule`

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

### `web_search`

Search the web using Google and/or DuckDuckGo search engines. If multiple engines are specified, queries run in parallel and results are combined.

**Arguments**:
- `query` (string): The search query
- `engines` (object): Configuration for search engines. At least one engine must be specified.
  - `duckduckgo` (object, optional): DuckDuckGo specific options
    - `safe_search` (boolean): Enable safe search filtering
    - `region` (string): Region code (e.g., "us-en", "uk-en")
    - `time_range` (string): Time range filter: "d" (day), "w" (week), "m" (month), "y" (year)
  - `google` (object, optional): Google specific options
    - `safe_search` (boolean): Enable safe search filtering
    - `country` (string): Country-specific Google domain (e.g., "co.uk", "com.au")
    - `headless` (boolean): Run browser in headless mode (default: true). Note: headless mode may trigger CAPTCHA challenges.
    - `use_saved_state` (boolean): Reuse browser session (experimental)
    - `executable_path` (string): Browser executable path (e.g., "/usr/bin/chromium"). Auto-detected if not specified.
    - `browser_ws_endpoint` (string): Remote debugging URL (e.g., "http://localhost:9222"). Connect to existing browser instance.
    - `browser_launch_command` (string): Command to launch browser (e.g., "lightpanda serve --port 9222").
    - `browser_args` (string[]): Additional arguments for browser launch.
- `limit` (number, optional): Maximum results per engine (default: 10, max: 50)
- `timeout` (number, optional): Timeout in milliseconds per engine (default: 30000, max: 120000)
- `locale` (string, optional): Locale for search results (e.g., "en-US", "fr-FR")

**Example**:
```json
{
  "query": "how to implement binary search in JavaScript",
  "engines": {
    "google": {
      "country": "com",
      "headless": true
    },
    "duckduckgo": {
      "safe_search": true
    }
  },
  "limit": 5,
  "timeout": 10000,
  "locale": "en-US"
}
```

**Note**: Google search requires Playwright with Chromium browser and system dependencies (see System Requirements above). DuckDuckGo uses their public API and has no additional dependencies.

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
