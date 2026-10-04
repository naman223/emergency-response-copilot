import { createConfig } from "./config";
import { createFirebase } from "./infra/firebase";
import { cleanupExpired } from "./demo/cleanup";
const firebase = createFirebase(createConfig());
try {
  const result = await cleanupExpired(firebase.db, firebase.audio, new Date());
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally {
  await firebase.close();
}
