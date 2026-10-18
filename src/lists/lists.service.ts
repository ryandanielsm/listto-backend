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
        tipo: dto.tipo || 'pessoal',
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
        tipo: true,
        parcial: true,
        criadoEm: true,
        finalizadoEm: true,
        usuarioId: true,
        itens: {
          select: {
            id: true,
            preco: true,
            quantidade: true,
            comprado: true,
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
        tipo: true,
        parcial: true,
        criadoEm: true,
        finalizadoEm: true,
        usuarioId: true,
        itens: {
          select: {
            id: true,
            preco: true,
            quantidade: true,
            comprado: true,
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
        ...(dto.tipo && { tipo: dto.tipo }),
      },
      include: {
        itens: true,
      },
    });
  }

  async remove(userId: string, listId: string) {
    const list = await this.findOne(userId, listId);

    if (list.usuarioId === userId) {
      // Exclui a lista ativa e em cascata itens e participantes
      await this.prisma.shoppingList.delete({
        where: {
          id: listId,
        },
      });

      // Também remove do histórico listas finalizadas com o mesmo nome pertencentes a este usuário
      await this.prisma.shoppingList.deleteMany({
        where: {
          usuarioId: userId,
          nome: list.nome,
          status: 'finalizada',
        },
      });

      return { sucesso: true, mensagem: 'Lista excluída com sucesso.' };
    } else {
      return this.leave(userId, listId);
    }
  }

  async leave(userId: string, listId: string) {
    const list = await this.findOne(userId, listId);

    if (list.usuarioId === userId) {
      // O usuário é o dono da lista
      const otherMembers = await this.prisma.listMember.findMany({
        where: { listaId: listId },
        orderBy: { criadoEm: 'asc' },
      });

      if (otherMembers.length > 0) {
        // Transfere a titularidade para o participante mais antigo
        const nextOwner = otherMembers[0];
        await this.prisma.shoppingList.update({
          where: { id: listId },
          data: { usuarioId: nextOwner.usuarioId },
        });

        await this.prisma.listMember.delete({
          where: { id: nextOwner.id },
        });

        // Transfere também histórico finalizado correspondente
        const historicalLists = await this.prisma.shoppingList.findMany({
          where: {
            usuarioId: userId,
            nome: list.nome,
            status: 'finalizada',
          },
        });

        for (const h of historicalLists) {
          await this.prisma.shoppingList.update({
            where: { id: h.id },
            data: { usuarioId: nextOwner.usuarioId },
          });
        }

        return { sucesso: true, mensagem: 'Você saiu da lista e a titularidade foi transferida.' };
      } else {
        // Não há outros participantes: exclui lista ativa e histórico correspondente
        await this.prisma.shoppingList.deleteMany({
          where: {
            OR: [
              { id: listId },
              { usuarioId: userId, nome: list.nome, status: 'finalizada' },
            ],
          },
        });
        return { sucesso: true, mensagem: 'Você saiu da lista e ela foi removida.' };
      }
    } else {
      // Participante convidado saindo
      await this.prisma.listMember.deleteMany({
        where: {
          listaId: listId,
          usuarioId: userId,
        },
      });

      // Também remove dos registros no histórico dessa lista compartilhada
      const historicalLists = await this.prisma.shoppingList.findMany({
        where: {
          nome: list.nome,
          status: 'finalizada',
          participantes: { some: { usuarioId: userId } },
        },
        select: { id: true },
      });

      if (historicalLists.length > 0) {
        await this.prisma.listMember.deleteMany({
          where: {
            listaId: { in: historicalLists.map((h) => h.id) },
            usuarioId: userId,
          },
        });
      }

      return { sucesso: true, mensagem: 'Você saiu da lista e do histórico com sucesso.' };
    }
  }

  /**
   * Finalização Total:
   * Se já existir uma lista em histórico que era parcial para este mesmo nome de lista e usuário,
   * move todos os itens restantes da lista ativa para essa lista de histórico, remove o status 'parcial'
   * (consolidando todos os itens em uma única lista finalizada) e remove a lista ativa.
   * Se não houver histórico parcial anterior, finaliza a lista normalmente.
   */
  async complete(userId: string, listId: string) {
    const originalList = await this.findOne(userId, listId);

    return this.prisma.$transaction(async (tx) => {
      // Procura se existe histórico parcial correspondente
      const existingPartialList = await tx.shoppingList.findFirst({
        where: {
          usuarioId: originalList.usuarioId,
          nome: originalList.nome,
          status: 'finalizada',
          parcial: true,
        },
        orderBy: {
          criadoEm: 'desc',
        },
      });

      if (existingPartialList) {
        // Move todos os itens da lista ativa para a lista do histórico consolidada
        await tx.shoppingItem.updateMany({
          where: {
            listaId: listId,
          },
          data: {
            listaId: existingPartialList.id,
            comprado: true,
          },
        });

        // Atualiza a lista do histórico: não é mais parcial (agora está completa com todos os itens)
        const updatedCompletedList = await tx.shoppingList.update({
          where: {
            id: existingPartialList.id,
          },
          data: {
            parcial: false,
            finalizadoEm: new Date(),
          },
          include: {
            itens: true,
          },
        });

        // Remove a lista ativa original (já integrada ao histórico)
        await tx.shoppingList.delete({
          where: {
            id: listId,
          },
        });

        return updatedCompletedList;
      }

      // Finalização normal direta
      await tx.shoppingItem.updateMany({
        where: {
          listaId: listId,
        },
        data: {
          comprado: true,
        },
      });

      return tx.shoppingList.update({
        where: {
          id: listId,
        },
        data: {
          status: 'finalizada',
          parcial: false,
          finalizadoEm: new Date(),
        },
        include: {
          itens: true,
        },
      });
    });
  }

  /**
   * Finalização Parcial:
   * 1. Se já existir uma lista parcial no histórico, reaproveita a mesma acumulando os itens.
   * 2. Se não existir, cria a cópia inicial no histórico com status = 'finalizada' e parcial = true.
   * 3. Move APENAS os itens marcado como comprado = true para o histórico.
   * 4. Mantém na lista original ativa apenas os itens com comprado = false.
   */
  async partialComplete(userId: string, listId: string, itemIds?: string[]) {
    const originalList = await this.findOne(userId, listId);

    // Determina quais itens foram comprados (prioriza os IDs enviados pelo frontend)
    let targetItemIds: string[] = [];
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      const existingIds = new Set((originalList.itens || []).map((i) => i.id));
      targetItemIds = itemIds.filter((id) => existingIds.has(id));
    } else {
      targetItemIds = (originalList.itens || [])
        .filter((item) => item.comprado)
        .map((item) => item.id);
    }

    if (targetItemIds.length === 0) {
      throw new ForbiddenException('Nenhum item marcado como comprado para realizar finalização parcial.');
    }

    // Se todos os itens da lista foram marcados, executa finalização total automaticamente
    if (
      originalList.itens &&
      originalList.itens.length > 0 &&
      targetItemIds.length >= originalList.itens.length
    ) {
      return this.complete(userId, listId);
    }

    return this.prisma.$transaction(async (tx) => {
      // Garante que os itens selecionados estão marcados como comprado = true no banco
      await tx.shoppingItem.updateMany({
        where: {
          id: { in: targetItemIds },
          listaId: listId,
        },
        data: {
          comprado: true,
        },
      });

      // 1. Procura se já existe uma lista no histórico com parcial = true para acumular
      let targetCompletedList = await tx.shoppingList.findFirst({
        where: {
          usuarioId: originalList.usuarioId,
          nome: originalList.nome,
          status: 'finalizada',
          parcial: true,
        },
        orderBy: {
          criadoEm: 'desc',
        },
      });

      // Se ainda não existir lista parcial no histórico, cria a cópia inicial
      if (!targetCompletedList) {
        targetCompletedList = await tx.shoppingList.create({
          data: {
            nome: originalList.nome,
            usuarioId: originalList.usuarioId,
            tipo: originalList.tipo,
            status: 'finalizada',
            parcial: true,
            finalizadoEm: new Date(),
          },
        });

        // Replica participantes para histórico compartilhado
        const participantes = await tx.listMember.findMany({
          where: { listaId: listId },
        });
        if (participantes.length > 0) {
          await tx.listMember.createMany({
            data: participantes.map((p) => ({
              listaId: targetCompletedList!.id,
              usuarioId: p.usuarioId,
              status: p.status,
            })),
          });
        }
      } else {
        // Atualiza a data da última ida/finalização parcial
        await tx.shoppingList.update({
          where: { id: targetCompletedList.id },
          data: {
            finalizadoEm: new Date(),
          },
        });
      }

      // Move APENAS os itens marcados para a cópia no histórico
      await tx.shoppingItem.updateMany({
        where: {
          id: { in: targetItemIds },
          listaId: listId,
        },
        data: {
          listaId: targetCompletedList.id,
          comprado: true,
        },
      });

      return tx.shoppingList.findUnique({
        where: { id: targetCompletedList.id },
        include: { itens: true },
      });
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
