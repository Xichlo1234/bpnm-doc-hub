import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Ratchet against hard-coded Vietnamese UI text in the client. Every user-visible string should come
// from src/client/src/i18n. Counts per file may only go down; when they do, refresh the baseline:
//   UPDATE_I18N_BASELINE=1 npx vitest run tests/i18n_hardcoded.test.ts
//
// Not counted: comments, strings compared against stored data (`status === 'Hoàn thành'`, `case '...'`),
// object keys, and any line containing the marker `i18n-data` or statement preceded by an `// i18n-data`
// comment (for constants that are stored values).

const ROOT = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT, 'src/client/src');
const BASELINE_FILE = path.join(__dirname, 'i18n_hardcoded.baseline.json');
const EXCLUDED_DIRS = [path.join(CLIENT_SRC, 'i18n')];

const VIETNAMESE_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìĩóòõúùũý]/i;
const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function listSourceFiles(dir: string): string[] {
  if (EXCLUDED_DIRS.includes(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function isDataLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isBinaryExpression(parent) && COMPARISON_OPERATORS.has(parent.operatorToken.kind)) return true;
  if (ts.isCaseClause(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  // `.includes('...')`, `.startsWith('...')` etc. on stored values
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    return ['includes', 'startsWith', 'endsWith', 'indexOf'].includes(parent.expression.name.text);
  }
  return false;
}

/** True when the literal sits inside a statement preceded by an `// i18n-data` comment. */
function isMarkedDataBlock(node: ts.Node, text: string): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (!ts.isStatement(current) && !ts.isPropertyAssignment(current)) continue;
    const comments = ts.getLeadingCommentRanges(text, current.getFullStart()) ?? [];
    if (comments.some((range) => text.slice(range.pos, range.end).includes('i18n-data'))) return true;
  }
  return false;
}

/** Returns the 1-based line numbers of hard-coded Vietnamese strings in a file. */
function findHardcodedVietnamese(file: string): number[] {
  const text = fs.readFileSync(file, 'utf-8');
  const lines = text.split('\n');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = new Set<number>();

  const visit = (node: ts.Node) => {
    let value: string | undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) value = node.text;
    else if (ts.isJsxText(node)) value = node.text;

    if (value !== undefined && VIETNAMESE_CHARS.test(value)) {
      const target = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.parent.parent ?? node : node;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
      if (!isDataLiteral(target) && !lines[line].includes('i18n-data') && !isMarkedDataBlock(node, text)) hits.add(line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...hits].sort((a, b) => a - b);
}

function scan(): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const file of listSourceFiles(CLIENT_SRC)) {
    const hits = findHardcodedVietnamese(file);
    if (hits.length) result[path.relative(ROOT, file).split(path.sep).join('/')] = hits;
  }
  return result;
}

describe('hard-coded Vietnamese UI text (client)', () => {
  it('does not grow beyond the recorded baseline', () => {
    const found = scan();
    const counts = Object.fromEntries(Object.entries(found).map(([f, hits]) => [f, hits.length]).sort());

    if (process.env.UPDATE_I18N_BASELINE) {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(counts, null, 2) + '\n');
      return;
    }

    const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
    const grown: string[] = [];
    const shrunk: string[] = [];
    for (const file of new Set([...Object.keys(baseline), ...Object.keys(counts)])) {
      const was = baseline[file] ?? 0;
      const now = counts[file] ?? 0;
      if (now > was) grown.push(`${file}: ${was} → ${now} (lines ${found[file].join(', ')})`);
      else if (now < was) shrunk.push(`${file}: ${was} → ${now}`);
    }

    expect(grown, 'New hard-coded Vietnamese text: move it to src/client/src/i18n').toEqual([]);
    expect(shrunk, 'Fewer hard-coded strings than the baseline: run with UPDATE_I18N_BASELINE=1').toEqual([]);
  });
});
