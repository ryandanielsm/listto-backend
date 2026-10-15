import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, Min, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateItemDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do item não pode ser vazio' })
  @IsOptional()
  nome?: string;

  @IsNumber({}, { message: 'A quantidade deve ser um número' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @IsOptional()
  @Type(() => Number)
  quantidade?: number;

  @IsString()
  @IsNotEmpty({ message: 'A unidade não pode ser vazia' })
  @IsOptional()
  unidade?: string;

  @ValidateIf((o) => o.preco !== null && o.preco !== undefined && o.preco !== '')
  @IsNumber({}, { message: 'O preço deve ser um número' })
  @Min(0, { message: 'O preço não pode ser negativo' })
  @IsOptional()
  @Type(() => Number)
  preco?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'A categoria não pode ser vazia' })
  @IsOptional()
  categoria?: string;

  @IsBoolean()
  @IsOptional()
  comprado?: boolean;
}
