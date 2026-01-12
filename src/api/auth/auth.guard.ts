import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model } from 'mongoose';
import constant from 'src/helper/constant';
import { IS_PUBLIC_KEY } from 'src/helper/decorator/public.decorator';
import { User } from 'src/schema/user/user.schema';
import { JWTUserDto } from './dto/jwt.dto';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private extractTokenFromHeader(request: Request) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & JWTUserDto>();
    const token = this.extractTokenFromHeader(request);
    if (!token) throw new UnauthorizedException(constant.UNAUTHORIZED);

    try {
      const options = { secret: process.env.JWT_SECRET };
      const payload = await this.jwtService.verifyAsync<JWTUserDto>(
        token,
        options,
      );

      const user = await this.userModel.findById(payload.sub);
      if (!user) {
        this.logger.error(`${payload.phone} doesn't exists.`);
        throw new UnauthorizedException(constant.UNAUTHORIZED);
      }

      request['user'] = payload;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : constant.UNAUTHORIZED;
      this.logger.error(errorMessage, err);
      throw new UnauthorizedException(errorMessage);
    }

    return true;
  }
}
