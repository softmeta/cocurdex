import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { getDurableHost } from "./durable-host";
import { hasDurableStorage } from "./durable-store";

/**
 * The request IDs (Cocurdex message IDs) of inputs the durable harness still has queued or in a
 * run: turns a stopped daemon left behind, whether it crashed or shut down.
 */
export async function listDurableInFlightInputs(userDataPath: string) {
  if (!hasDurableStorage(userDataPath)) {
    return [];
  }
  const harness = await getDurableHost(userDataPath).harness();
  const inspection = await harness.inspect(BACKGROUND_CONTEXT);
  return inspection.submissions.flatMap((submission) =>
    submission.type === "input" &&
    (submission.status === "queued" || submission.status === "placed") &&
    submission.requestId !== undefined
      ? [submission.requestId]
      : [],
  );
}
