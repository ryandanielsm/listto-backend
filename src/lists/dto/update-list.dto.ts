import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateListDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da lista não pode ser vazio' })
  @IsOptional()
  nome?: string;

  @IsString()
  @IsOptional()
  tipo?: string;
}
