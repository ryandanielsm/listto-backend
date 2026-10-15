import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export class UpdateProfileDto {
  nome?: string;
  email?: string;
  telefone?: string;
  foto?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Tenta buscar no auth.users caso ainda não tenha sincronizado no public.users
      const authUser: any = await this.prisma.$queryRawUnsafe(
        `SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid LIMIT 1`,
        userId,
      );

      if (authUser && authUser[0]) {
        const row = authUser[0];
        const meta = row.raw_user_meta_data || {};
        return {
          id: row.id,
          email: row.email,
          nome: meta.nome || meta.name || row.email?.split('@')[0] || 'Usuário',
          telefone: meta.telefone || meta.phone || '',
          foto: meta.foto || meta.avatar || 'icone13',
        };
      }

      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { nome, email, telefone, foto } = dto;
    this.logger.log(`Atualizando perfil do usuário ${userId}: ${JSON.stringify(dto)}`);

    // 1. Se o email foi alterado, verifica se já não existe outro usuário com o mesmo email
    if (email) {
      const emailLimpo = email.trim().toLowerCase();
      const existente = await this.prisma.user.findFirst({
        where: {
          email: emailLimpo,
          NOT: { id: userId },
        },
      });

      if (existente) {
        throw new BadRequestException('Este e-mail já está sendo utilizado por outra conta.');
      }
    }

    // 2. Atualiza no auth.users do Supabase (para alterar o e-mail e metadados no cadastro completo do usuário)
    try {
      if (email) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE auth.users 
           SET email = $1,
               email_change_confirm_status = 0,
               updated_at = now(),
               raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                 'nome', $2::text,
                 'name', $2::text,
                 'telefone', $3::text,
                 'phone', $3::text,
                 'foto', $4::text,
                 'avatar', $4::text
               )
           WHERE id = $5::uuid`,
          email.trim().toLowerCase(),
          nome ? nome.trim() : '',
          telefone ? telefone.trim() : '',
          foto || 'icone13',
          userId,
        );
      } else {
        await this.prisma.$executeRawUnsafe(
          `UPDATE auth.users 
           SET updated_at = now(),
               raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                 'nome', $1::text,
                 'name', $1::text,
                 'telefone', $2::text,
                 'phone', $2::text,
                 'foto', $3::text,
                 'avatar', $3::text
               )
           WHERE id = $4::uuid`,
          nome ? nome.trim() : '',
          telefone ? telefone.trim() : '',
          foto || 'icone13',
          userId,
        );
      }
    } catch (authErr) {
      this.logger.warn(`Aviso ao atualizar auth.users diretamente: ${authErr}`);
    }

    // 3. Atualiza no public.users (PostgreSQL da aplicação)
    const userAtualizado = await this.prisma.user.upsert({
      where: { id: userId },
      update: {
        ...(nome ? { nome: nome.trim() } : {}),
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(telefone !== undefined ? { telefone: telefone.trim() } : {}),
        ...(foto ? { foto } : {}),
      },
      create: {
        id: userId,
        nome: nome ? nome.trim() : 'Usuário',
        email: email ? email.trim().toLowerCase() : '',
        telefone: telefone ? telefone.trim() : null,
        foto: foto || 'icone13',
      },
    });

    return {
      sucesso: true,
      mensagem: 'Perfil atualizado com sucesso no Supabase e no banco de dados.',
      usuario: userAtualizado,
    };
  }

  async deleteAccount(userId: string) {
    this.logger.log(`Solicitação de exclusão definitiva da conta: ${userId}`);

    // 1. Deleta do banco de dados relacional public.users
    // (O Prisma/Postgres já tem onDelete: Cascade em listas, itens, participações e assinaturas)
    try {
      await this.prisma.user.deleteMany({
        where: { id: userId },
      });
    } catch (e) {
      this.logger.warn(`Aviso ao deletar de public.users: ${e}`);
    }

    // 2. Deleta definitivamente do auth.users do Supabase
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM auth.users WHERE id = $1::uuid`,
        userId,
      );
    } catch (e) {
      this.logger.warn(`Aviso ao deletar de auth.users: ${e}`);
    }

    return {
      sucesso: true,
      mensagem: 'Conta e todos os dados vinculados foram excluídos permanentemente.',
    };
  }
}
