import type { JSX as ReactJSX } from 'react';

/* eslint-disable @typescript-eslint/no-empty-object-type */

declare global {
  namespace JSX {
    interface Element extends ReactJSX.Element {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  }
}

export {};
