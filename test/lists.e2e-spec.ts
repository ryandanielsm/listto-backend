import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createPrismaMock, MockPrismaClient } from './prisma.mock.js';

describe('ListsController (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaClient;

  const mockUser = {
    userId: 'user-uuid-123',
    email: 'user@listto.app',
  };

  const mockShoppingList = {
    id: 'list-uuid-456',
    usuarioId: mockUser.userId,
    nome: 'Compras da Semana',
    status: 'ativa',
    criadoEm: new Date().toISOString(),
    finalizadoEm: null,
    itens: [],
  };

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        },
      })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /lists', () => {
    it('deve retornar HTTP 201 (Created) ao enviar um payload válido', async () => {
      prisma.shoppingList.create.mockResolvedValue(mockShoppingList as any);

      const response = await request(app.getHttpServer())
        .post('/lists')
        .send({ nome: 'Compras da Semana' })
        .expect(201);

      expect(response.body).toHaveProperty('id', mockShoppingList.id);
      expect(response.body).toHaveProperty('nome', 'Compras da Semana');
    });

    it('deve retornar HTTP 400 (Bad Request) ao tentar criar uma lista enviando dados inválidos', async () => {
      await request(app.getHttpServer())
        .post('/lists')
        .send({ nome: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/lists')
        .send({ nome: 'Lista Válida', campoInvalido: 'hack' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/lists')
        .send({})
        .expect(400);
    });
  });

  describe('GET /lists', () => {
    it('deve retornar HTTP 200 (OK) e um array de listas', async () => {
      prisma.shoppingList.findMany.mockResolvedValue([mockShoppingList as any]);

      const response = await request(app.getHttpServer())
        .get('/lists')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('id', mockShoppingList.id);
    });
  });
});
