import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';

@Controller('music/suno')
export class MusicCallbackController {
  private readonly logger = new Logger(MusicCallbackController.name);

  @Post('callback')
  @HttpCode(200)
  handleSunoCallback(@Body() payload: any) {
    const callbackType = String(payload?.data?.callbackType || '').trim();
    const taskId = String(payload?.data?.task_id || payload?.data?.taskId || '').trim();
    const code = Number(payload?.code);

    this.logger.log(
      `Received Suno callback type="${callbackType || 'unknown'}" taskId="${taskId || 'unknown'}" code=${Number.isFinite(code) ? code : 'n/a'}`,
    );

    return { success: true };
  }
}
