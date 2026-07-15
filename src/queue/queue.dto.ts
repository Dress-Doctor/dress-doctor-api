export enum Queues {
  notification = 'notification',
  inactivityScan = 'inactivity-scan',
  paymentReconcile = 'payment-reconcile',
  rewardAccrual = 'reward-accrual',
}

export enum QueueProcessor {
  notification = `${Queues.notification}_processor`,
  inactivityScan = `${Queues.inactivityScan}_processor`,
  paymentReconcile = `${Queues.paymentReconcile}_processor`,
  rewardAccrual = `${Queues.rewardAccrual}_processor`,
}

// order.paid → reward accrual job (one per order, idempotent end to end).
export interface RewardAccrualJobData {
  orderId: string;
}

// Job payload carried from cron -> queue -> processor. `jobRunId` links the
// BullMQ job back to the JobRun row the cron created so the processor updates
// the same row (PROCESSING -> COMPLETED/FAILED) instead of writing a new one.
export interface ScheduledJobData {
  jobRunId: string;
  // Reconcile only: bound the recompute to orders touched since this instant.
  since?: string;
}
