import type { CustomDish } from '../../../domain/custom-dish.js';

export const CUSTOM_DISH_REPOSITORY = Symbol('CUSTOM_DISH_REPOSITORY');

/** Parents' own dishes ("Món của bạn"), one child at a time (BR-80). */
export interface CustomDishRepository {
  /** Every dish of the child, deleted ones included (they still name past meals). */
  listForChild(childId: string): Promise<CustomDish[]>;
  create(dish: CustomDish, createdBy: string): Promise<void>;
  update(dish: CustomDish): Promise<void>;
  archive(dishId: string, at: Date): Promise<void>;
}
