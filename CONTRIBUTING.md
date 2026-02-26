# Contributing to OpenCode Search Plugin

Thank you for your interest in contributing to the OpenCode Search Plugin! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**: `bun install`
3. **Build the plugin**: `bun run build`
4. **Run tests**: `bun test`

## Code Style

We use [Biome](https://biomejs.dev/) for code formatting and linting:

```bash
# Check code style
npm run typecheck  # Runs biome check && tsc --noEmit

# Auto-fix formatting and lint issues
npm run auto      # Runs biome check --fix && tsc --noEmit
```

Key style guidelines:
- Use TypeScript with strict mode
- Follow existing patterns in the codebase
- Write tests for new features
- Keep functions focused and modular

## Testing

We use [Bun test](https://bun.sh/docs/test) for testing:

- **Unit tests**: Test individual functions in isolation
- **Integration tests**: Test plugin tools with actual ast-grep
- **Fixtures**: Use test files in `test/fixtures/` for integration tests

Run tests with:
```bash
bun test                    # Run all tests
bun test src/plugin.test.ts # Run specific test file
```

## Adding New Features

### 1. Check the Roadmap
Review [ROADMAP.md](ROADMAP.md) to see if your feature is already planned and its priority.

### 2. Discuss First
For significant changes, please open an issue first to discuss:
- The problem you're solving
- Your proposed solution
- Any alternatives considered

### 3. Implementation Steps
1. **Create a branch**: `git checkout -b feature/your-feature-name`
2. **Write tests first** (TDD approach recommended)
3. **Implement the feature**
4. **Update documentation** (README, inline docs)
5. **Run tests and linting**
6. **Submit a pull request**

## Pull Request Guidelines

1. **Descriptive title**: Clearly state what the PR does
2. **Detailed description**: Explain the changes and why they're needed
3. **Reference issues**: Link to related issues (e.g., "Fixes #123")
4. **Keep changes focused**: One feature/bug fix per PR
5. **Update documentation**: Include updates to README, comments, or type definitions

## Adding Rule Presets

To contribute to the rule library (see ROADMAP.md Phase 1.1):

1. **Identify a common pattern** that would benefit from a preset
2. **Create the rule schema** following ast-grep documentation
3. **Add tests** showing the preset in action
4. **Document the preset** with examples

Example rule preset structure:
```typescript
{
  id: 'descriptive-name',
  language: 'javascript',
  rule: {
    // Rule definition
  },
  description: 'What this rule finds and why it's useful',
  examples: [
    'code example that matches',
    'code example that does NOT match'
  ]
}
```

## Reporting Bugs

When reporting bugs, please include:

1. **Clear description** of the issue
2. **Steps to reproduce**
3. **Expected vs actual behavior**
4. **Environment details**: OS, Node/Bun version, ast-grep version
5. **Error messages or logs**

## Code of Conduct

We expect all contributors to:
- Be respectful and inclusive
- Focus on constructive feedback
- Assume good intentions
- Help create a welcoming environment

## Questions?

Feel free to:
- Open an issue for questions
- Check existing issues and PRs
- Review the [ast-grep documentation](https://ast-grep.github.io/)

Thank you for contributing! 🚀