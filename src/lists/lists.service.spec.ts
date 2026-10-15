import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ListsService } from './lists.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { createPrismaMock, MockPrismaClient } from '../../test/prisma.mock.js';

describe('ListsService', () => {
  let service: ListsService;
  let prisma: MockPrismaClient;

  const mockUserId = 'user-uuid-123';
  const mockOtherUserId = 'user-uuid-999';
  const mockListId = 'list-uuid-456';

  const mockShoppingList = {
    id: mockListId,
    usuarioId: mockUserId,
    nome: 'Compras do mês',
    status: 'ativa',
    criadoEm: new Date(),
    finalizadoEm: null,
    itens: [],
  };

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ListsService>(ListsService);
  });

  describe('create', () => {
    it('deve criar uma lista com sucesso vinculada ao usuarioId', async () => {
      const createDto = { nome: 'Compras do mês' };
      prisma.shoppingList.create.mockResolvedValue(mockShoppingList);

      const result = await service.create(mockUserId, createDto);

      expect(prisma.shoppingList.create).toHaveBeenCalledWith({
        data: {
          nome: createDto.nome,
          usuarioId: mockUserId,
        },
        include: {
          itens: true,
        },
      });
      expect(result).toEqual(mockShoppingList);
      expect(result.usuarioId).toBe(mockUserId);
    });
  });

  describe('findAll', () => {
    it('deve retornar as listas de um utilizador específico (próprias ou compartilhadas)', async () => {
      const mockLists = [mockShoppingList];
      prisma.shoppingList.findMany.mockResolvedValue(mockLists);

      const result = await service.findAll(mockUserId);

      expect(prisma.shoppingList.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ativa',
          OR: [
            { usuarioId: mockUserId },
            { participantes: { some: { usuarioId: mockUserId } } },
          ],
        },
        orderBy: {
          criadoEm: 'desc',
        },
        select: {
          id: true,
          nome: true,
          status: true,
          criadoEm: true,
          finalizadoEm: true,
          usuarioId: true,
          itens: {
            select: {
              id: true,
              preco: true,
              quantidade: true,
            },
          },
        },
      });
      expect(result).toEqual(mockLists);
      expect(result).toHaveLength(1);
    });
  });

  describe('Regras de Segurança (Multitenant)', () => {
    it('deve lançar NotFoundException ao tentar editar uma lista que não pertence ao utilizador', async () => {
      prisma.shoppingList.findFirst.mockResolvedValue(null);

      await expect(
        service.update(mockOtherUserId, mockListId, { nome: 'Nome Hackeado' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.shoppingList.update).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundException ao tentar apagar uma lista que não pertence ao utilizador', async () => {
      prisma.shoppingList.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(mockOtherUserId, mockListId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.shoppingList.delete).not.toHaveBeenCalled();
    });
  });
});
