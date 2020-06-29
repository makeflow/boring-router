(window.webpackJsonp=window.webpackJsonp||[]).push([[8],{FUTt:function(e,n,t){"use strict";t.r(n),t.d(n,"_frontmatter",(function(){return a})),t.d(n,"default",(function(){return u}));t("5hJT"),t("W1QL"),t("K/PF"),t("t91x"),t("75LO"),t("PJhk"),t("mXGw");var r=t("/FXl"),o=t("TjRS");t("aD51");function c(){return(c=Object.assign||function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r])}return e}).apply(this,arguments)}var a={};void 0!==a&&a&&a===Object(a)&&Object.isExtensible(a)&&!a.hasOwnProperty("__filemeta")&&Object.defineProperty(a,"__filemeta",{configurable:!0,value:{name:"_frontmatter",filename:"doc/references/service.mdx"}});var i={_frontmatter:a},s=o.a;function u(e){var n=e.components,t=function(e,n){if(null==e)return{};var t,r,o={},c=Object.keys(e);for(r=0;r<c.length;r++)t=c[r],n.indexOf(t)>=0||(o[t]=e[t]);return o}(e,["components"]);return Object(r.b)(s,c({},i,t,{components:n,mdxType:"MDXLayout"}),Object(r.b)("h1",{id:"service"},"Service"),Object(r.b)("p",null,"Every ",Object(r.b)("inlineCode",{parentName:"p"},"RouteMatch")," can be backed by a route service in Boring Router, providing additional flexibility with states comparing to lifecycle hooks."),Object(r.b)("p",null,'A route service gets only "activated" when the route matches. And we can provide both pre-instantiated service or service factory:'),Object(r.b)("pre",null,Object(r.b)("code",c({parentName:"pre"},{className:"language-ts"}),"route.account.$service(new AccountRouteService());\n\nroute.settings.$service(match => new SettingsRouteService(match));\n\nroute.workbench.$service(async match => {\n  // asynchronous code...\n  return new WorkbenchRouteService(match);\n});\n")),Object(r.b)("p",null,"Service factory will be called on demand."),Object(r.b)("h2",{id:"lifecycle-hooks"},"Lifecycle Hooks"),Object(r.b)("p",null,"Lifecycle hooks are supported by service as optional methods:"),Object(r.b)("pre",null,Object(r.b)("code",c({parentName:"pre"},{className:"language-ts"}),"type AccountRoute = typeof route.account;\n\nclass AccountRouteService implements IRouteService<AccountRoute> {\n  constructor(private match: AccountRoute) {}\n\n  async beforeEnter(next: AccountRoute['$next']): Promise<void> {}\n\n  async willEnter(next: AccountRoute['$next']): Promise<void> {}\n\n  async afterEnter(): void {}\n\n  async beforeUpdate(next: AccountRoute['$next']): Promise<void> {\n    this.beforeEnter(next);\n  }\n\n  async willUpdate(next: AccountRoute['$next']): Promise<void> {\n    this.willEnter(next);\n  }\n\n  async afterUpdate(): void {\n    this.afterEnter();\n  }\n\n  async beforeLeave(): Promise<void> {}\n\n  async willLeave(): Promise<void> {}\n\n  afterLeave(): void {}\n}\n")),Object(r.b)("blockquote",null,Object(r.b)("p",{parentName:"blockquote"},"For full signatures of lifecycle hook methods, checkout ",Object(r.b)("a",c({parentName:"p"},{href:"/boring-router/references/lifecycle-hooks"}),"Lifecycle Hooks")," and type information.")),Object(r.b)("h2",{id:"managed-extension"},"Managed Extension"),Object(r.b)("p",null,"We can add extension to a route with predefined values or getters (see also ",Object(r.b)("a",c({parentName:"p"},{href:"/boring-router/references/route-schema#extension"}),"Route Schema Extension"),"), and route service provides a way to manage extension."),Object(r.b)("p",null,"When the route is matched, accessing an extension value will first access the correspondent value on the service instance. It the key does not exist on the service instance, it will then fallback to the ",Object(r.b)("inlineCode",{parentName:"p"},"$extension")," object provided by route schema."),Object(r.b)("p",null,"Note only value with keys predefined in ",Object(r.b)("inlineCode",{parentName:"p"},"$extension")," (using ",Object(r.b)("inlineCode",{parentName:"p"},"Object.keys()"),") can be accessed through this mechanism."),Object(r.b)("p",null,"E.g.:"),Object(r.b)("pre",null,Object(r.b)("code",c({parentName:"pre"},{className:"language-ts"}),"const route = router.$route({\n  user: {\n    $children: {\n      userId: {\n        $match: /\\d+/,\n        $extension: {\n          user: undefined! as User,\n        },\n      },\n    },\n  },\n});\n\nroute.user.userId.$service(() => new UserIdRouteService());\n\ntype UserIdRoute = typeof route.user.userId;\n\nclass UserIdRouteService implements IRouteService<UserIdRoute> {\n  @observable\n  user!: User;\n\n  willEnter(next: UserIdRoute['$next']): void {\n    this.user = new User(next.$params.userId);\n  }\n\n  afterLeave(): void {\n    this.user = undefined!;\n  }\n}\n")),Object(r.b)("p",null,"Thus we can easily access the ",Object(r.b)("inlineCode",{parentName:"p"},"user")," elsewhere. For example within route content:"),Object(r.b)("pre",null,Object(r.b)("code",c({parentName:"pre"},{className:"language-tsx"}),"<Route match={route.user.userId}>\n  {match => <div>Hello, user {match.user.displayName}.</div>}\n</Route>\n")))}void 0!==u&&u&&u===Object(u)&&Object.isExtensible(u)&&!u.hasOwnProperty("__filemeta")&&Object.defineProperty(u,"__filemeta",{configurable:!0,value:{name:"MDXContent",filename:"doc/references/service.mdx"}}),u.isMDXComponent=!0}}]);
//# sourceMappingURL=component---doc-references-service-mdx-577cdd9276cec7809552.js.map