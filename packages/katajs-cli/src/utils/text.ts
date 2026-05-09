/**
 * Convert a user-supplied module name into the various casings the templates
 * need: kebab-case for the directory, PascalCase for the type, camelCase for
 * the variable.
 *
 *   normalizeName("user-profile")
 *   // { kebab: "user-profile", pascal: "UserProfile", camel: "userProfile" }
 */
export type Casings = {
  kebab: string;
  pascal: string;
  camel: string;
};

export function normalizeName(input: string): Casings {
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .toLowerCase();

  if (!cleaned) {
    throw new Error(`Invalid name: "${input}". Use lowercase letters, digits, and hyphens.`);
  }
  if (!/^[a-z]/.test(cleaned)) {
    throw new Error(`Name must start with a letter: "${input}".`);
  }

  const parts = cleaned.split(/[-_]+/).filter(Boolean);
  const camel = parts[0] + parts.slice(1).map(capitalize).join('');
  const pascal = parts.map(capitalize).join('');

  return { kebab: parts.join('-'), pascal, camel };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
