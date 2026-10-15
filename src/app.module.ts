import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ListsModule } from './lists/lists.module.js';
import { ItemsModule } from './items/items.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ListsModule, ItemsModule, SubscriptionsModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
