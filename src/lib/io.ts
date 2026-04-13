export async function readStdinIfPresent(): Promise<string | undefined> {
  if (process.stdin.isTTY) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function writeStderr(message: string): void {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
}
