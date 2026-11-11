import type { TimelineSeqRange } from "./timeline-repository";

export function seqRangeClause(column: string, range: TimelineSeqRange) {
  return {
    sql: `${column} >= COALESCE(?, ${column}) AND ${column} < COALESCE(?, ${column} + 1)`,
    params: [range.fromSeq, range.beforeSeq] as const,
  };
}
