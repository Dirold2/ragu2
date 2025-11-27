declare module "async-retry" {
	type RetryFn<T> = (
		bail: (err: Error) => void,
		attempt: number,
	) => Promise<T> | T;

	interface Options {
		retries?: number;
		factor?: number;
		minTimeout?: number;
		maxTimeout?: number;
		randomize?: boolean;
	}

	export default function retry<T>(fn: RetryFn<T>, opts?: Options): Promise<T>;
}
