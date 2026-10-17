import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida se a lista existe e se o usuário autenticado tem acesso (como dono ou participante convidado/aceito)
   */
  private async validateListAccess(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({
      where: {
        id: listId,
        OR: [
          { usuarioId: userId },
          { participantes: { some: { usuarioId: userId } } },
        ],
      },
    });

    if (!list) {
      throw new NotFoundException(
        'Lista de compras não encontrada ou sem permissão de acesso.',
      );
    }

    return list;
  }

  async create(userId: string, listId: string, dto: CreateItemDto) {
    await this.validateListAccess(userId, listId);

    return this.prisma.shoppingItem.create({
      data: {
        listaId: listId,
        nome: dto.nome,
        quantidade: dto.quantidade,
        unidade: dto.unidade,
        preco: dto.preco,
        categoria: dto.categoria,
      },
    });
  }

  async findAll(userId: string, listId: string) {
    await this.validateListAccess(userId, listId);

    return this.prisma.shoppingItem.findMany({
      where: {
        listaId: listId,
      },
      orderBy: {
        nome: 'asc',
      },
    });
  }

  async update(
    userId: string,
    listId: string,
    itemId: string,
    dto: UpdateItemDto,
  ) {
    await this.validateListAccess(userId, listId);

    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        listaId: listId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado nesta lista.');
    }

    return this.prisma.shoppingItem.update({
      where: {
        id: itemId,
      },
      data: dto,
    });
  }

  async remove(userId: string, listId: string, itemId: string) {
    await this.validateListAccess(userId, listId);

    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        listaId: listId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado nesta lista.');
    }

    return this.prisma.shoppingItem.delete({
      where: {
        id: itemId,
      },
    });
  }

  async togglePurchased(
    userId: string,
    listId: string,
    itemId: string,
    explicitComprado?: boolean,
  ) {
    await this.validateListAccess(userId, listId);

    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        listaId: listId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado nesta lista.');
    }

    const novoComprado =
      typeof explicitComprado === 'boolean' ? explicitComprado : !item.comprado;

    return this.prisma.shoppingItem.update({
      where: {
        id: itemId,
      },
      data: {
        comprado: novoComprado,
      },
    });
  }
}
