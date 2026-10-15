import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ItemsService } from './items.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('lists/:listId/items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Param('listId') listId: string,
    @Body() createItemDto: CreateItemDto,
  ) {
    return this.itemsService.create(userId, listId, createItemDto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('listId') listId: string,
  ) {
    return this.itemsService.findAll(userId, listId);
  }

  @Put(':itemId')
  update(
    @CurrentUser('userId') userId: string,
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.itemsService.update(userId, listId, itemId, updateItemDto);
  }

  @Delete(':itemId')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.remove(userId, listId, itemId);
  }

  @Patch(':itemId/purchased')
  togglePurchased(
    @CurrentUser('userId') userId: string,
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.togglePurchased(userId, listId, itemId);
  }
}
