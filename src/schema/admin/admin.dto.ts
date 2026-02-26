export enum PlatformEnum {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  MICRO_SERVICE = 'MICRO_SERVICE',
}

export enum HistoryActionEnum {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ASSIGN = 'ASSIGN',
}

export enum PermissionActionEnum {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ASSIGN = 'ASSIGN',
  MANAGE = 'manage',
  UNLOCK = 'UNLOCK',
  CONFIRM = 'CONFIRM',
}

export enum ScopeEnum {
  OFFICE = 'OFFICE',
  GLOBAL = 'GLOBAL',
}

export enum SubjectEnum {
  All = 'all',

  // OTP
  OtpRequest = 'OtpRequest',
  OtpSecurityState = 'OtpSecurityState',

  // affiliate
  AffiliatePartner = 'AffiliatePartner',
  AffiliateTransaction = 'AffiliateTransaction',

  // admin
  Role = 'Role',
  ApiClient = 'ApiClient',
  Permission = 'Permission',
  RolePermission = 'RolePermission',

  // user
  User = 'User',
  UserType = 'UserType',
  UserRole = 'UserRole',
  Customer = 'Customer',

  // office
  Office = 'Office',
  OfficeUser = 'OfficeUser',
  OfficeType = 'OfficeType',

  // pickup
  PickupStatus = 'PickupStatus',
  PickupRequest = 'PickupRequest',
  PickupAssignment = 'PickupAssignment',

  // order
  Order = 'Order',
  OrderItem = 'OrderItem',
  OrderStatus = 'OrderStatus',

  // payment
  Payment = 'Payment',
  PaymentMethod = 'PaymentMethod',
  PaymentStatus = 'PaymentStatus',

  // promo
  Promo = 'Promo',
  PromoCodeUsage = 'PromoCodeUsage',

  // Catalog
  Item = 'Item',
  Service = 'Service',
  Category = 'Category',
  Currency = 'Currency',
  SubCategory = 'SubCategory',
  ServiceType = 'ServiceType',
}

export enum RoleEnum {
  MANAGER = 'Manager',
  CO_FOUNDER = 'Co-Founder',
  OFFICE_MANAGER = 'Office Manager',
  FACTORY_MANAGER = 'Factory Manager',
}
