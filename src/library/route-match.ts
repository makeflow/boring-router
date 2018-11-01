import {History} from 'history';
import {computed, observable} from 'mobx';
import {
  Dict,
  EmptyObjectPatch,
  OmitValueOfKey,
  OmitValueWithType,
} from 'tslang';

import {isPathPrefix, tolerate} from './@utils';
import {RouteMatchEntry, RouteSource} from './router';

export type NextRouteMatchType<TRouteMatch extends RouteMatch> = OmitValueOfKey<
  TRouteMatch,
  Exclude<keyof RouteMatch, keyof NextRouteMatch>
>;

/**
 * Route before enter callback.
 * @return Return `true` or `undefined` to do nothing; return `false` to revert
 * this history change; return full path to redirect.
 */
export type RouteBeforeEnter<TRouteMatch extends RouteMatch = RouteMatch> = (
  next: NextRouteMatchType<TRouteMatch>,
) => Promise<boolean | void> | boolean | void;

/**
 * Route before update callback.
 * @return Return `true` or `undefined` to do nothing; return `false` to revert
 * this history change; return full path to redirect.
 */
export type RouteBeforeUpdate<TRouteMatch extends RouteMatch = RouteMatch> = (
  next: NextRouteMatchType<TRouteMatch>,
) => Promise<boolean | void> | boolean | void;

/**
 * Route before leave callback.
 * @return Return `true` or `undefined` to do nothing; return `false` to revert
 * this history change.
 */
export type RouteBeforeLeave = () => Promise<boolean | void> | boolean | void;

export type RouteAfterEnter = () => Promise<void> | void;
export type RouteAfterUpdate = () => Promise<void> | void;
export type RouteAfterLeave = () => Promise<void> | void;

export type RouteServiceFactory<TRouteMatch extends RouteMatch> = (
  match: TRouteMatch,
) => IRouteService<TRouteMatch> | Promise<IRouteService<TRouteMatch>>;

export type IRouteService<TRouteMatch extends RouteMatch = RouteMatch> = {
  beforeEnter?: RouteBeforeEnter<TRouteMatch>;
  afterEnter?: RouteAfterEnter;
  beforeUpdate?: RouteBeforeUpdate<TRouteMatch>;
  afterUpdate?: RouteAfterUpdate;
  beforeLeave?: RouteBeforeLeave;
  afterLeave?: RouteAfterLeave;
} & RouteServiceExtension<TRouteMatch>;

export type RouteServiceExtension<
  TRouteMatch extends RouteMatch
> = OmitValueWithType<
  OmitValueOfKey<TRouteMatch, keyof RouteMatch>,
  RouteMatch
>;

interface RouteMatchInternalResult {
  matched: boolean;
  exactlyMatched: boolean;
  segment: string | undefined;
  rest: string;
}

export type GeneralSegmentDict = Dict<string | undefined>;
export type GeneralQueryDict = Dict<string | undefined>;
export type GeneralParamDict = Dict<string | undefined>;

/** @internal */
export interface RouteMatchUpdateResult {
  pathSegmentDict: GeneralSegmentDict;
  paramSegmentDict: GeneralSegmentDict;
}

export interface RouteMatchSharedOptions {
  match: string | RegExp;
  query: Dict<boolean> | undefined;
}

export interface RouteMatchOptions extends RouteMatchSharedOptions {
  exact: boolean;
}

abstract class RouteMatchShared<
  TParamDict extends GeneralParamDict = GeneralParamDict
> {
  /**
   * Name of this `RouteMatch`, correspondent to the field name of route
   * schema.
   */
  readonly $name: string;

  /** @internal */
  protected _prefix: string;

  /** @internal */
  protected _history: History;

  /** @internal */
  protected _source: RouteSource;

  /** @internal */
  protected _parent: RouteMatchShared | undefined;

  /** @internal */
  protected _matchPattern: string | RegExp;

  /** @internal */
  protected _queryKeys: string[] | undefined;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatchShared | undefined,
    history: History,
    {match, query}: RouteMatchSharedOptions,
  ) {
    this.$name = name;
    this._prefix = prefix;
    this._source = source;
    this._parent = parent;
    this._history = history;

    if (match instanceof RegExp && match.global) {
      throw new Error(
        'Expecting a non-global regular expression as match pattern',
      );
    }

    this._matchPattern = match;

    if (query) {
      this._queryKeys = Object.keys(query);
    }
  }

  /**
   * A dictionary of the combination of query string and segments.
   */
  @computed
  get $params(): TParamDict {
    return {
      ...this._paramSegments,
      ...this._query,
    } as TParamDict;
  }

  /** @internal */
  @computed
  protected get _segment(): string | undefined {
    let entry = this._getMatchEntry(this._source);
    return entry && entry.segment;
  }

  /** @internal */
  @computed
  protected get _paramSegments(): GeneralSegmentDict {
    let parent = this._parent;
    let upperSegmentDict = parent && parent._paramSegments;

    let matchPattern = this._matchPattern;
    let segment = this._segment;

    return {
      ...upperSegmentDict,
      ...(typeof matchPattern === 'string'
        ? undefined
        : {[this.$name]: segment}),
    };
  }

  /** @internal */
  @computed
  get _pathSegments(): GeneralSegmentDict {
    let parent = this._parent;
    let upperSegmentDict = parent && parent._pathSegments;

    let matchPattern = this._matchPattern;
    let segment = this._segment;

    return {
      ...upperSegmentDict,
      ...{
        [this.$name]: typeof matchPattern === 'string' ? matchPattern : segment,
      },
    };
  }

  /** @internal */
  @computed
  protected get _query(): GeneralQueryDict | undefined {
    let queryKeys = this._queryKeys;
    let sourceQueryDict = this._source.queryDict;

    return queryKeys
      ? queryKeys.reduce(
          (dict, key) => {
            let value = sourceQueryDict[key];

            if (value !== undefined) {
              dict[key] = sourceQueryDict[key];
            }

            return dict;
          },
          {} as GeneralQueryDict,
        )
      : undefined;
  }

  /**
   * Generates a string reference that can be used for history navigation.
   * @param params A dictionary of the combination of query string and
   * segments.
   * @param preserveQuery Whether to preserve values in current query string.
   */
  $ref(
    params: Partial<TParamDict> & EmptyObjectPatch = {},
    preserveQuery = false,
  ): string {
    let segmentDict = this._pathSegments;
    let sourceQueryDict = this._source.queryDict;

    let paramKeySet = new Set(Object.keys(params));

    let path = Object.keys(segmentDict)
      .map(key => {
        paramKeySet.delete(key);

        let param = params[key];
        let segment = typeof param === 'string' ? param : segmentDict[key];

        if (typeof segment !== 'string') {
          throw new Error(`Parameter "${key}" is required`);
        }

        return `/${segment}`;
      })
      .join('');

    let query = new URLSearchParams([
      ...(preserveQuery
        ? (Object.entries(sourceQueryDict) as [string, string][])
        : []),
      ...Array.from(paramKeySet).map(
        (key): [string, string] => [key, params[key]!],
      ),
    ]).toString();

    return `${this._prefix}${path}${query ? `?${query}` : ''}`;
  }

  /**
   * Perform a `history.push()` with `this.$ref(params, preserveQuery)`.
   */
  $push(
    params?: Partial<TParamDict> & EmptyObjectPatch,
    preserveQuery?: boolean,
  ): void {
    let ref = this.$ref(params, preserveQuery);
    this._history.push(ref);
  }

  /**
   * Perform a `history.replace()` with `this.$ref(params, preserveQuery)`.
   */
  $replace(
    params?: Partial<TParamDict> & EmptyObjectPatch,
    preserveQuery?: boolean,
  ): void {
    let ref = this.$ref(params, preserveQuery);
    this._history.replace(ref);
  }

  /** @internal */
  abstract _getMatchEntry(source: RouteSource): RouteMatchEntry | undefined;
}

export class NextRouteMatch<
  TParamDict extends GeneralParamDict = GeneralParamDict
> extends RouteMatchShared<TParamDict> {
  /** @internal */
  private _origin: RouteMatch<TParamDict>;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatchShared<TParamDict> | undefined,
    origin: RouteMatch<TParamDict>,
    extension: object,
    history: History,
    options: RouteMatchSharedOptions,
  ) {
    super(name, prefix, source, parent, history, options);

    this._origin = origin;

    for (let key of Object.keys(extension)) {
      Object.defineProperty(this, key, {
        get() {
          return (origin as any)[key];
        },
      });
    }
  }

  /**
   * A reactive value indicates whether this route is exactly matched.
   */
  get $exact(): boolean {
    let entry = this._getMatchEntry();
    return !!entry && entry.exact;
  }

  /** @internal */
  _getMatchEntry(): RouteMatchEntry | undefined {
    return this._origin._getMatchEntry(this._source);
  }
}

export class RouteMatch<
  TParamDict extends GeneralParamDict = GeneralParamDict
> extends RouteMatchShared<TParamDict> {
  /** @internal */
  private _beforeEnterCallbacks: RouteBeforeEnter[] = [];

  /** @internal */
  private _beforeUpdateCallbacks: RouteBeforeUpdate[] = [];

  /** @internal */
  private _beforeLeaveCallbacks: RouteBeforeLeave[] = [];

  /** @internal */
  private _afterEnterCallbacks: RouteAfterEnter[] = [];

  /** @internal */
  private _afterUpdateCallbacks: RouteAfterUpdate[] = [];

  /** @internal */
  private _afterLeaveCallbacks: RouteAfterLeave[] = [];

  /** @internal */
  @observable
  private _service: IRouteService | undefined;

  /** @internal */
  private _servicePromise: Promise<IRouteService | undefined> | undefined;

  /** @internal */
  private _serviceFactory: RouteServiceFactory<any> | undefined;

  /** @internal */
  @observable
  private _matched = false;

  /** @internal */
  @observable
  private _exactlyMatched = false;

  /** @internal */
  private _allowExact: boolean;

  /** @internal */
  _children: RouteMatch[] | undefined;

  /** @internal */
  _next!: NextRouteMatch<TParamDict>;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatch | undefined,
    extension: object,
    history: History,
    {exact, ...sharedOptions}: RouteMatchOptions,
  ) {
    super(name, prefix, source, parent, history, sharedOptions);

    for (let [key, defaultValue] of Object.entries(extension)) {
      Object.defineProperty(this, key, {
        get() {
          let service = (this as RouteMatch).$matched
            ? (this as RouteMatch)._service
            : undefined;
          return service ? (service as any)[key] : defaultValue;
        },
      });
    }

    this._allowExact = exact;
  }

  /**
   * A reactive value indicates whether this route is matched.
   */
  get $matched(): boolean {
    return this._matched;
  }

  /**
   * A reactive value indicates whether this route is exactly matched.
   */
  get $exact(): boolean {
    return this._exactlyMatched;
  }

  $beforeEnter(callback: RouteBeforeEnter<this>): this {
    this._beforeEnterCallbacks.push(callback as RouteBeforeEnter);
    return this;
  }

  $beforeLeave(callback: RouteBeforeLeave): this {
    this._beforeLeaveCallbacks.push(callback);
    return this;
  }

  $afterEnter(callback: RouteAfterEnter): this {
    this._afterEnterCallbacks.push(callback);
    return this;
  }

  $afterLeave(callback: RouteAfterLeave): this {
    this._afterLeaveCallbacks.push(callback);
    return this;
  }

  $service(factory: RouteServiceFactory<this>): this {
    if (this._serviceFactory) {
      throw new Error(`Service has already been defined for "${this.$name}"`);
    }

    this._serviceFactory = factory;

    return this;
  }

  /** @internal */
  _match(upperRest: string): RouteMatchInternalResult {
    let segment: string | undefined;
    let rest: string;

    if (upperRest) {
      if (!upperRest.startsWith('/')) {
        throw new Error(
          `Expecting rest of path to be started with "/", but got ${JSON.stringify(
            upperRest,
          )} instead`,
        );
      }

      upperRest = upperRest.slice(1);

      let pattern = this._matchPattern;

      if (typeof pattern === 'string') {
        if (isPathPrefix(upperRest, pattern)) {
          segment = pattern;
          rest = upperRest.slice(pattern.length);
        } else {
          segment = undefined;
          rest = '';
        }
      } else {
        let groups = pattern.exec(upperRest);

        if (groups) {
          let matched = groups[0];

          if (!isPathPrefix(upperRest, matched)) {
            throw new Error(
              `Invalid regular expression pattern, expecting rest of path to be started with "/" after match (matched ${JSON.stringify(
                matched,
              )} out of ${JSON.stringify(upperRest)})`,
            );
          }

          segment = matched;
          rest = upperRest.slice(matched.length);
        } else {
          segment = undefined;
          rest = '';
        }
      }
    } else {
      segment = undefined;
      rest = '';
    }

    let matched = segment !== undefined;
    let exactlyMatched = matched && rest === '';

    if (exactlyMatched && (this._children && !this._allowExact)) {
      matched = false;
      exactlyMatched = false;
    }

    return {
      matched,
      exactlyMatched,
      segment,
      rest,
    };
  }

  /** @internal */
  async _beforeLeave(): Promise<boolean> {
    for (let callback of this._beforeLeaveCallbacks) {
      let result = await tolerate(callback);

      if (result === false) {
        return false;
      }
    }

    let service = await this._getService();

    if (!service || !service.beforeLeave) {
      return true;
    }

    let result = await tolerate(() => service!.beforeLeave!());

    if (result === false) {
      return false;
    }

    return true;
  }

  /** @internal */
  async _beforeEnter(): Promise<boolean> {
    let next = this._next;

    for (let callback of this._beforeEnterCallbacks) {
      let result = await tolerate(callback, next);

      if (result === false) {
        return false;
      }
    }

    let service = await this._getService();

    if (!service || !service.beforeEnter) {
      return true;
    }

    let result = await tolerate(() => service!.beforeEnter!(next));

    if (result === false) {
      return false;
    }

    return true;
  }

  /** @internal */
  async _beforeUpdate(): Promise<boolean> {
    let next = this._next;

    for (let callback of this._beforeUpdateCallbacks) {
      let result = await tolerate(callback, next);

      if (result === false) {
        return false;
      }
    }

    let service = await this._getService();

    if (!service || !service.beforeUpdate) {
      return true;
    }

    let result = await tolerate(() => service!.beforeUpdate!(next));

    if (result === false) {
      return false;
    }

    return true;
  }

  /** @internal */
  async _afterLeave(): Promise<void> {
    for (let callback of this._afterLeaveCallbacks) {
      await tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterLeave) {
      return;
    }

    await tolerate(() => service!.afterLeave!());
  }

  /** @internal */
  async _afterEnter(): Promise<void> {
    for (let callback of this._afterEnterCallbacks) {
      await tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterEnter) {
      return;
    }

    await tolerate(() => service!.afterEnter!());
  }

  /** @internal */
  async _afterUpdate(): Promise<void> {
    for (let callback of this._afterUpdateCallbacks) {
      await tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterUpdate) {
      return;
    }

    await tolerate(() => service!.afterUpdate!());
  }

  /** @internal */
  _update(matched: boolean, exactlyMatched: boolean): void {
    this._matched = matched;
    this._exactlyMatched = exactlyMatched;
  }

  /** @internal */
  _getMatchEntry(source: RouteSource): RouteMatchEntry | undefined {
    return source.matchToMatchEntryMap.get(this);
  }

  /** @internal */
  private async _getService(): Promise<IRouteService | undefined> {
    let serviceOrServicePromise = this._service || this._servicePromise;

    if (serviceOrServicePromise) {
      return serviceOrServicePromise;
    }

    let factory = this._serviceFactory;

    if (!factory) {
      return undefined;
    }

    let output = tolerate(factory, this);

    if (output instanceof Promise) {
      return (this._servicePromise = output.then(service => {
        this._service = service;
        return service;
      }));
    } else {
      this._service = output;
      return output;
    }
  }

  static segment = /[^/]+/;
  static rest = /.+/;
}
