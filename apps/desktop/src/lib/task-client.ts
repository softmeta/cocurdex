import { createTaskClient, type TaskApi } from "@cocurdex/shared";

declare global {
  interface Window {
    taskApi?: TaskApi;
  }
}

export const taskApi = createTaskClient(() => {
  if (typeof window === "undefined" || !window.taskApi) {
    throw new Error(
      "Task service is unavailable. Connect to an execution host.",
    );
  }
  return window.taskApi;
});
