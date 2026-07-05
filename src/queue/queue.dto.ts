export enum Queues {
  notification = 'notification',
}

export enum QueueProcessor {
  notification = `${Queues.notification}_processor`,
}
