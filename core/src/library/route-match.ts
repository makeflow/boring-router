import {action, computed, observable} from 'mobx';
import {
  Dict,
  EmptyObjectPatch,
  OmitValueOfKey,
  OmitValueWithType,
} from 'tslang';

import {buildRef, testPathPrefix, tolerate} from './@utils';
import {IHistory} from './history';
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

export type RouteAfterEnter = () => void;
export type RouteAfterUpdate = () => void;
export type RouteAfterLeave = () => void;

export type RouteInterceptCallback<
  TRouteMatch extends RouteMatch = RouteMatch
> = (
  next: NextRouteMatchType<TRouteMatch>,
) => Promise<boolean | void> | boolean | void;

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

export interface RouteMatchParallelOptions {
  groups?: string[];
  matches?: RouteMatch[];
}

/** @internal */
export interface RouteMatchUpdateResult {
  pathSegmentDict: GeneralSegmentDict;
  paramSegmentDict: GeneralSegmentDict;
}

export interface RouteMatchSharedOptions {
  match: string | RegExp;
  query: Dict<boolean> | undefined;
  group: string | undefined;
}

export interface RouteMatchOptions extends RouteMatchSharedOptions {
  exact: boolean;
}

export interface RouterMatchRefOptions {
  /**
   * Whether to leave this match's group.
   */
  leave?: boolean;
  /**
   * Parallel route groups to leave.
   */
  leaves?: string[];
  /**
   * Whether to preserve values in current query string.
   */
  preserveQuery?: boolean;
}

abstract class RouteMatchShared<
  TParamDict extends GeneralParamDict = GeneralParamDict
> {
  /**
   * Name of this `RouteMatch`, correspondent to the field name of route
   * schema.
   */
  readonly $name: string;

  /**
   * Group of this `RouteMatch`, specified in the root route.
   */
  readonly $group: string | undefined;

  /**
   * Parent of this route match.
   */
  readonly $parent: RouteMatchShared | undefined;

  /** @internal */
  protected _prefix: string;

  /** @internal */
  protected _history: IHistory;

  /** @internal */
  protected _source: RouteSource;

  /** @internal */
  protected _matchPattern: string | RegExp;

  /** @internal */
  protected _queryKeys: string[] | undefined;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatchShared | undefined,
    history: IHistory,
    {match, query, group}: RouteMatchSharedOptions,
  ) {
    this.$name = name;
    this.$group = group;
    this.$parent = parent;
    this._prefix = prefix;
    this._source = source;
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
    let parent = this.$parent;
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
    let parent = this.$parent;
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
   * @param options Shortcut to `preserveQuery` if its a boolean instead of an
   * options object.
   */
  $ref(
    params: Partial<TParamDict> & EmptyObjectPatch = {},
    options?: boolean | RouterMatchRefOptions,
  ): string {
    let leave: boolean;
    let leaves: string[];
    let preserveQuery: boolean;

    let group = this.$group;

    if (typeof options === 'object') {
      ({
        leave = false,
        preserveQuery = typeof group === 'string',
        leaves = [],
      } = options);
    } else {
      leave = false;
      leaves = [];
      preserveQuery =
        options === undefined ? typeof group === 'string' : options;
    }

    let paramKeySet = new Set(Object.keys(params));
    let {pathMap: sourcePathMap, queryDict: sourceQueryDict} = this._source;

    let pathMap = new Map(sourcePathMap);

    for (let item of leaves) {
      pathMap.delete(item);
    }

    if (leave) {
      if (group === undefined) {
        throw new Error('Cannot leave the primary route');
      }

      pathMap.delete(group);
    } else {
      let segmentDict = this._pathSegments;

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

      pathMap.set(group, path);
    }

    return buildRef(this._prefix, pathMap, {
      ...(preserveQuery ? (sourceQueryDict as Dict<string>) : undefined),
      ...Array.from(paramKeySet).reduce(
        (dict, key) => {
          dict[key] = params[key]!;
          return dict;
        },
        {} as Dict<string>,
      ),
    });
  }

  /**
   * Perform a `history.push()` with `this.$ref(params, options)`.
   */
  $push(
    params?: Partial<TParamDict> & EmptyObjectPatch,
    options?: boolean | RouterMatchRefOptions,
  ): void {
    let ref = this.$ref(params, options);
    this._history.push(ref);
  }

  /**
   * Perform a `history.replace()` with `this.$ref(params, options)`.
   */
  $replace(
    params?: Partial<TParamDict> & EmptyObjectPatch,
    options?: boolean | RouterMatchRefOptions,
  ): void {
    let ref = this.$ref(params, options);
    this._history.replace(ref);
  }

  /** @internal */
  abstract _getMatchEntry(source: RouteSource): RouteMatchEntry | undefined;
}

export class NextRouteMatch<
  TParamDict extends GeneralParamDict = GeneralParamDict
> extends RouteMatchShared<TParamDict> {
  readonly $parent: NextRouteMatch | undefined;

  /** @internal */
  private _origin: RouteMatch<TParamDict>;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatchShared<TParamDict> | undefined,
    origin: RouteMatch<TParamDict>,
    extension: object,
    history: IHistory,
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
  readonly $parent: RouteMatch | undefined;

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

  /** @internal */
  _parallel: RouteMatchParallelOptions | undefined;

  constructor(
    name: string,
    prefix: string,
    source: RouteSource,
    parent: RouteMatch | undefined,
    extension: object,
    history: IHistory,
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

  $beforeUpdate(callback: RouteBeforeUpdate<this>): this {
    this._beforeUpdateCallbacks.push(callback as RouteBeforeUpdate);
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

  $afterUpdate(callback: RouteAfterUpdate): this {
    this._afterUpdateCallbacks.push(callback);
    return this;
  }

  $afterLeave(callback: RouteAfterLeave): this {
    this._afterLeaveCallbacks.push(callback);
    return this;
  }

  $intercept(callback: RouteInterceptCallback): this {
    this._beforeEnterCallbacks.push(callback);
    this._beforeUpdateCallbacks.push(callback);

    return this;
  }

  $service(factory: RouteServiceFactory<this>): this {
    if (this._serviceFactory) {
      throw new Error(`Service has already been defined for "${this.$name}"`);
    }

    this._serviceFactory = factory;

    return this;
  }

  $parallel(options: RouteMatchParallelOptions): void {
    if (this.$group) {
      throw new Error('Parallel whitelist can only be set on primary routes');
    }

    let {groups = [], matches = []} = options;

    let parent = this.$parent;

    if (parent instanceof RouteMatch && parent._parallel) {
      let {
        groups: parentGroups = [],
        matches: parentMatches = [],
      } = parent._parallel;

      let parentGroupSet = new Set(parentGroups);
      let parentMatchSet = new Set(parentMatches);

      let groupsBeingSubsetOfParents = groups.every(group =>
        parentGroupSet.has(group),
      );

      if (!groupsBeingSubsetOfParents) {
        throw new Error(
          "Parallel group can only be a subset of its parent's groups",
        );
      }

      let matchesBeingSubsetOfParents = matches.every(match => {
        if (
          typeof match.$group === 'string' &&
          parentGroupSet.has(match.$group)
        ) {
          return true;
        }

        let current: RouteMatch | undefined = match;

        while (current) {
          if (parentMatchSet.has(current)) {
            return true;
          }

          current = current.$parent;
        }

        return false;
      });

      if (!matchesBeingSubsetOfParents) {
        throw new Error(
          "Parallel match can only be a subset of its parent's matches",
        );
      }
    }

    this._parallel = options;

    let children = this._children || [];

    for (let child of children) {
      if (
        child._parallel &&
        (!parent || parent._parallel !== child._parallel)
      ) {
        throw new Error(
          'Parallel options can only be specified in a top-down fashion',
        );
      }

      child.$parallel(options);
    }
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
        if (testPathPrefix(upperRest, pattern)) {
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

          if (testPathPrefix(upperRest, matched)) {
            segment = matched;
            rest = upperRest.slice(matched.length);
          } else {
            segment = undefined;
            rest = '';
          }
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
    let results = await Promise.all([
      ...this._beforeLeaveCallbacks.map(callback => tolerate(callback)),
      (async () => {
        let service = await this._getService();

        if (!service || !service.beforeLeave) {
          return undefined;
        }

        return tolerate(() => service!.beforeLeave!());
      })(),
    ]);

    return !results.some(result => result === false);
  }

  /** @internal */
  async _beforeEnter(): Promise<boolean> {
    let next = this._next;

    let results = await Promise.all([
      ...this._beforeEnterCallbacks.map(callback =>
        tolerate(callback, next as NextRouteMatchType<RouteMatch>),
      ),
      (async () => {
        let service = await this._getService();

        if (!service || !service.beforeEnter) {
          return undefined;
        }

        return tolerate(() =>
          service!.beforeEnter!(next as NextRouteMatchType<RouteMatch>),
        );
      })(),
    ]);

    return !results.some(result => result === false);
  }

  /** @internal */
  async _beforeUpdate(): Promise<boolean> {
    let next = this._next;

    let results = await Promise.all([
      ...this._beforeUpdateCallbacks.map(callback =>
        tolerate(callback, next as NextRouteMatchType<RouteMatch>),
      ),
      (async () => {
        let service = await this._getService();

        if (!service || !service.beforeUpdate) {
          return undefined;
        }

        return tolerate(() =>
          service!.beforeUpdate!(next as NextRouteMatchType<RouteMatch>),
        );
      })(),
    ]);

    return !results.some(result => result === false);
  }

  /** @internal */
  async _afterLeave(): Promise<void> {
    for (let callback of this._afterLeaveCallbacks) {
      tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterLeave) {
      return;
    }

    tolerate(() => service!.afterLeave!());
  }

  /** @internal */
  async _afterEnter(): Promise<void> {
    for (let callback of this._afterEnterCallbacks) {
      tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterEnter) {
      return;
    }

    tolerate(() => service!.afterEnter!());
  }

  /** @internal */
  async _afterUpdate(): Promise<void> {
    for (let callback of this._afterUpdateCallbacks) {
      tolerate(callback);
    }

    let service = await this._getService();

    if (!service || !service.afterUpdate) {
      return;
    }

    tolerate(() => service!.afterUpdate!());
  }

  /** @internal */
  @action
  _update(matched: boolean, exactlyMatched: boolean): void {
    this._matched = matched;
    this._exactlyMatched = exactlyMatched;
  }

  /** @internal */
  _getMatchEntry(source: RouteSource): RouteMatchEntry | undefined {
    let matchToMatchEntryMap = source.groupToMatchToMatchEntryMapMap.get(
      this.$group,
    );

    return matchToMatchEntryMap && matchToMatchEntryMap.get(this);
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
