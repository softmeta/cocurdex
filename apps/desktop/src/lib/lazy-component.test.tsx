import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { lazyComponent } from "./lazy-component";

const LOADING = "loading";
const FAILED = "failed";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function Greeting({ name }: { name: string }) {
  return <p>{`hello ${name}`}</p>;
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ? <p>{FAILED}</p> : this.props.children;
  }
}

describe("lazyComponent", () => {
  it("renders the fallback until the module loads, then the component", async () => {
    const module = deferred<typeof Greeting>();
    const LazyGreeting = lazyComponent(() => module.promise, <p>{LOADING}</p>);

    render(<LazyGreeting name="ada" />);
    expect(screen.getByText(LOADING)).toBeTruthy();

    module.resolve(Greeting);
    expect(await screen.findByText("hello ada")).toBeTruthy();
  });

  it("loads the module once and renders later mounts immediately", async () => {
    let loads = 0;
    const LazyGreeting = lazyComponent(async () => {
      loads += 1;
      return Greeting;
    });

    const first = render(<LazyGreeting name="first" />);
    await screen.findByText("hello first");
    first.unmount();

    render(<LazyGreeting name="second" />);
    expect(screen.getByText("hello second")).toBeTruthy();
    expect(loads).toBe(1);
  });

  it("surfaces a failed load to the nearest error boundary", async () => {
    const module = deferred<typeof Greeting>();
    const LazyGreeting = lazyComponent(() => module.promise);

    render(
      <Boundary>
        <LazyGreeting name="ada" />
      </Boundary>,
    );
    module.reject(new Error("chunk failed"));
    expect(await screen.findByText(FAILED)).toBeTruthy();
  });
});
