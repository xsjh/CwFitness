import {
  migrateDatabase, node, playwrightCli, run, startDatabase, startServer, stopDatabase, stopServer,
} from './test-env.mjs';

let databaseStarted = false;
let server;
try {
  await startDatabase();
  databaseStarted = true;
  await migrateDatabase();
  server = await startServer();
  await run(node, ['--test', 'tests/plans-api.test.mjs']);
  await run(node, [playwrightCli, 'test']);
} finally {
  if (server) await stopServer(server);
  if (databaseStarted) await stopDatabase();
}
