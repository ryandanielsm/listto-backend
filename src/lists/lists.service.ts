import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateListDto } from './dto/create-list.dto.js';
import { UpdateListDto } from './dto/update-list.dto.js';

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateListDto) {
    return this.prisma.shoppingList.create({
      data: {
        nome: dto.nome,
        usuarioId: userId,
      },
      include: {
        itens: true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.shoppingList.findMany({
      where: {
        usuarioId: userId,
        status: 'ativa',
      },
      orderBy: {
        criadoEm: 'desc',
      },
      include: {
        itens: {
          orderBy: {
            nome: 'asc',
          },
        },
      },
    });
  }

  async findHistory(userId: string) {
    return this.prisma.shoppingList.findMany({
      where: {
        usuarioId: userId,
        status: 'finalizada',
      },
      orderBy: {
        finalizadoEm: 'desc',
      },
      include: {
        itens: {
          orderBy: {
            nome: 'asc',
          },
        },
      },
    });
  }

  async findOne(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({
      where: {
        id: listId,
        usuarioId: userId,
      },
      include: {
        itens: {
          orderBy: {
            nome: 'asc',
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Lista não encontrada ou sem permissão de acesso.');
    }

    return list;
  }

  async update(userId: string, listId: string, dto: UpdateListDto) {
    await this.findOne(userId, listId);

    return this.prisma.shoppingList.update({
      where: {
        id: listId,
      },
      data: {
        ...(dto.nome && { nome: dto.nome }),
      },
      include: {
        itens: true,
      },
    });
  }

  async remove(userId: string, listId: string) {
    await this.findOne(userId, listId);

    return this.prisma.shoppingList.delete({
      where: {
        id: listId,
      },
    });
  }

  async complete(userId: string, listId: string) {
    await this.findOne(userId, listId);

    return this.prisma.shoppingList.update({
      where: {
        id: listId,
      },
      data: {
        status: 'finalizada',
        finalizadoEm: new Date(),
      },
      include: {
        itens: true,
      },
    });
  }
}
