import { Injectable, Logger } from '@nestjs/common';
import { systemAuditContext } from './audit-context';
import { SeedTally, upsertSeedRow } from './seed-upsert';
import type { AuditContextDto } from '../mongoose-history.hook';
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
import { LeaderLockService } from './leader-lock.service';
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
    private readonly leaderLock: LeaderLockService,

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

  /**
   * The six reference collections, which all have the same shape and the same
   * ownership rules.
   *
   * Their names are locked — no update DTO accepts one — so the name is a safe
   * way to recognise a row. What a manager *can* edit is the description and
   * whether the row is offered, and those are written once, at creation, and
   * never again.
   *
   * `reference` is minted only when a row turns out to be missing. The old
   * seeder minted one for every row on every boot and threw nearly all of them
   * away, at the cost of a database round trip each time.
   */
  private async seedReferenceRows<T>(input: {
    model: Model<T>;
    nameField: string;
    rows: { description?: string }[];
    mintReference: () => Promise<string>;
    label: string;
  }): Promise<void> {
    const { model, nameField, rows, mintReference, label } = input;
    const audit = await this.seedAudit(`${label.toLowerCase()} seed`);
    const tally = new SeedTally();

    for (const row of rows) {
      const name = (row as Record<string, unknown>)[nameField];
      const { outcome } = await upsertSeedRow<T>({
        model,
        audit,
        logger: this.logger,
        generate: async () => ({ reference: await mintReference() }),
        plan: {
          filter: { [nameField]: name } as never,
          // Nothing here is seed-owned. The name is the key, and the
          // description and status belong to whoever edits them.
          onInsert: { ...row, isActive: true },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 ${label}: ${tally.toString()}`);
  }

  private async seedUserType() {
    await this.seedReferenceRows({
      model: this.userTypeModel,
      nameField: 'userTypeName',
      rows: seed.userType,
      mintReference: () => this.codeService.generateUserTypeReference(),
      label: 'User type',
    });
  }

  private async seedOfficeType() {
    await this.seedReferenceRows({
      model: this.officeTypeModel,
      nameField: 'officeTypeName',
      rows: seed.officeType,
      mintReference: () => this.codeService.generateOfficeTypeReference(),
      label: 'Office type',
    });
  }

  private async seedPickupStatus() {
    await this.seedReferenceRows({
      model: this.pickupStatusModel,
      nameField: 'pickupStatusName',
      rows: seed.pickupStatus,
      mintReference: () => this.codeService.generatePickupStatusReference(),
      label: 'Pickup status',
    });
  }

  private async seedOrderStatus() {
    await this.seedReferenceRows({
      model: this.orderStatusModel,
      nameField: 'orderStatusName',
      rows: seed.orderStatus,
      mintReference: () => this.codeService.generateOrderStatusReference(),
      label: 'Order status',
    });
  }

  private async seedPaymentMethod() {
    await this.seedReferenceRows({
      model: this.paymentMethodModel,
      nameField: 'paymentMethodName',
      rows: seed.paymentMethod,
      mintReference: () => this.codeService.generatePaymentMethodReference(),
      label: 'Payment method',
    });
  }

  private async seedPaymentType() {
    await this.seedReferenceRows({
      model: this.paymentTypeModel,
      nameField: 'paymentTypeName',
      rows: seed.paymentType,
      mintReference: () => this.codeService.generatePaymentTypeReference(),
      label: 'Payment type',
    });
  }

  private async seedOffice() {
    const url = process.env.DD_API_URL ?? '';
    const ttlDays = Number(process.env.OFFICE_LINK_TTL_DAYS) || 365;
    const audit = await this.seedAudit('office seed');
    const tally = new SeedTally();

    for (const office of seed.offices) {
      const { officeType, ...data } = office;
      // The seed carries an empty `signedLink` placeholder. Setting it would
      // blank a real link, so it never reaches the write.
      delete (data as { signedLink?: string }).signedLink;

      const officeTypeDoc = await this.officeTypeModel.findOne({
        officeTypeName: officeType,
      });

      /*
       * Everything a manager can edit — the name, address, city, region, type
       * and whether the branch is open — is written once and then left alone.
       * The office type included: `PATCH /offices/:code` accepts a new one, so
       * it is theirs to change, not the seed's to put back.
       *
       * The slug is the key because it is the one field no endpoint will
       * change; the public link is built from it.
       *
       * The link itself is minted on insert only. Re-minting it on every boot
       * invalidated the previous one each time the API restarted — a QR code
       * printed for a branch died overnight, and the office's trail filled up
       * with link rotations nobody made. Rotating a link is a deliberate act:
       * it belongs to `POST /offices/:officeCode/link`.
       */
      const { outcome } = await upsertSeedRow({
        model: this.officeModel,
        audit,
        logger: this.logger,
        generate: () => {
          const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
          const sig = this.codeService.signOfficeLink(office.slug, exp);
          return Promise.resolve({
            signedLink: `${url}/o/${office.slug}?sig=${sig}&exp=${exp}`,
          });
        },
        plan: {
          filter: { slug: data.slug },
          onInsert: {
            ...data,
            officeTypeId: officeTypeDoc?._id,
            isActive: true,
          },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Office: ${tally.toString()}`);
  }

  private async seedRoles() {
    const audit = await this.seedAudit('role seed');
    const tally = new SeedTally();

    for (const role of seed.roles) {
      const { seedKey, ...rest } = role;
      const { outcome } = await upsertSeedRow({
        model: this.roleModel,
        audit,
        logger: this.logger,
        // A role with no reference cannot be opened in the panel — every role
        // URL is built on one — so the seeder mints it as the role is created,
        // the same way the API does.
        generate: async () => ({
          reference: await this.codeService.generateRoleReference(),
        }),
        plan: {
          filter: { seedKey },
          // The name and description are editable from the panel, so the
          // seed writes them once and never corrects them afterwards.
          onInsert: { ...rest, isActive: true },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Role: ${tally.toString()}`);
  }

  private async seedPermission() {
    const tally = new SeedTally();
    // Permissions are not editable anywhere — there is no update endpoint and
    // no screen — so the pair (action, subject) is both the key and the whole
    // row. Nothing to protect from the seed here.
    for (const permission of seed.permissions) {
      const { outcome } = await upsertSeedRow({
        model: this.permissionModel,
        logger: this.logger,
        plan: {
          filter: { action: permission.action, subject: permission.subject },
          onInsert: { ...permission },
        },
      });
      tally.add(outcome);
    }
    this.logger.log(`🌱 Permission: ${tally.toString()}`);
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

  /**
   * Writes one row of "this role may do this thing, here".
   *
   * Two things changed here. The scope and its conditions are seed-owned —
   * nothing in the panel edits a single row's scope, only the whole matrix —
   * so they are kept in step on every run. And when a role stops being
   * office-limited, the old `{ officeId: '$office' }` condition is *removed*
   * rather than left behind. Before, it stayed on the row for ever, so a role
   * moved from one branch to everywhere went on seeing one branch.
   */
  private async upsertRolePermission(input: {
    roleId: Types.ObjectId;
    action: string;
    subject: string;
    scope: ScopeEnum;
    conditions?: Record<string, unknown>;
    audit?: AuditContextDto;
  }): Promise<Types.ObjectId | undefined> {
    const { roleId, action, subject, scope, conditions, audit } = input;

    const permissionDoc = await this.permissionModel.findOne({
      action,
      subject,
    } as Record<string, unknown>);
    if (!permissionDoc) return undefined;

    const filter = { roleId, permissionId: permissionDoc._id };
    const existing = await this.rolePermissionModel.findOne(filter);

    if (!existing) {
      const created = await this.rolePermissionModel.create({
        ...filter,
        scope,
        ...(conditions ? { conditions } : {}),
      });
      return created._id;
    }

    const scopeMoved = existing.scope !== scope;
    const conditionsMoved =
      JSON.stringify(existing.conditions ?? null) !==
      JSON.stringify(conditions ?? null);

    // Nothing to say: leave the row untouched rather than writing the same
    // values back over themselves and moving its "last updated".
    if (!scopeMoved && !conditionsMoved) return existing._id;

    // A condition that no longer applies has to go. Leaving it behind means
    // the role keeps a limit the seed says it should not have — which is how
    // a role moved from one branch to everywhere went on seeing one branch.
    const update = conditions
      ? { $set: { scope, conditions } }
      : { $set: { scope }, $unset: { conditions: '' } };

    await this.rolePermissionModel.findOneAndUpdate(filter, update, {
      context: audit,
    } as never);

    return existing._id;
  }

  /**
   * What each role may do.
   *
   * **Additive by default, and deliberately so.** The permissions matrix in
   * the panel is a real screen people use: saving it replaces a role's rows
   * outright. If the seed treated its own map as the final word, every run
   * would undo whatever was set there — and it runs on demand, so nobody
   * would connect the two.
   *
   * Set `SEED_RECONCILE_PERMISSIONS=YES` to make the map the final word for
   * seeded roles. That is the right switch when the map itself is the record
   * of who may do what, and the wrong one the moment anybody starts editing
   * roles in the panel. It never touches a role somebody created by hand —
   * only roles the seed itself made, which are the ones carrying a `seedKey`.
   */
  private async seedRolePermissions() {
    const audit = await this.seedAudit('what each role may do — seed');
    const authoritative = process.env.SEED_RECONCILE_PERMISSIONS === 'YES';
    let written = 0;
    let removed = 0;

    const mappings = [
      // Staff roles: an OFFICE-scoped role gets `{ officeId: '$office' }` on
      // the subjects that carry an office, so it sees its own branch only.
      ...seed.rolePermissionMap.map((mapping) => ({
        roleSeedKey: mapping.roleSeedKey,
        scope: mapping.scope,
        permissions: mapping.permissions.map((permission) => ({
          action: permission.action,
          subject: permission.subject,
          conditions:
            mapping.scope === ScopeEnum.OFFICE &&
            SeederService.OFFICE_OWNED.has(permission.subject)
              ? { officeId: '$office' }
              : undefined,
        })),
      })),
      // External self-service roles: read-your-own, via `{ field: '$self' }`.
      ...seed.selfRolePermissionMap.map((mapping) => ({
        roleSeedKey: mapping.roleSeedKey,
        scope: mapping.scope,
        permissions: mapping.permissions.map((permission) => ({
          action: permission.action,
          subject: permission.subject,
          conditions: permission.conditions as
            | Record<string, unknown>
            | undefined,
        })),
      })),
    ];

    for (const mapping of mappings) {
      const role = await this.roleModel.findOne({
        seedKey: mapping.roleSeedKey,
      });
      if (!role) continue;

      const keep: Types.ObjectId[] = [];
      for (const permission of mapping.permissions) {
        const id = await this.upsertRolePermission({
          audit,
          roleId: role._id,
          scope: mapping.scope,
          action: permission.action,
          subject: permission.subject,
          conditions: permission.conditions,
        });
        if (id) {
          keep.push(id);
          written++;
        }
      }

      if (authoritative) {
        const gone = await this.rolePermissionModel.deleteMany({
          roleId: role._id,
          _id: { $nin: keep },
        });
        removed += gone.deletedCount ?? 0;
      }
    }

    this.logger.log(
      `🌱 Role permissions: ${written} in the map${
        authoritative ? `, ${removed} removed as no longer listed` : ''
      }`,
    );
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

  /**
   * Who the trail credits a seeded write to, and why.
   *
   * Every audited write owes the history an explanation. A seed has no request
   * behind it and no header to read one from, so it states its reason outright
   * and signs it with the bootstrap admin.
   *
   * On the very first run of a brand new database there is no admin yet — the
   * roles have to exist before one can be created. Those first few rows are
   * recorded with no name against them, which is honest: nobody made them.
   */
  private adminIdCache?: Types.ObjectId;

  private async seedAudit(reason: string): Promise<AuditContextDto> {
    if (!this.adminIdCache) {
      const admin = await this.findAdminUser();
      // On a brand new database the admin does not exist yet, and cannot: it
      // needs a user type and a role, which are themselves seeded rows. So the
      // id is decided up front and the account is created under it later in
      // the same run. Every history entry the run writes then names the
      // account it belongs to, including the ones written before it existed.
      this.adminIdCache = admin?._id ?? new Types.ObjectId();
    }
    return systemAuditContext(this.adminIdCache, reason);
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

    // Self-attributed: this is the very first User ever created, so there is
    // no existing admin to credit as changedBy.
    //
    // The id is whatever the run has already been signing its history with —
    // the reference rows are seeded before this point and cannot wait for an
    // account that needs them to exist first. Taking that same id here is what
    // makes those earlier entries point at a real account.
    const adminUserId = (await this.seedAudit('bootstrap')).changedBy!;
    // Minted here like every other seeded row: a staff account with no
    // reference cannot be opened in the panel, and this is the account every
    // seeded history entry is attributed to.
    const reference = await this.codeService.generateUserReference();

    const adminUserDoc = new this.userModel({
      _id: adminUserId,
      reference,
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
    adminUserDoc.$locals.reason = 'created the first administrator account';
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

    /*
     * The secret is shown once, on the process's own stdout, and never written
     * to the log file.
     *
     * It used to go through the logger with the key, which put a live
     * credential into `logs/` — and into wherever those logs are shipped —
     * for the life of the file. It is a bearer secret: whoever reads it can
     * call the API as this client. It is not recoverable afterwards by
     * design; if it is missed, issue a new one rather than going looking.
     */
    process.stdout.write(
      `\n  API client "${seed.apiClient.name}" created.\n` +
        `  key:    ${key}\n` +
        `  secret: ${secret}\n` +
        `  Copy the secret now — it is not stored and cannot be shown again.\n\n`,
    );
    this.logger.log(`🌱 Default API client created with key ${key}`);
  }

  /**
   * The catalogue collections a manager can rename.
   *
   * Because the name is theirs to change, the seeder cannot use it to
   * recognise a row: rename "Women" to "Ladies" and a run keyed on the name
   * would decide the row had gone and create a second "Women" beside it.
   *
   * So the row is found by `seedKey` — a short label the seed owns, invisible
   * in the panel, that nothing can edit — and the name, description and status
   * are written once and never touched again.
   */
  private async seedCatalogueRows<T>(input: {
    model: Model<T>;
    rows: { seedKey: string; description?: string }[];
    mintReference: () => Promise<string>;
    label: string;
  }): Promise<void> {
    const { model, rows, mintReference, label } = input;
    const audit = await this.seedAudit(`${label.toLowerCase()} seed`);
    const tally = new SeedTally();

    for (const row of rows) {
      const { seedKey, ...rest } = row;
      const { outcome } = await upsertSeedRow<T>({
        model,
        audit,
        logger: this.logger,
        generate: async () => ({ reference: await mintReference() }),
        plan: {
          filter: { seedKey },
          onInsert: { ...rest, isActive: true },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 ${label}: ${tally.toString()}`);
  }

  /**
   * Currencies are the exception in this file: the ISO code cannot be changed
   * from anywhere, so it is already a stable key and needs no `seedKey`.
   * Everything else about a currency — its name, country, symbol, decimals —
   * is editable, so the seed writes it once.
   */
  private async seedCurrency() {
    const audit = await this.seedAudit('currency seed');
    const tally = new SeedTally();

    for (const currency of currencyData) {
      const { outcome } = await upsertSeedRow({
        model: this.currencyModel,
        audit,
        logger: this.logger,
        generate: async () => ({
          reference: await this.codeService.generateCurrencyReference(),
        }),
        plan: {
          filter: { isoCode: currency.isoCode },
          onInsert: { ...currency, isActive: true },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Currency: ${tally.toString()}`);
  }

  private async seedCategory() {
    await this.seedCatalogueRows({
      model: this.categoryModel,
      rows: categoryData,
      mintReference: () => this.codeService.generateCategoryReference(),
      label: 'Category',
    });
  }

  private async seedSubCategory() {
    await this.seedCatalogueRows({
      model: this.subCategoryModel,
      rows: subCategoryData,
      mintReference: () => this.codeService.generateSubCategoryReference(),
      label: 'Sub category',
    });
  }

  private async seedService() {
    await this.seedCatalogueRows({
      model: this.serviceModel,
      rows: serviceData,
      mintReference: () => this.codeService.generateServiceReference(),
      label: 'Service',
    });
  }

  private async seedServiceType() {
    await this.seedCatalogueRows({
      model: this.serviceTypeModel,
      rows: serviceTypeData,
      mintReference: () => this.codeService.generateServiceTypeReference(),
      label: 'Service type',
    });
  }

  /**
   * The starter price list.
   *
   * Every field on an item is editable from the panel — the name, the service
   * and type it sits under, the currency, both prices, what it is filed under.
   * So the seed owns none of it after the row exists. It creates the item,
   * files it once, and then stays out of the way. An agreed price correction
   * is a real decision somebody made; putting the list price back on the next
   * seed run would undo it and blame them for the change.
   */
  private async seedItemCatalog() {
    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    const audit = await this.seedAudit('price list seed');
    const tally = new SeedTally();

    for (const item of itemData) {
      // Looked up by `seedKey`, not by name: a manager may have renamed any
      // of these, and the link has to survive that.
      const [service, serviceType, category, subCategory] = await Promise.all([
        this.serviceModel.findOne({ seedKey: item.serviceKey }),
        this.serviceTypeModel.findOne({ seedKey: item.serviceTypeKey }),
        this.categoryModel.findOne({ seedKey: item.categoryKey }),
        this.subCategoryModel.findOne({ seedKey: item.subCategoryKey }),
      ]);
      if (!service || !serviceType || !category || !subCategory) {
        this.logger.warn(`Skipping seed item ${item.itemName}: lookup missing`);
        continue;
      }

      const { outcome, doc } = await upsertSeedRow<Item>({
        model: this.itemModel,
        audit,
        logger: this.logger,
        generate: async () => ({
          reference: await this.codeService.generateItemReference(),
          // The two derived fields, written at creation so a fresh database is
          // complete the moment it is seeded. Every later write that can
          // change an input recomputes them, so the seed never touches them
          // again.
          unitPrice: itemUnitPrice(item.priceLow, item.priceHigh),
          displayName: itemDisplayName({
            itemName: item.itemName,
            categoryNames: [category.categoryName],
            subCategoryNames: [subCategory.subCategoryName],
          }),
        }),
        plan: {
          filter: { seedKey: item.seedKey },
          onInsert: {
            itemName: item.itemName,
            serviceId: service._id,
            serviceTypeId: serviceType._id,
            currencyId: currency?._id,
            priceLow: item.priceLow,
            priceHigh: item.priceHigh,
            isActive: true,
          },
        },
      });
      tally.add(outcome);

      // Filing is only set up for an item the seed has just created. Which
      // categories an item sits under is editable, and re-adding the seed's
      // own choice on every run would put back a filing somebody removed.
      if (outcome === 'created') {
        const itemId = doc._id;
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
      }
    }

    this.logger.log(`🌱 Item: ${tally.toString()}`);
  }

  /**
   * Message templates.
   *
   * The one collection here whose wording the seed keeps for ever. There is no
   * screen and no endpoint that edits a template, so the file is the only
   * place the wording lives — and a corrected template should reach the
   * database on the next run rather than needing a hand-written update.
   */
  private async seedNotificationTemplates() {
    const tally = new SeedTally();

    for (const notification of notificationData) {
      const { templateName, channel, ...content } = notification;
      const { outcome } = await upsertSeedRow({
        model: this.notificationTemplateModel,
        logger: this.logger,
        plan: {
          // Same name can exist per channel — email and WhatsApp.
          filter: { templateName, channel },
          onInsert: { ...content },
          owned: { ...content },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Notification template: ${tally.toString()}`);
  }

  /**
   * Rates and thresholds, as data.
   *
   * All of these are meant to be tuned in production, so every one of them is
   * written once and then left to whoever tunes it.
   */
  private async seedSettings() {
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

    const audit = await this.seedAudit('settings seed');
    const tally = new SeedTally();

    for (const setting of defaults) {
      const { key, ...rest } = setting;
      const { outcome } = await upsertSeedRow({
        model: this.settingModel,
        audit,
        logger: this.logger,
        plan: {
          filter: { key, officeId: null },
          onInsert: { ...rest },
        },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Setting: ${tally.toString()}`);
  }

  /** Rewards config as data (§2.1) — created once, then the operator's. */
  private async seedRewards() {
    const audit = await this.seedAudit('rewards seed');
    const rules = new SeedTally();
    const tiers = new SeedTally();

    for (const rule of seed.rewardRules) {
      const { type, ...rest } = rule;
      const { outcome } = await upsertSeedRow({
        model: this.rewardRuleModel,
        audit,
        logger: this.logger,
        plan: { filter: { type }, onInsert: { ...rest } },
      });
      rules.add(outcome);
    }

    for (const tier of seed.rewardTiers) {
      const { tierName, ...rest } = tier;
      const { outcome } = await upsertSeedRow({
        model: this.rewardTierModel,
        audit,
        logger: this.logger,
        plan: { filter: { tierName }, onInsert: { ...rest } },
      });
      tiers.add(outcome);
    }

    this.logger.log(`🌱 Reward rule: ${rules.toString()}`);
    this.logger.log(`🌱 Reward tier: ${tiers.toString()}`);
  }

  /** Plan catalog as data (§2.2) — created once, then the operator's. */
  private async seedSubscriptionPlans() {
    const audit = await this.seedAudit('subscription plan seed');
    const tally = new SeedTally();

    for (const plan of seed.subscriptionPlans) {
      const { planName, ...rest } = plan;
      const { outcome } = await upsertSeedRow({
        model: this.subscriptionPlanModel,
        audit,
        logger: this.logger,
        plan: { filter: { planName }, onInsert: { ...rest } },
      });
      tally.add(outcome);
    }

    this.logger.log(`🌱 Subscription plan: ${tally.toString()}`);
  }

  /**
   * The lock key every instance competes for.
   *
   * Two people deploying at once, or a job that restarts, must not seed in
   * parallel: the reference generators check the database for a clash before
   * picking a code, and two runs can pick the same one before either has
   * saved. The crons already guard themselves this way.
   */
  private static readonly LOCK_KEY = 'seed:baseline';
  private static readonly LOCK_TTL_MS = 10 * 60 * 1000;

  /**
   * Seed the baseline data.
   *
   * Safe to run as often as you like. A row that exists is left exactly as it
   * is — the seeder creates what is missing and otherwise writes nothing at
   * all, not even a touch of `updatedAt`.
   *
   * This is called from `npm run seed`, never from application start-up.
   * Seeding on boot meant every restart rewrote rows people had edited, and
   * it happened after the API had already reported itself ready.
   */
  async run(): Promise<void> {
    const started = Date.now();
    const held = await this.leaderLock.acquire(
      SeederService.LOCK_KEY,
      SeederService.LOCK_TTL_MS,
    );

    if (!held) {
      this.logger.warn(
        'Another seed run holds the lock — stopping rather than writing alongside it.',
      );
      return;
    }

    try {
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

      this.logger.log(
        `✅ Seeding finished in ${Math.round((Date.now() - started) / 1000)}s`,
      );
    } finally {
      await this.leaderLock.release(SeederService.LOCK_KEY);
    }
  }
}
