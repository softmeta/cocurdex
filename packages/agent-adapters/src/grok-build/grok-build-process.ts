// Shared spawn contract for `grok agent stdio`, used by both the session
// adapter and the model-catalog probe so they always talk to the same process
// shape (and the same startup hints).
export const GROK_BUILD_COMMAND = "grok";

export const GROK_BUILD_ARGS = ["--no-auto-update", "agent", "stdio"];

export const GROK_BUILD_INITIALIZE_META = {
  clientType: "cocurdex",
  startupHints: {
    nonInteractive: true,
    skipGitStatus: true,
    skipProjectLayout: true,
  },
};

export function getGrokBuildAuthMethodPriority(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.XAI_API_KEY
    ? ["xai.api_key", "cached_token"]
    : ["cached_token", "xai.api_key"];
}
