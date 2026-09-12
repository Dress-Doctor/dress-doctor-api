import type { HistoryEntryLike } from '../service/history-label.service';

/**
 * The shapes the reference and catalogue screens both read.
 *
 * Both are the same idea — a short list of rows the rest of the platform
 * picks from, each switchable on and off, each with an audit trail — so they
 * count the same way and their trails render the same way. Declared here
 * rather than in either service so neither owns the other's shape.
 */

/** Rows counted per status — what a tab strip counts off. */
export type ReferenceStatusCounts = {
  all: number;
  active: number;
  inactive: number;
};

/** Headline figures for one tab, over that list's own filters. */
export type ReferenceKpis = {
  total: number;
  totalActive: number;
  totalInactive: number;
  byStatus: ReferenceStatusCounts;
};

/** One entry of the audit trail, flattened for a timeline to render. */
export type ReferenceHistoryEntry = HistoryEntryLike & {
  action: string;
  reason?: string;
  createdAt: Date;
};
