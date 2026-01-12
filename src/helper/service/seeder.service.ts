import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentStatus } from 'src/schema/payment/payment-status.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import seed from 'src/static/seed';
import { CodeGeneratorService } from './code-generator.service';
import { User } from 'src/schema/user/user.schema';
import {
  GenderEnum,
  PreferredLanguageEnum,
  UserTypeEum,
} from 'src/schema/user/user.dto';
import { Role } from 'src/schema/admin/role.schema';
import { Permission } from 'src/schema/admin/permission.schema';
import {
  PermissionActionEnum,
  RoleEnum,
  ScopeEnum,
  SubjectEnum,
} from 'src/schema/admin/admin.dto';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermission>,
    @InjectModel(Permission.name)
    private readonly permissionModel: Model<Permission>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    private readonly codeService: CodeGeneratorService,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,
    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,
    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,
    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,
    @InjectModel(PaymentStatus.name)
    private readonly paymentStatusModel: Model<PaymentStatus>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
  ) {}

  private async seedUserType() {
    const operations = seed.userType.map((userType) => ({
      updateOne: {
        filter: { userTypeName: userType.userTypeName },
        update: { $set: userType },
        upsert: true,
      },
    }));

    await this.userTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.userType.length} data for User Type`,
    );
  }

  private async seedOfficeType() {
    const operations = seed.officeType.map((officeType) => ({
      updateOne: {
        filter: { officeTypeName: officeType.officeTypeName },
        update: { $set: officeType },
        upsert: true,
      },
    }));

    await this.officeTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.officeType.length} data for Office Type`,
    );
  }

  private async seedPickupStatus() {
    const operations = seed.pickupStatus.map((pickupStatus) => ({
      updateOne: {
        filter: { pickupStatusName: pickupStatus.pickupStatusName },
        update: { $set: pickupStatus },
        upsert: true,
      },
    }));

    await this.pickupStatusModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.pickupStatus.length} data for Pickup Status`,
    );
  }

  private async seedOrderStatus() {
    const operations = seed.orderStatus.map((orderStatus) => ({
      updateOne: {
        filter: { orderStatusName: orderStatus.orderStatusName },
        update: { $set: orderStatus },
        upsert: true,
      },
    }));

    await this.orderStatusModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.orderStatus.length} data for Order Status`,
    );
  }

  private async seedPaymentMethod() {
    const operations = seed.paymentMethod.map((paymentMethod) => ({
      updateOne: {
        filter: { paymentMethodName: paymentMethod.paymentMethodName },
        update: { $set: paymentMethod },
        upsert: true,
      },
    }));

    await this.paymentMethodModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.paymentMethod.length} data for Payment Method`,
    );
  }

  private async seedPaymentStatus() {
    const operations = seed.paymentStatus.map((paymentStatus) => ({
      updateOne: {
        filter: { paymentStatusName: paymentStatus.paymentStatusName },
        update: { $set: paymentStatus },
        upsert: true,
      },
    }));

    await this.paymentStatusModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.paymentStatus.length} data for Payment Status`,
    );
  }

  private async seedOffice() {
    const url = process.env.DD_API_URL;
    for (const office of seed.offices) {
      const { officeType, ...data } = office;
      const sig = this.codeService.signOfficeLink(office.slug);
      const signedLink = `${url}/o/${office.slug}?sig=${sig}`;

      const officeTypeDoc = await this.officeTypeModel.findOne({
        officeTypeName: officeType,
      });
      const officeTypeId = officeTypeDoc?._id;

      await this.officeModel.findOneAndUpdate(
        { slug: data.slug },
        { ...data, officeTypeId, signedLink },
        { upsert: true },
      );
    }
    // await this.officeModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${seed.offices.length} data for Office`);
  }

  private async seedRoles() {
    const operations = seed.roles.map((role) => ({
      updateOne: {
        filter: { roleName: role.roleName },
        update: { $set: role },
        upsert: true,
      },
    }));

    await this.roleModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${seed.roles.length} data for Role`);
  }

  private async seedPermission() {
    const operations = seed.permissions.map((permission) => ({
      updateOne: {
        filter: { action: permission.action, subject: permission.subject },
        update: { $set: permission },
        upsert: true,
      },
    }));

    await this.permissionModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.permissions.length} data for Permission`,
    );
  }

  private async seedAdmin() {
    const phone = '670678660';
    const adminUserExists = await this.userModel.exists({ phone });
    if (adminUserExists) return;

    const role = await this.roleModel.findOne({
      roleName: RoleEnum.CO_FOUNDER.toString(),
    });
    const permission = await this.permissionModel.findOne({
      action: PermissionActionEnum.MANAGE,
      subject: SubjectEnum.All,
    });

    const rolePermissionExists = await this.rolePermissionModel.exists({
      roleId: role?._id,
      permissionId: permission?._id,
    });
    if (!rolePermissionExists) {
      await this.rolePermissionModel.create({
        roleId: role!._id,
        scope: ScopeEnum.GLOBAL,
        permissionId: permission!._id,
      });
    }

    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.ADMIN,
    });

    const password = process.env.ADMIN_PASSWORD!;
    const hashedPassword = await this.codeService.hashPlainText(password);

    const adminUser = await this.userModel.create({
      phone,
      lastName: 'Raymond',
      firstName: 'Fedjio',
      gender: GenderEnum.MALE,
      whatsappPhone: '670678660',
      userTypeId: userType?._id,
      passwordHash: hashedPassword,
      email: 'fedjio.raymond@dressdoctor.io',
      preferredLanguage: PreferredLanguageEnum.ENGLISH,
    });

    const userRoleExists = await this.userRoleModel.exists({
      roleId: role!._id,
      userId: adminUser._id,
    });

    if (!userRoleExists) {
      await this.userRoleModel.create({
        roleId: role!._id,
        userId: adminUser._id,
      });
    }

    this.logger.log('✅ Super Admin seeded successfully');
  }

  async run(): Promise<void> {
    await this.seedUserType();
    await this.seedOfficeType();
    await this.seedPickupStatus();
    await this.seedOrderStatus();
    await this.seedPaymentMethod();
    await this.seedPaymentStatus();
    await this.seedOffice();
    await this.seedRoles();
    await this.seedPermission();
    await this.seedAdmin();
  }
}
