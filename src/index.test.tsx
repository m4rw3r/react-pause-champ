import { Storage, Provider, useWeird } from "./index";
import { createElement } from "react";
import {
  render,
  //fireEvent,
  //waitForElement
} from "@testing-library/react";

describe("useWeird()", () => {
  it("throws when no <Provider/> wraps it", () => {
    // Silence errors since we are throwing on purpose
    const originalError = console.error;
    console.error = jest.fn();

    function C(): null {
      useWeird("test", 123);

      return null;
    }

    expect(() => render(<C />)).toThrow(
      new Error("useWeird() must be inside a <Weird.Provider/>")
    );

    console.error = originalError;
  });

  it("returns the init argument as the first element", () => {
    const obj = {};
    const storage = new Storage();

    function C(): JSX.Element {
      const [n] = useWeird("test", obj);

      expect(n).toStrictEqual(obj);

      return <p>String(n)</p>;
    }

    expect(
      render(
        <Provider storage={storage}>
          <C />
        </Provider>
      )
    ).toEqual("");
  });
});
