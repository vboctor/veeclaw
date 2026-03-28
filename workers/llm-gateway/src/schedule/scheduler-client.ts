import type { ScheduleEntry, ScheduleCommand } from "@scaf/shared";

/**
 * Client for calling the scheduler worker via service binding.
 * The scheduler owns SCHEDULER_KV; the gateway never touches it directly.
 */
export class SchedulerClient {
  constructor(private fetcher: Fetcher) {}

  async list(): Promise<ScheduleEntry[]> {
    const res = await this.fetcher.fetch("https://internal/schedules");
    if (!res.ok) return [];
    return (await res.json()) as ScheduleEntry[];
  }

  async get(id: string): Promise<ScheduleEntry | null> {
    const res = await this.fetcher.fetch(`https://internal/schedules/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as ScheduleEntry;
  }

  async add(
    entry: Record<string, unknown>,
    nextRunIso?: string
  ): Promise<ScheduleEntry> {
    const res = await this.fetcher.fetch("https://internal/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, nextRunIso }),
    });
    return (await res.json()) as ScheduleEntry;
  }

  async update(
    id: string,
    updates: Record<string, unknown>
  ): Promise<ScheduleEntry | null> {
    const res = await this.fetcher.fetch(
      `https://internal/schedules/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as ScheduleEntry;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.fetcher.fetch(
      `https://internal/schedules/${id}`,
      { method: "DELETE" }
    );
    return res.status === 204;
  }
}
