import type { AgentId, AgentSlashCommand } from "@cocurdex/shared";
import type { KeyboardEvent, Ref, RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Text,
} from "@/components/ui";
import { cn, desktopApi, useDocumentEvent } from "@/lib";
import type { MentionAnchor, MentionEditorHandle } from "./mention-editor";
import { MentionMenuPopover } from "./mention-menu-popover";
import {
  isMenuRowSidecarEventTarget,
  MenuRowSidecar,
} from "./menu-row-sidecar";
import { SlashCommandPreview } from "./slash-command-preview";
import { useHighlightedMenuRow } from "./use-highlighted-menu-row";

const SLASH_COMMAND_RESULT_LIMIT = 30;

function agentSupportsSlashCommands(agentType: AgentId | undefined) {
  return agentType !== undefined;
}

// Returns the query after the slash while the current text ends with a bare
// slash token (`/rev`), i.e. before any argument is typed.
export function extractSlashQuery(text: string): string | null {
  const match = /(^|\s)\/([^\s]*)$/.exec(text);
  return match ? match[2] : null;
}

interface UseSlashCommandsOptions {
  agentType: AgentId | undefined;
  runtimeCommands?: AgentSlashCommand[] | null;
  workspaceRootPath?: string | null;
  editorRef: RefObject<MentionEditorHandle | null>;
}

export function useSlashCommands({
  agentType,
  runtimeCommands,
  workspaceRootPath,
  editorRef,
}: UseSlashCommandsOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Cache is keyed by agent + workspace because agents use different skill
  // roots and invocation syntax.
  const cacheKey = JSON.stringify([agentType ?? "", workspaceRootPath ?? ""]);
  const [cache, setCache] = useState<{
    key: string;
    commands: AgentSlashCommand[];
  } | null>(null);
  const queriedCommands = cache?.key === cacheKey ? cache.commands : null;
  const runtimeSkills = runtimeCommands?.filter(
    (command) => command.source === "skill",
  );
  const commands = runtimeSkills?.length ? runtimeSkills : queriedCommands;
  const [query, setQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Fetch commands lazily the first time the user opens the menu for a given
  // agent + workspace, driven from the composer's change event (no effect).
  const loadCommands = useCallback(() => {
    if (runtimeSkills?.length) {
      return;
    }
    if (!agentSupportsSlashCommands(agentType) || !workspaceRootPath) {
      setCache({ key: cacheKey, commands: [] });
      return;
    }
    void desktopApi
      .listSlashCommands(agentType as AgentId, workspaceRootPath)
      .then((result) => setCache({ key: cacheKey, commands: result }))
      .catch(() => setCache({ key: cacheKey, commands: [] }));
  }, [agentType, cacheKey, runtimeSkills?.length, workspaceRootPath]);

  const handleSlashQueryChange = useCallback(
    (nextQuery: string | null) => {
      setQuery((current) => (current === nextQuery ? current : nextQuery));
      setHighlightedIndex(0);
      if (nextQuery !== null && commands === null) {
        loadCommands();
      }
    },
    [commands, loadCommands],
  );

  const matchingCommands = useMemo(() => {
    if (query === null || !commands) {
      return [];
    }
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? commands.filter((command) =>
          command.name.toLowerCase().includes(trimmed),
        )
      : commands;
    return filtered.slice(0, SLASH_COMMAND_RESULT_LIMIT);
  }, [commands, query]);

  const supportsCommands = agentSupportsSlashCommands(agentType);
  const isOpen =
    query !== null &&
    supportsCommands &&
    commands !== null &&
    matchingCommands.length > 0;

  const clear = useCallback(() => {
    setQuery(null);
    setHighlightedIndex(0);
  }, []);

  const handlePointerDownOutside = useCallback(
    (event: PointerEvent) => {
      if (query === null) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (isMenuRowSidecarEventTarget(target)) return;
      const editorNode = document.querySelector(".mention-editor");
      if (editorNode?.contains(target)) return;
      clear();
    },
    [query, clear],
  );
  useDocumentEvent("pointerdown", handlePointerDownOutside);

  const selectCommand = useCallback(
    (command: AgentSlashCommand) => {
      const editor = editorRef.current;
      if (!editor) return;
      const invocation = command.invocation ?? `/${command.name} `;
      if (!editor.replaceSlashToken(invocation)) {
        editor.insertText(invocation);
      }
      clear();
    },
    [editorRef, clear],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    const acceptHighlightedCommand = () => {
      const safeIndex = Math.min(highlightedIndex, matchingCommands.length - 1);
      const target = matchingCommands[safeIndex];
      if (target) {
        selectCommand(target);
      }
    };

    if (event.key === "Escape") {
      event.preventDefault();
      clear();
      return;
    }

    const key = event.key.toLowerCase();
    const isNext = event.key === "ArrowDown" || (event.ctrlKey && key === "n");
    const isPrevious =
      event.key === "ArrowUp" || (event.ctrlKey && key === "p");

    if (isNext) {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, matchingCommands.length - 1),
      );
      return;
    }
    if (isPrevious) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      acceptHighlightedCommand();
    }
  };

  return {
    handleKeyDown,
    highlightedIndex,
    isOpen,
    matchingCommands,
    menuRef,
    selectCommand,
    setHighlightedIndex,
    handleSlashQueryChange,
  };
}

export type SlashCommandsState = ReturnType<typeof useSlashCommands>;

interface SlashCommandMenuProps {
  anchor?: MentionAnchor | null;
  commands: AgentSlashCommand[];
  highlightedIndex: number;
  isOpen: boolean;
  menuRef?: Ref<HTMLDivElement>;
  onHighlightIndex(index: number): void;
  onSelect(command: AgentSlashCommand): void;
  placement?: "top" | "bottom";
  tone?: "chat" | "welcome";
}

export function SlashCommandMenu({
  anchor,
  commands,
  highlightedIndex,
  isOpen,
  menuRef,
  onHighlightIndex,
  onSelect,
  placement = "top",
  tone = "chat",
}: SlashCommandMenuProps) {
  const { highlightedItem, setListNode } = useHighlightedMenuRow({
    highlightedIndex,
    isOpen,
    itemAttribute: "data-slash-index",
  });

  const menuClassName =
    tone === "welcome"
      ? "border-welcome-border/60 bg-welcome-surface/95 text-welcome-fg-secondary backdrop-blur-md"
      : "border-chat-border-soft bg-chat-surface-raised/95 text-chat-fg backdrop-blur-md";
  const hoverClassName =
    tone === "welcome"
      ? "data-highlighted:bg-welcome-surface-row-hover data-highlighted:text-welcome-fg"
      : "data-highlighted:bg-chat-surface-row-hover data-highlighted:text-chat-fg";
  const selectedClassName =
    tone === "welcome"
      ? "bg-welcome-surface-selected! text-welcome-fg!"
      : "bg-chat-surface-selected! text-chat-fg!";
  if (!isOpen || !anchor) {
    return null;
  }

  const highlightedCommand = commands[highlightedIndex];
  const previewDescription = highlightedCommand?.description?.trim();

  return (
    <>
      <MentionMenuPopover
        anchor={anchor}
        containerRef={menuRef}
        isOpen={isOpen}
        side={placement}
      >
        <Command
          className={cn(
            "h-auto max-h-[var(--available-height)] rounded-card border p-1.5 shadow-chat-soft",
            menuClassName,
          )}
          autoHighlight={false}
          shouldFilter={false}
        >
          <CommandList
            className="max-h-[min(18rem,var(--available-height))]"
            ref={setListNode}
          >
            <CommandGroup className="p-0">
              {commands.map((command, index) => {
                const isSelected = index === highlightedIndex;
                return (
                  <CommandItem
                    className={cn(
                      "h-8 min-w-0 items-center rounded-control px-2 text-current",
                      isSelected ? selectedClassName : hoverClassName,
                    )}
                    data-slash-index={index}
                    key={command.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerEnter={() => onHighlightIndex(index)}
                    onSelect={() => onSelect(command)}
                    value={command.name}
                  >
                    <Text
                      className="min-w-0 flex-1"
                      size="body"
                      truncate
                      weight="medium"
                    >
                      {command.name}
                    </Text>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </MentionMenuPopover>
      {previewDescription ? (
        <MenuRowSidecar reference={highlightedItem}>
          <SlashCommandPreview description={previewDescription} tone={tone} />
        </MenuRowSidecar>
      ) : null}
    </>
  );
}
