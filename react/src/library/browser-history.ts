import {
  AbstractHistory,
  HistoryEntry,
  HistorySnapshot,
  getActiveHistoryEntryIndex,
  isHistoryEntryEqual,
} from 'boring-router';

type BrowserHistoryEntry<TData> = HistoryEntry<number, TData>;

type BrowserHistorySnapshot<TData> = HistorySnapshot<number, TData>;

export interface BrowserHistoryOptions {
  /**
   * URL prefix, ignored if `hash` is enabled.
   */
  prefix?: string;
  /**
   * Use hash (#) for location pathname and search.
   *
   * This is not a compatibility option and does not make it compatible with
   * obsolete browsers.
   */
  hash?: boolean;
}

export class BrowserHistory<TData = any> extends AbstractHistory<
  number,
  TData
> {
  protected snapshot: BrowserHistorySnapshot<TData>;

  private tracked: BrowserHistorySnapshot<TData>;

  private restoring = false;

  private restoringPromise = Promise.resolve();
  private restoringPromiseResolver: (() => void) | undefined;

  private idCount = 0;

  private prefix: string;
  private hash: boolean;

  get activeIndex(): number {
    let {active, entries} = this.snapshot;

    return entries.findIndex(entry => entry.id === active);
  }

  constructor({prefix = '', hash = false}: BrowserHistoryOptions = {}) {
    super();

    this.prefix = prefix;
    this.hash = hash;

    window.addEventListener('popstate', this.onPopState);

    let activeId: number;

    if (history.state && history.state.id) {
      activeId = history.state.id;

      if (activeId > this.idCount) {
        this.idCount = activeId;
      }
    } else {
      activeId = this.getNextId();
      history.replaceState({id: activeId}, '');
    }

    let entries: HistoryEntry<number, TData>[] = [
      {
        id: activeId,
        ref: this.getRefByHRef(this.prefixedRef),
        data: undefined,
      },
    ];

    this.snapshot = this.tracked = {
      entries,
      active: activeId,
    };
  }

  private get hashPrefix(): string {
    return `${location.pathname}${location.search}`;
  }

  private get prefixedRef(): string {
    return `${location.pathname}${location.search}${location.hash}`;
  }

  getHRefByRef(ref: string): string {
    if (this.hash) {
      return `${this.hashPrefix}#${ref}`;
    } else {
      return `${this.prefix}${ref}`;
    }
  }

  getRefByHRef(href: string): string {
    if (this.hash) {
      let index = href.indexOf('#');

      return (index >= 0 && href.slice(index + 1)) || '/';
    } else {
      let prefix = this.prefix;

      return href.startsWith(prefix) ? href.slice(prefix.length) : href;
    }
  }

  async back(): Promise<void> {
    await this.restoringPromise;

    history.back();
  }

  async forward(): Promise<void> {
    await this.restoringPromise;

    history.forward();
  }

  async push(ref: string, data?: TData): Promise<void> {
    await this.restoringPromise;

    let snapshot = this.pushEntry({
      id: this.getNextId(),
      ref,
      data,
    });

    console.debug('push', snapshot);

    this.snapshot = snapshot;

    this.emitChange(snapshot);
  }

  async replace(ref: string, data?: TData): Promise<void> {
    await this.restoringPromise;

    let {active: id} = this.tracked;

    let snapshot = this.replaceEntry({
      id,
      ref,
      data,
    });

    console.debug('replace', snapshot);

    this.snapshot = snapshot;

    this.emitChange(snapshot);
  }

  async restore(snapshot: BrowserHistorySnapshot<TData>): Promise<void> {
    console.debug('restore', snapshot);

    this.snapshot = snapshot;

    if (this.restoring) {
      return;
    }

    console.debug('restore start');

    this.restoring = true;

    let promise = new Promise<void>(resolve => {
      this.restoringPromiseResolver = resolve;
    });

    this.restoringPromise = promise;

    this.stepRestoration();

    await promise;
  }

  async navigate(href: string): Promise<void> {
    let prefix = this.prefix;

    if (/^[\w\d]+:\/\//.test(href) || !href.startsWith(prefix)) {
      location.href = href;
      return;
    }

    let ref = href.slice(prefix.length);

    await this.push(ref);
  }

  private onPopState = async (event: PopStateEvent): Promise<void> => {
    let {entries: trackedEntries} = this.tracked;

    let activeId = event.state.id as number;

    if (activeId > this.idCount) {
      this.idCount = activeId;
    }

    let index = trackedEntries.findIndex(entry => entry.id === activeId);

    let entries = [...trackedEntries];

    if (index < 0) {
      entries.push({
        id: activeId,
        ref: this.getRefByHRef(this.prefixedRef),
        data: undefined,
      });
    }

    let snapshot: BrowserHistorySnapshot<TData> = {
      entries,
      active: activeId,
    };

    this.tracked = snapshot;

    if (this.restoring) {
      this.stepRestoration();
      return;
    }

    this.snapshot = snapshot;

    console.debug('pop', snapshot);

    this.emitChange(snapshot);
  };

  private stepRestoration(): void {
    console.debug('step restoration');
    console.debug('expected', this.snapshot);
    console.debug('tracked', this.tracked);

    this.restoreEntries();
  }

  private restoreEntries(): void {
    let expected = this.snapshot;
    let tracked = this.tracked;

    let {entries: expectedEntries} = expected;
    let {entries: trackedEntries} = tracked;

    let lastExpectedIndex = expectedEntries.length - 1;
    let lastTrackedIndex = trackedEntries.length - 1;

    let trackedActiveIndex = getActiveHistoryEntryIndex(tracked);

    let minLength = Math.min(expectedEntries.length, trackedEntries.length);

    let firstMismatchedIndex = 0;

    for (
      firstMismatchedIndex;
      firstMismatchedIndex < minLength;
      firstMismatchedIndex++
    ) {
      let expectedEntry = expectedEntries[firstMismatchedIndex];
      let trackedEntry = trackedEntries[firstMismatchedIndex];

      if (!isHistoryEntryEqual(expectedEntry, trackedEntry)) {
        break;
      }
    }

    if (
      firstMismatchedIndex > lastExpectedIndex &&
      (lastExpectedIndex === lastTrackedIndex || lastExpectedIndex === 0)
    ) {
      // 1. Exactly identical.
      // 2. Not exactly identical but there's not much that can be done:
      //    ```
      //    expected  a
      //    tracked   a -> b
      //                   ^ mismatch
      //    ```
      //    In this case we cannot remove the extra entries.

      this.restoreActive();
      return;
    }

    if (
      // expected  a -> b -> c
      // tracked   a -> d -> e
      //                ^ mismatch
      //                     ^ active
      trackedActiveIndex > firstMismatchedIndex ||
      // expected  a -> b
      // tracked   a -> b -> c
      //                     ^ mismatch
      //                     ^ active
      trackedActiveIndex > lastExpectedIndex ||
      // expected  a -> b
      // tracked   a -> b -> c
      //                     ^ mismatch
      //                ^ active
      // expected  a -> b
      // tracked   a -> c -> d
      //                ^ mismatch
      //                ^ active
      (trackedActiveIndex === lastExpectedIndex &&
        trackedActiveIndex < lastTrackedIndex)
    ) {
      history.back();
      return;
    }

    if (trackedActiveIndex === firstMismatchedIndex) {
      this.replaceEntry(
        expectedEntries[trackedActiveIndex],
        trackedActiveIndex,
      );
    }

    for (let entry of expectedEntries.slice(trackedActiveIndex + 1)) {
      this.pushEntry(entry);
    }

    this.restoreActive();
  }

  private restoreActive(): void {
    let expectedActiveIndex = getActiveHistoryEntryIndex(this.snapshot);
    let trackedActiveIndex = getActiveHistoryEntryIndex(this.tracked);

    if (trackedActiveIndex < expectedActiveIndex) {
      history.forward();
    } else if (trackedActiveIndex > expectedActiveIndex) {
      history.back();
    } else {
      this.completeRestoration();
    }
  }

  private completeRestoration(): void {
    this.restoring = false;

    if (this.restoringPromiseResolver) {
      this.restoringPromiseResolver();
    }

    this.restoringPromiseResolver = undefined;

    console.debug('restore end');
    console.debug('expected', this.snapshot);
    console.debug('tracked', this.tracked);
  }

  private pushEntry({
    id,
    ref,
    data,
  }: BrowserHistoryEntry<TData>): BrowserHistorySnapshot<TData> {
    let tracked = this.tracked;

    let {entries} = tracked;

    let activeIndex = getActiveHistoryEntryIndex(tracked);

    let snapshot: BrowserHistorySnapshot<TData> = {
      entries: [...entries.slice(0, activeIndex + 1), {id, ref, data}],
      active: id,
    };

    this.tracked = snapshot;

    history.pushState({id}, '', this.getHRefByRef(ref));

    return snapshot;
  }

  private replaceEntry(
    {id, ref, data}: BrowserHistoryEntry<TData>,
    index?: number,
  ): BrowserHistorySnapshot<TData> {
    let {entries} = this.tracked;

    if (index === undefined) {
      index = entries.findIndex(entry => entry.id === id);

      if (index < 0) {
        throw new Error(`Cannot find entry with id ${id} to replace`);
      }
    }

    let snapshot: BrowserHistorySnapshot<TData> = {
      entries: [
        ...entries.slice(0, index),
        {id, ref, data},
        ...entries.slice(index + 1),
      ],
      active: id,
    };

    this.tracked = snapshot;

    history.replaceState({id}, '', this.getHRefByRef(ref));

    return snapshot;
  }

  private getNextId(): number {
    return ++this.idCount;
  }
}
