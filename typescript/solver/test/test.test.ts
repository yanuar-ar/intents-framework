import { describe, expect, it } from "@jest/globals";

describe("greet function", () => {
  it("should return a greeting with the given name", () => {
    expect("sarasa").toEqual("Hello, John!");
  });
});
