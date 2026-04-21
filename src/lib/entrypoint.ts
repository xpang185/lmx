import { LmxError, EXIT_RUNTIME } from "./errors.js";
import { writeStderr } from "./io.js";

export async function runEntrypoint(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    if (error instanceof LmxError) {
      writeStderr(error.message);
      process.exitCode = error.exitCode;
      return;
    }

    if (error instanceof Error) {
      writeStderr(error.message);
      process.exitCode = EXIT_RUNTIME;
      return;
    }

    writeStderr(String(error));
    process.exitCode = EXIT_RUNTIME;
  }
}
