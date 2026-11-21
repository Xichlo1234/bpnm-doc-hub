// Generate source-only D1 guards for a maintenance cutover. This module never runs the SQL.
const OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'];
const PREFIX = 'bpnm_cutover_';

function identifier(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

export function planCutoverFence(tables) {
  const selected = [...new Set(tables)].filter(name => !/^(?:sqlite_|_cf_)/i.test(name)).sort();
  if (!selected.includes('documents') || !selected.includes('meta')) {
    throw new Error('The source schema is missing BPNM tables');
  }
  const triggers = selected.flatMap(table => OPERATIONS.map(operation => {
    const name = PREFIX + table + '_' + operation.toLowerCase();
    const sql = `CREATE TRIGGER ${identifier(name)} BEFORE ${operation} ON ${identifier(table)} ` +
      "BEGIN SELECT RAISE(ABORT, 'BPNM source is fenced for cutover'); END";
    return { name, sql };
  }));
  return {
    triggers,
    apply: triggers.map(({ sql }) => sql + ';').join('\n'),
    release: triggers.map(({ name }) => `DROP TRIGGER IF EXISTS ${identifier(name)};`).join('\n'),
  };
}
