// storage.js
import admin from "firebase-admin";
import { Readable } from "stream";

let initialized = false;
export function initFirebaseAdmin() {
  if (initialized) return;
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!json) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const creds = JSON.parse(json);
  admin.initializeApp({
    credential: admin.credential.cert(creds),
    storageBucket: `${creds.project_id}.appspot.com`
  });
  initialized = true;
}

export async function uploadFileFromPath(localPath, remotePath) {
  const bucket = admin.storage().bucket();
  await bucket.upload(localPath, { destination: remotePath, gzip: true });
  const [url] = await bucket.file(remotePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 días
  });
  return url;
}
