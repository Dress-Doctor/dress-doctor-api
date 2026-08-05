/**
 * Standalone test-data seeder — DEV/LOCAL ONLY.
 *
 * Boots the full app context (so the baseline reference seeder in
 * `AppModule.onModuleInit` runs first), then layers on a small set of
 * login-ready fixtures you can hit the API with:
 *
 *   - 2 customers (OTP-only): log in with `identifier: <phone>` → WhatsApp OTP.
 *   - 1 staff Manager (2FA): log in with the email → email OTP, or the phone →
 *     WhatsApp OTP; both require the password below.
 *
 * Everything is idempotent (keyed on phone / userId), so re-running only fills
 * gaps — it never duplicates or clobbers edited rows.
 *
 * Run:  npm run seed:test
 * (equivalently: ts-node -r tsconfig-paths/register src/scripts/seed-test-data.ts)
 *
 * OTP delivery is async via the notification queue; locally the plaintext code
 * is not sent anywhere real — read it from the worker logs / Redis, or capture
 * it the way the e2e suite does. See the printed summary at the end.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from './../app.module';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { RoleEnum } from './../schema/admin/admin.dto';
import { ApiClient } from './../schema/admin/api-client.schema';
import { Role } from './../schema/admin/role.schema';
import { UserRole } from './../schema/admin/user-role.schema';
import { Currency } from './../schema/catalog/currency.schema';
import { Item } from './../schema/catalog/item.schema';
import { OfficeUser } from './../schema/office/office-user.schema';
import { Office } from './../schema/office/office.schema';
import { OrderItem } from './../schema/order/order-item.schema';
import { OrderStatus } from './../schema/order/order-status.schema';
import {
  OrderItemConditionEnum,
  OrderPaymentStatusEnum,
  OrderStatusEnum,
  PricingModelEnum,
} from './../schema/order/order.dto';
import { Order } from './../schema/order/order.schema';
import { PaymentMethod } from './../schema/payment/payment-method.schema';
import { PaymentType } from './../schema/payment/payment-type.schema';
import {
  DebtTypeEnum,
  PaymentMethodEnum,
  PaymentTypeEnum,
} from './../schema/payment/payment.dto';
import { Payment } from './../schema/payment/payment.schema';
import { PickupRequest } from './../schema/pickup/pickup-request.schema';
import { PickupStatus } from './../schema/pickup/pickup-status.schema';
import {
  PickupStatusEnum,
  PickupTimeEnum,
} from './../schema/pickup/pickup.dto';
import { Customer } from './../schema/user/customer.schema';
import { UserType } from './../schema/user/user-type.schema';
import {
  GenderEnum,
  PreferredLanguageEnum,
  UserTypeEum,
} from './../schema/user/user.dto';
import { User } from './../schema/user/user.schema';

const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? 'Manager@12345';

type CustomerFixture = {
  firstName: string;
  lastName: string;
  phone: string;
  whatsappPhone: string;
  gender: GenderEnum;
};

const CUSTOMERS: CustomerFixture[] = [
  {
    firstName: 'Alice',
    lastName: 'Test',
    phone: '690000001',
    whatsappPhone: '237690000001',
    gender: GenderEnum.FEMALE,
  },
  {
    firstName: 'Bob',
    lastName: 'Test',
    phone: '690000002',
    whatsappPhone: '237690000002',
    gender: GenderEnum.MALE,
  },
];

const STAFF = {
  firstName: 'Mia',
  lastName: 'Manager',
  phone: '680000001',
  whatsappPhone: '237680000001',
  email: 'manager.test@dressdoctor.io',
  gender: GenderEnum.FEMALE,
};

async function bootstrap(): Promise<void> {
  const logger = new Logger('SeedTestData');
  const app = await NestFactory.createApplicationContext(AppModule, {
    // Keep the seeder's own logs; silence debug noise.
    logger: ['log', 'warn', 'error'],
  });

  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
  const userModel = model<User>(User.name);
  const customerModel = model<Customer>(Customer.name);
  const userTypeModel = model<UserType>(UserType.name);
  const roleModel = model<Role>(Role.name);
  const userRoleModel = model<UserRole>(UserRole.name);
  const officeModel = model<Office>(Office.name);
  const officeUserModel = model<OfficeUser>(OfficeUser.name);
  const apiClientModel = model<ApiClient>(ApiClient.name);
  const orderModel = model<Order>(Order.name);
  const orderItemModel = model<OrderItem>(OrderItem.name);
  const paymentModel = model<Payment>(Payment.name);
  const pickupModel = model<PickupRequest>(PickupRequest.name);
  const itemModel = model<Item>(Item.name);
  const currencyModel = model<Currency>(Currency.name);
  const orderStatusModel = model<OrderStatus>(OrderStatus.name);
  const pickupStatusModel = model<PickupStatus>(PickupStatus.name);
  const paymentMethodModel = model<PaymentMethod>(PaymentMethod.name);
  const paymentTypeModel = model<PaymentType>(PaymentType.name);
  const codeService = app.get(CodeGeneratorService);

  // The baseline seeder is fire-and-forget in onModuleInit; wait for its tail
  // (the System API client is created last) before layering test data on top.
  logger.log('Waiting for baseline reference seed to finish…');
  for (let i = 0; i < 240; i++) {
    if (await apiClientModel.findOne({ name: 'System' })) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const [customerType, adminType, customerRole, managerRole, office, creator] =
    await Promise.all([
      userTypeModel.findOne({ userTypeName: UserTypeEum.CUSTOMER }),
      userTypeModel.findOne({ userTypeName: UserTypeEum.ADMIN }),
      roleModel.findOne({ roleName: RoleEnum.CUSTOMER.toString() }),
      roleModel.findOne({ roleName: RoleEnum.MANAGER.toString() }),
      officeModel.findOne().sort({ createdAt: 1 }),
      userModel.findOne({ phone: '237670678660' }), // bootstrap admin, if any
    ]);

  if (!customerType || !adminType || !customerRole || !managerRole) {
    throw new Error(
      'Baseline seed incomplete (missing user types or roles). Aborting.',
    );
  }
  if (!office) {
    throw new Error('No office seeded — cannot attach staff. Aborting.');
  }

  // Audit history requires a changedBy. Prefer the bootstrap admin as the
  // actor, but fall back to self-attribution (the new row's own _id) so the
  // script works on a DB where the admin was never seeded.
  const adminId = creator?._id;

  // Create a User by phone if absent; returns the (existing or new) doc.
  const ensureUser = async (data: Partial<User>): Promise<User> => {
    const existing = await userModel.findOne({ phone: data.phone });
    if (existing) return existing;
    const _id = new Types.ObjectId();
    const doc = new userModel({ _id, ...data });
    doc.$locals.changedBy = adminId ?? _id;
    return doc.save();
  };

  const ensureUserRole = async (
    userId: Types.ObjectId,
    roleId: Types.ObjectId,
  ): Promise<void> => {
    const exists = await userRoleModel.exists({ userId, roleId });
    if (!exists) await userRoleModel.create({ userId, roleId });
  };

  // --- Customers (OTP-only) ---
  const customerUsers = new Map<string, User>();
  for (const c of CUSTOMERS) {
    const user = await ensureUser({
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      whatsappPhone: c.whatsappPhone,
      gender: c.gender,
      userTypeId: customerType._id,
      preferredLanguage: PreferredLanguageEnum.ENGLISH,
    });
    customerUsers.set(c.phone, user);

    await ensureUserRole(user._id, customerRole._id);

    const hasProfile = await customerModel.exists({ userId: user._id });
    if (!hasProfile) {
      const [customerCode, referralCode] = await Promise.all([
        codeService.generateCustomerCode(),
        codeService.generateReferralCode(),
      ]);
      const profile = new customerModel({
        userId: user._id,
        customerCode,
        referralCode,
        homeOfficeId: office._id,
      });
      profile.$locals.changedBy = adminId ?? user._id;
      await profile.save();
    }
    logger.log(`✅ Customer ready: ${c.firstName} (${c.phone})`);
  }

  // --- Staff manager (password + OTP) ---
  const passwordHash = await codeService.hashPlainText(STAFF_PASSWORD);
  const staffUser = await ensureUser({
    firstName: STAFF.firstName,
    lastName: STAFF.lastName,
    phone: STAFF.phone,
    whatsappPhone: STAFF.whatsappPhone,
    email: STAFF.email,
    gender: STAFF.gender,
    userTypeId: adminType._id,
    passwordHash,
    preferredLanguage: PreferredLanguageEnum.ENGLISH,
  });
  await ensureUserRole(staffUser._id, managerRole._id);

  const hasOfficeLink = await officeUserModel.exists({
    userId: staffUser._id,
    officeId: office._id,
  });
  if (!hasOfficeLink) {
    await officeUserModel.create({
      userId: staffUser._id,
      officeId: office._id,
      roleId: managerRole._id,
    });
  }
  logger.log(`✅ Staff ready: ${STAFF.firstName} (${STAFF.email})`);

  // --- Orders / pickups / payments ---
  // These normally flow through the request-scoped order/payment services
  // (CASL + office scope + a signed-in actor), which a standalone script has
  // no HTTP context for. So we write coherent rows directly, computing the
  // same fields the services would (orderAmount, amountPaid/balanceDue,
  // paymentStatus, flagged) so the fixtures stay self-consistent.
  const alice = customerUsers.get('690000001');
  const bob = customerUsers.get('690000002');
  const alreadySeeded =
    alice && (await orderModel.exists({ customerId: alice._id }));

  if (!alice || !bob) {
    logger.warn('Customers missing — skipping order/pickup/payment fixtures.');
  } else if (alreadySeeded) {
    logger.log('↩︎  Orders already seeded for the test customers — skipping.');
  } else {
    const [
      xaf,
      items,
      system,
      cash,
      paymentType,
      pickedUp,
      statusDelivered,
      statusReady,
      statusConfirmed,
    ] = await Promise.all([
      currencyModel.findOne({ isoCode: 'XAF' }),
      itemModel.find().limit(2),
      apiClientModel.findOne({ name: 'System' }),
      paymentMethodModel.findOne({
        paymentMethodName: PaymentMethodEnum.CASH,
      }),
      paymentTypeModel.findOne({
        paymentTypeName: PaymentTypeEnum.PAYMENT,
      }),
      pickupStatusModel.findOne({
        pickupStatusName: PickupStatusEnum.PICKED_UP,
      }),
      orderStatusModel.findOne({
        orderStatusName: OrderStatusEnum.DELIVERED,
      }),
      orderStatusModel.findOne({ orderStatusName: OrderStatusEnum.READY }),
      orderStatusModel.findOne({
        orderStatusName: OrderStatusEnum.CONFIRMED,
      }),
    ]);

    if (
      !xaf ||
      items.length < 2 ||
      !system ||
      !cash ||
      !paymentType ||
      !pickedUp ||
      !statusDelivered ||
      !statusReady ||
      !statusConfirmed
    ) {
      logger.warn(
        'Catalog/status lookups missing — skipping order fixtures. ' +
          'Seed the item catalog first (start the API once).',
      );
    } else {
      const actor = adminId ?? staffUser._id;
      const now = new Date();

      // Three scenarios exercising the computed fields:
      //  1. DELIVERED + fully paid (from a pickup)  → PAID,    not flagged
      //  2. READY + half paid                       → PARTIAL, flagged
      //  3. CONFIRMED + unpaid                      → UNPAID,  not flagged
      const scenarios = [
        {
          user: alice,
          status: statusDelivered,
          statusName: OrderStatusEnum.DELIVERED,
          paidFraction: 1,
          withPickup: true,
        },
        {
          user: alice,
          status: statusReady,
          statusName: OrderStatusEnum.READY,
          paidFraction: 0.5,
          withPickup: false,
        },
        {
          user: bob,
          status: statusConfirmed,
          statusName: OrderStatusEnum.CONFIRMED,
          paidFraction: 0,
          withPickup: false,
        },
      ];

      for (const s of scenarios) {
        const profile = await customerModel.findOne({ userId: s.user._id });

        // Two per-garment lines, priced from the catalog (PER_PIECE).
        const lines = items.map((item, i) => {
          const quantity = i === 0 ? 2 : 1;
          const unitPrice = item.priceLow;
          return {
            itemId: item._id,
            serviceTypeId: item.serviceTypeId,
            quantity,
            unitPrice,
            lineTotal: unitPrice * quantity,
          };
        });
        const orderAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0);
        const totalAmount = orderAmount;
        const amountPaid = Math.round(totalAmount * s.paidFraction);
        const balanceDue = totalAmount - amountPaid;
        const paymentStatus =
          amountPaid <= 0
            ? OrderPaymentStatusEnum.UNPAID
            : amountPaid >= totalAmount
              ? OrderPaymentStatusEnum.PAID
              : OrderPaymentStatusEnum.PARTIAL;
        const flagged =
          (s.statusName === OrderStatusEnum.READY ||
            s.statusName === OrderStatusEnum.DELIVERED) &&
          balanceDue > 0;

        // Optional pickup request the order was raised from.
        let pickupRequestId: Types.ObjectId | undefined;
        if (s.withPickup) {
          const reference = await codeService.generatePickupReference();
          const pickup = new pickupModel({
            apiClientId: system._id,
            customerId: s.user._id,
            reference,
            pickupAddress: 'Rue 1.234, Akwa, Douala',
            pickupDate: now,
            pickupTime: PickupTimeEnum.MORNING,
            pickupStatusId: pickedUp._id,
            confirmedBy: staffUser._id,
            officeId: office._id,
          });
          pickup.$locals.changedBy = actor;
          await pickup.save();
          pickupRequestId = pickup._id;
        }

        const orderCode = await codeService.generateOrderReference();
        const order = new orderModel({
          customerId: s.user._id,
          officeId: office._id,
          currencyId: xaf._id,
          pickupRequestId,
          orderCode,
          pricingModel: PricingModelEnum.PER_PIECE,
          totalWeightKg: 0,
          orderAmount,
          totalAmount,
          amountPaid,
          balanceDue,
          paymentStatus,
          flagged,
          receivedAt: now,
          estimatedDeliveryDate: new Date(now.getTime() + 2 * 86_400_000),
          deliveredAt:
            s.statusName === OrderStatusEnum.DELIVERED ? now : undefined,
          createdBy: staffUser._id,
          pickedUpBy: staffUser._id,
          orderStatusId: s.status._id,
        });
        order.$locals.changedBy = actor;
        await order.save();

        for (const l of lines) {
          const orderItem = new orderItemModel({
            orderId: order._id,
            itemId: l.itemId,
            serviceTypeId: l.serviceTypeId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            condition: OrderItemConditionEnum.NORMAL,
          });
          orderItem.$locals.changedBy = actor;
          await orderItem.save();
        }

        if (amountPaid > 0) {
          const payment = new paymentModel({
            orderId: order._id,
            customerId: profile?._id,
            officeId: office._id,
            paymentMethodId: cash._id,
            paymentTypeId: paymentType._id,
            amount: amountPaid,
            debtType: DebtTypeEnum.CURRENT,
            receivedBy: staffUser._id,
            paidAt: now,
            currencyId: xaf._id,
            note: 'Seeded test payment',
          });
          payment.$locals.changedBy = actor;
          await payment.save();
        }

        // Keep the customer rollups coherent: every order bumps lastOrderAt +
        // totalOrders; money actually received matures into totalSpend.
        await customerModel.updateOne(
          { userId: s.user._id },
          {
            $set: { lastOrderAt: now },
            $inc: { totalOrders: 1, totalSpend: amountPaid },
          },
          { context: { changedBy: actor } } as never,
        );

        logger.log(
          `✅ Order ${orderCode}: ${s.statusName}, ${paymentStatus}` +
            `${flagged ? ' (flagged)' : ''}${s.withPickup ? ' + pickup' : ''}`,
        );
      }
    }
  }

  // --- Summary ---
  logger.log('──────────────────────────────────────────────');
  logger.log(
    'Test fixtures ready. Log in via POST /api/v1/auth/initiate-login',
  );
  logger.log('(x-api-key / x-api-secret = the seeded "System" API client).');
  logger.log('');
  logger.log('Customers (OTP-only → WhatsApp OTP):');
  for (const c of CUSTOMERS) {
    logger.log(`  • { "identifier": "${c.phone}" }`);
  }
  logger.log('');
  logger.log('Staff manager (2FA → email OTP):');
  logger.log(
    `  • { "identifier": "${STAFF.email}", "password": "${STAFF_PASSWORD}" }`,
  );
  logger.log(
    `    or WhatsApp: { "identifier": "${STAFF.phone}", "password": "${STAFF_PASSWORD}" }`,
  );
  logger.log('');
  logger.log('Transactions (Alice unless noted):');
  logger.log('  • DELIVERED order from a pickup — fully PAID');
  logger.log('  • READY order — PARTIAL payment, flagged');
  logger.log('  • CONFIRMED order (Bob) — UNPAID');
  logger.log(
    '  → GET /api/v1/order and /api/v1/order/flagged (as the Manager).',
  );
  logger.log('');
  logger.log(
    'OTP is queued, not printed — read the code from worker logs/Redis.',
  );
  logger.log('──────────────────────────────────────────────');

  // Hard-exit rather than app.close(): the baseline seeder runs fire-and-forget
  // in AppModule.onModuleInit, so a graceful shutdown can tear down the Mongo
  // pool while one of its writes still holds a connection (MongoClientClosedError).
  // Our own fixtures are all awaited above; the seeds are idempotent, so killing
  // a stray background write is safe and re-runnable.
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('❌ Test-data seed failed:', err);
  process.exit(1);
});
