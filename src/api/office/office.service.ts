import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Office } from 'src/schema/office/office.schema';
import { Role } from 'src/schema/admin/role.schema';
import { User } from 'src/schema/user/user.schema';
import { AssignOfficeUserDto } from './dto/assign-office-user.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { FindOfficeDto } from './dto/find-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

@Injectable()
export class OfficeService {
  private readonly logger = new Logger(OfficeService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,
    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  private buildSignedLink(slug: string): string {
    const ttlDays = Number(process.env.OFFICE_LINK_TTL_DAYS) || 365;
    const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    const sig = this.codeService.signOfficeLink(slug, exp);
    const baseUrl = process.env.DD_API_URL ?? '';
    return `${baseUrl}/o/${slug}?sig=${sig}&exp=${exp}`;
  }

  async create(data: CreateOfficeDto) {
    this.can('CREATE', 'Office');
    const actorId = new Types.ObjectId(this.req.user.userId);

    const officeType = await this.officeTypeModel.findById(
      new Types.ObjectId(data.officeTypeId),
    );
    if (!officeType) {
      throw new BadRequestException({
        code: 'INVALID_OFFICE_TYPE',
        message: 'Invalid office type id',
      });
    }

    const clashes = await this.officeModel.exists({
      $or: [{ slug: data.slug }, { officeName: data.officeName }],
    });
    if (clashes) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An office with this name or slug already exists',
      });
    }

    const officeCode = await this.codeService.generateOfficeCode();
    const office = new this.officeModel({
      officeTypeId: officeType._id,
      officeName: data.officeName,
      slug: data.slug,
      officeCode,
      signedLink: this.buildSignedLink(data.slug),
      address: data.address,
      city: data.city,
      region: data.region,
      qrCodeUrl: data.qrCodeUrl,
    });
    office.$locals.changedBy = actorId;
    await office.save();

    this.logger.log(`created office ${officeCode}`);
    return office;
  }

  async findAll({ page, size, ...query }: FindOfficeDto) {
    this.can('READ', 'Office');

    const where: Record<string, unknown> = {};
    if (query.officeTypeId)
      where.officeTypeId = new Types.ObjectId(query.officeTypeId);
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      where.$or = [{ officeName: rx }, { city: rx }, { region: rx }];
    }

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.officeModel.countDocuments(where);
    const data = await this.officeModel
      .find(where)
      .populate({ model: OfficeType.name, path: 'officeTypeId' })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  async findOne(id: string) {
    this.can('READ', 'Office');
    const office = await this.officeModel
      .findById(new Types.ObjectId(id))
      .populate({ model: OfficeType.name, path: 'officeTypeId' });
    if (!office) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office not found',
      });
    }
    return office;
  }

  async update(id: string, data: UpdateOfficeDto) {
    this.can('UPDATE', 'Office');
    const officeId = new Types.ObjectId(id);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const office = await this.officeModel.findById(officeId);
    if (!office) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office not found',
      });
    }

    if (data.officeName && data.officeName !== office.officeName) {
      const nameTaken = await this.officeModel.exists({
        officeName: data.officeName,
        _id: { $ne: officeId },
      });
      if (nameTaken) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'An office with this name already exists',
        });
      }
    }

    const update: Record<string, unknown> = { ...data };
    if (data.officeTypeId)
      update.officeTypeId = new Types.ObjectId(data.officeTypeId);

    return await this.officeModel.findOneAndUpdate({ _id: officeId }, update, {
      context: { changedBy: actorId },
      returnDocument: 'after',
    } as never);
  }

  async assignUser(id: string, data: AssignOfficeUserDto) {
    this.can('manage', 'Office');
    const officeId = new Types.ObjectId(id);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const office = await this.officeModel.findById(officeId);
    if (!office) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office not found',
      });
    }

    const userId = new Types.ObjectId(data.userId);
    const roleId = new Types.ObjectId(data.roleId);
    const [user, role] = await Promise.all([
      this.userModel.exists({ _id: userId }),
      this.roleModel.exists({ _id: roleId }),
    ]);
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_USER',
        message: 'Invalid user id',
      });
    }
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: 'Invalid role id',
      });
    }

    await this.officeUserModel.findOneAndUpdate(
      { officeId, userId, roleId },
      { officeId, userId, roleId, isActive: true },
      { upsert: true, context: { changedBy: actorId } } as never,
    );
    return 'User assigned to office successfully';
  }

  async listUsers(id: string) {
    this.can('READ', 'Office');
    const officeId = new Types.ObjectId(id);
    return await this.officeUserModel
      .find({ officeId, isActive: true })
      .populate({ model: User.name, path: 'userId', select: '-passwordHash' })
      .populate({ model: Role.name, path: 'roleId' });
  }

  async revokeUser(id: string, userId: string) {
    this.can('manage', 'Office');
    await this.officeUserModel.deleteMany({
      officeId: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
    return 'User removed from office successfully';
  }
}
