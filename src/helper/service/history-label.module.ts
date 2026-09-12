import { Global, Module } from '@nestjs/common';
import { HistoryLabelService } from './history-label.service';

/**
 * Makes the audit-trail labeller available to every feature module, the way
 * the schemas themselves are global. It is domain-agnostic and stateless
 * apart from its metadata cache, so one instance serves the whole app — and
 * the next endpoint that returns history can inject it without wiring.
 */
@Global()
@Module({
  providers: [HistoryLabelService],
  exports: [HistoryLabelService],
})
export class HistoryLabelModule {}
