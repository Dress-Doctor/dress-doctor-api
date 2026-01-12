import { PermissionActionEnum, SubjectEnum } from 'src/schema/admin/admin.dto';
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
      description: 'Client books a pickup via website or mobile app.',
    },
    {
      pickupStatusName: 'CONFIRMED',
      description:
        'Customer Service contacts the client to confirm order details and pricing.',
    },
    {
      pickupStatusName: 'ASSIGNED',
      description: 'Pickup request is assigned to a rider.',
    },
    {
      pickupStatusName: 'PICKED_UP',
      description: 'Rider picks up clothes and creates the customer order.',
    },
    {
      pickupStatusName: 'IN_PROGRESS',
      description: 'Clothes are being washed or cleaned at the factory.',
    },
    {
      pickupStatusName: 'READY',
      description: 'Clothes are cleaned and ready for delivery.',
    },
    {
      pickupStatusName: 'DELIVERED',
      description:
        'Clothes are delivered to the client and the order is closed.',
    },
    {
      pickupStatusName: 'CANCELLED',
      description: 'Pickup request or order is cancelled by the client.',
    },
  ],

  orderStatus: [
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
  ],

  paymentMethod: [
    {
      paymentMethodName: 'CASH',
      description: 'Payment is made in cash at pickup or delivery.',
    },
    {
      paymentMethodName: 'MTN_MOBILE_MONEY',
      description: 'Payment is made using MTN Mobile Money.',
    },
    {
      paymentMethodName: 'ORANGE_MOBILE_MONEY',
      description: 'Payment is made using Orange Mobile Money.',
    },
  ],

  paymentStatus: [
    {
      paymentStatusName: 'PENDING',
      description: 'Payment has been initiated but not yet completed.',
    },
    {
      paymentStatusName: 'PAID',
      description: 'Payment has been successfully completed in full.',
    },
    {
      paymentStatusName: 'FAILED',
      description: 'Payment attempt was unsuccessful or declined.',
    },
    {
      paymentStatusName: 'PARTIAL',
      description: 'Payment was completed for only part of the total amount.',
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
};
