export type ActivityHistoryRecord = {
  id: string;
  status: string;
  loanId: number | null;
  title: string;
  detail: string;
  actorName: string;
  actorRole: string;
  lenderId: number | null;
  lenderName: string;
  occurredAt: Date;
};

export function filterActivityHistory(records: ActivityHistoryRecord[], eventType: string, actorName: string, actorRole = "all", lenderId: number | null = null) {
  return records.filter((activity) => (eventType === "all" || activity.title === eventType) && (actorName === "all" || activity.actorName === actorName) && (actorRole === "all" || activity.actorRole === actorRole) && (lenderId === null || activity.lenderId === lenderId));
}

export function activityFilterOptions(records: ActivityHistoryRecord[]) {
  return {
    eventTypes: Array.from(new Set(records.map((activity) => activity.title))),
    actors: Array.from(new Set(records.map((activity) => activity.actorName))),
    roles: Array.from(new Set(records.map((activity) => activity.actorRole))),
    lenders: Array.from(new Map(records.filter((activity) => activity.lenderId !== null).map((activity) => [activity.lenderId!, { id: activity.lenderId!, name: activity.lenderName }])).values()),
  };
}

export function dailyActivityCounts(records: ActivityHistoryRecord[]) {
  const counts = new Map<string, number>();
  records.forEach((activity) => {
    const date = new Date(activity.occurredAt).toISOString().slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
  });
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((left, right) => left.date.localeCompare(right.date));
}
