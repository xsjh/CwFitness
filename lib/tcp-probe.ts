import { connect } from "node:net";

/**
 * Resolves whether something is listening on a TCP port.
 *
 * Used to tell "the database is not running" apart from "the request itself failed", which a bare
 * 5xx response cannot distinguish on its own. Never rejects: an unreachable host and a refused
 * connection both mean the same thing to the caller — nothing is there.
 */
export function probeTcpPort(port: number, host = "127.0.0.1", timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    let settled = false;
    const done = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
