// The finance tests read the Windows-1252 fixtures as raw bytes. Only this
// one function is declared - the app's tsconfig deliberately has no Node
// types, so app code cannot start relying on Node APIs.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array<ArrayBuffer>
}
