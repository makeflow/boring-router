import {Location} from 'history';

const FULFILLED_PROMISE = Promise.resolve();

export function then(handler: () => void): void {
  // tslint:disable-next-line:no-floating-promises
  FULFILLED_PROMISE.then(handler);
}

export function isPathPrefix(path: string, prefix: string): boolean {
  return (
    path.startsWith(prefix) &&
    (path.length === prefix.length || path[prefix.length] === '/')
  );
}

export function isLocationEqual(left: Location, right: Location): boolean {
  let keys: (keyof Location)[] = ['pathname', 'search', 'hash'];
  return keys.every(key => left[key] === right[key]);
}

export function isShallowlyEqual(left: any, right: any): boolean {
  if (left === right) {
    return true;
  }

  let keySet = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (let key of keySet) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}
