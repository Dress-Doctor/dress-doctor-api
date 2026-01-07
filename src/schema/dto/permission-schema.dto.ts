export enum ActionEnum {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum PermissionActionEnum {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ASSIGN = 'ASSIGN',
  MANAGE = 'MANAGE',
  CONFIRM = 'CONFIRM',
}

export enum ScopeEnum {
  OFFICE = 'OFFICE',
  GLOBAL = 'GLOBAL',
}

export enum SubjectEnum {
  User = 'User',
  Role = 'Role',
  Office = 'Office',
  UserType = 'UserType',
  Customer = 'Customer',
  Permission = 'Permission',
  OfficeUser = 'OfficeUser',
  OfficeType = 'OfficeType',
  PickupRequest = 'PickupRequest',
}
