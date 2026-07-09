import { Injectable, Logger } from '@nestjs/common';
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
  private readonly phone = '237670678660';
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

    @InjectModel(Service.name) private readonly serviceModel: Model<Service>,

    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategory>,

    @InjectModel(ItemCategory.name)
    private readonly itemCategoryModel: Model<ItemCategory>,

    @InjectModel(ItemSubCategory.name)
    private readonly itemSubCategoryModel: Model<ItemSubCategory>,
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

  private async seedPaymentType() {
    const operations = seed.paymentType.map((paymentType) => ({
      updateOne: {
        filter: { paymentTypeName: paymentType.paymentTypeName },
        update: { $set: paymentType },
        upsert: true,
      },
    }));

    await this.paymentTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${seed.paymentType.length} data for Payment Types`,
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

  private async seedRolePermissions() {
    let count = 0;
    for (const mapping of seed.rolePermissionMap) {
      const role = await this.roleModel.findOne({
        roleName: mapping.roleName,
      });
      if (!role) continue;

      for (const permission of mapping.permissions) {
        const permissionDoc = await this.permissionModel.findOne({
          action: permission.action,
          subject: permission.subject,
        });
        if (!permissionDoc) continue;

        await this.rolePermissionModel.findOneAndUpdate(
          { roleId: role._id, permissionId: permissionDoc._id },
          {
            roleId: role._id,
            permissionId: permissionDoc._id,
            scope: mapping.scope,
          },
          { upsert: true },
        );
        count++;
      }
    }
    this.logger.log(`🌱 Done seeding ${count} data for RolePermission`);
  }

  private async seedAdmin() {
    const phone = this.phone;
    const email = 'fedjio.raymond@dressdoctor.io';
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
      whatsappPhone: '237670678660',
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
    const adminUser = await this.userModel.findOne({ phone: this.phone });
    const { key, secret, secretHash } =
      await this.codeService.generateApiClient();

    const apiClientExists = await this.apiClientModel.findOne({
      name: seed.apiClient.name,
    });
    if (apiClientExists) return;

    await this.apiClientModel.create({
      key,
      secretHash,
      ...seed.apiClient,
      createdBy: adminUser!._id,
    });

    this.logger.log(
      `🌱 Done seeding default API Client with ${JSON.stringify({ key, secret })}`,
    );
  }

  private async seedCurrency() {
    const operations = currencyData.map((currency) => ({
      updateOne: {
        filter: { isoCode: currency.isoCode },
        update: { $set: currency },
        upsert: true,
      },
    }));

    await this.currencyModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${currencyData.length} data for Currency`);
  }

  private async seedCategory() {
    const operations = categoryData.map((category) => ({
      updateOne: {
        filter: { categoryName: category.categoryName },
        update: { $set: category },
        upsert: true,
      },
    }));

    await this.categoryModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${categoryData.length} data for Category`);
  }

  private async seedSubCategory() {
    const operations = subCategoryData.map((subCategory) => ({
      updateOne: {
        filter: { subCategoryName: subCategory.subCategoryName },
        update: { $set: subCategory },
        upsert: true,
      },
    }));

    await this.subCategoryModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${subCategoryData.length} data for SubCategory`,
    );
  }

  private async seedService() {
    const operations = serviceData.map((service) => ({
      updateOne: {
        filter: { serviceName: service.serviceName },
        update: { $set: service },
        upsert: true,
      },
    }));

    await this.serviceModel.bulkWrite(operations);
    this.logger.log(`🌱 Done seeding ${serviceData.length} data for Service`);
  }

  private async seedServiceType() {
    const operations = serviceTypeData.map((serviceType) => ({
      updateOne: {
        filter: { serviceTypeName: serviceType.serviceTypeName },
        update: { $set: serviceType },
        upsert: true,
      },
    }));

    await this.serviceTypeModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${serviceTypeData.length} data for ServiceType`,
    );
  }

  private async seedItemCatalog() {
    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    const adminUser = await this.userModel.findOne({ phone: this.phone });

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

      const itemDoc = await this.itemModel.findOneAndUpdate(
        { itemName: item.itemName },
        {
          itemName: item.itemName,
          serviceId: service._id,
          serviceTypeId: serviceType._id,
          currencyId: currency?._id,
          priceLow: item.priceLow,
          priceHigh: item.priceHigh,
        },
        {
          context: { changedBy: adminUser?._id },
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

      const adminUser = await this.userModel.findOne({ phone: this.phone });
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

        const newItem = await this.itemModel.findOneAndUpdate(
          { itemName: item.item },
          {
            serviceId,
            serviceTypeId,
            itemName: item.item,
            currencyId: currency?._id,
            priceLow: Number(item['price low (xaf)'].replaceAll(',', '')),
            priceHigh: Number(item['price high (xaf)'].replaceAll(',', '')),
          },
          {
            context: { changedBy: adminUser?._id },
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
        filter: { templateName: notification.templateName },
        update: { $set: notification },
        upsert: true,
      },
    }));

    await this.notificationTemplateModel.bulkWrite(operations);
    this.logger.log(
      `🌱 Done seeding ${notificationData.length} data for NotificationTemplate`,
    );
  }

  async run(): Promise<void> {
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
