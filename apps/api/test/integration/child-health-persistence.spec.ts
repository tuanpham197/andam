import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  CHILD_OWNERSHIP,
  type ChildOwnership,
} from '../../src/modules/child-health/application/ports/out/child-ownership.port.js';
import {
  HEALTH_EPISODE_REPOSITORY,
  type HealthEpisodeRepository,
} from '../../src/modules/child-health/application/ports/out/health-episode.repository.js';
import { ChildHealthModule } from '../../src/modules/child-health/child-health.module.js';
import { HealthEpisode } from '../../src/modules/child-health/domain/health-episode.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { insertUser, resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let episodes: HealthEpisodeRepository;
let ownership: ChildOwnership;
let ownerId: string;
let childId: string;

const NOW = new Date('2026-09-24T02:00:00Z');
const sick = (overrides: Partial<Parameters<typeof HealthEpisode.start>[0]> = {}) =>
  HealthEpisode.start(
    {
      id: randomUUID(),
      childId,
      status: 'sick',
      symptoms: ['fever', 'cough'],
      startDate: '2026-09-24',
      expectedEndDate: '2026-09-26',
      actorId: null,
      ...overrides,
    },
    '2026-09-24',
    NOW,
  );

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, ChildHealthModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  episodes = moduleRef.get(HEALTH_EPISODE_REPOSITORY);
  ownership = moduleRef.get(CHILD_OWNERSHIP);
  await resetDatabase(prisma);
});

beforeEach(async () => {
  await prisma.child.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await insertUser(prisma)).id;
  childId = randomUUID();
  await prisma.child.create({
    data: {
      id: childId,
      userId: ownerId,
      name: 'Na',
      birthDate: new Date('2026-01-12'),
      priorReaction: 'never',
    },
  });
  // P5b: access goes through membership, like a child created by the app.
  await prisma.childMember.create({
    data: { childId, userId: ownerId, role: 'owner', joinedAt: NOW },
  });
});

afterAll(() => moduleRef.close());

describe('PrismaHealthEpisodeRepository', () => {
  it('stores an episode and reads it back as the open one', async () => {
    const episode = sick();
    await episodes.save(episode);
    const open = await episodes.findOpen(childId);
    expect(open).toMatchObject({
      id: episode.id,
      status: 'sick',
      symptoms: ['fever', 'cough'],
      startDate: '2026-09-24',
      expectedEndDate: '2026-09-26',
      endedAt: null,
    });
    expect(open!.createdAt).toEqual(NOW);
  });

  it('updates an existing episode: an ended one is no longer open', async () => {
    const episode = sick({ expectedEndDate: null });
    await episodes.save(episode);
    expect((await episodes.findOpen(childId))!.expectedEndDate).toBeNull();
    episode.end(new Date('2026-09-25T00:00:00Z'));
    await episodes.save(episode);
    expect(await episodes.findOpen(childId)).toBeNull();
    expect(await prisma.healthEpisode.count()).toBe(1);
  });

  it('reads the latest open episode', async () => {
    await episodes.save(sick());
    const later = HealthEpisode.start(
      {
        id: randomUUID(),
        childId,
        status: 'recovering',
        symptoms: [],
        startDate: '2026-09-25',
        expectedEndDate: null,
        actorId: null,
      },
      '2026-09-25',
      new Date('2026-09-25T02:00:00Z'),
    );
    await episodes.save(later);
    expect((await episodes.findOpen(childId))!.id).toBe(later.id);
  });

  it('treats a stored "normal" row as no episode', async () => {
    await prisma.healthEpisode.create({
      data: { id: randomUUID(), childId, status: 'normal', startDate: new Date('2026-09-24') },
    });
    expect(await episodes.findOpen(childId)).toBeNull();
  });
});

describe('ChildProfileOwnershipAdapter', () => {
  it('names the owner’s child and hides it from anyone else', async () => {
    expect(await ownership.nameOf(childId, ownerId)).toBe('Na');
    expect(await ownership.nameOf(childId, randomUUID())).toBeNull();
  });
});
