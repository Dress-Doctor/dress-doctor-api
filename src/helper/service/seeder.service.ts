import { Injectable, Logger } from '@nestjs/common';
import { systemAuditContext } from './audit-context';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import seed from 'src/static/seed';
import { itemDisplayName, itemUnitPrice } from '../catalog/item-derived';
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
import { ApiClient } from 'src/schema/admin/api-client.schema';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { CatalogDto } from 'src/schema/catalog/catalog.dto';
import { Category } from 'src/schema/catalog/category.schema';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { ServiceType } from 'src/schema/catalog/service-type.schema';
import { Setting, SettingKeys } from 'src/schema/settings/settings.schema';
import { RewardRule } from 'src/schema/reward/reward-rule.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import { SubscriptionPlan } from 'src/schema/subscription/subscription-plan.schema';
import { Service } from 'src/schema/catalog/service.schema';
import { SubCategory } from 'src/schema/catalog/sub-category.schema';
import currencyData from 'src/static/currency.data';
import categoryData from 'src/static/category.data';
import subCategoryData from 'src/static/sub-category.data';
import serviceData from 'src/static/service.data';
import serviceTypeData from 'src/static/service-type.data';
import { ItemCategory } from 'src/schema/catalog/item-category.schema';
import { ItemSubCategory } from 'src/schema/catalog/item-sub-category.schema';
import { Notification } from 'src/schema/notification/notification.schema';
import { NotificationTemplate } from 'src/schema/notification/notification-template.schema';
import notificationData from 'src/static/notification.data';
import itemData from 'src/static/item.data';

@Injectable()
export class SeederService {
  // Nine digits, no country code — the format every phone is stored and looked
  // up in (see the 9-digit login DTOs). `whatsappPhone` is the exception and
  // keeps its 237 prefix, because WhatsApp addresses need the country code.
  private readonly phone = '670678660';
  private readonly email = 'fedjio.raymond@dressdoctor.io';
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly codeService: CodeGeneratorService,

    @InjectModel(NotificationTemplate.name)
    private readonly notificationTemplateModel: Model<NotificationTemplate>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,

    @InjectModel(ApiClient.name)
    private readonly apiClientModel: Model<ApiClient>,

    @InjectModel(User.name) private readonly userModel: Model<User>,

    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermission>,

    @InjectModel(Permission.name)
    private readonly permissionModel: Model<Permission>,

    @InjectModel(Role.name) private readonly roleModel: Model<Role>,

    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,

    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,
    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,

    @InjectModel(Office.name) private readonly officeModel: Model<Office>,

    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,

    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,

    @InjectModel(Item.name) private readonly itemModel: Model<Item>,

    @InjectModel(ServiceType.name)
    private readonly serviceTypeModel: Model<ServiceType>,

    @InjectModel(Setting.name)
    private readonly settingModel: Model<Setting>,

    @InjectModel(Service.name) private readonly serviceModel: Model<Service>,

    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategory>,

    @InjectModel(ItemCategory.name)
    private readonly itemCategoryModel: Model<ItemCategory>,

    @InjectModel(ItemSubCategory.name)
    private readonly itemSubCategoryModel: Model<ItemSubCategory>,

    @InjectModel(RewardRule.name)
    private readonly rewardRuleModel: Model<RewardRule>,

    @InjectModel(RewardTier.name)
    private readonly rewardTierModel: Model<RewardTier>,

    @InjectModel(SubscriptionPlan.name)
    private readonly subscriptionPlanModel: Model<SubscriptionPlan>,
  ) {}

  private async seedUserType() {
    // `reference` is minted per row and written with `$setOnInsert`, so a
    // re-run leaves the reference an existing row already carries alone —
    // it is the id the reference screen and its URLs are built on, and it
    // must not change under anyone. Generated one at a time rather than in
    // parallel: the generator checks the database for a clash, and two
    // concurrent calls could pick the same code before either had saved.
    const operations: Parameters<typeof this.userTypeModel.bulkWrite>[0] = [];
    for (const userType of seed.userType) {
      const reference = await this.codeService.generateUserTypeReference();
      operations.push({
        updateOne: {
          filter: { userTypeName: userType.userTypeName },
          update: { $set: userType, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.userTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.userType.length} data for User Type`,
    );
  }

  private async seedOfficeType() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the statuses are: it is the id the reference screen and its URLs are
    // built on, so a re-run must leave an existing row's alone. Generated one
    // at a time rather than in parallel — the generator checks the database
    // for a clash, and two concurrent calls could pick the same code before
    // either had saved.
    const operations: Parameters<typeof this.officeTypeModel.bulkWrite>[0] = [];
    for (const officeType of seed.officeType) {
      const reference = await this.codeService.generateOfficeTypeReference();
      operations.push({
        updateOne: {
          filter: { officeTypeName: officeType.officeTypeName },
          update: { $set: officeType, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.officeTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.officeType.length} data for Office Type`,
    );
  }

  private async seedPickupStatus() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the user types are: it is the id the reference screen and its URLs
    // are built on, so a re-run must leave an existing row's alone. Generated
    // one at a time rather than in parallel — the generator checks the
    // database for a clash, and two concurrent calls could pick the same code
    // before either had saved.
    const operations: Parameters<typeof this.pickupStatusModel.bulkWrite>[0] =
      [];
    for (const pickupStatus of seed.pickupStatus) {
      const reference = await this.codeService.generatePickupStatusReference();
      operations.push({
        updateOne: {
          filter: { pickupStatusName: pickupStatus.pickupStatusName },
          update: { $set: pickupStatus, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.pickupStatusModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.pickupStatus.length} data for Pickup Status`,
    );
  }

  private async seedOrderStatus() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the pickup statuses are: it is the id the reference screen and its
    // URLs are built on, so a re-run must leave an existing row's alone.
    // Generated one at a time rather than in parallel — the generator checks
    // the database for a clash, and two concurrent calls could pick the same
    // code before either had saved.
    const operations: Parameters<typeof this.orderStatusModel.bulkWrite>[0] =
      [];
    for (const orderStatus of seed.orderStatus) {
      const reference = await this.codeService.generateOrderStatusReference();
      operations.push({
        updateOne: {
          filter: { orderStatusName: orderStatus.orderStatusName },
          update: { $set: orderStatus, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.orderStatusModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.orderStatus.length} data for Order Status`,
    );
  }

  private async seedPaymentMethod() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the other reference collections are: it is the id the reference
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.paymentMethodModel.bulkWrite>[0] =
      [];
    for (const paymentMethod of seed.paymentMethod) {
      const reference = await this.codeService.generatePaymentMethodReference();
      operations.push({
        updateOne: {
          filter: { paymentMethodName: paymentMethod.paymentMethodName },
          update: { $set: paymentMethod, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.paymentMethodModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.paymentMethod.length} data for Payment Method`,
    );
  }

  private async seedPaymentType() {
    // Same one-at-a-time minting as the payment methods above, and for the
    // same reason.
    const operations: Parameters<typeof this.paymentTypeModel.bulkWrite>[0] =
      [];
    for (const paymentType of seed.paymentType) {
      const reference = await this.codeService.generatePaymentTypeReference();
      operations.push({
        updateOne: {
          filter: { paymentTypeName: paymentType.paymentTypeName },
          update: { $set: paymentType, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.paymentTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.paymentType.length} data for Payment Types`,
    );
  }

  private async seedOffice() {
    const url = process.env.DD_API_URL ?? '';
    const ttlDays = Number(process.env.OFFICE_LINK_TTL_DAYS) || 365;
    for (const office of seed.offices) {
      const { officeType, ...data } = office;
      // The seed carries an empty `signedLink` placeholder. Setting it would
      // blank a real link, so it never reaches the update.
      delete (data as { signedLink?: string }).signedLink;
      const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
      const sig = this.codeService.signOfficeLink(office.slug, exp);
      const signedLink = `${url}/o/${office.slug}?sig=${sig}&exp=${exp}`;

      const officeTypeDoc = await this.officeTypeModel.findOne({
        officeTypeName: officeType,
      });
      const officeTypeId = officeTypeDoc?._id;

      /*
       * The link is minted on insert only.
       *
       * Re-minting it on every boot invalidated the previous one each time the
       * API restarted — so a QR code printed for a branch died overnight, and
       * the office's audit trail filled up with link rotations nobody made.
       * Rotating a link is a deliberate act; it belongs to
       * `POST /offices/:officeCode/link`, not to a seed.
       */
      await this.officeModel.findOneAndUpdate(
        { slug: data.slug },
        { $set: { ...data, officeTypeId }, $setOnInsert: { signedLink } },
        { upsert: true },
      );
    }
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

  // Subjects that carry officeId and so are office-scoped for OFFICE-scope roles.
  // OrderItem is intentionally NOT here — it has no officeId; item access is
  // scoped through its parent Order at the service layer.
  private static readonly OFFICE_OWNED = new Set<string>([
    SubjectEnum.Order,
    SubjectEnum.Payment,
    SubjectEnum.PickupRequest,
    SubjectEnum.PickupAssignment,
    // Activity rows carry the office the actor was working in, so an
    // OFFICE-scoped reviewer is confined to their own branch's trail.
    SubjectEnum.Activity,
  ]);

  private async upsertRolePermission(
    roleId: Types.ObjectId,
    action: string,
    subject: string,
    scope: string,
    conditions?: Record<string, unknown>,
  ): Promise<boolean> {
    const permissionDoc = await this.permissionModel.findOne({
      action,
      subject,
    } as Record<string, unknown>);
    if (!permissionDoc) return false;

    await this.rolePermissionModel.findOneAndUpdate(
      { roleId, permissionId: permissionDoc._id },
      {
        roleId,
        permissionId: permissionDoc._id,
        scope,
        // undefined leaves the field unset (GLOBAL/unrestricted rows).
        ...(conditions ? { conditions } : {}),
      },
      { upsert: true },
    );
    return true;
  }

  private async seedRolePermissions() {
    let count = 0;

    // Staff/internal roles: OFFICE-scoped office-owned subjects auto-scope to
    // the caller's office via a { officeId: '$office' } condition.
    for (const mapping of seed.rolePermissionMap) {
      const role = await this.roleModel.findOne({ roleName: mapping.roleName });
      if (!role) continue;

      for (const permission of mapping.permissions) {
        const conditions =
          mapping.scope === ScopeEnum.OFFICE &&
          SeederService.OFFICE_OWNED.has(permission.subject)
            ? { officeId: '$office' }
            : undefined;

        const ok = await this.upsertRolePermission(
          role._id,
          permission.action,
          permission.subject,
          mapping.scope,
          conditions,
        );
        if (ok) count++;
      }
    }

    // External self-service roles: read-own via explicit { field: '$self' }.
    for (const mapping of seed.selfRolePermissionMap) {
      const role = await this.roleModel.findOne({ roleName: mapping.roleName });
      if (!role) continue;

      for (const permission of mapping.permissions) {
        const ok = await this.upsertRolePermission(
          role._id,
          permission.action,
          permission.subject,
          mapping.scope,
          permission.conditions,
        );
        if (ok) count++;
      }
    }

    this.logger.log(`🌱 Done seeding ${count} data for RolePermission`);
  }

  /**
   * The user every seeded row is attributed to.
   *
   * Matched on phone OR email, exactly as `seedAdmin()` decides the admin
   * already exists — looking one up by phone alone found nothing on a database
   * whose admin was seeded under the email with a different phone, and the
   * seed then died attributing a write to `null`.
   */
  private async findAdminUser() {
    return await this.userModel
      .findOne({ $or: [{ phone: this.phone }, { email: this.email }] })
      .select('_id');
  }

  private async seedAdmin() {
    const phone = this.phone;
    const email = this.email;
    const adminUserExists = await this.userModel.exists({
      $or: [{ phone }, { email }],
    });
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

    // Self-attributed: this is the very first User ever created, so
    // there's no existing admin to credit as changedBy. Pre-generate
    // the _id so the bootstrap admin can be its own creator.
    const adminUserId = new Types.ObjectId();
    const adminUserDoc = new this.userModel({
      _id: adminUserId,
      phone,
      email,
      lastName: 'Raymond',
      firstName: 'Fedjio',
      gender: GenderEnum.MALE,
      userTypeId: userType?._id,
      passwordHash: hashedPassword,
      // Country code kept: a WhatsApp address is not a local phone number.
      whatsappPhone: `237${this.phone}`,
      preferredLanguage: PreferredLanguageEnum.ENGLISH,
    });
    adminUserDoc.$locals.changedBy = adminUserId;
    const adminUser = await adminUserDoc.save();

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

  private async seedSystemApiClient() {
    const apiClientExists = await this.apiClientModel.findOne({
      name: seed.apiClient.name,
    });
    if (apiClientExists) return;

    // Looked up after the exists-check so a re-run does not pay for it, and
    // required: the client row records who created it.
    const adminUser = await this.findAdminUser();
    if (!adminUser) {
      this.logger.warn(
        'Skipping default API client: no admin user to attribute it to',
      );
      return;
    }

    const { key, secret, secretHash } =
      await this.codeService.generateApiClient();

    await this.apiClientModel.create({
      key,
      secretHash,
      ...seed.apiClient,
      createdBy: adminUser._id,
    });

    this.logger.log(
      `🌱 Done seeding default API Client with ${JSON.stringify({ key, secret })}`,
    );
  }

  private async seedCurrency() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the reference collections above are: it is the id the catalogue
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.currencyModel.bulkWrite>[0] = [];
    for (const currency of currencyData) {
      const reference = await this.codeService.generateCurrencyReference();
      operations.push({
        updateOne: {
          filter: { isoCode: currency.isoCode },
          update: { $set: currency, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.currencyModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${currencyData.length} data for Currency`);
  }

  private async seedCategory() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the reference collections above are: it is the id the catalogue
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.categoryModel.bulkWrite>[0] = [];
    for (const category of categoryData) {
      const reference = await this.codeService.generateCategoryReference();
      operations.push({
        updateOne: {
          filter: { categoryName: category.categoryName },
          update: { $set: category, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.categoryModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${categoryData.length} data for Category`);
  }

  private async seedSubCategory() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the reference collections above are: it is the id the catalogue
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.subCategoryModel.bulkWrite>[0] =
      [];
    for (const subCategory of subCategoryData) {
      const reference = await this.codeService.generateSubCategoryReference();
      operations.push({
        updateOne: {
          filter: { subCategoryName: subCategory.subCategoryName },
          update: { $set: subCategory, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.subCategoryModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${subCategoryData.length} data for SubCategory`,
    );
  }

  private async seedService() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the reference collections above are: it is the id the catalogue
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.serviceModel.bulkWrite>[0] = [];
    for (const service of serviceData) {
      const reference = await this.codeService.generateServiceReference();
      operations.push({
        updateOne: {
          filter: { serviceName: service.serviceName },
          update: { $set: service, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.serviceModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${serviceData.length} data for Service`);
  }

  private async seedServiceType() {
    // `reference` is minted per row and written with `$setOnInsert`, the same
    // way the reference collections above are: it is the id the catalogue
    // screen and its URLs are built on, so a re-run must leave an existing
    // row's alone. Generated one at a time rather than in parallel — the
    // generator checks the database for a clash, and two concurrent calls
    // could pick the same code before either had saved.
    const operations: Parameters<typeof this.serviceTypeModel.bulkWrite>[0] =
      [];
    for (const serviceType of serviceTypeData) {
      const reference = await this.codeService.generateServiceTypeReference();
      operations.push({
        updateOne: {
          filter: { serviceTypeName: serviceType.serviceTypeName },
          update: { $set: serviceType, $setOnInsert: { reference } },
          upsert: true,
        },
      });
    }

    await this.serviceTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${serviceTypeData.length} data for ServiceType`,
    );
  }

  private async seedItemCatalog() {
    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    const adminUser = await this.findAdminUser();
    // The catalog is reference data and still has to land without an admin to
    // sign for it; the audit entry is what goes missing, not the row.
    const audit = adminUser
      ? systemAuditContext(adminUser._id, 'price list seed')
      : undefined;

    for (const item of itemData) {
      const [service, serviceType, category, subCategory] = await Promise.all([
        this.serviceModel.findOne({ serviceName: item.service }),
        this.serviceTypeModel.findOne({ serviceTypeName: item.serviceType }),
        this.categoryModel.findOne({ categoryName: item.category }),
        this.subCategoryModel.findOne({
          subCategoryName: item.subCategory,
        }),
      ]);
      if (!service || !serviceType || !category || !subCategory) {
        this.logger.warn(`Skipping seed item ${item.itemName}: lookup missing`);
        continue;
      }

      // `reference` rides in `$setOnInsert`, so a re-run leaves the one an
      // existing item already carries alone — it is the id the catalogue
      // screen and its URLs are built on.
      const reference = await this.codeService.generateItemReference();
      const itemDoc = await this.itemModel.findOneAndUpdate(
        { itemName: item.itemName },
        {
          $set: {
            itemName: item.itemName,
            serviceId: service._id,
            serviceTypeId: serviceType._id,
            currencyId: currency?._id,
            priceLow: item.priceLow,
            priceHigh: item.priceHigh,
          },
          $setOnInsert: { reference },
        },
        {
          context: audit,
          upsert: true,
          returnDocument: 'after',
        } as never,
      );

      const itemId = (itemDoc as unknown as Item)._id;
      await this.itemCategoryModel.findOneAndUpdate(
        { itemId, categoryId: category._id },
        { itemId, categoryId: category._id },
        { upsert: true },
      );
      await this.itemSubCategoryModel.findOneAndUpdate(
        { itemId, subCategoryId: subCategory._id },
        { itemId, subCategoryId: subCategory._id },
        { upsert: true },
      );

      // The two derived fields, written last because the display name reads
      // the links above. Seeded rather than left to the backfill so a fresh
      // database is complete the moment it is seeded. `timestamps: false`:
      // a derived field is not an edit anyone made.
      await this.itemModel.updateOne(
        { _id: itemId },
        {
          $set: {
            unitPrice: itemUnitPrice(item.priceLow, item.priceHigh),
            displayName: itemDisplayName({
              itemName: item.itemName,
              categoryNames: [category.categoryName],
              subCategoryNames: [subCategory.subCategoryName],
            }),
          },
        },
        { timestamps: false },
      );
    }

    this.logger.log(`🌱 Done seeding ${itemData.length} data for Item`);
  }

  private async seedItems() {
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = '1up-JE2aP-kWm7fk7C6t24QlDLP0CwVftsepfj9D91dg';

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Douala Laundry Price List',
      });
      const rows = res.data.values ?? [];

      if (rows.length === 0) {
        this.logger.warn('No inventory data found in sheet');
        return;
      }

      const headers = rows[0]; // first row
      const dataRows = rows.slice(1);
      const items = dataRows.map((row) => {
        const obj: CatalogDto = {
          item: '',
          type: '',
          service: '',
          category: '',
          subcategory: '',
          'price low (xaf)': '',
          'price high (xaf)': '',
        };

        headers.forEach((header, index) => {
          obj[(header as string).toLowerCase()] = row[index] as string;
        });
        return obj;
      });

      const adminUser = await this.findAdminUser();
      const importAudit = adminUser
        ? systemAuditContext(adminUser._id, 'price list import')
        : undefined;
      const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });

      // Loop Through Data
      const tempService = new Map<string, Types.ObjectId>();
      const tempCategory = new Map<string, Types.ObjectId>();
      const tempSubCategory = new Map<string, Types.ObjectId>();
      const tempServiceType = new Map<string, Types.ObjectId>();

      for (const item of items) {
        // Category
        let categoryId = tempCategory.get(item.category);
        if (!categoryId) {
          const category = await this.categoryModel.findOne({
            categoryName: item.category,
          });

          if (!category) {
            this.logger.warn(`Category=${item.category} not found`);
            continue;
          }

          categoryId = category._id;
          tempCategory.set(item.category, category._id);
        }

        // Sub Category
        let subCategoryId = tempSubCategory.get(item.subcategory);
        if (!subCategoryId) {
          const subCategory = await this.subCategoryModel.findOne({
            subCategoryName: item.subcategory,
          });

          if (!subCategory) {
            this.logger.warn(`SubCategory=${item.subcategory} not found`);
            continue;
          }

          subCategoryId = subCategory._id;
          tempSubCategory.set(item.subcategory, subCategory._id);
        }

        // Service
        let serviceId = tempService.get(item.service);
        if (!serviceId) {
          const service = await this.serviceModel.findOne({
            serviceName: item.service,
          });

          if (!service) {
            this.logger.warn(`Service=${item.service} not found`);
            continue;
          }

          serviceId = service._id;
          tempService.set(item.service, service._id);
        }

        // Service Type
        let serviceTypeId = tempServiceType.get(item.type);
        if (!serviceTypeId) {
          const serviceType = await this.serviceTypeModel.findOne({
            serviceTypeName: item.type,
          });

          if (!serviceType) {
            this.logger.warn(`ServiceType=${item.type} not found`);
            continue;
          }

          serviceTypeId = serviceType._id;
          tempServiceType.set(item.type, serviceType._id);
        }

        // Same as the static catalogue above: minted here, but only written
        // when the row is new.
        const reference = await this.codeService.generateItemReference();
        const newItem = await this.itemModel.findOneAndUpdate(
          { itemName: item.item },
          {
            $set: {
              serviceId,
              serviceTypeId,
              itemName: item.item,
              currencyId: currency?._id,
              priceLow: Number(item['price low (xaf)'].replaceAll(',', '')),
              priceHigh: Number(item['price high (xaf)'].replaceAll(',', '')),
            },
            $setOnInsert: { reference },
          },
          {
            context: importAudit,
            upsert: true,
            returnDocument: 'after',
          } as never,
        );

        const itemCategoryExists = await this.itemCategoryModel.exists({
          categoryId,
          itemId: (newItem as unknown as Item)._id,
        });
        if (!itemCategoryExists) {
          await this.itemCategoryModel.create({
            categoryId,
            itemId: (newItem as unknown as Item)._id,
          });
        }

        const itemSubCategoryExists = await this.itemSubCategoryModel.exists({
          subCategoryId,
          itemId: (newItem as unknown as Item)._id,
        });
        if (!itemSubCategoryExists) {
          await this.itemSubCategoryModel.create({
            subCategoryId,
            itemId: (newItem as unknown as Item)._id,
          });
        }

        // Same as the static catalogue above: derived last, because the
        // display name reads the links this loop has just written.
        const priceLow = Number(item['price low (xaf)'].replaceAll(',', ''));
        const priceHigh = Number(item['price high (xaf)'].replaceAll(',', ''));
        await this.itemModel.updateOne(
          { _id: (newItem as unknown as Item)._id },
          {
            $set: {
              unitPrice: itemUnitPrice(priceLow, priceHigh),
              displayName: itemDisplayName({
                itemName: item.item,
                categoryNames: [item.category],
                subCategoryNames: [item.subcategory],
              }),
            },
          },
          { timestamps: false },
        );
      }

      this.logger.log(`🌱 Done seeding ${items.length} data for Item`);
    } catch (error) {
      this.logger.error(`An error occur when trying to seed inventory`);
      this.logger.error(error);
    }
  }

  private async seedNotificationTemplates() {
    const operations = notificationData.map((notification) => ({
      updateOne: {
        // Templates are keyed by (templateName, channel) — same name can exist
        // per channel (email + WhatsApp).
        filter: {
          templateName: notification.templateName,
          channel: notification.channel,
        },
        update: { $set: notification },
        upsert: true,
      },
    }));

    await this.notificationTemplateModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${notificationData.length} data for NotificationTemplate`,
    );
  }

  private async seedSettings() {
    // Rates as data (default 1,000 XAF/kg each). $setOnInsert so an operator's
    // later override isn't clobbered on re-seed.
    const defaults = [
      {
        key: SettingKeys.perKgRate,
        value: 1000,
        description: 'Wash Per KG rate (XAF/kg)',
      },
      {
        key: SettingKeys.overageRate,
        value: 1000,
        description: 'Subscription overage rate (XAF/kg)',
      },
      {
        key: SettingKeys.inactiveDays,
        value: 14,
        description: 'Days without an order before a customer is inactive',
      },
      {
        key: SettingKeys.followUpCooldownDays,
        value: 7,
        description: 'Days before an unresolved inactivity alert can re-fire',
      },
      {
        key: SettingKeys.reconcileOverdueMinutes,
        value: 45,
        description:
          'Minutes since last completed payment-reconcile before /metrics flags the cron overdue',
      },
      {
        key: SettingKeys.inactivityOverdueHours,
        value: 26,
        description:
          'Hours since last completed inactivity-scan before /metrics flags the cron overdue',
      },
      {
        key: SettingKeys.rewardPointValueXaf,
        value: 1,
        description: 'XAF discount value of one reward point at redemption',
      },
    ];
    const operations = defaults.map((s) => ({
      updateOne: {
        filter: { key: s.key, officeId: null },
        update: { $setOnInsert: { ...s, officeId: null } },
        upsert: true,
      },
    }));
    await this.settingModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${defaults.length} settings`);
  }

  /** Rewards config as data (§2.1) — $setOnInsert so admin edits survive. */
  private async seedRewards() {
    await this.rewardRuleModel.bulkWrite(
      seed.rewardRules.map((rule) => ({
        updateOne: {
          filter: { type: rule.type },
          update: { $setOnInsert: rule },
          upsert: true,
        },
      })),
    );
    await this.rewardTierModel.bulkWrite(
      seed.rewardTiers.map((tier) => ({
        updateOne: {
          filter: { tierName: tier.tierName },
          update: { $setOnInsert: tier },
          upsert: true,
        },
      })),
    );
    this.logger.log(
      `🌱 Done seeding ${seed.rewardRules.length} reward rules + ${seed.rewardTiers.length} tiers`,
    );
  }

  /** Plan catalog as data (§2.2) — $setOnInsert so admin edits survive. */
  private async seedSubscriptionPlans() {
    await this.subscriptionPlanModel.bulkWrite(
      seed.subscriptionPlans.map((plan) => ({
        updateOne: {
          filter: { planName: plan.planName },
          update: { $setOnInsert: plan },
          upsert: true,
        },
      })),
    );
    this.logger.log(
      `🌱 Done seeding ${seed.subscriptionPlans.length} subscription plans`,
    );
  }

  async run(): Promise<void> {
    await this.seedSettings();
    await this.seedRewards();
    await this.seedSubscriptionPlans();
    await this.seedUserType();
    await this.seedOfficeType();
    await this.seedPickupStatus();
    await this.seedOrderStatus();
    await this.seedPaymentMethod();
    await this.seedPaymentType();
    await this.seedOffice();

    // Admin
    await this.seedRoles();
    await this.seedPermission();
    await this.seedRolePermissions();
    await this.seedAdmin();
    await this.seedSystemApiClient();

    // Catalogs
    await this.seedCurrency();
    await this.seedCategory();
    await this.seedSubCategory();
    await this.seedService();
    await this.seedServiceType();
    await this.seedItemCatalog();
    await this.seedNotificationTemplates();
    if (process.env.SEED_ITEMS === 'YES') await this.seedItems();
  }
}
