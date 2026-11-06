import type { IssueDetail, IssueRecord } from "@cocurdex/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import { expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  getDetail: vi.fn(),
  updateIssue: vi.fn(),
  load: vi.fn(async () => null),
}));
vi.mock("@/features/issues/issues-ipc", () => ({ issuesIpc: ipc }));
vi.mock("@/components/markdown-body-editor", () => ({
  MarkdownBodyEditor: ({ initialMarkdown }: { initialMarkdown: string }) => (
    <div>{initialMarkdown}</div>
  ),
}));
vi.mock("@/features/issues/detail/issue-field-row", () => ({
  IssueFieldRow: () => null,
}));
vi.mock("@/features/issues/detail/issue-detail-sections", () => ({
  IssueDetailSections: () => null,
}));
vi.mock("@/features/issues/detail/issue-activity", () => ({
  IssueActivity: () => null,
}));
vi.mock("@/features/issues/detail/use-issue-step-shortcuts", () => ({
  useIssueStepShortcuts: () => {},
}));

import { IssueDetailPage } from "@/features/issues/detail/issue-detail-page";
import {
  issueDetailAtom,
  openIssueDetailAtom,
} from "@/features/issues/issue-detail-store";

const card: IssueRecord = {
  id: "issue-hydration",
  number: 1,
  identifier: "COC-1",
  columnId: "doing",
  columnIds: ["doing"],
  viewId: "project",
  title: "Checkout",
  description: "Short excerpt",
  color: null,
  status: "doing",
  statusCategory: "started",
  priority: "none",
  workspaceId: null,
  parentId: null,
  labelIds: [],
  sessionIds: [],
  completedAt: null,
  sortOrder: 0,
  revision: 1,
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};
const detail: IssueDetail = {
  issue: { ...card, description: "Complete markdown body" },
  parent: null,
  children: [],
  relations: [],
  sessions: [],
  events: [],
};

function Detail() {
  const state = useAtomValue(issueDetailAtom);
  if (!state) return null;
  return (
    <IssueDetailPage
      state={state}
      viewTitle="Project"
      options={{
        statusOptions: [],
        priorityOptions: [],
        workspaces: [],
        labels: [],
        issues: [],
      }}
      actions={{
        onCreateLabel: async () => null,
        onOpenIssue: () => {},
        onAddSubIssue: () => {},
        onAddRelation: () => {},
        onRemoveRelation: () => {},
        onComment: async () => true,
      }}
      stepper={null}
      onBack={() => {}}
    />
  );
}

it("keeps the focused title and its draft when the complete issue body arrives", async () => {
  let complete!: (value: IssueDetail) => void;
  ipc.getDetail.mockImplementationOnce(
    () =>
      new Promise<IssueDetail>((resolve) => {
        complete = resolve;
      }),
  );
  ipc.updateIssue.mockImplementation(async (payload) => ({
    ...detail.issue,
    title: payload.title,
  }));
  const store = createStore();
  let loading!: Promise<void>;
  act(() => {
    loading = store.set(openIssueDetailAtom, card);
  });
  render(
    <Provider store={store}>
      <Detail />
    </Provider>,
  );
  const input = screen.getByRole("textbox");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "Checkout draft" } });
  await act(async () => {
    complete(detail);
    await loading;
  });
  expect(screen.getByText("Complete markdown body")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveFocus();
  expect(screen.getByRole("textbox")).toHaveValue("Checkout draft");
  fireEvent.change(input, { target: { value: "Checkout fixed" } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(ipc.updateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id, title: "Checkout fixed" }),
    ),
  );
  await waitFor(() =>
    expect(store.get(issueDetailAtom)?.card.title).toBe("Checkout fixed"),
  );
});
