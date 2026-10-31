import { disposeTestDaemons } from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll } from "vitest";

afterAll(() => disposeTestDaemons());
