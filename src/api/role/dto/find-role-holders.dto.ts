import { PaginationDto } from 'src/dto/request-data.dto';

/**
 * What `GET /v1/roles/:reference/holders` accepts.
 *
 * Pagination and nothing else. A role is held by a handful of people, not a
 * file you search through — the filters that make sense over staff belong on
 * the staff list, which is where this row's link goes.
 */
export class FindRoleHoldersDto extends PaginationDto {}
