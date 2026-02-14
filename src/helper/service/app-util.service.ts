import { Injectable } from '@nestjs/common';

@Injectable()
export class AppUtilService {
  /**
   * Parses a sort parameter string into a record object suitable for use with Mongoose queries.
   *
   * The input string should be a comma-separated list of fields, where each field can optionally
   * specify a sort order using a colon (`:`). For example:
   *
   * - `"name:asc,age:desc"` will be parsed as `{ name: 1, age: -1 }`
   * - `"createdAt:desc"` will be parsed as `{ createdAt: -1 }`
   * - `"name"` will be parsed as `{ name: 1 }` (default order is ascending)
   *
   * If no sort parameter is provided, the default sort order is `{ createdAt: -1 }`.
   *
   * @param sortParam - A string representing the sort fields and their respective orders.
   * @returns A record object where keys are field names and values are `1` (ascending) or `-1` (descending).
   */
  parseSortParam(sortParam?: string): Record<string, 1 | -1> {
    // if (!sortParam) return { createdAt: -1 }; // Default sort by createdAt descending
    if (!sortParam) return { createdAt: -1 }; // Default sort by createdAt descending

    return Object.fromEntries(
      sortParam.split(',').map((field) => {
        const [key, order] = field.split(':');
        return [key, order === 'desc' ? -1 : 1] as [string, 1 | -1]; // Mongoose uses -1 for descending, 1 for ascending
      }),
    );
  }
}
