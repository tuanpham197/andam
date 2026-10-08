import { Inject, Injectable } from '@nestjs/common';
import { ChildNotFoundError } from '../../domain/errors.js';
import { assertCan, type ChildAction, type MemberRole } from '../../domain/membership.js';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../ports/out/membership.repository.js';

/**
 * The one place that decides who may do what with a child (BR-73..75), checked on every request:
 * a member removed a second ago is refused at once. Exported for the other modules.
 */
@Injectable()
export class ChildAccessService {
  constructor(@Inject(MEMBERSHIP_REPOSITORY) private readonly members: MembershipRepository) {}

  roleOf(userId: string, childId: string): Promise<MemberRole | null> {
    return this.members.roleOf(childId, userId);
  }

  rolesOf(userId: string): Promise<Map<string, MemberRole>> {
    return this.members.rolesOf(userId);
  }

  /** Not a member: CHILD_NOT_FOUND (404, BR-74); a member without the right: OWNER_ONLY (403). */
  async require(userId: string, childId: string, action: ChildAction): Promise<MemberRole> {
    const role = await this.members.roleOf(childId, userId);
    if (!role) throw new ChildNotFoundError();
    assertCan(role, action);
    return role;
  }
}
