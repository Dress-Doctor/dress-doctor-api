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

  /**
   * Escapes regex metacharacters in a user-supplied string so it can be used as
   * a literal inside a `RegExp` (e.g. free-text search) without injection.
   */
  escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Replaces placeholders in the given template string with corresponding values from the provided data object.
   *
   * Placeholders in the template should be in the format `{key}`. If a key exists in the data object,
   * its value will replace the placeholder; otherwise, the placeholder will be replaced with an empty string.
   *
   * @param content - The template string containing placeholders in the format `{key}`.
   * @param data - An object mapping keys to their replacement values.
   * @returns The template string with placeholders replaced by their corresponding values from the data object.
   */
  renderTemplate(content: string, data: Record<string, string>) {
    return content.replace(/{(\w*)}/g, function (m: string, key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
    });
  }

  /**
   * Generates a formatted log string with key-value pairs surrounded by asterisks.
   *
   * @param data - An object containing string key-value pairs to be logged.
   * @returns A string with each key-value pair on a new line, wrapped between lines of asterisks.
   */
  getLogText(data: Record<string, string>) {
    const star = `\n*******************`;
    let logText = star;

    Object.keys(data).forEach((key) => {
      logText = logText + `\n${key}: ${data[key]}`;
    });

    return logText + `${star}\n\n`;
  }
}
