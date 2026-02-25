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

Search code using complex YAML rules for advanced structural queries.

**Arguments**:
- `yaml` (string): The ast-grep YAML rule definition
- `max_results` (number, optional): Maximum matches to return
- `output_format` (string, optional): `"text"` or `"json"`

**Example**:
```yaml
id: find-async-functions
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end
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

Test and validate YAML rules against code snippets to ensure correct matching.

**Arguments**:
- `code` (string): The code to test
- `yaml` (string): The ast-grep YAML rule

**Example**:
```json
{
  "code": "async function test() { await fetch(); }",
  "yaml": "id: test\nlanguage: javascript\nrule:\n  kind: function_declaration\n  has:\n    pattern: await $EXPR\n    stopBy: end"
}
```

## Configuration

The plugin automatically looks for `sgconfig.yaml` in the project root to support custom languages and rule directories for ast-grep search functionality. See [ast-grep documentation](https://ast-grep.github.io/advanced/custom-language.html) for configuration details.

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
