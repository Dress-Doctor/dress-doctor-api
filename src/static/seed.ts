import {
  PermissionActionEnum,
  PlatformEnum,
  SubjectEnum,
} from 'src/schema/admin/admin.dto';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';

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

  paymentStatus: [
    {
      paymentStatusName: 'COMPLETED',
      description: 'Payment has been successfully completed in full.',
    },
    {
      paymentStatusName: 'FAILED',
      description: 'Payment attempt was unsuccessful or declined.',
    },
    {
      paymentStatusName: 'REFUNDED',
      description: 'Payment was successfully refunded.',
    },
  ],

  offices: [
    {
      signedLink: '',
      qrCodeUrl: '',
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
      qrCodeUrl: '',
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
      roleName: 'Co-Founder',
      description:
        'Provides strategic direction, oversees company growth, and supports key decision-making across the business.',
    },
    {
      roleName: 'Manager',
      description:
        'Manages daily operations, coordinates teams, and ensures business goals are met efficiently.',
    },
    {
      roleName: 'Office Manager',
      description:
        'Oversees office administration, staff coordination, and ensures smooth day-to-day office operations.',
    },
    {
      roleName: 'Factory Manager',
      description:
        'Supervises factory operations, manages production workflows, and ensures quality and efficiency standards are maintained.',
    },
  ],

  permissions: [
    {
      subject: SubjectEnum.All,
      description: 'Full system access',
      action: PermissionActionEnum.MANAGE,
    },
  ],

  apiClient: {
    name: 'System',
    description: 'Created by the system by default',
    scope: [PlatformEnum.WEB, PlatformEnum.MOBILE, PlatformEnum.MICRO_SERVICE],
  },
};
