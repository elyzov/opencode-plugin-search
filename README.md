# OpenCode Search Plugin

This plugin enhances OpenCode with advanced code search capabilities, including structural AST-based search using [ast-grep](https://ast-grep.github.io/) for sophisticated code analysis, linting, and rewriting.

## Features

- **Advanced code search**: Structural AST-based search capabilities
- **Pattern-based search**: Find code using simple AST patterns
- **Rule-based search**: Use YAML rules for complex structural queries
- **Syntax tree debugging**: Dump AST/CST to understand code structure
- **Rule testing**: Test YAML rules against code snippets

## Installation

Add this plugin to your OpenCode configuration:

```json
{
  "plugins": ["opencode-plugin-search"]
}
```

Ensure `ast-grep` is installed and available in your PATH (or via devbox) for AST-based search functionality.

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
