export interface CommandReceiptRepository {
  get(key: string): Promise<string | null>;
  save(key: string, outcomeJson: string, createdAt: string): Promise<void>;
  deleteCreatedBefore(createdAt: string): Promise<number>;
}
