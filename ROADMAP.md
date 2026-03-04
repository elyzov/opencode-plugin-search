# OpenCode Search Plugin Roadmap

This document outlines the planned improvements and future features for the OpenCode Search Plugin based on user feedback and usage patterns.

## Current Status

The plugin provides core AST-based search capabilities using [ast-grep](https://ast-grep.github.io/):

- **✅ ast_grep_find**: Simple pattern-based AST search
- **✅ ast_grep_find_by_rule**: Advanced structural queries with structured rule schemas
- **✅ ast_grep_dump_syntax**: AST/CST visualization for debugging
- **✅ ast_grep_test_rule**: Rule validation against code snippets
- **✅ Structured rule validation**: Zod-based schema validation to prevent parse errors
- **✅ Web search**: Search the web using Google and DuckDuckGo engines

## Phase 1: Immediate Improvements (High Impact)

### 1.1 Pre-configured Rule Library
**Goal**: Provide ready-to-use rule templates for common patterns to reduce boilerplate.

**Implementation**:
```typescript
// Built-in rule presets
const RULE_PRESETS = {
  'react-function-component': {
    id: 'react-fc',
    language: 'javascript',
    rule: { kind: 'function_declaration', pattern: 'function $NAME($PROPS) {$$BODY}' }
  },
  'react-hook': {
    id: 'react-hook',
    language: 'javascript', 
    rule: { kind: 'function_declaration', pattern: 'use$HOOK' }
  },
  'api-endpoint': {
    id: 'api-endpoint',
    language: 'typescript',
    rule: { pattern: 'export async function $METHOD', kind: 'function_declaration' }
  },
  'class-definition': {
    id: 'class-def',
    language: 'javascript',
    rule: { kind: 'class_declaration' }
  },
  'console-log': {
    id: 'console-log',
    language: 'javascript',
    rule: { pattern: 'console.log($ARG)' }
  }
};

// New tool: ast_grep_find_by_preset
ast_grep_find_by_preset({
  preset: 'react-function-component',
  max_results: 10
})
```

**Benefits**:
- 80% reduction in rule boilerplate for common patterns
- Consistent naming across projects
- Easy discovery of useful patterns

### 1.2 Batch Query Optimization
**Goal**: Allow multiple patterns/rules in a single call for efficiency.

**Implementation**:
```typescript
// New tool: ast_grep_find_batch
ast_grep_find_batch({
  queries: [
    { pattern: 'function $NAME', language: 'javascript' },
    { pattern: 'class $NAME', language: 'javascript' },
    { pattern: 'interface $NAME', language: 'typescript' }
  ],
  output_format: 'grouped' // 'grouped' | 'flat' | 'by_query'
})

// Batch rule testing
ast_grep_test_rules_batch({
  code: "function test() {}\nclass Test {}",
  rules: [rule1, rule2, rule3]
})
```

**Benefits**:
- Reduce LLM token usage by 60% for complex searches
- Parallel execution for performance
- Unified result formatting

### 1.3 Context-Aware Search Results
**Goal**: Provide richer context around search matches.

**Implementation**:
```typescript
// Enhanced result format
{
  matches: [{
    file: 'src/Component.js',
    range: { start: { line: 10, column: 0 }, end: { line: 15, column: 0 } },
    text: 'function Component() {...}',
    context: {
      before: ['// Header comment', 'import React'],
      after: ['export default Component', ''],
      file_type: 'component',
      imports: ['React', 'useState'],
      exports: ['Component']
    }
  }]
}

// New option for existing tools
ast_grep_find({
  pattern: 'function $NAME',
  include_context: true,
  context_lines: 3
})
```

**Benefits**:
- Better understanding of match significance
- Reduced need for follow-up file reads
- Improved LLM analysis capabilities

## Phase 2: Enhanced Capabilities (Medium Impact)

### 2.1 Semantic Search Enhancement
**Goal**: Move beyond syntactic matching to semantic understanding.

**Implementation**:
```typescript
// Component usage tracking
ast_grep_find_component_usage({
  component_name: 'Button',
  language: 'javascript'
})

// Prop type inference
ast_grep_analyze_props({
  component: 'Button',
  file: 'src/components/Button.js'
})

// Hook dependency analysis  
ast_grep_analyze_hooks({
  file: 'src/hooks/useData.js',
  analyze_deps: true
})
```

**Features**:
- Cross-file component reference tracking
- Prop type extraction from TypeScript/PropTypes
- Hook dependency graph generation
- Import/export relationship mapping

### 2.2 Integration with Existing Tools
**Goal**: Combine AST search with traditional text search for hybrid workflows.

**Implementation**:
```typescript
// Hybrid grep + ast-grep search
ast_grep_hybrid_search({
  text_pattern: 'TODO|FIXME',
  ast_pattern: 'function $NAME',
  combine: 'union' // 'union' | 'intersection' | 'sequence'
})

// File type aware search
ast_grep_find_by_filetype({
  pattern: 'function $NAME',
  file_types: ['.js', '.jsx', '.ts', '.tsx'],
  exclude_types: ['.test.js', '.spec.js']
})

// Cached pattern search
ast_grep_cached_search({
  pattern: 'console.log($ARG)',
  cache_key: 'console-logs',
  ttl: 300 // seconds
})
```

**Benefits**:
- Best of both worlds: text + structural search
- File system aware filtering
- Performance improvements via caching

## Phase 3: Advanced Features (Lower Priority)

### 3.1 Visualization & Analysis
**Goal**: Provide visual insights into code structure and relationships.

**Implementation**:
```typescript
// AST diff between versions
ast_grep_diff({
  before: 'function old() {}',
  after: 'function new() {}',
  language: 'javascript'
})

// Pattern match heatmap
ast_grep_visualize({
  pattern: 'function $NAME',
  output: 'heatmap' // 'heatmap' | 'graph' | 'hierarchy'
})

// Component relationship graph
ast_grep_analyze_relationships({
  entry_point: 'src/App.js',
  depth: 3
})
```

**Features**:
- Visual diff of AST changes
- Codebase pattern distribution visualization
- Interactive component dependency graphs

### 3.2 Performance Optimizations
**Goal**: Scale to large codebases with optimal performance.

**Implementation**:
```typescript
// Parallel query execution
ast_grep_parallel_search({
  queries: [/* multiple patterns */],
  workers: 4
})

// Smart pagination
ast_grep_find_paginated({
  pattern: 'function $NAME',
  page: 1,
  page_size: 50,
  total_only: false
})

// Incremental indexing
ast_grep_index_update({
  since: '2024-01-01T00:00:00Z',
  pattern: 'function $NAME'
})
```

**Optimizations**:
- Worker pool for parallel ast-grep execution
- Streaming results for large matches
- File watcher integration for incremental updates
- Memory-efficient result processing

### 3.3 IDE/Editor Integration
**Goal**: Provide real-time search capabilities within development workflows.

**Features**:
- VSCode extension with quick search
- Real-time rule validation
- In-editor pattern matching highlights
- Quick-fix suggestions for found patterns

## Implementation Priority Matrix

| Feature | Impact | Effort | Dependencies | Phase |
|---------|--------|--------|--------------|-------|
| Rule Library | High | Low | None | 1.1 |
| Batch Queries | High | Medium | Current API | 1.2 |
| Context Results | Medium | Low | File reading | 1.3 |
| Semantic Search | High | High | Enhanced parsing | 2.1 |
| Tool Integration | Medium | Medium | External tools | 2.2 |
| Visualization | Low | High | UI components | 3.1 |
| Performance | Medium | High | Architecture | 3.2 |
| IDE Integration | Low | High | Extension dev | 3.3 |

## Success Metrics

Each phase will be considered successful based on:

**Phase 1 Success Criteria**:
- 50% reduction in LLM token usage for common search tasks
- 90% user satisfaction with rule library coverage
- 75% faster complex query execution via batch operations

**Phase 2 Success Criteria**:
- 40% reduction in follow-up queries needed for semantic context
- Support for 10+ common semantic patterns out of the box
- 60% faster hybrid searches compared to sequential execution

**Phase 3 Success Criteria**:
- Handle codebases with 1M+ LOC without performance degradation
- Visualizations used in 25% of search sessions
- IDE extension installed by 30% of users

## Contributing

We welcome contributions! Please check:
1. **Good First Issues**: Look for issues tagged `good-first-issue`
2. **Rule Library Contributions**: Add useful presets via PR
3. **Performance Improvements**: Benchmark and optimize critical paths
4. **Documentation**: Improve examples and user guides

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Feedback & Suggestions

This roadmap is based on user feedback. To suggest new features or adjustments:

1. Open an issue with the `enhancement` label
2. Include specific use cases and expected benefits
3. Reference similar tools or patterns if applicable
4. Consider implementation complexity and dependencies

---

*Last updated: 2026-02-26*  
*Based on user feedback from: 2026-02-25*