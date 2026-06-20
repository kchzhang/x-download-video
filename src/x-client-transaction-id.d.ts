declare module 'x-client-transaction-id' {
  export class ClientTransaction {
    constructor(homePageDocument: Document);
    initialize(): Promise<void>;
    static create(homePageDocument: Document): Promise<ClientTransaction>;
    generateTransactionId(
      method: string,
      path: string,
      response?: Document,
      key?: string,
      animationKey?: string,
      timeNow?: number
    ): Promise<string>;
  }

  export function handleXMigration(): Promise<Document>;
}
