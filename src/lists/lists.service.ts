import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
        status: 'ativa',
        OR: [
          { usuarioId: userId },
          { participantes: { some: { usuarioId: userId } } },
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
  }

  async findHistory(userId: string) {
    return this.prisma.shoppingList.findMany({
      where: {
        status: 'finalizada',
        OR: [
          { usuarioId: userId },
          { participantes: { some: { usuarioId: userId } } },
        ],
      },
      orderBy: {
        finalizadoEm: 'desc',
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
  }

  async findOne(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({
      where: {
        id: listId,
        OR: [
          { usuarioId: userId },
          { participantes: { some: { usuarioId: userId } } },
        ],
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
    const list = await this.findOne(userId, listId);

    if (list.usuarioId === userId) {
      return this.prisma.shoppingList.delete({
        where: {
          id: listId,
        },
      });
    } else {
      // Se for participante, sai da lista removendo seu vínculo
      return this.prisma.listMember.deleteMany({
        where: {
          listaId: listId,
          usuarioId: userId,
        },
      });
    }
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

  async joinList(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findUnique({
      where: { id: listId },
      include: { usuario: true },
    });

    if (!list) {
      throw new NotFoundException('Lista não encontrada.');
    }

    if (list.usuarioId === userId) {
      return {
        sucesso: true,
        mensagem: 'Você é o criador desta lista.',
        isOwner: true,
      };
    }

    // Garante que o usuário existe em public.users para não violar FK
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      const authUser: any = await this.prisma.$queryRawUnsafe(
        `SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid LIMIT 1`,
        userId,
      );
      if (authUser && authUser[0]) {
        const row = authUser[0];
        const meta = row.raw_user_meta_data || {};
        await this.prisma.user.create({
          data: {
            id: userId,
            email: row.email,
            nome: meta.nome || meta.name || row.email?.split('@')[0] || 'Usuário',
            telefone: meta.telefone || meta.phone || null,
            foto: meta.foto || meta.avatar || 'icone13',
          },
        });
      }
    }

    const member = await this.prisma.listMember.upsert({
      where: {
        listaId_usuarioId: {
          listaId: listId,
          usuarioId: userId,
        },
      },
      update: {
        status: 'aceito',
      },
      create: {
        listaId: listId,
        usuarioId: userId,
        status: 'aceito',
      },
    });

    return {
      sucesso: true,
      mensagem: 'Você entrou na lista com sucesso!',
      isOwner: false,
      member,
    };
  }

  async getMembers(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({
      where: {
        id: listId,
        OR: [
          { usuarioId: userId },
          { participantes: { some: { usuarioId: userId } } },
        ],
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            foto: true,
          },
        },
        participantes: {
          include: {
            usuario: {
              select: {
                id: true,
                nome: true,
                email: true,
                foto: true,
              },
            },
          },
          orderBy: {
            criadoEm: 'asc',
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Lista não encontrada ou sem permissão de acesso.');
    }

    const isOwner = list.usuarioId === userId;

    const criador = {
      id: list.usuario.id,
      nome: list.usuario.nome,
      email: list.usuario.email,
      foto: list.usuario.foto,
      role: 'Criador',
      isCurrentUser: list.usuario.id === userId,
      canDelete: false,
    };

    const membros = list.participantes.map((p) => ({
      id: p.usuario.id,
      nome: p.usuario.nome,
      email: p.usuario.email,
      foto: p.usuario.foto,
      role: 'Participante',
      isCurrentUser: p.usuario.id === userId,
      status: p.status,
      // Apenas o dono pode excluir outros participantes
      canDelete: isOwner && p.usuario.id !== userId,
    }));

    return {
      isOwner,
      membros: [criador, ...membros],
    };
  }

  async removeMember(userId: string, listId: string, memberUserId: string) {
    const list = await this.prisma.shoppingList.findUnique({
      where: { id: listId },
    });

    if (!list) {
      throw new NotFoundException('Lista não encontrada.');
    }

    // Apenas o dono pode remover outros membros (ou o próprio usuário saindo)
    if (list.usuarioId !== userId && userId !== memberUserId) {
      throw new ForbiddenException('Apenas o criador da lista pode remover outros participantes.');
    }

    await this.prisma.listMember.deleteMany({
      where: {
        listaId: listId,
        usuarioId: memberUserId,
      },
    });

    return {
      sucesso: true,
      mensagem: 'Participante removido da lista.',
    };
  }
}

