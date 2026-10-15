import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';

export type MockPrismaClient = DeepMockProxy<PrismaClient>;

export const createPrismaMock = (): MockPrismaClient => {
  return mockDeep<PrismaClient>();
};
