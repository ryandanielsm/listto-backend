import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  [key: string]: any;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://lohoixfyxmtaidgiwhkp.supabase.co';
    const legacySecret = process.env.SUPABASE_JWT_SECRET;

    const jwksProvider = passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    });

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      jsonWebTokenOptions: {
        clockTolerance: 30,
      },
      algorithms: ['ES256', 'HS256'],
      secretOrKeyProvider: (
        req: any,
        rawJwtToken: any,
        done: (err: any, secretOrKey?: any) => void,
      ) => {
        try {
          const decoded: any = jwt.decode(rawJwtToken, { complete: true });
          if (!decoded || !decoded.header) {
            return done(new UnauthorizedException('Token malformado.'));
          }

          // Se o token foi assinado com HS256, usa o segredo simétrico do Supabase
          if (decoded.header.alg === 'HS256' && legacySecret) {
            return done(null, legacySecret);
          }

          // Se foi assinado com ES256 (ECC), busca a chave pública no endpoint JWKS do Supabase
          return jwksProvider(req, rawJwtToken, done);
        } catch (err) {
          return done(err);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token inválido ou sem identificador do usuário.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      ...payload,
    };
  }
}
