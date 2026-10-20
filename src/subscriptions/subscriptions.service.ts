import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) { }

  async getStatus(userId: string, paymentId?: string) {
    let activeSub = await this.prisma.subscription.findFirst({
      where: {
        usuarioId: userId,
        status: 'ativa',
      },
      orderBy: {
        inicio: 'desc',
      },
    });

    // Se ainda não estiver ativo no banco, mas temos um paymentId em polling,
    // consultamos diretamente o Mercado Pago para ativação instantânea (mesmo sem webhook configurado no localhost)
    if (!activeSub && paymentId) {
      try {
        const mpAccessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (mpAccessToken) {
          const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${mpAccessToken}` },
          });
          if (res.ok) {
            const payment = await res.json();
            if (payment?.status === 'approved') {
              const planoEscolhido = payment?.metadata?.plano || 'Plano Mensal';
              this.logger.log(`Pagamento Pix #${paymentId} aprovado no Mercado Pago (${planoEscolhido})! Ativando assinatura do usuário ${userId}`);
              const activated = await this.activateSubscription(userId, planoEscolhido);
              activeSub = activated.subscription;
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Erro ao consultar status do pagamento ${paymentId} no Mercado Pago:`, err);
      }
    }

    if (activeSub) {
      return {
        isPremium: true,
        isAssinante: true,
        plano: activeSub.plano,
        status: activeSub.status,
        inicio: activeSub.inicio,
        proximaCobranca: activeSub.proximaCobranca,
      };
    }

    return {
      isPremium: false,
      isAssinante: false,
      plano: 'Plano Gratuito',
      status: 'ativo',
    };
  }

  async createPixPayment(
    userId?: string,
    userEmail?: string,
    userName?: string,
    planoEscolhido: string = 'mensal',
  ) {
    const mpAccessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;

    const isAnual = planoEscolhido?.toLowerCase()?.includes('anual') || planoEscolhido === '1 year';
    const valor = isAnual ? 59.90 : 6.90;
    const planoNome = isAnual ? 'Plano Anual' : 'Plano Mensal';
    const periodo = isAnual ? '1 year' : '1 month';
    const description = isAnual
      ? 'Assinatura Listto - Plano Anual (1 Ano)'
      : 'Assinatura Listto - Plano Mensal (1 Mês)';

    const names = (userName || 'Cliente Listto').trim().split(' ');
    const firstName = names[0] || 'Cliente';
    const lastName = names.slice(1).join(' ') || 'Listto';
    const email = userEmail || 'contato@listto.app';
    const notificationUrl = process.env.MP_WEBHOOK_URL || (process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/subscriptions/webhook` : undefined);

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${userId || 'anon'}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description,
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
        },
        metadata: {
          user_id: userId,
          plano: planoNome,
          periodo,
        },
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Erro ao criar pagamento no Mercado Pago: ${JSON.stringify(data)}`);
      throw new Error(data?.message || 'Falha ao comunicar com a API do Mercado Pago');
    }

    const txData = data?.point_of_interaction?.transaction_data;

    return {
      qr_code: txData?.qr_code,
      qr_code_base64: txData?.qr_code_base64,
      // Propriedades complementares para compatibilidade total com o frontend
      sucesso: true,
      qrCode: txData?.qr_code,
      qrCodeBase64: txData?.qr_code_base64,
      paymentId: data?.id,
      valor,
      plano: planoNome,
      periodo,
      expiracaoEmMinutos: 15,
    };
  }

  async activateSubscription(userId: string, plano: string = 'Plano Mensal') {
    const isAnual = plano?.toLowerCase()?.includes('anual') || plano === '1 year';
    const planoFinal = isAnual ? 'Plano Anual' : 'Plano Mensal';
    const agora = new Date();
    const proximaCobranca = new Date(agora);

    if (isAnual) {
      proximaCobranca.setFullYear(proximaCobranca.getFullYear() + 1);
    } else {
      proximaCobranca.setMonth(proximaCobranca.getMonth() + 1);
    }

    // Desativa assinaturas antigas se existirem
    await this.prisma.subscription.updateMany({
      where: { usuarioId: userId },
      data: { status: 'substituida' },
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        usuarioId: userId,
        plano: planoFinal,
        status: 'ativa',
        inicio: agora,
        proximaCobranca,
      },
    });

    return {
      sucesso: true,
      isPremium: true,
      isAssinante: true,
      plano: subscription.plano,
      periodo: isAnual ? '1 year' : '1 month',
      status: subscription.status,
      subscription,
    };
  }

  async cancelSubscription(userId: string) {
    // Atualiza qualquer assinatura ativa do usuário para 'cancelada'
    const result = await this.prisma.subscription.updateMany({
      where: {
        usuarioId: userId,
        status: 'ativa',
      },
      data: {
        status: 'cancelada',
      },
    });

    this.logger.log(`Assinatura cancelada para o usuário ${userId}. Total alterado: ${result.count}`);

    return {
      sucesso: true,
      isPremium: false,
      isAssinante: false,
      plano: 'Plano Gratuito',
      status: 'cancelado',
      message: 'Sua assinatura foi cancelada com sucesso. Você retornou ao Plano Gratuito.',
    };
  }

  async handleWebhook(data: any) {
    this.logger.log(`Webhook Mercado Pago recebido: ${JSON.stringify(data)}`);
    const paymentId =
      data?.data?.id ||
      data?.id ||
      data?.['data.id'] ||
      (typeof data?.resource === 'string' ? data.resource.split('/').pop() : null);
    const mpAccessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (paymentId && mpAccessToken) {
      try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });
        const payment = await res.json();
        if (payment?.status === 'approved') {
          const userId = payment?.metadata?.user_id;
          const planoDoPagamento = payment?.metadata?.plano || 'Plano Mensal';
          if (userId) {
            await this.activateSubscription(userId, planoDoPagamento);
            this.logger.log(`Assinatura (${planoDoPagamento}) ativada com sucesso para o usuário ${userId}`);
          }
        }
      } catch (err) {
        this.logger.error('Erro ao verificar pagamento do webhook:', err);
      }
    }

    return { status: 'received' };
  }
}
