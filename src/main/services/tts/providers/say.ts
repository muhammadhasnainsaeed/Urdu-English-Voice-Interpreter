import { execFile } from "child_process";
import { promisify } from "util";
import type { TtsProvider } from "../provider";

const execFileAsync = promisify(execFile);

export function createSayTtsProvider(): TtsProvider {
  return {
    name: "say",

    async speak(text: string): Promise<void> {
      await execFileAsync("say", ["-v", "Samantha", "-r", "200", text]);
    },

    async stop(): Promise<void> {
      try {
        await execFileAsync("killall", ["say"]);
      } catch {
        // say may not be running.
      }
    },
  };
}
