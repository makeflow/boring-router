import hyphenate from 'hyphenate';
import {observable, runInAction} from 'mobx';

import {
  isLocationEqual,
  isShallowlyEqual,
  parsePath,
  testPathPrefix,
  then,
} from './@utils';
import {IHistory, Location} from './history';
import {
  GeneralQueryDict,
  NextRouteMatch,
  RouteMatch,
  RouteMatchOptions,
} from './route-match';
import {
  RouteRootSchema,
  RouteRootSchemaDict,
  RouteSchema,
  RouteSchemaDict,
} from './schema';

export type SegmentMatcherCallback = (key: string) => string;

const DEFAULT_SEGMENT_MATCHER_CALLBACK: SegmentMatcherCallback = key =>
  hyphenate(key, {lowerCase: true});

type RouteQuerySchemaType<TRouteSchema> = TRouteSchema extends {
  $query: infer TQuerySchema;
}
  ? TQuerySchema
  : never;

type FilterRouteMatchNonStringSegment<TRouteSchema, T> = TRouteSchema extends {
  $match: infer TMatch;
}
  ? TMatch extends string ? never : T
  : never;

interface RouteSchemaChildrenSection<TRouteSchemaDict> {
  $children: TRouteSchemaDict;
}

export type NestedRouteSchemaDictType<
  TRouteSchema
> = TRouteSchema extends RouteSchemaChildrenSection<
  infer TNestedRouteSchemaDict
>
  ? TNestedRouteSchemaDict
  : {};

interface RouteSchemaExtensionSection<TRouteMatchExtension> {
  $extension: TRouteMatchExtension;
}

export type RouteMatchExtensionType<
  TRouteSchema
> = TRouteSchema extends RouteSchemaExtensionSection<infer TRouteMatchExtension>
  ? TRouteMatchExtension
  : {};

export type RouteMatchSegmentType<
  TRouteSchemaDict,
  TSegmentKey extends string
> = {
  [K in Extract<keyof TRouteSchemaDict, string>]: RouteMatchType<
    TRouteSchemaDict[K],
    TSegmentKey | FilterRouteMatchNonStringSegment<TRouteSchemaDict[K], K>
  >
};

export type RouteMatchType<
  TRouteSchema,
  TSegmentKey extends string
> = RouteMatch<
  Record<
    Extract<keyof RouteQuerySchemaType<TRouteSchema>, string>,
    string | undefined
  > &
    {[K in TSegmentKey]: string}
> &
  RouteMatchSegmentType<NestedRouteSchemaDictType<TRouteSchema>, TSegmentKey> &
  RouteMatchExtensionType<TRouteSchema>;

export type RouterType<TRouteSchemaDict> = Router &
  RouteMatchSegmentType<TRouteSchemaDict, never>;

export interface RouteMatchEntry {
  match: RouteMatch;
  exact: boolean;
  segment: string;
}

export interface RouteSource {
  groupToMatchToMatchEntryMapMap: Map<
    string | undefined,
    Map<RouteMatch, RouteMatchEntry>
  >;
  queryDict: GeneralQueryDict;
  pathMap: Map<string | undefined, string>;
}

export type RouterOnLeave = (path: string) => void;

export type RouterOnChange = (from: Location | undefined, to: Location) => void;

export interface RouterOptions {
  /**
   * A function to perform default schema field name to segment string
   * transformation.
   */
  segmentMatcher?: SegmentMatcherCallback;
  /** Default path on error. */
  default?: string;
  /** Prefix for path. */
  prefix?: string;
  /** Called when routing out current prefix. */
  onLeave?: RouterOnLeave;
  /** Called when route changes. */
  onChange?: RouterOnChange;
}

export interface RouterBuildResult {
  matches: RouteMatch[];
  groups: string[];
}

export interface RouterRefOptions {
  /**
   * Parallel route group(s) to leave. Set to `'*'` to leave all.
   */
  leaves?: string | string[];
  /**
   * Whether to preserve values in current query string.
   */
  preserveQuery?: boolean;
}

export class Router {
  /** @internal */
  private _history: IHistory;

  /** @internal */
  private _segmentMatcher: SegmentMatcherCallback;

  /** @internal */
  private _default: Location;

  /** @internal */
  private _prefix: string;

  /** @internal */
  private _onLeave?: RouterOnLeave;

  /** @internal */
  private _onChange?: RouterOnChange;

  /** @internal */
  private _location: Location | undefined;

  /** @internal */
  private _nextLocation: Location | undefined;

  /** @internal */
  private _source: RouteSource = observable({
    groupToMatchToMatchEntryMapMap: new Map(),
    queryDict: {},
    pathMap: new Map(),
  });

  /** @internal */
  @observable
  private _matchingSource: RouteSource = observable({
    groupToMatchToMatchEntryMapMap: new Map(),
    queryDict: {},
    pathMap: new Map(),
  });

  /** @internal */
  private _changing = Promise.resolve();

  /** @internal */
  _children: RouteMatch[];

  /** @internal */
  _groups: Set<string>;

  private constructor(
    schema: RouteRootSchemaDict,
    history: IHistory,
    {
      segmentMatcher,
      default: defaultPath = '/',
      prefix = '',
      onLeave,
      onChange,
    }: RouterOptions,
  ) {
    this._history = history;
    this._default = parsePath(defaultPath);
    this._prefix = prefix;
    this._onLeave = onLeave;
    this._onChange = onChange;

    this._segmentMatcher = segmentMatcher || DEFAULT_SEGMENT_MATCHER_CALLBACK;

    this._groups = new Set<string>();

    this._children = this._build(schema, this, this._groups);

    then(() => {
      history.listen(this._onLocationChange);
      this._onLocationChange(history.location);
    });
  }

  /**
   * Generates a string reference that can be used for history navigation.
   */
  $ref({leaves = [], preserveQuery = false}: RouterRefOptions): string {
    if (leaves === '*') {
      let allGroups = Array.from(this._source.pathMap.keys()).filter(
        (group): group is string => group !== undefined,
      );

      leaves = [...allGroups];
    } else if (!Array.isArray(leaves)) {
      leaves = [leaves];
    }

    let {pathMap, queryDict: sourceQueryDict} = this._source;

    let primaryPath = pathMap.get(undefined)!;

    let groupQueryEntries = Array.from(pathMap.entries())
      .filter(
        ([group, path]) =>
          group !== undefined && path && !(leaves as string[]).includes(group),
      )
      .map(([group, path]): [string, string] => [`_${group}`, path]);

    let groupPathQuery = encodeURI(
      groupQueryEntries.map(([key, value]) => `${key}=${value}`).join('&'),
    );

    let normalQuery = new URLSearchParams([
      ...(preserveQuery
        ? (Object.entries(sourceQueryDict) as [string, string][])
        : []),
    ]).toString();

    let query = groupPathQuery
      ? normalQuery
        ? `${groupPathQuery}&${normalQuery}`
        : groupPathQuery
      : normalQuery;

    return `${this._prefix}${primaryPath}${query ? `?${query}` : ''}`;
  }

  /**
   * Perform a `history.push()` with `this.$ref(options)`.
   */
  $push(options: RouterRefOptions): void {
    let ref = this.$ref(options);
    this._history.push(ref);
  }

  /**
   * Perform a `history.replace()` with `this.$ref(options)`.
   */
  $replace(options: RouterRefOptions): void {
    let ref = this.$ref(options);
    this._history.replace(ref);
  }

  /** @internal */
  private _onLocationChange = (location: Location): void => {
    this._nextLocation = location;

    this._changing = this._changing
      .then(() => this._asyncOnLocationChange(location))
      .catch(console.error);
  };

  /** @internal */
  private _asyncOnLocationChange = async (
    nextLocation: Location,
  ): Promise<void> => {
    if (this._isNextLocationOutDated(nextLocation)) {
      return;
    }

    let {pathname, search} = nextLocation;

    let location = this._location;

    if (location && isLocationEqual(location, nextLocation)) {
      return;
    }

    let searchParams = new URLSearchParams(search);

    let queryDict = Array.from(searchParams).reduce(
      (dict, [key, value]) => {
        dict[key] = value;
        return dict;
      },
      {} as GeneralQueryDict,
    );

    let prefix = this._prefix;

    let pathMap = new Map<string | undefined, string>();

    // Process primary route path
    if (!testPathPrefix(pathname, prefix)) {
      let onLeave = this._onLeave;

      if (onLeave) {
        onLeave(pathname);
      }

      return;
    }

    let pathWithoutPrefix = pathname.slice(prefix.length) || '/';

    let pathInfos = [
      {
        path: pathWithoutPrefix,
        group: undefined as string | undefined,
      },
    ];
    pathMap.set(undefined, pathWithoutPrefix);

    // Extract group route paths in query
    for (let group of this._groups) {
      let key = `_${group}`;

      if (!(key in queryDict)) {
        continue;
      }

      let path = queryDict[key];

      if (path) {
        pathInfos.push({path, group});
        pathMap.set(group, path);
      }

      delete queryDict[key];
    }

    // Match parallel routes
    let groupToMatchEntriesMap = new Map<
      string | undefined,
      RouteMatchEntry[]
    >();

    for (let {path, group} of pathInfos) {
      let routeMatchEntries = this._match(this, path) || [];

      if (!routeMatchEntries.length) {
        continue;
      }

      let [{match}] = routeMatchEntries;

      if (match.$group !== group) {
        continue;
      }

      groupToMatchEntriesMap.set(group, routeMatchEntries);
    }

    // Check primary match parallel whitelist
    let groupToMatchToMatchEntryMapMap = new Map<
      string | undefined,
      Map<RouteMatch, RouteMatchEntry>
    >();

    let primaryMatchEntries = groupToMatchEntriesMap.get(undefined);

    if (primaryMatchEntries) {
      let primaryMatch = primaryMatchEntries[0].match;

      let whitelist = primaryMatch._parallel;

      let {groups = [], matches = []} = whitelist || {};

      for (let [group, entries] of groupToMatchEntriesMap) {
        let [{match}] = entries;

        if (
          !whitelist ||
          !group ||
          groups.includes(group) ||
          matches.includes(match)
        ) {
          groupToMatchToMatchEntryMapMap.set(
            group,
            new Map(
              entries.map(
                (entry): [RouteMatch, RouteMatchEntry] => [entry.match, entry],
              ),
            ),
          );
        }
      }
    }

    runInAction(() => {
      Object.assign(this._matchingSource, {
        groupToMatchToMatchEntryMapMap,
        queryDict,
        pathMap,
      });
    });

    let updatePromises: Promise<void>[] = [];

    let groupSet = new Set([...pathMap.keys(), ...this._source.pathMap.keys()]);

    for (let group of groupSet) {
      let matchToMatchEntryMap =
        groupToMatchToMatchEntryMapMap.get(group) || new Map();

      updatePromises.push(
        this._update(nextLocation, group, matchToMatchEntryMap),
      );
    }

    await Promise.all(updatePromises);

    if (this._onChange) {
      this._onChange(location, nextLocation);
    }
  };

  /** @internal */
  private async _update(
    nextLocation: Location,
    group: string | undefined,
    matchToMatchEntryMap: Map<RouteMatch, RouteMatchEntry>,
  ): Promise<void> {
    // Prepare previous/next match set

    let previousMatchToMatchEntryMap = this._source.groupToMatchToMatchEntryMapMap.get(
      group,
    );

    if (!previousMatchToMatchEntryMap) {
      previousMatchToMatchEntryMap = new Map();
      this._source.groupToMatchToMatchEntryMapMap.set(
        group,
        previousMatchToMatchEntryMap,
      );
    }

    let previousMatchSet = new Set(previousMatchToMatchEntryMap.keys());
    let nextMatchSet = new Set(matchToMatchEntryMap.keys());

    let leavingMatchSet = new Set(previousMatchSet);

    for (let match of nextMatchSet) {
      leavingMatchSet.delete(match);
    }

    let reversedLeavingMatches = Array.from(leavingMatchSet).reverse();

    let enteringAndUpdatingMatchSet = new Set(nextMatchSet);

    for (let match of previousMatchSet) {
      if (!enteringAndUpdatingMatchSet.has(match)) {
        continue;
      }

      let nextMatch = match._next;

      if (
        isShallowlyEqual(match._pathSegments, nextMatch._pathSegments) &&
        match.$exact === nextMatch.$exact
      ) {
        enteringAndUpdatingMatchSet.delete(match);
      }
    }

    // Process before hooks

    for (let match of reversedLeavingMatches) {
      let result = await match._beforeLeave();

      if (this._isNextLocationOutDated(nextLocation)) {
        return;
      }

      if (!result) {
        this._revert();
        return;
      }
    }

    for (let match of enteringAndUpdatingMatchSet) {
      let update = previousMatchSet.has(match);

      let result = update
        ? await match._beforeUpdate()
        : await match._beforeEnter();

      if (this._isNextLocationOutDated(nextLocation)) {
        return;
      }

      if (!result) {
        this._revert();
        return;
      }
    }

    this._location = nextLocation;

    runInAction(() => {
      let source = this._source;
      let matchingSource = this._matchingSource;

      source.queryDict = matchingSource.queryDict;

      let path = matchingSource.pathMap.get(group)!;

      source.pathMap.set(group, path);

      let matchToMatchEntryMap = matchingSource.groupToMatchToMatchEntryMapMap.get(
        group,
      )!;

      source.groupToMatchToMatchEntryMapMap.set(group, matchToMatchEntryMap);
    });

    // Update

    for (let match of reversedLeavingMatches) {
      match._update(false, false);
    }

    for (let match of nextMatchSet) {
      let {exact} = matchToMatchEntryMap.get(match)!;
      match._update(true, exact);
    }

    // Process after hooks

    for (let match of reversedLeavingMatches) {
      await match._afterLeave();
    }

    for (let match of enteringAndUpdatingMatchSet) {
      let update = previousMatchSet.has(match);

      if (update) {
        await match._afterUpdate();
      } else {
        await match._afterEnter();
      }
    }
  }

  /** @internal */
  private _isNextLocationOutDated(location: Location): boolean {
    return location !== this._nextLocation;
  }

  /** @internal */
  private _revert(): void {
    this._history.replace(this._location || this._default);
  }

  /** @internal */
  private _match(
    target: Router | RouteMatch,
    upperRest: string,
  ): RouteMatchEntry[] | undefined {
    for (let routeMatch of target._children || []) {
      let {matched, exactlyMatched, segment, rest} = routeMatch._match(
        upperRest,
      );

      if (!matched) {
        continue;
      }

      if (exactlyMatched) {
        return [
          {
            match: routeMatch,
            segment: segment!,
            exact: true,
          },
        ];
      }

      let result = this._match(routeMatch, rest);

      if (!result) {
        continue;
      }

      return [
        {
          match: routeMatch,
          segment: segment!,
          exact: false,
        },
        ...result,
      ];
    }

    return undefined;
  }

  /** @internal */
  private _build(
    schemaDict: RouteRootSchemaDict | RouteSchemaDict,
    parent: RouteMatch | Router,
    groupSet: Set<string> | undefined,
    matchingParent?: NextRouteMatch,
  ): RouteMatch[] {
    let routeMatches: RouteMatch[] = [];

    let source = this._source;
    let matchingSource = this._matchingSource;
    let history = this._history;
    let prefix = this._prefix;

    for (let [key, schema] of Object.entries(schemaDict) as [
      string,
      boolean | RouteRootSchema | RouteSchema
    ][]) {
      if (typeof schema === 'boolean') {
        schema = {};
      }

      let group = '$group' in parent ? parent.$group : undefined;

      let {
        $match: match = this._segmentMatcher(key),
        $query: query,
        $exact: exact = false,
        $children: children,
        $extension: extension = {},
      } = schema;

      if ('$group' in schema) {
        group = schema.$group;
      }

      if (groupSet && group) {
        groupSet.add(group);
      }

      let options: RouteMatchOptions = {
        match,
        query,
        exact,
        group,
      };

      let routeMatch = new RouteMatch(
        key,
        prefix,
        source,
        parent instanceof RouteMatch ? parent : undefined,
        extension,
        history,
        options,
      );

      let nextRouteMatch = new NextRouteMatch(
        key,
        prefix,
        matchingSource,
        matchingParent,
        routeMatch,
        extension,
        history,
        options,
      );

      routeMatch._next = nextRouteMatch;

      routeMatches.push(routeMatch);

      (parent as any)[key] = routeMatch;

      if (matchingParent) {
        (matchingParent as any)[key] = nextRouteMatch;
      }

      if (!children) {
        continue;
      }

      routeMatch._children = this._build(
        children,
        routeMatch,
        undefined,
        nextRouteMatch,
      );
    }

    return routeMatches;
  }

  static create<TSchema extends RouteRootSchemaDict>(
    schema: TSchema,
    history: IHistory,
    options: RouterOptions = {},
  ): RouterType<TSchema> {
    return new Router(schema, history, options) as RouterType<TSchema>;
  }
}
