import {IRouteService, RouteMatch, Router} from 'boring-router';
import {BrowserHistory, Link, Route} from 'boring-router-react';
import {observable} from 'mobx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import ReactDOM from 'react-dom';

const history = new BrowserHistory();

class Account {
  constructor(readonly id: string) {}

  get avatarURL(): string {
    return `https://gravatar.com/avatar/${this.id}`;
  }
}

const router = new Router(history);

const route = router.$route({
  default: {
    $match: '',
  },
  account: {
    $children: {
      id: {
        $match: RouteMatch.segment,
        $extension: {
          tick: 0,
          account: undefined! as Account,
        },
      },
    },
  },
  profile: true,
  notFound: {
    $match: RouteMatch.rest,
  },
});

type AccountIdRouteMatch = typeof route.account.id;

class AccountIdRouteService implements IRouteService<AccountIdRouteMatch> {
  private timer!: number;

  @observable
  tick!: number;

  constructor(private match: AccountIdRouteMatch) {}

  get account(): Account {
    let {id} = this.match.$params;
    return new Account(id);
  }

  willEnter(): void {
    this.tick = 0;

    this.timer = setInterval(() => {
      this.tick++;
    }, 1000) as any;
  }

  willLeave(): void {
    clearInterval(this.timer);
  }
}

route.account.id.$service(match => new AccountIdRouteService(match));

const App = observer(() => (
  <>
    <h1>Boring Router</h1>
    <Route match={route.default}>
      <p>Home page</p>
      <Link
        to={route.account.id}
        params={{id: '4a35d104523ef520dd5d9f60c7e1eeb1'}}
      >
        Account
      </Link>
    </Route>
    <Route match={route.account.id}>
      {({account, tick}) => (
        <>
          <p>Account page</p>
          <Link to={route.default}>Home</Link>
          <hr />
          <p>Account {account.id}</p>
          <img src={account.avatarURL} alt="avatar" />
          <p>Tick {tick}</p>
        </>
      )}
    </Route>
  </>
));

ReactDOM.render(<App />, document.getElementById('app'));
