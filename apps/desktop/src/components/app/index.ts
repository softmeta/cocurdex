/**
 * Product wrappers over `components/ui` (shadcn). Business code should prefer
 * these APIs; do not hand-assemble Select/Combobox/Dropdown primitives for
 * value-select UIs. Keep domain composites (chat, markdown, …) outside this folder.
 */
export { AppConfirmDialog } from "./confirm-dialog";
export {
  AppDropdownContent,
  AppDropdownItem,
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
  appDropdownContentClassName,
  appDropdownSeparatorClassName,
  compactDropdownContentClassName,
} from "./dropdown";
export {
  AppDropdownRadioList,
  type AppDropdownRadioSection,
} from "./dropdown-radio";
export { AppGitBranchLabel } from "./git-branch-label";
export {
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "./searchable-select";
export { AppSelect } from "./select";
export { SettingRow, SettingsGroup } from "./settings-fields";
