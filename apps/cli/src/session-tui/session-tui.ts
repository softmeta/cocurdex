import type {
  AgentEvent,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  MessageRecord,
  SessionObservationSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import {
  Editor,
  ProcessTerminal,
  ScrollView,
  Text,
  TuiAltScreen,
  VStack,
} from "@earendil-works/pi-tui";
import { applySessionEvent, createSessionTuiState } from "./session-tui-model";
import {
  renderSessionFooter,
  renderSessionHeader,
  renderSessionTranscript,
  sessionEditorTheme,
  sessionTuiStyles,
} from "./session-tui-renderer";

export interface SessionTuiSubscription {
  close(): void;
}

export interface SessionTuiController {
  getSnapshot(): Promise<SessionObservationSnapshot | null>;
  subscribe(
    onEvent: (event: AgentEvent) => void,
    onDisconnect: (error?: Error) => void,
  ): Promise<SessionTuiSubscription>;
  send(
    session: SessionRecord,
    content: string,
    delivery: "start-new-run" | "queue-after-run",
  ): Promise<MessageRecord>;
  stop(): Promise<void>;
  resolvePermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<void>;
  answerQuestion(questionId: string, answer: string): Promise<void>;
  resolvePlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<void>;
}

export function assertSessionTuiAvailable() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Session TUI requires an interactive terminal.");
  }
}

export async function runSessionTui(
  sessionId: string,
  controller: SessionTuiController,
) {
  assertSessionTuiAvailable();
  const pendingEvents: AgentEvent[] = [];
  let app: SessionTuiApp | null = null;
  const subscription = await controller.subscribe(
    (event) => {
      if (event.sessionId !== sessionId) return;
      if (app) {
        app.applyEvent(event);
      } else {
        pendingEvents.push(event);
      }
    },
    (error) => app?.setDisconnected(error),
  );

  try {
    const snapshot = await controller.getSnapshot();
    if (!snapshot) {
      throw new Error("Session not found");
    }
    app = new SessionTuiApp(snapshot, controller);
    for (const event of pendingEvents) {
      app.applyEvent(event);
    }
    await app.run();
  } finally {
    subscription.close();
  }
}

class SessionTuiApp {
  private state;
  private readonly tui = new TuiAltScreen(
    new ProcessTerminal(),
    true,
    undefined,
    {
      mouse: true,
    },
  );
  private readonly header = new Text();
  private readonly transcript = new Text("", 1, 0);
  private readonly notice = new Text();
  private readonly footer = new Text();
  private readonly editor = new Editor(this.tui, sessionEditorTheme, {
    paddingX: 1,
  });
  private operationInFlight = false;
  private disconnected = false;
  private resolveRun: (() => void) | null = null;
  private stopped = false;

  constructor(
    snapshot: SessionObservationSnapshot,
    private readonly controller: SessionTuiController,
  ) {
    this.state = createSessionTuiState(snapshot);
    const scrollView = new ScrollView(this.transcript, {
      follow: "end",
      primary: true,
      scrollbar: "auto",
      scrollbarStyle: sessionTuiStyles.dim,
    });
    const root = new VStack(
      [
        { component: this.header, basis: "auto", minSize: 1 },
        { component: scrollView, basis: 0, grow: 1, minSize: 1 },
        { component: this.notice, basis: "auto" },
        { component: this.editor, basis: "auto", minSize: 1 },
        { component: this.footer, basis: "auto", minSize: 1 },
      ],
      { gap: 1 },
    );
    this.editor.onSubmit = (text) => {
      const value = text.trim();
      if (!value || this.operationInFlight) return;
      this.editor.setText("");
      void this.submit(value);
    };
    this.tui.setLayoutRoot(root);
    this.tui.setFocus(this.editor);
    this.tui.addInputListener((data) => {
      if (data !== "\x03") return undefined;
      if (this.state.session.status === "running") {
        void this.perform("Stopping turn", () => this.controller.stop());
      } else {
        this.stop();
      }
      return { consume: true };
    });
    this.render();
  }

  async run() {
    this.tui.start();
    try {
      await new Promise<void>((resolve) => {
        this.resolveRun = resolve;
      });
    } finally {
      this.tui.stop();
    }
    console.log(
      `Session ${this.state.session.id}: ${this.state.session.status}`,
    );
  }

  applyEvent(event: AgentEvent) {
    this.state = applySessionEvent(this.state, event);
    this.render();
  }

  setDisconnected(error?: Error) {
    this.disconnected = true;
    this.notice.setText(
      sessionTuiStyles.red(
        `Daemon event stream disconnected${error ? `: ${error.message}` : "."}`,
      ),
    );
    this.render();
  }

  private async submit(input: string) {
    if (input === "/quit" || input === "/exit") {
      this.stop();
      return;
    }
    if (input === "/stop") {
      await this.perform("Stopping turn", () => this.controller.stop());
      return;
    }
    if (await this.handleInteractionCommand(input)) return;
    if (input.startsWith("/")) {
      this.setNotice(`Unknown command: ${input}`);
      return;
    }

    const delivery =
      this.state.session.status === "running"
        ? "queue-after-run"
        : "start-new-run";
    await this.perform(
      delivery === "queue-after-run" ? "Queueing message" : "Sending message",
      async () => {
        const message = await this.controller.send(
          this.state.session,
          input,
          delivery,
        );
        this.state = {
          ...this.state,
          messages: upsertMessage(this.state.messages, message),
        };
      },
    );
  }

  private async handleInteractionCommand(input: string) {
    const permission = this.state.interactions.permissions[0];
    const permissionCommands: Record<string, AgentPermissionDecision> = {
      "/allow": "allow_once",
      "/always": "allow_always",
      "/deny": "reject_once",
      "/deny-always": "reject_always",
    };
    const permissionDecision = permissionCommands[input];
    if (permissionDecision) {
      if (!permission) {
        this.setNotice("No permission request is pending.");
        return true;
      }
      const offered = permission.options.some(
        (option) => option.kind === permissionDecision,
      );
      if (!offered) {
        this.setNotice("That decision is not offered by this agent.");
        return true;
      }
      await this.perform("Resolving permission", () =>
        this.controller.resolvePermission(permission.id, permissionDecision),
      );
      return true;
    }

    if (input.startsWith("/answer ")) {
      const question = this.state.interactions.questions[0];
      if (!question) {
        this.setNotice("No question is pending.");
        return true;
      }
      await this.perform("Answering question", () =>
        this.controller.answerQuestion(
          question.id,
          input.slice("/answer ".length).trim(),
        ),
      );
      return true;
    }

    const approval = this.state.interactions.planApprovals[0];
    if (input === "/approve") {
      if (!approval) {
        this.setNotice("No plan approval is pending.");
        return true;
      }
      await this.perform("Approving plan", () =>
        this.controller.resolvePlanApproval(approval.id, {
          outcome: "approved",
        }),
      );
      return true;
    }
    if (input === "/abandon") {
      if (!approval) {
        this.setNotice("No plan approval is pending.");
        return true;
      }
      await this.perform("Abandoning plan", () =>
        this.controller.resolvePlanApproval(approval.id, {
          outcome: "abandoned",
        }),
      );
      return true;
    }
    if (input.startsWith("/revise ")) {
      if (!approval) {
        this.setNotice("No plan approval is pending.");
        return true;
      }
      await this.perform("Returning plan feedback", () =>
        this.controller.resolvePlanApproval(approval.id, {
          outcome: "cancelled",
          feedback: input.slice("/revise ".length).trim(),
        }),
      );
      return true;
    }
    return false;
  }

  private async perform(label: string, operation: () => Promise<void>) {
    if (this.operationInFlight) return;
    this.operationInFlight = true;
    this.editor.disableSubmit = true;
    this.setNotice(`${label}...`);
    try {
      await operation();
      this.setNotice("");
    } catch (error) {
      this.setNotice(
        error instanceof Error ? error.message : `${label} failed.`,
      );
    } finally {
      this.operationInFlight = false;
      this.editor.disableSubmit = false;
      this.render();
    }
  }

  private setNotice(message: string) {
    this.notice.setText(message ? sessionTuiStyles.yellow(message) : "");
    this.tui.requestRender();
  }

  private stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.resolveRun?.();
  }

  private render() {
    this.header.setText(renderSessionHeader(this.state));
    this.transcript.setText(renderSessionTranscript(this.state));
    if (!this.operationInFlight && !this.disconnected) {
      this.notice.setText(
        this.state.lastError ? sessionTuiStyles.red(this.state.lastError) : "",
      );
    }
    this.footer.setText(renderSessionFooter(this.state));
    this.tui.requestRender();
  }
}

function upsertMessage(messages: MessageRecord[], message: MessageRecord) {
  const index = messages.findIndex((candidate) => candidate.id === message.id);
  if (index < 0) return [...messages, message];
  return messages.map((candidate, itemIndex) =>
    itemIndex === index ? message : candidate,
  );
}
