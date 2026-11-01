import { computeMetrics, type MetricsSummary } from '../../domain/metrics.js';
import type { MetricsQuery } from '../dtos/index.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { Clock } from '../ports/services.js';

export class MetricsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async summary(query: MetricsQuery): Promise<MetricsSummary & { assigneeNames: Record<string, string> }> {
    const tickets = await this.uow.repos.tickets.findAll({ from: query.from, to: query.to });
    const ratings = await this.uow.repos.surveys.listRatings(tickets.map((t) => t.id));
    const metrics = computeMetrics(tickets, ratings, this.clock.now());
    const assigneeNames: Record<string, string> = {};
    for (const t of tickets) if (t.assigneeId && t.assigneeName) assigneeNames[t.assigneeId] = t.assigneeName;
    return { ...metrics, assigneeNames };
  }
}
