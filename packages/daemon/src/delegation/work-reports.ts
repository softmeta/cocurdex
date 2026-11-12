import type { RoutineReport } from "@cocurdex/shared";

interface RecordedReport {
  runId: string | null;
  report: RoutineReport;
}

export class WorkReports {
  private readonly reports = new Map<string, RecordedReport>();

  record(sessionId: string, runId: string | null, report: RoutineReport) {
    this.reports.set(sessionId, { runId, report });
  }

  forRun(sessionId: string, runId: string): RoutineReport | null {
    const recorded = this.reports.get(sessionId);
    return recorded && recorded.runId === runId ? recorded.report : null;
  }

  forget(sessionId: string) {
    this.reports.delete(sessionId);
  }
}
