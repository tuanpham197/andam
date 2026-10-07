import { Test, type TestingModule } from '@nestjs/testing';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { ChildProfileModule } from '../../src/modules/child-profile/child-profile.module.js';
import {
  CHILD_REPOSITORY,
  type ChildRepository,
} from '../../src/modules/child-profile/application/ports/out/child.repository.js';
import {
  INGREDIENT_LOOKUP,
  type IngredientLookup,
} from '../../src/modules/child-profile/application/ports/out/ingredient-lookup.port.js';
import { Child } from '../../src/modules/child-profile/domain/child.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { insertUser, resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let children: ChildRepository;
let ingredients: IngredientLookup;
let owner: string;
let other: string;

const TODAY = '2026-09-24';
let n = 0;
const uuid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function na(userId = owner) {
  return Child.create(
    {
      id: uuid(),
      userId,
      name: 'Na',
      birthDate: '2026-01-12',
      isPremature: true,
      weeksEarly: 3,
      priorReaction: 'yes',
      priorReactionNote: 'mẩn đỏ với trứng',
      avoidAllergens: ['egg', 'fish'],
      avoidIngredients: [
        { ingredientId: 'ing_muop_dang', reason: 'dislike' },
        { ingredientId: 'ing_tom', reason: 'not_eat' },
      ],
    },
    TODAY,
    new Date(`2026-09-24T02:00:0${n % 10}Z`),
  );
}

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, ChildProfileModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  children = moduleRef.get(CHILD_REPOSITORY);
  ingredients = moduleRef.get(INGREDIENT_LOOKUP);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});

beforeEach(async () => {
  await prisma.child.deleteMany();
  await prisma.user.deleteMany();
  owner = (await insertUser(prisma)).id;
  other = (await insertUser(prisma)).id;
});

afterAll(() => moduleRef.close());

describe('PrismaChildRepository', () => {
  it('round-trips every field, keeping the birth date as a calendar date', async () => {
    const child = na();
    await children.create(child);
    const found = await children.findOwned(child.id, owner);
    expect(found).not.toBeNull();
    expect({
      name: found!.name,
      birthDate: found!.birthDate,
      isPremature: found!.isPremature,
      weeksEarly: found!.weeksEarly,
      stageOverride: found!.stageOverride,
      priorReaction: found!.priorReaction,
      priorReactionNote: found!.priorReactionNote,
      avoidAllergens: [...found!.avoidAllergens].sort(),
      avoidIngredients: [...found!.avoidIngredients].sort((a, b) =>
        a.ingredientId.localeCompare(b.ingredientId),
      ),
    }).toEqual({
      name: 'Na',
      birthDate: '2026-01-12',
      isPremature: true,
      weeksEarly: 3,
      stageOverride: null,
      priorReaction: 'yes',
      priorReactionNote: 'mẩn đỏ với trứng',
      avoidAllergens: ['egg', 'fish'],
      avoidIngredients: [
        { ingredientId: 'ing_muop_dang', reason: 'dislike' },
        { ingredientId: 'ing_tom', reason: 'not_eat' },
      ],
    });
    expect(found!.createdAt).toEqual(child.createdAt);
  });

  it('TC-CHD-013 hides a child from anyone but its owner', async () => {
    const child = na();
    await children.create(child);
    expect(await children.findOwned(child.id, other)).toBeNull();
    expect(await children.listOwned(other)).toEqual([]);
  });

  it('lists the owner’s children oldest first', async () => {
    const first = na();
    const second = na();
    await children.create(second);
    await children.create(first);
    expect((await children.listOwned(owner)).map((c) => c.id)).toEqual(
      [first, second]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => c.id),
    );
  });

  it('saves field changes and replaces the avoid lists', async () => {
    const child = na();
    await children.create(child);
    child.rename('Bin');
    child.changeBirth({ birthDate: '2025-12-01', isPremature: false, weeksEarly: 0 }, TODAY);
    child.setStageOverride(1, TODAY);
    child.replaceAvoidList(['peanut'], [{ ingredientId: 'ing_ca_rot', reason: 'not_eat' }]);
    await children.save(child);

    const found = await children.findOwned(child.id, owner);
    expect(found).toMatchObject({
      name: 'Bin',
      birthDate: '2025-12-01',
      stageOverride: 1,
      isPremature: false,
    });
    expect(found!.avoidAllergens).toEqual(['peanut']);
    expect(found!.avoidIngredients).toEqual([{ ingredientId: 'ing_ca_rot', reason: 'not_eat' }]);
  });

  it('deletes only the owner’s child', async () => {
    const child = na();
    await children.create(child);
    expect(await children.deleteOwned(child.id, other)).toBe(false);
    expect(await children.deleteOwned(child.id, owner)).toBe(true);
    expect(await children.deleteOwned(child.id, owner)).toBe(false);
    expect(await prisma.childAvoidIngredient.count()).toBe(0);
  });
});

describe('CatalogIngredientLookup', () => {
  it('resolves names through the catalog module', async () => {
    expect(await ingredients.findByIds(['ing_tom', 'ing_khong_co'])).toEqual([
      { id: 'ing_tom', name: 'Tôm' },
    ]);
  });
});
