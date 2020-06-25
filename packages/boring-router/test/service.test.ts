import {IRouteService, MemoryHistory, RouteMatch, Router} from 'boring-router';
import {computed, configure, observable} from 'mobx';

import {nap} from './@utils';

configure({
  enforceActions: 'observed',
});

let history = new MemoryHistory();

class Account {
  constructor(readonly id: string) {}
}

let router = new Router(history);

let primaryRoute = router.$route({
  default: {
    $match: '',
  },
  account: {
    $children: {
      accountId: {
        $match: RouteMatch.segment,
        $extension: {
          account: undefined! as Account,
          name: undefined! as string,
        },
      },
    },
  },
});

let beforeUpdate = jest.fn();

let afterUpdate = jest.fn();
let afterEnter = jest.fn();

let beforeLeave = jest.fn();

type AccountIdRouteMatch = typeof primaryRoute.account.accountId;

class AccountRouteService implements IRouteService<AccountIdRouteMatch> {
  @observable
  account!: Account;

  constructor(private match: AccountIdRouteMatch) {}

  @computed
  get name(): string {
    return `[${this.match.$params.accountId}]`;
  }

  beforeEnter({$params: {accountId}}: AccountIdRouteMatch['$next']): void {
    this.account = new Account(accountId);
  }

  beforeUpdate(match: AccountIdRouteMatch['$next']): void {
    beforeUpdate();

    this.beforeEnter(match);
  }

  afterUpdate(): void {
    afterUpdate();
  }

  afterEnter(): void {
    afterEnter();
  }

  beforeLeave(): void {
    beforeLeave();
  }

  afterLeave(): void {
    this.account = undefined!;
  }
}

primaryRoute.account.accountId.$service(
  match => new AccountRouteService(match),
);

test('should navigate from `default` to `account` and triggers `$beforeEnter`', async () => {
  await nap();

  expect(primaryRoute.account.accountId.account).toBeUndefined();

  let id = 'abc';
  let path = `/account/${encodeURIComponent(id)}`;

  await history.push(path);

  await nap();

  expect(await router.$ref()).toBe(path);
  expect(primaryRoute.account.accountId.account.id).toBe(id);
  expect(primaryRoute.account.accountId.name).toBe(`[${id}]`);

  expect(afterEnter).toHaveBeenCalled();
  expect(beforeUpdate).not.toHaveBeenCalled();
  expect(afterUpdate).not.toHaveBeenCalled();
});

test('should navigate from `default` to `account` and triggers `$beforeUpdate`', async () => {
  await nap();

  let id = 'def';
  let path = `/account/${encodeURIComponent(id)}`;

  await history.push(path);

  await nap();

  expect(await router.$ref()).toBe(path);
  expect(primaryRoute.account.accountId.account.id).toBe(id);
  expect(primaryRoute.account.accountId.name).toBe(`[${id}]`);

  expect(afterEnter).not.toHaveBeenCalled();
  expect(beforeUpdate).toHaveBeenCalled();
  expect(afterUpdate).toHaveBeenCalled();
});

test('should navigate from `account` to `default`', async () => {
  primaryRoute.default.$push();

  await nap();

  expect(await router.$ref()).toBe('/');
  expect(primaryRoute.account.accountId.account).toBeUndefined();
  expect(primaryRoute.account.accountId.name).toBeUndefined();

  expect(beforeLeave).toHaveBeenCalled();
});
