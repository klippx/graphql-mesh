# @envelop/persisted-operations

## 5.0.4

### Patch Changes

- Updated dependencies []:
  - @envelop/core@3.0.4

## 5.0.3

### Patch Changes

- Updated dependencies [[`6b48ef96`](https://github.com/n1ru4l/envelop/commit/6b48ef962020eb7dfd2918626b8a394bff673e4f)]:
  - @envelop/core@3.0.3

## 5.0.2

### Patch Changes

- Updated dependencies [[`22f5ccfb`](https://github.com/n1ru4l/envelop/commit/22f5ccfbe69eb052cda6c1908425b63e3d906243)]:
  - @envelop/core@3.0.2

## 5.0.0

### Major Changes

- Updated dependencies [[`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f), [`dc1e24b5`](https://github.com/n1ru4l/envelop/commit/dc1e24b5340ed7eba300a702b17f9be5cff65a8f)]:
  - @envelop/core@3.0.0

## 4.6.0

### Minor Changes

- [#1499](https://github.com/n1ru4l/envelop/pull/1499) [`1f7af02b`](https://github.com/n1ru4l/envelop/commit/1f7af02b9f1a16058a6d69fcd48425a93be655c6) Thanks [@viniciuspalma](https://github.com/viniciuspalma)! - Adding tslib to package dependencies

  Projects that currently are using yarn Berry with PnP or any strict dependency
  resolver, that requires that all dependencies are specified on
  package.json otherwise it would endue in an error if not treated correct

  Since https://www.typescriptlang.org/tsconfig#importHelpers is currently
  being used, tslib should be exported as a dependency to external runners
  get the proper import.

  Change on each package:

  ```json
  // package.json
  {
    "dependencies": {
      "tslib": "^2.4.0"
    }
  }
  ```

- Updated dependencies [[`1f7af02b`](https://github.com/n1ru4l/envelop/commit/1f7af02b9f1a16058a6d69fcd48425a93be655c6), [`ae7bc9a3`](https://github.com/n1ru4l/envelop/commit/ae7bc9a36abd595b0a91f7b4e133017d3eb99a4a)]:
  - @envelop/core@2.6.0

## 4.5.0

### Minor Changes

- Updated dependencies [[`5a5f5c04`](https://github.com/n1ru4l/envelop/commit/5a5f5c04177b9e1379fd77db5d6383160879d449), [`d828f129`](https://github.com/n1ru4l/envelop/commit/d828f1291254a0f9dfdc3654611087859e4c9708)]:
  - @envelop/core@2.5.0

## 4.4.2

### Patch Changes

- 071f946: Fix CommonJS TypeScript resolution with `moduleResolution` `node16` or `nodenext`
- Updated dependencies [071f946]
  - @envelop/core@2.4.2

## 4.4.1

### Patch Changes

- Updated dependencies [787d28a2]
  - @envelop/core@2.4.1

## 4.4.0

### Minor Changes

- 8bb2738: Support TypeScript module resolution.
- Updated dependencies [8bb2738]
  - @envelop/core@2.4.0

## 4.3.3

### Patch Changes

- fbf6155: update package.json repository links to point to the new home
- Updated dependencies [fbf6155]
  - @envelop/core@2.3.3

## 4.3.2

### Patch Changes

- Updated dependencies [07d029b]
  - @envelop/core@2.3.2

## 4.3.1

### Patch Changes

- Updated dependencies [d5c2c9a]
  - @envelop/core@2.3.1

## 4.3.0

### Minor Changes

- Updated dependencies [af23408]
  - @envelop/core@2.3.0

## 4.2.0

### Minor Changes

- Updated dependencies [ada7fb0]
- Updated dependencies [d5115b4]
- Updated dependencies [d5115b4]
  - @envelop/core@2.2.0

## 4.1.0

### Minor Changes

- Updated dependencies [78b3db2]
- Updated dependencies [f5eb436]
  - @envelop/core@2.1.0

## 4.0.0

### Patch Changes

- Updated dependencies [4106e08]
- Updated dependencies [aac65ef]
- Updated dependencies [4106e08]
  - @envelop/core@2.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [d9cfb7c]
  - @envelop/core@1.7.0

## 2.2.1

### Patch Changes

- b1a0331: Properly list `@envelop/core` as a `peerDependency` in plugins.

  This resolves issues where the bundled envelop plugins published to npm had logic inlined from the `@envelop/core` package, causing `instanceof` check of `EnvelopError` to fail.

- Updated dependencies [b1a0331]
  - @envelop/core@1.6.1

## 2.2.0

### Minor Changes

- 0759d4a: Add `onMissingMatch` option to allow custom handling of missing operation Ids in store/s
- 090cae4: GraphQL v16 support

## 2.1.0

### Minor Changes

- 04120de: add support for GraphQL.js 16

## 2.0.0

### Major Changes

- f9841ba: BREAKING CHANGE: Renamed `onlyPersistedOperations` to `onlyPersisted`
- f9841ba: BREAKING CHANGE: Remove `writeToContext` - now the operation id is always written to the context
- f9841ba: BREAKING CHANGE: The operation ID written to the context is now a Symbol (instead of a string), use `readOperationId` to get it within your code / other plugins
- f9841ba: BREAKING CHANGE: Removed `canHandle` from interface. Replace it with returning `null` from the `get` function of your Store

### Minor Changes

- f9841ba: Added `extractOperationId` callback for extracting the persisted operation from the incoming http request
- f9841ba: Added support for dynamic store based on incoming req / initial context
- f9841ba: Added InMemoryStore and JsonFileStore

## 1.0.1

### Patch Changes

- 452af8f: Update dependencies of graphql-tools to latest

## 1.0.0

### Major Changes

- 40bc444: v1 major release for envelop packages

## 0.2.0

### Minor Changes

- 83b2b92: Extend plugin errors from GraphQLError.

## 0.1.1

### Patch Changes

- 28ad742: Improve TypeScript types

## 0.1.0

### Minor Changes

- 7b639c0: Save operation id to the context
- eb6f53b: ESM Support for all plugins and envelop core

## 0.0.2

### Patch Changes

- cb4e555: Remove apollo-tracing dependency

## 0.0.1

### Patch Changes

- 9fb5a66: Initial package release