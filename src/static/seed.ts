import {
  PermissionActionEnum,
  PlatformEnum,
  RoleEnum,
  ScopeEnum,
  SubjectEnum,
} from 'src/schema/admin/admin.dto';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';
import {
  RewardRuleTypeEnum,
  RewardTierMetricEnum,
} from 'src/schema/reward/reward.dto';

const crud = (subject: SubjectEnum) => [
  { subject, action: PermissionActionEnum.CREATE },
  { subject, action: PermissionActionEnum.READ },
  { subject, action: PermissionActionEnum.UPDATE },
  { subject, action: PermissionActionEnum.DELETE },
];

const readUpdate = (subject: SubjectEnum) => [
  { subject, action: PermissionActionEnum.READ },
  { subject, action: PermissionActionEnum.UPDATE },
];

export default {
  userType: [
    {
      userTypeName: 'CUSTOMER',
      description: 'End user who places laundry pickup and delivery orders.',
    },
    {
      userTypeName: 'ADMIN',
      description:
        'System administrator who manages operations, users, and settings.',
    },
    {
      userTypeName: 'AFFILIATE',
      description:
        'Partner or agent who refers customers or manages pickups on behalf of the business.',
    },
  ],

  officeType: [
    {
      officeTypeName: 'FACTORY',
      description: 'Location where clothes are washed, cleaned, and processed.',
    },
    {
      officeTypeName: 'OFFICE',
      description:
        'Administrative location for customer service and business operations.',
    },
  ],

  pickupStatus: [
    {
      pickupStatusName: 'PENDING',
      description:
        'Pickup request has been submitted by the customer and is awaiting confirmation.',
    },
    {
      pickupStatusName: 'CONFIRMED',
      description: 'Pickup request has been confirmed by customer service.',
    },
    {
      pickupStatusName: 'ASSIGNED',
      description:
        'Pickup request has been assigned to a rider for collection.',
    },
    {
      pickupStatusName: 'PICKED_UP',
      description:
        'Rider has collected the clothes and created the customer order.',
    },
    {
      pickupStatusName: 'CANCELLED',
      description: 'Pickup request has been cancelled.',
    },
  ],

  orderStatus: [
    {
      orderStatusName: 'DRAFT',
      description:
        'Order under preparation; not confirmed and not ready for payment.',
    },
    {
      orderStatusName: 'CONFIRMED',
      description:
        'Order has been approved by the customer and is awaiting arrival at the factory for processing.',
    },
    {
      orderStatusName: 'RECEIVED',
      description: 'Order has been received at the factory after pickup.',
    },
    {
      orderStatusName: 'WASHING',
      description: 'Clothes are currently being washed or cleaned.',
    },
    {
      orderStatusName: 'READY',
      description: 'Order is completed and ready for delivery.',
    },
    {
      orderStatusName: 'DELIVERED',
      description: 'Order has been delivered to the customer.',
    },
    {
      orderStatusName: 'CANCELLED',
      description: 'Order is cancelled by the client.',
    },
  ],

  paymentMethod: [
    {
      paymentMethodName: 'Cash',
      description: 'Payment is made in cash at pickup or delivery.',
    },
    {
      paymentMethodName: 'MTN Momo',
      description: 'Payment is made using MTN Mobile Money.',
    },
    {
      paymentMethodName: 'Orange Money',
      description: 'Payment is made using Orange Mobile Money.',
    },
  ],

  paymentType: [
    {
      paymentTypeName: 'PAYMENT',
      description: 'Money received from the customer for an order.',
    },
    {
      paymentTypeName: 'REFUND',
      description: 'Money returned to the customer for an order.',
    },
  ],

  offices: [
    {
      signedLink: '',
      city: 'Douala',
      region: 'Litoral',
      officeCode: 'DD-105',
      slug: '105-bonadale',
      officeName: 'DD 105 BONADALE',
      officeType: OfficeTypeEnum.FACTORY,
      address: '105 Bonadala, Petit Stade, behind Chateau Bonaberi',
    },
    {
      signedLink: '',
      city: 'Douala',
      slug: 'bonabo',
      region: 'Litoral',
      officeCode: 'DD-BNB',
      officeName: 'DD Bepanda Bonabo',
      officeType: OfficeTypeEnum.OFFICE,
      address: 'Bepanda Bonabo, directly opposite Génie Militaire.',
    },
  ],

  roles: [
    {
      roleName: RoleEnum.CO_FOUNDER,
      description:
        'Provides strategic direction, oversees company growth, and supports key decision-making across the business.',
    },
    {
      roleName: RoleEnum.MANAGER,
      description:
        'Manages daily operations, coordinates teams, and ensures business goals are met efficiently.',
    },
    {
      roleName: RoleEnum.OFFICE_MANAGER,
      description:
        'Oversees office administration, staff coordination, and ensures smooth day-to-day office operations.',
    },
    {
      roleName: RoleEnum.FACTORY_MANAGER,
      description:
        'Supervises factory operations, manages production workflows, and ensures quality and efficiency standards are maintained.',
    },
    {
      roleName: RoleEnum.CASHIER,
      description: 'Records payments and reconciles till at an office.',
    },
    {
      roleName: RoleEnum.DRIVER,
      description: 'Handles pickup and delivery assignments.',
    },
    {
      roleName: RoleEnum.LAUNDRY_STAFF,
      description: 'Processes orders through washing/drying/ironing stages.',
    },
    {
      roleName: RoleEnum.CUSTOMER_SERVICE,
      description:
        'Handles customer inquiries, order intake, and pickup scheduling.',
    },
    {
      roleName: RoleEnum.TREASURER,
      description: 'Oversees payments, reconciliation, and financial reports.',
    },
    {
      roleName: RoleEnum.SECRETARY,
      description: 'Handles office administration and record-keeping.',
    },
    {
      roleName: RoleEnum.CUSTOMER,
      description: 'External customer placing and tracking their own orders.',
    },
    {
      roleName: RoleEnum.REFERRER,
      description: 'External user who refers new customers.',
    },
    {
      roleName: RoleEnum.AFFILIATE,
      description: 'External partner earning commission on referred orders.',
    },
  ],

  permissions: [
    {
      subject: SubjectEnum.All,
      description: 'Full system access',
      action: PermissionActionEnum.MANAGE,
    },
    ...crud(SubjectEnum.Order),
    ...crud(SubjectEnum.OrderItem),
    ...crud(SubjectEnum.Payment),
    ...crud(SubjectEnum.PickupRequest),
    ...crud(SubjectEnum.PickupAssignment),
    ...crud(SubjectEnum.Customer),
    ...crud(SubjectEnum.User),
    ...crud(SubjectEnum.Office),
    ...crud(SubjectEnum.Item),
    ...crud(SubjectEnum.Promo),
    ...crud(SubjectEnum.AffiliatePartner),
    ...crud(SubjectEnum.AffiliateTransaction),
    ...readUpdate(SubjectEnum.OrderStatus),
    ...readUpdate(SubjectEnum.PickupStatus),
    ...readUpdate(SubjectEnum.PaymentType),
    ...readUpdate(SubjectEnum.PaymentMethod),
    ...readUpdate(SubjectEnum.Category),
    ...readUpdate(SubjectEnum.SubCategory),
    ...readUpdate(SubjectEnum.Service),
    ...readUpdate(SubjectEnum.ServiceType),
    ...readUpdate(SubjectEnum.Currency),
    ...crud(SubjectEnum.RewardRule),
    ...crud(SubjectEnum.RewardTier),
    ...crud(SubjectEnum.RewardLedger),
  ],

  // RolePermission mappings for the internal/staff roles — external
  // self-service roles (Customer/Referrer/Affiliate) are seeded as Role
  // rows only; their permission model is self-scoped conditions that
  // belong to the Phase 1 auth-flow work, not this foundational seed.
  rolePermissionMap: [
    {
      roleName: RoleEnum.MANAGER,
      scope: ScopeEnum.GLOBAL,
      permissions: [
        { subject: SubjectEnum.All, action: PermissionActionEnum.MANAGE },
      ],
    },
    {
      roleName: RoleEnum.OFFICE_MANAGER,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...crud(SubjectEnum.Order),
        ...crud(SubjectEnum.Payment),
        ...crud(SubjectEnum.PickupRequest),
        ...crud(SubjectEnum.Customer),
        ...readUpdate(SubjectEnum.FollowUp),
      ],
    },
    {
      roleName: RoleEnum.FACTORY_MANAGER,
      scope: ScopeEnum.OFFICE,
      permissions: [...crud(SubjectEnum.Order), ...crud(SubjectEnum.OrderItem)],
    },
    {
      roleName: RoleEnum.CASHIER,
      scope: ScopeEnum.OFFICE,
      permissions: [...crud(SubjectEnum.Payment)],
    },
    {
      roleName: RoleEnum.DRIVER,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...readUpdate(SubjectEnum.PickupRequest),
        ...readUpdate(SubjectEnum.PickupAssignment),
      ],
    },
    {
      roleName: RoleEnum.LAUNDRY_STAFF,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...readUpdate(SubjectEnum.Order),
        ...readUpdate(SubjectEnum.OrderItem),
      ],
    },
    {
      roleName: RoleEnum.CUSTOMER_SERVICE,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...crud(SubjectEnum.Customer),
        ...crud(SubjectEnum.Order),
        ...crud(SubjectEnum.PickupRequest),
        ...readUpdate(SubjectEnum.FollowUp),
        // Customers are not office-owned (§1), so reward reads are unscoped.
        {
          subject: SubjectEnum.RewardLedger,
          action: PermissionActionEnum.READ,
        },
        { subject: SubjectEnum.RewardRule, action: PermissionActionEnum.READ },
        { subject: SubjectEnum.RewardTier, action: PermissionActionEnum.READ },
      ],
    },
    {
      roleName: RoleEnum.TREASURER,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...crud(SubjectEnum.Payment),
        ...readUpdate(SubjectEnum.PaymentType),
        ...readUpdate(SubjectEnum.PaymentMethod),
      ],
    },
    {
      roleName: RoleEnum.SECRETARY,
      scope: ScopeEnum.OFFICE,
      permissions: [
        ...readUpdate(SubjectEnum.Office),
        ...readUpdate(SubjectEnum.User),
      ],
    },
  ],

  // Self-scoped external roles: read-own only. `$self` resolves to the caller's
  // user id at ability-build time; enforcement is by query (a get-by-id for
  // someone else's record simply returns nothing).
  selfRolePermissionMap: [
    {
      roleName: RoleEnum.CUSTOMER,
      scope: ScopeEnum.GLOBAL,
      permissions: [
        {
          subject: SubjectEnum.Customer,
          action: PermissionActionEnum.READ,
          conditions: { userId: '$self' },
        },
        {
          subject: SubjectEnum.Order,
          action: PermissionActionEnum.READ,
          conditions: { customerId: '$self' },
        },
        {
          subject: SubjectEnum.Payment,
          action: PermissionActionEnum.READ,
          conditions: { customerId: '$self' },
        },
        // Rewards: own ledger reads + own redemption; rules/tiers are
        // customer-visible config (no conditions).
        {
          subject: SubjectEnum.RewardLedger,
          action: PermissionActionEnum.READ,
          conditions: { customerId: '$self' },
        },
        {
          subject: SubjectEnum.RewardLedger,
          action: PermissionActionEnum.CREATE,
          conditions: { customerId: '$self' },
        },
        {
          subject: SubjectEnum.RewardRule,
          action: PermissionActionEnum.READ,
        },
        {
          subject: SubjectEnum.RewardTier,
          action: PermissionActionEnum.READ,
        },
      ],
    },
    {
      roleName: RoleEnum.REFERRER,
      scope: ScopeEnum.GLOBAL,
      permissions: [
        {
          subject: SubjectEnum.Customer,
          action: PermissionActionEnum.READ,
          conditions: { userId: '$self' },
        },
      ],
    },
    {
      roleName: RoleEnum.AFFILIATE,
      scope: ScopeEnum.GLOBAL,
      permissions: [
        {
          subject: SubjectEnum.Customer,
          action: PermissionActionEnum.READ,
          conditions: { userId: '$self' },
        },
      ],
    },
  ],

  apiClient: {
    name: 'System',
    description: 'Created by the system by default',
    scope: [PlatformEnum.WEB, PlatformEnum.MOBILE, PlatformEnum.MICRO_SERVICE],
  },

  // Rewards engine defaults (§2.1) — placeholder economics, tuned as DATA
  // (PUT /rewards/rules|tiers), never a deploy. $setOnInsert on re-seed.
  rewardRules: [
    {
      type: RewardRuleTypeEnum.ACCRUAL,
      criteria: { per: 100, points: 1 },
      description: '1 point per 100 XAF paid',
    },
    {
      type: RewardRuleTypeEnum.MILESTONE,
      criteria: { everyNthOrder: 5, points: 500 },
      description:
        'Every 5th paid order earns a 500-point bonus (free-wash equivalent)',
    },
  ],

  rewardTiers: [
    {
      tierName: 'Standard',
      metric: RewardTierMetricEnum.SPEND,
      threshold: 0,
      rank: 0,
      perk: { description: 'Base tier' },
    },
    {
      tierName: 'Silver',
      metric: RewardTierMetricEnum.SPEND,
      threshold: 100000,
      rank: 1,
      perk: { description: 'Priority pickup', priorityPickup: true },
    },
    {
      tierName: 'Gold',
      metric: RewardTierMetricEnum.SPEND,
      threshold: 500000,
      rank: 2,
      perk: {
        description: 'Priority pickup + 5% off',
        priorityPickup: true,
        discountPercent: 5,
      },
    },
  ],
};
