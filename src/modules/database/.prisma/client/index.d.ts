
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Queue
 * 
 */
export type Queue = $Result.DefaultSelection<Prisma.$QueuePayload>
/**
 * Model Tracks
 * 
 */
export type Tracks = $Result.DefaultSelection<Prisma.$TracksPayload>
/**
 * Model GlobalHistory
 * 
 */
export type GlobalHistory = $Result.DefaultSelection<Prisma.$GlobalHistoryPayload>
/**
 * Model UserHistory
 * 
 */
export type UserHistory = $Result.DefaultSelection<Prisma.$UserHistoryPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Queues
 * const queues = await prisma.queue.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Queues
   * const queues = await prisma.queue.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.queue`: Exposes CRUD operations for the **Queue** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Queues
    * const queues = await prisma.queue.findMany()
    * ```
    */
  get queue(): Prisma.QueueDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tracks`: Exposes CRUD operations for the **Tracks** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Tracks
    * const tracks = await prisma.tracks.findMany()
    * ```
    */
  get tracks(): Prisma.TracksDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.globalHistory`: Exposes CRUD operations for the **GlobalHistory** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more GlobalHistories
    * const globalHistories = await prisma.globalHistory.findMany()
    * ```
    */
  get globalHistory(): Prisma.GlobalHistoryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.userHistory`: Exposes CRUD operations for the **UserHistory** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more UserHistories
    * const userHistories = await prisma.userHistory.findMany()
    * ```
    */
  get userHistory(): Prisma.UserHistoryDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.5.0
   * Query Engine version: 173f8d54f8d52e692c7e27e72a88314ec7aeff60
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Queue: 'Queue',
    Tracks: 'Tracks',
    GlobalHistory: 'GlobalHistory',
    UserHistory: 'UserHistory'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "queue" | "tracks" | "globalHistory" | "userHistory"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Queue: {
        payload: Prisma.$QueuePayload<ExtArgs>
        fields: Prisma.QueueFieldRefs
        operations: {
          findUnique: {
            args: Prisma.QueueFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.QueueFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          findFirst: {
            args: Prisma.QueueFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.QueueFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          findMany: {
            args: Prisma.QueueFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>[]
          }
          create: {
            args: Prisma.QueueCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          createMany: {
            args: Prisma.QueueCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.QueueCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>[]
          }
          delete: {
            args: Prisma.QueueDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          update: {
            args: Prisma.QueueUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          deleteMany: {
            args: Prisma.QueueDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.QueueUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.QueueUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>[]
          }
          upsert: {
            args: Prisma.QueueUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$QueuePayload>
          }
          aggregate: {
            args: Prisma.QueueAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateQueue>
          }
          groupBy: {
            args: Prisma.QueueGroupByArgs<ExtArgs>
            result: $Utils.Optional<QueueGroupByOutputType>[]
          }
          count: {
            args: Prisma.QueueCountArgs<ExtArgs>
            result: $Utils.Optional<QueueCountAggregateOutputType> | number
          }
        }
      }
      Tracks: {
        payload: Prisma.$TracksPayload<ExtArgs>
        fields: Prisma.TracksFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TracksFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TracksFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          findFirst: {
            args: Prisma.TracksFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TracksFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          findMany: {
            args: Prisma.TracksFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>[]
          }
          create: {
            args: Prisma.TracksCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          createMany: {
            args: Prisma.TracksCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TracksCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>[]
          }
          delete: {
            args: Prisma.TracksDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          update: {
            args: Prisma.TracksUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          deleteMany: {
            args: Prisma.TracksDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TracksUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TracksUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>[]
          }
          upsert: {
            args: Prisma.TracksUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TracksPayload>
          }
          aggregate: {
            args: Prisma.TracksAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTracks>
          }
          groupBy: {
            args: Prisma.TracksGroupByArgs<ExtArgs>
            result: $Utils.Optional<TracksGroupByOutputType>[]
          }
          count: {
            args: Prisma.TracksCountArgs<ExtArgs>
            result: $Utils.Optional<TracksCountAggregateOutputType> | number
          }
        }
      }
      GlobalHistory: {
        payload: Prisma.$GlobalHistoryPayload<ExtArgs>
        fields: Prisma.GlobalHistoryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.GlobalHistoryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.GlobalHistoryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          findFirst: {
            args: Prisma.GlobalHistoryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.GlobalHistoryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          findMany: {
            args: Prisma.GlobalHistoryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>[]
          }
          create: {
            args: Prisma.GlobalHistoryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          createMany: {
            args: Prisma.GlobalHistoryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.GlobalHistoryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>[]
          }
          delete: {
            args: Prisma.GlobalHistoryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          update: {
            args: Prisma.GlobalHistoryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          deleteMany: {
            args: Prisma.GlobalHistoryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.GlobalHistoryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.GlobalHistoryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>[]
          }
          upsert: {
            args: Prisma.GlobalHistoryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GlobalHistoryPayload>
          }
          aggregate: {
            args: Prisma.GlobalHistoryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateGlobalHistory>
          }
          groupBy: {
            args: Prisma.GlobalHistoryGroupByArgs<ExtArgs>
            result: $Utils.Optional<GlobalHistoryGroupByOutputType>[]
          }
          count: {
            args: Prisma.GlobalHistoryCountArgs<ExtArgs>
            result: $Utils.Optional<GlobalHistoryCountAggregateOutputType> | number
          }
        }
      }
      UserHistory: {
        payload: Prisma.$UserHistoryPayload<ExtArgs>
        fields: Prisma.UserHistoryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserHistoryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserHistoryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          findFirst: {
            args: Prisma.UserHistoryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserHistoryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          findMany: {
            args: Prisma.UserHistoryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>[]
          }
          create: {
            args: Prisma.UserHistoryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          createMany: {
            args: Prisma.UserHistoryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserHistoryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>[]
          }
          delete: {
            args: Prisma.UserHistoryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          update: {
            args: Prisma.UserHistoryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          deleteMany: {
            args: Prisma.UserHistoryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserHistoryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserHistoryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>[]
          }
          upsert: {
            args: Prisma.UserHistoryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserHistoryPayload>
          }
          aggregate: {
            args: Prisma.UserHistoryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUserHistory>
          }
          groupBy: {
            args: Prisma.UserHistoryGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserHistoryGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserHistoryCountArgs<ExtArgs>
            result: $Utils.Optional<UserHistoryCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    queue?: QueueOmit
    tracks?: TracksOmit
    globalHistory?: GlobalHistoryOmit
    userHistory?: UserHistoryOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type QueueCountOutputType
   */

  export type QueueCountOutputType = {
    tracks: number
  }

  export type QueueCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tracks?: boolean | QueueCountOutputTypeCountTracksArgs
  }

  // Custom InputTypes
  /**
   * QueueCountOutputType without action
   */
  export type QueueCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the QueueCountOutputType
     */
    select?: QueueCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * QueueCountOutputType without action
   */
  export type QueueCountOutputTypeCountTracksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TracksWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Queue
   */

  export type AggregateQueue = {
    _count: QueueCountAggregateOutputType | null
    _avg: QueueAvgAggregateOutputType | null
    _sum: QueueSumAggregateOutputType | null
    _min: QueueMinAggregateOutputType | null
    _max: QueueMaxAggregateOutputType | null
  }

  export type QueueAvgAggregateOutputType = {
    id: number | null
    volume: number | null
  }

  export type QueueSumAggregateOutputType = {
    id: number | null
    volume: number | null
  }

  export type QueueMinAggregateOutputType = {
    id: number | null
    guildId: string | null
    lastTrackId: string | null
    waveStatus: boolean | null
    loop: boolean | null
    volume: number | null
  }

  export type QueueMaxAggregateOutputType = {
    id: number | null
    guildId: string | null
    lastTrackId: string | null
    waveStatus: boolean | null
    loop: boolean | null
    volume: number | null
  }

  export type QueueCountAggregateOutputType = {
    id: number
    guildId: number
    lastTrackId: number
    waveStatus: number
    loop: number
    volume: number
    _all: number
  }


  export type QueueAvgAggregateInputType = {
    id?: true
    volume?: true
  }

  export type QueueSumAggregateInputType = {
    id?: true
    volume?: true
  }

  export type QueueMinAggregateInputType = {
    id?: true
    guildId?: true
    lastTrackId?: true
    waveStatus?: true
    loop?: true
    volume?: true
  }

  export type QueueMaxAggregateInputType = {
    id?: true
    guildId?: true
    lastTrackId?: true
    waveStatus?: true
    loop?: true
    volume?: true
  }

  export type QueueCountAggregateInputType = {
    id?: true
    guildId?: true
    lastTrackId?: true
    waveStatus?: true
    loop?: true
    volume?: true
    _all?: true
  }

  export type QueueAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Queue to aggregate.
     */
    where?: QueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Queues to fetch.
     */
    orderBy?: QueueOrderByWithRelationInput | QueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: QueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Queues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Queues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Queues
    **/
    _count?: true | QueueCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: QueueAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: QueueSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: QueueMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: QueueMaxAggregateInputType
  }

  export type GetQueueAggregateType<T extends QueueAggregateArgs> = {
        [P in keyof T & keyof AggregateQueue]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateQueue[P]>
      : GetScalarType<T[P], AggregateQueue[P]>
  }




  export type QueueGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: QueueWhereInput
    orderBy?: QueueOrderByWithAggregationInput | QueueOrderByWithAggregationInput[]
    by: QueueScalarFieldEnum[] | QueueScalarFieldEnum
    having?: QueueScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: QueueCountAggregateInputType | true
    _avg?: QueueAvgAggregateInputType
    _sum?: QueueSumAggregateInputType
    _min?: QueueMinAggregateInputType
    _max?: QueueMaxAggregateInputType
  }

  export type QueueGroupByOutputType = {
    id: number
    guildId: string
    lastTrackId: string | null
    waveStatus: boolean | null
    loop: boolean | null
    volume: number | null
    _count: QueueCountAggregateOutputType | null
    _avg: QueueAvgAggregateOutputType | null
    _sum: QueueSumAggregateOutputType | null
    _min: QueueMinAggregateOutputType | null
    _max: QueueMaxAggregateOutputType | null
  }

  type GetQueueGroupByPayload<T extends QueueGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<QueueGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof QueueGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], QueueGroupByOutputType[P]>
            : GetScalarType<T[P], QueueGroupByOutputType[P]>
        }
      >
    >


  export type QueueSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    guildId?: boolean
    lastTrackId?: boolean
    waveStatus?: boolean
    loop?: boolean
    volume?: boolean
    tracks?: boolean | Queue$tracksArgs<ExtArgs>
    _count?: boolean | QueueCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["queue"]>

  export type QueueSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    guildId?: boolean
    lastTrackId?: boolean
    waveStatus?: boolean
    loop?: boolean
    volume?: boolean
  }, ExtArgs["result"]["queue"]>

  export type QueueSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    guildId?: boolean
    lastTrackId?: boolean
    waveStatus?: boolean
    loop?: boolean
    volume?: boolean
  }, ExtArgs["result"]["queue"]>

  export type QueueSelectScalar = {
    id?: boolean
    guildId?: boolean
    lastTrackId?: boolean
    waveStatus?: boolean
    loop?: boolean
    volume?: boolean
  }

  export type QueueOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "guildId" | "lastTrackId" | "waveStatus" | "loop" | "volume", ExtArgs["result"]["queue"]>
  export type QueueInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tracks?: boolean | Queue$tracksArgs<ExtArgs>
    _count?: boolean | QueueCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type QueueIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type QueueIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $QueuePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Queue"
    objects: {
      tracks: Prisma.$TracksPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      guildId: string
      lastTrackId: string | null
      waveStatus: boolean | null
      loop: boolean | null
      volume: number | null
    }, ExtArgs["result"]["queue"]>
    composites: {}
  }

  type QueueGetPayload<S extends boolean | null | undefined | QueueDefaultArgs> = $Result.GetResult<Prisma.$QueuePayload, S>

  type QueueCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<QueueFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: QueueCountAggregateInputType | true
    }

  export interface QueueDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Queue'], meta: { name: 'Queue' } }
    /**
     * Find zero or one Queue that matches the filter.
     * @param {QueueFindUniqueArgs} args - Arguments to find a Queue
     * @example
     * // Get one Queue
     * const queue = await prisma.queue.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends QueueFindUniqueArgs>(args: SelectSubset<T, QueueFindUniqueArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Queue that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {QueueFindUniqueOrThrowArgs} args - Arguments to find a Queue
     * @example
     * // Get one Queue
     * const queue = await prisma.queue.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends QueueFindUniqueOrThrowArgs>(args: SelectSubset<T, QueueFindUniqueOrThrowArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Queue that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueFindFirstArgs} args - Arguments to find a Queue
     * @example
     * // Get one Queue
     * const queue = await prisma.queue.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends QueueFindFirstArgs>(args?: SelectSubset<T, QueueFindFirstArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Queue that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueFindFirstOrThrowArgs} args - Arguments to find a Queue
     * @example
     * // Get one Queue
     * const queue = await prisma.queue.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends QueueFindFirstOrThrowArgs>(args?: SelectSubset<T, QueueFindFirstOrThrowArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Queues that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Queues
     * const queues = await prisma.queue.findMany()
     * 
     * // Get first 10 Queues
     * const queues = await prisma.queue.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const queueWithIdOnly = await prisma.queue.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends QueueFindManyArgs>(args?: SelectSubset<T, QueueFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Queue.
     * @param {QueueCreateArgs} args - Arguments to create a Queue.
     * @example
     * // Create one Queue
     * const Queue = await prisma.queue.create({
     *   data: {
     *     // ... data to create a Queue
     *   }
     * })
     * 
     */
    create<T extends QueueCreateArgs>(args: SelectSubset<T, QueueCreateArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Queues.
     * @param {QueueCreateManyArgs} args - Arguments to create many Queues.
     * @example
     * // Create many Queues
     * const queue = await prisma.queue.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends QueueCreateManyArgs>(args?: SelectSubset<T, QueueCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Queues and returns the data saved in the database.
     * @param {QueueCreateManyAndReturnArgs} args - Arguments to create many Queues.
     * @example
     * // Create many Queues
     * const queue = await prisma.queue.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Queues and only return the `id`
     * const queueWithIdOnly = await prisma.queue.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends QueueCreateManyAndReturnArgs>(args?: SelectSubset<T, QueueCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Queue.
     * @param {QueueDeleteArgs} args - Arguments to delete one Queue.
     * @example
     * // Delete one Queue
     * const Queue = await prisma.queue.delete({
     *   where: {
     *     // ... filter to delete one Queue
     *   }
     * })
     * 
     */
    delete<T extends QueueDeleteArgs>(args: SelectSubset<T, QueueDeleteArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Queue.
     * @param {QueueUpdateArgs} args - Arguments to update one Queue.
     * @example
     * // Update one Queue
     * const queue = await prisma.queue.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends QueueUpdateArgs>(args: SelectSubset<T, QueueUpdateArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Queues.
     * @param {QueueDeleteManyArgs} args - Arguments to filter Queues to delete.
     * @example
     * // Delete a few Queues
     * const { count } = await prisma.queue.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends QueueDeleteManyArgs>(args?: SelectSubset<T, QueueDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Queues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Queues
     * const queue = await prisma.queue.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends QueueUpdateManyArgs>(args: SelectSubset<T, QueueUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Queues and returns the data updated in the database.
     * @param {QueueUpdateManyAndReturnArgs} args - Arguments to update many Queues.
     * @example
     * // Update many Queues
     * const queue = await prisma.queue.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Queues and only return the `id`
     * const queueWithIdOnly = await prisma.queue.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends QueueUpdateManyAndReturnArgs>(args: SelectSubset<T, QueueUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Queue.
     * @param {QueueUpsertArgs} args - Arguments to update or create a Queue.
     * @example
     * // Update or create a Queue
     * const queue = await prisma.queue.upsert({
     *   create: {
     *     // ... data to create a Queue
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Queue we want to update
     *   }
     * })
     */
    upsert<T extends QueueUpsertArgs>(args: SelectSubset<T, QueueUpsertArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Queues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueCountArgs} args - Arguments to filter Queues to count.
     * @example
     * // Count the number of Queues
     * const count = await prisma.queue.count({
     *   where: {
     *     // ... the filter for the Queues we want to count
     *   }
     * })
    **/
    count<T extends QueueCountArgs>(
      args?: Subset<T, QueueCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], QueueCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Queue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends QueueAggregateArgs>(args: Subset<T, QueueAggregateArgs>): Prisma.PrismaPromise<GetQueueAggregateType<T>>

    /**
     * Group by Queue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {QueueGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends QueueGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: QueueGroupByArgs['orderBy'] }
        : { orderBy?: QueueGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, QueueGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetQueueGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Queue model
   */
  readonly fields: QueueFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Queue.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__QueueClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tracks<T extends Queue$tracksArgs<ExtArgs> = {}>(args?: Subset<T, Queue$tracksArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Queue model
   */ 
  interface QueueFieldRefs {
    readonly id: FieldRef<"Queue", 'Int'>
    readonly guildId: FieldRef<"Queue", 'String'>
    readonly lastTrackId: FieldRef<"Queue", 'String'>
    readonly waveStatus: FieldRef<"Queue", 'Boolean'>
    readonly loop: FieldRef<"Queue", 'Boolean'>
    readonly volume: FieldRef<"Queue", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * Queue findUnique
   */
  export type QueueFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter, which Queue to fetch.
     */
    where: QueueWhereUniqueInput
  }

  /**
   * Queue findUniqueOrThrow
   */
  export type QueueFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter, which Queue to fetch.
     */
    where: QueueWhereUniqueInput
  }

  /**
   * Queue findFirst
   */
  export type QueueFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter, which Queue to fetch.
     */
    where?: QueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Queues to fetch.
     */
    orderBy?: QueueOrderByWithRelationInput | QueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Queues.
     */
    cursor?: QueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Queues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Queues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Queues.
     */
    distinct?: QueueScalarFieldEnum | QueueScalarFieldEnum[]
  }

  /**
   * Queue findFirstOrThrow
   */
  export type QueueFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter, which Queue to fetch.
     */
    where?: QueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Queues to fetch.
     */
    orderBy?: QueueOrderByWithRelationInput | QueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Queues.
     */
    cursor?: QueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Queues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Queues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Queues.
     */
    distinct?: QueueScalarFieldEnum | QueueScalarFieldEnum[]
  }

  /**
   * Queue findMany
   */
  export type QueueFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter, which Queues to fetch.
     */
    where?: QueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Queues to fetch.
     */
    orderBy?: QueueOrderByWithRelationInput | QueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Queues.
     */
    cursor?: QueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Queues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Queues.
     */
    skip?: number
    distinct?: QueueScalarFieldEnum | QueueScalarFieldEnum[]
  }

  /**
   * Queue create
   */
  export type QueueCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * The data needed to create a Queue.
     */
    data?: XOR<QueueCreateInput, QueueUncheckedCreateInput>
  }

  /**
   * Queue createMany
   */
  export type QueueCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Queues.
     */
    data: QueueCreateManyInput | QueueCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Queue createManyAndReturn
   */
  export type QueueCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * The data used to create many Queues.
     */
    data: QueueCreateManyInput | QueueCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Queue update
   */
  export type QueueUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * The data needed to update a Queue.
     */
    data: XOR<QueueUpdateInput, QueueUncheckedUpdateInput>
    /**
     * Choose, which Queue to update.
     */
    where: QueueWhereUniqueInput
  }

  /**
   * Queue updateMany
   */
  export type QueueUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Queues.
     */
    data: XOR<QueueUpdateManyMutationInput, QueueUncheckedUpdateManyInput>
    /**
     * Filter which Queues to update
     */
    where?: QueueWhereInput
    /**
     * Limit how many Queues to update.
     */
    limit?: number
  }

  /**
   * Queue updateManyAndReturn
   */
  export type QueueUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * The data used to update Queues.
     */
    data: XOR<QueueUpdateManyMutationInput, QueueUncheckedUpdateManyInput>
    /**
     * Filter which Queues to update
     */
    where?: QueueWhereInput
    /**
     * Limit how many Queues to update.
     */
    limit?: number
  }

  /**
   * Queue upsert
   */
  export type QueueUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * The filter to search for the Queue to update in case it exists.
     */
    where: QueueWhereUniqueInput
    /**
     * In case the Queue found by the `where` argument doesn't exist, create a new Queue with this data.
     */
    create: XOR<QueueCreateInput, QueueUncheckedCreateInput>
    /**
     * In case the Queue was found with the provided `where` argument, update it with this data.
     */
    update: XOR<QueueUpdateInput, QueueUncheckedUpdateInput>
  }

  /**
   * Queue delete
   */
  export type QueueDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
    /**
     * Filter which Queue to delete.
     */
    where: QueueWhereUniqueInput
  }

  /**
   * Queue deleteMany
   */
  export type QueueDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Queues to delete
     */
    where?: QueueWhereInput
    /**
     * Limit how many Queues to delete.
     */
    limit?: number
  }

  /**
   * Queue.tracks
   */
  export type Queue$tracksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    where?: TracksWhereInput
    orderBy?: TracksOrderByWithRelationInput | TracksOrderByWithRelationInput[]
    cursor?: TracksWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TracksScalarFieldEnum | TracksScalarFieldEnum[]
  }

  /**
   * Queue without action
   */
  export type QueueDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Queue
     */
    select?: QueueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Queue
     */
    omit?: QueueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: QueueInclude<ExtArgs> | null
  }


  /**
   * Model Tracks
   */

  export type AggregateTracks = {
    _count: TracksCountAggregateOutputType | null
    _avg: TracksAvgAggregateOutputType | null
    _sum: TracksSumAggregateOutputType | null
    _min: TracksMinAggregateOutputType | null
    _max: TracksMaxAggregateOutputType | null
  }

  export type TracksAvgAggregateOutputType = {
    id: number | null
    addedAt: number | null
    queueId: number | null
  }

  export type TracksSumAggregateOutputType = {
    id: number | null
    addedAt: bigint | null
    queueId: number | null
  }

  export type TracksMinAggregateOutputType = {
    id: number | null
    trackId: string | null
    addedAt: bigint | null
    priority: boolean | null
    info: string | null
    source: string | null
    requestedBy: string | null
    queueId: number | null
  }

  export type TracksMaxAggregateOutputType = {
    id: number | null
    trackId: string | null
    addedAt: bigint | null
    priority: boolean | null
    info: string | null
    source: string | null
    requestedBy: string | null
    queueId: number | null
  }

  export type TracksCountAggregateOutputType = {
    id: number
    trackId: number
    addedAt: number
    priority: number
    info: number
    source: number
    requestedBy: number
    queueId: number
    _all: number
  }


  export type TracksAvgAggregateInputType = {
    id?: true
    addedAt?: true
    queueId?: true
  }

  export type TracksSumAggregateInputType = {
    id?: true
    addedAt?: true
    queueId?: true
  }

  export type TracksMinAggregateInputType = {
    id?: true
    trackId?: true
    addedAt?: true
    priority?: true
    info?: true
    source?: true
    requestedBy?: true
    queueId?: true
  }

  export type TracksMaxAggregateInputType = {
    id?: true
    trackId?: true
    addedAt?: true
    priority?: true
    info?: true
    source?: true
    requestedBy?: true
    queueId?: true
  }

  export type TracksCountAggregateInputType = {
    id?: true
    trackId?: true
    addedAt?: true
    priority?: true
    info?: true
    source?: true
    requestedBy?: true
    queueId?: true
    _all?: true
  }

  export type TracksAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tracks to aggregate.
     */
    where?: TracksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tracks to fetch.
     */
    orderBy?: TracksOrderByWithRelationInput | TracksOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TracksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tracks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tracks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Tracks
    **/
    _count?: true | TracksCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TracksAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TracksSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TracksMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TracksMaxAggregateInputType
  }

  export type GetTracksAggregateType<T extends TracksAggregateArgs> = {
        [P in keyof T & keyof AggregateTracks]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTracks[P]>
      : GetScalarType<T[P], AggregateTracks[P]>
  }




  export type TracksGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TracksWhereInput
    orderBy?: TracksOrderByWithAggregationInput | TracksOrderByWithAggregationInput[]
    by: TracksScalarFieldEnum[] | TracksScalarFieldEnum
    having?: TracksScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TracksCountAggregateInputType | true
    _avg?: TracksAvgAggregateInputType
    _sum?: TracksSumAggregateInputType
    _min?: TracksMinAggregateInputType
    _max?: TracksMaxAggregateInputType
  }

  export type TracksGroupByOutputType = {
    id: number
    trackId: string
    addedAt: bigint
    priority: boolean
    info: string
    source: string
    requestedBy: string | null
    queueId: number
    _count: TracksCountAggregateOutputType | null
    _avg: TracksAvgAggregateOutputType | null
    _sum: TracksSumAggregateOutputType | null
    _min: TracksMinAggregateOutputType | null
    _max: TracksMaxAggregateOutputType | null
  }

  type GetTracksGroupByPayload<T extends TracksGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TracksGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TracksGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TracksGroupByOutputType[P]>
            : GetScalarType<T[P], TracksGroupByOutputType[P]>
        }
      >
    >


  export type TracksSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    addedAt?: boolean
    priority?: boolean
    info?: boolean
    source?: boolean
    requestedBy?: boolean
    queueId?: boolean
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tracks"]>

  export type TracksSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    addedAt?: boolean
    priority?: boolean
    info?: boolean
    source?: boolean
    requestedBy?: boolean
    queueId?: boolean
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tracks"]>

  export type TracksSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    addedAt?: boolean
    priority?: boolean
    info?: boolean
    source?: boolean
    requestedBy?: boolean
    queueId?: boolean
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tracks"]>

  export type TracksSelectScalar = {
    id?: boolean
    trackId?: boolean
    addedAt?: boolean
    priority?: boolean
    info?: boolean
    source?: boolean
    requestedBy?: boolean
    queueId?: boolean
  }

  export type TracksOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "trackId" | "addedAt" | "priority" | "info" | "source" | "requestedBy" | "queueId", ExtArgs["result"]["tracks"]>
  export type TracksInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }
  export type TracksIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }
  export type TracksIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    Queue?: boolean | QueueDefaultArgs<ExtArgs>
  }

  export type $TracksPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Tracks"
    objects: {
      Queue: Prisma.$QueuePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      trackId: string
      addedAt: bigint
      priority: boolean
      info: string
      source: string
      requestedBy: string | null
      queueId: number
    }, ExtArgs["result"]["tracks"]>
    composites: {}
  }

  type TracksGetPayload<S extends boolean | null | undefined | TracksDefaultArgs> = $Result.GetResult<Prisma.$TracksPayload, S>

  type TracksCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TracksFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TracksCountAggregateInputType | true
    }

  export interface TracksDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Tracks'], meta: { name: 'Tracks' } }
    /**
     * Find zero or one Tracks that matches the filter.
     * @param {TracksFindUniqueArgs} args - Arguments to find a Tracks
     * @example
     * // Get one Tracks
     * const tracks = await prisma.tracks.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TracksFindUniqueArgs>(args: SelectSubset<T, TracksFindUniqueArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Tracks that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TracksFindUniqueOrThrowArgs} args - Arguments to find a Tracks
     * @example
     * // Get one Tracks
     * const tracks = await prisma.tracks.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TracksFindUniqueOrThrowArgs>(args: SelectSubset<T, TracksFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tracks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksFindFirstArgs} args - Arguments to find a Tracks
     * @example
     * // Get one Tracks
     * const tracks = await prisma.tracks.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TracksFindFirstArgs>(args?: SelectSubset<T, TracksFindFirstArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tracks that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksFindFirstOrThrowArgs} args - Arguments to find a Tracks
     * @example
     * // Get one Tracks
     * const tracks = await prisma.tracks.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TracksFindFirstOrThrowArgs>(args?: SelectSubset<T, TracksFindFirstOrThrowArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Tracks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Tracks
     * const tracks = await prisma.tracks.findMany()
     * 
     * // Get first 10 Tracks
     * const tracks = await prisma.tracks.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tracksWithIdOnly = await prisma.tracks.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TracksFindManyArgs>(args?: SelectSubset<T, TracksFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Tracks.
     * @param {TracksCreateArgs} args - Arguments to create a Tracks.
     * @example
     * // Create one Tracks
     * const Tracks = await prisma.tracks.create({
     *   data: {
     *     // ... data to create a Tracks
     *   }
     * })
     * 
     */
    create<T extends TracksCreateArgs>(args: SelectSubset<T, TracksCreateArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Tracks.
     * @param {TracksCreateManyArgs} args - Arguments to create many Tracks.
     * @example
     * // Create many Tracks
     * const tracks = await prisma.tracks.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TracksCreateManyArgs>(args?: SelectSubset<T, TracksCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Tracks and returns the data saved in the database.
     * @param {TracksCreateManyAndReturnArgs} args - Arguments to create many Tracks.
     * @example
     * // Create many Tracks
     * const tracks = await prisma.tracks.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Tracks and only return the `id`
     * const tracksWithIdOnly = await prisma.tracks.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TracksCreateManyAndReturnArgs>(args?: SelectSubset<T, TracksCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Tracks.
     * @param {TracksDeleteArgs} args - Arguments to delete one Tracks.
     * @example
     * // Delete one Tracks
     * const Tracks = await prisma.tracks.delete({
     *   where: {
     *     // ... filter to delete one Tracks
     *   }
     * })
     * 
     */
    delete<T extends TracksDeleteArgs>(args: SelectSubset<T, TracksDeleteArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Tracks.
     * @param {TracksUpdateArgs} args - Arguments to update one Tracks.
     * @example
     * // Update one Tracks
     * const tracks = await prisma.tracks.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TracksUpdateArgs>(args: SelectSubset<T, TracksUpdateArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Tracks.
     * @param {TracksDeleteManyArgs} args - Arguments to filter Tracks to delete.
     * @example
     * // Delete a few Tracks
     * const { count } = await prisma.tracks.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TracksDeleteManyArgs>(args?: SelectSubset<T, TracksDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tracks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Tracks
     * const tracks = await prisma.tracks.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TracksUpdateManyArgs>(args: SelectSubset<T, TracksUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tracks and returns the data updated in the database.
     * @param {TracksUpdateManyAndReturnArgs} args - Arguments to update many Tracks.
     * @example
     * // Update many Tracks
     * const tracks = await prisma.tracks.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Tracks and only return the `id`
     * const tracksWithIdOnly = await prisma.tracks.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TracksUpdateManyAndReturnArgs>(args: SelectSubset<T, TracksUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Tracks.
     * @param {TracksUpsertArgs} args - Arguments to update or create a Tracks.
     * @example
     * // Update or create a Tracks
     * const tracks = await prisma.tracks.upsert({
     *   create: {
     *     // ... data to create a Tracks
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Tracks we want to update
     *   }
     * })
     */
    upsert<T extends TracksUpsertArgs>(args: SelectSubset<T, TracksUpsertArgs<ExtArgs>>): Prisma__TracksClient<$Result.GetResult<Prisma.$TracksPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Tracks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksCountArgs} args - Arguments to filter Tracks to count.
     * @example
     * // Count the number of Tracks
     * const count = await prisma.tracks.count({
     *   where: {
     *     // ... the filter for the Tracks we want to count
     *   }
     * })
    **/
    count<T extends TracksCountArgs>(
      args?: Subset<T, TracksCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TracksCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Tracks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TracksAggregateArgs>(args: Subset<T, TracksAggregateArgs>): Prisma.PrismaPromise<GetTracksAggregateType<T>>

    /**
     * Group by Tracks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TracksGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TracksGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TracksGroupByArgs['orderBy'] }
        : { orderBy?: TracksGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TracksGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTracksGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Tracks model
   */
  readonly fields: TracksFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Tracks.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TracksClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    Queue<T extends QueueDefaultArgs<ExtArgs> = {}>(args?: Subset<T, QueueDefaultArgs<ExtArgs>>): Prisma__QueueClient<$Result.GetResult<Prisma.$QueuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Tracks model
   */ 
  interface TracksFieldRefs {
    readonly id: FieldRef<"Tracks", 'Int'>
    readonly trackId: FieldRef<"Tracks", 'String'>
    readonly addedAt: FieldRef<"Tracks", 'BigInt'>
    readonly priority: FieldRef<"Tracks", 'Boolean'>
    readonly info: FieldRef<"Tracks", 'String'>
    readonly source: FieldRef<"Tracks", 'String'>
    readonly requestedBy: FieldRef<"Tracks", 'String'>
    readonly queueId: FieldRef<"Tracks", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * Tracks findUnique
   */
  export type TracksFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter, which Tracks to fetch.
     */
    where: TracksWhereUniqueInput
  }

  /**
   * Tracks findUniqueOrThrow
   */
  export type TracksFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter, which Tracks to fetch.
     */
    where: TracksWhereUniqueInput
  }

  /**
   * Tracks findFirst
   */
  export type TracksFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter, which Tracks to fetch.
     */
    where?: TracksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tracks to fetch.
     */
    orderBy?: TracksOrderByWithRelationInput | TracksOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tracks.
     */
    cursor?: TracksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tracks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tracks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tracks.
     */
    distinct?: TracksScalarFieldEnum | TracksScalarFieldEnum[]
  }

  /**
   * Tracks findFirstOrThrow
   */
  export type TracksFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter, which Tracks to fetch.
     */
    where?: TracksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tracks to fetch.
     */
    orderBy?: TracksOrderByWithRelationInput | TracksOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tracks.
     */
    cursor?: TracksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tracks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tracks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tracks.
     */
    distinct?: TracksScalarFieldEnum | TracksScalarFieldEnum[]
  }

  /**
   * Tracks findMany
   */
  export type TracksFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter, which Tracks to fetch.
     */
    where?: TracksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tracks to fetch.
     */
    orderBy?: TracksOrderByWithRelationInput | TracksOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Tracks.
     */
    cursor?: TracksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tracks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tracks.
     */
    skip?: number
    distinct?: TracksScalarFieldEnum | TracksScalarFieldEnum[]
  }

  /**
   * Tracks create
   */
  export type TracksCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * The data needed to create a Tracks.
     */
    data: XOR<TracksCreateInput, TracksUncheckedCreateInput>
  }

  /**
   * Tracks createMany
   */
  export type TracksCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Tracks.
     */
    data: TracksCreateManyInput | TracksCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Tracks createManyAndReturn
   */
  export type TracksCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * The data used to create many Tracks.
     */
    data: TracksCreateManyInput | TracksCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Tracks update
   */
  export type TracksUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * The data needed to update a Tracks.
     */
    data: XOR<TracksUpdateInput, TracksUncheckedUpdateInput>
    /**
     * Choose, which Tracks to update.
     */
    where: TracksWhereUniqueInput
  }

  /**
   * Tracks updateMany
   */
  export type TracksUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Tracks.
     */
    data: XOR<TracksUpdateManyMutationInput, TracksUncheckedUpdateManyInput>
    /**
     * Filter which Tracks to update
     */
    where?: TracksWhereInput
    /**
     * Limit how many Tracks to update.
     */
    limit?: number
  }

  /**
   * Tracks updateManyAndReturn
   */
  export type TracksUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * The data used to update Tracks.
     */
    data: XOR<TracksUpdateManyMutationInput, TracksUncheckedUpdateManyInput>
    /**
     * Filter which Tracks to update
     */
    where?: TracksWhereInput
    /**
     * Limit how many Tracks to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Tracks upsert
   */
  export type TracksUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * The filter to search for the Tracks to update in case it exists.
     */
    where: TracksWhereUniqueInput
    /**
     * In case the Tracks found by the `where` argument doesn't exist, create a new Tracks with this data.
     */
    create: XOR<TracksCreateInput, TracksUncheckedCreateInput>
    /**
     * In case the Tracks was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TracksUpdateInput, TracksUncheckedUpdateInput>
  }

  /**
   * Tracks delete
   */
  export type TracksDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
    /**
     * Filter which Tracks to delete.
     */
    where: TracksWhereUniqueInput
  }

  /**
   * Tracks deleteMany
   */
  export type TracksDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tracks to delete
     */
    where?: TracksWhereInput
    /**
     * Limit how many Tracks to delete.
     */
    limit?: number
  }

  /**
   * Tracks without action
   */
  export type TracksDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tracks
     */
    select?: TracksSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tracks
     */
    omit?: TracksOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TracksInclude<ExtArgs> | null
  }


  /**
   * Model GlobalHistory
   */

  export type AggregateGlobalHistory = {
    _count: GlobalHistoryCountAggregateOutputType | null
    _avg: GlobalHistoryAvgAggregateOutputType | null
    _sum: GlobalHistorySumAggregateOutputType | null
    _min: GlobalHistoryMinAggregateOutputType | null
    _max: GlobalHistoryMaxAggregateOutputType | null
  }

  export type GlobalHistoryAvgAggregateOutputType = {
    id: number | null
    playCount: number | null
  }

  export type GlobalHistorySumAggregateOutputType = {
    id: number | null
    playCount: number | null
  }

  export type GlobalHistoryMinAggregateOutputType = {
    id: number | null
    trackId: string | null
    info: string | null
    playedAt: Date | null
    playCount: number | null
  }

  export type GlobalHistoryMaxAggregateOutputType = {
    id: number | null
    trackId: string | null
    info: string | null
    playedAt: Date | null
    playCount: number | null
  }

  export type GlobalHistoryCountAggregateOutputType = {
    id: number
    trackId: number
    info: number
    playedAt: number
    playCount: number
    _all: number
  }


  export type GlobalHistoryAvgAggregateInputType = {
    id?: true
    playCount?: true
  }

  export type GlobalHistorySumAggregateInputType = {
    id?: true
    playCount?: true
  }

  export type GlobalHistoryMinAggregateInputType = {
    id?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
  }

  export type GlobalHistoryMaxAggregateInputType = {
    id?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
  }

  export type GlobalHistoryCountAggregateInputType = {
    id?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
    _all?: true
  }

  export type GlobalHistoryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GlobalHistory to aggregate.
     */
    where?: GlobalHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GlobalHistories to fetch.
     */
    orderBy?: GlobalHistoryOrderByWithRelationInput | GlobalHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: GlobalHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GlobalHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GlobalHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned GlobalHistories
    **/
    _count?: true | GlobalHistoryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: GlobalHistoryAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: GlobalHistorySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: GlobalHistoryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: GlobalHistoryMaxAggregateInputType
  }

  export type GetGlobalHistoryAggregateType<T extends GlobalHistoryAggregateArgs> = {
        [P in keyof T & keyof AggregateGlobalHistory]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateGlobalHistory[P]>
      : GetScalarType<T[P], AggregateGlobalHistory[P]>
  }




  export type GlobalHistoryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GlobalHistoryWhereInput
    orderBy?: GlobalHistoryOrderByWithAggregationInput | GlobalHistoryOrderByWithAggregationInput[]
    by: GlobalHistoryScalarFieldEnum[] | GlobalHistoryScalarFieldEnum
    having?: GlobalHistoryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: GlobalHistoryCountAggregateInputType | true
    _avg?: GlobalHistoryAvgAggregateInputType
    _sum?: GlobalHistorySumAggregateInputType
    _min?: GlobalHistoryMinAggregateInputType
    _max?: GlobalHistoryMaxAggregateInputType
  }

  export type GlobalHistoryGroupByOutputType = {
    id: number
    trackId: string
    info: string
    playedAt: Date
    playCount: number
    _count: GlobalHistoryCountAggregateOutputType | null
    _avg: GlobalHistoryAvgAggregateOutputType | null
    _sum: GlobalHistorySumAggregateOutputType | null
    _min: GlobalHistoryMinAggregateOutputType | null
    _max: GlobalHistoryMaxAggregateOutputType | null
  }

  type GetGlobalHistoryGroupByPayload<T extends GlobalHistoryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<GlobalHistoryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof GlobalHistoryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], GlobalHistoryGroupByOutputType[P]>
            : GetScalarType<T[P], GlobalHistoryGroupByOutputType[P]>
        }
      >
    >


  export type GlobalHistorySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["globalHistory"]>

  export type GlobalHistorySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["globalHistory"]>

  export type GlobalHistorySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["globalHistory"]>

  export type GlobalHistorySelectScalar = {
    id?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }

  export type GlobalHistoryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "trackId" | "info" | "playedAt" | "playCount", ExtArgs["result"]["globalHistory"]>

  export type $GlobalHistoryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "GlobalHistory"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: number
      trackId: string
      info: string
      playedAt: Date
      playCount: number
    }, ExtArgs["result"]["globalHistory"]>
    composites: {}
  }

  type GlobalHistoryGetPayload<S extends boolean | null | undefined | GlobalHistoryDefaultArgs> = $Result.GetResult<Prisma.$GlobalHistoryPayload, S>

  type GlobalHistoryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<GlobalHistoryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: GlobalHistoryCountAggregateInputType | true
    }

  export interface GlobalHistoryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['GlobalHistory'], meta: { name: 'GlobalHistory' } }
    /**
     * Find zero or one GlobalHistory that matches the filter.
     * @param {GlobalHistoryFindUniqueArgs} args - Arguments to find a GlobalHistory
     * @example
     * // Get one GlobalHistory
     * const globalHistory = await prisma.globalHistory.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends GlobalHistoryFindUniqueArgs>(args: SelectSubset<T, GlobalHistoryFindUniqueArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one GlobalHistory that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {GlobalHistoryFindUniqueOrThrowArgs} args - Arguments to find a GlobalHistory
     * @example
     * // Get one GlobalHistory
     * const globalHistory = await prisma.globalHistory.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends GlobalHistoryFindUniqueOrThrowArgs>(args: SelectSubset<T, GlobalHistoryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first GlobalHistory that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryFindFirstArgs} args - Arguments to find a GlobalHistory
     * @example
     * // Get one GlobalHistory
     * const globalHistory = await prisma.globalHistory.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends GlobalHistoryFindFirstArgs>(args?: SelectSubset<T, GlobalHistoryFindFirstArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first GlobalHistory that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryFindFirstOrThrowArgs} args - Arguments to find a GlobalHistory
     * @example
     * // Get one GlobalHistory
     * const globalHistory = await prisma.globalHistory.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends GlobalHistoryFindFirstOrThrowArgs>(args?: SelectSubset<T, GlobalHistoryFindFirstOrThrowArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more GlobalHistories that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all GlobalHistories
     * const globalHistories = await prisma.globalHistory.findMany()
     * 
     * // Get first 10 GlobalHistories
     * const globalHistories = await prisma.globalHistory.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const globalHistoryWithIdOnly = await prisma.globalHistory.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends GlobalHistoryFindManyArgs>(args?: SelectSubset<T, GlobalHistoryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a GlobalHistory.
     * @param {GlobalHistoryCreateArgs} args - Arguments to create a GlobalHistory.
     * @example
     * // Create one GlobalHistory
     * const GlobalHistory = await prisma.globalHistory.create({
     *   data: {
     *     // ... data to create a GlobalHistory
     *   }
     * })
     * 
     */
    create<T extends GlobalHistoryCreateArgs>(args: SelectSubset<T, GlobalHistoryCreateArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many GlobalHistories.
     * @param {GlobalHistoryCreateManyArgs} args - Arguments to create many GlobalHistories.
     * @example
     * // Create many GlobalHistories
     * const globalHistory = await prisma.globalHistory.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends GlobalHistoryCreateManyArgs>(args?: SelectSubset<T, GlobalHistoryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many GlobalHistories and returns the data saved in the database.
     * @param {GlobalHistoryCreateManyAndReturnArgs} args - Arguments to create many GlobalHistories.
     * @example
     * // Create many GlobalHistories
     * const globalHistory = await prisma.globalHistory.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many GlobalHistories and only return the `id`
     * const globalHistoryWithIdOnly = await prisma.globalHistory.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends GlobalHistoryCreateManyAndReturnArgs>(args?: SelectSubset<T, GlobalHistoryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a GlobalHistory.
     * @param {GlobalHistoryDeleteArgs} args - Arguments to delete one GlobalHistory.
     * @example
     * // Delete one GlobalHistory
     * const GlobalHistory = await prisma.globalHistory.delete({
     *   where: {
     *     // ... filter to delete one GlobalHistory
     *   }
     * })
     * 
     */
    delete<T extends GlobalHistoryDeleteArgs>(args: SelectSubset<T, GlobalHistoryDeleteArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one GlobalHistory.
     * @param {GlobalHistoryUpdateArgs} args - Arguments to update one GlobalHistory.
     * @example
     * // Update one GlobalHistory
     * const globalHistory = await prisma.globalHistory.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends GlobalHistoryUpdateArgs>(args: SelectSubset<T, GlobalHistoryUpdateArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more GlobalHistories.
     * @param {GlobalHistoryDeleteManyArgs} args - Arguments to filter GlobalHistories to delete.
     * @example
     * // Delete a few GlobalHistories
     * const { count } = await prisma.globalHistory.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends GlobalHistoryDeleteManyArgs>(args?: SelectSubset<T, GlobalHistoryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more GlobalHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many GlobalHistories
     * const globalHistory = await prisma.globalHistory.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends GlobalHistoryUpdateManyArgs>(args: SelectSubset<T, GlobalHistoryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more GlobalHistories and returns the data updated in the database.
     * @param {GlobalHistoryUpdateManyAndReturnArgs} args - Arguments to update many GlobalHistories.
     * @example
     * // Update many GlobalHistories
     * const globalHistory = await prisma.globalHistory.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more GlobalHistories and only return the `id`
     * const globalHistoryWithIdOnly = await prisma.globalHistory.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends GlobalHistoryUpdateManyAndReturnArgs>(args: SelectSubset<T, GlobalHistoryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one GlobalHistory.
     * @param {GlobalHistoryUpsertArgs} args - Arguments to update or create a GlobalHistory.
     * @example
     * // Update or create a GlobalHistory
     * const globalHistory = await prisma.globalHistory.upsert({
     *   create: {
     *     // ... data to create a GlobalHistory
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the GlobalHistory we want to update
     *   }
     * })
     */
    upsert<T extends GlobalHistoryUpsertArgs>(args: SelectSubset<T, GlobalHistoryUpsertArgs<ExtArgs>>): Prisma__GlobalHistoryClient<$Result.GetResult<Prisma.$GlobalHistoryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of GlobalHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryCountArgs} args - Arguments to filter GlobalHistories to count.
     * @example
     * // Count the number of GlobalHistories
     * const count = await prisma.globalHistory.count({
     *   where: {
     *     // ... the filter for the GlobalHistories we want to count
     *   }
     * })
    **/
    count<T extends GlobalHistoryCountArgs>(
      args?: Subset<T, GlobalHistoryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], GlobalHistoryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a GlobalHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends GlobalHistoryAggregateArgs>(args: Subset<T, GlobalHistoryAggregateArgs>): Prisma.PrismaPromise<GetGlobalHistoryAggregateType<T>>

    /**
     * Group by GlobalHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GlobalHistoryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends GlobalHistoryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: GlobalHistoryGroupByArgs['orderBy'] }
        : { orderBy?: GlobalHistoryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, GlobalHistoryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetGlobalHistoryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the GlobalHistory model
   */
  readonly fields: GlobalHistoryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for GlobalHistory.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__GlobalHistoryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the GlobalHistory model
   */ 
  interface GlobalHistoryFieldRefs {
    readonly id: FieldRef<"GlobalHistory", 'Int'>
    readonly trackId: FieldRef<"GlobalHistory", 'String'>
    readonly info: FieldRef<"GlobalHistory", 'String'>
    readonly playedAt: FieldRef<"GlobalHistory", 'DateTime'>
    readonly playCount: FieldRef<"GlobalHistory", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * GlobalHistory findUnique
   */
  export type GlobalHistoryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter, which GlobalHistory to fetch.
     */
    where: GlobalHistoryWhereUniqueInput
  }

  /**
   * GlobalHistory findUniqueOrThrow
   */
  export type GlobalHistoryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter, which GlobalHistory to fetch.
     */
    where: GlobalHistoryWhereUniqueInput
  }

  /**
   * GlobalHistory findFirst
   */
  export type GlobalHistoryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter, which GlobalHistory to fetch.
     */
    where?: GlobalHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GlobalHistories to fetch.
     */
    orderBy?: GlobalHistoryOrderByWithRelationInput | GlobalHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GlobalHistories.
     */
    cursor?: GlobalHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GlobalHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GlobalHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GlobalHistories.
     */
    distinct?: GlobalHistoryScalarFieldEnum | GlobalHistoryScalarFieldEnum[]
  }

  /**
   * GlobalHistory findFirstOrThrow
   */
  export type GlobalHistoryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter, which GlobalHistory to fetch.
     */
    where?: GlobalHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GlobalHistories to fetch.
     */
    orderBy?: GlobalHistoryOrderByWithRelationInput | GlobalHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GlobalHistories.
     */
    cursor?: GlobalHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GlobalHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GlobalHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GlobalHistories.
     */
    distinct?: GlobalHistoryScalarFieldEnum | GlobalHistoryScalarFieldEnum[]
  }

  /**
   * GlobalHistory findMany
   */
  export type GlobalHistoryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter, which GlobalHistories to fetch.
     */
    where?: GlobalHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GlobalHistories to fetch.
     */
    orderBy?: GlobalHistoryOrderByWithRelationInput | GlobalHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing GlobalHistories.
     */
    cursor?: GlobalHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GlobalHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GlobalHistories.
     */
    skip?: number
    distinct?: GlobalHistoryScalarFieldEnum | GlobalHistoryScalarFieldEnum[]
  }

  /**
   * GlobalHistory create
   */
  export type GlobalHistoryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * The data needed to create a GlobalHistory.
     */
    data: XOR<GlobalHistoryCreateInput, GlobalHistoryUncheckedCreateInput>
  }

  /**
   * GlobalHistory createMany
   */
  export type GlobalHistoryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many GlobalHistories.
     */
    data: GlobalHistoryCreateManyInput | GlobalHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * GlobalHistory createManyAndReturn
   */
  export type GlobalHistoryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * The data used to create many GlobalHistories.
     */
    data: GlobalHistoryCreateManyInput | GlobalHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * GlobalHistory update
   */
  export type GlobalHistoryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * The data needed to update a GlobalHistory.
     */
    data: XOR<GlobalHistoryUpdateInput, GlobalHistoryUncheckedUpdateInput>
    /**
     * Choose, which GlobalHistory to update.
     */
    where: GlobalHistoryWhereUniqueInput
  }

  /**
   * GlobalHistory updateMany
   */
  export type GlobalHistoryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update GlobalHistories.
     */
    data: XOR<GlobalHistoryUpdateManyMutationInput, GlobalHistoryUncheckedUpdateManyInput>
    /**
     * Filter which GlobalHistories to update
     */
    where?: GlobalHistoryWhereInput
    /**
     * Limit how many GlobalHistories to update.
     */
    limit?: number
  }

  /**
   * GlobalHistory updateManyAndReturn
   */
  export type GlobalHistoryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * The data used to update GlobalHistories.
     */
    data: XOR<GlobalHistoryUpdateManyMutationInput, GlobalHistoryUncheckedUpdateManyInput>
    /**
     * Filter which GlobalHistories to update
     */
    where?: GlobalHistoryWhereInput
    /**
     * Limit how many GlobalHistories to update.
     */
    limit?: number
  }

  /**
   * GlobalHistory upsert
   */
  export type GlobalHistoryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * The filter to search for the GlobalHistory to update in case it exists.
     */
    where: GlobalHistoryWhereUniqueInput
    /**
     * In case the GlobalHistory found by the `where` argument doesn't exist, create a new GlobalHistory with this data.
     */
    create: XOR<GlobalHistoryCreateInput, GlobalHistoryUncheckedCreateInput>
    /**
     * In case the GlobalHistory was found with the provided `where` argument, update it with this data.
     */
    update: XOR<GlobalHistoryUpdateInput, GlobalHistoryUncheckedUpdateInput>
  }

  /**
   * GlobalHistory delete
   */
  export type GlobalHistoryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
    /**
     * Filter which GlobalHistory to delete.
     */
    where: GlobalHistoryWhereUniqueInput
  }

  /**
   * GlobalHistory deleteMany
   */
  export type GlobalHistoryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GlobalHistories to delete
     */
    where?: GlobalHistoryWhereInput
    /**
     * Limit how many GlobalHistories to delete.
     */
    limit?: number
  }

  /**
   * GlobalHistory without action
   */
  export type GlobalHistoryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GlobalHistory
     */
    select?: GlobalHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the GlobalHistory
     */
    omit?: GlobalHistoryOmit<ExtArgs> | null
  }


  /**
   * Model UserHistory
   */

  export type AggregateUserHistory = {
    _count: UserHistoryCountAggregateOutputType | null
    _avg: UserHistoryAvgAggregateOutputType | null
    _sum: UserHistorySumAggregateOutputType | null
    _min: UserHistoryMinAggregateOutputType | null
    _max: UserHistoryMaxAggregateOutputType | null
  }

  export type UserHistoryAvgAggregateOutputType = {
    id: number | null
    playCount: number | null
  }

  export type UserHistorySumAggregateOutputType = {
    id: number | null
    playCount: number | null
  }

  export type UserHistoryMinAggregateOutputType = {
    id: number | null
    requestedBy: string | null
    trackId: string | null
    info: string | null
    playedAt: Date | null
    playCount: number | null
  }

  export type UserHistoryMaxAggregateOutputType = {
    id: number | null
    requestedBy: string | null
    trackId: string | null
    info: string | null
    playedAt: Date | null
    playCount: number | null
  }

  export type UserHistoryCountAggregateOutputType = {
    id: number
    requestedBy: number
    trackId: number
    info: number
    playedAt: number
    playCount: number
    _all: number
  }


  export type UserHistoryAvgAggregateInputType = {
    id?: true
    playCount?: true
  }

  export type UserHistorySumAggregateInputType = {
    id?: true
    playCount?: true
  }

  export type UserHistoryMinAggregateInputType = {
    id?: true
    requestedBy?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
  }

  export type UserHistoryMaxAggregateInputType = {
    id?: true
    requestedBy?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
  }

  export type UserHistoryCountAggregateInputType = {
    id?: true
    requestedBy?: true
    trackId?: true
    info?: true
    playedAt?: true
    playCount?: true
    _all?: true
  }

  export type UserHistoryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserHistory to aggregate.
     */
    where?: UserHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserHistories to fetch.
     */
    orderBy?: UserHistoryOrderByWithRelationInput | UserHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned UserHistories
    **/
    _count?: true | UserHistoryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: UserHistoryAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: UserHistorySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserHistoryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserHistoryMaxAggregateInputType
  }

  export type GetUserHistoryAggregateType<T extends UserHistoryAggregateArgs> = {
        [P in keyof T & keyof AggregateUserHistory]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUserHistory[P]>
      : GetScalarType<T[P], AggregateUserHistory[P]>
  }




  export type UserHistoryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserHistoryWhereInput
    orderBy?: UserHistoryOrderByWithAggregationInput | UserHistoryOrderByWithAggregationInput[]
    by: UserHistoryScalarFieldEnum[] | UserHistoryScalarFieldEnum
    having?: UserHistoryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserHistoryCountAggregateInputType | true
    _avg?: UserHistoryAvgAggregateInputType
    _sum?: UserHistorySumAggregateInputType
    _min?: UserHistoryMinAggregateInputType
    _max?: UserHistoryMaxAggregateInputType
  }

  export type UserHistoryGroupByOutputType = {
    id: number
    requestedBy: string
    trackId: string
    info: string
    playedAt: Date
    playCount: number
    _count: UserHistoryCountAggregateOutputType | null
    _avg: UserHistoryAvgAggregateOutputType | null
    _sum: UserHistorySumAggregateOutputType | null
    _min: UserHistoryMinAggregateOutputType | null
    _max: UserHistoryMaxAggregateOutputType | null
  }

  type GetUserHistoryGroupByPayload<T extends UserHistoryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserHistoryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserHistoryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserHistoryGroupByOutputType[P]>
            : GetScalarType<T[P], UserHistoryGroupByOutputType[P]>
        }
      >
    >


  export type UserHistorySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    requestedBy?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["userHistory"]>

  export type UserHistorySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    requestedBy?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["userHistory"]>

  export type UserHistorySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    requestedBy?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }, ExtArgs["result"]["userHistory"]>

  export type UserHistorySelectScalar = {
    id?: boolean
    requestedBy?: boolean
    trackId?: boolean
    info?: boolean
    playedAt?: boolean
    playCount?: boolean
  }

  export type UserHistoryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "requestedBy" | "trackId" | "info" | "playedAt" | "playCount", ExtArgs["result"]["userHistory"]>

  export type $UserHistoryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "UserHistory"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: number
      requestedBy: string
      trackId: string
      info: string
      playedAt: Date
      playCount: number
    }, ExtArgs["result"]["userHistory"]>
    composites: {}
  }

  type UserHistoryGetPayload<S extends boolean | null | undefined | UserHistoryDefaultArgs> = $Result.GetResult<Prisma.$UserHistoryPayload, S>

  type UserHistoryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserHistoryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserHistoryCountAggregateInputType | true
    }

  export interface UserHistoryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['UserHistory'], meta: { name: 'UserHistory' } }
    /**
     * Find zero or one UserHistory that matches the filter.
     * @param {UserHistoryFindUniqueArgs} args - Arguments to find a UserHistory
     * @example
     * // Get one UserHistory
     * const userHistory = await prisma.userHistory.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserHistoryFindUniqueArgs>(args: SelectSubset<T, UserHistoryFindUniqueArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one UserHistory that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserHistoryFindUniqueOrThrowArgs} args - Arguments to find a UserHistory
     * @example
     * // Get one UserHistory
     * const userHistory = await prisma.userHistory.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserHistoryFindUniqueOrThrowArgs>(args: SelectSubset<T, UserHistoryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserHistory that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryFindFirstArgs} args - Arguments to find a UserHistory
     * @example
     * // Get one UserHistory
     * const userHistory = await prisma.userHistory.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserHistoryFindFirstArgs>(args?: SelectSubset<T, UserHistoryFindFirstArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserHistory that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryFindFirstOrThrowArgs} args - Arguments to find a UserHistory
     * @example
     * // Get one UserHistory
     * const userHistory = await prisma.userHistory.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserHistoryFindFirstOrThrowArgs>(args?: SelectSubset<T, UserHistoryFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more UserHistories that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all UserHistories
     * const userHistories = await prisma.userHistory.findMany()
     * 
     * // Get first 10 UserHistories
     * const userHistories = await prisma.userHistory.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userHistoryWithIdOnly = await prisma.userHistory.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserHistoryFindManyArgs>(args?: SelectSubset<T, UserHistoryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a UserHistory.
     * @param {UserHistoryCreateArgs} args - Arguments to create a UserHistory.
     * @example
     * // Create one UserHistory
     * const UserHistory = await prisma.userHistory.create({
     *   data: {
     *     // ... data to create a UserHistory
     *   }
     * })
     * 
     */
    create<T extends UserHistoryCreateArgs>(args: SelectSubset<T, UserHistoryCreateArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many UserHistories.
     * @param {UserHistoryCreateManyArgs} args - Arguments to create many UserHistories.
     * @example
     * // Create many UserHistories
     * const userHistory = await prisma.userHistory.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserHistoryCreateManyArgs>(args?: SelectSubset<T, UserHistoryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many UserHistories and returns the data saved in the database.
     * @param {UserHistoryCreateManyAndReturnArgs} args - Arguments to create many UserHistories.
     * @example
     * // Create many UserHistories
     * const userHistory = await prisma.userHistory.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many UserHistories and only return the `id`
     * const userHistoryWithIdOnly = await prisma.userHistory.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserHistoryCreateManyAndReturnArgs>(args?: SelectSubset<T, UserHistoryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a UserHistory.
     * @param {UserHistoryDeleteArgs} args - Arguments to delete one UserHistory.
     * @example
     * // Delete one UserHistory
     * const UserHistory = await prisma.userHistory.delete({
     *   where: {
     *     // ... filter to delete one UserHistory
     *   }
     * })
     * 
     */
    delete<T extends UserHistoryDeleteArgs>(args: SelectSubset<T, UserHistoryDeleteArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one UserHistory.
     * @param {UserHistoryUpdateArgs} args - Arguments to update one UserHistory.
     * @example
     * // Update one UserHistory
     * const userHistory = await prisma.userHistory.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserHistoryUpdateArgs>(args: SelectSubset<T, UserHistoryUpdateArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more UserHistories.
     * @param {UserHistoryDeleteManyArgs} args - Arguments to filter UserHistories to delete.
     * @example
     * // Delete a few UserHistories
     * const { count } = await prisma.userHistory.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserHistoryDeleteManyArgs>(args?: SelectSubset<T, UserHistoryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many UserHistories
     * const userHistory = await prisma.userHistory.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserHistoryUpdateManyArgs>(args: SelectSubset<T, UserHistoryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserHistories and returns the data updated in the database.
     * @param {UserHistoryUpdateManyAndReturnArgs} args - Arguments to update many UserHistories.
     * @example
     * // Update many UserHistories
     * const userHistory = await prisma.userHistory.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more UserHistories and only return the `id`
     * const userHistoryWithIdOnly = await prisma.userHistory.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserHistoryUpdateManyAndReturnArgs>(args: SelectSubset<T, UserHistoryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one UserHistory.
     * @param {UserHistoryUpsertArgs} args - Arguments to update or create a UserHistory.
     * @example
     * // Update or create a UserHistory
     * const userHistory = await prisma.userHistory.upsert({
     *   create: {
     *     // ... data to create a UserHistory
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the UserHistory we want to update
     *   }
     * })
     */
    upsert<T extends UserHistoryUpsertArgs>(args: SelectSubset<T, UserHistoryUpsertArgs<ExtArgs>>): Prisma__UserHistoryClient<$Result.GetResult<Prisma.$UserHistoryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of UserHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryCountArgs} args - Arguments to filter UserHistories to count.
     * @example
     * // Count the number of UserHistories
     * const count = await prisma.userHistory.count({
     *   where: {
     *     // ... the filter for the UserHistories we want to count
     *   }
     * })
    **/
    count<T extends UserHistoryCountArgs>(
      args?: Subset<T, UserHistoryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserHistoryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a UserHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserHistoryAggregateArgs>(args: Subset<T, UserHistoryAggregateArgs>): Prisma.PrismaPromise<GetUserHistoryAggregateType<T>>

    /**
     * Group by UserHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserHistoryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserHistoryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserHistoryGroupByArgs['orderBy'] }
        : { orderBy?: UserHistoryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserHistoryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserHistoryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the UserHistory model
   */
  readonly fields: UserHistoryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for UserHistory.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserHistoryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the UserHistory model
   */ 
  interface UserHistoryFieldRefs {
    readonly id: FieldRef<"UserHistory", 'Int'>
    readonly requestedBy: FieldRef<"UserHistory", 'String'>
    readonly trackId: FieldRef<"UserHistory", 'String'>
    readonly info: FieldRef<"UserHistory", 'String'>
    readonly playedAt: FieldRef<"UserHistory", 'DateTime'>
    readonly playCount: FieldRef<"UserHistory", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * UserHistory findUnique
   */
  export type UserHistoryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter, which UserHistory to fetch.
     */
    where: UserHistoryWhereUniqueInput
  }

  /**
   * UserHistory findUniqueOrThrow
   */
  export type UserHistoryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter, which UserHistory to fetch.
     */
    where: UserHistoryWhereUniqueInput
  }

  /**
   * UserHistory findFirst
   */
  export type UserHistoryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter, which UserHistory to fetch.
     */
    where?: UserHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserHistories to fetch.
     */
    orderBy?: UserHistoryOrderByWithRelationInput | UserHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserHistories.
     */
    cursor?: UserHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserHistories.
     */
    distinct?: UserHistoryScalarFieldEnum | UserHistoryScalarFieldEnum[]
  }

  /**
   * UserHistory findFirstOrThrow
   */
  export type UserHistoryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter, which UserHistory to fetch.
     */
    where?: UserHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserHistories to fetch.
     */
    orderBy?: UserHistoryOrderByWithRelationInput | UserHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserHistories.
     */
    cursor?: UserHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserHistories.
     */
    distinct?: UserHistoryScalarFieldEnum | UserHistoryScalarFieldEnum[]
  }

  /**
   * UserHistory findMany
   */
  export type UserHistoryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter, which UserHistories to fetch.
     */
    where?: UserHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserHistories to fetch.
     */
    orderBy?: UserHistoryOrderByWithRelationInput | UserHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing UserHistories.
     */
    cursor?: UserHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserHistories.
     */
    skip?: number
    distinct?: UserHistoryScalarFieldEnum | UserHistoryScalarFieldEnum[]
  }

  /**
   * UserHistory create
   */
  export type UserHistoryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * The data needed to create a UserHistory.
     */
    data: XOR<UserHistoryCreateInput, UserHistoryUncheckedCreateInput>
  }

  /**
   * UserHistory createMany
   */
  export type UserHistoryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many UserHistories.
     */
    data: UserHistoryCreateManyInput | UserHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UserHistory createManyAndReturn
   */
  export type UserHistoryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * The data used to create many UserHistories.
     */
    data: UserHistoryCreateManyInput | UserHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UserHistory update
   */
  export type UserHistoryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * The data needed to update a UserHistory.
     */
    data: XOR<UserHistoryUpdateInput, UserHistoryUncheckedUpdateInput>
    /**
     * Choose, which UserHistory to update.
     */
    where: UserHistoryWhereUniqueInput
  }

  /**
   * UserHistory updateMany
   */
  export type UserHistoryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update UserHistories.
     */
    data: XOR<UserHistoryUpdateManyMutationInput, UserHistoryUncheckedUpdateManyInput>
    /**
     * Filter which UserHistories to update
     */
    where?: UserHistoryWhereInput
    /**
     * Limit how many UserHistories to update.
     */
    limit?: number
  }

  /**
   * UserHistory updateManyAndReturn
   */
  export type UserHistoryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * The data used to update UserHistories.
     */
    data: XOR<UserHistoryUpdateManyMutationInput, UserHistoryUncheckedUpdateManyInput>
    /**
     * Filter which UserHistories to update
     */
    where?: UserHistoryWhereInput
    /**
     * Limit how many UserHistories to update.
     */
    limit?: number
  }

  /**
   * UserHistory upsert
   */
  export type UserHistoryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * The filter to search for the UserHistory to update in case it exists.
     */
    where: UserHistoryWhereUniqueInput
    /**
     * In case the UserHistory found by the `where` argument doesn't exist, create a new UserHistory with this data.
     */
    create: XOR<UserHistoryCreateInput, UserHistoryUncheckedCreateInput>
    /**
     * In case the UserHistory was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserHistoryUpdateInput, UserHistoryUncheckedUpdateInput>
  }

  /**
   * UserHistory delete
   */
  export type UserHistoryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
    /**
     * Filter which UserHistory to delete.
     */
    where: UserHistoryWhereUniqueInput
  }

  /**
   * UserHistory deleteMany
   */
  export type UserHistoryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserHistories to delete
     */
    where?: UserHistoryWhereInput
    /**
     * Limit how many UserHistories to delete.
     */
    limit?: number
  }

  /**
   * UserHistory without action
   */
  export type UserHistoryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserHistory
     */
    select?: UserHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserHistory
     */
    omit?: UserHistoryOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const QueueScalarFieldEnum: {
    id: 'id',
    guildId: 'guildId',
    lastTrackId: 'lastTrackId',
    waveStatus: 'waveStatus',
    loop: 'loop',
    volume: 'volume'
  };

  export type QueueScalarFieldEnum = (typeof QueueScalarFieldEnum)[keyof typeof QueueScalarFieldEnum]


  export const TracksScalarFieldEnum: {
    id: 'id',
    trackId: 'trackId',
    addedAt: 'addedAt',
    priority: 'priority',
    info: 'info',
    source: 'source',
    requestedBy: 'requestedBy',
    queueId: 'queueId'
  };

  export type TracksScalarFieldEnum = (typeof TracksScalarFieldEnum)[keyof typeof TracksScalarFieldEnum]


  export const GlobalHistoryScalarFieldEnum: {
    id: 'id',
    trackId: 'trackId',
    info: 'info',
    playedAt: 'playedAt',
    playCount: 'playCount'
  };

  export type GlobalHistoryScalarFieldEnum = (typeof GlobalHistoryScalarFieldEnum)[keyof typeof GlobalHistoryScalarFieldEnum]


  export const UserHistoryScalarFieldEnum: {
    id: 'id',
    requestedBy: 'requestedBy',
    trackId: 'trackId',
    info: 'info',
    playedAt: 'playedAt',
    playCount: 'playCount'
  };

  export type UserHistoryScalarFieldEnum = (typeof UserHistoryScalarFieldEnum)[keyof typeof UserHistoryScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'BigInt'
   */
  export type BigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt'>
    


  /**
   * Reference to a field of type 'BigInt[]'
   */
  export type ListBigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type QueueWhereInput = {
    AND?: QueueWhereInput | QueueWhereInput[]
    OR?: QueueWhereInput[]
    NOT?: QueueWhereInput | QueueWhereInput[]
    id?: IntFilter<"Queue"> | number
    guildId?: StringFilter<"Queue"> | string
    lastTrackId?: StringNullableFilter<"Queue"> | string | null
    waveStatus?: BoolNullableFilter<"Queue"> | boolean | null
    loop?: BoolNullableFilter<"Queue"> | boolean | null
    volume?: IntNullableFilter<"Queue"> | number | null
    tracks?: TracksListRelationFilter
  }

  export type QueueOrderByWithRelationInput = {
    id?: SortOrder
    guildId?: SortOrder
    lastTrackId?: SortOrderInput | SortOrder
    waveStatus?: SortOrderInput | SortOrder
    loop?: SortOrderInput | SortOrder
    volume?: SortOrderInput | SortOrder
    tracks?: TracksOrderByRelationAggregateInput
  }

  export type QueueWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    guildId?: string
    AND?: QueueWhereInput | QueueWhereInput[]
    OR?: QueueWhereInput[]
    NOT?: QueueWhereInput | QueueWhereInput[]
    lastTrackId?: StringNullableFilter<"Queue"> | string | null
    waveStatus?: BoolNullableFilter<"Queue"> | boolean | null
    loop?: BoolNullableFilter<"Queue"> | boolean | null
    volume?: IntNullableFilter<"Queue"> | number | null
    tracks?: TracksListRelationFilter
  }, "id" | "guildId">

  export type QueueOrderByWithAggregationInput = {
    id?: SortOrder
    guildId?: SortOrder
    lastTrackId?: SortOrderInput | SortOrder
    waveStatus?: SortOrderInput | SortOrder
    loop?: SortOrderInput | SortOrder
    volume?: SortOrderInput | SortOrder
    _count?: QueueCountOrderByAggregateInput
    _avg?: QueueAvgOrderByAggregateInput
    _max?: QueueMaxOrderByAggregateInput
    _min?: QueueMinOrderByAggregateInput
    _sum?: QueueSumOrderByAggregateInput
  }

  export type QueueScalarWhereWithAggregatesInput = {
    AND?: QueueScalarWhereWithAggregatesInput | QueueScalarWhereWithAggregatesInput[]
    OR?: QueueScalarWhereWithAggregatesInput[]
    NOT?: QueueScalarWhereWithAggregatesInput | QueueScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Queue"> | number
    guildId?: StringWithAggregatesFilter<"Queue"> | string
    lastTrackId?: StringNullableWithAggregatesFilter<"Queue"> | string | null
    waveStatus?: BoolNullableWithAggregatesFilter<"Queue"> | boolean | null
    loop?: BoolNullableWithAggregatesFilter<"Queue"> | boolean | null
    volume?: IntNullableWithAggregatesFilter<"Queue"> | number | null
  }

  export type TracksWhereInput = {
    AND?: TracksWhereInput | TracksWhereInput[]
    OR?: TracksWhereInput[]
    NOT?: TracksWhereInput | TracksWhereInput[]
    id?: IntFilter<"Tracks"> | number
    trackId?: StringFilter<"Tracks"> | string
    addedAt?: BigIntFilter<"Tracks"> | bigint | number
    priority?: BoolFilter<"Tracks"> | boolean
    info?: StringFilter<"Tracks"> | string
    source?: StringFilter<"Tracks"> | string
    requestedBy?: StringNullableFilter<"Tracks"> | string | null
    queueId?: IntFilter<"Tracks"> | number
    Queue?: XOR<QueueScalarRelationFilter, QueueWhereInput>
  }

  export type TracksOrderByWithRelationInput = {
    id?: SortOrder
    trackId?: SortOrder
    addedAt?: SortOrder
    priority?: SortOrder
    info?: SortOrder
    source?: SortOrder
    requestedBy?: SortOrderInput | SortOrder
    queueId?: SortOrder
    Queue?: QueueOrderByWithRelationInput
  }

  export type TracksWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: TracksWhereInput | TracksWhereInput[]
    OR?: TracksWhereInput[]
    NOT?: TracksWhereInput | TracksWhereInput[]
    trackId?: StringFilter<"Tracks"> | string
    addedAt?: BigIntFilter<"Tracks"> | bigint | number
    priority?: BoolFilter<"Tracks"> | boolean
    info?: StringFilter<"Tracks"> | string
    source?: StringFilter<"Tracks"> | string
    requestedBy?: StringNullableFilter<"Tracks"> | string | null
    queueId?: IntFilter<"Tracks"> | number
    Queue?: XOR<QueueScalarRelationFilter, QueueWhereInput>
  }, "id">

  export type TracksOrderByWithAggregationInput = {
    id?: SortOrder
    trackId?: SortOrder
    addedAt?: SortOrder
    priority?: SortOrder
    info?: SortOrder
    source?: SortOrder
    requestedBy?: SortOrderInput | SortOrder
    queueId?: SortOrder
    _count?: TracksCountOrderByAggregateInput
    _avg?: TracksAvgOrderByAggregateInput
    _max?: TracksMaxOrderByAggregateInput
    _min?: TracksMinOrderByAggregateInput
    _sum?: TracksSumOrderByAggregateInput
  }

  export type TracksScalarWhereWithAggregatesInput = {
    AND?: TracksScalarWhereWithAggregatesInput | TracksScalarWhereWithAggregatesInput[]
    OR?: TracksScalarWhereWithAggregatesInput[]
    NOT?: TracksScalarWhereWithAggregatesInput | TracksScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Tracks"> | number
    trackId?: StringWithAggregatesFilter<"Tracks"> | string
    addedAt?: BigIntWithAggregatesFilter<"Tracks"> | bigint | number
    priority?: BoolWithAggregatesFilter<"Tracks"> | boolean
    info?: StringWithAggregatesFilter<"Tracks"> | string
    source?: StringWithAggregatesFilter<"Tracks"> | string
    requestedBy?: StringNullableWithAggregatesFilter<"Tracks"> | string | null
    queueId?: IntWithAggregatesFilter<"Tracks"> | number
  }

  export type GlobalHistoryWhereInput = {
    AND?: GlobalHistoryWhereInput | GlobalHistoryWhereInput[]
    OR?: GlobalHistoryWhereInput[]
    NOT?: GlobalHistoryWhereInput | GlobalHistoryWhereInput[]
    id?: IntFilter<"GlobalHistory"> | number
    trackId?: StringFilter<"GlobalHistory"> | string
    info?: StringFilter<"GlobalHistory"> | string
    playedAt?: DateTimeFilter<"GlobalHistory"> | Date | string
    playCount?: IntFilter<"GlobalHistory"> | number
  }

  export type GlobalHistoryOrderByWithRelationInput = {
    id?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type GlobalHistoryWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: GlobalHistoryWhereInput | GlobalHistoryWhereInput[]
    OR?: GlobalHistoryWhereInput[]
    NOT?: GlobalHistoryWhereInput | GlobalHistoryWhereInput[]
    trackId?: StringFilter<"GlobalHistory"> | string
    info?: StringFilter<"GlobalHistory"> | string
    playedAt?: DateTimeFilter<"GlobalHistory"> | Date | string
    playCount?: IntFilter<"GlobalHistory"> | number
  }, "id">

  export type GlobalHistoryOrderByWithAggregationInput = {
    id?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
    _count?: GlobalHistoryCountOrderByAggregateInput
    _avg?: GlobalHistoryAvgOrderByAggregateInput
    _max?: GlobalHistoryMaxOrderByAggregateInput
    _min?: GlobalHistoryMinOrderByAggregateInput
    _sum?: GlobalHistorySumOrderByAggregateInput
  }

  export type GlobalHistoryScalarWhereWithAggregatesInput = {
    AND?: GlobalHistoryScalarWhereWithAggregatesInput | GlobalHistoryScalarWhereWithAggregatesInput[]
    OR?: GlobalHistoryScalarWhereWithAggregatesInput[]
    NOT?: GlobalHistoryScalarWhereWithAggregatesInput | GlobalHistoryScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"GlobalHistory"> | number
    trackId?: StringWithAggregatesFilter<"GlobalHistory"> | string
    info?: StringWithAggregatesFilter<"GlobalHistory"> | string
    playedAt?: DateTimeWithAggregatesFilter<"GlobalHistory"> | Date | string
    playCount?: IntWithAggregatesFilter<"GlobalHistory"> | number
  }

  export type UserHistoryWhereInput = {
    AND?: UserHistoryWhereInput | UserHistoryWhereInput[]
    OR?: UserHistoryWhereInput[]
    NOT?: UserHistoryWhereInput | UserHistoryWhereInput[]
    id?: IntFilter<"UserHistory"> | number
    requestedBy?: StringFilter<"UserHistory"> | string
    trackId?: StringFilter<"UserHistory"> | string
    info?: StringFilter<"UserHistory"> | string
    playedAt?: DateTimeFilter<"UserHistory"> | Date | string
    playCount?: IntFilter<"UserHistory"> | number
  }

  export type UserHistoryOrderByWithRelationInput = {
    id?: SortOrder
    requestedBy?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type UserHistoryWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: UserHistoryWhereInput | UserHistoryWhereInput[]
    OR?: UserHistoryWhereInput[]
    NOT?: UserHistoryWhereInput | UserHistoryWhereInput[]
    requestedBy?: StringFilter<"UserHistory"> | string
    trackId?: StringFilter<"UserHistory"> | string
    info?: StringFilter<"UserHistory"> | string
    playedAt?: DateTimeFilter<"UserHistory"> | Date | string
    playCount?: IntFilter<"UserHistory"> | number
  }, "id">

  export type UserHistoryOrderByWithAggregationInput = {
    id?: SortOrder
    requestedBy?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
    _count?: UserHistoryCountOrderByAggregateInput
    _avg?: UserHistoryAvgOrderByAggregateInput
    _max?: UserHistoryMaxOrderByAggregateInput
    _min?: UserHistoryMinOrderByAggregateInput
    _sum?: UserHistorySumOrderByAggregateInput
  }

  export type UserHistoryScalarWhereWithAggregatesInput = {
    AND?: UserHistoryScalarWhereWithAggregatesInput | UserHistoryScalarWhereWithAggregatesInput[]
    OR?: UserHistoryScalarWhereWithAggregatesInput[]
    NOT?: UserHistoryScalarWhereWithAggregatesInput | UserHistoryScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"UserHistory"> | number
    requestedBy?: StringWithAggregatesFilter<"UserHistory"> | string
    trackId?: StringWithAggregatesFilter<"UserHistory"> | string
    info?: StringWithAggregatesFilter<"UserHistory"> | string
    playedAt?: DateTimeWithAggregatesFilter<"UserHistory"> | Date | string
    playCount?: IntWithAggregatesFilter<"UserHistory"> | number
  }

  export type QueueCreateInput = {
    guildId?: string
    lastTrackId?: string | null
    waveStatus?: boolean | null
    loop?: boolean | null
    volume?: number | null
    tracks?: TracksCreateNestedManyWithoutQueueInput
  }

  export type QueueUncheckedCreateInput = {
    id?: number
    guildId?: string
    lastTrackId?: string | null
    waveStatus?: boolean | null
    loop?: boolean | null
    volume?: number | null
    tracks?: TracksUncheckedCreateNestedManyWithoutQueueInput
  }

  export type QueueUpdateInput = {
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
    tracks?: TracksUpdateManyWithoutQueueNestedInput
  }

  export type QueueUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
    tracks?: TracksUncheckedUpdateManyWithoutQueueNestedInput
  }

  export type QueueCreateManyInput = {
    id?: number
    guildId?: string
    lastTrackId?: string | null
    waveStatus?: boolean | null
    loop?: boolean | null
    volume?: number | null
  }

  export type QueueUpdateManyMutationInput = {
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type QueueUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type TracksCreateInput = {
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
    Queue: QueueCreateNestedOneWithoutTracksInput
  }

  export type TracksUncheckedCreateInput = {
    id?: number
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
    queueId: number
  }

  export type TracksUpdateInput = {
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
    Queue?: QueueUpdateOneRequiredWithoutTracksNestedInput
  }

  export type TracksUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
    queueId?: IntFieldUpdateOperationsInput | number
  }

  export type TracksCreateManyInput = {
    id?: number
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
    queueId: number
  }

  export type TracksUpdateManyMutationInput = {
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TracksUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
    queueId?: IntFieldUpdateOperationsInput | number
  }

  export type GlobalHistoryCreateInput = {
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type GlobalHistoryUncheckedCreateInput = {
    id?: number
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type GlobalHistoryUpdateInput = {
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type GlobalHistoryUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type GlobalHistoryCreateManyInput = {
    id?: number
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type GlobalHistoryUpdateManyMutationInput = {
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type GlobalHistoryUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type UserHistoryCreateInput = {
    requestedBy: string
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type UserHistoryUncheckedCreateInput = {
    id?: number
    requestedBy: string
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type UserHistoryUpdateInput = {
    requestedBy?: StringFieldUpdateOperationsInput | string
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type UserHistoryUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    requestedBy?: StringFieldUpdateOperationsInput | string
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type UserHistoryCreateManyInput = {
    id?: number
    requestedBy: string
    trackId: string
    info: string
    playedAt?: Date | string
    playCount?: number
  }

  export type UserHistoryUpdateManyMutationInput = {
    requestedBy?: StringFieldUpdateOperationsInput | string
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type UserHistoryUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    requestedBy?: StringFieldUpdateOperationsInput | string
    trackId?: StringFieldUpdateOperationsInput | string
    info?: StringFieldUpdateOperationsInput | string
    playedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playCount?: IntFieldUpdateOperationsInput | number
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type BoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type TracksListRelationFilter = {
    every?: TracksWhereInput
    some?: TracksWhereInput
    none?: TracksWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type TracksOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type QueueCountOrderByAggregateInput = {
    id?: SortOrder
    guildId?: SortOrder
    lastTrackId?: SortOrder
    waveStatus?: SortOrder
    loop?: SortOrder
    volume?: SortOrder
  }

  export type QueueAvgOrderByAggregateInput = {
    id?: SortOrder
    volume?: SortOrder
  }

  export type QueueMaxOrderByAggregateInput = {
    id?: SortOrder
    guildId?: SortOrder
    lastTrackId?: SortOrder
    waveStatus?: SortOrder
    loop?: SortOrder
    volume?: SortOrder
  }

  export type QueueMinOrderByAggregateInput = {
    id?: SortOrder
    guildId?: SortOrder
    lastTrackId?: SortOrder
    waveStatus?: SortOrder
    loop?: SortOrder
    volume?: SortOrder
  }

  export type QueueSumOrderByAggregateInput = {
    id?: SortOrder
    volume?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type BigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type QueueScalarRelationFilter = {
    is?: QueueWhereInput
    isNot?: QueueWhereInput
  }

  export type TracksCountOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    addedAt?: SortOrder
    priority?: SortOrder
    info?: SortOrder
    source?: SortOrder
    requestedBy?: SortOrder
    queueId?: SortOrder
  }

  export type TracksAvgOrderByAggregateInput = {
    id?: SortOrder
    addedAt?: SortOrder
    queueId?: SortOrder
  }

  export type TracksMaxOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    addedAt?: SortOrder
    priority?: SortOrder
    info?: SortOrder
    source?: SortOrder
    requestedBy?: SortOrder
    queueId?: SortOrder
  }

  export type TracksMinOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    addedAt?: SortOrder
    priority?: SortOrder
    info?: SortOrder
    source?: SortOrder
    requestedBy?: SortOrder
    queueId?: SortOrder
  }

  export type TracksSumOrderByAggregateInput = {
    id?: SortOrder
    addedAt?: SortOrder
    queueId?: SortOrder
  }

  export type BigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type GlobalHistoryCountOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type GlobalHistoryAvgOrderByAggregateInput = {
    id?: SortOrder
    playCount?: SortOrder
  }

  export type GlobalHistoryMaxOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type GlobalHistoryMinOrderByAggregateInput = {
    id?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type GlobalHistorySumOrderByAggregateInput = {
    id?: SortOrder
    playCount?: SortOrder
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type UserHistoryCountOrderByAggregateInput = {
    id?: SortOrder
    requestedBy?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type UserHistoryAvgOrderByAggregateInput = {
    id?: SortOrder
    playCount?: SortOrder
  }

  export type UserHistoryMaxOrderByAggregateInput = {
    id?: SortOrder
    requestedBy?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type UserHistoryMinOrderByAggregateInput = {
    id?: SortOrder
    requestedBy?: SortOrder
    trackId?: SortOrder
    info?: SortOrder
    playedAt?: SortOrder
    playCount?: SortOrder
  }

  export type UserHistorySumOrderByAggregateInput = {
    id?: SortOrder
    playCount?: SortOrder
  }

  export type TracksCreateNestedManyWithoutQueueInput = {
    create?: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput> | TracksCreateWithoutQueueInput[] | TracksUncheckedCreateWithoutQueueInput[]
    connectOrCreate?: TracksCreateOrConnectWithoutQueueInput | TracksCreateOrConnectWithoutQueueInput[]
    createMany?: TracksCreateManyQueueInputEnvelope
    connect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
  }

  export type TracksUncheckedCreateNestedManyWithoutQueueInput = {
    create?: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput> | TracksCreateWithoutQueueInput[] | TracksUncheckedCreateWithoutQueueInput[]
    connectOrCreate?: TracksCreateOrConnectWithoutQueueInput | TracksCreateOrConnectWithoutQueueInput[]
    createMany?: TracksCreateManyQueueInputEnvelope
    connect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableBoolFieldUpdateOperationsInput = {
    set?: boolean | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type TracksUpdateManyWithoutQueueNestedInput = {
    create?: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput> | TracksCreateWithoutQueueInput[] | TracksUncheckedCreateWithoutQueueInput[]
    connectOrCreate?: TracksCreateOrConnectWithoutQueueInput | TracksCreateOrConnectWithoutQueueInput[]
    upsert?: TracksUpsertWithWhereUniqueWithoutQueueInput | TracksUpsertWithWhereUniqueWithoutQueueInput[]
    createMany?: TracksCreateManyQueueInputEnvelope
    set?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    disconnect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    delete?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    connect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    update?: TracksUpdateWithWhereUniqueWithoutQueueInput | TracksUpdateWithWhereUniqueWithoutQueueInput[]
    updateMany?: TracksUpdateManyWithWhereWithoutQueueInput | TracksUpdateManyWithWhereWithoutQueueInput[]
    deleteMany?: TracksScalarWhereInput | TracksScalarWhereInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type TracksUncheckedUpdateManyWithoutQueueNestedInput = {
    create?: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput> | TracksCreateWithoutQueueInput[] | TracksUncheckedCreateWithoutQueueInput[]
    connectOrCreate?: TracksCreateOrConnectWithoutQueueInput | TracksCreateOrConnectWithoutQueueInput[]
    upsert?: TracksUpsertWithWhereUniqueWithoutQueueInput | TracksUpsertWithWhereUniqueWithoutQueueInput[]
    createMany?: TracksCreateManyQueueInputEnvelope
    set?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    disconnect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    delete?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    connect?: TracksWhereUniqueInput | TracksWhereUniqueInput[]
    update?: TracksUpdateWithWhereUniqueWithoutQueueInput | TracksUpdateWithWhereUniqueWithoutQueueInput[]
    updateMany?: TracksUpdateManyWithWhereWithoutQueueInput | TracksUpdateManyWithWhereWithoutQueueInput[]
    deleteMany?: TracksScalarWhereInput | TracksScalarWhereInput[]
  }

  export type QueueCreateNestedOneWithoutTracksInput = {
    create?: XOR<QueueCreateWithoutTracksInput, QueueUncheckedCreateWithoutTracksInput>
    connectOrCreate?: QueueCreateOrConnectWithoutTracksInput
    connect?: QueueWhereUniqueInput
  }

  export type BigIntFieldUpdateOperationsInput = {
    set?: bigint | number
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type QueueUpdateOneRequiredWithoutTracksNestedInput = {
    create?: XOR<QueueCreateWithoutTracksInput, QueueUncheckedCreateWithoutTracksInput>
    connectOrCreate?: QueueCreateOrConnectWithoutTracksInput
    upsert?: QueueUpsertWithoutTracksInput
    connect?: QueueWhereUniqueInput
    update?: XOR<XOR<QueueUpdateToOneWithWhereWithoutTracksInput, QueueUpdateWithoutTracksInput>, QueueUncheckedUpdateWithoutTracksInput>
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedBoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type TracksCreateWithoutQueueInput = {
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
  }

  export type TracksUncheckedCreateWithoutQueueInput = {
    id?: number
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
  }

  export type TracksCreateOrConnectWithoutQueueInput = {
    where: TracksWhereUniqueInput
    create: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput>
  }

  export type TracksCreateManyQueueInputEnvelope = {
    data: TracksCreateManyQueueInput | TracksCreateManyQueueInput[]
    skipDuplicates?: boolean
  }

  export type TracksUpsertWithWhereUniqueWithoutQueueInput = {
    where: TracksWhereUniqueInput
    update: XOR<TracksUpdateWithoutQueueInput, TracksUncheckedUpdateWithoutQueueInput>
    create: XOR<TracksCreateWithoutQueueInput, TracksUncheckedCreateWithoutQueueInput>
  }

  export type TracksUpdateWithWhereUniqueWithoutQueueInput = {
    where: TracksWhereUniqueInput
    data: XOR<TracksUpdateWithoutQueueInput, TracksUncheckedUpdateWithoutQueueInput>
  }

  export type TracksUpdateManyWithWhereWithoutQueueInput = {
    where: TracksScalarWhereInput
    data: XOR<TracksUpdateManyMutationInput, TracksUncheckedUpdateManyWithoutQueueInput>
  }

  export type TracksScalarWhereInput = {
    AND?: TracksScalarWhereInput | TracksScalarWhereInput[]
    OR?: TracksScalarWhereInput[]
    NOT?: TracksScalarWhereInput | TracksScalarWhereInput[]
    id?: IntFilter<"Tracks"> | number
    trackId?: StringFilter<"Tracks"> | string
    addedAt?: BigIntFilter<"Tracks"> | bigint | number
    priority?: BoolFilter<"Tracks"> | boolean
    info?: StringFilter<"Tracks"> | string
    source?: StringFilter<"Tracks"> | string
    requestedBy?: StringNullableFilter<"Tracks"> | string | null
    queueId?: IntFilter<"Tracks"> | number
  }

  export type QueueCreateWithoutTracksInput = {
    guildId?: string
    lastTrackId?: string | null
    waveStatus?: boolean | null
    loop?: boolean | null
    volume?: number | null
  }

  export type QueueUncheckedCreateWithoutTracksInput = {
    id?: number
    guildId?: string
    lastTrackId?: string | null
    waveStatus?: boolean | null
    loop?: boolean | null
    volume?: number | null
  }

  export type QueueCreateOrConnectWithoutTracksInput = {
    where: QueueWhereUniqueInput
    create: XOR<QueueCreateWithoutTracksInput, QueueUncheckedCreateWithoutTracksInput>
  }

  export type QueueUpsertWithoutTracksInput = {
    update: XOR<QueueUpdateWithoutTracksInput, QueueUncheckedUpdateWithoutTracksInput>
    create: XOR<QueueCreateWithoutTracksInput, QueueUncheckedCreateWithoutTracksInput>
    where?: QueueWhereInput
  }

  export type QueueUpdateToOneWithWhereWithoutTracksInput = {
    where?: QueueWhereInput
    data: XOR<QueueUpdateWithoutTracksInput, QueueUncheckedUpdateWithoutTracksInput>
  }

  export type QueueUpdateWithoutTracksInput = {
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type QueueUncheckedUpdateWithoutTracksInput = {
    id?: IntFieldUpdateOperationsInput | number
    guildId?: StringFieldUpdateOperationsInput | string
    lastTrackId?: NullableStringFieldUpdateOperationsInput | string | null
    waveStatus?: NullableBoolFieldUpdateOperationsInput | boolean | null
    loop?: NullableBoolFieldUpdateOperationsInput | boolean | null
    volume?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type TracksCreateManyQueueInput = {
    id?: number
    trackId: string
    addedAt: bigint | number
    priority?: boolean
    info: string
    source: string
    requestedBy?: string | null
  }

  export type TracksUpdateWithoutQueueInput = {
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TracksUncheckedUpdateWithoutQueueInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TracksUncheckedUpdateManyWithoutQueueInput = {
    id?: IntFieldUpdateOperationsInput | number
    trackId?: StringFieldUpdateOperationsInput | string
    addedAt?: BigIntFieldUpdateOperationsInput | bigint | number
    priority?: BoolFieldUpdateOperationsInput | boolean
    info?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    requestedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}