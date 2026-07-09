import { ConsoleLogger, ConsoleLoggerOptions, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface FileLoggerOptions extends ConsoleLoggerOptions {
  // Distinguishes api vs worker output when both mount the same log
  // dir — e.g. 'api-' -> api-error.log / api-combined.log.
  filePrefix?: string;
}

// Splits output into two files on top of the normal console output:
// <prefix>error.log (level 'error'/'fatal') and <prefix>combined.log
// (everything else). Reuses ConsoleLogger's own getJsonLogObject so
// the file lines match the shape of `json: true` console output.
export class FileLoggerService extends ConsoleLogger {
  private readonly errorStream: fs.WriteStream;
  private readonly combinedStream: fs.WriteStream;

  constructor(options?: FileLoggerOptions) {
    super(options ?? {});

    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const prefix = options?.filePrefix ?? '';
    this.errorStream = fs.createWriteStream(
      path.join(logDir, `${prefix}error.log`),
      { flags: 'a' },
    );
    this.combinedStream = fs.createWriteStream(
      path.join(logDir, `${prefix}combined.log`),
      { flags: 'a' },
    );
  }

  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(
      messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );

    const stream =
      logLevel === 'error' || logLevel === 'fatal'
        ? this.errorStream
        : this.combinedStream;

    for (const message of messages) {
      // Base getJsonLogObject stamps `timestamp: Date.now()` — a raw
      // epoch-ms number, unreadable at a glance. Overwrite it with
      // ISO 8601 here rather than overriding the protected method
      // itself, which would break its declared return type.
      const logObject = this.getJsonLogObject(message, {
        context,
        logLevel,
        writeStreamType,
        errorStack,
      });
      stream.write(
        JSON.stringify({
          ...logObject,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
    }
  }
}
