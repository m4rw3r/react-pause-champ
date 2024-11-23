import type { JestConfigWithTsJest } from "ts-jest";
import defaultConfig from "../../jest.config";

const moduleNameMapper: Record<string, string> = {};

if (process.env.REACT_VERSION) {
  moduleNameMapper["^react((\\/.*)?)$"] = `react${process.env.REACT_VERSION}$1`;
  moduleNameMapper["^react-dom((\\/.*)?)$"] =
    `react${process.env.REACT_VERSION}-dom$1`;
}

const jestConfig: JestConfigWithTsJest = {
  ...defaultConfig,
  testEnvironment: "jsdom",
  moduleNameMapper,
};

export default jestConfig;
