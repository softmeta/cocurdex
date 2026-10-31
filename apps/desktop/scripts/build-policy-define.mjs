export function buildPolicyDefine(env = process.env) {
  const policy = env.COCURDEX_BUILD_POLICY;
  return policy ? { __COCURDEX_BUILD_POLICY__: policy } : {};
}
