import type { JestConfigWithTsJest } from "ts-jest";
import defaultConfig from "../../jest.config";

const jestConfig: JestConfigWithTsJest = {
  ...defaultConfig,
  testEnvironment: "jsdom",
};

export default jestConfig;
