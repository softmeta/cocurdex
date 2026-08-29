import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import { type Editor, Extension, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import {
  filterSlashCommandItems,
  type SlashCommandItem,
} from "./slash-command-items";
import {
  SlashCommandMenu,
  type SlashCommandMenuHandle,
} from "./slash-command-menu";

// The Suggestion `command` payload: the chosen item plus its run target.
interface SlashCommandProps {
  run: (editor: Editor, range: Range) => void;
}

// Position the floating menu against the caret rect provided by Suggestion.
// We bridge Floating UI directly to a portal-less absolutely-positioned div
// rather than wiring base-ui's Popover — far less glue for a transient menu.
// ponytail: direct Floating UI; switch to base-ui Popover only if we need its
// focus-trap / collision shared behavior elsewhere.
function attachMenuPosition(
  element: HTMLElement,
  clientRect: (() => DOMRect | null) | null | undefined,
) {
  if (!clientRect) {
    return () => {};
  }
  const virtualEl = {
    getBoundingClientRect: () => clientRect() ?? new DOMRect(),
  };
  return autoUpdate(virtualEl, element, () => {
    if (!clientRect()) {
      return;
    }
    void computePosition(virtualEl, element, {
      middleware: [
        offset(6),
        flip(),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply({ availableHeight, elements }) {
            elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
          },
        }),
      ],
      placement: "bottom-start",
    }).then(({ x, y }) => {
      Object.assign(element.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  });
}

function createRenderer(): SuggestionOptions["render"] {
  return () => {
    let component: ReactRenderer<SlashCommandMenuHandle> | null = null;
    let element: HTMLElement | null = null;
    let detachPosition: (() => void) | null = null;

    const renderProps = (props: SuggestionProps<SlashCommandItem>) => ({
      items: props.items,
      onSelect: (item: SlashCommandItem) =>
        props.command({ run: item.run } as SlashCommandProps),
    });

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashCommandMenu, {
          editor: props.editor,
          props: renderProps(props),
        });
        element = document.createElement("div");
        element.style.position = "absolute";
        // Above dialog/popover surfaces (z-50) so the palette works in modals.
        element.style.zIndex = "100";
        element.appendChild(component.element);
        document.body.appendChild(element);
        detachPosition = attachMenuPosition(element, props.clientRect);
      },
      onUpdate: (props) => {
        component?.updateProps(renderProps(props));
        if (element) {
          detachPosition?.();
          detachPosition = attachMenuPosition(element, props.clientRect);
        }
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          return true;
        }
        return component?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        detachPosition?.();
        detachPosition = null;
        element?.remove();
        element = null;
        component?.destroy();
        component = null;
      },
    };
  };
}

// Slash-command extension: type "/" to open the block-insert palette.
export function createSlashCommand() {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem, SlashCommandProps>({
          editor: this.editor,
          char: "/",
          // Only trigger at the start of a line / after whitespace.
          allowSpaces: false,
          items: ({ query }) => filterSlashCommandItems(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: createRenderer(),
        }),
      ];
    },
  });
}
