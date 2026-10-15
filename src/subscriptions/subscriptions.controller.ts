import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(
    @CurrentUser('userId') userId: string,
    @Query('paymentId') paymentId?: string,
  ) {
    return this.subscriptionsService.getStatus(userId, paymentId);
  }

  @Post('pix')
  @UseGuards(JwtAuthGuard)
  createPixPayment(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
    @CurrentUser('nome') nome: string,
  ) {
    return this.subscriptionsService.createPixPayment(userId, email, nome);
  }

  @Post('mercadopago-pix')
  createMercadoPagoPix() {
    return this.subscriptionsService.createPixPayment();
  }

  @Post('activate-test')
  @UseGuards(JwtAuthGuard)
  activateTestSubscription(
    @CurrentUser('userId') userId: string,
    @Body('plano') plano?: string,
  ) {
    return this.subscriptionsService.activateSubscription(userId, plano || 'Listto Premium');
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  cancelSubscription(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }

  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhookGet(@Query() query: any) {
    return this.subscriptionsService.handleWebhook(query);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() body: any, @Query() query: any) {
    return this.subscriptionsService.handleWebhook({ ...body, ...query });
  }
}
