# Contributing

Thanks for taking the time to improve `expo-smart-scan`.

## Setup

```sh
npm install
cd example && npm install
```

Requirements: Node 22, Xcode 26 (for the iOS 26 Foundation Models path), Android Studio with
JDK 17 for Android.

## Checks

Every pull request runs the same commands CI does:

```sh
npm run format:check   # Prettier
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # library and example app
npm run test:coverage  # Jest with coverage thresholds
```

The parser has a 95% line coverage floor. If you change parsing behaviour, add a test case
that reproduces the receipt you were looking at. Anonymise it first: replace merchant names,
addresses, card digits and anything else that identifies a person or business.

## Running the example

```sh
cd example
npx expo run:ios       # or run:android
```

Foundation Models only works on iOS 26+ with Apple Intelligence enabled. On a simulator, it
depends on the host Mac having Apple Intelligence turned on. The app shows which engine ran
and why it fell back.

## Native code

- Swift sources live in `ios/`, Kotlin in `android/src/main/java/expo/modules/smartscan/`.
- Error codes are part of the public API. A new code must be added to `src/errors.ts` and to
  both platforms' exception files in the same change.
- Keep blocking work off the Swift concurrency pool (see `runBlocking` in `ios/ImageLoader.swift`).

## Commits

Conventional commits (`feat(ios): ...`, `fix(parser): ...`, `test: ...`, `docs: ...`). Keep
them small; one logical change per commit.
