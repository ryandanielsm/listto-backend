import { IsNotEmpty, IsNumber, Min, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do item é obrigatório' })
  nome: string;

  @IsNumber({}, { message: 'A quantidade deve ser um número' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @Type(() => Number)
  quantidade: number;

  @IsString()
  @IsNotEmpty({ message: 'A unidade é obrigatória' })
  unidade: string;

  @ValidateIf((o) => o.preco !== null && o.preco !== undefined && o.preco !== '')
  @IsNumber({}, { message: 'O preço deve ser um número' })
  @Min(0, { message: 'O preço não pode ser negativo' })
  @Type(() => Number)
  preco?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'A categoria é obrigatória' })
  categoria: string;
}
