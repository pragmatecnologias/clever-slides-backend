import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Support cross-app authentication
    // Sermon app sends workspaceId, slides app uses churchId
    const churchId = payload.churchId || payload.workspaceId || payload.sub;
    
    return { 
      userId: payload.sub, 
      email: payload.email, 
      role: payload.role, 
      churchId,
      workspaceId: payload.workspaceId,
    };
  }
}
