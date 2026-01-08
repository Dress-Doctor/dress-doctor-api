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
};
