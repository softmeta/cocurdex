export {
  getDefaultSkillsSourceRoot,
  getProductSkillsPackVersion,
  MANAGED_MARKER_FILENAME,
  type ManagedSkillsMarker,
  PRODUCT_SKILL_NAMES,
  PRODUCT_SKILLS_PACK_VERSION,
  type ProductSkillName,
  type SkillScope,
} from "./manifest";
export { resolveAgentsSkillsDir, resolveClaudeSkillsDir } from "./paths";
export {
  type ClaudeLinkMode,
  getProductSkillsStatus,
  type InstallProductSkillsResult,
  installProductSkills,
  type ProductSkillsIoOptions,
  type ProductSkillsStatus,
  type RemoveProductSkillsResult,
  removeProductSkills,
} from "./sync-product-skills";
