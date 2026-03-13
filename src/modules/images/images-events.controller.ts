import { Controller, Sse, Query, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ImagesEventsService } from './images-events.service';

@Controller()
export class ImagesEventsController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly imagesEventsService: ImagesEventsService,
  ) {}

  @Sse('images/events')
  stream(@Query('token') token?: string) {
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    try {
      const payload: any = this.jwtService.verify(token);
      return this.imagesEventsService.stream(payload.churchId);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
