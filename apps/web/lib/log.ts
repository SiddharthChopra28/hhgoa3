// Diagnostics go to stderr so the CLI's stdout stays valid JSON.
export function log(message: string): void {
  process.stderr.write(`${message}\n`);
}
