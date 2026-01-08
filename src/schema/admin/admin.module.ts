import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Permission, PermissionSchema } from './permission.schema';
import { Role, RoleSchema } from './role.schema';
import { RolePermission, RolePermissionSchema } from './role-permission.schema';
import { UserRole, UserRoleSchema } from './user-role.schema';
import { ApiClient, ApiClientSchema } from './api-client.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: UserRole.name, schema: UserRoleSchema },
      { name: ApiClient.name, schema: ApiClientSchema },
      { name: Permission.name, schema: PermissionSchema },
      { name: RolePermission.name, schema: RolePermissionSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class AdminSchemaModule {}
