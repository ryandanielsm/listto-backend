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
import { ListsService } from './lists.service.js';
import { CreateListDto } from './dto/create-list.dto.js';
import { UpdateListDto } from './dto/update-list.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('lists')
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() createListDto: CreateListDto,
  ) {
    return this.listsService.create(userId, createListDto);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.listsService.findAll(userId);
  }

  @Get('history')
  findHistory(@CurrentUser('userId') userId: string) {
    return this.listsService.findHistory(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.listsService.findOne(userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() updateListDto: UpdateListDto,
  ) {
    return this.listsService.update(userId, id, updateListDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.listsService.remove(userId, id);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.listsService.complete(userId, id);
  }
}
