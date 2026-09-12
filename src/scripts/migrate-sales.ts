/**
 * Brings the 2026 Sales sheet into the database — customers, orders, the
 * garments on them, and every payment taken against them.
 *
 *     npm run migrate:sales -- --customers data/customers.csv \
 *                              --orders    data/orders.csv \
 *                              --items     data/order-items.csv \
 *                              --payments  data/payments.csv \
 *                              --staff     data/staff.csv
 *
 * Reads and reports, and writes nothing, until you add `--commit`. The first
 * run against any database should be without it: the report says what every
 * row resolved to and what did not, and an import that cannot resolve an item,
 * an order or a member of staff is one that would land a half-ledger.
 *
 * Safe to run again. Each imported row carries the sheet's own code in
 * `legacyCode`, so a second run recognises what it already brought over and
 * leaves it exactly as it is — including a price somebody has since corrected
 * in the panel.
 *
 * What it will not do is invent. An order whose customer is missing from the
 * customers tab, a payment against an order that is not in the orders tab, a
 * garment whose label matches nothing in the catalogue — each is reported and
 * skipped, never guessed at.
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { readFileSync } from 'node:fs';
import { Model, Types } from 'mongoose';
import { RedisModule } from '../helper/redis/redis.module';
import { CodeGeneratorService } from '../helper/service/code-generator.service';
import { systemAuditContext } from '../helper/service/audit-context';
import { SchemaModule } from '../schema/schema.module';
import {
  computeFlagged,
  computePaymentPeriod,
  computePaymentStatus,
} from '../api/payment/payment-status.util';
import { Currency } from '../schema/catalog/currency.schema';
import { Item } from '../schema/catalog/item.schema';
import { Office } from '../schema/office/office.schema';
import { OfficeUser } from '../schema/office/office-user.schema';
import { Order } from '../schema/order/order.schema';
import { OrderItem } from '../schema/order/order-item.schema';
import { OrderStatus } from '../schema/order/order-status.schema';
import { Payment } from '../schema/payment/payment.schema';
import { PaymentMethod } from '../schema/payment/payment-method.schema';
import { PaymentType } from '../schema/payment/payment-type.schema';
import { PaymentTypeEnum } from '../schema/payment/payment.dto';
import { Role } from '../schema/admin/role.schema';
import { UserRole } from '../schema/admin/user-role.schema';
import { Customer } from '../schema/user/customer.schema';
import { User } from '../schema/user/user.schema';
import { UserType } from '../schema/user/user-type.schema';
import {
  GenderEnum,
  PreferredLanguageEnum,
  UserTypeEum,
} from '../schema/user/user.dto';
import { OrderStatusEnum } from '../schema/order/order.dto';
import {
  normalisePaymentMethod,
  whatsappForm,
  parseCondition,
  parseCsv,
  parseDebtType,
  parseMoney,
  parseNumber,
  parsePhone,
  parsePricingModel,
  parseSheetDate,
  paymentLegacyCode,
  plainLabel,
} from './migrate-sales.parse';

/** The office the 2026 trade belongs to, unless `--office` says otherwise. */
const DEFAULT_OFFICE_SLUG = '105-bonadale';

const REASON = 'migrated from the 2026 Sales sheet';

type Options = {
  commit: boolean;
  officeSlug: string;
  files: {
    customers: string;
    orders: string;
    items: string;
    payments: string;
    staff: string;
  };
};

/** What the run did to one row, and what it could not do at all. */
class Tally {
  created = 0;
  unchanged = 0;
  skipped = 0;

  toString(): string {
    return `${this.created} created, ${this.unchanged} already there, ${this.skipped} skipped`;
  }
}

/**
 * A row the migration could not take, and why.
 *
 * Collected rather than thrown: one unreadable date should not hide the other
 * forty problems in the same file, and the point of the dry run is to see them
 * all at once.
 */
type Issue = { file: string; row: string; problem: string };

/**
 * A row as the run understands it, whether or not it was written.
 *
 * A dry run has to answer the same questions a real one does — does this
 * order's customer exist, does this payment's order — and it cannot do that
 * off the database, because on a dry run nothing was put there. So every
 * phase records what it resolved, and the later phases read that rather than
 * re-reading the database. Without this, a first dry run against an empty
 * database reports every order as orphaned and tells you nothing at all.
 */
type PlannedStaff = { fullName: string; userId?: Types.ObjectId };

type PlannedCustomer = { userId?: Types.ObjectId; legacyCode: string };

type PlannedOrder = {
  legacyCode: string;
  doc?: Order;
  customerCode: string;
  customerId?: Types.ObjectId;
  receivedAt: Date;
  totalAmount: number;
  statusId: Types.ObjectId;
  statusName: string;
};

export function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    const found = index >= 0 ? argv[index + 1] : undefined;
    // `--orders --items x` means the path was forgotten, not that the next
    // flag is a filename.
    return found && !found.startsWith('--') ? found : undefined;
  };

  // Every missing file named at once. Finding out about them one run at a
  // time is the same conversation five times over.
  const names = ['customers', 'orders', 'items', 'payments', 'staff'] as const;
  const missing = names.filter((flag) => !value(flag));

  if (missing.length) {
    throw new Error(
      `${missing.map((flag) => `--${flag} <path>`).join(', ')} ${
        missing.length === 1 ? 'is' : 'are'
      } required`,
    );
  }

  return {
    commit: argv.includes('--commit'),
    officeSlug: value('office') ?? DEFAULT_OFFICE_SLUG,
    files: {
      staff: value('staff')!,
      orders: value('orders')!,
      items: value('items')!,
      payments: value('payments')!,
      customers: value('customers')!,
    },
  };
}

/**
 * One person, however the sheet spelled them.
 *
 * "Cynthia Ndasi" in the payments tab and "Ndasi Cynthia" in the orders tab
 * are the same member of staff, so the key is the name's words in a fixed
 * order — which matches both without a list of aliases to maintain.
 */
export function staffKey(fullName: string): string {
  return plainLabel(fullName)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

async function main(): Promise<void> {
  const logger = new Logger('MigrateSales');
  const options = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(MigrateSalesModule, {
    logger: ['error', 'warn', 'log'],
  });

  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
  const userModel = model<User>(User.name);
  const roleModel = model<Role>(Role.name);
  const itemModel = model<Item>(Item.name);
  const orderModel = model<Order>(Order.name);
  const officeModel = model<Office>(Office.name);
  const paymentModel = model<Payment>(Payment.name);
  const customerModel = model<Customer>(Customer.name);
  const userTypeModel = model<UserType>(UserType.name);
  const userRoleModel = model<UserRole>(UserRole.name);
  const currencyModel = model<Currency>(Currency.name);
  const orderItemModel = model<OrderItem>(OrderItem.name);
  const officeUserModel = model<OfficeUser>(OfficeUser.name);
  const orderStatusModel = model<OrderStatus>(OrderStatus.name);
  const paymentTypeModel = model<PaymentType>(PaymentType.name);
  const paymentMethodModel = model<PaymentMethod>(PaymentMethod.name);
  const codeService = app.get(CodeGeneratorService);

  const issues: Issue[] = [];
  const note = (file: string, row: string, problem: string) =>
    issues.push({ file, row, problem });

  try {
    // ---------------------------------------------------------------- input
    const rows = {
      staff: parseCsv(readFileSync(options.files.staff, 'utf8')),
      orders: parseCsv(readFileSync(options.files.orders, 'utf8')),
      items: parseCsv(readFileSync(options.files.items, 'utf8')),
      payments: parseCsv(readFileSync(options.files.payments, 'utf8')),
      customers: parseCsv(readFileSync(options.files.customers, 'utf8')),
    };

    logger.log(
      `Read ${rows.customers.length} customers, ${rows.orders.length} orders, ` +
        `${rows.items.length} item lines, ${rows.payments.length} payments, ` +
        `${rows.staff.length} staff`,
    );

    // ------------------------------------------------------- reference rows
    const [office, xaf, customerType, adminType, paymentType] =
      await Promise.all([
        officeModel.findOne({ slug: options.officeSlug }),
        currencyModel.findOne({ isoCode: 'XAF' }),
        userTypeModel.findOne({ userTypeName: UserTypeEum.CUSTOMER }),
        userTypeModel.findOne({ userTypeName: UserTypeEum.ADMIN }),
        paymentTypeModel.findOne({ paymentTypeName: PaymentTypeEnum.PAYMENT }),
      ]);

    if (!office) {
      throw new Error(
        `No office with slug "${options.officeSlug}". Run npm run seed first.`,
      );
    }
    if (!xaf || !customerType || !adminType || !paymentType) {
      throw new Error(
        'Reference data is missing (currency, user types or payment type). Run npm run seed first.',
      );
    }

    const statuses = new Map(
      (await orderStatusModel.find()).map((row) => [row.orderStatusName, row]),
    );
    const methods = new Map(
      (await paymentMethodModel.find()).map((row) => [
        row.paymentMethodName,
        row,
      ]),
    );
    const items = new Map(
      (await itemModel.find().select('_id displayName serviceTypeId')).map(
        (row) => [row.displayName ?? '', row],
      ),
    );

    if (!items.size) {
      throw new Error('The item catalogue is empty. Run npm run seed first.');
    }

    // The actor every history row is attributed to. The migration is not a
    // person, so it borrows the bootstrap admin; without one there is nobody
    // to answer for these writes and the trail would be anonymous.
    const admin = await userModel
      .findOne({ userTypeId: adminType._id })
      .sort({ createdAt: 1 });

    if (!admin) {
      throw new Error(
        'No administrator account to attribute the import to. Run npm run seed first.',
      );
    }

    const audit = systemAuditContext(admin._id, REASON);
    const write = options.commit;

    // ---------------------------------------------------------------- staff
    const staffTally = new Tally();
    const staff = new Map<string, PlannedStaff>();

    for (const row of rows.staff) {
      const fullName = row['fullname'] || row['full name'] || '';
      const label = fullName || row['phone'];

      try {
        const phone = parsePhone(row['phone'], 'Staff phone');
        const roleSeedKey = row['role seedkey'] || row['role'] || '';
        const role = await roleModel.findOne({ seedKey: roleSeedKey });

        if (!role) {
          note('staff', label, `no role seeded under "${roleSeedKey}"`);
          staffTally.skipped += 1;
          continue;
        }

        const existing = await userModel.findOne({ phone });
        if (existing) {
          // Their password is their own from the moment the account exists —
          // re-running must not put the roster's starting one back.
          staff.set(staffKey(fullName), { fullName, userId: existing._id });
          staffTally.unchanged += 1;
          continue;
        }

        if (!write) {
          // Remembered without being written, so the orders and payments below
          // can still be checked against the roster.
          staff.set(staffKey(fullName), { fullName });
          staffTally.created += 1;
          continue;
        }

        const _id = new Types.ObjectId();
        const user = new userModel({
          _id,
          phone,
          reference: await codeService.generateUserReference(),
          firstName: row['firstname'] || row['first name'],
          lastName: row['lastname'] || row['last name'],
          email: row['email'] || undefined,
          whatsappPhone: whatsappForm(phone),
          userTypeId: adminType._id,
          gender:
            row['gender'] === 'Female' ? GenderEnum.FEMALE : GenderEnum.MALE,
          preferredLanguage: PreferredLanguageEnum.ENGLISH,
          // Staff sign in with a password and an OTP; the roster's plaintext
          // is hashed here and never logged, stored or reported.
          passwordHash: await codeService.hashPlainText(row['password']),
        });
        user.$locals.changedBy = admin._id;
        user.$locals.reason = REASON;
        await user.save();

        await userRoleModel.create({ userId: _id, roleId: role._id });
        await officeUserModel.create({
          userId: _id,
          officeId: office._id,
          roleId: role._id,
        });

        staff.set(staffKey(fullName), { fullName, userId: _id });
        staffTally.created += 1;
      } catch (error) {
        note('staff', label, message(error));
        staffTally.skipped += 1;
      }
    }

    logger.log(`👤 Staff: ${staffTally.toString()}`);

    // ------------------------------------------------------------ customers
    const customerTally = new Tally();
    const customerUsers = new Map<string, PlannedCustomer>();

    for (const row of rows.customers) {
      const code = row['customer code'];
      if (!code) continue;

      try {
        const phone = parsePhone(row['phone'], `${code} phone`);
        const email = row['email'] || undefined;

        const migrated = await customerModel.findOne({ legacyCode: code });
        if (migrated) {
          customerUsers.set(code, {
            legacyCode: code,
            userId: migrated.userId,
          });
          customerTally.unchanged += 1;
          continue;
        }

        // An account may already exist for this person: they have signed up
        // through the portal since, or — as with the owner, who appears in the
        // sheet as a customer of his own shop — they are already staff. Phone
        // and email are both unique on `User`, so both have to be looked at;
        // creating a second account would simply fail on the index, and
        // failing is the wrong answer when it is the same human being.
        const existingUser = await userModel.findOne({
          $or: [{ phone }, ...(email ? [{ email }] : [])],
        });

        if (existingUser) {
          const profile = await customerModel.findOne({
            userId: existingUser._id,
          });

          if (profile) {
            customerUsers.set(code, {
              legacyCode: code,
              userId: profile.userId,
            });
            customerTally.unchanged += 1;
            continue;
          }

          note(
            'customers',
            code,
            `an account already exists on ${existingUser.email ?? existingUser.phone}; the customer profile is filed against it rather than a second account`,
          );
        }

        if (!write) {
          // Nothing is created, but the orders below still need to know this
          // customer would have been.
          customerUsers.set(code, {
            legacyCode: code,
            userId: existingUser?._id,
          });
          customerTally.created += 1;
          continue;
        }

        const _id = existingUser?._id ?? new Types.ObjectId();

        if (!existingUser) {
          const user = new userModel({
            _id,
            phone,
            reference: await codeService.generateUserReference(),
            firstName: row['first name'] || row['firstname'],
            lastName: row['last name'] || row['lastname'],
            email,
            whatsappPhone: whatsappForm(
              row['whatsapp phone']
                ? parsePhone(row['whatsapp phone'], `${code} whatsapp`)
                : phone,
            ),
            userTypeId: customerType._id,
            gender:
              plainLabel(row['gender']).toLowerCase() === 'female'
                ? GenderEnum.FEMALE
                : GenderEnum.MALE,
            preferredLanguage: PreferredLanguageEnum.ENGLISH,
          });
          user.$locals.changedBy = admin._id;
          user.$locals.reason = REASON;
          await user.save();
        }

        const profile = new customerModel({
          userId: _id,
          legacyCode: code,
          homeOfficeId: office._id,
          pickupAddress: row['pickup address'] || undefined,
          customerCode: await codeService.generateCustomerCode(),
          referralCode: await codeService.generateReferralCode(),
          registeredAt:
            parseSheetDate(row['date register'], `${code} Date Register`) ??
            new Date(),
        });
        profile.$locals.changedBy = admin._id;
        profile.$locals.reason = REASON;
        await profile.save();

        customerUsers.set(code, { legacyCode: code, userId: _id });
        customerTally.created += 1;
      } catch (error) {
        note('customers', code, message(error));
        customerTally.skipped += 1;
      }
    }

    logger.log(`🧍 Customers: ${customerTally.toString()}`);

    // --------------------------------------------------------------- orders
    const orderTally = new Tally();
    const orders = new Map<string, PlannedOrder>();
    // What the sheet says was paid, kept to compare against what the payments
    // actually add up to.
    const sheetPaid = new Map<string, number>();

    for (const row of rows.orders) {
      const code = row['cf'] || row['order id'] || row['order code'];
      if (!code) continue;

      try {
        // Read before anything else, and for every row rather than only the
        // new ones: what the sheet claims was paid is checked against the
        // payments on every run, not just the run that imported them.
        sheetPaid.set(
          code,
          parseMoney(row['amount paid'] ?? '', `${code} Amount Paid`),
        );

        const existing = await orderModel.findOne({ legacyCode: code });
        if (existing) {
          const status = await orderStatusModel.findById(
            existing.orderStatusId,
          );
          orders.set(code, {
            legacyCode: code,
            doc: existing,
            customerCode: row['customer code'],
            customerId: existing.customerId,
            receivedAt: existing.receivedAt,
            totalAmount: existing.totalAmount,
            statusId: existing.orderStatusId,
            statusName: status?.orderStatusName ?? '',
          });
          orderTally.unchanged += 1;
          continue;
        }

        const customerCode = row['customer code'];
        const customer = customerUsers.get(customerCode);
        if (!customer) {
          note(
            'orders',
            code,
            `customer ${customerCode || '(blank)'} not imported`,
          );
          orderTally.skipped += 1;
          continue;
        }

        const statusName = plainLabel(row['order status']).toUpperCase();
        const status = statuses.get(statusName);
        if (!status) {
          note(
            'orders',
            code,
            `no order status called "${row['order status']}"`,
          );
          orderTally.skipped += 1;
          continue;
        }

        const receivedBy = staff.get(staffKey(row['received by']));
        if (!receivedBy && row['received by']) {
          note(
            'orders',
            code,
            `"${row['received by']}" is not in the staff roster`,
          );
          orderTally.skipped += 1;
          continue;
        }

        const receivedAt = parseSheetDate(
          row['date received'],
          `${code} Date Received`,
        );
        if (!receivedAt) {
          note('orders', code, 'Date Received is blank');
          orderTally.skipped += 1;
          continue;
        }

        const estimated =
          parseSheetDate(row['delivery date'], `${code} Delivery Date`) ??
          receivedAt;
        const delivered =
          parseSheetDate(row['actual delivery'], `${code} Actual Delivery`) ??
          (statusName === OrderStatusEnum.DELIVERED.toString()
            ? estimated
            : undefined);

        const discount = parseMoney(
          row['discount (fcfa)'] ?? row['discount'],
          `${code} Discount`,
        );
        const totalAmount = parseMoney(
          row['total amount (fcfa)'] ?? row['total amount'],
          `${code} Total Amount`,
        );

        const planned: PlannedOrder = {
          legacyCode: code,
          customerCode,
          customerId: customer.userId,
          receivedAt,
          totalAmount,
          statusId: status._id,
          statusName,
        };

        if (!write) {
          // Same as the customers above: the item and payment phases are
          // checked against this, so a dry run has to remember it.
          orders.set(code, planned);
          orderTally.created += 1;
          continue;
        }

        const actor = receivedBy?.userId ?? admin._id;
        const order = new orderModel({
          legacyCode: code,
          customerId: customer.userId,
          officeId: office._id,
          currencyId: xaf._id,
          orderCode: await codeService.generateOrderReference(),
          pricingModel: parsePricingModel(row['service type']),
          totalWeightKg: parseNumber(
            row['total weight (kg)'] ?? '',
            `${code} Total Weight`,
          ),
          // The gross figure before the counter's discount, so that
          // orderAmount − discountAmount is the total that was charged.
          orderAmount: totalAmount + discount,
          manualDiscount: discount,
          discountAmount: discount,
          totalAmount,
          // Money stays at zero until the payments below say otherwise: what
          // was actually received is the payments, not a column.
          amountPaid: 0,
          balanceDue: Math.max(0, totalAmount),
          receivedAt,
          estimatedDeliveryDate: estimated,
          deliveredAt: delivered,
          createdBy: actor,
          pickedUpBy: actor,
          orderStatusId: status._id,
          note: row['notes'] || undefined,
        });
        order.$locals.changedBy = admin._id;
        order.$locals.reason = REASON;
        await order.save();

        orders.set(code, { ...planned, doc: order });
        orderTally.created += 1;
      } catch (error) {
        note('orders', code, message(error));
        orderTally.skipped += 1;
      }
    }

    logger.log(`🧾 Orders: ${orderTally.toString()}`);

    // ---------------------------------------------------------- order items
    const itemTally = new Tally();
    // Lines already seen in this file, so a line the sheet repeats is told
    // apart from one a previous run imported.
    const seenLines = new Set<string>();

    for (const row of rows.items) {
      const code = row['order id'];
      if (!code) continue;

      const label = plainLabel(row['item type']);

      try {
        const order = orders.get(code);
        if (!order) {
          note(
            'items',
            `${code} / ${label}`,
            'no such order in the orders tab',
          );
          itemTally.skipped += 1;
          continue;
        }

        const item = items.get(label);
        if (!item) {
          note(
            'items',
            `${code} / ${label}`,
            'no catalogue item reads like this',
          );
          itemTally.skipped += 1;
          continue;
        }

        const quantity = parseNumber(
          row['quantity (pieces)'] ?? row['quantity'],
          `${code} Quantity`,
        );
        const unitPrice = parseMoney(
          row['unit price (xaf)'] ?? row['unit price'],
          `${code} Unit Price`,
        );
        const condition = parseCondition(row['condition']);
        const colour = plainLabel(row['colour'] || row['color']) || undefined;

        const lineTotal = parseMoney(
          row['total price'] ?? '',
          `${code} Total Price`,
        );
        if (lineTotal && lineTotal !== quantity * unitPrice) {
          note(
            'items',
            `${code} / ${label}`,
            `Total Price ${lineTotal} is not ${quantity} × ${unitPrice}`,
          );
        }

        // Two garments matching on item, service type, condition and colour
        // are the same thing counted twice, which is what identifies a line.
        const lineKey = `${code}|${label}|${condition}|${colour ?? ''}|${unitPrice}`;

        if (seenLines.has(lineKey)) {
          // Not a row this run already imported — a row the sheet itself
          // carries twice. Reported rather than merged: whether it is a
          // duplicate or a second batch of the same garment is a question for
          // whoever wrote it.
          note(
            'items',
            `${code} / ${label}`,
            'the sheet carries this line twice',
          );
          itemTally.skipped += 1;
          continue;
        }
        seenLines.add(lineKey);

        // Only a database row can already be there; a planned one cannot.
        const already = order.doc
          ? await orderItemModel.exists({
              colour,
              condition,
              unitPrice,
              itemId: item._id,
              orderId: order.doc._id,
            })
          : null;

        if (already) {
          itemTally.unchanged += 1;
          continue;
        }

        if (!write) {
          itemTally.created += 1;
          continue;
        }

        const line = new orderItemModel({
          quantity,
          unitPrice,
          condition,
          colour,
          orderId: order.doc!._id,
          itemId: item._id,
          // The sheet prices a line but never says which service type it was
          // washed under; the item's own is the only answer that is not a
          // guess.
          serviceTypeId: item.serviceTypeId,
          lineTotal: lineTotal || quantity * unitPrice,
        });
        line.$locals.changedBy = admin._id;
        line.$locals.reason = REASON;
        await line.save();

        itemTally.created += 1;
      } catch (error) {
        note('items', `${code} / ${label}`, message(error));
        itemTally.skipped += 1;
      }
    }

    logger.log(`👕 Order items: ${itemTally.toString()}`);

    // ------------------------------------------------------------- payments
    const paymentTally = new Tally();
    const paidByOrder = new Map<string, number>();

    for (const row of rows.payments) {
      const code = row['order id'];
      if (!code) continue;

      try {
        const order = orders.get(code);
        if (!order) {
          note('payments', code, 'no such order in the orders tab');
          paymentTally.skipped += 1;
          continue;
        }

        const paidAt = parseSheetDate(
          row['payment date'],
          `${code} Payment Date`,
        );
        if (!paidAt) {
          note('payments', code, 'Payment Date is blank');
          paymentTally.skipped += 1;
          continue;
        }

        const amount = parseMoney(row['amount paid'], `${code} Amount Paid`);
        const methodName = normalisePaymentMethod(row['payment method']);
        const method = methods.get(methodName);
        if (!method) {
          note(
            'payments',
            code,
            `no payment method called "${row['payment method']}"`,
          );
          paymentTally.skipped += 1;
          continue;
        }

        const receivedBy = staff.get(staffKey(row['received by']));
        if (!receivedBy && row['received by']) {
          note(
            'payments',
            code,
            `"${row['received by']}" is not in the staff roster`,
          );
          paymentTally.skipped += 1;
          continue;
        }

        const legacyCode = paymentLegacyCode(code, paidAt, amount);
        const existing = await paymentModel.findOne({ legacyCode });

        paidByOrder.set(code, (paidByOrder.get(code) ?? 0) + amount);

        if (existing) {
          paymentTally.unchanged += 1;
          continue;
        }

        if (!write) {
          paymentTally.created += 1;
          continue;
        }

        const payment = new paymentModel({
          amount,
          paidAt,
          legacyCode,
          orderId: order.doc!._id,
          currencyId: xaf._id,
          officeId: office._id,
          customerId: order.customerId,
          paymentMethodId: method._id,
          paymentTypeId: paymentType._id,
          receivedBy: receivedBy?.userId ?? admin._id,
          // The sheet's own Debt Type where it has one; otherwise the two
          // dates say it, which is how the live path decides.
          paymentPeriod:
            parseDebtType(row['debt type']) ??
            computePaymentPeriod(paidAt, order.receivedAt),
          note: row['notes'] || undefined,
          reference: await codeService.generatePaymentReference(),
        });
        payment.$locals.changedBy = admin._id;
        payment.$locals.reason = REASON;
        await payment.save();

        paymentTally.created += 1;
      } catch (error) {
        note('payments', code, message(error));
        paymentTally.skipped += 1;
      }
    }

    logger.log(`💰 Payments: ${paymentTally.toString()}`);

    // -------------------------------------------------------- what is owed
    // Recomputed from the payments that actually landed, never copied from
    // the sheet — the database has to agree with itself.
    let mismatches = 0;

    for (const [code, order] of orders) {
      const amountPaid = paidByOrder.get(code) ?? 0;
      const claimed = sheetPaid.get(code);

      if (claimed !== undefined && claimed !== amountPaid) {
        note(
          'payments',
          code,
          `the sheet says ${claimed} paid, its payment rows add up to ${amountPaid}`,
        );
        mismatches += 1;
      }

      if (!write || !order.doc) continue;

      const paymentStatus = computePaymentStatus(amountPaid, order.totalAmount);
      // Floored at zero, as `PaymentService` floors it: an order paid more
      // than it was worth owes nothing, and a negative balance would be
      // counted as a debt by everything that sums this column. The overpayment
      // is not lost — it is what OVERPAID says, and the order is flagged.
      const balanceDue = Math.max(0, order.totalAmount - amountPaid);
      const flagged = computeFlagged(order.statusName, paymentStatus);

      // Only when it moved. A re-run that writes the same figures back would
      // touch `updatedAt` and leave a history entry on every order in the
      // ledger, saying a change happened when none did.
      const settled =
        order.doc.amountPaid === amountPaid &&
        order.doc.balanceDue === balanceDue &&
        order.doc.paymentStatus === paymentStatus &&
        order.doc.flagged === flagged;

      if (settled) continue;

      await orderModel.findOneAndUpdate(
        { _id: order.doc._id },
        { $set: { amountPaid, paymentStatus, balanceDue, flagged } },
        { context: audit } as never,
      );
    }

    if (write) {
      // The customer rollups, from the orders and payments that landed rather
      // than from the sheet's own columns.
      for (const [, customer] of customerUsers) {
        if (!customer.userId) continue;

        const customerOrders = [...orders.entries()].filter(
          ([, order]) => order.customerCode === customer.legacyCode,
        );
        if (!customerOrders.length) continue;

        const totalSpend = customerOrders.reduce(
          (sum, [code]) => sum + (paidByOrder.get(code) ?? 0),
          0,
        );
        const lastOrderAt = customerOrders
          .map(([, order]) => order.receivedAt)
          .sort((a, b) => +b - +a)[0];

        // Again only when it moved: re-running must not leave a history entry
        // against every customer saying their totals changed when they did
        // not.
        const current = await customerModel.findOne({
          userId: customer.userId,
        });
        const settled =
          current?.totalSpend === totalSpend &&
          current?.totalOrders === customerOrders.length &&
          +(current?.lastOrderAt ?? 0) === +lastOrderAt;

        if (settled) continue;

        await customerModel.findOneAndUpdate(
          { userId: customer.userId },
          {
            $set: {
              lastOrderAt,
              totalSpend,
              totalOrders: customerOrders.length,
            },
          },
          { context: audit } as never,
        );
      }
    }

    // ---------------------------------------------------------------- report
    logger.log('──────────────────────────────────────────────');

    if (issues.length) {
      logger.warn(`${issues.length} row(s) need attention:`);

      // Grouped by what went wrong, not listed in file order. Two hundred rows
      // with no phone number would otherwise bury the six orders whose money
      // does not add up, which are the ones somebody has to look at.
      const kinds = new Map<string, Issue[]>();
      for (const issue of issues) {
        // The row's own numbers and quoted values are what make one problem
        // look like two hundred, so they come out of the heading.
        const kind = `${issue.file}: ${issue.problem
          .replace(/"[^"]*"/g, '"…"')
          .replace(/\d+/g, 'N')}`;
        kinds.set(kind, [...(kinds.get(kind) ?? []), issue]);
      }

      for (const [kind, group] of [...kinds.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )) {
        logger.warn(`  ${group.length}× ${kind}`);
        for (const issue of group.slice(0, 5)) {
          logger.warn(`      ${issue.row}: ${issue.problem}`);
        }
        if (group.length > 5) {
          logger.warn(`      … and ${group.length - 5} more like it`);
        }
      }
    } else {
      logger.log('Every row resolved.');
    }

    if (mismatches) {
      logger.warn(
        `${mismatches} order(s) are recorded as paid a different amount than their payments add up to — the payments won.`,
      );
    }

    if (!write) {
      logger.log(
        'Dry run — nothing was written. Re-run with --commit once the report reads clean.',
      );
    }
  } finally {
    await app.close();
  }
}

/** The database, Redis and the code generator. Not the API. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SchemaModule,
    RedisModule,
  ],
  providers: [CodeGeneratorService],
})
class MigrateSalesModule {}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Only when run directly: a test importing `parseArgs` or `staffKey` must not
// open a database connection.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Sales migration failed:', error);
      process.exit(1);
    });
}
