/**
 * Anchor-based codemod helpers. Copy of `create-katajs/src/codemod.ts` —
 * kept duplicated for now to avoid an internal shared package; future
 * refactor may extract to `@katajs/internal`.
 */

export class AnchorMissingError extends Error {
  constructor(public readonly anchor: string) {
    super(`Anchor "// katajs:${anchor}" not found`);
    this.name = 'AnchorMissingError';
  }
}

/**
 * Insert one or more new lines BEFORE the given anchor, matching the anchor
 * line's leading whitespace. The anchor itself is left in place so subsequent
 * inserts can chain.
 *
 * Idempotent: returns content unchanged if `lines` is already present.
 */
export function insertBeforeAnchor(
  content: string,
  anchor: string,
  lines: string | string[],
): string {
  const anchorMatch = new RegExp(`^(\\s*)// katajs:${escapeRe(anchor)}\\s*$`, 'm');
  const m = content.match(anchorMatch);
  if (!m) throw new AnchorMissingError(anchor);

  const indent = m[1] ?? '';
  const arr = Array.isArray(lines) ? lines : [lines];
  const toInsert = arr.map((l) => indent + l).join('\n');

  const allPresent = arr.every((l) => content.includes(l.trim()));
  if (allPresent) return content;

  return content.replace(anchorMatch, `${toInsert}\n${m[0]}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Quick check: does this file contain the anchor? */
export function hasAnchor(content: string, anchor: string): boolean {
  const re = new RegExp(`^\\s*// katajs:${escapeRe(anchor)}\\s*$`, 'm');
  return re.test(content);
}

/**
 * Insert a new `.route(<moduleVar>.prefix, <moduleVar>.routes)` step into the
 * routes callback chain in `app.ts`. The chain ends just before the
 * `// katajs:routes` anchor. The previous-last `.route(...),` loses its
 * trailing comma; the new line gets it.
 *
 * Idempotent: returns content unchanged if the route is already present.
 */
export function appendRouteToChain(content: string, moduleVar: string): string {
  const newCallSig = `.route(${moduleVar}.prefix, ${moduleVar}.routes)`;
  if (content.includes(newCallSig)) return content;

  const lines = content.split('\n');
  const anchorIdx = lines.findIndex((l) =>
    /^\s*\/\/ katajs:routes\s*$/.test(l),
  );
  if (anchorIdx === -1) throw new AnchorMissingError('routes');

  let lastChainIdx = -1;
  const chainLineRe = /^\s*\.route\(\w+\.prefix,\s*\w+\.routes\)/;
  for (let i = anchorIdx - 1; i >= Math.max(0, anchorIdx - 25); i--) {
    if (chainLineRe.test(lines[i] ?? '')) {
      lastChainIdx = i;
      break;
    }
  }
  if (lastChainIdx === -1) {
    throw new Error(
      'appendRouteToChain: could not locate a `.route(<X>.prefix, <X>.routes)` line above // katajs:routes',
    );
  }

  const lastLine = lines[lastChainIdx]!;
  const indent = lastLine.match(/^(\s*)/)?.[1] ?? '      ';

  lines[lastChainIdx] = lastLine.replace(/,(\s*)$/, '$1');
  lines.splice(
    lastChainIdx + 1,
    0,
    `${indent}.route(${moduleVar}.prefix, ${moduleVar}.routes),`,
  );

  return lines.join('\n');
}
