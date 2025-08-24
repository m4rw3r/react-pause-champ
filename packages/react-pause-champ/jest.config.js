import defaultConfig from "../../jest.config.js";

/* global process */

const moduleNameMapper = {};

if (process.env.REACT_VERSION) {
  moduleNameMapper["^react((\\/.*)?)$"] = `react${process.env.REACT_VERSION}$1`;
  moduleNameMapper["^react-dom((\\/.*)?)$"] =
    `react${process.env.REACT_VERSION}-dom$1`;
}

const jestConfig = {
  ...defaultConfig,
  testEnvironment: "jsdom",
  moduleNameMapper,
};

export default jestConfig;
