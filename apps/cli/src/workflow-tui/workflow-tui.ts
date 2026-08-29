import type { WorkflowAggregate } from "@cocurdex/shared";
import {
  type Component,
  ProcessTerminal,
  TuiAltScreen,
} from "@earendil-works/pi-tui";
import { projectWorkflowTui, type WorkflowTuiView } from "./workflow-tui-model";
import {
  renderWorkflowTui,
  type WorkflowTuiConfirmation,
} from "./workflow-tui-renderer";

const POLL_INTERVAL_MS = 750;

export interface WorkflowTuiController {
  get(): Promise<WorkflowAggregate | null>;
  start(): Promise<WorkflowAggregate>;
  decideGate(
    stepId: string,
    decision: "approved" | "rejected",
  ): Promise<WorkflowAggregate>;
  cancel(): Promise<WorkflowAggregate>;
}

export async function runWorkflowTui(
  initialAggregate: WorkflowAggregate,
  controller: WorkflowTuiController,
) {
  const session = new WorkflowTuiSession(initialAggregate, controller);
  await session.run();
}

export function assertWorkflowTuiAvailable() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Workflow TUI requires an interactive terminal.");
  }
}

class WorkflowTuiSession {
  private view: WorkflowTuiView;
  private selectedStepIndex = 0;
  private followCurrentStep = true;
  private notice: string | null = null;
  private confirmation: WorkflowTuiConfirmation = null;
  private operationInFlight = false;
  private stopped = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private resolveRun: (() => void) | null = null;
  private readonly tui = new TuiAltScreen(new ProcessTerminal());
  private readonly screen: Component;

  constructor(
    initialAggregate: WorkflowAggregate,
    private readonly controller: WorkflowTuiController,
  ) {
    this.view = projectWorkflowTui(initialAggregate);
    this.screen = {
      invalidate() {},
      render: (width) =>
        renderWorkflowTui(this.view, {
          width,
          height: Math.max(1, this.tui.terminal.rows),
          selectedStepIndex: this.selectedStepIndex,
          notice: this.notice,
          confirmation: this.confirmation,
          busy: this.operationInFlight,
          color: !process.env.NO_COLOR,
        }),
    };
    this.tui.setLayoutRoot(this.screen);
    this.tui.addInputListener((data) => {
      this.handleInput(data);
      return { consume: true };
    });
    this.followCurrent();
  }

  async run() {
    assertWorkflowTuiAvailable();
    this.tui.start();
    process.once("SIGTERM", this.handleSignal);
    process.once("SIGHUP", this.handleSignal);
    try {
      this.render(true);
      this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
      await new Promise<void>((resolve) => {
        this.resolveRun = resolve;
      });
    } finally {
      if (this.pollTimer) clearInterval(this.pollTimer);
      process.off("SIGTERM", this.handleSignal);
      process.off("SIGHUP", this.handleSignal);
      this.tui.stop();
    }

    console.log(`Workflow ${this.view.runId}: ${this.view.status}`);
  }

  private readonly handleInput = (input: string) => {
    if (input === "q" || input === "\x03") {
      this.stop();
      return;
    }
    if (this.confirmation) {
      if (input === "y") void this.confirmAction();
      if (input === "n" || input === "\x1b") {
        this.confirmation = null;
        this.notice = "Action cancelled.";
        this.render();
      }
      return;
    }
    if (this.operationInFlight) return;

    if (input === "j" || input === "\x1b[B") {
      this.selectStep(1);
      return;
    }
    if (input === "k" || input === "\x1b[A") {
      this.selectStep(-1);
      return;
    }
    if (input === "f") {
      this.followCurrentStep = true;
      this.followCurrent();
      this.render();
      return;
    }
    if (input === "r") {
      void this.refresh(true);
      return;
    }
    if (input === "s" && this.view.actions.canStart) {
      void this.performAction("start");
      return;
    }
    if (input === "a" && this.view.actions.canApprove) {
      void this.performAction("approve");
      return;
    }
    if (input === "x" && this.view.actions.canReject) {
      this.confirmation = "reject";
      this.render();
      return;
    }
    if (input === "c" && this.view.actions.canCancel) {
      this.confirmation = "cancel";
      this.render();
    }
  };

  private readonly handleSignal = () => this.stop();

  private stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.resolveRun?.();
  }

  private selectStep(offset: number) {
    if (this.view.steps.length === 0) return;
    this.followCurrentStep = false;
    this.selectedStepIndex = Math.max(
      0,
      Math.min(this.view.steps.length - 1, this.selectedStepIndex + offset),
    );
    this.render();
  }

  private followCurrent() {
    if (!this.followCurrentStep) return;
    const currentIndex = this.view.steps.findIndex((step) => step.isCurrent);
    if (currentIndex >= 0) this.selectedStepIndex = currentIndex;
    this.selectedStepIndex = Math.min(
      this.selectedStepIndex,
      Math.max(0, this.view.steps.length - 1),
    );
  }

  private async refresh(manual = false) {
    if (this.operationInFlight || this.stopped) return;
    this.operationInFlight = true;
    if (manual) this.notice = "Refreshing...";
    this.render();
    try {
      const aggregate = await this.controller.get();
      if (!aggregate) {
        this.notice = "Workflow run no longer exists.";
        return;
      }
      const previousRevision = this.view.revision;
      this.updateAggregate(aggregate);
      this.notice =
        manual || aggregate.run.revision !== previousRevision
          ? `Updated to revision ${aggregate.run.revision}.`
          : null;
    } catch (error) {
      this.notice = errorMessage(error);
    } finally {
      this.operationInFlight = false;
      this.render();
    }
  }

  private async confirmAction() {
    const confirmation = this.confirmation;
    this.confirmation = null;
    if (confirmation === "reject") await this.performAction("reject");
    if (confirmation === "cancel") await this.performAction("cancel");
  }

  private async performAction(
    action: "start" | "approve" | "reject" | "cancel",
  ) {
    if (this.operationInFlight) return;
    this.operationInFlight = true;
    this.notice = `${action} in progress...`;
    this.render();
    try {
      let aggregate: WorkflowAggregate;
      if (action === "start") {
        aggregate = await this.controller.start();
      } else if (action === "cancel") {
        aggregate = await this.controller.cancel();
      } else {
        const stepId = this.view.currentStepId;
        if (!stepId) throw new Error("No current gate step is available.");
        aggregate = await this.controller.decideGate(
          stepId,
          action === "approve" ? "approved" : "rejected",
        );
      }
      this.updateAggregate(aggregate);
      this.notice = `${action} completed.`;
    } catch (error) {
      this.notice = errorMessage(error);
    } finally {
      this.operationInFlight = false;
      this.render();
    }
  }

  private updateAggregate(aggregate: WorkflowAggregate) {
    this.view = projectWorkflowTui(aggregate);
    this.followCurrent();
  }

  private render(force = false) {
    if (this.stopped) return;
    this.screen.invalidate();
    this.tui.requestRender(force);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown workflow TUI error.";
}
