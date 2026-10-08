import { Inject, Injectable } from '@nestjs/common';
import { ChildProfileService } from '../../../../child-profile/application/use-cases/child-profile.service.js';
import { ChildNotFoundError } from '../../../../child-profile/domain/errors.js';
import type { ChildOwnership } from '../../../application/ports/out/child-ownership.port.js';

/** Anti-corruption layer over the child-profile module: who owns which child. */
@Injectable()
export class ChildProfileOwnershipAdapter implements ChildOwnership {
  constructor(@Inject(ChildProfileService) private readonly profiles: ChildProfileService) {}

  async nameOf(childId: string, userId: string): Promise<string | null> {
    try {
      return (await this.profiles.get(userId, childId)).name;
    } catch (error) {
      if (error instanceof ChildNotFoundError) return null;
      throw error;
    }
  }
}
