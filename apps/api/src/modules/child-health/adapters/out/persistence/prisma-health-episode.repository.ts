import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { HealthEpisodeRepository } from '../../../application/ports/out/health-episode.repository.js';
import { HealthEpisode } from '../../../domain/health-episode.js';

// `date` columns come back as UTC midnight; the domain works with calendar dates.
const toDateColumn = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDateColumn = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class PrismaHealthEpisodeRepository implements HealthEpisodeRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async findOpen(childId: string): Promise<HealthEpisode | null> {
    const row = await this.txHost.tx.healthEpisode.findFirst({
      where: { childId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.status === 'normal') return null;
    return HealthEpisode.restore({
      id: row.id,
      childId: row.childId,
      status: row.status,
      symptoms: row.symptoms,
      startDate: fromDateColumn(row.startDate),
      expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
    });
  }

  async save(episode: HealthEpisode): Promise<void> {
    const data = {
      status: episode.status,
      symptoms: episode.symptoms,
      startDate: toDateColumn(episode.startDate),
      expectedEndDate: episode.expectedEndDate ? toDateColumn(episode.expectedEndDate) : null,
      endedAt: episode.endedAt,
    };
    await this.txHost.tx.healthEpisode.upsert({
      where: { id: episode.id },
      create: { id: episode.id, childId: episode.childId, createdAt: episode.createdAt, ...data },
      update: data,
    });
  }
}
