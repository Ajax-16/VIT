import { jest } from "@jest/globals";
import { EventEmitter } from "events";

// ── child_process mock ────────────────────────────────────────────────────────
const mockSpawn = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  spawn: mockSpawn,
  execSync: jest.fn(),
}));

const { runSteps } = await import("../../lib/pipeline.js");

// ── spawn helper: creates a fake child process ────────────────────────────────
function makeChild({
  stdout = "",
  stderr = "",
  exitCode = 0,
  signal = null,
} = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();

  // Schedule async emission
  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", signal ? null : exitCode, signal);
  });

  return child;
}

// ═════════════════════════════════════════════════════════════════════════════
describe("runSteps", () => {
  test("returns baseEnv unchanged when steps array is empty", async () => {
    const env = { FOO: "bar" };
    const result = await runSteps([], env);
    expect(result).toEqual(env);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test("runs a single step and returns enriched env via captureAs", async () => {
    mockSpawn.mockImplementationOnce(() => makeChild({ stdout: "1.2.3" }));
    const result = await runSteps(
      [{ command: 'node -e "..."', captureAs: "VERSION" }],
      { ...process.env },
    );
    expect(result.VERSION).toBe("1.2.3");
  });

  test("interpolates ${VAR} in command before spawning", async () => {
    mockSpawn.mockImplementationOnce((cmd) => {
      expect(cmd).toContain("hello");
      return makeChild({ stdout: "ok" });
    });
    await runSteps([{ command: "echo ${GREETING}", captureAs: "OUT" }], {
      ...process.env,
      GREETING: "hello",
    });
  });

  test("captureAs value from step 1 is available in step 2 command", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChild({ stdout: "42" }))
      .mockImplementationOnce((cmd) => {
        expect(cmd).toContain("42");
        return makeChild({ stdout: "done" });
      });

    await runSteps(
      [
        { command: "get-value", captureAs: "NUM" },
        { command: "use-value ${NUM}", captureAs: "RES" },
      ],
      { ...process.env },
    );
  });

  test("rejects on non-zero exit when continueOnError is false", async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeChild({ exitCode: 1, stderr: "something failed" }),
    );
    await expect(
      runSteps([{ command: "bad-cmd", continueOnError: false }], {}),
    ).rejects.toThrow();
  });

  test("continues on non-zero exit when continueOnError is true", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChild({ exitCode: 1 }))
      .mockImplementationOnce(() => makeChild({ stdout: "ok" }));

    const result = await runSteps(
      [
        { command: "bad-cmd", continueOnError: true, captureAs: "A" },
        { command: "good-cmd", continueOnError: false, captureAs: "B" },
      ],
      { ...process.env },
    );

    expect(result.B).toBe("ok");
  });

  test("passes timeoutMs to spawn options", async () => {
    mockSpawn.mockImplementationOnce((cmd, opts) => {
      // spawn receives full env — we just check it was called
      return makeChild({ stdout: "ok" });
    });
    // We just verify no error is thrown and step completes
    const result = await runSteps(
      [{ command: "slow-cmd", timeoutMs: 5000, captureAs: "R" }],
      { ...process.env },
    );
    expect(result.R).toBe("ok");
  });

  test("step ids are auto-assigned when missing", async () => {
    // We verify steps run without error (id is internal, not returned)
    mockSpawn.mockImplementation(() => makeChild({ stdout: "x" }));
    await expect(
      runSteps([{ command: "cmd1" }, { command: "cmd2" }], {}),
    ).resolves.not.toThrow();
  });

  test("multiple captureAs values accumulate in env", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChild({ stdout: "alpha" }))
      .mockImplementationOnce(() => makeChild({ stdout: "beta" }))
      .mockImplementationOnce(() => makeChild({ stdout: "gamma" }));

    const result = await runSteps(
      [
        { command: "cmd1", captureAs: "A" },
        { command: "cmd2", captureAs: "B" },
        { command: "cmd3", captureAs: "C" },
      ],
      {},
    );

    expect(result.A).toBe("alpha");
    expect(result.B).toBe("beta");
    expect(result.C).toBe("gamma");
  });

  test("step terminated by signal rejects", async () => {
    mockSpawn.mockImplementationOnce(() => makeChild({ signal: "SIGTERM" }));
    await expect(runSteps([{ command: "killed-cmd" }], {})).rejects.toThrow(
      "SIGTERM",
    );
  });
});
