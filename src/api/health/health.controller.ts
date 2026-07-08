import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';
import { Public } from 'src/helper/decorator/public.decorator';
import { SkipApiKeyCheck } from 'src/helper/decorator/skip-api-key.decorator';
import { Queues } from 'src/queue/queue.dto';

@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(Queues.notification) private readonly queue: Queue,
  ) {}

  @Public()
  @SkipApiKeyCheck()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @SkipApiKeyCheck()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness() {
    const mongoUp = this.connection.readyState === ConnectionStates.connected;

    let redisUp = false;
    try {
      const client = await this.queue.client;
      redisUp = client.status === 'ready';
    } catch {
      redisUp = false;
    }

    if (!mongoUp || !redisUp) {
      const unreachable = [!mongoUp && 'Mongo', !redisUp && 'Redis'].filter(
        Boolean,
      );
      throw new ServiceUnavailableException(
        `${unreachable.join(' and ')} unreachable`,
      );
    }

    return { status: 'ok', mongo: mongoUp, redis: redisUp };
  }
}
