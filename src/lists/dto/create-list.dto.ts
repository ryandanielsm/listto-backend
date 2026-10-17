import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateListDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da lista é obrigatório' })
  nome: string;

  @IsString()
  @IsOptional()
  tipo?: string;
}
