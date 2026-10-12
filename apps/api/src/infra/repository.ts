export type Documents = Record<string, any>;
export type Change<T> = { result: T; put?: Documents; remove?: string[] };
export interface Database {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
  transact<T>(
    keys: string[],
    change: (docs: Documents) => Change<T>,
  ): Promise<T>;
}
