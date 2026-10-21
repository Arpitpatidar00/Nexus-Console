// Vitest runs in Node; tests that read source files need just this much of
// node:fs. Declared here instead of adding @types/node to the app's globals.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
