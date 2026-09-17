import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/roles.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      success: true,
      data: {
        status: 'ok',
        service: 'nazdik-api',
        phase: 1,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
