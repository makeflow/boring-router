[![NPM Package](https://badge.fury.io/js/boring-router.svg)](https://www.npmjs.com/package/boring-router)
[![Build Status](https://travis-ci.org/makeflow/boring-router.svg?branch=master)](https://travis-ci.org/makeflow/boring-router)

# Boring Router

A ~~light-weight~~, type-safe, yet reactive router service using MobX.

## Why

There are multiple reasons pushing me to write Boring Router instead of sticking with React Router.

- Making React Router work with a global store/service is not straightforward. Having to parse location twice with the same schema defined with two different approaches looks redundant to me.
- React Router (and many other alternatives) provides basically no type safety between path schema and match result. And you have to write `to` as strings in links.
- People can easily write ambiguous path schema without it bringing them attention.
- I think I've got a nice idea. 😉

## Installation

```sh
# peer dependencies
yarn add react mobx mobx-react

# boring router packages
yarn add boring-router
yarn add boring-router-react
```

## Usage

```tsx
import {RouteMatch, Router} from 'boring-router';
import {BrowserHistory, Link, Route} from 'boring-router-react';
import {observer} from 'mobx-react';
import React, {Component} from 'react';

const history = new BrowserHistory();

const router = new Router(history);

const route = router.$route({
  account: true,
  about: true,
  notFound: {
    $match: RouteMatch.rest,
  },
});

@observer
class App extends Component {
  render() {
    return (
      <>
        <Route match={route.account}>
          Account page
          <hr />
          <Link to={route.about}>About</Link>
        </Route>
        <Route match={route.about}>About page</Route>
        <Route match={route.notFound}>Not found</Route>
      </>
    );
  }
}
```

## Examples

### Example list

- [Basic](packages/boring-router-react/examples/basic/main.tsx)

  Basic usage.

  ```tsx
  <Route match={route.account}>
    <p>Account page</p>
  </Route>
  ```

- [Exact](packages/boring-router-react/examples/exact/main.tsx)

  Match exact path.

  ```tsx
  <Route match={route.account} exact>
    <p>Exact account page</p>
  </Route>
  ```

- [Segment](packages/boring-router-react/examples/segment/main.tsx)

  Boring Router's version of `/account/:id` alike parameter.

  ```tsx
  <Link to={route.account.id} params={{id: '123'}}>
    Account 123
  </Link>
  ```

  ```tsx
  <Route match={route.account.id}>
    <p>Account {route.account.id.$params.id} details page</p>
  </Route>
  ```

- [Query](packages/boring-router-react/examples/query/main.tsx)

  Handle query string parameter.

  ```tsx
  <Link to={route.account} params={{id: '123'}}>
    Account 123
  </Link>
  ```

  ```tsx
  <Route match={route.account}>
    <p>Account {route.account.$params.id} details page</p>
  </Route>
  ```

- [Redirect](packages/boring-router-react/examples/redirect/main.tsx)

  Redirect on match.

  ```tsx
  <Redirect match={route.notFound} to={route.account} params={{id: '123'}} />
  ```

- [NavLink](packages/boring-router-react/examples/nav-link/main.tsx)

  Like `<Link>` but will add a class name if `to` matches.

  ```tsx
  <NavLink to={route.account}>Account</NavLink>
  ```

- [Function as Child](packages/boring-router-react/examples/function-as-child/main.tsx)

  Use `<Route />` with a function child.

  ```tsx
  <Route match={route.account}>
    {match => <p>Account {match.$params.id} details page</p>}
  </Route>
  ```

- [Route Component](packages/boring-router-react/examples/route-component/main.tsx)

  Use `<Route />` with a route component.

  ```tsx
  <Route match={route.account} component={AccountPage} />
  ```

  ```tsx
  <Route match={match.details}>
    <p>Account {match.$params.id} details page</p>
  </Route>
  ```

- [Multiple Route Match](packages/boring-router-react/examples/multi-route-match/main.tsx)

  Match with multiple route match for shared content.

  ```tsx
  <Route
    match={[route.account.signUp, route.account.resetPassword]}
    component={AccountPage}
  />
  ```

- [Parallel Routes](packages/boring-router-react/examples/parallel-routes/main.tsx)

  Match parallel routes for separate views.

  ```tsx
  <Route match={primaryRoute.account} component={AccountPage} />
  <Route match={popupRoute.popup} component={PopupView} />
  ```

- [Hooks](packages/boring-router-react/examples/hooks/main.tsx)

  Add hooks to route match.

  ```tsx
  route.account.$beforeEnter(() => {
    route.about.$push();
  });
  ```

- [Service](packages/boring-router-react/examples/service/main.tsx)

  Add service to route match.

  ```tsx
  route.account.$service(match => new AccountRouteService(match));
  ```

### Run an example

```sh
yarn install
yarn build

yarn global add parcel-bundler

parcel examples/[name]/index.html
```

## Schema

Boring Router defines routes via a tree-structure schema:

```ts
type RouteSchemaDict = Dict<RouteSchema | boolean>;

interface RouteSchema {
  $match?: string | RegExp;
  $query?: Dict<boolean>;
  $children?: RouteSchemaDict;
}
```

Two pre-defined `$match` regular expressions are available as `RouteMatch.segment` (`/[^/]+/`) and `RouteMatch.rest` (`/.+/`).

A `schema` wrapper function is available to make TypeScript intellisense happier for separated schema definition:

```ts
function schema<T extends RouteSchemaDict>(schema: T): T;
```

## Route match

The value of expression like `route.account` in the usage example above is a `RouteMatch`, and it has the following reactive properties and methods:

```ts
interface RouteMatch<TParamDict> {
  $name: string;
  $group: string | undefined;
  $parent: RouteMatch;
  $rest: RouteMatch;

  $matched: boolean;
  $exact: boolean;

  $params: TParamDict;

  $ref(params?: Partial<TParamDict>): string;
  $push(params?: Partial<TParamDict>, options: RouteMatchNavigateOptions): void;
  $replace(
    params?: Partial<TParamDict>,
    options: RouteMatchNavigateOptions,
  ): void;

  $beforeEnter(callback: RouteMatchBeforeEnter<this>): RouteHookRemovalCallback;
  $afterEnter(callback: RouteMatchAfterEnter): RouteHookRemovalCallback;

  $beforeUpdate(
    callback: RouteMatchBeforeUpdate<this>,
  ): RouteHookRemovalCallback;
  $afterUpdate(callback: RouteMatchAfterUpdate): RouteHookRemovalCallback;

  $beforeLeave(callback: RouteMatchBeforeLeave): RouteHookRemovalCallback;
  $afterLeave(callback: RouteMatchAfterLeave): RouteHookRemovalCallback;

  $autorun(
    view: RouteAutorunView,
    options?: RouteAutorunOptions,
  ): RouteHookRemovalCallback;

  $intercept(callback: RouteInterceptCallback): RouteHookRemovalCallback;
  $react(callback: RouteReactCallback): RouteHookRemovalCallback;

  $service(factory: RouteMatchServiceFactory<this>): this;

  static segment: RegExp;
  static rest: RegExp;
}
```

Within `$beforeEnter`, `$beforeUpdate` hooks and correspondent service hooks, a special version of `RouteMatch` is available as `NextRouteMatch`, providing restricted functionality:

```ts
interface NextRouteMatch<TParamDict> {
  $name: string;
  $group: string | undefined;
  $parent: NextRouteMatch;
  $rest: RouteMatch;

  $matched: boolean;
  $exact: boolean;

  $params: TParamDict;

  $ref(params?: Partial<TParamDict>): string;
  $push(params?: Partial<TParamDict>, options: RouteMatchNavigateOptions): void;
  $replace(
    params?: Partial<TParamDict>,
    options: RouteMatchNavigateOptions,
  ): void;
}
```

## Hooks

Boring Router provides 6 hooks: `$beforeEnter`, `$afterEnter`; `$beforeUpdate`, `$afterUpdate`; `$beforeLeave`, `$afterLeave`. When a route changing is happening, those hooks are called with the following order:

- `$beforeLeave`
- `$beforeEnter` / `$beforeUpdate`
- Update route matching.
- `$afterLeave`
- `$afterEnter` / `$afterUpdate`

The 3 "before" hooks accept `false` as return value to cancel the route change. You can also `$push` or `$replace` directly within those hooks (which will cancel current route change as well).

The hook callbacks of `$beforeEnter` and `$beforeUpdate` provides a `NextRouteMatch` object which looks like a lite `RouteMatch`, with which you can retrieve parameters and change the location via `$push` and `$replace`.

Another two methods `$intercept` and `$react` are added as shortcut to `$beforeEnter`/`$beforeUpdate` and `$afterEnter`/`$afterUpdate` respectively.

## Service

Service is a combination of hooks and route match extension provider.

Check out the following example:

```ts
type AccountIdRouteMatch = typeof route.account.accountId;

class AccountRouteService implements IRouteService<AccountIdRouteMatch> {
  // Match the property `account` with `$extension.account`.
  @observable
  account!: Account;

  constructor(private match: AccountIdRouteMatch) {}

  // Match the property `name` with `$extension.name`.
  @computed
  get name(): string {
    return `[${this.match.$params.accountId}]`;
  }

  beforeEnter({$params: {accountId}}: AccountIdRouteMatch['$next']): void {
    this.account = new Account(accountId);
  }

  beforeUpdate(match: AccountIdRouteMatch['$next']): void {
    this.beforeEnter(match);
  }

  afterLeave(): void {
    this.account = undefined!;
  }
}

let router = new Router(history);

let route = router.$route({
  accountId: {
    $match: RouteMatch.segment,
    // Define extension defaults with types
    $extension: {
      account: undefined! as Account,
      name: undefined! as string,
    },
  },
});

// Method `$service` accepts an asynchronous function as well.
route.accountId.$service(match => new AccountRouteService(match));

// Access the extension:
route.accountId.account;
route.accountId.name;
```

## Parallel routes

Sometimes when a page is separated into different views, we might want separate routes. For example, a dashboard may have "main content view", "side bar view" and an "overlay" at the same time. If we want to cooperate them all with routes, the parallel-routes feature could be useful.

A parallel route behaves like a primary route most of the time. For more information, check out [this example](packages/boring-router-react/examples/parallel-routes/main.tsx).

## License

MIT License.
