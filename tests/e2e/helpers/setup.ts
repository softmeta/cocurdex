import { afterAll } from "vitest";
import { disposeTestDaemons } from "./daemon-process";

afterAll(() => disposeTestDaemons());
