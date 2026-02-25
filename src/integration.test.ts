import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { executeAstGrep } from './utils';

describe('integration (requires ast-grep)', () => {
  const fixturesDir = join(process.cwd(), 'test/fixtures');

  test('finds console.log statements', async () => {
    const result = await executeAstGrep('run', [
      '--pattern',
      'console.log($ARG)',
      '--lang',
      'javascript',
      '--json',
      fixturesDir,
    ]);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.text).toContain('console.log');
  });

  test('dumps syntax tree', async () => {
    const result = await executeAstGrep(
      'run',
      ['--pattern', 'function hello() {}', '--lang', 'javascript', '--debug-query=cst'],
      {},
    );

    expect(result.stderr).toBeDefined();
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('tests YAML rule', async () => {
    const yaml = `id: find-console
language: javascript
rule:
  pattern: console.log($ARG)`;

    const result = await executeAstGrep('scan', ['--inline-rules', yaml, '--json', '--stdin'], {
      input: "console.log('test');\nfunction foo() {}",
    });

    expect(result.matches.length).toBe(1);
    expect(result.matches[0]?.text).toBe("console.log('test')");
  });
});
