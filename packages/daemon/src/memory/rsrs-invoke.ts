import { parseRsrsJson, type RsrsExecutable, runRsrs } from "./rsrs";
import type { RsrsReply } from "./runtime";

export type RsrsInvoke = (
  args: readonly string[],
  timeoutMs: number,
) => Promise<RsrsReply>;

export function cliInvoke(executable: RsrsExecutable): RsrsInvoke {
  return async (args, timeoutMs) => {
    const result = await runRsrs(executable, args, { timeoutMs });
    try {
      return { payload: parseRsrsJson(result.stdout), exit: result.code };
    } catch (error) {
      const detail = result.stderr.trim();
      if (!detail) throw error;
      throw new Error(detail, { cause: error });
    }
  };
}
