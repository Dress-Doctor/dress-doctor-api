import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class ApiKeyService implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Assuming keys are passed via custom headers
    const apiKey = request.headers['client-key'];
    const apiSecret = request.headers['client-secret'];

    return true;
  }
}
