/**
 * Product wrappers over `components/ui` (shadcn). Business code should prefer
 * these APIs; do not hand-assemble Select/Combobox/Dropdown primitives for
 * value-select UIs. Keep domain composites (chat, markdown, …) outside this folder.
 */

export { AppActivityTime } from "./activity-time";
export { AppConfirmDialog } from "./confirm-dialog";
export { AppCopyButton } from "./copy-button";
export {
  AppDropdownContent,
  AppDropdownItem,
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
} from "./dropdown";
export {
  AppDropdownRadioList,
  type AppDropdownRadioSection,
} from "./dropdown-radio";
export { AppGitBranchLabel } from "./git-branch-label";
export { AppInlineRenameInput } from "./inline-rename-input";
export { AppPanelTab } from "./panel-tab";
export { AppPreviewCardTooltipContent } from "./preview-card-tooltip";
export { AppRemoveButton } from "./remove-button";
export { AppSearchInput } from "./search-input";
export {
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "./searchable-select";
export { AppSelect } from "./select";
export {
  SettingNumberInput,
  SettingRow,
  SettingsGroup,
} from "./settings-fields";
export {
  AppSidebarIconButton,
  type AppSidebarIconButtonProps,
} from "./sidebar-icon-button";
export { AppSidebarRowTitle } from "./sidebar-row-title";
export { AppStatusDot, type AppStatusTone } from "./status-dot";
export { AppWindowOverlayHeader } from "./window-overlay-header";
