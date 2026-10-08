import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { UrgentEventRepository } from '../../../application/ports/out/urgent-event.repository.js';
import { UrgentEvent } from '../../../domain/urgent-event.js';

@Injectable()
export class PrismaUrgentEventRepository implements UrgentEventRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async add(event: UrgentEvent): Promise<void> {
    await this.txHost.tx.urgentEvent.create({
      data: {
        id: event.id,
        childId: event.childId,
        mealId: event.mealId,
        openedAt: event.openedAt,
        contactedMedicalAt: event.contactedMedicalAt,
        actorId: event.actorId,
      },
    });
  }

  async find(eventId: string): Promise<UrgentEvent | null> {
    const row = await this.txHost.tx.urgentEvent.findUnique({ where: { id: eventId } });
    return row && UrgentEvent.restore(row);
  }

  async save(event: UrgentEvent): Promise<void> {
    await this.txHost.tx.urgentEvent.update({
      where: { id: event.id },
      data: { contactedMedicalAt: event.contactedMedicalAt },
    });
  }
}
