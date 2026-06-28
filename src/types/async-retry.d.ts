declare module "async-retry" {
  interface Options {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    randomize?: boolean;
    onRetry?: (error: Error, attempt: number) => void;
  }

  function retry<T>(
    fn: (bail: (err: Error) => void, attempt: number) => Promise<T>,
    options?: Options,
  ): Promise<T>;

  export default retry;
}
