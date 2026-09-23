import type { AgentPermissionRequestRecord } from "@cocurdex/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionCard } from "@/features/agent/permission/permission-card";

const command =
  'git diff --stat && echo "===" && echo "STAGED ONLY, NOT IN UNSTAGED"';

const permission = {
  id: "permission-1",
  sessionId: "session-1",
  providerId: "grok-build",
  kind: "execute",
  title: "Execute command",
  description: null,
  rawInput: {
    input: {
      command,
    },
  },
  locations: [],
  options: [
    {
      id: "reject-always",
      kind: "reject_always",
      label: "Reject always",
      labelSource: "generic",
    },
    {
      id: "allow-once",
      kind: "allow_once",
      label: "Allow once",
      labelSource: "generic",
    },
  ],
  status: "pending",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
} satisfies AgentPermissionRequestRecord;

const scopedPermission = {
  ...permission,
  providerId: "devin",
  options: [
    {
      id: "allow-session",
      kind: "allow_always",
      label: "Yes, allow `devin` commands (this session)",
      labelSource: "provider",
    },
    {
      id: "allow-project",
      kind: "allow_always",
      label: "Yes, always allow `devin` commands in `cocurdex`",
      labelSource: "provider",
    },
    {
      id: "allow-all-projects",
      kind: "allow_always",
      label: "Yes, always allow `devin` commands in all projects",
      labelSource: "provider",
    },
    {
      id: "reject-once",
      kind: "reject_once",
      label: "Reject",
      labelSource: "provider",
    },
  ],
  status: "pending",
} satisfies AgentPermissionRequestRecord;

const pathPermission = {
  ...permission,
  title: "Requested read access to /Users/richard/Documents",
  rawInput: {
    input: {
      path: "/Users/richard/Documents",
    },
  },
} satisfies AgentPermissionRequestRecord;

describe("PermissionCard", () => {
  it("renders only the permission choices offered by the agent", () => {
    const onResolve = vi.fn();

    render(<PermissionCard onResolve={onResolve} permission={permission} />);

    expect(
      screen.queryByRole("button", { name: "Always allow" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject always" }));

    expect(onResolve).toHaveBeenCalledWith(permission.id, "reject-always");
  });

  it("keeps same-kind provider choices distinguishable and resolves the chosen one", async () => {
    const onResolve = vi.fn();

    render(
      <PermissionCard onResolve={onResolve} permission={scopedPermission} />,
    );

    // Multiple allow choices collapse into a select; only the default
    // choice stays visible on the trigger.
    expect(
      screen.queryByRole("button", {
        name: "Yes, always allow `devin` commands in `cocurdex`",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Yes, always allow `devin` commands in all projects",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Yes, allow `devin` commands (this session)",
      }),
    );

    const option = await screen.findByRole("option", {
      name: "Yes, always allow `devin` commands in all projects",
    });
    // Base UI only commits mouse selection when the press started on the item.
    fireEvent.pointerDown(option);
    fireEvent.click(option);

    expect(onResolve).toHaveBeenCalledWith(
      scopedPermission.id,
      "allow-all-projects",
    );
  });

  it("hides detail rows already covered by the request summary", () => {
    render(<PermissionCard permission={pathPermission} />);

    expect(
      screen.getByText("Requested read access to /Users/richard/Documents"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Path")).not.toBeInTheDocument();
  });

  it("keeps detail rows that add information beyond the summary", () => {
    render(<PermissionCard permission={permission} />);

    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText(command)).toBeInTheDocument();
  });
});
