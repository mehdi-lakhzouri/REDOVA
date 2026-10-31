import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globalRoles, orgRoles } from './access-control';

/**
 * AC-006-01: the permission matrix in docs/user-management/README.md §9 is the specification.
 * This test parses the markdown tables, so the documentation and the code cannot drift.
 */
const README = readFileSync(resolve(__dirname, '../../../docs/user-management/README.md'), 'utf8');

interface MatrixRow {
  permissions: Array<[string, string]>;
  cells: Record<string, boolean>;
}

const parseTable = (heading: string): MatrixRow[] => {
  const start = README.indexOf(heading);
  if (start < 0) throw new Error(`Heading not found: ${heading}`);
  const lines = README.slice(start).split('\n');
  const headerIndex = lines.findIndex((line) => line.startsWith('| Resource : action'));
  const header = lines[headerIndex].split('|').map((cell) => cell.trim());
  const rows: MatrixRow[] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').map((cell) => cell.trim());
    const permissions = [...cells[1].matchAll(/`([a-zA-Z]+):([a-z-]+)`/g)].map(
      ([, resource, action]) => [resource, action] as [string, string],
    );
    const roleCells: Record<string, boolean> = {};
    header.forEach((role, index) => {
      if (/^[A-Z_]+$/.test(role))
        roleCells[role] = cells[index].includes('✅') || cells[index].includes('⚖️');
    });
    rows.push({ permissions, cells: roleCells });
  }
  return rows;
};

const authorize = (
  roles: Record<string, { authorize: (request: Record<string, string[]>) => { success: boolean } }>,
  role: string,
  [resource, action]: [string, string],
) => roles[role].authorize({ [resource]: [action] }).success;

describe('organization permission matrix matches README §9.1', () => {
  const rows = parseTable('### 9.1 Organization permissions');

  it('parses every role column and row', () => {
    expect(Object.keys(rows[0].cells).sort()).toEqual(Object.keys(orgRoles).sort());
    expect(rows.length).toBeGreaterThanOrEqual(18);
  });

  for (const row of rows) {
    for (const permission of row.permissions) {
      for (const [role, allowed] of Object.entries(row.cells)) {
        it(`${role} ${allowed ? 'can' : 'cannot'} ${permission.join(':')}`, () => {
          expect(authorize(orgRoles, role, permission)).toBe(allowed);
        });
      }
    }
  }
});

describe('global permission matrix matches README §9.2', () => {
  const rows = parseTable('### 9.2 Global permissions');

  it('parses both global roles', () => {
    expect(Object.keys(rows[0].cells).sort()).toEqual(Object.keys(globalRoles).sort());
  });

  for (const row of rows) {
    for (const permission of row.permissions) {
      for (const [role, allowed] of Object.entries(row.cells)) {
        it(`${role} ${allowed ? 'can' : 'cannot'} ${permission.join(':')}`, () => {
          expect(authorize(globalRoles, role, permission)).toBe(allowed);
        });
      }
    }
  }
});
