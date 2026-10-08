import { Inject, Injectable } from '@nestjs/common';
import { MembersService } from '../../../../child-profile/application/use-cases/members.service.js';
import type { AccountChildren } from '../../../application/ports/out/account-children.port.js';

/** Anti-corruption layer over the child-profile module's memberships (BR-76). */
@Injectable()
export class AccountChildrenAdapter implements AccountChildren {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  blockingDeletion(userId: string): Promise<{ id: string; name: string }[]> {
    return this.members.blockingAccountDeletion(userId);
  }

  leaveAll(userId: string): Promise<void> {
    return this.members.leaveAllAsCaregiver(userId);
  }
}
