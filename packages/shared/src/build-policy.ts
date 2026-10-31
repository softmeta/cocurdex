export const PRODUCT_FEATURES = ["remote-access"] as const;

export type ProductFeature = (typeof PRODUCT_FEATURES)[number];

export interface BuildPolicy {
  disabledFeatures: ProductFeature[];
  updates: boolean;
}

export const DEFAULT_BUILD_POLICY: BuildPolicy = {
  disabledFeatures: [],
  updates: true,
};

declare const __COCURDEX_BUILD_POLICY__: BuildPolicy | undefined;

export const buildPolicy: BuildPolicy =
  typeof __COCURDEX_BUILD_POLICY__ === "undefined"
    ? DEFAULT_BUILD_POLICY
    : __COCURDEX_BUILD_POLICY__;

function isProductFeature(value: string): value is ProductFeature {
  return (PRODUCT_FEATURES as readonly string[]).includes(value);
}

export function parseDisabledFeatures(value: string): ProductFeature[] {
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const unknown = names.filter((name) => !isProductFeature(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown feature ${unknown.join(", ")}; known features: ${PRODUCT_FEATURES.join(", ")}`,
    );
  }
  return [...new Set(names as ProductFeature[])];
}

export function isFeatureEnabled(policy: BuildPolicy, feature: ProductFeature) {
  return !policy.disabledFeatures.includes(feature);
}
